-- As views são só de leitura. Os grants padrão do Supabase davam escrita nelas a anon/authenticated;
-- hoje já é bloqueado (security_invoker usa os grants das tabelas), mas fechamos explicitamente.
revoke insert, update, delete, truncate, references, trigger on
  public.v_temporadas, public.v_jogadores_temporada, public.v_medias, public.v_estatisticas_mes,
  public.v_meses, public.v_temporada_json, public.v_conferencia
from anon, authenticated;
