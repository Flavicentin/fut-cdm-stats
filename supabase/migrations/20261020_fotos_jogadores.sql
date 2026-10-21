-- Fotos dos jogadores: bucket público no Storage (todo mundo vê, só adm envia/troca/apaga)
-- e o campo jogadores.foto com o endereço público da foto (com ?v= para furar cache ao trocar).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-jogadores', 'fotos-jogadores', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "fotos: admin le" on storage.objects for select to authenticated
  using (bucket_id = 'fotos-jogadores' and (select public.is_admin()));
create policy "fotos: admin envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos-jogadores' and (select public.is_admin()));
create policy "fotos: admin troca" on storage.objects for update to authenticated
  using (bucket_id = 'fotos-jogadores' and (select public.is_admin()))
  with check (bucket_id = 'fotos-jogadores' and (select public.is_admin()));
create policy "fotos: admin apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos-jogadores' and (select public.is_admin()));

alter table public.jogadores add column foto text;
comment on column public.jogadores.foto is 'URL pública da foto no bucket fotos-jogadores (null = sem foto).';

-- Views do site passam a mandar a foto
create or replace view public.v_jogadores_temporada with (security_invoker = true) as
select et.temporada_id as temporada, j.id, j.nome, et.partidas, et.gols, et.assist,
       et.gols + et.assist as ga,
       round(et.gols::numeric / nullif(et.partidas, 0), 2) as gpj,
       round(et.assist::numeric / nullif(et.partidas, 0), 2) as apj,
       round((et.gols + et.assist)::numeric / nullif(et.partidas, 0), 2) as gapj,
       et.partidas >= t.min_jogos_media as regular,
       coalesce(h.honras, '{}'::jsonb) as honras,
       nullif(jsonb_strip_nulls(jsonb_build_object('pac', o.pac, 'fin', o.fin, 'pas', o.pas, 'dri', o.dri,
              'def', o.def, 'fis', o.fis, 'ovr', o.ovr)), '{}'::jsonb) as "over",
       j.foto
from public.estatisticas_temporada et
join public.jogadores j on j.id = et.jogador_id
join public.temporadas t on t.id = et.temporada_id
left join public.notas_over o on o.temporada_id = et.temporada_id and o.jogador_id = et.jogador_id
left join lateral (
  select jsonb_object_agg(ht.tipo_id, ht.quantidade) as honras
  from public.honrarias_temporada ht
  where ht.temporada_id = et.temporada_id and ht.jogador_id = et.jogador_id
) h on true;

create or replace view public.v_temporada_json with (security_invoker = true) as
select t.id as temporada,
       jsonb_build_object(
         'temporada', t.id,
         'atualizado_em', to_char(t.atualizado_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'),
         'min_jogos', t.min_jogos_media,
         'jogadores', coalesce((
            select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                     'id', v.id, 'nome', v.nome, 'partidas', v.partidas, 'gols', v.gols, 'assist', v.assist,
                     'honras', nullif(v.honras, '{}'::jsonb), 'over', v."over", 'foto', v.foto))
                   order by lower(v.nome))
            from public.v_jogadores_temporada v where v.temporada = t.id), '[]'::jsonb),
         'meses', coalesce((
            select jsonb_agg(jsonb_build_object('mes', vm.mes, 'jogadores', vm.jogadores) order by vm.mes_inicio)
            from public.v_meses vm where vm.temporada = t.id), '[]'::jsonb)
       ) as dados
from public.temporadas t;
