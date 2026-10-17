-- Partidas: o fut do dia com 4 times. Os adms anotam gols e assistências ao vivo;
-- ao encerrar, os números somam no mês da partida e nos totais da temporada (+1 jogo para o elenco),
-- e as honrarias do fut (MVP, TOTW, artilheiro, garçom...) entram no mês e na temporada.

create table public.partidas (
  id             bigint generated always as identity primary key,
  temporada_id   text not null references public.temporadas (id) on update cascade on delete cascade,
  data           date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  times_nomes    text[] not null default array['Time 1', 'Time 2', 'Time 3', 'Time 4']
                 check (array_length(times_nomes, 1) = 4),
  status         text not null default 'aberta' check (status in ('aberta', 'encerrada', 'cancelada')),
  criado_por     uuid default auth.uid() references auth.users (id) on delete set null,
  autor          text default (auth.jwt() ->> 'email'),
  criado_em      timestamptz not null default now(),
  encerrada_por  uuid references auth.users (id) on delete set null,
  encerrada_em   timestamptz,
  resumo         jsonb
);
comment on table public.partidas is 'Futs registrados ao vivo pelos adms (4 times).';
create index partidas_status_idx on public.partidas (status, data desc);

-- Quem jogou em qual time (1 a 4). Um jogador por partida.
create table public.partida_jogadores (
  partida_id  bigint not null references public.partidas (id) on delete cascade,
  jogador_id  text not null references public.jogadores (id) on update cascade on delete restrict,
  time        smallint not null check (time between 1 and 4),
  primary key (partida_id, jogador_id)
);

-- Cada gol ou assistência anotado (dá para desfazer enquanto a partida está aberta).
create table public.partida_eventos (
  id          bigint generated always as identity primary key,
  partida_id  bigint not null,
  jogador_id  text not null,
  tipo        text not null check (tipo in ('gol', 'assist')),
  criado_por  uuid default auth.uid() references auth.users (id) on delete set null,
  criado_em   timestamptz not null default now(),
  foreign key (partida_id, jogador_id) references public.partida_jogadores (partida_id, jogador_id) on update cascade on delete cascade
);
create index partida_eventos_partida_idx on public.partida_eventos (partida_id, criado_em);

-- Partida ainda aberta? (SECURITY DEFINER para usar nas políticas sem depender da RLS de partidas)
create or replace function public.partida_aberta(p_id bigint)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.partidas where id = p_id and status = 'aberta');
$$;
revoke execute on function public.partida_aberta(bigint) from public, anon;
grant execute on function public.partida_aberta(bigint) to authenticated;

alter table public.partidas enable row level security;
alter table public.partida_jogadores enable row level security;
alter table public.partida_eventos enable row level security;

create policy "admin le partidas" on public.partidas for select to authenticated using ((select public.is_admin()));
create policy "admin cria partida" on public.partidas for insert to authenticated
  with check ((select public.is_admin()) and status = 'aberta' and criado_por = (select auth.uid())
              and autor = (select auth.jwt() ->> 'email') and encerrada_por is null and encerrada_em is null and resumo is null);
-- só nomes/data enquanto aberta; encerrar/cancelar é pelas funções
create policy "admin edita partida aberta" on public.partidas for update to authenticated
  using ((select public.is_admin()) and status = 'aberta')
  with check ((select public.is_admin()) and status = 'aberta');

create policy "admin le times" on public.partida_jogadores for select to authenticated using ((select public.is_admin()));
create policy "admin monta times" on public.partida_jogadores for insert to authenticated
  with check ((select public.is_admin()) and public.partida_aberta(partida_id));
create policy "admin troca time" on public.partida_jogadores for update to authenticated
  using ((select public.is_admin()) and public.partida_aberta(partida_id))
  with check ((select public.is_admin()) and public.partida_aberta(partida_id));
create policy "admin tira jogador" on public.partida_jogadores for delete to authenticated
  using ((select public.is_admin()) and public.partida_aberta(partida_id));

create policy "admin le lances" on public.partida_eventos for select to authenticated using ((select public.is_admin()));
create policy "admin anota lance" on public.partida_eventos for insert to authenticated
  with check ((select public.is_admin()) and public.partida_aberta(partida_id) and criado_por = (select auth.uid()));
create policy "admin desfaz lance" on public.partida_eventos for delete to authenticated
  using ((select public.is_admin()) and public.partida_aberta(partida_id));

revoke all on public.partidas, public.partida_jogadores, public.partida_eventos from anon;
revoke truncate, references, trigger on public.partidas, public.partida_jogadores, public.partida_eventos from authenticated;
revoke delete on public.partidas from authenticated;
revoke update on public.partida_eventos from authenticated;
-- pela API só dá para mudar data e nomes dos times; status/encerramento só pelas funções
revoke update on public.partidas from authenticated;
grant update (data, times_nomes) on public.partidas to authenticated;

-- Encerra: soma no mês da partida e na temporada, guarda o resumo para o relatório.
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

create or replace function public.cancelar_partida(p_id bigint)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem cancelar partidas' using errcode = '42501';
  end if;
  update public.partidas set status = 'cancelada', encerrada_por = (select auth.uid()), encerrada_em = now()
   where id = p_id and status = 'aberta';
  if not found then
    raise exception 'Essa partida não está mais aberta' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.encerrar_partida(bigint) from public, anon;
grant execute on function public.encerrar_partida(bigint) to authenticated;
revoke execute on function public.cancelar_partida(bigint) from public, anon;
grant execute on function public.cancelar_partida(bigint) to authenticated;

-- Uma revisão de Mês/Temporada enviada antes de uma partida ser encerrada sobrescreveria os números
-- da partida (ela grava valores absolutos). Bloqueia a aprovação nesse caso; a transação inteira volta.
create or replace function public.bloquear_revisao_desatualizada()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.status = 'aprovada' and old.status = 'pendente' and new.aba in ('mes', 'temporada') and exists (
    select 1 from public.partidas pa
     where pa.status = 'encerrada' and pa.temporada_id = new.temporada_id and pa.encerrada_em > old.criado_em
       and (new.aba = 'temporada' or date_trunc('month', pa.data)::date = new.mes)
  ) then
    raise exception 'Uma partida foi encerrada depois que esta alteração foi enviada; cancele e reenvie com os números atuais'
      using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke execute on function public.bloquear_revisao_desatualizada() from public, anon, authenticated;

create trigger bloquear_revisao_desatualizada before update of status on public.alteracoes
  for each row execute function public.bloquear_revisao_desatualizada();
