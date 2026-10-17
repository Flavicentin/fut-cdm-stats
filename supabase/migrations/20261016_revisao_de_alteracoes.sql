-- Revisão de alterações: um adm envia a mudança nas estatísticas, outro adm aprova (e ela é aplicada) ou recusa.
create table public.alteracoes (
  id            bigint generated always as identity primary key,
  temporada_id  text not null references public.temporadas (id) on update cascade on delete cascade,
  aba           text not null check (aba in ('temporada', 'mes', 'honrarias', 'over')),
  mes           date check (mes is null or extract(day from mes) = 1),
  payload       jsonb not null,             -- o que será gravado ao aprovar
  resumo        jsonb not null,             -- diferenças por jogador, para revisar e gerar o relatório
  status        text not null default 'pendente' check (status in ('pendente', 'aprovada', 'recusada', 'cancelada')),
  criado_por    uuid default auth.uid() references auth.users (id) on delete set null,
  autor         text default (auth.jwt() ->> 'email'),
  criado_em     timestamptz not null default now(),
  revisado_por  uuid references auth.users (id) on delete set null,
  revisor       text,
  revisado_em   timestamptz,
  motivo        text,
  check ((aba = 'mes') = (mes is not null))
);
comment on table public.alteracoes is 'Mudanças nas estatísticas aguardando (ou já com) revisão de outro adm.';
create index alteracoes_status_idx on public.alteracoes (status, criado_em desc);
-- Uma revisão pendente por aba/mês da temporada, para uma não sobrescrever a outra
create unique index alteracoes_uma_pendente on public.alteracoes (temporada_id, aba, coalesce(mes, '0001-01-01'::date))
  where status = 'pendente';

alter table public.alteracoes enable row level security;
create policy "admin le alteracoes" on public.alteracoes for select to authenticated using ((select public.is_admin()));
create policy "admin envia alteracao" on public.alteracoes for insert to authenticated
  with check ((select public.is_admin()) and criado_por = (select auth.uid()) and status = 'pendente');
revoke all on public.alteracoes from anon;
revoke update, delete, truncate, references, trigger on public.alteracoes from authenticated;

-- Aprova e aplica. Só outro adm (não o autor). SECURITY DEFINER com checagens explícitas,
-- porque a tabela não aceita UPDATE direto pela API.
create or replace function public.aprovar_alteracao(p_id bigint)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  a public.alteracoes;
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

  -- jogadores novos citados na alteração
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
    perform public.salvar_mes(a.temporada_id, a.mes, a.payload -> 'linhas');
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

-- Recusa (outro adm) ou cancela (o próprio autor).
create or replace function public.recusar_alteracao(p_id bigint, p_motivo text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  a public.alteracoes;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem recusar' using errcode = '42501';
  end if;
  select * into a from public.alteracoes where id = p_id for update;
  if not found or a.status <> 'pendente' then
    raise exception 'Essa alteração não está mais pendente' using errcode = '22023';
  end if;
  update public.alteracoes
     set status = case when a.criado_por = (select auth.uid()) then 'cancelada' else 'recusada' end,
         revisado_por = (select auth.uid()), revisor = (select auth.jwt() ->> 'email'), revisado_em = now(),
         motivo = nullif(btrim(p_motivo), '')
   where id = p_id;
end;
$$;

revoke execute on function public.aprovar_alteracao(bigint) from public, anon;
grant execute on function public.aprovar_alteracao(bigint) to authenticated;
revoke execute on function public.recusar_alteracao(bigint, text) from public, anon;
grant execute on function public.recusar_alteracao(bigint, text) to authenticated;
