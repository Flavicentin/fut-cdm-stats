-- Fut CDM — schema inicial (estatísticas, honrarias, notas Over, perfis/admin)
-- Leitura pública (anon); escrita só para administradores (is_admin()).
-- Login: Supabase Auth com link mágico por e-mail.

-- 1. Perfis, convites de admin e is_admin()
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  nome        text,
  avatar_url  text,
  papel       text not null default 'leitor' check (papel in ('leitor', 'admin')),
  criado_em   timestamptz not null default now()
);
comment on table public.profiles is 'Perfil de cada usuário logado. papel = admin libera escrita nas tabelas de estatística.';
create index profiles_email_idx on public.profiles (email);

create table public.convites_admin (
  email      text primary key check (email = lower(btrim(email)) and email like '%@%'),
  criado_em  timestamptz not null default now()
);
comment on table public.convites_admin is 'Lista de e-mails autorizados a serem administradores.';

-- SECURITY DEFINER para ler profiles sem cair na RLS (evita recursão nas políticas de profiles).
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.papel = 'admin');
$$;

-- Cria o profile automaticamente no cadastro; vira admin se o e-mail estiver em convites_admin.
create or replace function public.criar_profile()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, nome, avatar_url, papel)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    case when exists (select 1 from public.convites_admin c where c.email = lower(new.email)) then 'admin' else 'leitor' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger ao_criar_usuario after insert on auth.users
  for each row execute function public.criar_profile();

-- Ao convidar um e-mail que já tem conta, promove na hora.
create or replace function public.aplicar_convite_admin()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.profiles set papel = 'admin' where email = new.email;
  return new;
end;
$$;

create trigger ao_convidar_admin after insert on public.convites_admin
  for each row execute function public.aplicar_convite_admin();

-- Troca de papel feita por um admin (pela tela de admin).
create or replace function public.definir_papel(p_usuario uuid, p_papel text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem alterar papéis' using errcode = '42501';
  end if;
  if p_papel not in ('leitor', 'admin') then
    raise exception 'Papel inválido: %', p_papel using errcode = '22023';
  end if;
  if p_usuario = (select auth.uid()) and p_papel <> 'admin' then
    raise exception 'Você não pode remover o seu próprio acesso de admin' using errcode = '42501';
  end if;
  update public.profiles set papel = p_papel where id = p_usuario;
end;
$$;

-- 2. Auditoria
create or replace function public.tocar_registro()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end;
$$;

-- Atualiza a data "Atualizado em" da temporada sempre que um dado dela muda.
create or replace function public.marcar_temporada_atualizada()
returns trigger language plpgsql set search_path = ''
as $$
begin
  update public.temporadas set atualizado_em = now()
   where id = case when tg_op = 'DELETE' then old.temporada_id else new.temporada_id end;
  return null;
end;
$$;

-- 3. Temporadas, jogadores, apelidos, meses
create table public.temporadas (
  id               text primary key check (id ~ '^[0-9]{4}[a-z0-9-]*$'),
  nome             text,
  min_jogos_media  smallint not null default 10 check (min_jogos_media > 0),
  atualizado_em    timestamptz not null default now(),
  criado_em        timestamptz not null default now()
);

-- id = slug usado nas URLs (#jogador/<id>).
create table public.jogadores (
  id              text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nome            text not null check (btrim(nome) <> ''),
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  atualizado_por  uuid default auth.uid()
);
create unique index jogadores_nome_unico on public.jogadores (lower(nome));

-- Outras grafias do mesmo jogador (substitui dados/apelidos.json).
create table public.apelidos (
  slug        text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  apelido     text not null,
  jogador_id  text not null references public.jogadores (id) on update cascade on delete cascade
);
create index apelidos_jogador_idx on public.apelidos (jogador_id);

-- Meses de uma temporada (sempre dia 1).
create table public.meses (
  temporada_id  text not null references public.temporadas (id) on update cascade on delete cascade,
  mes           date not null check (extract(day from mes) = 1),
  encerrado     boolean not null default false,
  primary key (temporada_id, mes)
);

-- 4. Estatísticas
-- Totais OFICIAIS da temporada (aba "Médias"). Ter linha aqui = fazer parte do elenco.
-- Não é a soma dos meses: a planilha diverge em alguns casos e o oficial é este.
create table public.estatisticas_temporada (
  temporada_id    text not null references public.temporadas (id) on update cascade on delete cascade,
  jogador_id      text not null references public.jogadores (id) on update cascade on delete restrict,
  partidas        integer not null default 0 check (partidas >= 0),
  gols            integer not null default 0 check (gols >= 0),
  assist          integer not null default 0 check (assist >= 0),
  atualizado_em   timestamptz not null default now(),
  atualizado_por  uuid default auth.uid(),
  primary key (temporada_id, jogador_id)
);
create index estatisticas_temporada_jogador_idx on public.estatisticas_temporada (jogador_id);

-- Gols e assistências por mês (abas MARÇO..Outubro).
create table public.estatisticas_mes (
  temporada_id    text not null,
  mes             date not null,
  jogador_id      text not null references public.jogadores (id) on update cascade on delete restrict,
  gols            integer not null default 0 check (gols >= 0),
  assist          integer not null default 0 check (assist >= 0),
  atualizado_em   timestamptz not null default now(),
  atualizado_por  uuid default auth.uid(),
  primary key (temporada_id, mes, jogador_id),
  foreign key (temporada_id, mes) references public.meses (temporada_id, mes) on update cascade on delete cascade
);
create index estatisticas_mes_jogador_idx on public.estatisticas_mes (jogador_id);

-- 5. Honrarias (grupo 's' = por fut, 'm' = no mês, igual ao app.js)
create table public.tipos_honraria (
  id         text primary key check (id ~ '^[a-z0-9_]+$'),
  grupo      char(1) not null check (grupo in ('s', 'm')),
  nome       text not null,
  icone      text not null,
  descricao  text not null,
  ordem      smallint not null
);

insert into public.tipos_honraria (id, grupo, nome, icone, descricao, ordem) values
  ('mvp_s',   's', 'MVP',         '🥇', 'Melhor jogador do fut', 1),
  ('totw',    's', 'TOTW',        '✅', 'Seleção da semana (Team of the Week)', 2),
  ('art_s',   's', 'Artilheiro',  '🥅', 'Quem fez mais gols no fut', 3),
  ('gar_s',   's', 'Garçom',      '🎁', 'Quem deu mais assistências no fut', 4),
  ('gart_s',  's', 'Gartilheiro', '🐲', 'Artilheiro e garçom ao mesmo tempo', 5),
  ('mc_s',    's', 'Masterclass', '⭐', 'Mais de 10 participações (G+A)', 6),
  ('dd_s',    's', 'Duplo-duplo', '✌️', 'Mais de 10 gols e mais de 10 assistências', 7),
  ('top3g_s', 's', 'Top 3 G',     '⚽', 'Entre os 3 que mais fizeram gols', 8),
  ('top3a_s', 's', 'Top 3 A',     '👟', 'Entre os 3 que mais deram assistências', 9),
  ('potm',    'm', 'POTM',        '🏆', 'Jogador do mês (Player of the Month)', 10),
  ('mvp_m',   'm', 'MVP',         '🥇', 'Melhor jogador do mês', 11),
  ('art_m',   'm', 'Artilheiro',  '🥅', 'Quem fez mais gols no mês', 12),
  ('gar_m',   'm', 'Garçom',      '🎁', 'Quem deu mais assistências no mês', 13),
  ('gart_m',  'm', 'Gartilheiro', '🐲', 'Artilheiro e garçom do mês', 14),
  ('mc_m',    'm', 'Masterclass', '⭐', 'Mais de 10 participações no mês', 15),
  ('dd_m',    'm', 'Duplo-duplo', '✌️', '10+ gols e 10+ assistências no mês', 16),
  ('top3g_m', 'm', 'Top 3 G',     '⚽', 'Entre os 3 que mais fizeram gols no mês', 17),
  ('top3a_m', 'm', 'Top 3 A',     '👟', 'Entre os 3 que mais deram assistências no mês', 18);

-- Contagem OFICIAL acumulada na temporada (aba "Honrarias").
create table public.honrarias_temporada (
  temporada_id    text not null,
  jogador_id      text not null,
  tipo_id         text not null references public.tipos_honraria (id) on update cascade on delete restrict,
  quantidade      integer not null check (quantidade > 0),
  atualizado_em   timestamptz not null default now(),
  atualizado_por  uuid default auth.uid(),
  primary key (temporada_id, jogador_id, tipo_id),
  foreign key (temporada_id, jogador_id) references public.estatisticas_temporada (temporada_id, jogador_id) on update cascade on delete cascade
);
create index honrarias_temporada_tipo_idx on public.honrarias_temporada (tipo_id);

-- Honrarias ganhas dentro de um mês (emojis das abas mensais).
create table public.honrarias_mes (
  temporada_id    text not null,
  mes             date not null,
  jogador_id      text not null,
  tipo_id         text not null references public.tipos_honraria (id) on update cascade on delete restrict,
  quantidade      integer not null check (quantidade > 0),
  atualizado_em   timestamptz not null default now(),
  atualizado_por  uuid default auth.uid(),
  primary key (temporada_id, mes, jogador_id, tipo_id),
  foreign key (temporada_id, mes, jogador_id) references public.estatisticas_mes (temporada_id, mes, jogador_id) on update cascade on delete cascade
);
create index honrarias_mes_tipo_idx on public.honrarias_mes (tipo_id);

-- 6. Notas dos adms (aba Over)
create table public.notas_over (
  temporada_id    text not null,
  jogador_id      text not null,
  pac smallint check (pac between 1 and 99),
  fin smallint check (fin between 1 and 99),
  pas smallint check (pas between 1 and 99),
  dri smallint check (dri between 1 and 99),
  def smallint check (def between 1 and 99),
  fis smallint check (fis between 1 and 99),
  ovr smallint check (ovr between 1 and 99),
  atualizado_em   timestamptz not null default now(),
  atualizado_por  uuid default auth.uid(),
  primary key (temporada_id, jogador_id),
  foreign key (temporada_id, jogador_id) references public.estatisticas_temporada (temporada_id, jogador_id) on update cascade on delete cascade
);

-- 7. Triggers
create trigger tocar before update on public.jogadores for each row execute function public.tocar_registro();
create trigger tocar before insert or update on public.estatisticas_temporada for each row execute function public.tocar_registro();
create trigger tocar before insert or update on public.estatisticas_mes for each row execute function public.tocar_registro();
create trigger tocar before insert or update on public.honrarias_temporada for each row execute function public.tocar_registro();
create trigger tocar before insert or update on public.honrarias_mes for each row execute function public.tocar_registro();
create trigger tocar before insert or update on public.notas_over for each row execute function public.tocar_registro();

create trigger marcar_temporada after insert or update or delete on public.meses for each row execute function public.marcar_temporada_atualizada();
create trigger marcar_temporada after insert or update or delete on public.estatisticas_temporada for each row execute function public.marcar_temporada_atualizada();
create trigger marcar_temporada after insert or update or delete on public.estatisticas_mes for each row execute function public.marcar_temporada_atualizada();
create trigger marcar_temporada after insert or update or delete on public.honrarias_temporada for each row execute function public.marcar_temporada_atualizada();
create trigger marcar_temporada after insert or update or delete on public.honrarias_mes for each row execute function public.marcar_temporada_atualizada();
create trigger marcar_temporada after insert or update or delete on public.notas_over for each row execute function public.marcar_temporada_atualizada();

-- 8. RLS: leitura pública, escrita só admin
do $$
declare t text;
begin
  foreach t in array array['temporadas','jogadores','apelidos','meses','estatisticas_temporada',
                           'estatisticas_mes','tipos_honraria','honrarias_temporada','honrarias_mes','notas_over'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "leitura publica" on public.%I for select to anon, authenticated using (true)', t);
    execute format('create policy "admin insere" on public.%I for insert to authenticated with check ((select public.is_admin()))', t);
    execute format('create policy "admin altera" on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
    execute format('create policy "admin apaga" on public.%I for delete to authenticated using ((select public.is_admin()))', t);
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from anon', t);
    execute format('revoke truncate, references, trigger on public.%I from authenticated', t);
  end loop;
end;
$$;

-- profiles: cada um vê/edita o próprio; admin vê todos. papel só muda via definir_papel().
alter table public.profiles enable row level security;
create policy "ve o proprio perfil ou admin ve todos" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or (select public.is_admin()));
create policy "edita o proprio perfil" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke all on public.profiles from anon;
revoke insert, update, delete, truncate, references, trigger on public.profiles from authenticated;
grant update (nome, avatar_url) on public.profiles to authenticated;

alter table public.convites_admin enable row level security;
create policy "admin le convites" on public.convites_admin for select to authenticated using ((select public.is_admin()));
create policy "admin cria convites" on public.convites_admin for insert to authenticated with check ((select public.is_admin()));
create policy "admin apaga convites" on public.convites_admin for delete to authenticated using ((select public.is_admin()));
revoke all on public.convites_admin from anon;
revoke update, truncate, references, trigger on public.convites_admin from authenticated;

-- 9. Views no formato do front (security_invoker = respeita a RLS de quem consulta)
create view public.v_temporadas with (security_invoker = true) as
select t.id as temporada, t.nome, t.min_jogos_media,
       to_char(t.atualizado_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as atualizado_em
from public.temporadas t;

create view public.v_jogadores_temporada with (security_invoker = true) as
select et.temporada_id as temporada, j.id, j.nome, et.partidas, et.gols, et.assist,
       et.gols + et.assist as ga,
       round(et.gols::numeric / nullif(et.partidas, 0), 2) as gpj,
       round(et.assist::numeric / nullif(et.partidas, 0), 2) as apj,
       round((et.gols + et.assist)::numeric / nullif(et.partidas, 0), 2) as gapj,
       et.partidas >= t.min_jogos_media as regular,
       coalesce(h.honras, '{}'::jsonb) as honras,
       nullif(jsonb_strip_nulls(jsonb_build_object('pac', o.pac, 'fin', o.fin, 'pas', o.pas, 'dri', o.dri,
              'def', o.def, 'fis', o.fis, 'ovr', o.ovr)), '{}'::jsonb) as "over"
from public.estatisticas_temporada et
join public.jogadores j on j.id = et.jogador_id
join public.temporadas t on t.id = et.temporada_id
left join public.notas_over o on o.temporada_id = et.temporada_id and o.jogador_id = et.jogador_id
left join lateral (
  select jsonb_object_agg(ht.tipo_id, ht.quantidade) as honras
  from public.honrarias_temporada ht
  where ht.temporada_id = et.temporada_id and ht.jogador_id = et.jogador_id
) h on true;

-- Rankings de médias com a regra de jogos mínimos da temporada.
create view public.v_medias with (security_invoker = true) as
select v.temporada, v.id, v.nome, v.partidas, v.gols, v.assist, v.ga, v.gpj, v.apj, v.gapj,
       dense_rank() over (partition by v.temporada order by round(v.gols::numeric / v.partidas, 1) desc) as pos_gpj,
       dense_rank() over (partition by v.temporada order by round(v.assist::numeric / v.partidas, 1) desc) as pos_apj,
       dense_rank() over (partition by v.temporada order by round((v.gols + v.assist)::numeric / v.partidas, 1) desc) as pos_gapj
from public.v_jogadores_temporada v
where v.regular;

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

-- Documento completo da temporada, idêntico ao antigo site/data/<temporada>.json.
create view public.v_temporada_json with (security_invoker = true) as
select t.id as temporada,
       jsonb_build_object(
         'temporada', t.id,
         'atualizado_em', to_char(t.atualizado_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'),
         'min_jogos', t.min_jogos_media,
         'jogadores', coalesce((
            select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                     'id', v.id, 'nome', v.nome, 'partidas', v.partidas, 'gols', v.gols, 'assist', v.assist,
                     'honras', nullif(v.honras, '{}'::jsonb), 'over', v."over"))
                   order by lower(v.nome))
            from public.v_jogadores_temporada v where v.temporada = t.id), '[]'::jsonb),
         'meses', coalesce((
            select jsonb_agg(jsonb_build_object('mes', vm.mes, 'jogadores', vm.jogadores) order by vm.mes_inicio)
            from public.v_meses vm where vm.temporada = t.id), '[]'::jsonb)
       ) as dados
from public.temporadas t;

-- Conferência temporada × soma dos meses (os "AVISOS" do importar_planilha.py).
create view public.v_conferencia with (security_invoker = true) as
select et.temporada_id as temporada, j.id, j.nome, et.gols, et.assist,
       coalesce(s.gols, 0) as gols_meses, coalesce(s.assist, 0) as assist_meses,
       coalesce(s.gols, 0) > et.gols or coalesce(s.assist, 0) > et.assist as meses_maior_que_temporada,
       coalesce(s.gols, 0) <> et.gols or coalesce(s.assist, 0) <> et.assist as diverge
from public.estatisticas_temporada et
join public.jogadores j on j.id = et.jogador_id
left join lateral (
  select sum(em.gols) as gols, sum(em.assist) as assist
  from public.estatisticas_mes em
  where em.temporada_id = et.temporada_id and em.jogador_id = et.jogador_id
) s on true
where et.partidas > 0;

grant select on public.v_temporadas, public.v_jogadores_temporada, public.v_medias,
                public.v_estatisticas_mes, public.v_meses, public.v_temporada_json, public.v_conferencia
  to anon, authenticated;

-- 10. RPCs de escrita em lote (security invoker: a RLS decide; não-admin recebe 42501)
-- p_linhas = [{"jogador_id":"roger","gols":9,"assist":14,"honras":{"potm":1}}, ...]
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

-- p_linhas = [{"jogador_id":"roger","honras":{"totw":19}}, ...]
create or replace function public.salvar_honrarias_temporada(p_temporada text, p_linhas jsonb)
returns void language plpgsql security invoker set search_path = ''
as $$
begin
  delete from public.honrarias_temporada where temporada_id = p_temporada;
  insert into public.honrarias_temporada (temporada_id, jogador_id, tipo_id, quantidade)
  select p_temporada, l.jogador_id, h.key, h.value::int
  from jsonb_to_recordset(p_linhas) as l(jogador_id text, honras jsonb)
  cross join lateral jsonb_each_text(coalesce(l.honras, '{}'::jsonb)) as h(key, value)
  where h.value::int > 0;
end;
$$;

-- 11. Permissões de execução
revoke execute on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated;
revoke execute on function public.definir_papel(uuid, text) from public, anon;
grant  execute on function public.definir_papel(uuid, text) to authenticated;
revoke execute on function public.salvar_mes(text, date, jsonb) from public, anon;
grant  execute on function public.salvar_mes(text, date, jsonb) to authenticated;
revoke execute on function public.salvar_honrarias_temporada(text, jsonb) from public, anon;
grant  execute on function public.salvar_honrarias_temporada(text, jsonb) to authenticated;
revoke execute on function public.criar_profile() from public, anon, authenticated;
revoke execute on function public.aplicar_convite_admin() from public, anon, authenticated;
revoke execute on function public.tocar_registro() from public, anon, authenticated;
revoke execute on function public.marcar_temporada_atualizada() from public, anon, authenticated;

-- Primeiro admin
insert into public.convites_admin (email) values ('jpnoleto1@gmail.com');
