-- Futs no site público: só as partidas ENCERRADAS, só data e resumo (placar, jogadores, honrarias do dia).
-- A tabela partidas continua só para adms (tem e-mail de quem criou/encerrou); esta view expõe só o necessário.
-- Sem security_invoker de propósito: roda com o dono da view para o público ler sem acesso à tabela.
create or replace view public.v_futs as
select p.id, p.temporada_id as temporada, p.data, p.resumo
  from public.partidas p
 where p.status = 'encerrada' and p.resumo is not null;

comment on view public.v_futs is 'Futs encerrados (data e resumo) para o site público. Sem e-mails nem lances.';
revoke all on public.v_futs from anon, authenticated;
grant select on public.v_futs to anon, authenticated;
