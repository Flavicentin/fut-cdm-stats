-- Sorteio de times: a próxima partida fica "agendada" (times prontos, ainda sem lances).
-- Enquanto agendada dá para editar os times (quem desmarcou); "Iniciar" muda para aberta.

alter table public.partidas drop constraint partidas_status_check;
alter table public.partidas add constraint partidas_status_check
  check (status in ('agendada', 'aberta', 'encerrada', 'cancelada'));

-- Times podem ser mexidos com a partida agendada ou aberta (lances continuam só com ela aberta)
create or replace function public.partida_editavel(p_id bigint)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.partidas where id = p_id and status in ('agendada', 'aberta'));
$$;
revoke execute on function public.partida_editavel(bigint) from public, anon;
grant execute on function public.partida_editavel(bigint) to authenticated;

drop policy "admin monta times" on public.partida_jogadores;
create policy "admin monta times" on public.partida_jogadores for insert to authenticated
  with check ((select public.is_admin()) and public.partida_editavel(partida_id));
drop policy "admin troca time" on public.partida_jogadores;
create policy "admin troca time" on public.partida_jogadores for update to authenticated
  using ((select public.is_admin()) and public.partida_editavel(partida_id))
  with check ((select public.is_admin()) and public.partida_editavel(partida_id));
drop policy "admin tira jogador" on public.partida_jogadores;
create policy "admin tira jogador" on public.partida_jogadores for delete to authenticated
  using ((select public.is_admin()) and public.partida_editavel(partida_id));

-- Criar já como agendada (sorteio) ou aberta (nova partida)
drop policy "admin cria partida" on public.partidas;
create policy "admin cria partida" on public.partidas for insert to authenticated
  with check ((select public.is_admin()) and status in ('agendada', 'aberta') and criado_por = (select auth.uid())
              and autor = (select auth.jwt() ->> 'email') and encerrada_por is null and encerrada_em is null and resumo is null);
-- data e nomes dos times podem mudar enquanto agendada ou aberta (status só pelas funções)
drop policy "admin edita partida aberta" on public.partidas;
create policy "admin edita partida aberta" on public.partidas for update to authenticated
  using ((select public.is_admin()) and status in ('agendada', 'aberta'))
  with check ((select public.is_admin()) and status in ('agendada', 'aberta'));

-- Iniciar a partida sorteada
create or replace function public.iniciar_partida(p_id bigint)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem iniciar partidas' using errcode = '42501';
  end if;
  if not exists (select 1 from public.partida_jogadores where partida_id = p_id) then
    raise exception 'A partida não tem jogadores' using errcode = '22023';
  end if;
  update public.partidas set status = 'aberta' where id = p_id and status = 'agendada';
  if not found then
    raise exception 'Essa partida não está mais agendada' using errcode = '22023';
  end if;
end;
$$;
revoke execute on function public.iniciar_partida(bigint) from public, anon;
grant execute on function public.iniciar_partida(bigint) to authenticated;

-- Cancelar também vale para a agendada
create or replace function public.cancelar_partida(p_id bigint)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem cancelar partidas' using errcode = '42501';
  end if;
  update public.partidas set status = 'cancelada', encerrada_por = (select auth.uid()), encerrada_em = now()
   where id = p_id and status in ('agendada', 'aberta');
  if not found then
    raise exception 'Essa partida não está mais aberta' using errcode = '22023';
  end if;
end;
$$;
