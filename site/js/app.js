/* Fut CDM — estado, abas (Temporada atual, Todos os dados, Futs, Comparar), perfil e rotas. */
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

  // Temporada inteira (totais oficiais) × mês atual (soma do mês, com os jogos registrados no app)
  const PERIODOS = ['temporada', 'mes'];
  const MINIMO_MES = 2;      // mínimo de jogos para entrar nas médias do mês (a temporada usa o min_jogos do banco)
  const LIMITE_LINHAS = 7;   // listas longas mostram só as primeiras linhas; "Ver todos" abre o resto

  const METRICAS = [
    { id: 'gols', rotulo: 'Gols', fmt: int, val: j => j.gols },
    { id: 'assist', rotulo: 'Assistências', fmt: int, val: j => j.assist },
    { id: 'ga', rotulo: 'G+A', fmt: int, val: j => j.ga },
    { id: 'gpj', rotulo: 'Gols/jogo', fmt: dec, val: j => j.gpj, media: true },
    { id: 'apj', rotulo: 'Assist/jogo', fmt: dec, val: j => j.apj, media: true },
    { id: 'gapj', rotulo: 'G+A/jogo', fmt: dec, val: j => j.gapj, media: true },
    { id: 'partidas', rotulo: 'Partidas', fmt: int, val: j => j.partidas, jogos: true },
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
  const hoje = new Date();
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  const listaNomes = xs => xs.length > 1 ? `${xs.slice(0, -1).join(', ')} e ${xs.at(-1)}` : xs[0] || '';

  const POSICOES = {
    ATA: 'Atacante · finalizador nato',
    SA: 'Meia-atacante · faz e serve',
    MEI: 'Meia · garçom do time',
  };

  const state = {
    temporada: null,   // a mais recente: Temporada atual, Futs e Forma sempre olham para ela
    temporadas: [],    // todas, da mais recente para a mais antiga
    bases: {},         // id da temporada (ou 'todas') -> elenco com os totais
    base: null,        // base da temporada mais recente
    recortes: {},      // recortes já montados (ver montarRecorte)
    rec: null,         // recorte aberto na aba Todos os dados
    recDuelo: null,    // recorte aberto na aba Comparar
    recPerfil: null,   // recorte do perfil aberto
    meses: [],         // meses da temporada mais recente
    abaSite: null,     // aba aberta: agora | temporada | futs | comparar
    sujas: new Set(['agora', 'temporada', 'futs', 'comparar']),   // abas que ainda não foram desenhadas
    aba: 'gols',
    abertos: new Set(),   // listas abertas com "Ver todos"
    minJogos: 10,
    grupoHonras: 's',
    mes: null,
    metricaCorrida: 'gols',
    focoCorrida: null,
    histMet: 'ga',
    histSel: [],
    perfilMet: 'ga',
    perfilId: null,
    mesMet: 'ga',      // ranking do mês: gols | assist | ga | gpj | apj | gapj
    mesesMet: 'ga',    // gráfico de meses: ga | gols | assist
    futsMet: 'ga',     // gráfico de futs: ga | gols | assist
    futs: [],          // futs encerrados (v_futs), do mais novo para o mais antigo
    fut: null,
    futMet: 'ga',
    a: null,
    b: null,
    modo: 'numeros',
  };

  /* ---------------- Dados ---------------- */
  async function carregar() {
    state.temporadas = await Db.carregarTemporadas();
    const dados = state.temporadas[0];
    state.temporada = dados.temporada;
    state.atualizado = dados.atualizado_em;
    // Mês recém-aberto e ainda vazio fica de fora: o site parte do último mês com dados
    const meses = dados.meses || [];
    state.meses = meses.slice(0, meses.findLastIndex(m => m.jogadores.some(i => i.gols + i.assist + (i.partidas || 0) > 0)) + 1);
    state.mes = state.meses.at(-1)?.mes;
    const [futs, cadastro] = await Promise.all([Promise.all(state.temporadas.map(d => Db.carregarFuts(d.temporada))), Db.carregarJogadores()]);
    state.futs = futs[0];
    state.todosFuts = futs.flat();   // Melhores times olham para a história inteira
    state.cadastro = cadastro;
    state.fut = state.futs[0]?.id ?? null;
    for (const d of state.temporadas) state.bases[d.temporada] = baseDaTemporada(d);
    state.base = state.bases[state.temporada];
    if (state.temporadas.length > 1) state.bases.todas = baseDeTodas();
    // ?temporada=2025 abre essa temporada na aba Todos os dados (sem o parâmetro: a mais recente)
    const pedido = new URLSearchParams(location.search).get('temporada');
    state.temporadaPedida = state.bases[pedido] ? pedido : null;
    selecionarTemporada(state.temporadaPedida || state.temporada);
    state.recDuelo = montarRecorte(state.temporada);
  }

  const comMedias = n => {
    const ga = n.gols + n.assist, p = n.partidas;
    return { ...n, ga, gpj: p ? n.gols / p : 0, apj: p ? n.assist / p : 0, gapj: p ? ga / p : 0 };
  };

  function baseDaTemporada(d) {
    const meses = d.meses || [];
    const jogadores = d.jogadores.map(j => ({
      ...j, ...comMedias({ partidas: j.partidas || 0, gols: j.gols, assist: j.assist, honras: j.honras }),
      // série mês a mês de cada jogador do elenco
      porMes: meses.map(m => m.jogadores.find(i => i.id === j.id) || { gols: 0, assist: 0 }),
    }));
    return {
      temporada: d.temporada, meses, minBase: d.min_jogos || 10, jogadores,
      porId: Object.fromEntries(jogadores.map(j => [j.id, j])),
      comJogos: jogadores.filter(j => j.partidas > 0),
    };
  }

  // Soma das temporadas por jogador. Começa pela mais recente: nome, foto e overall vêm dela.
  function baseDeTodas() {
    const soma = new Map();
    for (const { temporada } of state.temporadas) for (const j of state.bases[temporada].jogadores) {
      const t = soma.get(j.id);
      if (!t) { soma.set(j.id, { ...j, honras: { ...j.honras }, porMes: [] }); continue; }
      t.partidas += j.partidas; t.gols += j.gols; t.assist += j.assist;
      t.over ||= j.over; t.foto ||= j.foto;
      for (const [k, v] of Object.entries(j.honras || {})) t.honras[k] = (t.honras[k] || 0) + v;
    }
    const jogadores = [...soma.values()].map(comMedias);
    return {
      temporada: 'Todas as temporadas', meses: [], minBase: state.base.minBase, jogadores,
      porId: Object.fromEntries(jogadores.map(j => [j.id, j])),
      comJogos: jogadores.filter(j => j.partidas > 0),
    };
  }

  /* ---------------- Períodos ---------------- */
  // Índices [de, ate) dos meses do período: mês = o último mês registrado
  function faixaDoPeriodo(p) {
    const t = state.meses.length;
    return p === 'mes' ? [Math.max(0, t - 1), t] : [0, t];
  }
  const mesesDoPeriodo = p => state.meses.slice(...faixaDoPeriodo(p));
  // Meses sem nenhum jogo lançado (aba Mês do admin): sem eles não dá para calcular médias por jogo
  const mesesSemJogos = ms => ms.filter(m => !m.jogadores.some(i => i.partidas > 0));

  // Números de um jogador num período: temporada = totais oficiais; recortes = soma dos meses
  function numerosNoPeriodo(b, p) {
    if (p === 'temporada') return { partidas: b.partidas, gols: b.gols, assist: b.assist, honras: b.honras };
    const r = { partidas: 0, gols: 0, assist: 0, honras: {} };
    for (const i of b.porMes.slice(...faixaDoPeriodo(p))) {
      r.partidas += i.partidas || 0; r.gols += i.gols; r.assist += i.assist;
      for (const [k, v] of Object.entries(i.honras || {})) r.honras[k] = (r.honras[k] || 0) + v;
    }
    return r;
  }

  function rotuloPeriodo(p, longo = false) {
    const ms = mesesDoPeriodo(p);
    if (p === 'temporada' || !ms.length) return longo ? `Temporada ${state.temporada}` : 'Temporada';
    return longo ? `${nomeMes(ms[0].mes)}${ms[0].mes === mesAtual ? ' · em andamento' : ''}` : nomeMes(ms[0].mes);
  }

  // Recorte = uma visão completa dos números: uma temporada, 'todas' ou 'mes' (o último mês).
  // Cada aba guarda o seu, então trocar a temporada não mexe em Temporada atual nem em Comparar.
  function montarRecorte(chave) {
    if (state.recortes[chave]) return state.recortes[chave];
    const mes = chave === 'mes', base = mes ? state.base : state.bases[chave];
    const mesesVis = mes ? mesesDoPeriodo('mes') : base.meses;
    const semJogos = mes ? mesesSemJogos(mesesVis).map(m => nomeMes(m.mes)) : [];
    const rc = {
      chave, base, temporada: base.temporada, mesesVis, semJogos,
      semMedias: semJogos.length > 0, minPeriodo: mes ? MINIMO_MES : base.minBase,
    };
    rc.jogadores = base.jogadores.map(b => {
      const j = mes ? { ...b, ...comMedias(numerosNoPeriodo(b, 'mes')), porMes: b.porMes.slice(...faixaDoPeriodo('mes')) } : { ...b };
      // jogos de algum mês faltando: a soma de jogos ficaria errada, então nada de jogos/médias
      if (rc.semMedias) Object.assign(j, { partidas: 0, gpj: 0, apj: 0, gapj: 0 });
      return j;
    });
    rc.porId = Object.fromEntries(rc.jogadores.map(j => [j.id, j]));
    rc.comJogos = rc.jogadores.filter(j => j.partidas > 0 || j.ga > 0);
    rc.regulares = rc.comJogos.filter(j => j.partidas >= rc.minPeriodo);
    calcularRanks(rc);
    calcularAtributos(rc);
    return state.recortes[chave] = rc;
  }

  const rotuloRecorte = (rc, longo = true) => rc.chave === 'mes' ? rotuloPeriodo('mes', longo)
    : rc.chave === 'todas' ? rc.temporada : `Temporada ${rc.temporada}`;

  // Troca a temporada da aba Todos os dados; seleções de jogador só seguem se ele estiver nela
  function selecionarTemporada(chave) {
    const rc = state.rec = montarRecorte(chave);
    state.minJogos = rc.minPeriodo;
    state.histSel = state.histSel.filter(id => rc.porId[id]);
    if (!rc.porId[state.focoCorrida]) { state.focoCorrida = null; $('#busca-corrida input').value = ''; }
  }

  const precisaJogos = m => m.media || m.jogos;
  function avisoMedias(rc) {
    if (rc.semMedias) return `⏳ As médias por jogo de ${listaNomes(rc.semJogos)} aparecem assim que os jogos do mês forem registrados.`;
    if (!rc.regulares.length) return `Ninguém com ${rc.minPeriodo}+ jogos neste período ainda.`;
    return '';
  }

  // Valor usado para empate: o que aparece na tela (médias com 1 casa).
  const chave = (m, j) => m.media ? Math.round(m.val(j) * 10) / 10 : m.val(j);
  const elegiveis = (m, rc, min = rc.minPeriodo) =>
    m.adms ? rc.jogadores.filter(j => j.over?.ovr) : rc.semMedias && precisaJogos(m) ? []
      : m.media ? rc.comJogos.filter(j => j.partidas >= min) : rc.comJogos;

  // Ranking denso: "1. Roger · 2. Felps · 3. Leo e Renato · 4. ..."
  function ranquear(metrica, lista) {
    const m = MET[metrica];
    const ordem = [...lista].sort((x, y) => m.val(y) - m.val(x) || x.nome.localeCompare(y.nome, 'pt'));
    let pos = 0, ultimo = null;
    return ordem.map(j => {
      const k = chave(m, j);
      if (k !== ultimo) { pos++; ultimo = k; }
      return { j, pos, valor: m.val(j) };
    });
  }

  function calcularRanks(rc) {
    for (const j of rc.jogadores) j.ranks = {};
    for (const m of Object.values(MET)) for (const r of ranquear(m.id, elegiveis(m, rc))) r.j.ranks[m.id] = r.pos;
  }

  // Radar dos números: posição de cada um em relação aos regulares (45 a 99)
  function calcularAtributos(rc) {
    const base = rc.regulares, n = base.length;
    const media = (lista, f) => lista.reduce((t, j) => t + f(j), 0) / lista.length;
    for (const j of rc.comJogos) {
      const fatia = j.ga ? j.gols / j.ga : 0;
      j.pos = fatia >= .65 ? 'ATA' : fatia <= .5 ? 'MEI' : 'SA';
      j.attrs = null; j.calc = 0;
    }
    const comNota = rc.jogadores.filter(j => j.over?.pac);
    rc.mediaNotas = Object.fromEntries(NOTAS.map(([, , k]) => [k, media(comNota, j => j.over[k])]));
    // radar dos números só com pelo menos 2 regulares (e jogos lançados) no período
    rc.mediaAttrs = null;
    if (n < 2) return;
    for (const [sigla, , met] of ATRIBUTOS) {
      const vals = base.map(MET[met].val);
      const min = Math.min(...vals), max = Math.max(...vals);
      for (const j of rc.comJogos) {
        const v = MET[met].val(j);
        const abaixo = vals.filter(x => x < v).length;
        const iguais = vals.filter(x => x === v).length;
        const pct = Math.min(1, (abaixo + Math.max(0, iguais - 1) / 2) / (n - 1));
        const mm = Math.min(1, Math.max(0, max > min ? (v - min) / (max - min) : 1));
        (j.attrs ||= {})[sigla] = Math.round(45 + 54 * (.55 * pct + .45 * mm));
      }
    }
    for (const j of rc.comJogos) j.calc = Math.round(ATRIBUTOS.reduce((s, [sigla, , , p]) => s + j.attrs[sigla] * p, 0));
    rc.mediaAttrs = Object.fromEntries(ATRIBUTOS.map(([s]) => [s, media(base, j => j.attrs[s])]));
  }

  // Corta a lista nas primeiras linhas e atualiza o botão "Ver todos" dela
  function corte(chave, lista, total = lista.length, limite = LIMITE_LINHAS) {
    const btn = $(`[data-ver-mais="${chave}"]`), aberto = state.abertos.has(chave);
    btn.hidden = total <= limite;
    btn.textContent = aberto ? 'Ver menos' : `Ver todos (${total})`;
    btn.setAttribute('aria-expanded', aberto);
    return aberto ? lista : lista.slice(0, limite);
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

  /* ---------------- Cabeçalho e rodapé ---------------- */
  function renderCabecalho() {
    $$('[data-temporada]').forEach(el => el.textContent = state.temporada);
    $('#logo-ano').textContent = state.temporada;
    document.title = `Fut CDM ${state.temporada}`;
    const [ano, mes, dia] = state.atualizado.split('-');
    $('#atualizado').textContent = `${dia}/${mes}/${ano}`;
  }

  /* ---------------- Totais da temporada ---------------- */
  const kpisHtml = kpis => kpis.map(([v, r, f]) =>
    `<div class="kpi"><div class="kpi-valor num" data-contar="${v}" data-fmt="${f === dec ? 'dec' : 'int'}">${f(v)}</div><div class="kpi-rotulo">${r}</div></div>`).join('');

  function renderHero() {
    const rc = state.rec, todas = rc.chave === 'todas';
    $('#hero-kicker').textContent = todas ? 'Todas as temporadas · estatísticas oficiais da pelada' : `Temporada ${rc.temporada} · estatísticas oficiais da pelada`;
    $('#hero-sub').textContent = todas ? 'Os donos do Fut CDM' : 'Os donos da temporada';

    const js = rc.comJogos;
    const soma = k => js.reduce((t, j) => t + j[k], 0);
    $('#kpis').innerHTML = kpisHtml([
      [soma('gols'), 'gols marcados', int],
      [soma('assist'), 'assistências', int],
      [js.length, 'jogadores', int],
      [soma('ga') / (soma('partidas') || 1), 'G+A por jogador a cada jogo', dec],
    ]);
    contarKpis();

    const card = (ic, tit, rs, valor, un) => !rs.length ? '' : `<button class="lider" type="button" data-jogador="${rs[0].j.id}">
        <span class="lider-icone">${ic}</span>
        <span class="lider-titulo">${tit}</span>
        <span class="lider-nome">${rs.length > 3 ? `${rs.length} jogadores` : esc(nomes(rs))}</span>
        <span class="lider-valor"><b class="num">${valor}</b> ${un}</span>
      </button>`;
    const porMet = (ic, tit, met, un) => { const rs = lideresDe(ranquear(met, elegiveis(MET[met], rc))); return card(ic, tit, rs, rs[0] && MET[met].fmt(rs[0].valor), un); };
    $('#lideres').innerHTML = [
      porMet('🥅', 'Artilheiro', 'gols', 'gols'),
      porMet('🎁', 'Garçom', 'assist', 'assistências'),
      porMet('👑', 'Rei do G+A', 'ga', 'G+A'),
      porMet('⚡', 'Melhor média', 'gapj', `G+A por jogo · ${rc.minPeriodo}+ jogos`),
      porMet('🏟️', 'Mais presente', 'partidas', 'jogos'),
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

  // Detalhe cinza ao lado do nome nos rankings gerais: sempre com o número de jogos
  const jogos = j => `${j.partidas} jogo${j.partidas === 1 ? '' : 's'}`;
  const subGeral = (m, j) => m.id === 'partidas' ? '' : m.id === 'ga' ? `${j.gols}G · ${j.assist}A · ${jogos(j)}` : jogos(j);

  // Botões de mínimo de jogos: 10+, 15+, 20+ e todos
  function renderFiltroMin() {
    const b = state.rec.minPeriodo;
    $('#filtro-min .seg').innerHTML = [b, b + 5, b + 10, 1].map(n =>
      `<button data-min="${n}"${n === state.minJogos ? ' class="ativo"' : ''}>${n === 1 ? 'Todos' : n + '+'}</button>`).join('');
  }

  function renderRanking() {
    const rc = state.rec, m = MET[state.aba];
    $('#filtro-min').hidden = !m.media;
    $('#nota-adms').hidden = !m.adms;
    corte('ranking', []);
    const rs = ranquear(m.id, elegiveis(m, rc, state.minJogos));
    if (!rs.length) { $('#ranking').innerHTML = '<li class="rank-vazio">Ninguém com esse mínimo de jogos.</li>'; return; }
    const max = rs[0].valor;
    $('#ranking').innerHTML = corte('ranking', rs).map((r, i) => {
      const sub = subGeral(m, r.j) + (m.media && r.j.partidas < rc.minPeriodo ? ' · poucos jogos' : '');
      return itemRanking(r, i, max, m.fmt, sub);
    }).join('');
  }

  /* ---------------- Sala de Troféus ---------------- */
  function renderHonras() {
    const g = state.grupoHonras, rc = state.rec;
    const colunas = HONRAS.filter(h => h.g === g && rc.jogadores.some(j => honra(j, h.k)));
    const linhas = rc.jogadores.filter(j => totalHonras(j, g) > 0)
      .sort((x, y) => totalHonras(y, g) - totalHonras(x, g) || x.nome.localeCompare(y.nome, 'pt'));

    const podios = (g === 's' ? ['mvp_s', 'totw', 'gart_s'] : ['potm', 'mvp_m', 'gart_m']).map(k => ({ h: HON[k], rs: topPor(rc.jogadores, j => honra(j, k)) }));
    const maiorPodio = Math.max(...podios.map(x => x.rs.length));
    const destaques = podios.map(({ h, rs }) => {
      return `<article class="podio">
        <header><span class="podio-ic">${h.ic}</span><div><b>${h.nome}</b><small>${h.desc} · ${rs.length} jogador${rs.length === 1 ? "" : "es"}</small></div></header>
        <ol>${corte('podios', rs, maiorPodio).map(r => `<li data-pos="${r.pos}" data-jogador="${r.j.id}"><span class="p">${r.pos}º</span><span class="n">${esc(r.j.nome)}</span><span class="v num">${r.valor}×</span></li>`).join('') || '<li class="vazio">Ninguém ainda</li>'}</ol>
      </article>`;
    }).join('');
    $('#podios').innerHTML = destaques;

    const visiveis = corte('honras', linhas);
    Charts.heatmap($('#g-honras'), {
      linhas: visiveis.map(j => ({ id: j.id, nome: j.nome })),
      colunas: colunas.map(h => ({ rotulo: h.ic, titulo: `${h.nome} (${GRUPO[h.g]})` })),
      valores: visiveis.map(j => colunas.map(h => honra(j, h.k))),
      unidade: '×',
    });
    $('#legenda-honras').innerHTML = colunas.map(h => `<span><b>${h.ic}</b> ${h.nome}</span>`).join('');
  }

  function renderGlossario() {
    const item = h => `<div class="glossario-item"><span class="g-ic">${h.ic}</span><div><b>${h.nome}</b><span>${h.desc}</span></div></div>`;
    const unicos = HONRAS.filter(h => h.g === 's').concat(HON.potm);
    $('#glossario').innerHTML = unicos.map(item).join('') +
      `<p class="glossario-nota"><b>Por fut</b> vale para um fut só · <b>No mês</b> vale para o mês inteiro. MVP, Artilheiro, Garçom, Gartilheiro, Masterclass, Duplo-duplo e Top 3 existem nas duas versões.</p>`;
  }

  /* ---------------- Temporada atual: último fut e mês ---------------- */
  function renderAgora() {
    $$('[data-agora-mes]').forEach(el => { el.hidden = !state.meses.length; });
    if (state.meses.length) trocarMes(state.mes);
    else renderAgoraFut();
  }

  // Último fut do mês aberto (os futs vêm do mais novo para o mais antigo)
  const futDoMes = () => state.futs.find(f => f.data.startsWith(state.mes ?? ''));

  function renderAgoraFut() {
    const f = futDoMes(), el = $('#agora-fut');
    el.hidden = !f;
    if (!f) return;
    const P = f.resumo.premios || {};
    const times = f.resumo.times.map((t, n) => ({ ...t, n })).filter(t => t.jogadores.length).sort((a, b) => b.gols - a.gols);
    const max = times[0]?.gols || 1;
    const premio = (ic, tit, k, valor) => P[k]?.length ? `<div class="uf-premio">
        <div>
          <span class="lider-titulo">${ic} ${tit}</span>
          <span class="uf-nomes">${P[k].map(p => `<b data-jogador="${esc(p.id)}">${esc(p.nome)}</b>`).join(' & ')}</span>
        </div>
        <span class="uf-valor">${valor(P[k][0])}</span>
      </div>` : '';
    el.innerHTML = `
      <header class="uf-cab">
        <div>
          <p class="kicker">Último fut</p>
          <h3 class="uf-data">${dataCurta(f.data)}</h3>
        </div>
        <a class="btn" href="#futs">Ver o fut completo</a>
      </header>
      <div class="uf-corpo">
        <ol class="uf-times">${times.map(t => `<li class="uf-time pt-cor-${t.n}${t.gols === max ? ' lider-fut' : ''}">
          <span class="uf-nome">${esc(t.nome)}</span>
          <span class="uf-barra"><i style="width:${t.gols / max * 100}%"></i></span>
          <b class="num">${t.gols}</b>
        </li>`).join('')}</ol>
        <div class="uf-premios">
          ${premio('🥇', 'MVP', 'mvp_s', p => `<b class="num">${p.gols + p.assist}</b> G+A`)}
          ${premio('🥅', 'Artilheiro', 'art_s', p => `<b class="num">${p.gols}</b> gols`)}
          ${premio('🎁', 'Garçom', 'gar_s', p => `<b class="num">${p.assist}</b> assist.`)}
        </div>
      </div>`;
  }

  // Itens de um mês com a pessoa (elenco ou convidado) para os rankings do mês
  const itensDoMes = mes => mes.jogadores.map(i => ({
    ...(state.base.porId[i.id] || { id: i.id, nome: i.nome, convidado: true }),
    _i: { ...i, ga: i.gols + i.assist },
  }));

  // Cards de destaque de um mês; os prêmios ainda não definidos vão para o fim da faixa
  function cardsDoMes(mes) {
    const itens = itensDoMes(mes);
    const top = val => topPor(itens, p => val(p._i)).filter(r => r.pos === 1);
    const card = (ic, tit, rs, un) => `<div class="mes-card${rs.length ? '' : ' vazio'}" ${rs[0] ? `data-jogador="${rs[0].j.id}"` : ''}>
        <span class="lider-icone">${ic}</span><span class="lider-titulo">${tit}</span>
        <span class="lider-nome">${rs.length ? esc(nomes(rs)) : '—'}</span>
        <span class="lider-valor">${rs.length ? `<b class="num">${rs[0].valor}</b> ${un}` : 'ainda não definido'}</span>
      </div>`;
    const cards = [
      card('👑', 'Líder de G+A', top(i => i.ga), 'G+A'),
      card('🏆', 'POTM', top(i => i.honras?.potm || 0), ''),
      card('🥇', 'MVP do mês', top(i => i.honras?.mvp_m || 0), ''),
      card('🥅', 'Artilheiro do mês', top(i => i.gols), 'gols'),
      card('🎁', 'Garçom do mês', top(i => i.assist), 'assistências'),
    ];
    cards.sort((x, y) => x.includes(' vazio') - y.includes(' vazio'));
    return cards.join('').replace(/<b class="num">1<\/b> <\/span>/g, '<b class="num">✓</b></span>');
  }

  function trocarMes(chave) {
    state.mes = chave;
    renderMes();
    renderAgoraFut();
    renderMesesGrupo();
    renderAnalisesMes();
  }

  function renderMes() {
    const mes = state.meses.find(m => m.mes === state.mes);
    const ultimo = mes === state.meses.at(-1);
    $('#momento-mes').textContent = nomeMes(mes.mes);
    $('#agora-kicker').textContent = `${state.temporada}${mes.mes === mesAtual ? ' · em andamento' : ''}`;
    // do mais novo para o mais antigo, como os futs (no celular o mês atual fica visível sem rolar)
    $('#pilulas-mes').innerHTML = [...state.meses].reverse().map(m =>
      `<button class="aba${m.mes === state.mes ? ' ativa' : ''}" data-mes="${m.mes}">${nomeMes(m.mes)}</button>`).join('');

    const soma = k => mes.jogadores.reduce((t, i) => t + (i[k] || 0), 0);
    const futs = state.futs.filter(f => f.data.startsWith(mes.mes)).length;
    $('#kpis-mes').innerHTML = kpisHtml([
      [soma('gols'), 'gols no mês', int],
      [soma('assist'), 'assistências no mês', int],
      [mes.jogadores.filter(i => i.gols + i.assist > 0 || i.partidas > 0).length, 'jogadores', int],
      futs ? [futs, futs === 1 ? 'fut no app' : 'futs no app', int] : [soma('gols') + soma('assist'), 'G+A no mês', int],
    ]);
    contarKpis();
    $('#momento-cards').innerHTML = cardsDoMes(mes);

    // Médias por jogo só existem no mês com jogos lançados
    const temJogos = !mesesSemJogos([mes]).length;
    MEDIAS_MES.forEach(m => { $(`#seg-mes-rank [data-mr="${m}"]`).hidden = !temJogos; });
    if (!temJogos && MEDIAS_MES.includes(state.mesMet)) state.mesMet = 'ga';
    $$('#seg-mes-rank [data-mr]').forEach(b => b.classList.toggle('ativo', b.dataset.mr === state.mesMet));

    const media = MEDIAS_MES.includes(state.mesMet);
    const rs = rankingMes();
    const max = rs[0]?.valor || 1;
    const sub = i => `${i.gols}G · ${i.assist}A${media ? ` · ${i.partidas} jogos` : ''}`;
    $('#mes-ranking').innerHTML = corte('mes', rs).map((r, i) =>
      itemRanking(r, i, max, media ? dec : int, `${sub(r.j._i)}${r.j.convidado ? ' · convidado' : ''}`)).join('')
      || '<li class="rank-vazio">Ninguém pontuou nesse quesito ainda.</li>';
    $('#mes-titulo').textContent = `${ROTULO_MET[state.mesMet]} em ${nomeMes(state.mes)}`;
    $('#mes-desc').textContent = media ? `Só quem tem ${MINIMO_MES}+ jogos no mês.` : 'Todo mundo que marcou ou deu assistência no mês.';

    // Em alta / em queda compara o mês atual com a temporada: só faz sentido no último mês
    $('#painel-alta').hidden = !ultimo;
    $('#painel-mes-ranking').classList.toggle('painel-largo', !ultimo);
    if (ultimo) renderEmAlta();
  }

  function renderMesesGrupo() {
    const soma = (m, k) => m.jogadores.reduce((t, i) => t + (i[k] || 0), 0);
    const k = state.mesesMet;
    const nome = { ga: 'G+A', gols: 'gols', assist: 'assistências' }[k];
    const media = state.meses.reduce((t, m) => t + (k === 'ga' ? soma(m, 'gols') + soma(m, 'assist') : soma(m, k)), 0) / state.meses.length;
    $('#meses-grupo-desc').textContent = `O mês aberto fica em destaque, e a linha é a média de ${dec(media)} ${nome} por mês. Clique em uma barra para abrir outro mês.`;
    Charts.barrasGA($('#g-meses-grupo'), {
      metrica: k,
      itens: state.meses.map(m => ({ rotulo: curtoMes(m.mes), nome: nomeMes(m.mes), gols: soma(m, 'gols'), assist: soma(m, 'assist') })),
      ativo: state.meses.findIndex(m => m.mes === state.mes),
    }, p => { if (state.meses[p.dataIndex]) trocarMes(state.meses[p.dataIndex].mes); });
  }

  // Finalizador × Garçom e Presença × Rendimento do mês aberto; sem jogos lançados, os painéis somem
  function renderAnalisesMes() {
    const mes = state.meses.find(m => m.mes === state.mes);
    const regs = itensDoMes(mes).filter(p => p._i.partidas >= MINIMO_MES).map(p => ({
      id: p.id, nome: p.nome, ...comMedias({ partidas: p._i.partidas, gols: p._i.gols, assist: p._i.assist }),
    }));
    $$('[data-mes-analise]').forEach(el => { el.hidden = !regs.length; });
    if (regs.length) Charts.analises($('#g-perfil-mes'), $('#g-presenca-mes'), regs);
  }

  const ROTULO_MET = { ga: 'G+A', gols: 'Gols', assist: 'Assistências', gpj: 'Gols/jogo', apj: 'Assist/jogo', gapj: 'G+A/jogo' };
  const MEDIAS_MES = ['gpj', 'apj', 'gapj'];

  // Ranking do mês aberto na métrica escolhida (totais, ou médias por jogo com o mínimo de jogos)
  function rankingMes() {
    const mes = state.meses.find(m => m.mes === state.mes);
    if (!mes) return [];
    const porJogo = (v, i) => i.partidas >= MINIMO_MES ? Math.round(v / i.partidas * 10) / 10 : 0;
    return topPor(itensDoMes(mes).map(p => ({
      ...p, _i: { ...p._i, gpj: porJogo(p._i.gols, p._i), apj: porJogo(p._i.assist, p._i), gapj: porJogo(p._i.ga, p._i) },
    })), p => p._i[state.mesMet]);
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
    return topPor(jogadoresDoFut(f).map(p => ({ ...(state.base.porId[p.id] || { id: p.id, nome: p.nome, convidado: true }), _i: p })), x => x._i[state.futMet]);
  }

  function placarDoFut(r) {
    const times = r.times.filter(t => t.jogadores.length);
    const maxGols = Math.max(...times.map(t => t.gols));
    return [...times].sort((a, b) => b.gols - a.gols).map(t =>
      `<div class="fut-time-placar${t.gols === maxGols ? ' vencedor' : ''}"><span>${esc(t.nome)}</span><b class="num">${t.gols}</b></div>`).join('');
  }

  // Pódio com os times que mais fizeram gols em um fut, de todas as temporadas
  function renderMelhoresTimes() {
    const times = state.todosFuts.flatMap(f => f.resumo.times.filter(t => t.jogadores.length).map(t => ({
      ...t, data: f.data, fut: f.id, assist: t.jogadores.reduce((s, p) => s + p.assist, 0),
    }))).sort((a, b) => b.gols - a.gols || b.assist - a.assist || b.data.localeCompare(a.data)).slice(0, 3);
    $('#bloco-melhores').hidden = !times.length;
    const jogador = p => `<li data-jogador="${esc(p.id)}" tabindex="0">
        <span class="mt-foto"><span>${esc(iniciais(p.nome))}</span>${fotoDe(p.id) ? `<img src="${esc(fotoDe(p.id))}" alt="" loading="lazy" onerror="this.remove()">` : ''}</span>
        <span class="mt-nome">${esc(p.nome)}</span>
        <small>${p.gols}G · ${p.assist}A</small>
      </li>`;
    // A aba só abre futs da temporada atual: time de temporada antiga fica sem o clique
    const abreFut = t => state.futs.some(f => f.id === t.fut);
    $('#melhores-times').innerHTML = times.map((t, i) => `<li class="mt-card" data-pos="${i + 1}"${abreFut(t) ? ` data-abrir-fut="${t.fut}" tabindex="0" title="Ver este fut"` : ''}>
        <div class="mt-cab">
          <span class="mt-medalha">${['🥇', '🥈', '🥉'][i]}</span>
          <div>
            <span class="mt-lugar">${i + 1}º lugar</span>
            <span class="mt-time">${esc(t.nome)} · ${t.data.split('-').reverse().join('/')}</span>
          </div>
          <span class="mt-gols"><b class="num">${t.gols}</b> gols</span>
        </div>
        <ul class="mt-jogadores">${[...t.jogadores].sort((a, b) => b.gols + b.assist - a.gols - a.assist).map(jogador).join('')}</ul>
        ${abreFut(t) ? '<span class="mt-ver">Ver este fut ↓</span>' : ''}
      </li>`).join('');
  }

  // Clicar no time abre o fut daquele dia logo abaixo; clicar na foto continua abrindo o perfil
  function abrirFutDoTime(e) {
    const card = e.target.closest('[data-abrir-fut]');
    if (!card || e.target.closest('[data-jogador]')) return;
    state.fut = +card.dataset.abrirFut;
    renderFuts();
    $('#fut-a-fut').scrollIntoView({ behavior: 'instant' });
  }

  // Até n futs: os mais recentes, ou os vizinhos quando o aberto é mais antigo
  function janelaDeFuts(lista, i, n = 12) {
    const inicio = i >= lista.length - n ? Math.max(0, lista.length - n) : Math.max(0, i - Math.floor(n / 2));
    return lista.slice(inicio, inicio + n);
  }

  const timesDoFut = f => f.resumo.times.map((t, n) => ({ ...t, n })).filter(t => t.jogadores.length).sort((a, b) => b.gols - a.gols);
  const assistDoTime = t => t.jogadores.reduce((s, p) => s + p.assist, 0);

  function renderGraficosDoFut(f) {
    const times = timesDoFut(f);
    const pontuaram = t => t.jogadores.filter(p => p.gols + p.assist > 0);
    const zerados = times.reduce((s, t) => s + t.jogadores.length - pontuaram(t).length, 0);
    $('#fut-dispersao-desc').textContent = `Gols contra assistências de cada um neste fut. As linhas tracejadas são a média de quem pontuou.${zerados ? ` ${zerados === 1 ? '1 jogador zerado fica' : `${zerados} jogadores zerados ficam`} de fora.` : ''}`;
    Charts.futDispersao($('#g-fut-dispersao'), { times: times.map(t => ({ nome: t.nome, n: t.n, jogadores: pontuaram(t) })) });
    Charts.golsPorTime($('#g-gols-time'), {
      times: times.map(t => ({ nome: t.nome, n: t.n, gols: t.gols, jogadores: t.jogadores.filter(p => p.gols).sort((a, b) => b.gols - a.gols) })).filter(t => t.jogadores.length),
    });
    const timesGA = times.map(t => ({ nome: t.nome, gols: t.gols, assist: assistDoTime(t), assistidos: t.gols ? Math.min(100, Math.round(assistDoTime(t) / t.gols * 100)) : 0 }));
    const ex = timesGA[0];
    $('#times-ga-desc').textContent = `O % é a parte dos gols que teve assistência: ${ex.nome} fez ${ex.gols} gols e deu ${ex.assist} assistências, ou ${ex.assistidos}%. Quanto maior, mais coletivo foi o time.`;
    Charts.timesGA($('#g-times-ga'), { times: timesGA });
  }

  const futsEmOrdem = () => [...state.futs].reverse();
  const abrirFutDoGrafico = janela => p => { if (janela[p.dataIndex]) { state.fut = janela[p.dataIndex].id; renderFuts(); } };

  // Blocos que olham para todos os futs: precisam de 2 ou mais para ter o que comparar
  function renderTemporadaFutAFut() {
    const lista = futsEmOrdem(), f = futAtual();
    $('#bloco-temporada-futs').hidden = lista.length < 2;
    if (lista.length < 2) return;
    renderBarrasFuts();
    const janela = janelaDeFuts(lista, lista.indexOf(f));
    Charts.equilibrio($('#g-equilibrio'), {
      futs: janela.map(x => {
        const times = timesDoFut(x);
        return { rotulo: dataCurta(x.data), nome: `Fut de ${dataCurta(x.data)}`, maior: times[0], menor: times.at(-1), ativo: x === f };
      }),
    }, abrirFutDoGrafico(janela));
    renderJogadorFut();
  }

  function renderBarrasFuts() {
    const lista = futsEmOrdem(), f = futAtual(), k = state.futsMet;
    const numeros = x => {
      const times = x.resumo.times.filter(t => t.jogadores.length);
      return { rotulo: dataCurta(x.data), nome: `Fut de ${dataCurta(x.data)}`, gols: times.reduce((s, t) => s + t.gols, 0), assist: times.reduce((s, t) => s + assistDoTime(t), 0) };
    };
    const valor = n => k === 'ga' ? n.gols + n.assist : n[k];
    const media = lista.reduce((s, x) => s + valor(numeros(x)), 0) / lista.length;
    const janela = janelaDeFuts(lista, lista.indexOf(f));
    const nome = { ga: 'G+A', gols: 'gols', assist: 'assistências' }[k];
    $('#ga-futs-desc').textContent = `${lista.length > 12 ? 'Até 12 futs perto do aberto, que' : 'O fut aberto'} fica em destaque, e a linha é a média de ${dec(media)} ${nome} por fut na temporada. Clique em uma barra para abrir o fut.`;
    Charts.barrasGA($('#g-ga-futs'), { itens: janela.map(numeros), ativo: janela.indexOf(f), metrica: k, media }, abrirFutDoGrafico(janela));
  }

  // Jogadores com mais G+A nos futs, nas colunas dos futs perto do aberto (no celular cabem menos colunas)
  function renderJogadorFut() {
    const lista = futsEmOrdem();
    const janela = janelaDeFuts(lista, lista.indexOf(futAtual()), window.innerWidth < 600 ? 6 : 12);
    const porId = {};
    for (const x of lista) for (const p of jogadoresDoFut(x)) {
      const j = porId[p.id] ||= { id: p.id, nome: p.nome, ga: 0, futs: {} };
      j.ga += p.ga;
      j.futs[x.id] = p.ga;
    }
    const ordem = Object.values(porId).sort((a, b) => b.ga - a.ga || a.nome.localeCompare(b.nome));
    const linhas = corte('jogfut', ordem, ordem.length, 12);
    Charts.heatmap($('#g-jogador-fut'), {
      linhas: linhas.map(j => ({ id: j.id, nome: j.nome })),
      colunas: janela.map(x => ({ rotulo: dataCurta(x.data), titulo: `Fut de ${dataCurta(x.data)}` })),
      valores: linhas.map(j => janela.map(x => j.futs[x.id] ?? null)),
      unidade: ' G+A', zeroConta: true,
    });
  }

  function renderFuts() {
    const secao = $('#futs');
    secao.hidden = !state.futs.length;
    $$('.nav a[href="#futs"]').forEach(a => { a.hidden = !state.futs.length; });
    if (!state.futs.length) return;
    const f = futAtual();
    // Os gráficos só mudam quando troca o fut (não a cada troca de métrica do ranking)
    if (state.futDesenhado !== f.id) {
      state.futDesenhado = f.id;
      renderGraficosDoFut(f);
      renderTemporadaFutAFut();
    }
    // Mês primeiro, depois só os futs dele: a lista não cresce junto com a temporada
    const mesDoFut = f.data.slice(0, 7);
    $('#pilulas-fut-mes').innerHTML = [...new Set(state.futs.map(x => x.data.slice(0, 7)))].map(m =>
      `<button class="aba${m === mesDoFut ? ' ativa' : ''}" data-mesfut="${m}">${nomeMes(m)}</button>`).join('');
    $('#pilulas-fut').innerHTML = state.futs.filter(x => x.data.startsWith(mesDoFut)).map(x =>
      `<button class="${x.id === state.fut ? 'ativo' : ''}" data-fut="${x.id}">${dataCurta(x.data)}</button>`).join('');

    const r = f.resumo, P = r.premios || {};
    const times = r.times.map((t, i) => ({ ...t, n: i })).filter(t => t.jogadores.length);
    $('#fut-placar').innerHTML = placarDoFut(r);

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
    $('#fut-ranking').innerHTML = corte('fut', rs).map((x, i) =>
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
    let titulo, subtitulo, arquivo, lista, temporada = state.temporada, recorte = '';
    const item = (j, pos, valor, sub) => ({ pos, nome: j.nome, iniciais: iniciais(j.nome), foto: fotoDe(j.id), valor, sub });
    if (qual === 'geral') {
      const m = MET[state.aba], rc = state.rec;
      lista = ranquear(m.id, elegiveis(m, rc, state.minJogos)).slice(0, 10)
        .map(r => item(r.j, r.pos, m.fmt(r.valor), subGeral(m, r.j)));
      titulo = `Top 10 · ${m.rotulo}`;
      subtitulo = m.media ? `${rotuloRecorte(rc)} · mínimo de ${state.minJogos} jogos` : rotuloRecorte(rc);
      arquivo = m.id;
      temporada = rc.temporada;
      if (rc.chave === 'todas') recorte = rc.temporada;
    } else if (qual === 'mes') {
      const media = MEDIAS_MES.includes(state.mesMet);
      lista = rankingMes().slice(0, 10).map(r => item(r.j, r.pos, media ? dec(r.valor) : String(r.valor), `${r.j._i.gols}G · ${r.j._i.assist}A${media ? ` · ${r.j._i.partidas} jogos` : ''}`));
      titulo = `${ROTULO_MET[state.mesMet]} · ${nomeMes(state.mes)}`;
      subtitulo = `Top 10 do mês · temporada ${state.temporada}${media ? ` · mínimo de ${MINIMO_MES} jogos` : ''}`;
      arquivo = `${state.mes}-${state.mesMet}`;
    } else {
      const f = futAtual();
      lista = rankingFut().slice(0, 10).map(r => item(r.j, r.pos, String(r.valor), `${r.j._i.gols}G · ${r.j._i.assist}A · ${r.j._i.time}`));
      titulo = `${ROTULO_MET[state.futMet]} · fut de ${dataCurta(f.data)}`;
      subtitulo = `Top 10 do fut · temporada ${state.temporada}`;
      arquivo = `fut-${f.data}-${state.futMet}`;
    }
    if (!lista.length) return toast('Nada para exportar ainda.');
    await gerarArte(botao, dadosDaArte => Exportar.ranking({ ...dadosDaArte, titulo, subtitulo, arquivo, itens: lista, temporada, recorte }));
  }

  // Assunto do gráfico na arte: mês, fut, temporada, jogador ou duelo, conforme onde ele está
  function contextoDoGrafico(el) {
    const f = futAtual(), [rota, id] = location.hash.slice(1).split('/');
    const nome = i => (state.base.porId[i] || state.cadastro?.[i])?.nome;
    if (el.closest('#aba-comparar') && rota === 'comparar') return { subtitulo: `${nome(state.a)} × ${nome(state.b)}`, sufixo: `${state.a}-${state.b}` };
    if (rota === 'jogador') return { subtitulo: nome(decodeURIComponent(id)), sufixo: id };
    if (el.closest('[data-arte-temporada]')) return { subtitulo: `Temporada ${state.temporada}`, sufixo: state.temporada };
    if (el.closest('#aba-futs')) return { subtitulo: `Fut de ${dataCurta(f.data)}`, sufixo: f.data };
    if (el.closest('#aba-agora')) return { subtitulo: nomeMes(state.mes), sufixo: state.mes };
    return { subtitulo: rotuloRecorte(state.rec), sufixo: state.rec.chave };
  }

  async function exportarGrafico(id, botao) {
    if (!window.Exportar) return;
    const el = $(`#${id}`), painel = el.closest('.painel');
    const { subtitulo, sufixo } = contextoDoGrafico(el);
    const metrica = painel?.querySelector('.seg .ativo')?.textContent;
    await gerarArte(botao, dadosDaArte => Exportar.grafico({
      ...dadosDaArte,
      titulo: painel?.querySelector('h3')?.textContent || 'Gráfico',
      subtitulo: metrica ? `${metrica} · ${subtitulo}` : subtitulo,
      temporada: state.temporada,
      arquivo: `${id.replace(/^g-/, '')}-${sufixo}`,
      desenhar: () => Charts.canvasDoGrafico(id),
    }));
  }

  async function gerarArte(botao, gerar) {
    const [ano, mes, dia] = state.atualizado.split('-');
    const texto = botao.textContent;
    botao.disabled = true;
    botao.textContent = 'Gerando…';
    try {
      const r = await gerar({ site: location.host || 'fut-cdm.vercel.app', atualizado: `${dia}/${mes}/${ano}` });
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
    const k = state.metricaCorrida, rc = state.rec;
    const val = i => k === 'ga' ? i.gols + i.assist : i[k];
    const series = rc.comJogos.filter(j => j.porMes.some(i => val(i) > 0)).map(j => {
      let acc = 0;
      return { id: j.id, nome: j.nome, valores: j.porMes.map(i => (acc += val(i))) };
    });
    const foco = state.focoCorrida;
    Charts.corrida($('#g-corrida'), { meses: rc.mesesVis.map(m => curtoMes(m.mes)), series, foco });

    // Resumo de quem está em destaque: total acumulado e posição na corrida
    const info = $('#corrida-info');
    const j = foco && rc.porId[foco];
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
    const k = state.histMet, rc = state.rec;
    const val = i => k === 'ga' ? i.gols + i.assist : i[k];
    const unidade = { gols: 'gols', assist: 'assist.', ga: 'G+A' }[k];
    // posição de cada id em cada mês (convidados contam na classificação do mês)
    const posMes = rc.mesesVis.map(m => {
      const rs = topPor(m.jogadores.map(i => ({ id: i.id, nome: i.nome || '', i })), x => val(x.i));
      return Object.fromEntries(rs.map(r => [r.j.id, r.pos]));
    });
    const series = rc.comJogos.filter(j => j.porMes.some(i => val(i) > 0)).map(j => ({
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
    Charts.historico($('#g-historico'), { meses: rc.mesesVis.map(m => curtoMes(m.mes)), series, destaques, unidade });

    $('#hist-chips').innerHTML = state.histSel.map((id, n) => {
      const e = Charts.ESTILOS[n];
      return `<span class="chip" style="--c:var(--${e.cor})"><i class="${Array.isArray(e.tipo) ? 'tracejado' : ''}"></i>${esc(rc.porId[id].nome)}<button type="button" data-tirar="${id}" aria-label="Tirar ${esc(rc.porId[id].nome)}">×</button></span>`;
    }).join('');
    const cheio = state.histSel.length >= MAX_HIST;
    const input = $('#busca-hist input');
    input.disabled = cheio;
    input.placeholder = cheio ? `Máximo de ${MAX_HIST} jogadores` : state.histSel.length ? '＋ Comparar com mais alguém' : '＋ Escolha você (ou quem quiser)';
    $('#hist-dica').textContent = geral ? 'Visão geral: os 3 com mais ' + unidade + ' na temporada em destaque. Passe o mouse para ver o resto.' : '';
  }

  function renderHeatMeses() {
    const rc = state.rec;
    const linhas = corte('heat', rc.comJogos.filter(j => j.porMes.some(i => i.gols + i.assist)).sort((x, y) => y.ga - x.ga));
    Charts.heatmap($('#g-heat-meses'), {
      linhas: linhas.map(j => ({ id: j.id, nome: j.nome })),
      colunas: rc.mesesVis.map(m => ({ rotulo: curtoMes(m.mes), titulo: nomeMes(m.mes) })),
      valores: linhas.map(j => j.porMes.map(i => i.gols + i.assist)),
      unidade: ' G+A',
    });
  }

  /* ---------------- Aba Todos os dados ---------------- */
  function renderTemporada() {
    renderSeletorTemporada();
    renderHero();
    renderFiltroMin();
    renderAbas();
    renderRanking();
    renderHonras();
    renderEvolucao();
    renderAnalises();
  }

  // Só com 2 ou mais temporadas: com uma só, "Todas" repetiria a mesma coisa
  function renderSeletorTemporada() {
    const seg = $('#seg-temporada'), varias = state.temporadas.length > 1;
    seg.hidden = !varias;
    if (varias) seg.innerHTML = [...state.temporadas.map(t => [t.temporada, t.temporada]), ['todas', 'Todas']].map(([k, r]) =>
      `<button data-t="${esc(k)}"${k === state.rec.chave ? ' class="ativo"' : ''}>${esc(r)}</button>`).join('');
    $$('[data-rotulo-temporada]').forEach(el => { el.textContent = rotuloRecorte(state.rec); });
  }

  function trocarTemporada(chave) {
    selecionarTemporada(chave);
    const url = new URL(location.href);
    if (chave === state.temporada) url.searchParams.delete('temporada'); else url.searchParams.set('temporada', chave);
    history.replaceState(null, '', url);
    renderTemporada();
  }

  // Evolução mês a mês: com 1 mês só não diz nada; em "Todas" fica de fora nesta versão
  function renderEvolucao() {
    const serie = state.rec.mesesVis.length > 1;
    $('#evolucao').hidden = !serie;
    $('.subnav a[href="#evolucao"]').hidden = !serie;
    if (serie) { renderCorrida(); renderHistorico(); renderHeatMeses(); }
  }

  // Finalizador × Garçom e Presença × Rendimento dependem de jogos: sem eles, aviso no lugar do gráfico
  function renderAnalises() {
    const aviso = avisoMedias(state.rec);
    $$('[data-aviso-medias]').forEach(el => { el.hidden = !aviso; el.textContent = aviso; });
    ['#g-perfil', '#g-presenca'].forEach(s => { $(s).hidden = !!aviso; });
    if (!aviso) Charts.analises($('#g-perfil'), $('#g-presenca'), state.rec.regulares);
  }

  // Em alta / em queda: G+A por jogo no mês atual contra a média da temporada de cada um.
  // Precisa dos jogos do mês (registrados pelas partidas do app ou lançados na aba Mês).
  function renderEmAlta() {
    const p = 'mes', min = MINIMO_MES;
    const box = $('#momento-alta');
    if (mesesSemJogos(mesesDoPeriodo(p)).length) {
      $('#alta-desc').textContent = `Aparece assim que os jogos de ${rotuloPeriodo(p)} forem registrados.`;
      box.innerHTML = '';
      return;
    }
    const unidade = 'G+A/jogo';
    $('#alta-desc').textContent = `${rotuloPeriodo(p, true)} contra a média da temporada de cada um, em ${unidade}. Só quem tem ${min}+ jogos no mês.`;
    const itens = state.base.comJogos.map(b => {
      const n = comMedias(numerosNoPeriodo(b, p));
      return n.partidas >= min && b.partidas >= state.base.minBase ? { b, antes: b.gapj, agora: n.gapj, d: n.gapj - b.gapj } : null;
    }).filter(Boolean);
    const lista = (xs, cls) => xs.length ? xs.map(x => `<li data-jogador="${x.b.id}" tabindex="0">
        <span class="alta-nome">${esc(x.b.nome)}<small>${dec(x.antes)} → ${dec(x.agora)} ${unidade}</small></span>
        <b class="seta ${cls}">${x.d > 0 ? '↑ +' : '↓ '}${dec(x.d)}</b>
      </li>`).join('') : '<li class="vazio">Ninguém por aqui</li>';
    const sobe = itens.filter(x => x.d >= .05).sort((a, b) => b.d - a.d).slice(0, 5);
    const desce = itens.filter(x => x.d <= -.05).sort((a, b) => a.d - b.d).slice(0, 5);
    box.innerHTML = `
      <div class="alta-col"><h4>🔥 Em alta</h4><ol>${lista(sobe, 'sobe')}</ol></div>
      <div class="alta-col"><h4>🧊 Em queda</h4><ol>${lista(desce, 'desce')}</ol></div>`;
  }

  /* ---------------- Perfil ---------------- */
  function conquistas(j, rc) {
    const b = [];
    const top = { gols: ['🥅', 'Artilheiro'], assist: ['🎁', 'Garçom'], ga: ['👑', 'Rei do G+A'], gapj: ['⚡', 'Melhor média'], partidas: ['🏟️', 'Mais presente'], gpj: ['💥', 'Melhor média de gols'], apj: ['🧠', 'Melhor média de assist.'] };
    for (const [met, [ic, nome]] of Object.entries(top)) if (j.ranks[met] === 1) b.push(['', `${ic} ${nome}`]);
    const top3 = METRICAS.filter(m => j.ranks[m.id] > 1 && j.ranks[m.id] <= 3).map(m => m.rotulo);
    if (top3.length) b.push(['verde', `🔝 Top 3 em ${top3.join(', ')}`]);
    if (j.assist > j.gols) b.push(['verde', '🤝 Mais assiste do que marca']);
    if (j.partidas >= rc.minPeriodo && j.gpj >= 3) b.push(['verde', '🔥 3+ gols por jogo']);
    if (j.partidas >= 25) b.push(['verde', '📅 Não perde um jogo']);
    return b;
  }

  // Dados do cartão de exportação (imagem/PDF), no formato que o exportar.js desenha
  function dadosExportacao(j) {
    const rc = state.recPerfil, temJogos = j.partidas > 0 || j.ga > 0;
    const [ano, mes, dia] = state.atualizado.split('-');
    const primeiros = METRICAS.filter(m => j.ranks[m.id] === 1).map(m => m.rotulo);
    return {
      id: j.id,
      nome: j.nome,
      iniciais: iniciais(j.nome),
      foto: j.foto || null,
      temporada: rc.temporada,
      sub: temJogos ? `${POSICOES[j.pos]} · ${j.ga ? Math.round(j.gols / j.ga * 100) : 0}% do G+A em gols` : 'Sem jogos registrados na temporada',
      destaque: primeiros.length ? `1º em ${primeiros.slice(0, 3).join(', ')}` : '',
      nums: [['gols', 'Gols'], ['assist', 'Assistências'], ['ga', 'G+A'], ['partidas', 'Jogos'], ['gpj', 'Gols/jogo'], ['gapj', 'G+A/jogo']]
        .map(([k, rotulo]) => ({ rotulo, valor: temJogos ? MET[k].fmt(MET[k].val(j)) : '—', pos: temJogos ? j.ranks[k] : null })),
      recorte: '',
      honrasS: HONRAS.filter(h => h.g === 's' && honra(j, h.k)).map(h => ({ ic: h.ic, nome: h.nome, n: honra(j, h.k) })),
      honrasM: HONRAS.filter(h => h.g === 'm' && honra(j, h.k)).map(h => ({ ic: h.ic, nome: h.nome, n: honra(j, h.k) })),
      meses: rc.base.meses.map((m, i) => { const x = rc.base.porId[j.id].porMes[i]; return { rotulo: curtoMes(m.mes), g: x?.gols || 0, a: x?.assist || 0 }; }),
      over: j.over ? { ovr: j.over.ovr ?? null, notas: NOTAS.map(([sigla, , k]) => ({ sigla, v: j.over[k] ?? null })) } : null,
      site: location.host || 'fut-cdm.vercel.app',
      atualizado: `${dia}/${mes}/${ano}`,
    };
  }

  async function exportarPerfil(id, formato, botao) {
    const j = state.recPerfil?.porId[id];
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

  const fotoDe = id => state.base.porId[id]?.foto || state.cadastro?.[id]?.foto || null;

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

  // O perfil mostra a temporada aberta na aba Todos os dados; em "Todas", a temporada mais recente do jogador
  function recorteDoPerfil(id) {
    if (state.rec.chave !== 'todas' && state.rec.porId[id]) return state.rec;
    const t = state.temporadas.find(({ temporada }) => state.bases[temporada].porId[id]);
    return t ? montarRecorte(t.temporada) : null;
  }

  function abrirPerfil(id) {
    const rc = recorteDoPerfil(id);
    if (!rc) return abrirPerfilConvidado(id);
    state.recPerfil = rc;
    const j = rc.porId[id], b = rc.base.porId[id], meses = rc.base.meses;
    const temJogos = j.partidas > 0 || j.ga > 0;
    const mostra = m => temJogos ? m.fmt(m.val(j)) : '—';
    const nums = [['partidas', 'Jogos'], ['gols', 'Gols'], ['assist', 'Assist.'], ['ga', 'G+A'], ['gpj', 'Gols/jogo'], ['apj', 'Assist/jogo'], ['gapj', 'G+A/jogo']]
      .map(([k, r]) => `<div class="perfil-num"><b class="num">${mostra(MET[k])}</b><span>${r}</span> <em>${ord(j.ranks[k])}</em></div>`).join('');
    const trofeus = ['s', 'm'].map(g => {
      const hs = HONRAS.filter(h => h.g === g && honra(j, h.k));
      return hs.length ? `<div class="estante-grupo"><h4>${g === 's' ? 'Por fut' : 'No mês'}</h4><div class="estante">${hs.map(h =>
        `<div class="trofeu" title="${esc(h.desc)}"><span class="t-ic">${h.ic}</span><b class="num">${honra(j, h.k)}×</b><span>${h.nome}</span></div>`).join('')}</div></div>` : '';
    }).join('');
    const sub = !temJogos ? 'Sem jogos registrados na temporada'
      : `${POSICOES[j.pos]} · ${j.ga ? Math.round(j.gols / j.ga * 100) : 0}% do G+A em gols${j.partidas < rc.minPeriodo ? ` · menos de ${rc.minPeriodo} jogos, fora dos rankings de média` : ''}`;

    $('#perfil').innerHTML = `
      <div class="perfil-cab">
        <div class="perfil-foto" aria-hidden="true">
          <span>${esc(iniciais(j.nome))}</span>
          ${j.foto ? `<img src="${esc(j.foto)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
        </div>
        <div class="perfil-info">
          <p class="kicker">${esc(rotuloRecorte(rc))}</p>
          <h2 id="perfil-nome">${esc(j.nome)}</h2>
          <span class="perfil-tag">${sub}</span>
          ${temJogos ? `<div class="perfil-nums">${nums}</div>` : ''}
          <div class="badges">${temJogos ? conquistas(j, rc).map(([c, t]) => `<span class="badge ${c}">${t}</span>`).join('') : ''}</div>
          <div class="perfil-acoes">
            <a class="btn" href="#comparar/${j.id}/${(state.b && state.b !== j.id ? state.b : rival(j.id))}">⚔️ Comparar com alguém</a>
            <button class="btn" data-exportar="imagem" data-jogador="${j.id}">📸 Exportar imagem</button>
            <button class="btn" data-exportar="pdf" data-jogador="${j.id}">📄 Exportar PDF</button>
          </div>
        </div>
      </div>
      <div class="perfil-grade">
        ${rc.base === state.base && state.meses.length && b.ga ? formaHtml(b) : ''}
        ${porTemporadaHtml(id)}
        <article class="painel painel-largo">
          <h3>Estante de troféus</h3>
          ${trofeus || '<p class="painel-desc">Ainda sem honrarias nesta temporada.</p>'}
        </article>
        ${temJogos && j.attrs ? `
        <article class="painel painel-largo">
          <h3>Números dos jogos</h3>
          <p class="painel-desc">Calculado só com gols, assistências e jogos, em relação aos jogadores com ${rc.minPeriodo}+ jogos na temporada.</p>
          <div class="grafico" id="g-radar-perfil" style="height:300px"></div>
        </article>` : ''}
        ${meses.length && b.porMes.some(i => i.gols + i.assist) ? `
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
    if (temJogos && j.attrs) Charts.radar($('#g-radar-perfil'), [
      { nome: j.nome, valores: ATRIBUTOS.map(([s]) => j.attrs[s]), cor: 'acento' },
      { nome: 'Média do grupo', valores: ATRIBUTOS.map(([s]) => Math.round(rc.mediaAttrs[s])), cor: 'neutro' },
    ], ATRIBUTOS);
    state.perfilId = j.id;
    desenharMesesPerfil();
    if (j.over) Charts.radar($('#g-notas-perfil'), [
      { nome: j.nome, valores: NOTAS.map(([, , k]) => j.over[k]), cor: 'acento' },
      { nome: 'Média do grupo', valores: NOTAS.map(([, , k]) => Math.round(rc.mediaNotas[k])), cor: 'neutro' },
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
    const base = state.recPerfil?.base, j = base?.porId[state.perfilId], el = $('#g-meses-perfil');
    if (!j || !el) return;
    const met = state.perfilMet;
    Charts.barrasMes(el, {
      meses: base.meses.map(m => curtoMes(m.mes)), gols: j.porMes.map(i => i.gols), assist: j.porMes.map(i => i.assist),
      metrica: met, mediaJogador: mediaMensal([j], met), mediaGrupo: mediaMensal(base.comJogos, met),
    });
  }

  // Uma linha por temporada e o total: só aparece com 2 ou mais temporadas
  function porTemporadaHtml(id) {
    const todas = state.bases.todas?.porId[id];
    const linhas = state.temporadas.map(t => state.bases[t.temporada].porId[id] && [t.temporada, state.bases[t.temporada].porId[id]]).filter(Boolean);
    if (!todas || linhas.length < 2) return '';
    const linha = ([r, j]) => `<tr><th>${esc(r)}</th><td class="num">${j.partidas}</td><td class="num">${j.gols}</td><td class="num">${j.assist}</td><td class="num">${j.ga}</td><td class="num">${dec(j.gapj)}</td></tr>`;
    return `
        <article class="painel painel-largo">
          <h3>Por temporada</h3>
          <div class="forma-box"><table class="forma">
            <thead><tr><th></th><th>Jogos</th><th>Gols</th><th>Assist.</th><th>G+A</th><th>G+A/jogo</th></tr></thead>
            <tbody>${linhas.map(linha).join('')}${linha(['Total', todas])}</tbody>
          </table></div>
        </article>`;
  }

  // Forma do jogador: temporada × mês atual, com ↑/↓ nas médias em relação à temporada
  function formaHtml(b) {
    const cols = PERIODOS.map(p => ({
      p, n: comMedias(numerosNoPeriodo(b, p)),
      ok: p === 'temporada' || !mesesSemJogos(mesesDoPeriodo(p)).length,
    }));
    const temp = cols[0].n;
    const linhas = [['Jogos', 'partidas', int], ['Gols', 'gols', int], ['Assist.', 'assist', int], ['G+A', 'ga', int],
      ['Gols/jogo', 'gpj', dec, true], ['Assist/jogo', 'apj', dec, true], ['G+A/jogo', 'gapj', dec, true]];
    const celula = (c, [, k, fmt, porJogo]) => {
      if ((porJogo || k === 'partidas') && !c.ok) return '<td class="sem">—</td>';
      if (porJogo && !c.n.partidas) return '<td class="sem">—</td>';
      const v = c.n[k], d = v - temp[k];
      const seta = porJogo && c.p !== 'temporada' && temp.partidas && Math.abs(d) >= .05
        ? ` <i class="seta ${d > 0 ? 'sobe' : 'desce'}" title="${d > 0 ? '+' : ''}${dec(d)} em relação à temporada">${d > 0 ? '↑' : '↓'}</i>` : '';
      return `<td class="num">${fmt(v)}${seta}</td>`;
    };
    const falta = cols.some(c => !c.ok);
    const curto = { temporada: 'Temporada', mes: rotuloPeriodo('mes') };
    return `
        <article class="painel painel-largo">
          <h3>Forma</h3>
          <p class="painel-desc">A temporada inteira contra o mês atual. As setas comparam as médias do mês com as da temporada.${falta ? ' “—” = jogos do mês ainda não registrados.' : ''}</p>
          <div class="forma-box"><table class="forma">
            <thead><tr><th></th>${cols.map(c => `<th>${esc(curto[c.p])}</th>`).join('')}</tr></thead>
            <tbody>${linhas.map(l => `<tr><th>${l[0]}</th>${cols.map(c => celula(c, l)).join('')}</tr>`).join('')}</tbody>
          </table></div>
        </article>`;
  }

  function fecharPerfil() {
    if ($('#modal').hidden) return;
    $('#modal').hidden = true;
    document.body.classList.remove('travado');
    ['g-radar-perfil', 'g-meses-perfil', 'g-notas-perfil'].forEach(Charts.descartar);
    if (location.hash.startsWith('#jogador/')) history.replaceState(null, '', location.pathname + location.search);
  }

  // começo de temporada (ninguém com o mínimo de jogos): rival entre quem já jogou, por G+A
  const rival = id => (state.recDuelo.regulares.filter(j => j.id !== id).sort((x, y) => y.calc - x.calc)[0]
    || state.recDuelo.comJogos.filter(j => j.id !== id).sort((x, y) => y.ga - x.ga || y.gols - x.gols)[0])?.id || '';

  /* ---------------- Comparar ---------------- */
  const MODOS = { numeros: 'Números', honras: 'Honrarias', notas: 'Notas dos adms' };

  function urlDuelo() {
    return `#comparar/${state.a}/${state.b}${state.modo !== 'numeros' ? '/' + state.modo : ''}`;
  }

  function renderComparar() {
    const ops = [[state.temporada, `Temporada ${state.temporada}`]];
    if (state.meses.length) ops.push(['mes', rotuloPeriodo('mes')]);
    if (state.bases.todas) ops.push(['todas', 'Todas as temporadas']);
    const seg = $('#seg-duelo-periodo');
    seg.hidden = ops.length < 2;
    seg.innerHTML = ops.map(([k, r]) => `<button data-dp="${esc(k)}"${k === state.recDuelo.chave ? ' class="ativo"' : ''}>${esc(r)}</button>`).join('');
    $('#duelo-rotulo').textContent = rotuloRecorte(state.recDuelo);
    definirDuelo(null, null, false);
  }

  function definirDuelo(a, b, atualizarUrl = true, modo) {
    const { porId } = state.recDuelo;
    if (a && porId[a]) state.a = a;
    if (b && porId[b]) state.b = b;
    if (modo && MODOS[modo]) state.modo = modo;
    $('.sel-a input').value = porId[state.a]?.nome || '';
    $('.sel-b input').value = porId[state.b]?.nome || '';
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
    const rc = state.recDuelo, A = rc.porId[state.a], B = rc.porId[state.b];
    if (!A || !B) { el.innerHTML = '<div class="duelo-vazio">Escolha dois jogadores para o mano a mano.</div>'; return; }
    if (A === B) { el.innerHTML = '<div class="duelo-vazio">Escolha dois jogadores diferentes 😄</div>'; return; }

    const legenda = `<div class="legenda-duelo">
        <span><i style="background:var(--s-a)"></i>${esc(A.nome)}</span>
        <span><i style="background:var(--s-b)"></i>${esc(B.nome)}</span>
      </div>`;
    let r, corpo, aviso = '', unidade;

    if (state.modo === 'numeros') {
      // sem jogos lançados no período, jogos e médias ficam de fora do placar
      r = linhasDuelo(METRICAS.filter(m => !(rc.semMedias && precisaJogos(m))).map(m => {
        const max = Math.max(0, ...elegiveis(m, rc).map(m.val));
        return [m.rotulo, chave(m, A), chave(m, B), m.fmt, max];
      }));
      unidade = 'estatísticas';
      const poucos = [A, B].filter(j => j.partidas < rc.minPeriodo).map(j => j.nome);
      if (rc.semMedias) aviso = `<p class="aviso">${esc(avisoMedias(rc))}</p>`;
      else if (poucos.length) aviso = `<p class="aviso">⚠️ ${esc(poucos.join(' e '))} ${poucos.length > 1 ? 'têm' : 'tem'} menos de ${rc.minPeriodo} jogos: as médias contam pouco.</p>`;
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
        Math.max(...rc.jogadores.map(j => honra(j, h.k)))]));
      unidade = 'honrarias';
      corpo = `
        <article class="painel painel-largo">
          <h3>Honraria por honraria</h3>
          <p class="painel-desc">Quantas vezes cada um ganhou cada prêmio ${rc.chave === 'mes' ? 'no mês' : rc.chave === 'todas' ? 'em todas as temporadas' : 'na temporada'}. Barras na escala do recordista.</p>
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
      : `${state.recDuelo.semMedias ? '' : `${j.partidas} jogos · `}${j.gols}G · ${j.assist}A`;
    return `<button class="duelista ${lado}" type="button" data-jogador="${j.id}" aria-label="Ver perfil de ${esc(j.nome)}">
      <span class="duelista-nome">${esc(j.nome)}</span>
      <span class="duelista-info">${info}</span>
    </button>`;
  }

  /* ---------------- Busca (autocomplete) ---------------- */
  function autocomplete(caixa, aoEscolher, fonte = () => state.base.jogadores) {
    const input = $('input', caixa), ul = $('.sugestoes', caixa);
    let itens = [], sel = 0;
    const desenhar = () => {
      const q = norm(input.value);
      itens = fonte()
        .filter(j => !q || norm(j.nome).includes(q))
        .sort((x, y) => (norm(y.nome).startsWith(q) - norm(x.nome).startsWith(q)) || y.ga - x.ga || x.nome.localeCompare(y.nome, 'pt'));
      sel = 0;
      ul.innerHTML = itens.length
        ? itens.map((j, i) => `<li role="option" data-id="${j.id}" aria-selected="${i === sel}">${esc(j.nome)}<small>${j.partidas || j.ga ? `${j.gols}G · ${j.assist}A` : 'sem jogos'}</small></li>`).join('')
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

  /* ---------------- Abas e rotas ---------------- */
  const DESENHOS = { agora: renderAgora, temporada: renderTemporada, futs: () => { renderMelhoresTimes(); renderFuts(); }, comparar: renderComparar };
  // Links antigos (#mes-a-mes, #trofeus…) continuam abrindo o lugar certo: [aba, seção]
  const ROTAS = {
    'temporada-atual': ['agora'], agora: ['agora'], momento: ['agora'], 'mes-a-mes': ['agora'],
    'todos-os-dados': ['temporada'], temporada: ['temporada'], totais: ['temporada', 'totais'], rankings: ['temporada', 'rankings'], trofeus: ['temporada', 'trofeus'],
    evolucao: ['temporada', 'evolucao'], analises: ['temporada', 'analises'],
    futs: ['futs'], comparar: ['comparar'],
  };

  // Gráfico em aba escondida fica com tamanho zero: cada aba só é desenhada ao abrir
  function irAba(aba) {
    if (aba === 'futs' && !state.futs.length) aba = 'agora';
    const mudou = state.abaSite !== aba;
    state.abaSite = aba;
    $$('.aba-painel').forEach(p => { p.hidden = p.id !== `aba-${aba}`; });
    $$('.nav a').forEach(a => {
      a.classList.toggle('ativo', a.dataset.nav === aba);
      if (a.dataset.nav === aba) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    $('#subnav').hidden = aba !== 'temporada';
    if (state.sujas.delete(aba)) DESENHOS[aba]();
    else if (mudou) Charts.redimensionar();
  }

  const abaInicial = () => state.temporadaPedida || !(state.meses.length || state.futs.length) ? 'temporada' : 'agora';

  function rota() {
    const h = decodeURIComponent(location.hash.slice(1));
    const [r, p1, p2, p3] = h.split('/');
    if (r === 'jogador') {
      if (!state.abaSite) irAba(abaInicial());
      abrirPerfil(p1);
      return;
    }
    fecharPerfil();
    const [aba, secao] = ROTAS[r] || [abaInicial()];
    irAba(aba);
    if (r === 'comparar' && p1) definirDuelo(p1, p2, false, p3 || 'numeros');
    if (secao) $(`#${secao}`).scrollIntoView({ behavior: 'instant' });
    else window.scrollTo({ top: 0, behavior: 'instant' });
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
    grupo('#seg-temporada', 't', trocarTemporada);
    grupo('#seg-duelo-periodo', 'dp', v => { state.recDuelo = montarRecorte(v); renderComparar(); });
    grupo('#seg-honras', 'g', v => { state.grupoHonras = v; renderHonras(); });
    grupo('#pilulas-mes', 'mes', trocarMes, 'ativa');
    $('#agora-fut').addEventListener('click', e => {
      if (e.target.closest('a[href="#futs"]')) { state.fut = futDoMes().id; state.sujas.add('futs'); }
    });
    grupo('#seg-mes-rank', 'mr', v => { state.mesMet = v; renderMes(); });
    grupo('#seg-meses-grupo', 'mg', v => { state.mesesMet = v; renderMesesGrupo(); });
    grupo('#seg-futs-grupo', 'fg', v => { state.futsMet = v; renderBarrasFuts(); });
    grupo('#pilulas-fut-mes', 'mesfut', v => { state.fut = state.futs.find(f => f.data.startsWith(v)).id; renderFuts(); }, 'ativa');
    grupo('#pilulas-fut', 'fut', v => { state.fut = +v; renderFuts(); });
    $('#melhores-times').addEventListener('click', abrirFutDoTime);
    $('#melhores-times').addEventListener('keydown', e => { if (e.key === 'Enter') abrirFutDoTime(e); });
    grupo('#seg-fut-rank', 'fr', v => { state.futMet = v; renderFuts(); });
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-exportar-ranking]');
      if (b) exportarRanking(b.dataset.exportarRanking, b);
      const g = e.target.closest('[data-exportar-grafico]');
      if (g) exportarGrafico(g.dataset.exportarGrafico, g);
    });
    grupo('#seg-corrida', 'c', v => { state.metricaCorrida = v; renderCorrida(); });
    grupo('#modos-duelo', 'modo', v => definirDuelo(null, null, true, v), 'ativa');

    // Qualquer elemento com data-jogador abre o perfil
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-jogador]');
      if (el && !el.closest('#perfil')) location.hash = `jogador/${el.dataset.jogador}`;
      if (e.target.closest('[data-fechar]')) fecharPerfil();
      const vm = e.target.closest('[data-ver-mais]');
      if (vm) {
        const k = vm.dataset.verMais, fechando = state.abertos.delete(k);
        if (!fechando) state.abertos.add(k);
        ({ ranking: renderRanking, podios: renderHonras, honras: renderHonras, mes: renderMes, fut: renderFuts, heat: renderHeatMeses, jogfut: renderJogadorFut })[k]();
        // ao fechar, volta para o começo da lista (senão a pessoa fica lá embaixo, longe dela)
        if (fechando) vm.previousElementSibling.scrollIntoView({ block: 'start' });
      }
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
      state.focoCorrida = id; input.value = state.rec.porId[id].nome; input.blur(); renderCorrida();
    }, () => state.rec.jogadores);
    $('#limpar-corrida').addEventListener('click', () => {
      state.focoCorrida = null; $('#busca-corrida input').value = ''; renderCorrida();
    });
    grupo('#seg-hist-met', 'hmet', v => { state.histMet = v; renderHistorico(); });
    autocomplete($('#busca-hist'), (id, input) => {
      if (!state.histSel.includes(id) && state.histSel.length < MAX_HIST) state.histSel.push(id);
      input.value = ''; input.blur(); renderHistorico();
    }, () => state.rec.jogadores);
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
    autocomplete($('.sel-a .busca'), id => definirDuelo(id, null), () => state.recDuelo.jogadores);
    autocomplete($('.sel-b .busca'), id => definirDuelo(null, id), () => state.recDuelo.jogadores);
    $('#btn-inverter').addEventListener('click', () => {
      const a = state.a; state.a = state.b; state.b = a;
      definirDuelo();
    });
    $('#btn-compartilhar').addEventListener('click', async () => {
      const url = `${location.origin}${location.pathname}${location.search}${urlDuelo()}`;
      try { await navigator.clipboard.writeText(url); toast('Link copiado! Manda no grupo 😎'); }
      catch { prompt('Copie o link:', url); }
    });

    $('#btn-tema').addEventListener('click', alternarTema);
    window.addEventListener('hashchange', rota);

    // Destaca a seção atual no submenu da temporada
    const links = $$('.subnav a');
    const obs = new IntersectionObserver(es => {
      for (const en of es) if (en.isIntersecting) links.forEach(a => a.classList.toggle('ativo', a.getAttribute('href') === '#' + en.target.id));
    }, { rootMargin: '-45% 0px -50% 0px' });
    $$('#aba-temporada section').forEach(s => obs.observe(s));
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
    renderCabecalho();
    renderGlossario();
    $$('.nav a[href="#futs"]').forEach(a => { a.hidden = !state.futs.length; });
    // no celular "Buscar jogador…" não cabe ao lado do logo
    if (matchMedia('(max-width: 599px)').matches) $('#busca-global input').placeholder = 'Buscar…';
    Charts.iniciar();
    // Duelo inicial: os 2 melhores regulares; no começo da temporada (ninguém com o mínimo de jogos)
    // usa quem já jogou, por G+A. Com menos de 2, o comparativo fica vazio esperando a escolha.
    const rc = state.recDuelo;
    const top = rc.regulares.length >= 2
      ? [...rc.regulares].sort((x, y) => y.calc - x.calc)
      : [...rc.comJogos].sort((x, y) => y.ga - x.ga || y.gols - x.gols);
    state.a = top[0]?.id ?? null;
    state.b = top[1]?.id ?? null;
    ligarEventos();
    rota();
  }

  iniciar();
})();
