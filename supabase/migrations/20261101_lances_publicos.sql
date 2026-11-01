-- Lances dos futs encerrados no site público, para o vídeo de cada fut.
-- A tabela partida_eventos continua só para adms (tem quem anotou e o horário); esta view expõe só jogador, tipo e ordem.
-- Sem security_invoker de propósito: roda com o dono da view para o público ler sem acesso à tabela.
create or replace view public.v_fut_lances as
select e.partida_id as fut,
       e.jogador_id as jogador,
       e.tipo,
       row_number() over (partition by e.partida_id order by e.criado_em, e.id) as ordem
  from public.partida_eventos e
  join public.partidas p on p.id = e.partida_id
 where p.status = 'encerrada';

comment on view public.v_fut_lances is 'Ordem dos gols e assistências de cada fut encerrado. Sem horário nem quem anotou.';
revoke all on public.v_fut_lances from anon, authenticated;
grant select on public.v_fut_lances to anon, authenticated;
