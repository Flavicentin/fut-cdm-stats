-- Uma revisão da aba Honrarias também grava valores absolutos (salvar_honrarias_temporada apaga e regrava),
-- então, se uma partida for encerrada depois do envio, aprovar apagaria as honrarias que a partida somou.
-- Passa a bloquear Honrarias também (antes: só Mês e Temporada).
create or replace function public.bloquear_revisao_desatualizada()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.status = 'aprovada' and old.status = 'pendente' and new.aba in ('mes', 'temporada', 'honrarias') and exists (
    select 1 from public.partidas pa
     where pa.status = 'encerrada' and pa.temporada_id = new.temporada_id and pa.encerrada_em > old.criado_em
       and (new.aba <> 'mes' or date_trunc('month', pa.data)::date = new.mes)
  ) then
    raise exception 'Uma partida foi encerrada depois que esta alteração foi enviada; cancele e reenvie com os números atuais'
      using errcode = '22023';
  end if;
  return new;
end;
$$;
