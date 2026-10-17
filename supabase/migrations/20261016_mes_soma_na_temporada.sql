-- 1) Ao aprovar uma alteração de mês, a diferença de gols, assistências e honrarias do mês
--    é somada nos totais da temporada (só para quem é do elenco). Jogos continuam na aba Temporada.
-- 2) Quem envia a alteração não pode preencher autor/revisão na mão.

drop policy "admin envia alteracao" on public.alteracoes;
create policy "admin envia alteracao" on public.alteracoes for insert to authenticated
  with check (
    (select public.is_admin())
    and criado_por = (select auth.uid())
    and status = 'pendente'
    and autor = (select auth.jwt() ->> 'email')
    and revisado_por is null and revisor is null and revisado_em is null and motivo is null
  );

create or replace function public.aprovar_alteracao(p_id bigint)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  a public.alteracoes;
  v_antes jsonb;
  v_hantes jsonb;
  v_dh jsonb;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem aprovar' using errcode = '42501';
  end if;
  select * into a from public.alteracoes where id = p_id for update;
  if not found or a.status <> 'pendente' then
    raise exception 'Essa alteração não está mais pendente' using errcode = '22023';
  end if;
  if a.criado_por = (select auth.uid()) then
    raise exception 'Quem enviou a alteração não pode aprovar; peça para outro adm' using errcode = '42501';
  end if;

  insert into public.jogadores (id, nome)
  select n.id, n.nome from jsonb_to_recordset(coalesce(a.payload -> 'novos', '[]')) as n(id text, nome text)
  on conflict (id) do nothing;

  if a.aba = 'temporada' then
    insert into public.estatisticas_temporada (temporada_id, jogador_id, partidas, gols, assist)
    select a.temporada_id, l.jogador_id, l.partidas, l.gols, l.assist
    from jsonb_to_recordset(a.payload -> 'linhas') as l(jogador_id text, partidas int, gols int, assist int)
    on conflict (temporada_id, jogador_id) do update
      set partidas = excluded.partidas, gols = excluded.gols, assist = excluded.assist;

  elsif a.aba = 'mes' then
    -- foto do mês antes de substituir
    select coalesce(jsonb_object_agg(jogador_id, jsonb_build_object('g', gols, 'a', assist)), '{}')
      into v_antes from public.estatisticas_mes where temporada_id = a.temporada_id and mes = a.mes;
    select coalesce(jsonb_agg(jsonb_build_object('j', jogador_id, 't', tipo_id, 'q', quantidade)), '[]')
      into v_hantes from public.honrarias_mes where temporada_id = a.temporada_id and mes = a.mes;

    perform public.salvar_mes(a.temporada_id, a.mes, a.payload -> 'linhas');

    -- gols e assistências: soma a diferença nos totais da temporada
    with depois as (
      select jogador_id, gols, assist from public.estatisticas_mes where temporada_id = a.temporada_id and mes = a.mes
    ), antes as (
      select key as jogador_id, (value ->> 'g')::int as gols, (value ->> 'a')::int as assist from jsonb_each(v_antes)
    ), d as (
      select coalesce(x.jogador_id, y.jogador_id) as jogador_id,
             coalesce(x.gols, 0) - coalesce(y.gols, 0) as dg,
             coalesce(x.assist, 0) - coalesce(y.assist, 0) as da
      from depois x full join antes y on y.jogador_id = x.jogador_id
    )
    update public.estatisticas_temporada et
       set gols = greatest(0, et.gols + d.dg), assist = greatest(0, et.assist + d.da)
      from d
     where et.temporada_id = a.temporada_id and et.jogador_id = d.jogador_id and (d.dg <> 0 or d.da <> 0);

    -- honrarias: diferença por jogador e tipo (só elenco)
    with depois as (
      select jogador_id, tipo_id, quantidade from public.honrarias_mes where temporada_id = a.temporada_id and mes = a.mes
    ), antes as (
      select h ->> 'j' as jogador_id, h ->> 't' as tipo_id, (h ->> 'q')::int as quantidade from jsonb_array_elements(v_hantes) h
    ), d as (
      select coalesce(x.jogador_id, y.jogador_id) as jogador_id, coalesce(x.tipo_id, y.tipo_id) as tipo_id,
             coalesce(x.quantidade, 0) - coalesce(y.quantidade, 0) as dq
      from depois x full join antes y on y.jogador_id = x.jogador_id and y.tipo_id = x.tipo_id
    )
    select coalesce(jsonb_agg(jsonb_build_object('j', d.jogador_id, 't', d.tipo_id, 'd', d.dq)), '[]') into v_dh
      from d join public.estatisticas_temporada et on et.temporada_id = a.temporada_id and et.jogador_id = d.jogador_id
     where d.dq <> 0;

    delete from public.honrarias_temporada ht
     using jsonb_to_recordset(v_dh) as z(j text, t text, d int)
     where ht.temporada_id = a.temporada_id and ht.jogador_id = z.j and ht.tipo_id = z.t and ht.quantidade + z.d <= 0;
    update public.honrarias_temporada ht set quantidade = ht.quantidade + z.d
      from jsonb_to_recordset(v_dh) as z(j text, t text, d int)
     where ht.temporada_id = a.temporada_id and ht.jogador_id = z.j and ht.tipo_id = z.t;
    insert into public.honrarias_temporada (temporada_id, jogador_id, tipo_id, quantidade)
    select a.temporada_id, z.j, z.t, z.d from jsonb_to_recordset(v_dh) as z(j text, t text, d int) where z.d > 0
    on conflict (temporada_id, jogador_id, tipo_id) do nothing;

  elsif a.aba = 'honrarias' then
    perform public.salvar_honrarias_temporada(a.temporada_id, a.payload -> 'linhas');
  elsif a.aba = 'over' then
    insert into public.notas_over (temporada_id, jogador_id, pac, fin, pas, dri, def, fis, ovr)
    select a.temporada_id, l.jogador_id, l.pac, l.fin, l.pas, l.dri, l.def, l.fis, l.ovr
    from jsonb_to_recordset(coalesce(a.payload -> 'com', '[]'))
      as l(jogador_id text, pac smallint, fin smallint, pas smallint, dri smallint, def smallint, fis smallint, ovr smallint)
    on conflict (temporada_id, jogador_id) do update
      set pac = excluded.pac, fin = excluded.fin, pas = excluded.pas, dri = excluded.dri,
          def = excluded.def, fis = excluded.fis, ovr = excluded.ovr;
    delete from public.notas_over
     where temporada_id = a.temporada_id
       and jogador_id in (select jsonb_array_elements_text(coalesce(a.payload -> 'sem', '[]')));
  end if;

  update public.alteracoes
     set status = 'aprovada', revisado_por = (select auth.uid()), revisor = (select auth.jwt() ->> 'email'), revisado_em = now()
   where id = p_id;
end;
$$;
