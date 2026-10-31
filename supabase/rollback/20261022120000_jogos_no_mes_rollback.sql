-- ROLLBACK da migration 20261022120000_jogos_no_mes.sql: volta o banco para como estava antes.
-- Perde só o que a migration criou: os jogos por mês.
-- Gols, assistências, honrarias, temporada e partidas continuam intactos.

-- 1) Views sem a coluna de jogos (é preciso apagar e recriar, na ordem de dependência)
drop view public.v_temporada_json;
drop view public.v_meses;
drop view public.v_estatisticas_mes;

create view public.v_estatisticas_mes with (security_invoker = true) as
select em.temporada_id as temporada, to_char(em.mes, 'YYYY-MM') as mes, em.mes as mes_inicio,
       j.id, j.nome, em.gols, em.assist, em.gols + em.assist as ga,
       (et.jogador_id is null) as convidado,
       coalesce(h.honras, '{}'::jsonb) as honras
from public.estatisticas_mes em
join public.jogadores j on j.id = em.jogador_id
left join public.estatisticas_temporada et on et.temporada_id = em.temporada_id and et.jogador_id = em.jogador_id
left join lateral (
  select jsonb_object_agg(hm.tipo_id, hm.quantidade) as honras
  from public.honrarias_mes hm
  where hm.temporada_id = em.temporada_id and hm.mes = em.mes and hm.jogador_id = em.jogador_id
) h on true;

create view public.v_meses with (security_invoker = true) as
select m.temporada_id as temporada, to_char(m.mes, 'YYYY-MM') as mes, m.mes as mes_inicio, m.encerrado,
       coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                  'id', e.id, 'nome', e.nome, 'gols', e.gols, 'assist', e.assist,
                  'convidado', case when e.convidado then true end,
                  'honras', nullif(e.honras, '{}'::jsonb)))
                order by e.ga desc, e.gols desc, lower(e.nome)) filter (where e.id is not null), '[]'::jsonb) as jogadores
from public.meses m
left join public.v_estatisticas_mes e on e.temporada = m.temporada_id and e.mes_inicio = m.mes
group by m.temporada_id, m.mes, m.encerrado;

create or replace view public.v_temporada_json with (security_invoker = true) as
select t.id as temporada,
       jsonb_build_object(
         'temporada', t.id,
         'atualizado_em', to_char(t.atualizado_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'),
         'min_jogos', t.min_jogos_media,
         'jogadores', coalesce((
            select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                     'id', v.id, 'nome', v.nome, 'partidas', v.partidas, 'gols', v.gols, 'assist', v.assist,
                     'honras', nullif(v.honras, '{}'::jsonb), 'over', v."over", 'foto', v.foto))
                   order by lower(v.nome))
            from public.v_jogadores_temporada v where v.temporada = t.id), '[]'::jsonb),
         'meses', coalesce((
            select jsonb_agg(jsonb_build_object('mes', vm.mes, 'jogadores', vm.jogadores) order by vm.mes_inicio)
            from public.v_meses vm where vm.temporada = t.id), '[]'::jsonb)
       ) as dados
from public.temporadas t;

grant select on public.v_estatisticas_mes, public.v_meses, public.v_temporada_json to anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on
  public.v_estatisticas_mes, public.v_meses, public.v_temporada_json from anon, authenticated;

-- 2) Funções como eram antes
create or replace function public.salvar_mes(p_temporada text, p_mes date, p_linhas jsonb)
returns void language plpgsql security invoker set search_path = ''
as $$
declare v_mes date := date_trunc('month', p_mes)::date;
begin
  insert into public.meses (temporada_id, mes) values (p_temporada, v_mes) on conflict (temporada_id, mes) do nothing;
  delete from public.estatisticas_mes where temporada_id = p_temporada and mes = v_mes;
  insert into public.estatisticas_mes (temporada_id, mes, jogador_id, gols, assist)
  select p_temporada, v_mes, l.jogador_id, coalesce(l.gols, 0), coalesce(l.assist, 0)
  from jsonb_to_recordset(p_linhas) as l(jogador_id text, gols int, assist int);
  insert into public.honrarias_mes (temporada_id, mes, jogador_id, tipo_id, quantidade)
  select p_temporada, v_mes, l.jogador_id, h.key, h.value::int
  from jsonb_to_recordset(p_linhas) as l(jogador_id text, honras jsonb)
  cross join lateral jsonb_each_text(coalesce(l.honras, '{}'::jsonb)) as h(key, value)
  where h.value::int > 0;
end;
$$;

create or replace function public.encerrar_partida(p_id bigint)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  p public.partidas;
  v_mes date;
  v_resumo jsonb;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem encerrar partidas' using errcode = '42501';
  end if;
  select * into p from public.partidas where id = p_id for update;
  if not found or p.status <> 'aberta' then
    raise exception 'Essa partida não está mais aberta' using errcode = '22023';
  end if;
  if not exists (select 1 from public.partida_jogadores where partida_id = p_id) then
    raise exception 'A partida não tem jogadores' using errcode = '22023';
  end if;
  v_mes := date_trunc('month', p.data)::date;

  -- números por jogador
  create temporary table pg_temp._tot on commit drop as
  select pj.jogador_id, pj.time,
         count(e.id) filter (where e.tipo = 'gol')::int as gols,
         count(e.id) filter (where e.tipo = 'assist')::int as assist
    from public.partida_jogadores pj
    left join public.partida_eventos e on e.partida_id = pj.partida_id and e.jogador_id = pj.jogador_id
   where pj.partida_id = p_id
   group by pj.jogador_id, pj.time;

  -- mês da partida
  insert into public.meses (temporada_id, mes) values (p.temporada_id, v_mes) on conflict (temporada_id, mes) do nothing;
  insert into public.estatisticas_mes (temporada_id, mes, jogador_id, gols, assist)
  select p.temporada_id, v_mes, t.jogador_id, t.gols, t.assist from pg_temp._tot t where t.gols > 0 or t.assist > 0
  on conflict (temporada_id, mes, jogador_id) do update
    set gols = public.estatisticas_mes.gols + excluded.gols,
        assist = public.estatisticas_mes.assist + excluded.assist;

  -- totais da temporada: só elenco; todo mundo que jogou ganha +1 jogo
  update public.estatisticas_temporada et
     set gols = et.gols + t.gols, assist = et.assist + t.assist, partidas = et.partidas + 1
    from pg_temp._tot t
   where et.temporada_id = p.temporada_id and et.jogador_id = t.jogador_id;

  -- Honrarias do fut (mesmas regras das descrições do site). Empates levam todos.
  --   MVP: maior G+A (desempate: mais gols) · TOTW: 4 maiores G+A · Top 3 G / Top 3 A
  --   Artilheiro / Garçom / Gartilheiro (os dois) · Masterclass: G+A > 10 · Duplo-duplo: G > 10 e A > 10
  create temporary table pg_temp._premios on commit drop as
  with t as (
    select jogador_id, gols, assist, gols + assist as ga from pg_temp._tot
  ), c as (
    select (select max(gols) from t) as mg,
           (select max(assist) from t) as ma,
           (select max(ga) from t) as mga,
           (select gols from t order by gols desc offset 2 limit 1) as g3,
           (select assist from t order by assist desc offset 2 limit 1) as a3,
           (select ga from t order by ga desc offset 3 limit 1) as ga4
  ), mv as (
    select max(t.gols) as gols_mvp from t, c where t.ga = c.mga
  )
  select t.jogador_id, x.tipo
    from t cross join c cross join mv
    cross join lateral (values
      ('mvp_s',   c.mga > 0 and t.ga = c.mga and t.gols = mv.gols_mvp),
      ('totw',    t.ga > 0 and t.ga >= coalesce(c.ga4, 0)),
      ('art_s',   c.mg > 0 and t.gols = c.mg),
      ('gar_s',   c.ma > 0 and t.assist = c.ma),
      ('gart_s',  c.mg > 0 and t.gols = c.mg and c.ma > 0 and t.assist = c.ma),
      ('mc_s',    t.ga > 10),
      ('dd_s',    t.gols > 10 and t.assist > 10),
      ('top3g_s', t.gols > 0 and t.gols >= coalesce(c.g3, 0)),
      ('top3a_s', t.assist > 0 and t.assist >= coalesce(c.a3, 0))
    ) as x(tipo, ganhou)
   where x.ganhou;

  -- soma as honrarias no mês (todos têm linha no mês, porque têm G ou A) e na temporada (elenco)
  insert into public.honrarias_mes (temporada_id, mes, jogador_id, tipo_id, quantidade)
  select p.temporada_id, v_mes, pr.jogador_id, pr.tipo, 1 from pg_temp._premios pr
  on conflict (temporada_id, mes, jogador_id, tipo_id) do update set quantidade = public.honrarias_mes.quantidade + 1;
  insert into public.honrarias_temporada (temporada_id, jogador_id, tipo_id, quantidade)
  select p.temporada_id, pr.jogador_id, pr.tipo, 1
    from pg_temp._premios pr
    join public.estatisticas_temporada et on et.temporada_id = p.temporada_id and et.jogador_id = pr.jogador_id
  on conflict (temporada_id, jogador_id, tipo_id) do update set quantidade = public.honrarias_temporada.quantidade + 1;

  select jsonb_build_object(
           'data', to_char(p.data, 'DD/MM/YYYY'),
           'times', (
             select jsonb_agg(jsonb_build_object(
                      'nome', p.times_nomes[n],
                      'gols', coalesce((select sum(t.gols) from pg_temp._tot t where t.time = n), 0),
                      'jogadores', coalesce((
                        select jsonb_agg(jsonb_build_object('id', t.jogador_id, 'nome', j.nome, 'gols', t.gols, 'assist', t.assist)
                                         order by t.gols desc, t.assist desc, j.nome)
                          from pg_temp._tot t join public.jogadores j on j.id = t.jogador_id where t.time = n), '[]'::jsonb))
                    order by n)
               from generate_series(1, 4) as n),
           'premios', coalesce((
             select jsonb_object_agg(z.tipo, z.quem) from (
               select pr.tipo, jsonb_agg(jsonb_build_object('id', t.jogador_id, 'nome', j.nome, 'gols', t.gols, 'assist', t.assist)
                                         order by t.gols + t.assist desc, t.gols desc, j.nome) as quem
                 from pg_temp._premios pr
                 join pg_temp._tot t on t.jogador_id = pr.jogador_id
                 join public.jogadores j on j.id = pr.jogador_id
                group by pr.tipo) z), '{}'::jsonb))
    into v_resumo;

  update public.partidas
     set status = 'encerrada', encerrada_por = (select auth.uid()), encerrada_em = now(), resumo = v_resumo
   where id = p_id;
  return v_resumo;
end;
$$;


-- 3) Linhas do mês que só existiam por causa dos jogos (0 gols, 0 assistências e sem honrarias)
delete from public.estatisticas_mes em
 where em.gols = 0 and em.assist = 0
   and not exists (select 1 from public.honrarias_mes hm
                    where hm.temporada_id = em.temporada_id and hm.mes = em.mes and hm.jogador_id = em.jogador_id);

-- 4) Coluna de jogos do mês
alter table public.estatisticas_mes drop column partidas;
