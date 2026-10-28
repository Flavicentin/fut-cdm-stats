/* Fut CDM — estado, rankings, honrarias, mês a mês, perfil, comparação e rotas. */
(() => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const int = v => String(Math.round(v));
  const dec = v => v.toFixed(1).replace('.', ',');
  const ord = n => n ? `${n}º` : '—';
  // "Caio Hideki" -> "CH", "Roger" -> "RO" (aparece enquanto não há foto)
  const iniciais = nome => {
    const p = nome.trim().split(/\s+/);
    return (p.length > 1 ? p[0][0] + p.at(-1)[0] : nome.slice(0, 2)).toUpperCase();
  };

  const MIN_JOGOS = 10;   // mesmo critério dos adms para as médias

  const METRICAS = [
    { id: 'gols', rotulo: 'Gols', fmt: int, val: j => j.gols },
    { id: 'assist', rotulo: 'Assistências', fmt: int, val: j => j.assist },
    { id: 'ga', rotulo: 'G+A', fmt: int, val: j => j.ga },
    { id: 'gpj', rotulo: 'Gols/jogo', fmt: dec, val: j => j.gpj, media: true },
    { id: 'apj', rotulo: 'Assist/jogo', fmt: dec, val: j => j.apj, media: true },
    { id: 'gapj', rotulo: 'G+A/jogo', fmt: dec, val: j => j.gapj, media: true },
    { id: 'partidas', rotulo: 'Partidas', fmt: int, val: j => j.partidas },
  ];
  const ABA_OVERALL = { id: 'ovr', rotulo: 'Overall · adms', fmt: int, val: j => j.over?.ovr ?? 0, adms: true };
  const MET = Object.fromEntries([...METRICAS, ABA_OVERALL].map(m => [m.id, m]));

  // Radar calculado a partir dos números dos jogos: [sigla, nome, métrica, peso]
  const ATRIBUTOS = [
    ['FIN', 'Finalização', 'gpj', .22],
    ['PAS', 'Passe', 'apj', .22],
    ['DEC', 'Decisão', 'gapj', .26],
    ['PRE', 'Presença', 'partidas', .12],
    ['VOL', 'Volume', 'ga', .18],
  ];
  // Notas dos adms (planilha "Over")
  const NOTAS = [
    ['PAC', 'Pace', 'pac'],
    ['FIN', 'Finalização', 'fin'],
    ['PAS', 'Passe', 'pas'],
    ['DRI', 'Drible', 'dri'],
    ['DEF', 'Defesa', 'def'],
    ['FIS', 'Físico', 'fis'],
  ];

  // Honrarias: (S) num fut só · (M) no mês
  const HONRAS = [
    { k: 'mvp_s', g: 's', ic: '🥇', nome: 'MVP', desc: 'Melhor jogador do fut' },
    { k: 'totw', g: 's', ic: '✅', nome: 'TOTW', desc: 'Seleção da semana (Team of the Week)' },
    { k: 'art_s', g: 's', ic: '🥅', nome: 'Artilheiro', desc: 'Quem fez mais gols no fut' },
    { k: 'gar_s', g: 's', ic: '🎁', nome: 'Garçom', desc: 'Quem deu mais assistências no fut' },
    { k: 'gart_s', g: 's', ic: '🐲', nome: 'Gartilheiro', desc: 'Artilheiro e garçom ao mesmo tempo' },
    { k: 'mc_s', g: 's', ic: '⭐', nome: 'Masterclass', desc: 'Mais de 10 participações (G+A)' },
    { k: 'dd_s', g: 's', ic: '✌️', nome: 'Duplo-duplo', desc: 'Mais de 10 gols e mais de 10 assistências' },
    { k: 'top3g_s', g: 's', ic: '⚽', nome: 'Top 3 G', desc: 'Entre os 3 que mais fizeram gols' },
    { k: 'top3a_s', g: 's', ic: '👟', nome: 'Top 3 A', desc: 'Entre os 3 que mais deram assistências' },
    { k: 'potm', g: 'm', ic: '🏆', nome: 'POTM', desc: 'Jogador do mês (Player of the Month)' },
    { k: 'mvp_m', g: 'm', ic: '🥇', nome: 'MVP', desc: 'Melhor jogador do mês' },
    { k: 'art_m', g: 'm', ic: '🥅', nome: 'Artilheiro', desc: 'Quem fez mais gols no mês' },
    { k: 'gar_m', g: 'm', ic: '🎁', nome: 'Garçom', desc: 'Quem deu mais assistências no mês' },
    { k: 'gart_m', g: 'm', ic: '🐲', nome: 'Gartilheiro', desc: 'Artilheiro e garçom do mês' },
    { k: 'mc_m', g: 'm', ic: '⭐', nome: 'Masterclass', desc: 'Mais de 10 participações no mês' },
    { k: 'dd_m', g: 'm', ic: '✌️', nome: 'Duplo-duplo', desc: '10+ gols e 10+ assistências no mês' },
    { k: 'top3g_m', g: 'm', ic: '⚽', nome: 'Top 3 G', desc: 'Entre os 3 que mais fizeram gols no mês' },
    { k: 'top3a_m', g: 'm', ic: '👟', nome: 'Top 3 A', desc: 'Entre os 3 que mais deram assistências no mês' },
  ];
  const HON = Object.fromEntries(HONRAS.map(h => [h.k, h]));
  const GRUPO = { s: 'por fut', m: 'no mês' };
  const honra = (j, k) => j.honras?.[k] || 0;
  const totalHonras = (j, g) => HONRAS.filter(h => !g || h.g === g).reduce((t, h) => t + honra(j, h.k), 0);

  const NOME_MES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const nomeMes = m => NOME_MES[+m.slice(5, 7)];
  const curtoMes = m => nomeMes(m).slice(0, 3);
  const mesAtual = new Date().toISOString().slice(0, 7);

  const POSICOES = {
    ATA: 'Atacante · finalizador nato',
    SA: 'Meia-atacante · faz e serve',
    MEI: 'Meia · garçom do time',
  };

  const state = {
    temporada: null,
    jogadores: [],     // elenco completo (inclui quem só tem nota/honraria)
    comJogos: [],      // quem tem partidas registradas
    regulares: [],     // quem tem o mínimo de jogos
    porId: {},
    meses: [],
    aba: 'gols',
    minJogos: MIN_JOGOS,
    grupoHonras: 's',
    mes: null,
    metricaCorrida: 'gols',
    focoCorrida: null,
    histModo: 'pos',
    histMet: 'ga',
    histSel: [],
    perfilMet: 'ga',
    perfilId: null,
    mesMet: 'ga',      // ranking do mês: ga | gols | assist
    futs: [],          // futs encerrados (v_futs), do mais novo para o mais antigo
    fut: null,
    futMet: 'ga',
    a: null,
    b: null,
    modo: 'numeros',
  };

  /* ---------------- Dados ---------------- */
  async function carregar() {
    // ?temporada=2025 abre uma temporada específica (sem o parâmetro: a mais recente)
    const dados = await Db.carregarTemporada(new URLSearchParams(location.search).get('temporada') || undefined);
    state.temporada = dados.temporada;
    state.atualizado = dados.atualizado_em;
    state.jogadores = dados.jogadores.map(j => {
      const ga = j.gols + j.assist, p = j.partidas || 0;
      return { ...j, ga, gpj: p ? j.gols / p : 0, apj: p ? j.assist / p : 0, gapj: p ? ga / p : 0 };
    });
    state.porId = Object.fromEntries(state.jogadores.map(j => [j.id, j]));
    state.comJogos = state.jogadores.filter(j => j.partidas > 0);
    state.regulares = state.comJogos.filter(j => j.partidas >= MIN_JOGOS);
    state.meses = dados.meses || [];
    state.mes = state.meses.at(-1)?.mes;
    [state.futs, state.cadastro] = await Promise.all([Db.carregarFuts(state.temporada), Db.carregarJogadores()]);
    state.fut = state.futs[0]?.id ?? null;
    // série mês a mês de cada jogador do elenco
    for (const j of state.jogadores) j.porMes = state.meses.map(m => m.jogadores.find(i => i.id === j.id) || { gols: 0, assist: 0 });
    calcularRanks();
    calcularAtributos();
  }

  // Valor usado para empate: o que aparece na tela (médias com 1 casa).
  const chave = (m, j) => m.media ? Math.round(m.val(j) * 10) / 10 : m.val(j);
  const elegiveis = (m, min = MIN_JOGOS) =>
    m.adms ? state.jogadores.filter(j => j.over?.ovr) : m.media ? state.comJogos.filter(j => j.partidas >= min) : state.comJogos;

  // Ranking denso: "1. Roger · 2. Felps · 3. Leo e Renato · 4. ..."
  function ranquear(metrica, lista = elegiveis(MET[metrica])) {
    const m = MET[metrica];
    const ordem = [...lista].sort((x, y) => m.val(y) - m.val(x) || x.nome.localeCompare(y.nome, 'pt'));
    let pos = 0, ultimo = null;
    return ordem.map(j => {
      const k = chave(m, j);
      if (k !== ultimo) { pos++; ultimo = k; }
      return { j, pos, valor: m.val(j) };
    });
  }

  function calcularRanks() {
    for (const j of state.jogadores) j.ranks = {};
    for (const m of Object.values(MET)) for (const r of ranquear(m.id)) r.j.ranks[m.id] = r.pos;
  }

  // Radar dos números: posição de cada um em relação aos regulares (45 a 99)
  function calcularAtributos() {
    const base = state.regulares, n = base.length;
    for (const [sigla, , met] of ATRIBUTOS) {
      const vals = base.map(MET[met].val);
      const min = Math.min(...vals), max = Math.max(...vals);
      for (const j of state.comJogos) {
        const v = MET[met].val(j);
        const abaixo = vals.filter(x => x < v).length;
        const iguais = vals.filter(x => x === v).length;
        const pct = Math.min(1, (abaixo + Math.max(0, iguais - 1) / 2) / (n - 1));
        const mm = Math.min(1, Math.max(0, max > min ? (v - min) / (max - min) : 1));
        (j.attrs ||= {})[sigla] = Math.round(45 + 54 * (.55 * pct + .45 * mm));
      }
    }
    for (const j of state.comJogos) {
      j.calc = Math.round(ATRIBUTOS.reduce((s, [sigla, , , p]) => s + j.attrs[sigla] * p, 0));
      const fatia = j.ga ? j.gols / j.ga : 0;
      j.pos = fatia >= .65 ? 'ATA' : fatia <= .5 ? 'MEI' : 'SA';
    }
    const media = (lista, f) => lista.reduce((t, j) => t + f(j), 0) / lista.length;
    state.mediaAttrs = Object.fromEntries(ATRIBUTOS.map(([s]) => [s, media(base, j => j.attrs[s])]));
    const comNota = state.jogadores.filter(j => j.over?.pac);
    state.mediaNotas = Object.fromEntries(NOTAS.map(([, , k]) => [k, media(comNota, j => j.over[k])]));
  }

  const lideresDe = (rs) => rs.filter(r => r.pos === 1 && r.valor > 0);
  const nomes = rs => rs.map(r => r.j.nome).join(' & ');

  // Ranking simples por valor (honrarias, meses)
  function topPor(lista, val) {
    const ordem = lista.map(j => ({ j, valor: val(j) })).filter(r => r.valor > 0)
      .sort((x, y) => y.valor - x.valor || x.j.nome.localeCompare(y.j.nome, 'pt'));
    let pos = 0, ultimo = null;
    for (const r of ordem) { if (r.valor !== ultimo) { pos++; ultimo = r.valor; } r.pos = pos; }
    return ordem;
  }

  /* ---------------- Hero ---------------- */
  function renderHero() {
    $$('[data-temporada]').forEach(el => el.textContent = state.temporada);
    $('#logo-ano').textContent = state.temporada;
    document.title = `Fut CDM ${state.temporada}`;
    const [ano, mes, dia] = state.atualizado.split('-');
    $('#atualizado').textContent = `${dia}/${mes}/${ano}`;

    const js = state.comJogos;
    const soma = k => js.reduce((t, j) => t + j[k], 0);
    const kpis = [
      [soma('gols'), 'gols marcados', int],
      [soma('assist'), 'assistências', int],
      [js.length, 'jogadores', int],
      [soma('ga') / (soma('partidas') || 1), 'G+A por jogador a cada jogo', dec],
    ];
    $('#kpis').innerHTML = kpis.map(([v, r, f]) =>
      `<div class="kpi"><div class="kpi-valor num" data-contar="${v}" data-fmt="${f === dec ? 'dec' : 'int'}">${f(v)}</div><div class="kpi-rotulo">${r}</div></div>`).join('');
    contarKpis();

    const card = (ic, tit, rs, valor, un) => !rs.length ? '' : `<button class="lider" type="button" data-jogador="${rs[0].j.id}">
        <span class="lider-icone">${ic}</span>
        <span class="lider-titulo">${tit}</span>
        <span class="lider-nome">${esc(nomes(rs))}</span>
        <span class="lider-valor"><b class="num">${valor}</b> ${un}</span>
      </button>`;
    const porMet = (ic, tit, met, un) => { const rs = lideresDe(ranquear(met)); return card(ic, tit, rs, rs[0] && MET[met].fmt(rs[0].valor), un); };
    const porHonra = (ic, tit, k, un) => { const rs = topPor(state.jogadores, j => honra(j, k)).filter(r => r.pos === 1); return card(ic, tit, rs, rs[0]?.valor, un); };
    $('#lideres').innerHTML = [
      porMet('⚽', 'Artilheiro', 'gols', 'gols'),
      porMet('🎯', 'Garçom', 'assist', 'assistências'),
      porMet('👑', 'Rei do G+A', 'ga', 'G+A'),
      porMet('⚡', 'Melhor média', 'gapj', `G+A por jogo · ${MIN_JOGOS}+ jogos`),
      porMet('🏟️', 'Mais presente', 'partidas', 'jogos'),
      porHonra('🥇', 'Mais MVPs', 'mvp_s', 'MVPs de fut'),
      porHonra('✅', 'Mais TOTW', 'totw', 'seleções da semana'),
      porHonra('🏆', 'Mais POTM', 'potm', 'jogador do mês'),
    ].join('');
  }

  function contarKpis() {
    const els = $$('[data-contar]');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t0 = performance.now(), dur = 1100;
    const passo = t => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      for (const el of els) {
        const v = +el.dataset.contar * e;
        el.textContent = el.dataset.fmt === 'dec' ? dec(v) : int(v);
      }
      if (p < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }

  /* ---------------- Rankings ---------------- */
  function renderAbas() {
    $('#abas-ranking').innerHTML = [...METRICAS, ABA_OVERALL].map(m =>
      `<button class="aba${m.id === state.aba ? ' ativa' : ''}${m.adms ? ' aba-adms' : ''}" role="tab" aria-selected="${m.id === state.aba}" data-aba="${m.id}">${m.rotulo}</button>`).join('');
  }

  function itemRanking(r, i, max, fmt, sub = '', clicavel = true) {
    return `<li class="rank-item" data-pos="${r.pos}" ${clicavel ? `data-jogador="${r.j.id}" tabindex="0"` : ''} style="--i:${i}">
      <span class="rank-pos">${r.pos}</span>
      <div class="rank-corpo">
        <div class="rank-nome"><span>${esc(r.j.nome)}</span>${sub ? ` <small>${sub}</small>` : ''}</div>
        <div class="rank-barra"><span style="--w:${(r.valor / max * 100).toFixed(1)}%;--i:${i}"></span></div>
      </div>
      <span class="rank-valor num">${fmt(r.valor)}</span>
    </li>`;
  }

  function renderRanking() {
    const m = MET[state.aba];
    $('#filtro-min').hidden = !m.media;
    $('#nota-adms').hidden = !m.adms;
    const rs = ranquear(m.id, elegiveis(m, state.minJogos));
    if (!rs.length) { $('#ranking').innerHTML = '<li class="rank-vazio">Ninguém com esse mínimo de jogos.</li>'; return; }
    const max = rs[0].valor;
    $('#ranking').innerHTML = rs.map((r, i) => {
      const sub = m.media ? `${r.j.partidas} jogos${r.j.partidas < MIN_JOGOS ? ' · poucos jogos' : ''}`
        : m.id === 'ga' ? `${r.j.gols}G · ${r.j.assist}A` : '';
      return itemRanking(r, i, max, m.fmt, sub);
    }).join('');
  }

  /* ---------------- Sala de Troféus ---------------- */
  function renderHonras() {
    const g = state.grupoHonras;
    const colunas = HONRAS.filter(h => h.g === g && state.jogadores.some(j => honra(j, h.k)));
    const linhas = state.jogadores.filter(j => totalHonras(j, g) > 0)
      .sort((x, y) => totalHonras(y, g) - totalHonras(x, g) || x.nome.localeCompare(y.nome, 'pt'));

    const destaques = (g === 's' ? ['mvp_s', 'totw', 'gart_s'] : ['potm', 'mvp_m', 'gart_m']).map(k => {
      const h = HON[k];
      const rs = topPor(state.jogadores, j => honra(j, k));
      return `<article class="podio">
        <header><span class="podio-ic">${h.ic}</span><div><b>${h.nome}</b><small>${h.desc} · ${rs.length} jogador${rs.length === 1 ? "" : "es"}</small></div></header>
        <ol>${rs.map(r => `<li data-pos="${r.pos}" data-jogador="${r.j.id}"><span class="p">${r.pos}º</span><span class="n">${esc(r.j.nome)}</span><span class="v num">${r.valor}×</span></li>`).join('') || '<li class="vazio">Ninguém ainda</li>'}</ol>
      </article>`;
    }).join('');
    $('#podios').innerHTML = destaques;

    Charts.heatmap($('#g-honras'), {
      linhas: linhas.map(j => ({ id: j.id, nome: j.nome })),
      colunas: colunas.map(h => ({ rotulo: h.ic, titulo: `${h.nome} (${GRUPO[h.g]})` })),
      valores: linhas.map(j => colunas.map(h => honra(j, h.k))),
      unidade: '×',
    });
    $('#legenda-honras').innerHTML = colunas.map(h => `<span><b>${h.ic}</b> ${h.nome}</span>`).join('');
  }

  function renderGlossario() {
    const item = h => `<div class="glossario-item"><span class="g-ic">${h.ic}</span><div><b>${h.nome}</b><span>${h.desc}</span></div></div>`;
    const unicos = HONRAS.filter(h => h.g === 's').concat(HON.potm);
    $('#glossario').innerHTML = unicos.map(item).join('') +
      `<p class="glossario-nota"><b>(S)</b> vale para um fut só · <b>(M)</b> vale para o mês inteiro. MVP, Artilheiro, Garçom, Gartilheiro, Masterclass, Duplo-duplo e Top 3 existem nas duas versões.</p>`;
  }

  /* ---------------- Temporada mês a mês ---------------- */
  function renderMeses() {
    if (!state.meses.length) { $('#mes-a-mes').hidden = true; return; }
    $('#pilulas-mes').innerHTML = state.meses.map(m =>
      `<button class="aba${m.mes === state.mes ? ' ativa' : ''}" data-mes="${m.mes}">${nomeMes(m.mes)}${m.mes === mesAtual ? ' <small>em andamento</small>' : ''}</button>`).join('');

    const mes = state.meses.find(m => m.mes === state.mes);
    const itens = mes.jogadores.map(i => ({ ...i, ga: i.gols + i.assist, j: state.porId[i.id] || { id: i.id, nome: i.nome, convidado: true } }));
    const pessoa = i => ({ ...i.j, _i: i });
    const top = (val) => topPor(itens.map(pessoa), p => val(p._i)).filter(r => r.pos === 1);
    const card = (ic, tit, rs, un) => `<div class="mes-card${rs.length ? '' : ' vazio'}" ${rs[0] ? `data-jogador="${rs[0].j.id}"` : ''}>
        <span class="lider-icone">${ic}</span><span class="lider-titulo">${tit}</span>
        <span class="lider-nome">${rs.length ? esc(nomes(rs)) : '—'}</span>
        <span class="lider-valor">${rs.length ? `<b class="num">${rs[0].valor}</b> ${un}` : 'ainda não definido'}</span>
      </div>`;
    $('#mes-destaques').innerHTML = [
      card('🏆', 'POTM', top(i => i.honras?.potm || 0), ''),
      card('🥇', 'MVP do mês', top(i => i.honras?.mvp_m || 0), ''),
      card('🥅', 'Artilheiro do mês', top(i => i.gols), 'gols'),
      card('🎁', 'Garçom do mês', top(i => i.assist), 'assistências'),
    ].join('').replace(/<b class="num">1<\/b> <\/span>/g, '<b class="num">✓</b></span>');

    const rs = rankingMes();
    const max = rs[0]?.valor || 1;
    $('#mes-ranking').innerHTML = rs.map((r, i) =>
      itemRanking(r, i, max, int, `${r.j._i.gols}G · ${r.j._i.assist}A${r.j.convidado ? ' · convidado' : ''}`)).join('')
      || '<li class="rank-vazio">Ninguém pontuou nesse quesito ainda.</li>';
    $('#mes-titulo').textContent = `${ROTULO_MET[state.mesMet]} em ${nomeMes(state.mes)}`;
  }

  const ROTULO_MET = { ga: 'G+A', gols: 'Gols', assist: 'Assistências' };

  // Ranking do mês aberto na métrica escolhida (G+A, gols ou assistências)
  function rankingMes() {
    const mes = state.meses.find(m => m.mes === state.mes);
    if (!mes) return [];
    const itens = mes.jogadores.map(i => ({ ...i, ga: i.gols + i.assist, j: state.porId[i.id] || { id: i.id, nome: i.nome, convidado: true } }));
    return topPor(itens.map(i => ({ ...i.j, _i: i })), p => p._i[state.mesMet]);
  }

  /* ---------------- Futs (cada partida encerrada) ---------------- */
  const dataCurta = d => d.slice(8, 10) + '/' + d.slice(5, 7);
  const futAtual = () => state.futs.find(f => f.id === state.fut);

  // Jogadores do fut com time, gols e assistências (convidado = fora do elenco da temporada)
  function jogadoresDoFut(f) {
    return f.resumo.times.flatMap((t, ti) => t.jogadores.map(p => ({
      id: p.id, nome: p.nome, gols: p.gols, assist: p.assist, ga: p.gols + p.assist, time: t.nome || `Time ${ti + 1}`,
    })));
  }

  function rankingFut() {
    const f = futAtual();
    if (!f) return [];
    return topPor(jogadoresDoFut(f).map(p => ({ ...(state.porId[p.id] || { id: p.id, nome: p.nome, convidado: true }), _i: p })), x => x._i[state.futMet]);
  }

  function renderFuts() {
    const secao = $('#futs');
    secao.hidden = !state.futs.length;
    $$('.nav a[href="#futs"]').forEach(a => { a.hidden = !state.futs.length; });
    if (!state.futs.length) return;
    $('#pilulas-fut').innerHTML = state.futs.map((f, i) =>
      `<button class="aba${f.id === state.fut ? ' ativa' : ''}" data-fut="${f.id}">Fut de ${dataCurta(f.data)}${i === 0 ? ' <small>último</small>' : ''}</button>`).join('');

    const f = futAtual();
    const r = f.resumo, P = r.premios || {};
    const times = r.times.map((t, i) => ({ ...t, n: i })).filter(t => t.jogadores.length);
    const maxGols = Math.max(...times.map(t => t.gols));
    $('#fut-placar').innerHTML = [...times].sort((a, b) => b.gols - a.gols).map(t =>
      `<div class="fut-time-placar${t.gols === maxGols ? ' vencedor' : ''}"><span>${esc(t.nome)}</span><b class="num">${t.gols}</b></div>`).join('');

    const quem = k => (P[k] || []);
    const card = (ic, tit, lista, valor) => `<div class="mes-card${lista.length ? '' : ' vazio'}" ${lista[0] ? `data-jogador="${lista[0].id}"` : ''}>
        <span class="lider-icone">${ic}</span><span class="lider-titulo">${tit}</span>
        <span class="lider-nome">${lista.length ? esc(lista.map(p => p.nome).join(' & ')) : '—'}</span>
        <span class="lider-valor">${lista.length ? valor(lista[0]) : 'ninguém'}</span>
      </div>`;
    $('#fut-destaques').innerHTML = [
      card('🥇', 'MVP', quem('mvp_s'), p => `<b class="num">${p.gols + p.assist}</b> G+A`),
      card('🥅', 'Artilheiro', quem('art_s'), p => `<b class="num">${p.gols}</b> gols`),
      card('🎁', 'Garçom', quem('gar_s'), p => `<b class="num">${p.assist}</b> assistências`),
      card('✅', 'Time da semana', quem('totw'), () => `${quem('totw').length} jogadores`),
    ].join('');

    const rs = rankingFut();
    const max = rs[0]?.valor || 1;
    $('#fut-ranking').innerHTML = rs.map((x, i) =>
      itemRanking(x, i, max, int, `${x.j._i.gols}G · ${x.j._i.assist}A · ${esc(x.j._i.time)}${x.j.convidado ? ' · convidado' : ''}`)).join('')
      || '<li class="rank-vazio">Ninguém pontuou nesse quesito.</li>';
    $('#fut-titulo').textContent = `${ROTULO_MET[state.futMet]} · fut de ${dataCurta(f.data)}`;

    $('#fut-times').innerHTML = times.map(t => `
      <div class="fut-time pt-cor-${t.n}">
        <header><b>${esc(t.nome)}</b><span class="num">${t.gols}</span></header>
        <ul>${t.jogadores.map(p => `<li data-jogador="${esc(p.id)}" tabindex="0"><span>${esc(p.nome)}</span><small>${[p.gols && `${p.gols}G`, p.assist && `${p.assist}A`].filter(Boolean).join(' · ') || '—'}</small></li>`).join('')}</ul>
      </div>`).join('');
  }

  /* ---------------- Exportar ranking (top 10 em imagem) ---------------- */
  async function exportarRanking(qual, botao) {
    if (!window.Exportar) return;
    let titulo, subtitulo, arquivo, lista;
    const item = (j, pos, valor, sub) => ({ pos, nome: j.nome, iniciais: iniciais(j.nome), foto: fotoDe(j.id), valor, sub });
    if (qual === 'geral') {
      const m = MET[state.aba];
      lista = ranquear(m.id, elegiveis(m, state.minJogos)).slice(0, 10)
        .map(r => item(r.j, r.pos, m.fmt(r.valor), m.media ? `${r.j.partidas} jogos` : m.id === 'ga' ? `${r.j.gols}G · ${r.j.assist}A` : ''));
      titulo = `Top 10 · ${m.rotulo}`;
      subtitulo = m.media ? `Temporada ${state.temporada} · mínimo de ${state.minJogos} jogos` : `Temporada ${state.temporada}`;
      arquivo = m.id;
    } else if (qual === 'mes') {
      lista = rankingMes().slice(0, 10).map(r => item(r.j, r.pos, String(r.valor), `${r.j._i.gols}G · ${r.j._i.assist}A`));
      titulo = `${ROTULO_MET[state.mesMet]} · ${nomeMes(state.mes)}`;
      subtitulo = `Top 10 do mês · temporada ${state.temporada}`;
      arquivo = `${state.mes}-${state.mesMet}`;
    } else {
      const f = futAtual();
      lista = rankingFut().slice(0, 10).map(r => item(r.j, r.pos, String(r.valor), `${r.j._i.gols}G · ${r.j._i.assist}A · ${r.j._i.time}`));
      titulo = `${ROTULO_MET[state.futMet]} · fut de ${dataCurta(f.data)}`;
      subtitulo = `Top 10 do fut · temporada ${state.temporada}`;
      arquivo = `fut-${f.data}-${state.futMet}`;
    }
    if (!lista.length) return toast('Nada para exportar ainda.');
    const [ano, mes, dia] = state.atualizado.split('-');
    const texto = botao.textContent;
    botao.disabled = true;
    botao.textContent = 'Gerando…';
    try {
      const r = await Exportar.ranking({ titulo, subtitulo, arquivo, itens: lista, temporada: state.temporada, site: location.host || 'fut-cdm.vercel.app', atualizado: `${dia}/${mes}/${ano}` });
      if (r === 'baixado') toast('Imagem baixada 📸');
    } catch (e) {
      console.error(e);
      toast('Não foi possível gerar. Tente de novo.');
    } finally {
      botao.disabled = false;
      botao.textContent = texto;
    }
  }

  function renderCorrida() {
    const k = state.metricaCorrida;
    const val = i => k === 'ga' ? i.gols + i.assist : i[k];
    const series = state.comJogos.filter(j => j.porMes.some(i => val(i) > 0)).map(j => {
      let acc = 0;
      return { id: j.id, nome: j.nome, valores: j.porMes.map(i => (acc += val(i))) };
    });
    const foco = state.focoCorrida;
    Charts.corrida($('#g-corrida'), { meses: state.meses.map(m => curtoMes(m.mes)), series, foco });

    // Resumo de quem está em destaque: total acumulado e posição na corrida
    const info = $('#corrida-info');
    const j = foco && state.porId[foco];
    $('#limpar-corrida').hidden = !foco;
    if (!j) { info.hidden = true; return; }
    const unid = { gols: 'gols', assist: 'assistências', ga: 'G+A' }[k];
    const rs = topPor(series.map(s => ({ ...s, j: s })), s => s.valores.at(-1));
    const r = rs.find(x => x.j.id === foco);
    info.hidden = false;
    info.innerHTML = r
      ? `<span class="ponto"></span><b>${esc(j.nome)}</b> · ${r.valor} ${unid} · <b>${r.pos}º</b> na corrida de ${unid}`
      : `<span class="ponto"></span><b>${esc(j.nome)}</b> ainda não tem ${unid} nos meses registrados`;
  }

  // Histórico de classificação: ranking denso de cada mês, contando só aquele mês
  const MAX_HIST = 4;
  function renderHistorico() {
    const k = state.histMet;
    const val = i => k === 'ga' ? i.gols + i.assist : i[k];
    const unidade = { gols: 'gols', assist: 'assist.', ga: 'G+A' }[k];
    // posição de cada id em cada mês (convidados contam na classificação do mês)
    const posMes = state.meses.map(m => {
      const rs = topPor(m.jogadores.map(i => ({ id: i.id, nome: i.nome || '', i })), x => val(x.i));
      return Object.fromEntries(rs.map(r => [r.j.id, r.pos]));
    });
    const series = state.comJogos.filter(j => j.porMes.some(i => val(i) > 0)).map(j => ({
      id: j.id, nome: j.nome,
      brutos: j.porMes.map(val),
      // quem não pontuou no mês vai para o fim da fila (uma posição depois do último), sem quebrar a linha
      posicoes: posMes.map(p => p[j.id] || Math.max(0, ...Object.values(p)) + 1),
    }));
    // Visão geral: sem ninguém escolhido, os 3 melhores da temporada ficam em destaque
    const geral = !state.histSel.length;
    const destaques = geral
      ? [...series].sort((a, b) => b.brutos.reduce((t, v) => t + v, 0) - a.brutos.reduce((t, v) => t + v, 0)).slice(0, 3).map(s => s.id)
      : state.histSel;
    Charts.historico($('#g-historico'), { meses: state.meses.map(m => curtoMes(m.mes)), series, destaques, modo: state.histModo, unidade });

    $('#hist-chips').innerHTML = state.histSel.map((id, n) => {
      const e = Charts.ESTILOS[n];
      return `<span class="chip" style="--c:var(--${e.cor})"><i class="${Array.isArray(e.tipo) ? 'tracejado' : ''}"></i>${esc(state.porId[id].nome)}<button type="button" data-tirar="${id}" aria-label="Tirar ${esc(state.porId[id].nome)}">×</button></span>`;
    }).join('');
    const cheio = state.histSel.length >= MAX_HIST;
    const input = $('#busca-hist input');
    input.disabled = cheio;
    input.placeholder = cheio ? `Máximo de ${MAX_HIST} jogadores` : state.histSel.length ? '＋ Comparar com mais alguém' : '＋ Escolha você (ou quem quiser)';
    $('#hist-dica').textContent = geral ? 'Visão geral: os 3 com mais ' + unidade + ' na temporada em destaque. Passe o mouse para ver o resto.' : '';
  }

  function renderHeatMeses() {
    const linhas = state.comJogos.filter(j => j.porMes.some(i => i.gols + i.assist)).sort((x, y) => y.ga - x.ga);
    Charts.heatmap($('#g-heat-meses'), {
      linhas: linhas.map(j => ({ id: j.id, nome: j.nome })),
      colunas: state.meses.map(m => ({ rotulo: curtoMes(m.mes), titulo: nomeMes(m.mes) })),
      valores: linhas.map(j => j.porMes.map(i => i.gols + i.assist)),
      unidade: ' G+A',
    });
  }

  /* ---------------- Perfil ---------------- */
  function conquistas(j) {
    const b = [];
    const top = { gols: ['⚽', 'Artilheiro'], assist: ['🎯', 'Garçom'], ga: ['👑', 'Rei do G+A'], gapj: ['⚡', 'Melhor média'], partidas: ['🏟️', 'Mais presente'], gpj: ['💥', 'Melhor média de gols'], apj: ['🧠', 'Melhor média de assist.'] };
    for (const [met, [ic, nome]] of Object.entries(top)) if (j.ranks[met] === 1) b.push(['', `${ic} ${nome}`]);
    const top3 = METRICAS.filter(m => j.ranks[m.id] > 1 && j.ranks[m.id] <= 3).map(m => m.rotulo);
    if (top3.length) b.push(['verde', `🔝 Top 3 em ${top3.join(', ')}`]);
    if (j.assist > j.gols) b.push(['verde', '🤝 Mais assiste do que marca']);
    if (j.partidas >= MIN_JOGOS && j.gpj >= 3) b.push(['verde', '🔥 3+ gols por jogo']);
    if (j.partidas >= 25) b.push(['verde', '📅 Não perde um jogo']);
    return b;
  }

  // Dados do cartão de exportação (imagem/PDF), no formato que o exportar.js desenha
  function dadosExportacao(j) {
    const temJogos = j.partidas > 0;
    const [ano, mes, dia] = state.atualizado.split('-');
    const primeiros = METRICAS.filter(m => j.ranks[m.id] === 1).map(m => m.rotulo);
    return {
      id: j.id,
      nome: j.nome,
      iniciais: iniciais(j.nome),
      foto: j.foto || null,
      temporada: state.temporada,
      sub: temJogos ? `${POSICOES[j.pos]} · ${j.ga ? Math.round(j.gols / j.ga * 100) : 0}% do G+A em gols` : 'Sem jogos registrados na temporada',
      destaque: primeiros.length ? `1º em ${primeiros.slice(0, 3).join(', ')}` : '',
      nums: [['gols', 'Gols'], ['assist', 'Assistências'], ['ga', 'G+A'], ['partidas', 'Jogos'], ['gpj', 'Gols/jogo'], ['gapj', 'G+A/jogo']]
        .map(([k, rotulo]) => ({ rotulo, valor: temJogos ? MET[k].fmt(MET[k].val(j)) : '—', pos: temJogos ? j.ranks[k] : null })),
      honrasS: HONRAS.filter(h => h.g === 's' && honra(j, h.k)).map(h => ({ ic: h.ic, nome: h.nome, n: honra(j, h.k) })),
      honrasM: HONRAS.filter(h => h.g === 'm' && honra(j, h.k)).map(h => ({ ic: h.ic, nome: h.nome, n: honra(j, h.k) })),
      meses: state.meses.map((m, i) => ({ rotulo: curtoMes(m.mes), g: j.porMes[i]?.gols || 0, a: j.porMes[i]?.assist || 0 })),
      over: j.over ? { ovr: j.over.ovr ?? null, notas: NOTAS.map(([sigla, , k]) => ({ sigla, v: j.over[k] ?? null })) } : null,
      site: location.host || 'fut-cdm.vercel.app',
      atualizado: `${dia}/${mes}/${ano}`,
    };
  }

  async function exportarPerfil(id, formato, botao) {
    const j = state.porId[id];
    if (!j || !window.Exportar) return;
    const texto = botao.textContent;
    botao.disabled = true;
    botao.textContent = 'Gerando…';
    try {
      const r = await Exportar[formato](dadosExportacao(j));
      if (r === 'baixado') toast(formato === 'pdf' ? 'PDF baixado 📄' : 'Imagem baixada 📸');
    } catch (e) {
      console.error(e);
      toast('Não foi possível gerar. Tente de novo.');
    } finally {
      botao.disabled = false;
      botao.textContent = texto;
    }
  }

  const fotoDe = id => state.porId[id]?.foto || state.cadastro?.[id]?.foto || null;

  // Convidado não está no elenco da temporada: perfil simples com os futs e os meses em que apareceu
  function abrirPerfilConvidado(id) {
    const futs = state.futs.map(f => ({ f, p: jogadoresDoFut(f).find(p => p.id === id) })).filter(x => x.p);
    const meses = state.meses.map(m => ({ m, i: m.jogadores.find(i => i.id === id) })).filter(x => x.i);
    const nome = state.cadastro?.[id]?.nome || futs[0]?.p.nome || meses[0]?.i.nome;
    if (!nome) return false;
    const foto = fotoDe(id);
    const gols = meses.reduce((t, x) => t + x.i.gols, 0), assist = meses.reduce((t, x) => t + x.i.assist, 0);
    const premios = futs.flatMap(({ f }) => Object.entries(f.resumo.premios || {}).filter(([, l]) => l.some(p => p.id === id)).map(([k]) => k));
    const contagem = premios.reduce((c, k) => ({ ...c, [k]: (c[k] || 0) + 1 }), {});
    const num = (v, r) => `<div class="perfil-num"><b class="num">${v}</b><span>${r}</span></div>`;
    $('#perfil').innerHTML = `
      <div class="perfil-cab">
        <div class="perfil-foto" aria-hidden="true">
          <span>${esc(iniciais(nome))}</span>
          ${foto ? `<img src="${esc(foto)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
        </div>
        <div class="perfil-info">
          <p class="kicker">Temporada ${state.temporada}</p>
          <h2 id="perfil-nome">${esc(nome)}</h2>
          <span class="perfil-tag">Convidado · não faz parte do elenco, então fica fora dos rankings da temporada</span>
          <div class="perfil-nums">${num(gols, 'Gols')}${num(assist, 'Assist.')}${num(gols + assist, 'G+A')}${num(futs.length, futs.length === 1 ? 'Fut no app' : 'Futs no app')}</div>
        </div>
      </div>
      <div class="perfil-grade">
        ${Object.keys(contagem).length ? `
        <article class="painel painel-largo">
          <h3>Honrarias nos futs</h3>
          <div class="estante">${Object.entries(contagem).map(([k, n]) => `<div class="trofeu"><span class="t-ic">${HON[k]?.ic || '🏅'}</span><b class="num">${n}×</b><span>${HON[k]?.nome || k}</span></div>`).join('')}</div>
        </article>` : ''}
        ${futs.length ? `
        <article class="painel painel-largo">
          <h3>Futs</h3>
          <ul class="posicoes">${futs.map(({ f, p }) => `<li><span>Fut de ${dataCurta(f.data)} · ${esc(p.time)}</span><span class="val">${p.gols}G · ${p.assist}A</span><span class="pos"></span></li>`).join('')}</ul>
        </article>` : ''}
        ${meses.length ? `
        <article class="painel painel-largo">
          <h3>Mês a mês</h3>
          <ul class="posicoes">${meses.map(({ m, i }) => `<li><span>${nomeMes(m.mes)}</span><span class="val">${i.gols}G · ${i.assist}A</span><span class="pos"></span></li>`).join('')}</ul>
        </article>` : ''}
      </div>`;
    $('#modal').hidden = false;
    document.body.classList.add('travado');
    $('.modal-caixa').scrollTop = 0;
    state.perfilId = null;
    $('.modal-fechar').focus();
    return true;
  }

  function abrirPerfil(id) {
    const j = state.porId[id];
    if (!j) return abrirPerfilConvidado(id);
    const temJogos = j.partidas > 0;
    const posicoes = METRICAS.map(m => {
      const p = j.ranks[m.id];
      return `<li><span>${m.rotulo}</span><span class="val">${temJogos ? m.fmt(m.val(j)) : '—'}</span><span class="pos ${p && p <= 3 ? 'p' + p : ''}">${ord(p)}</span></li>`;
    }).join('');
    const nums = [['gols', 'Gols'], ['assist', 'Assist.'], ['partidas', 'Jogos'], ['ga', 'G+A'], ['gpj', 'Gols/jogo'], ['gapj', 'G+A/jogo']]
      .map(([k, r]) => `<div class="perfil-num"><b class="num">${MET[k].fmt(MET[k].val(j))}</b><span>${r}</span> <em>${ord(j.ranks[k])}</em></div>`).join('');
    const trofeus = ['s', 'm'].map(g => {
      const hs = HONRAS.filter(h => h.g === g && honra(j, h.k));
      return hs.length ? `<div class="estante-grupo"><h4>${g === 's' ? 'Por fut' : 'No mês'}</h4><div class="estante">${hs.map(h =>
        `<div class="trofeu" title="${esc(h.desc)}"><span class="t-ic">${h.ic}</span><b class="num">${honra(j, h.k)}×</b><span>${h.nome}</span></div>`).join('')}</div></div>` : '';
    }).join('');
    const sub = !temJogos ? 'Sem jogos registrados na temporada'
      : `${POSICOES[j.pos]} · ${j.ga ? Math.round(j.gols / j.ga * 100) : 0}% do G+A em gols${j.partidas < MIN_JOGOS ? ` · menos de ${MIN_JOGOS} jogos, fora dos rankings de média` : ''}`;

    $('#perfil').innerHTML = `
      <div class="perfil-cab">
        <div class="perfil-foto" aria-hidden="true">
          <span>${esc(iniciais(j.nome))}</span>
          ${j.foto ? `<img src="${esc(j.foto)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
        </div>
        <div class="perfil-info">
          <p class="kicker">Temporada ${state.temporada}</p>
          <h2 id="perfil-nome">${esc(j.nome)}</h2>
          <span class="perfil-tag">${sub}</span>
          ${temJogos ? `<div class="perfil-nums">${nums}</div>` : ''}
          <div class="badges">${temJogos ? conquistas(j).map(([c, t]) => `<span class="badge ${c}">${t}</span>`).join('') : ''}</div>
          <div class="perfil-acoes">
            <a class="btn" href="#comparar/${j.id}/${(state.b && state.b !== j.id ? state.b : rival(j.id))}">⚔️ Comparar com alguém</a>
            <button class="btn" data-exportar="imagem" data-jogador="${j.id}">📸 Exportar imagem</button>
            <button class="btn" data-exportar="pdf" data-jogador="${j.id}">📄 Exportar PDF</button>
          </div>
        </div>
      </div>
      <div class="perfil-grade">
        <article class="painel painel-largo">
          <h3>Estante de troféus</h3>
          ${trofeus || '<p class="painel-desc">Ainda sem honrarias nesta temporada.</p>'}
        </article>
        ${temJogos ? `
        <article class="painel">
          <h3>Números dos jogos</h3>
          <p class="painel-desc">Calculado só com gols, assistências e jogos, em relação aos jogadores com ${MIN_JOGOS}+ jogos.</p>
          <div class="grafico" id="g-radar-perfil" style="height:300px"></div>
        </article>
        <article class="painel">
          <h3>Posição nos rankings</h3>
          <ul class="posicoes">${posicoes}</ul>
        </article>` : ''}
        ${state.meses.length && j.porMes.some(i => i.gols + i.assist) ? `
        <article class="painel painel-largo">
          <div class="mes-perfil-cab">
            <h3>Mês a mês</h3>
            <div class="seg seg-pequeno" id="seg-mes-perfil" role="group" aria-label="Métrica">
              ${[['ga', 'G+A'], ['gols', 'Gols'], ['assist', 'Assist.']].map(([k, r]) => `<button data-pm="${k}"${k === state.perfilMet ? ' class="ativo"' : ''}>${r}</button>`).join('')}
            </div>
          </div>
          <p class="painel-desc">As linhas tracejadas são a média por mês do jogador e a do Fut CDM, contando só os meses em que cada um entrou em campo.</p>
          <div class="grafico" id="g-meses-perfil" style="height:260px"></div>
        </article>` : ''}
        ${j.over ? `
        <article class="painel painel-largo painel-adms">
          <div class="adms-cab">
            <div>
              <h3>Avaliação dos adms</h3>
              <p class="painel-desc">Notas dadas pelos adms. Não vêm dos números dos jogos.</p>
            </div>
            ${j.over.ovr ? `<div class="ovr"><b class="num">${j.over.ovr}</b><span>Overall</span></div>` : ''}
          </div>
          <div class="grafico" id="g-notas-perfil" style="height:320px"></div>
        </article>` : ''}
      </div>`;
    const modal = $('#modal');
    modal.hidden = false;
    document.body.classList.add('travado');
    $('.modal-caixa').scrollTop = 0;
    if (temJogos) Charts.radar($('#g-radar-perfil'), [
      { nome: j.nome, valores: ATRIBUTOS.map(([s]) => j.attrs[s]), cor: 'acento' },
      { nome: 'Média do grupo', valores: ATRIBUTOS.map(([s]) => Math.round(state.mediaAttrs[s])), cor: 'neutro' },
    ], ATRIBUTOS);
    state.perfilId = j.id;
    desenharMesesPerfil();
    if (j.over) Charts.radar($('#g-notas-perfil'), [
      { nome: j.nome, valores: NOTAS.map(([, , k]) => j.over[k]), cor: 'acento' },
      { nome: 'Média do grupo', valores: NOTAS.map(([, , k]) => Math.round(state.mediaNotas[k])), cor: 'neutro' },
    ], NOTAS, true, { min: 70, max: 95 });
    $('.modal-fechar').focus();
  }

  // Média por mês da métrica, só nos meses em que o jogador participou (G+A > 0)
  function mediaMensal(lista, met = 'ga') {
    const val = i => met === 'ga' ? i.gols + i.assist : i[met];
    const vals = lista.flatMap(j => j.porMes.filter(i => i.gols + i.assist > 0).map(val));
    return vals.length ? vals.reduce((t, v) => t + v, 0) / vals.length : 0;
  }

  function desenharMesesPerfil() {
    const j = state.porId[state.perfilId], el = $('#g-meses-perfil');
    if (!j || !el) return;
    const met = state.perfilMet;
    Charts.barrasMes(el, {
      meses: state.meses.map(m => curtoMes(m.mes)), gols: j.porMes.map(i => i.gols), assist: j.porMes.map(i => i.assist),
      metrica: met, mediaJogador: mediaMensal([j], met), mediaGrupo: mediaMensal(state.comJogos, met),
    });
  }

  function fecharPerfil() {
    if ($('#modal').hidden) return;
    $('#modal').hidden = true;
    document.body.classList.remove('travado');
    ['g-radar-perfil', 'g-meses-perfil', 'g-notas-perfil'].forEach(Charts.descartar);
    if (location.hash.startsWith('#jogador/')) history.replaceState(null, '', location.pathname + location.search);
  }

  // começo de temporada (ninguém com o mínimo de jogos): rival entre quem já jogou, por G+A
  const rival = id => (state.regulares.filter(j => j.id !== id).sort((x, y) => y.calc - x.calc)[0]
    || state.comJogos.filter(j => j.id !== id).sort((x, y) => y.ga - x.ga || y.gols - x.gols)[0])?.id || '';

  /* ---------------- Comparar ---------------- */
  const MODOS = { numeros: 'Números', honras: 'Honrarias', notas: 'Notas dos adms' };

  function urlDuelo() {
    return `#comparar/${state.a}/${state.b}${state.modo !== 'numeros' ? '/' + state.modo : ''}`;
  }

  function definirDuelo(a, b, atualizarUrl = true, modo) {
    if (a && state.porId[a]) state.a = a;
    if (b && state.porId[b]) state.b = b;
    if (modo && MODOS[modo]) state.modo = modo;
    $('.sel-a input').value = state.a ? state.porId[state.a].nome : '';
    $('.sel-b input').value = state.b ? state.porId[state.b].nome : '';
    $$('#modos-duelo [data-modo]').forEach(x => x.classList.toggle('ativa', x.dataset.modo === state.modo));
    if (atualizarUrl && state.a && state.b) history.replaceState(null, '', urlDuelo());
    renderDuelo();
  }

  // Linha de comparação: [rótulo, valorA, valorB, fmt, máximo da escala, mínimo da escala]
  function linhasDuelo(linhas) {
    let va = 0, vb = 0;
    const html = linhas.map(([rot, a, b, fmt, max, min = 0]) => {
      const ga = a > b, gb = b > a;
      va += ga; vb += gb;
      const w = v => Math.max(0, Math.min(100, (v - min) / ((max - min) || 1) * 100));
      return `<div class="duelo-linha">
        <div class="duelo-rot">${rot}</div>
        <div class="lado a${ga ? ' vence' : ''}"><span class="v num">${fmt(a)}</span><div class="trilho"><span style="--w:${w(a)}%"></span></div></div>
        <div class="meio"></div>
        <div class="lado b${gb ? ' vence' : ''}"><div class="trilho"><span style="--w:${w(b)}%"></span></div><span class="v num">${fmt(b)}</span></div>
      </div>`;
    }).join('');
    return { html, va, vb, total: linhas.length };
  }

  function renderDuelo() {
    const el = $('#duelo');
    const A = state.porId[state.a], B = state.porId[state.b];
    if (!A || !B) { el.innerHTML = '<div class="duelo-vazio">Escolha dois jogadores para o mano a mano.</div>'; return; }
    if (A === B) { el.innerHTML = '<div class="duelo-vazio">Escolha dois jogadores diferentes 😄</div>'; return; }

    const legenda = `<div class="legenda-duelo">
        <span><i style="background:var(--s-a)"></i>${esc(A.nome)}</span>
        <span><i style="background:var(--s-b)"></i>${esc(B.nome)}</span>
      </div>`;
    let r, corpo, aviso = '', unidade;

    if (state.modo === 'numeros') {
      r = linhasDuelo(METRICAS.map(m => {
        const max = Math.max(...elegiveis(m).map(m.val));
        return [m.rotulo, chave(m, A), chave(m, B), m.fmt, max];
      }));
      unidade = 'estatísticas';
      const poucos = [A, B].filter(j => j.partidas < MIN_JOGOS).map(j => j.nome);
      if (poucos.length) aviso = `<p class="aviso">⚠️ ${esc(poucos.join(' e '))} ${poucos.length > 1 ? 'têm' : 'tem'} menos de ${MIN_JOGOS} jogos: as médias contam pouco.</p>`;
      corpo = `
        <article class="painel">
          <h3>Estatística por estatística</h3>
          <p class="painel-desc">Só números das partidas. Barras na escala do líder de cada estatística. ✓ marca quem leva.</p>
          <div class="duelo-linhas">${r.html}</div>
        </article>
        <article class="painel">
          <h3>Radar dos números</h3>
          ${legenda}
          <div class="grafico" id="g-radar-duelo" style="height:340px"></div>
        </article>`;
    } else if (state.modo === 'honras') {
      const hs = HONRAS.filter(h => honra(A, h.k) || honra(B, h.k));
      r = linhasDuelo(hs.map(h => [`${h.ic} ${h.nome} <small>${GRUPO[h.g]}</small>`, honra(A, h.k), honra(B, h.k), int,
        Math.max(...state.jogadores.map(j => honra(j, h.k)))]));
      unidade = 'honrarias';
      corpo = `
        <article class="painel painel-largo">
          <h3>Honraria por honraria</h3>
          <p class="painel-desc">Quantas vezes cada um ganhou cada prêmio na temporada. Barras na escala do recordista.</p>
          <div class="duelo-linhas">${r.html || '<p class="painel-desc">Nenhum dos dois tem honrarias ainda.</p>'}</div>
        </article>`;
    } else {
      const sem = [A, B].filter(j => !j.over?.pac).map(j => j.nome);
      if (sem.length) {
        el.innerHTML = `<div class="duelo-vazio">${esc(sem.join(' e '))} ainda não ${sem.length > 1 ? 'têm' : 'tem'} notas dos adms.</div>`;
        return;
      }
      const linhas = NOTAS.map(([, nome, k]) => [nome, A.over[k], B.over[k], int, 95, 70]);
      if (A.over.ovr && B.over.ovr) linhas.unshift(['Overall', A.over.ovr, B.over.ovr, int, 95, 70]);
      r = linhasDuelo(linhas);
      unidade = 'notas';
      aviso = '<p class="aviso">📝 Avaliação dos adms: não vem dos números dos jogos e não entra no placar de Números.</p>';
      corpo = `
        <article class="painel">
          <h3>Nota por nota</h3>
          <p class="painel-desc">Escala de 70 a 95 para destacar as diferenças.</p>
          <div class="duelo-linhas">${r.html}</div>
        </article>
        <article class="painel">
          <h3>Radar das notas</h3>
          ${legenda}
          <div class="grafico" id="g-radar-duelo" style="height:340px"></div>
        </article>`;
    }

    const txt = !r.total ? 'Sem dados para comparar'
      : r.va === r.vb ? `<b>Empate</b> em ${MODOS[state.modo].toLowerCase()}`
      : `<b>${esc((r.va > r.vb ? A : B).nome)}</b> vence em ${Math.max(r.va, r.vb)} de ${r.total} ${unidade}`;

    el.innerHTML = `
      <div class="duelo-cab">
        ${ladoDuelo(A, 'a')}
        <div class="placar">
          <div class="placar-num"><span class="a">${r.va}</span><span class="x">×</span><span class="b">${r.vb}</span></div>
          <div class="placar-txt">${txt}</div>
        </div>
        ${ladoDuelo(B, 'b')}
      </div>
      ${aviso}
      <div class="duelo-corpo">${corpo}</div>`;

    if (state.modo === 'numeros') {
      const vals = j => j.attrs ? ATRIBUTOS.map(([s]) => j.attrs[s]) : ATRIBUTOS.map(() => 45);
      Charts.radar($('#g-radar-duelo'), [
        { nome: A.nome, valores: vals(A), cor: 's-a' },
        { nome: B.nome, valores: vals(B), cor: 's-b' },
      ], ATRIBUTOS, false);
    } else if (state.modo === 'notas') {
      Charts.radar($('#g-radar-duelo'), [
        { nome: A.nome, valores: NOTAS.map(([, , k]) => A.over[k]), cor: 's-a' },
        { nome: B.nome, valores: NOTAS.map(([, , k]) => B.over[k]), cor: 's-b' },
      ], NOTAS, false, { min: 70, max: 95 });
    }
  }

  function ladoDuelo(j, lado) {
    const info = state.modo === 'notas' ? (j.over?.ovr ? `Overall ${j.over.ovr}` : 'sem overall')
      : state.modo === 'honras' ? `${totalHonras(j)} honrarias`
      : `${j.partidas} jogos · ${j.gols}G · ${j.assist}A`;
    return `<button class="duelista ${lado}" type="button" data-jogador="${j.id}" aria-label="Ver perfil de ${esc(j.nome)}">
      <span class="duelista-nome">${esc(j.nome)}</span>
      <span class="duelista-info">${info}</span>
    </button>`;
  }

  /* ---------------- Busca (autocomplete) ---------------- */
  function autocomplete(caixa, aoEscolher) {
    const input = $('input', caixa), ul = $('.sugestoes', caixa);
    let itens = [], sel = 0;
    const desenhar = () => {
      const q = norm(input.value);
      itens = state.jogadores
        .filter(j => !q || norm(j.nome).includes(q))
        .sort((x, y) => (norm(y.nome).startsWith(q) - norm(x.nome).startsWith(q)) || y.ga - x.ga || x.nome.localeCompare(y.nome, 'pt'));
      sel = 0;
      ul.innerHTML = itens.length
        ? itens.map((j, i) => `<li role="option" data-id="${j.id}" aria-selected="${i === sel}">${esc(j.nome)}<small>${j.partidas ? `${j.gols}G · ${j.assist}A` : 'sem jogos'}</small></li>`).join('')
        : '<li class="vazio">Ninguém com esse nome</li>';
      ul.classList.add('aberta');
    };
    const marcar = () => $$('li[data-id]', ul).forEach((li, i) => {
      li.setAttribute('aria-selected', i === sel);
      if (i === sel) li.scrollIntoView({ block: 'nearest' });
    });
    const escolher = id => { ul.classList.remove('aberta'); aoEscolher(id, input); };
    input.addEventListener('focus', () => { input.select(); desenhar(); });
    input.addEventListener('input', desenhar);
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, itens.length - 1); marcar(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); marcar(); e.preventDefault(); }
      else if (e.key === 'Enter' && itens[sel]) { escolher(itens[sel].id); e.preventDefault(); }
      else if (e.key === 'Escape') { ul.classList.remove('aberta'); input.blur(); }
    });
    ul.addEventListener('mousedown', e => {
      const li = e.target.closest('li[data-id]');
      if (li) { e.preventDefault(); escolher(li.dataset.id); }
    });
    input.addEventListener('blur', () => setTimeout(() => ul.classList.remove('aberta'), 120));
  }

  /* ---------------- Rotas ---------------- */
  function rota() {
    const h = decodeURIComponent(location.hash.slice(1));
    const [r, p1, p2, p3] = h.split('/');
    if (r === 'jogador') { abrirPerfil(p1); return; }
    fecharPerfil();
    if (r === 'comparar' && p1) {
      definirDuelo(p1, p2, false, p3 || 'numeros');
      $('#comparar').scrollIntoView({ behavior: 'smooth' });
    }
  }

  /* ---------------- Tema ---------------- */
  function alternarTema() {
    const escuroAgora = getComputedStyle(document.documentElement).colorScheme === 'dark';
    const novo = escuroAgora ? 'light' : 'dark';
    document.documentElement.dataset.theme = novo;
    try { localStorage.setItem('tema', novo); } catch (e) {}
    document.querySelector('meta[name="theme-color"]').content = novo === 'dark' ? '#070b09' : '#f3f5f2';
    Charts.retematizar();
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('visivel');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove('visivel'), 1800);
  }

  // Liga um grupo de botões (segmentado/abas) a uma ação
  function grupo(sel, attr, acao, classe = 'ativo') {
    $(sel).addEventListener('click', e => {
      const b = e.target.closest(`[data-${attr}]`);
      if (!b) return;
      $$(`${sel} [data-${attr}]`).forEach(x => x.classList.toggle(classe, x === b));
      acao(b.dataset[attr]);
    });
  }

  /* ---------------- Eventos ---------------- */
  function ligarEventos() {
    grupo('#abas-ranking', 'aba', v => { state.aba = v; renderAbas(); renderRanking(); }, 'ativa');
    grupo('#filtro-min', 'min', v => { state.minJogos = +v; renderRanking(); });
    grupo('#seg-fatia', 'm', v => Charts.fatia(v));
    grupo('#seg-honras', 'g', v => { state.grupoHonras = v; renderHonras(); });
    grupo('#pilulas-mes', 'mes', v => { state.mes = v; renderMeses(); }, 'ativa');
    grupo('#seg-mes-rank', 'mr', v => { state.mesMet = v; renderMeses(); });
    grupo('#pilulas-fut', 'fut', v => { state.fut = +v; renderFuts(); }, 'ativa');
    grupo('#seg-fut-rank', 'fr', v => { state.futMet = v; renderFuts(); });
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-exportar-ranking]');
      if (b) exportarRanking(b.dataset.exportarRanking, b);
    });
    grupo('#seg-corrida', 'c', v => { state.metricaCorrida = v; renderCorrida(); });
    grupo('#modos-duelo', 'modo', v => definirDuelo(null, null, true, v), 'ativa');

    // Qualquer elemento com data-jogador abre o perfil
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-jogador]');
      if (el && !el.closest('#perfil')) location.hash = `jogador/${el.dataset.jogador}`;
      if (e.target.closest('[data-fechar]')) fecharPerfil();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.dataset?.jogador && e.target.matches('li')) location.hash = `jogador/${e.target.dataset.jogador}`;
      if (e.key === 'Escape') fecharPerfil();
      if (e.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) {
        e.preventDefault(); $('#busca-global input').focus();
      }
    });

    autocomplete($('#busca-global'), (id, input) => { input.value = ''; input.blur(); location.hash = `jogador/${id}`; });
    autocomplete($('#busca-corrida'), (id, input) => {
      state.focoCorrida = id; input.value = state.porId[id].nome; input.blur(); renderCorrida();
    });
    $('#limpar-corrida').addEventListener('click', () => {
      state.focoCorrida = null; $('#busca-corrida input').value = ''; renderCorrida();
    });
    grupo('#seg-hist-modo', 'hm', v => { state.histModo = v; renderHistorico(); });
    grupo('#seg-hist-met', 'hmet', v => { state.histMet = v; renderHistorico(); });
    autocomplete($('#busca-hist'), (id, input) => {
      if (!state.histSel.includes(id) && state.histSel.length < MAX_HIST) state.histSel.push(id);
      input.value = ''; input.blur(); renderHistorico();
    });
    $('#hist-chips').addEventListener('click', e => {
      const b = e.target.closest('[data-tirar]');
      if (!b) return;
      state.histSel = state.histSel.filter(id => id !== b.dataset.tirar);
      renderHistorico();
    });
    // Alterna G+A / Gols / Assist. no mês a mês do perfil (o conteúdo do modal é recriado a cada perfil)
    $('#perfil').addEventListener('click', e => {
      const exp = e.target.closest('[data-exportar]');
      if (exp) return exportarPerfil(exp.dataset.jogador, exp.dataset.exportar, exp);
      const b = e.target.closest('[data-pm]');
      if (!b) return;
      state.perfilMet = b.dataset.pm;
      $$('#seg-mes-perfil [data-pm]').forEach(x => x.classList.toggle('ativo', x === b));
      desenharMesesPerfil();
    });
    autocomplete($('.sel-a .busca'), id => definirDuelo(id, null));
    autocomplete($('.sel-b .busca'), id => definirDuelo(null, id));
    $('#btn-inverter').addEventListener('click', () => {
      const a = state.a; state.a = state.b; state.b = a;
      definirDuelo();
    });
    $('#btn-compartilhar').addEventListener('click', async () => {
      const url = `${location.origin}${location.pathname}${urlDuelo()}`;
      try { await navigator.clipboard.writeText(url); toast('Link copiado! Manda no grupo 😎'); }
      catch { prompt('Copie o link:', url); }
    });

    $('#btn-tema').addEventListener('click', alternarTema);
    window.addEventListener('hashchange', rota);

    // Destaca a seção atual no menu
    const links = $$('.nav a');
    const obs = new IntersectionObserver(es => {
      for (const en of es) if (en.isIntersecting) links.forEach(a => a.classList.toggle('ativo', a.getAttribute('href') === '#' + en.target.id));
    }, { rootMargin: '-45% 0px -50% 0px' });
    $$('main section').forEach(s => obs.observe(s));
  }

  /* ---------------- Início ---------------- */
  async function iniciar() {
    try {
      await carregar();
    } catch (e) {
      document.querySelector('main').innerHTML = `<div class="wrap" style="padding:80px 16px"><h2>Não foi possível carregar os dados.</h2><p>Verifique a conexão e recarregue a página.</p></div>`;
      console.error(e);
      return;
    }
    renderHero();
    renderAbas();
    renderRanking();
    renderHonras();
    renderGlossario();
    renderMeses();
    renderFuts();
    // no celular "Buscar jogador…" não cabe ao lado do logo
    if (matchMedia('(max-width: 599px)').matches) $('#busca-global input').placeholder = 'Buscar…';
    if (state.meses.length) { renderCorrida(); renderHistorico(); renderHeatMeses(); }
    Charts.iniciar(state.jogadores, MIN_JOGOS);
    // Duelo inicial: os 2 melhores regulares; no começo da temporada (ninguém com o mínimo de jogos)
    // usa quem já jogou, por G+A. Com menos de 2, o comparativo fica vazio esperando a escolha.
    const top = state.regulares.length >= 2
      ? [...state.regulares].sort((x, y) => y.calc - x.calc)
      : [...state.comJogos].sort((x, y) => y.ga - x.ga || y.gols - x.gols);
    state.a = top[0]?.id ?? null;
    state.b = top[1]?.id ?? null;
    definirDuelo(null, null, false);
    ligarEventos();
    rota();
  }

  iniciar();
})();
