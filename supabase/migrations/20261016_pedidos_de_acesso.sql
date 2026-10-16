-- Pedidos de acesso: qualquer pessoa cria conta pelo link mágico e fica como 'leitor' (pendente).
-- Os adms aprovam (vira 'admin') ou recusam ('recusado') na aba Admins.
alter table public.profiles drop constraint profiles_papel_check;
alter table public.profiles add constraint profiles_papel_check check (papel in ('leitor', 'admin', 'recusado'));

create or replace function public.definir_papel(p_usuario uuid, p_papel text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem alterar papéis' using errcode = '42501';
  end if;
  if p_papel not in ('leitor', 'admin', 'recusado') then
    raise exception 'Papel inválido: %', p_papel using errcode = '22023';
  end if;
  if p_usuario = (select auth.uid()) and p_papel <> 'admin' then
    raise exception 'Você não pode remover o seu próprio acesso de admin' using errcode = '42501';
  end if;
  update public.profiles set papel = p_papel where id = p_usuario;
end;
$$;
