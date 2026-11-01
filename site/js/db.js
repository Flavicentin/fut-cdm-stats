/* Leitura dos dados da temporada: Supabase primeiro, JSON local como reserva. */
window.Db = (() => {
  'use strict';
  const { supabaseUrl, supabaseKey } = window.FUT_CONFIG;

  // Todas as temporadas que já têm jogadores, da mais recente para a mais antiga
  // (uma temporada recém-criada fica de fora).
  async function doSupabase() {
    const r = await fetch(`${supabaseUrl}/rest/v1/v_temporada_json?select=dados&order=temporada.desc`, {
      headers: { apikey: supabaseKey },
    });
    if (!r.ok) throw new Error(`Supabase respondeu ${r.status}`);
    const lista = (await r.json()).map(l => l.dados).filter(d => d?.jogadores?.length);
    if (!lista.length) throw new Error('Temporadas vazias no Supabase');
    return lista;
  }

  async function doJson() {
    const ids = await fetch('data/temporadas.json').then(r => r.json());
    const lista = await Promise.all(ids.map(t => fetch(`data/${t}.json`).then(r => r.json())));
    return lista.sort((a, b) => b.temporada.localeCompare(a.temporada));
  }

  async function carregarTemporadas() {
    try {
      return await doSupabase();
    } catch (e) {
      console.warn('Usando o JSON local:', e.message);
      return doJson();
    }
  }

  // Futs encerrados da temporada (view pública v_futs). Sem Supabase: lista vazia (a seção some).
  async function carregarFuts(temporada) {
    try {
      const r = await fetch(`${supabaseUrl}/rest/v1/v_futs?select=id,data,resumo&temporada=eq.${encodeURIComponent(temporada)}&order=data.desc`, {
        headers: { apikey: supabaseKey },
      });
      return r.ok ? await r.json() : [];
    } catch {
      return [];
    }
  }

  // Lances de um fut, em ordem (view pública v_fut_lances). Sem Supabase ou sem a view: lista vazia.
  async function carregarLances(futId) {
    try {
      const r = await fetch(`${supabaseUrl}/rest/v1/v_fut_lances?select=jogador,tipo,ordem&fut=eq.${encodeURIComponent(futId)}&order=ordem.asc`, {
        headers: { apikey: supabaseKey },
      });
      return r.ok ? await r.json() : [];
    } catch {
      return [];
    }
  }

  // Nome e foto de todo mundo, inclusive convidados (que não vêm no JSON da temporada)
  async function carregarJogadores() {
    try {
      const r = await fetch(`${supabaseUrl}/rest/v1/jogadores?select=id,nome,foto`, { headers: { apikey: supabaseKey } });
      return r.ok ? Object.fromEntries((await r.json()).map(j => [j.id, j])) : {};
    } catch {
      return {};
    }
  }

  return { carregarTemporadas, carregarFuts, carregarLances, carregarJogadores };
})();
