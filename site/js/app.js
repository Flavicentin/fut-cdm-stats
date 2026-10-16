/* Fut CDM — estado, rankings, perfil, comparação e rotas. */
(() => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const int = v => String(Math.round(v));
  const dec = v => v.toFixed(1).replace('.', ',');
  const ord = n => `${n}º`;

  const METRICAS = [
    { id: 'gols', rotulo: 'Gols', fmt: int, val: j => j.gols },
    { id: 'assist', rotulo: 'Assistências', fmt: int, val: j => j.assist },
    { id: 'ga', rotulo: 'G+A', fmt: int, val: j => j.ga },
    { id: 'gpj', rotulo: 'Gols/jogo', fmt: dec, val: j => j.gpj, media: true },
    { id: 'apj', rotulo: 'Assist/jogo', fmt: dec, val: j => j.apj, media: true },
    { id: 'gapj', rotulo: 'G+A/jogo', fmt: dec, val: j => j.gapj, media: true },
    { id: 'partidas', rotulo: 'Partidas', fmt: int, val: j => j.partidas },
  ];
  const MET = Object.fromEntries(METRICAS.map(m => [m.id, m]));

  // Atributos do radar: [sigla, nome, métrica, peso no overall]
  const ATRIBUTOS = [
    ['FIN', 'Finalização', 'gpj', .22],
    ['PAS', 'Passe', 'apj', .22],
    ['DEC', 'Decisão', 'gapj', .26],
    ['PRE', 'Presença', 'partidas', .12],
    ['VOL', 'Volume', 'ga', .18],
  ];

  const POSICOES = {
    ATA: 'Atacante · finalizador nato',
    SA: 'Meia-atacante · faz e serve',
    MEI: 'Meia · garçom do time',
  };

  const state = {
    temporada: null,
    jogadores: [],
    porId: {},
    aba: 'gols',
    minJogos: 0,
    a: null,
    b: null,
  };

  /* ---------------- Dados ---------------- */
  async function carregar() {
    const temporadas = await fetch('data/temporadas.json').then(r => r.json());
    const t = temporadas[0];
    const dados = await fetch(`data/${t}.json`).then(r => r.json());
    state.temporada = dados.temporada;
    state.atualizado = dados.atualizado_em;
    state.jogadores = dados.jogadores.map(j => {
      const ga = j.gols + j.assist;
      return { ...j, ga, gpj: j.gols / j.partidas, apj: j.assist / j.partidas, gapj: ga / j.partidas };
    });
    state.porId = Object.fromEntries(state.jogadores.map(j => [j.id, j]));
    calcularRanks();
    calcularAtributos();
  }

  // Valor usado para empate: o que aparece na tela (médias com 1 casa).
  const chave = (m, j) => m.media ? Math.round(m.val(j) * 10) / 10 : m.val(j);

  // Ranking denso, igual aos .txt: "1. Roger · 2. Felps · 3. Leo e Renato · 4. ..."
  function ranquear(metrica, lista = state.jogadores) {
    const m = MET[metrica];
    const ord = [...lista].sort((x, y) => m.val(y) - m.val(x) || x.nome.localeCompare(y.nome, 'pt'));
    let pos = 0, ultimo = null;
    return ord.map(j => {
      const k = chave(m, j);
      if (k !== ultimo) { pos++; ultimo = k; }
      return { j, pos, valor: m.val(j) };
    });
  }

  function calcularRanks() {
    for (const j of state.jogadores) j.ranks = {};
    for (const m of METRICAS) for (const r of ranquear(m.id)) r.j.ranks[m.id] = r.pos;
  }

  function calcularAtributos() {
    const js = state.jogadores, n = js.length;
    for (const [sigla, , met] of ATRIBUTOS) {
      const vals = js.map(MET[met].val);
      const min = Math.min(...vals), max = Math.max(...vals);
      for (const j of js) {
        const v = MET[met].val(j);
        const abaixo = vals.filter(x => x < v).length;
        const iguais = vals.filter(x => x === v).length - 1;
        const pct = (abaixo + iguais / 2) / (n - 1);
        const mm = max > min ? (v - min) / (max - min) : 1;
        j.attrs = j.attrs || {};
        j.attrs[sigla] = Math.round(45 + 54 * (.55 * pct + .45 * mm));
      }
    }
    for (const j of js) {
      j.ovr = Math.round(ATRIBUTOS.reduce((s, [sigla, , , p]) => s + j.attrs[sigla] * p, 0));
      const fatia = j.gols / j.ga;
      j.pos = fatia >= .65 ? 'ATA' : fatia <= .5 ? 'MEI' : 'SA';
    }
    state.media = Object.fromEntries(ATRIBUTOS.map(([s]) => [s, js.reduce((t, j) => t + j.attrs[s], 0) / n]));
  }

  const lideres = metrica => ranquear(metrica).filter(r => r.pos === 1);
  const nomes = rs => rs.map(r => r.j.nome).join(' & ');

  /* ---------------- Jogador no duelo ---------------- */
  function ladoDuelo(j, lado) {
    return `<button class="duelista ${lado}" type="button" data-jogador="${j.id}" aria-label="Ver perfil de ${esc(j.nome)}">
      <span class="duelista-nome">${esc(j.nome)}</span>
      <span class="duelista-info">${j.partidas} jogos · ${j.gols}G · ${j.assist}A</span>
    </button>`;
  }

  /* ---------------- Hero ---------------- */
  function renderHero() {
    $$('[data-temporada]').forEach(el => el.textContent = state.temporada);
    $('#logo-ano').textContent = state.temporada;
    document.title = `Fut CDM ${state.temporada}`;
    const [ano, mes, dia] = state.atualizado.split('-');
    $('#atualizado').textContent = `${dia}/${mes}/${ano}`;

    const js = state.jogadores;
    const soma = k => js.reduce((t, j) => t + j[k], 0);
    const kpis = [
      [soma('gols'), 'gols marcados', int],
      [soma('assist'), 'assistências', int],
      [js.length, 'jogadores', int],
      [soma('ga') / soma('partidas'), 'G+A por jogador a cada jogo', dec],
    ];
    $('#kpis').innerHTML = kpis.map(([v, r, f]) =>
      `<div class="kpi"><div class="kpi-valor num" data-contar="${v}" data-fmt="${f === dec ? 'dec' : 'int'}">${f(v)}</div><div class="kpi-rotulo">${r}</div></div>`).join('');
    contarKpis();

    const cards = [
      ['🥇', 'Artilheiro', 'gols', 'gols'],
      ['🎯', 'Garçom', 'assist', 'assistências'],
      ['👑', 'Rei do G+A', 'ga', 'G+A'],
      ['⚡', 'Melhor média', 'gapj', 'G+A por jogo'],
      ['🏟️', 'Mais presente', 'partidas', 'jogos'],
    ];
    $('#lideres').innerHTML = cards.map(([ic, tit, met, un]) => {
      const ls = lideres(met);
      return `<button class="lider" type="button" data-jogador="${ls[0].j.id}">
        <span class="lider-icone">${ic}</span>
        <span class="lider-titulo">${tit}</span>
        <span class="lider-nome">${esc(nomes(ls))}</span>
        <span class="lider-valor"><b class="num">${MET[met].fmt(ls[0].valor)}</b> ${un}</span>
      </button>`;
    }).join('');
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
    $('#abas-ranking').innerHTML = METRICAS.map(m =>
      `<button class="aba${m.id === state.aba ? ' ativa' : ''}" role="tab" aria-selected="${m.id === state.aba}" data-aba="${m.id}">${m.rotulo}</button>`).join('');
  }

  function renderRanking() {
    const m = MET[state.aba];
    $('#filtro-min').hidden = !m.media;
    const lista = m.media ? state.jogadores.filter(j => j.partidas >= state.minJogos) : state.jogadores;
    const rs = ranquear(m.id, lista);
    if (!rs.length) { $('#ranking').innerHTML = '<li class="rank-vazio">Ninguém com esse mínimo de jogos.</li>'; return; }
    const max = rs[0].valor;
    $('#ranking').innerHTML = rs.map((r, i) => {
      const sub = m.media ? `${r.j.partidas} jogos` : m.id === 'ga' ? `${r.j.gols}G · ${r.j.assist}A` : '';
      return `<li class="rank-item" data-pos="${r.pos}" data-jogador="${r.j.id}" style="--i:${i}" tabindex="0">
        <span class="rank-pos">${r.pos}</span>
        <div class="rank-corpo">
          <div class="rank-nome">${esc(r.j.nome)}${sub ? ` <small>${sub}</small>` : ''}</div>
          <div class="rank-barra"><span style="--w:${(r.valor / max * 100).toFixed(1)}%;--i:${i}"></span></div>
        </div>
        <span class="rank-valor num">${m.fmt(r.valor)}</span>
      </li>`;
    }).join('');
  }

  /* ---------------- Perfil ---------------- */
  function conquistas(j) {
    const b = [];
    const top = { gols: ['🥇', 'Artilheiro'], assist: ['🎯', 'Garçom'], ga: ['👑', 'Rei do G+A'], gapj: ['⚡', 'Melhor média'], partidas: ['🏟️', 'Mais presente'], gpj: ['💥', 'Melhor média de gols'], apj: ['🧠', 'Melhor média de assist.'] };
    for (const [met, [ic, nome]] of Object.entries(top)) if (j.ranks[met] === 1) b.push(['', `${ic} ${nome}`]);
    const top3 = METRICAS.filter(m => j.ranks[m.id] > 1 && j.ranks[m.id] <= 3).map(m => m.rotulo);
    if (top3.length) b.push(['verde', `🔝 Top 3 em ${top3.join(', ')}`]);
    if (j.assist > j.gols) b.push(['verde', '🤝 Mais assiste do que marca']);
    if (j.gpj >= 3) b.push(['verde', '🔥 3+ gols por jogo']);
    if (j.partidas >= 25) b.push(['verde', '📅 Não perde um jogo']);
    return b;
  }

  function abrirPerfil(id) {
    const j = state.porId[id];
    if (!j) return;
    const n = state.jogadores.length;
    const posicoes = METRICAS.map(m => {
      const p = j.ranks[m.id];
      return `<li><span>${m.rotulo}</span><span class="val">${m.fmt(m.val(j))}</span><span class="pos ${p <= 3 ? 'p' + p : ''}">${ord(p)}</span></li>`;
    }).join('');
    const nums = [['gols', 'Gols'], ['assist', 'Assist.'], ['partidas', 'Jogos'], ['ga', 'G+A'], ['gpj', 'Gols/jogo'], ['gapj', 'G+A/jogo']]
      .map(([k, r]) => `<div class="perfil-num"><b class="num">${MET[k].fmt(MET[k].val(j))}</b><span>${r}</span> <em>${ord(j.ranks[k])}</em></div>`).join('');
    $('#perfil').innerHTML = `
      <div class="perfil-cab">
        <div class="perfil-info">
          <p class="kicker">Temporada ${state.temporada} · ${n} jogadores</p>
          <h2 id="perfil-nome">${esc(j.nome)}</h2>
          <span class="perfil-tag">${POSICOES[j.pos]} · ${Math.round(j.gols / j.ga * 100)}% do G+A em gols</span>
          <div class="perfil-nums">${nums}</div>
          <div class="badges">${conquistas(j).map(([c, t]) => `<span class="badge ${c}">${t}</span>`).join('')}</div>
          <div class="perfil-acoes">
            <a class="btn" href="#comparar/${j.id}/${(state.b && state.b !== j.id ? state.b : rival(j.id))}">⚔️ Comparar com alguém</a>
          </div>
        </div>
      </div>
      <div class="perfil-grade">
        <article class="painel">
          <h3>Atributos</h3>
          <p class="painel-desc">Comparado à média do grupo.</p>
          <div class="grafico" id="g-radar-perfil" style="height:300px"></div>
        </article>
        <article class="painel">
          <h3>Posição nos rankings</h3>
          <ul class="posicoes">${posicoes}</ul>
        </article>
      </div>`;
    const modal = $('#modal');
    modal.hidden = false;
    document.body.classList.add('travado');
    $('.modal-caixa').scrollTop = 0;
    Charts.radar($('#g-radar-perfil'), [
      { nome: j.nome, valores: ATRIBUTOS.map(([s]) => j.attrs[s]), cor: 'acento' },
      { nome: 'Média do grupo', valores: ATRIBUTOS.map(([s]) => Math.round(state.media[s])), cor: 'neutro' },
    ], ATRIBUTOS);
    $('.modal-fechar').focus();
  }

  function fecharPerfil() {
    if ($('#modal').hidden) return;
    $('#modal').hidden = true;
    document.body.classList.remove('travado');
    Charts.descartar('g-radar-perfil');
    if (location.hash.startsWith('#jogador/')) history.replaceState(null, '', location.pathname + location.search);
  }

  const rival = id => state.jogadores.filter(j => j.id !== id).sort((x, y) => y.ovr - x.ovr)[0].id;

  /* ---------------- Comparar ---------------- */
  function definirDuelo(a, b, atualizarUrl = true) {
    if (a && state.porId[a]) state.a = a;
    if (b && state.porId[b]) state.b = b;
    $('.sel-a input').value = state.a ? state.porId[state.a].nome : '';
    $('.sel-b input').value = state.b ? state.porId[state.b].nome : '';
    if (atualizarUrl && state.a && state.b) history.replaceState(null, '', `#comparar/${state.a}/${state.b}`);
    renderDuelo();
  }

  function renderDuelo() {
    const el = $('#duelo');
    const A = state.porId[state.a], B = state.porId[state.b];
    if (!A || !B) { el.innerHTML = '<div class="duelo-vazio">Escolha dois jogadores para o mano a mano.</div>'; return; }
    if (A === B) { el.innerHTML = '<div class="duelo-vazio">Escolha dois jogadores diferentes 😄</div>'; return; }

    let va = 0, vb = 0;
    const linhas = METRICAS.map(m => {
      const a = m.val(A), b = m.val(B), ka = chave(m, A), kb = chave(m, B);
      const max = Math.max(...state.jogadores.map(m.val));
      const ga = ka > kb, gb = kb > ka;
      va += ga; vb += gb;
      return `<div class="duelo-linha">
        <div class="duelo-rot">${m.rotulo}</div>
        <div class="lado a${ga ? ' vence' : ''}"><span class="v num">${m.fmt(a)}</span><div class="trilho"><span style="--w:${a / max * 100}%"></span></div></div>
        <div class="meio"></div>
        <div class="lado b${gb ? ' vence' : ''}"><div class="trilho"><span style="--w:${b / max * 100}%"></span></div><span class="v num">${m.fmt(b)}</span></div>
      </div>`;
    }).join('');

    const total = METRICAS.length;
    const txt = va === vb ? `<b>Empate</b> nas ${total} estatísticas`
      : `<b>${esc((va > vb ? A : B).nome)}</b> vence em ${Math.max(va, vb)} de ${total}`;

    el.innerHTML = `
      <div class="duelo-cab">
        ${ladoDuelo(A, 'a')}
        <div class="placar">
          <div class="placar-num"><span class="a">${va}</span><span class="x">×</span><span class="b">${vb}</span></div>
          <div class="placar-txt">${txt}</div>
        </div>
        ${ladoDuelo(B, 'b')}
      </div>
      <div class="duelo-corpo">
        <article class="painel">
          <h3>Estatística por estatística</h3>
          <p class="painel-desc">Barras na escala do líder de cada estatística. ✓ marca quem leva.</p>
          <div class="duelo-linhas">${linhas}</div>
        </article>
        <article class="painel">
          <h3>Atributos</h3>
          <div class="legenda-duelo">
            <span><i style="background:var(--s-a)"></i>${esc(A.nome)}</span>
            <span><i style="background:var(--s-b)"></i>${esc(B.nome)}</span>
          </div>
          <div class="grafico" id="g-radar-duelo" style="height:340px"></div>
        </article>
      </div>`;
    Charts.radar($('#g-radar-duelo'), [
      { nome: A.nome, valores: ATRIBUTOS.map(([s]) => A.attrs[s]), cor: 's-a' },
      { nome: B.nome, valores: ATRIBUTOS.map(([s]) => B.attrs[s]), cor: 's-b' },
    ], ATRIBUTOS, false);
  }

  /* ---------------- Busca (autocomplete) ---------------- */
  function autocomplete(caixa, aoEscolher) {
    const input = $('input', caixa), ul = $('.sugestoes', caixa);
    let itens = [], sel = 0;
    const desenhar = () => {
      const q = norm(input.value);
      itens = state.jogadores
        .filter(j => !q || norm(j.nome).includes(q))
        .sort((x, y) => (norm(y.nome).startsWith(q) - norm(x.nome).startsWith(q)) || y.ovr - x.ovr);
      sel = 0;
      ul.innerHTML = itens.length
        ? itens.map((j, i) => `<li role="option" data-id="${j.id}" aria-selected="${i === sel}">${esc(j.nome)}<small>${j.gols}G · ${j.assist}A</small></li>`).join('')
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
    const [r, p1, p2] = h.split('/');
    if (r === 'jogador') { abrirPerfil(p1); return; }
    fecharPerfil();
    if (r === 'comparar' && p1) {
      definirDuelo(p1, p2, false);
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

  /* ---------------- Eventos ---------------- */
  function ligarEventos() {
    $('#abas-ranking').addEventListener('click', e => {
      const b = e.target.closest('[data-aba]');
      if (!b) return;
      state.aba = b.dataset.aba;
      renderAbas(); renderRanking();
    });
    $('#filtro-min').addEventListener('click', e => {
      const b = e.target.closest('[data-min]');
      if (!b) return;
      state.minJogos = +b.dataset.min;
      $$('#filtro-min button').forEach(x => x.classList.toggle('ativo', x === b));
      renderRanking();
    });
    $('#seg-fatia').addEventListener('click', e => {
      const b = e.target.closest('[data-m]');
      if (!b) return;
      $$('#seg-fatia button').forEach(x => x.classList.toggle('ativo', x === b));
      Charts.fatia(b.dataset.m);
    });

    // Qualquer elemento com data-jogador abre o perfil
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-jogador]');
      if (el && !el.closest('#perfil')) location.hash = `jogador/${el.dataset.jogador}`;
      if (e.target.closest('[data-fechar]')) fecharPerfil();
    });
    $('#ranking').addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.dataset.jogador) location.hash = `jogador/${e.target.dataset.jogador}`;
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') fecharPerfil();
      if (e.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) {
        e.preventDefault(); $('#busca-global input').focus();
      }
    });

    autocomplete($('#busca-global'), (id, input) => { input.value = ''; input.blur(); location.hash = `jogador/${id}`; });
    autocomplete($('.sel-a .busca'), id => definirDuelo(id, null));
    autocomplete($('.sel-b .busca'), id => definirDuelo(null, id));
    $('#btn-inverter').addEventListener('click', () => {
      const a = state.a; state.a = state.b; state.b = a;
      definirDuelo();
    });
    $('#btn-compartilhar').addEventListener('click', async () => {
      const url = `${location.origin}${location.pathname}#comparar/${state.a}/${state.b}`;
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
      document.querySelector('main').innerHTML = `<div class="wrap" style="padding:80px 16px"><h2>Não foi possível carregar os dados.</h2><p>Abra o site por um servidor (ex.: <code>python -m http.server</code>), não direto pelo arquivo.</p></div>`;
      console.error(e);
      return;
    }
    renderHero();
    renderAbas();
    renderRanking();
    Charts.iniciar(state.jogadores);
    const top = [...state.jogadores].sort((x, y) => y.ovr - x.ovr);
    state.a = top[0].id; state.b = top[1].id;
    definirDuelo(null, null, false);
    ligarEventos();
    rota();
  }

  iniciar();
})();
