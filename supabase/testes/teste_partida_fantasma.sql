-- Teste da aba Partidas com adms, jogadores e temporada FANTASMAS (nenhum dado real é tocado).
-- Este script GRAVA os fantasmas para você conferir no site público:
--   https://fut-cdm.vercel.app/?temporada=0000-teste
-- Depois rode limpar_fantasmas.sql para apagar tudo.
-- Esperado: "bloqueado"/"bloqueada" nos 4 testes de segurança; Fantasma 1 com MVP, TOTW, artilheiro,
-- garçom, gartilheiro e masterclass; Fantasma 1 na temporada = 6 jogos 18 G 18 A; Fantasma 5 (convidado) só no mês.
create temporary table if not exists _resultado (r jsonb);
do $teste$
declare
  r jsonb := '{}';
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_p bigint;
  v_alt bigint;
  v_ev bigint;
  v_res jsonb;
  i int;
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_a, 'authenticated', 'authenticated', 'fantasma.a@teste.invalid', '{}', now(), now()),
         ('00000000-0000-0000-0000-000000000000', v_b, 'authenticated', 'authenticated', 'fantasma.b@teste.invalid', '{}', now(), now());
  update public.profiles set papel = 'admin' where id in (v_a, v_b);

  insert into public.temporadas (id, nome) values ('0000-teste', 'Temporada fantasma');
  insert into public.jogadores (id, nome) select 'fantasma-' || n, 'Fantasma ' || n from generate_series(1, 6) n;
  insert into public.estatisticas_temporada (temporada_id, jogador_id, partidas, gols, assist)
  select '0000-teste', 'fantasma-' || n, 5, 10, 10 from generate_series(1, 4) n;

  insert into public.alteracoes (temporada_id, aba, payload, resumo, criado_por, autor, criado_em)
  values ('0000-teste', 'temporada', '{"linhas":[],"novos":[]}', '{}', v_a, 'fantasma.a@teste.invalid', now() - interval '1 hour')
  returning id into v_alt;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_a, 'email', 'fantasma.a@teste.invalid', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into public.partidas (temporada_id, data, times_nomes) values ('0000-teste', '2026-10-16', array['Time 1','Time 2','Time 3','Time 4']) returning id into v_p;
  insert into public.partida_jogadores (partida_id, jogador_id, time) values
    (v_p, 'fantasma-1', 1), (v_p, 'fantasma-2', 1), (v_p, 'fantasma-3', 2), (v_p, 'fantasma-4', 3), (v_p, 'fantasma-5', 3), (v_p, 'fantasma-6', 4);

  begin
    insert into public.partida_jogadores (partida_id, jogador_id, time) values (v_p, 'fantasma-1', 2);
    r := r || '{"jogador_em_dois_times":"PASSOU (ruim)"}';
  exception when others then r := r || '{"jogador_em_dois_times":"bloqueado"}';
  end;

  for i in 1..8 loop
    insert into public.partida_eventos (partida_id, jogador_id, tipo) values (v_p, 'fantasma-1', 'gol'), (v_p, 'fantasma-1', 'assist');
  end loop;
  for i in 1..7 loop
    insert into public.partida_eventos (partida_id, jogador_id, tipo) values (v_p, 'fantasma-3', 'gol'), (v_p, 'fantasma-2', 'assist');
  end loop;
  insert into public.partida_eventos (partida_id, jogador_id, tipo) values
    (v_p, 'fantasma-4', 'gol'), (v_p, 'fantasma-4', 'gol'), (v_p, 'fantasma-4', 'assist'), (v_p, 'fantasma-5', 'gol');
  insert into public.partida_eventos (partida_id, jogador_id, tipo) values (v_p, 'fantasma-1', 'gol') returning id into v_ev;
  delete from public.partida_eventos where id = v_ev;

  begin
    update public.partidas set status = 'encerrada' where id = v_p;
    r := r || '{"encerrar_pela_api":"PASSOU (ruim)"}';
  exception when others then r := r || jsonb_build_object('encerrar_pela_api', 'bloqueado: ' || sqlerrm);
  end;

  v_res := public.encerrar_partida(v_p);

  begin
    insert into public.partida_eventos (partida_id, jogador_id, tipo) values (v_p, 'fantasma-1', 'gol');
    r := r || '{"lance_depois_de_encerrar":"PASSOU (ruim)"}';
  exception when others then r := r || '{"lance_depois_de_encerrar":"bloqueado"}';
  end;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_b, 'email', 'fantasma.b@teste.invalid', 'role', 'authenticated')::text, true);
  begin
    perform public.aprovar_alteracao(v_alt);
    r := r || '{"revisao_antiga":"PASSOU (ruim)"}';
  exception when others then r := r || jsonb_build_object('revisao_antiga', 'bloqueada: ' || sqlerrm);
  end;

  execute 'reset role';
  r := r || jsonb_build_object(
    'placar', (select jsonb_agg(t ->> 'nome' || ' ' || (t ->> 'gols')) from jsonb_array_elements(v_res -> 'times') t),
    'premios', (select jsonb_object_agg(k, (select jsonb_agg(x ->> 'nome') from jsonb_array_elements(v) x)) from jsonb_each(v_res -> 'premios') e(k, v)),
    'temporada', (select jsonb_object_agg(jogador_id, format('%s jogos %s G %s A', partidas, gols, assist)) from public.estatisticas_temporada where temporada_id = '0000-teste'),
    'mes_out', (select jsonb_object_agg(jogador_id, format('%s G %s A', gols, assist)) from public.estatisticas_mes where temporada_id = '0000-teste' and mes = '2026-10-01'),
    'f5_convidado_na_temporada', (select count(*) from public.estatisticas_temporada where temporada_id = '0000-teste' and jogador_id = 'fantasma-5'),
    'honras_temporada_f1', (select jsonb_object_agg(tipo_id, quantidade) from public.honrarias_temporada where temporada_id = '0000-teste' and jogador_id = 'fantasma-1'),
    'honras_mes_f5', (select jsonb_object_agg(tipo_id, quantidade) from public.honrarias_mes where temporada_id = '0000-teste' and jogador_id = 'fantasma-5'),
    'status', (select status from public.partidas where id = v_p));
  insert into _resultado values (r);
end $teste$;

select r as resultado from _resultado;
