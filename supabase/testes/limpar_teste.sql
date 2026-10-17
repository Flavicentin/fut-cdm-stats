-- Apaga a temporada de teste '0000-teste' e os 16 jogadores 'teste-01'..'teste-16'.
-- Apagar a temporada leva junto (em cascata) estatísticas, meses, honrarias, revisões e partidas dela.
-- Não toca na 2026.
delete from public.temporadas where id = '0000-teste';
delete from public.jogadores where id like 'teste-%'
  and not exists (select 1 from public.estatisticas_temporada et where et.jogador_id = jogadores.id)
  and not exists (select 1 from public.estatisticas_mes em where em.jogador_id = jogadores.id);

-- Conferência: tudo tem que dar 0
select (select count(*) from public.temporadas where id = '0000-teste') as temporada,
       (select count(*) from public.jogadores where id like 'teste-%') as jogadores,
       (select count(*) from public.partidas where temporada_id = '0000-teste') as partidas;
