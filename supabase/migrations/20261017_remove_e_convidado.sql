-- e_convidado deixou de ser usada quando o cadastro virou "pedido de acesso" (qualquer um cria conta e
-- os adms aprovam). Removida para não deixar uma função pública sem uso.
drop function if exists public.e_convidado(text);
