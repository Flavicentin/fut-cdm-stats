-- Apaga a temporada de teste '0000-teste', os 16 jogadores 'teste-01'..'teste-16' e o jogador 'teste'
-- (que ficou no elenco de 2026 com 0 jogos depois do teste do ×). Não toca em mais nada da 2026.
delete from public.temporadas where id = '0000-teste';
delete from public.estatisticas_temporada
 where temporada_id = '2026' and jogador_id = 'teste' and partidas = 0 and gols = 0 and assist = 0;
delete from public.jogadores
 where (id like 'teste-%' or id = 'teste')
   and not exists (select 1 from public.estatisticas_temporada et where et.jogador_id = jogadores.id)
   and not exists (select 1 from public.estatisticas_mes em where em.jogador_id = jogadores.id)
   and not exists (select 1 from public.partida_jogadores pj where pj.jogador_id = jogadores.id);

-- Conferência: as 3 primeiras têm que dar 0
select (select count(*) from public.temporadas where id = '0000-teste') as temporada_teste,
       (select count(*) from public.jogadores where id like 'teste-%' or id = 'teste') as jogadores_teste,
       (select count(*) from public.estatisticas_temporada where jogador_id = 'teste') as teste_no_elenco,
       (select count(*) from public.estatisticas_temporada where temporada_id = '2026') as elenco_2026;
