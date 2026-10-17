-- Excluir jogador pela aba Temporada (X vermelho), depois da revisão de outro adm.
-- A alteração da aba 'temporada' leva payload.remover = ['id', ...]. Ao ser APROVADA, apaga do jogador,
-- naquela temporada: totais (e, em cascata, honrarias e notas Over), números e honrarias dos meses.
-- Se não sobrar nenhum registro dele (outra temporada, outro mês, partida), apaga também do cadastro.
-- Roda num gatilho logo depois da aprovação, na mesma transação: se falhar, a aprovação inteira volta.

create or replace function public.aplicar_remocao_jogadores()
returns trigger language plpgsql set search_path = ''
as $$
declare
  v_ids text[];
begin
  if new.status <> 'aprovada' or old.status <> 'pendente' or new.aba <> 'temporada' then
    return null;
  end if;
  select coalesce(array_agg(x), '{}') into v_ids from jsonb_array_elements_text(coalesce(new.payload -> 'remover', '[]')) as x;
  if cardinality(v_ids) = 0 then
    return null;
  end if;

  -- meses da temporada (honrarias do mês caem em cascata)
  delete from public.estatisticas_mes where temporada_id = new.temporada_id and jogador_id = any (v_ids);
  -- totais da temporada (honrarias da temporada e notas Over caem em cascata)
  delete from public.estatisticas_temporada where temporada_id = new.temporada_id and jogador_id = any (v_ids);
  -- cadastro, só se não sobrou nada dele em lugar nenhum
  delete from public.jogadores j
   where j.id = any (v_ids)
     and not exists (select 1 from public.estatisticas_temporada et where et.jogador_id = j.id)
     and not exists (select 1 from public.estatisticas_mes em where em.jogador_id = j.id)
     and not exists (select 1 from public.partida_jogadores pj where pj.jogador_id = j.id);
  return null;
end;
$$;
revoke execute on function public.aplicar_remocao_jogadores() from public, anon, authenticated;

create trigger aplicar_remocao_jogadores after update of status on public.alteracoes
  for each row execute function public.aplicar_remocao_jogadores();
