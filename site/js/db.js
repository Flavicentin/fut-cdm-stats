/* Leitura dos dados da temporada: Supabase primeiro, JSON local como reserva. */
window.Db = (() => {
  'use strict';
  const { supabaseUrl, supabaseKey } = window.FUT_CONFIG;

  async function doSupabase(temporada) {
    // Sem temporada pedida: a mais recente que já tem jogadores (uma temporada recém-criada fica de fora).
    const filtro = temporada ? `temporada=eq.${encodeURIComponent(temporada)}` : 'order=temporada.desc&limit=5';
    const r = await fetch(`${supabaseUrl}/rest/v1/v_temporada_json?select=dados&${filtro}`, {
      headers: { apikey: supabaseKey },
    });
    if (!r.ok) throw new Error(`Supabase respondeu ${r.status}`);
    const linha = (await r.json()).find(l => l.dados?.jogadores?.length);
    if (!linha) throw new Error('Temporada vazia no Supabase');
    return linha.dados;
  }

  async function doJson(temporada) {
    const t = temporada || (await fetch('data/temporadas.json').then(r => r.json()))[0];
    return fetch(`data/${t}.json`).then(r => r.json());
  }

  async function carregarTemporada(temporada) {
    if (temporada) {
      // temporada pedida no link (?temporada=); se não existir, cai na mais recente
      try {
        return await doSupabase(temporada);
      } catch (e) {
        console.warn(`Temporada ${temporada} indisponível, abrindo a mais recente:`, e.message);
      }
    }
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

  // Nome e foto de todo mundo, inclusive convidados (que não vêm no JSON da temporada)
  async function carregarJogadores() {
    try {
      const r = await fetch(`${supabaseUrl}/rest/v1/jogadores?select=id,nome,foto`, { headers: { apikey: supabaseKey } });
      return r.ok ? Object.fromEntries((await r.json()).map(j => [j.id, j])) : {};
    } catch {
      return {};
    }
  }

  return { carregarTemporada, carregarFuts, carregarJogadores };
})();
