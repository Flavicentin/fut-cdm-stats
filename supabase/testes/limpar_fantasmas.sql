-- Apaga tudo o que teste_partida_fantasma.sql criou. Só mexe no que é fantasma:
-- temporada '0000-teste', jogadores 'fantasma-*' e contas '@teste.invalid'.
-- Apagar a temporada leva junto (em cascata) estatísticas, meses, honrarias, revisões e partidas dela.
delete from public.temporadas where id = '0000-teste';
delete from public.jogadores where id like 'fantasma-%';
delete from auth.users where email like '%@teste.invalid';

-- Conferência: tudo tem que dar 0
select (select count(*) from public.temporadas where id = '0000-teste') as temporada,
       (select count(*) from public.jogadores where id like 'fantasma-%') as jogadores,
       (select count(*) from public.estatisticas_mes where jogador_id like 'fantasma-%') as linhas_mes,
       (select count(*) from public.partidas where temporada_id = '0000-teste') as partidas,
       (select count(*) from auth.users where email like '%@teste.invalid') as contas,
       (select count(*) from public.profiles where email like '%@teste.invalid') as perfis;
