-- Diz se o e-mail está na lista de convites de adm. Usado pela tela de login (ainda sem sessão)
-- para só deixar o link mágico criar conta para adms convidados.
-- Revela apenas se um e-mail é convite de adm; não expõe a lista.
create or replace function public.e_convidado(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.convites_admin c where c.email = lower(btrim(p_email)));
$$;

revoke execute on function public.e_convidado(text) from public;
grant execute on function public.e_convidado(text) to anon, authenticated;
