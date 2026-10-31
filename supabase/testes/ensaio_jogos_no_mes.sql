-- ENSAIO da migration 20261022120000_jogos_no_mes.sql e do rollback dela — NÃO GRAVA NADA.
-- 1) aplica a migration no banco real, 2) guarda um resumo, 3) roda o rollback, 4) confere que voltou tudo
-- (inclusive as fotos no site) e 5) lança um erro de propósito com o resumo: o erro desfaz a transação inteira.
-- Resultado esperado: um erro começando com "ENSAIO OK (nada foi gravado)".

-- ===== 1) MIGRATION =====
-- Jogos por mês: base das médias "por jogo" do mês atual no site.
-- 1) estatisticas_mes ganha 'partidas'. Encerrar partida soma +1 no mês para todos que jogaram (mesmo sem G/A).
-- 2) A aba Mês do admin grava os jogos do mês. Ao aprovar, a diferença de jogos NÃO soma na temporada
--    (os jogos da temporada continuam vindo da aba Temporada e de encerrar_partida); aprovar_alteracao não muda.

alter table public.estatisticas_mes
  add column partidas integer not null default 0 check (partidas >= 0);

-- p_linhas = [{"jogador_id":"roger","partidas":4,"gols":9,"assist":14,"honras":{"potm":1}}, ...]
create or replace function public.salvar_mes(p_temporada text, p_mes date, p_linhas jsonb)
returns void language plpgsql security invoker set search_path = ''
as $$
declare v_mes date := date_trunc('month', p_mes)::date;
begin
  insert into public.meses (temporada_id, mes) values (p_temporada, v_mes) on conflict (temporada_id, mes) do nothing;
  delete from public.estatisticas_mes where temporada_id = p_temporada and mes = v_mes;
  insert into public.estatisticas_mes (temporada_id, mes, jogador_id, partidas, gols, assist)
  select p_temporada, v_mes, l.jogador_id, coalesce(l.partidas, 0), coalesce(l.gols, 0), coalesce(l.assist, 0)
  from jsonb_to_recordset(p_linhas) as l(jogador_id text, partidas int, gols int, assist int);
  insert into public.honrarias_mes (temporada_id, mes, jogador_id, tipo_id, quantidade)
  select p_temporada, v_mes, l.jogador_id, h.key, h.value::int
  from jsonb_to_recordset(p_linhas) as l(jogador_id text, honras jsonb)
  cross join lateral jsonb_each_text(coalesce(l.honras, '{}'::jsonb)) as h(key, value)
  where h.value::int > 0;
end;
$$;

-- Views: coluna nova no fim (create or replace só aceita colunas novas depois das existentes)
create or replace view public.v_estatisticas_mes with (security_invoker = true) as
select em.temporada_id as temporada, to_char(em.mes, 'YYYY-MM') as mes, em.mes as mes_inicio,
       j.id, j.nome, em.gols, em.assist, em.gols + em.assist as ga,
       (et.jogador_id is null) as convidado,
       coalesce(h.honras, '{}'::jsonb) as honras,
       em.partidas
from public.estatisticas_mes em
join public.jogadores j on j.id = em.jogador_id
left join public.estatisticas_temporada et on et.temporada_id = em.temporada_id and et.jogador_id = em.jogador_id
left join lateral (
  select jsonb_object_agg(hm.tipo_id, hm.quantidade) as honras
  from public.honrarias_mes hm
  where hm.temporada_id = em.temporada_id and hm.mes = em.mes and hm.jogador_id = em.jogador_id
) h on true;

create or replace view public.v_meses with (security_invoker = true) as
select m.temporada_id as temporada, to_char(m.mes, 'YYYY-MM') as mes, m.mes as mes_inicio, m.encerrado,
       coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                  'id', e.id, 'nome', e.nome, 'gols', e.gols, 'assist', e.assist,
                  'partidas', nullif(e.partidas, 0),
                  'convidado', case when e.convidado then true end,
                  'honras', nullif(e.honras, '{}'::jsonb)))
                order by e.ga desc, e.gols desc, lower(e.nome)) filter (where e.id is not null), '[]'::jsonb) as jogadores
from public.meses m
left join public.v_estatisticas_mes e on e.temporada = m.temporada_id and e.mes_inicio = m.mes
group by m.temporada_id, m.mes, m.encerrado;

revoke insert, update, delete, truncate, references, trigger on public.v_estatisticas_mes, public.v_meses from anon, authenticated;

-- Encerrar: igual à versão de 20261017_partidas.sql, mas o mês recebe todos que jogaram com +1 jogo.
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

  -- mês da partida: todos que jogaram ganham +1 jogo no mês (mesmo sem gol ou assistência)
  insert into public.meses (temporada_id, mes) values (p.temporada_id, v_mes) on conflict (temporada_id, mes) do nothing;
  insert into public.estatisticas_mes (temporada_id, mes, jogador_id, partidas, gols, assist)
  select p.temporada_id, v_mes, t.jogador_id, 1, t.gols, t.assist from pg_temp._tot t
  on conflict (temporada_id, mes, jogador_id) do update
    set partidas = public.estatisticas_mes.partidas + 1,
        gols = public.estatisticas_mes.gols + excluded.gols,
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

  -- soma as honrarias no mês (todos que jogaram têm linha no mês) e na temporada (elenco)
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


-- Jogos dos futs já encerrados no app (17/10 em diante)
insert into public.estatisticas_mes (temporada_id, mes, jogador_id, partidas)
select p.temporada_id, date_trunc('month', p.data)::date, pj.jogador_id, count(*)::int
  from public.partidas p
  join public.partida_jogadores pj on pj.partida_id = p.id
 where p.status = 'encerrada'
 group by 1, 2, 3
on conflict (temporada_id, mes, jogador_id) do update set partidas = excluded.partidas;

-- Futs de outubro anteriores ao app (03/10 e 10/10), pelas listas de presença do grupo.
-- Gols e assistências deles já estão no mês; aqui entra só +1 jogo por fut para quem estava na lista.
-- Nomes das listas: Fla = flavio, JP = noleto, Leozittus = leo, Hideki = caio-hideki, PCD = caio,
-- Thiago Sasquas = thiago, Du = carlos (convidado).
with presenca(jogador_id, fut) as (values
  ('bona', '03/10'), ('renan', '03/10'), ('pedro-marques', '03/10'), ('flavio', '03/10'), ('bruninho', '03/10'),
  ('leo', '03/10'), ('noleto', '03/10'), ('queiroz', '03/10'), ('felps', '03/10'), ('caio-hideki', '03/10'),
  ('roger', '03/10'), ('renato', '03/10'), ('carlos', '03/10'), ('giovani', '03/10'), ('rubens', '03/10'),
  ('rafa', '03/10'), ('fernas', '03/10'), ('juan', '03/10'),
  ('felps', '10/10'), ('renan', '10/10'), ('pietro', '10/10'), ('roger', '10/10'), ('yuri', '10/10'),
  ('bruninho', '10/10'), ('renato', '10/10'), ('leo', '10/10'), ('rubens', '10/10'), ('bona', '10/10'),
  ('kauan', '10/10'), ('nickolas', '10/10'), ('lucas-marson', '10/10'), ('giovani', '10/10'), ('thiago', '10/10'),
  ('rafa', '10/10'), ('queiroz', '10/10'), ('caio-hideki', '10/10'), ('martos', '10/10'), ('caio', '10/10')
)
insert into public.estatisticas_mes (temporada_id, mes, jogador_id, partidas)
select '2026', date '2026-10-01', jogador_id, count(*)::int from presenca group by jogador_id
on conflict (temporada_id, mes, jogador_id) do update
  set partidas = public.estatisticas_mes.partidas + excluded.partidas;


-- ===== 2) RESUMO do que a migration faz =====
create temporary table _ensaio on commit drop as
select jsonb_build_object(
  'jogadores_com_jogos_em_outubro', (select count(*) from public.estatisticas_mes where temporada_id = '2026' and mes = '2026-10-01' and partidas > 0),
  'jogos_outubro', (select jsonb_object_agg(jogador_id, partidas order by jogador_id) from public.estatisticas_mes
                     where temporada_id = '2026' and mes = '2026-10-01' and partidas > 0),
  'site_recebe_partidas', (select (dados -> 'meses' -> -1 -> 'jogadores' -> 0) ? 'partidas' from public.v_temporada_json where temporada = '2026')
) as resumo;

-- ===== 3) ROLLBACK =====
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


-- ===== 4) e 5) CONFERE e desfaz tudo =====
do $$
declare v jsonb;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'estatisticas_mes' and column_name = 'partidas') then
    raise exception 'ENSAIO FALHOU: o rollback não tirou a coluna partidas';
  end if;
  if (select (dados -> 'meses' -> -1 -> 'jogadores' -> 0) ? 'partidas' from public.v_temporada_json where temporada = '2026') then
    raise exception 'ENSAIO FALHOU: o site ainda receberia partidas depois do rollback';
  end if;
  if not exists (select 1 from public.v_temporada_json t, jsonb_array_elements(t.dados -> 'jogadores') j
                  where t.temporada = '2026' and j ? 'foto') then
    raise exception 'ENSAIO FALHOU: o rollback tirou as fotos do site';
  end if;
  select resumo into v from _ensaio;
  raise exception 'ENSAIO OK (nada foi gravado). Migration: % | Rollback: voltou ao original, fotos mantidas', v;
end;
$$;
