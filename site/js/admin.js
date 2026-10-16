/* Fut CDM — admin: login por link mágico e edição dos dados no Supabase. */
(() => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const limpar = s => String(s ?? '').replace(/\s+/g, ' ').trim();
  // mesmo slug do scripts/importar_planilha.py
  const slug = s => limpar(s).normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  const { supabaseUrl, supabaseKey } = window.FUT_CONFIG;
  const sb = supabase.createClient(supabaseUrl, supabaseKey);

  // Colunas da planilha (iguais às do importar_planilha.py)
  const HONRAS_CSV = {
    'Top3 G (S)': 'top3g_s', 'Top3 A (S)': 'top3a_s', 'Artilheiro (S)': 'art_s', 'Garçom (S)': 'gar_s',
    'Duplo-Duplo (S)': 'dd_s', 'Masterclass (S)': 'mc_s', 'MVP (S)': 'mvp_s', 'Gartilheiro (S)': 'gart_s',
    'TOTW': 'totw',
    'Top3 G (M)': 'top3g_m', 'Top3 A (M)': 'top3a_m', 'Artilheiro (M)': 'art_m', 'Garçom (M)': 'gar_m',
    'Gartilheiro (M)': 'gart_m', 'Duplo-Duplo (M)': 'dd_m', 'Masterclass (M)': 'mc_m', 'MVP (M)': 'mvp_m',
    'POTM': 'potm',
  };
  const OVER_CSV = { 'Pace': 'pac', 'Finalização': 'fin', 'Passe': 'pas', 'Drible': 'dri', 'Defesa': 'def', 'Fisico': 'fis', 'OverAll': 'ovr' };
  const NOTAS = [['pac', 'PAC'], ['fin', 'FIN'], ['pas', 'PAS'], ['dri', 'DRI'], ['def', 'DEF'], ['fis', 'FÍS'], ['ovr', 'OVR']];
  const NOME_MES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  const st = {
    usuario: null,
    temporadas: [],
    temporada: null,
    jogadores: [],
    porId: {},
    apelidos: {},
    tipos: [],
    elenco: new Set(),
    aba: 'temporada',
    mes: null,
    meses: [],
    linhas: [],
    avisos: [],
    sujo: false,
  };

  /* ---------------- Utilidades ---------------- */
  function ok({ data, error }) {
    if (error) throw error;
    return data;
  }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('visivel');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('visivel'), 3200);
  }

  function erroLegivel(e) {
    const m = e?.message || String(e);
    if (/jogadores_nome_unico/.test(m)) return 'Já existe um jogador com esse nome.';
    if (/convites_admin_pkey/.test(m)) return 'Esse e-mail já está na lista de convites.';
    if (/notas_over_\w+_check/.test(m)) return 'As notas vão de 1 a 99 (deixe em branco quem não tem nota).';
    if (/row-level security|permission denied|42501/.test(m)) return 'Sem permissão. Sua conta precisa ser admin (ou a sessão expirou: saia e entre de novo).';
    return m;
  }

  function mostrar(tela) {
    $('#carregando').hidden = true;
    for (const t of ['login', 'painel']) $(`#tela-${t}`).hidden = t !== tela;
  }

  function marcarSujo(v = true) {
    st.sujo = v;
    const aviso = $('#aviso-sujo');
    if (aviso) aviso.hidden = !v;
  }

  const confirmarDescarte = () => !st.sujo || confirm('Há alterações não salvas. Descartar?');

  /* ---------------- Planilha ---------------- */
  // Aceita CSV exportado ou células coladas direto do Google Planilhas (TSV).
  function lerTabela(texto) {
    texto = texto.replace(/^﻿/, '');
    const sep = texto.split('\n', 1)[0].includes('\t') ? '\t' : ',';
    const linhas = [];
    let campo = '', linha = [], aspas = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (aspas) {
        if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
        else if (c === '"') aspas = false;
        else campo += c;
      } else if (c === '"' && campo === '') aspas = true;
      else if (c === sep) { linha.push(campo); campo = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && texto[i + 1] === '\n') i++;
        linha.push(campo); linhas.push(linha); linha = []; campo = '';
      } else campo += c;
    }
    if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
    const [cab, ...resto] = linhas;
    if (!cab) return [];
    const chaves = cab.map(h => limpar(h).replace(/:$/, ''));
    return resto
      .map(l => Object.fromEntries(chaves.map((k, i) => [k, limpar(l[i])])))
      .filter(l => l.Jogadores);
  }

  function inteiro(v) {
    v = String(v ?? '').replace(',', '.').trim();
    return v ? Math.trunc(parseFloat(v)) || 0 : 0;
  }

  // '🥇🥇' -> 2, '✔️✔️✔️' -> 3, '3' -> 3, '' -> 0
  function contar(celula) {
    celula = String(celula ?? '').trim();
    if (!celula) return 0;
    if (/^\d+$/.test(celula)) return +celula;
    return [...celula].filter(c => !/\s/.test(c) && !/[\p{Mn}\p{Cf}]/u.test(c) && c !== '️' && c !== '‍').length;
  }

  function resolver(nome) {
    const s = slug(nome);
    return st.apelidos[s] || (st.porId[s] ? s : null);
  }

  /* ---------------- Sessão ---------------- */
  let sessaoAtual;
  async function aoMudarSessao(session) {
    const id = session?.user?.id || null;
    if (id === sessaoAtual) return;
    sessaoAtual = id;
    st.usuario = session?.user || null;
    $('#usuario').hidden = !st.usuario;
    $('#usuario-email').textContent = st.usuario?.email || '';
    if (!st.usuario) return mostrar('login');
    try {
      // A área é só dos adms: quem não é adm é deslogado e usa o site público
      if (!ok(await sb.rpc('is_admin'))) {
        await sb.auth.signOut();
        return msgLogin('Este acesso é só para os adms. Os números estão no site público.', true);
      }
      await carregarBase();
      mostrar('painel');
      // Enquanto o adm não criar a própria senha (link mágico ou senha provisória), o popup é obrigatório
      if (!st.usuario.user_metadata?.senha_criada) abrirSenha(true);
      await abrirAba(st.aba);
    } catch (e) {
      console.error(e);
      mostrar('login');
      $('#login-msg').textContent = 'Erro ao carregar: ' + erroLegivel(e);
      $('#login-msg').classList.add('erro');
    }
  }

  function msgLogin(texto, erro = false) {
    $('#login-msg').textContent = texto;
    $('#login-msg').classList.toggle('erro', erro);
  }

  // Login normal: e-mail + senha (não envia e-mail, então não esbarra no limite do Supabase)
  async function entrarComSenha(ev) {
    ev.preventDefault();
    const btn = $('#form-login button');
    btn.disabled = true;
    msgLogin('Entrando…');
    const { error } = await sb.auth.signInWithPassword({
      email: $('#login-email').value.trim().toLowerCase(),
      password: $('#login-senha').value,
    });
    btn.disabled = false;
    if (error) {
      return msgLogin(/invalid login credentials/i.test(error.message)
        ? 'E-mail ou senha errados. Se ainda não criou senha, use “Primeiro acesso” abaixo.'
        : 'Não foi possível entrar: ' + error.message, true);
    }
    $('#login-senha').value = '';
    msgLogin('');
  }

  // Primeiro acesso / esqueci a senha: link mágico por e-mail; ao entrar, o popup obriga a criar a senha
  async function enviarLink() {
    const campo = $('#login-email');
    const email = campo.value.trim().toLowerCase();
    if (!email || !campo.checkValidity()) {
      campo.focus();
      return msgLogin('Digite seu e-mail acima.', true);
    }
    const msg = $('#login-msg');
    const btn = $('#btn-link');
    btn.disabled = true;
    msg.classList.remove('erro');
    msg.textContent = 'Enviando…';
    // O link só sai para e-mails na lista de convites da aba Admins (e cria a conta no primeiro acesso)
    const { data: convidado } = await sb.rpc('e_convidado', { p_email: email });
    if (convidado !== true) {
      btn.disabled = false;
      return msgLogin('Esse e-mail não está na lista de adms. Peça para um adm te adicionar na aba Admins.', true);
    }
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true },
    });
    btn.disabled = false;
    if (error) {
      msg.classList.add('erro');
      msg.textContent = error.status === 429 || /rate limit|security purposes/i.test(error.message)
        ? 'Muitos pedidos em pouco tempo. Espere alguns minutos e tente de novo.'
        : /signups not allowed/i.test(error.message)
          ? 'O cadastro de contas está desligado no Supabase (Authentication → Sign In / Providers → Allow new users to sign up).'
          : 'Não foi possível enviar: ' + error.message;
      return;
    }
    msg.textContent = `Pronto! Abra o link enviado para ${email}. Ao entrar, você vai criar sua senha. Se não aparecer, olhe o spam.`;
  }

  let senhaObrigatoria = false;
  function abrirSenha(obrigatoria = false) {
    senhaObrigatoria = obrigatoria;
    $('#senha-kicker').textContent = obrigatoria ? 'Primeiro acesso' : 'Sua conta';
    $('#senha-titulo').textContent = obrigatoria ? 'Crie sua senha' : 'Trocar senha';
    $('#senha-desc').textContent = obrigatoria
      ? 'Antes de continuar, crie uma senha. Das próximas vezes você entra direto com e-mail e senha, sem esperar e-mail.'
      : 'Digite a nova senha duas vezes.';
    $('#btn-senha-fechar').hidden = obrigatoria;
    $('#btn-senha-sair').hidden = !obrigatoria;
    $('#form-senha').reset();
    $('#senha-msg').textContent = '';
    $('#modal-senha').hidden = false;
    $('#nova-senha').focus();
  }

  function fecharSenha() {
    senhaObrigatoria = false;
    $('#form-senha').reset();
    $('#modal-senha').hidden = true;
  }

  async function salvarSenha(ev) {
    ev.preventDefault();
    const senha = $('#nova-senha').value;
    const msg = $('#senha-msg');
    msg.classList.add('erro');
    if (senha.length < 8) return (msg.textContent = 'Use pelo menos 8 caracteres.');
    if (senha !== $('#nova-senha-2').value) return (msg.textContent = 'As duas senhas não são iguais.');
    const btn = $('#form-senha button[type=submit]');
    btn.disabled = true;
    // senha_criada marca na conta que o popup obrigatório não precisa mais aparecer
    const { data, error } = await sb.auth.updateUser({ password: senha, data: { senha_criada: true } });
    btn.disabled = false;
    if (error) {
      msg.textContent = /different from the old/i.test(error.message)
        ? 'A nova senha precisa ser diferente da atual.'
        : 'Não foi possível salvar: ' + error.message;
      return;
    }
    if (data?.user) st.usuario = data.user;
    fecharSenha();
    toast('Senha salva. Da próxima vez entre com e-mail e senha.');
  }

  /* ---------------- Dados base ---------------- */
  async function carregarBase() {
    const [temporadas, jogadores, apelidos, tipos] = await Promise.all([
      sb.from('temporadas').select('id').order('id', { ascending: false }),
      sb.from('jogadores').select('id,nome').order('nome'),
      sb.from('apelidos').select('slug,jogador_id'),
      sb.from('tipos_honraria').select('id,grupo,nome,icone,descricao').order('ordem'),
    ]).then(rs => rs.map(ok));
    st.temporadas = temporadas.map(t => t.id);
    st.temporada = st.temporadas.includes(st.temporada) ? st.temporada : st.temporadas[0] || null;
    definirJogadores(jogadores);
    st.apelidos = Object.fromEntries(apelidos.map(a => [a.slug, a.jogador_id]));
    st.tipos = tipos;
    renderTemporadas();
  }

  function definirJogadores(lista) {
    st.jogadores = lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
    st.porId = Object.fromEntries(st.jogadores.map(j => [j.id, j]));
  }

  async function carregarElenco() {
    const rows = ok(await sb.from('estatisticas_temporada').select('jogador_id').eq('temporada_id', st.temporada));
    st.elenco = new Set(rows.map(r => r.jogador_id));
  }

  function renderTemporadas() {
    $('#sel-temporada').innerHTML = st.temporadas.map(t => `<option ${t === st.temporada ? 'selected' : ''}>${esc(t)}</option>`).join('');
  }

  /* ---------------- Abas ---------------- */
  const colHonras = () => st.tipos.map(t => ({ k: t.id, r: t.icone, t: `${t.nome} (${t.grupo === 's' ? 'por fut' : 'no mês'}) · ${t.descricao}`, h: true, g: t.grupo }));
  const linha = (id, extra = {}) => ({ id, nome: st.porId[id]?.nome || id, v: {}, ...extra });
  const porNome = (a, b) => a.nome.localeCompare(b.nome, 'pt');

  const ABAS = {
    temporada: {
      desc: 'Totais oficiais da temporada (aba “Médias”). Quem está aqui faz parte do elenco.',
      csv: 'Médias',
      podeAdicionar: true,
      cols: () => [{ k: 'partidas', r: 'Jogos' }, { k: 'gols', r: 'Gols' }, { k: 'assist', r: 'Assist' }],
      async carregar() {
        const [rows, conf] = await Promise.all([
          sb.from('estatisticas_temporada').select('jogador_id,partidas,gols,assist').eq('temporada_id', st.temporada),
          sb.from('v_conferencia').select('nome,gols,assist,gols_meses,assist_meses').eq('temporada', st.temporada).eq('diverge', true),
        ]).then(rs => rs.map(ok));
        st.conferencia = conf;
        return rows.map(r => linha(r.jogador_id, { v: { partidas: r.partidas, gols: r.gols, assist: r.assist } }));
      },
      importar(tabela) {
        for (const l of tabela) {
          const row = acharOuCriar(l.Jogadores, true);
          if (row) row.v = { partidas: inteiro(l.Jogos), gols: inteiro(l.Gols), assist: inteiro(l.Assist) };
        }
      },
      async salvar() {
        const rows = st.linhas.map(l => ({
          temporada_id: st.temporada, jogador_id: l.id,
          partidas: l.v.partidas || 0, gols: l.v.gols || 0, assist: l.v.assist || 0,
        }));
        if (rows.length) ok(await sb.from('estatisticas_temporada').upsert(rows, { onConflict: 'temporada_id,jogador_id' }));
      },
    },

    mes: {
      desc: 'Gols, assistências e honrarias de um mês (aba do mês). Salvar substitui o mês inteiro.',
      csv: 'do mês (ex.: Outubro)',
      podeAdicionar: true,
      podeRemover: true,
      cols: () => [{ k: 'gols', r: 'Gols' }, { k: 'assist', r: 'Assist' }, ...colHonras()],
      async carregar() {
        st.meses = ok(await sb.from('meses').select('mes').eq('temporada_id', st.temporada).order('mes')).map(m => m.mes.slice(0, 7));
        if (!st.mes || (!st.meses.includes(st.mes) && !st.mesNovo)) st.mes = st.meses.at(-1) || new Date().toISOString().slice(0, 7);
        const rows = ok(await sb.from('v_estatisticas_mes').select('id,gols,assist,honras,convidado')
          .eq('temporada', st.temporada).eq('mes', st.mes));
        return rows.map(r => linha(r.id, { convidado: r.convidado, v: { gols: r.gols, assist: r.assist, ...r.honras } }));
      },
      importar(tabela) {
        st.linhas = [];
        for (const l of tabela) {
          const v = { gols: inteiro(l.Gols), assist: inteiro(l.Assist) };
          for (const [col, k] of Object.entries(HONRAS_CSV)) if (contar(l[col])) v[k] = contar(l[col]);
          if (!Object.values(v).some(Boolean)) continue;
          const row = acharOuCriar(l.Jogadores, true);
          if (row) row.v = v;
        }
      },
      async salvar() {
        const p_linhas = st.linhas
          .filter(l => Object.values(l.v).some(Boolean))
          .map(l => ({
            jogador_id: l.id, gols: l.v.gols || 0, assist: l.v.assist || 0,
            honras: Object.fromEntries(st.tipos.filter(t => l.v[t.id] > 0).map(t => [t.id, l.v[t.id]])),
          }));
        ok(await sb.rpc('salvar_mes', { p_temporada: st.temporada, p_mes: `${st.mes}-01`, p_linhas }));
        st.mesNovo = false;
      },
    },

    honrarias: {
      desc: 'Contagem oficial acumulada na temporada (aba “Honrarias”). Só jogadores do elenco.',
      csv: 'Honrarias',
      cols: colHonras,
      async carregar() {
        const rows = ok(await sb.from('honrarias_temporada').select('jogador_id,tipo_id,quantidade').eq('temporada_id', st.temporada));
        const mapa = Object.fromEntries([...st.elenco].map(id => [id, linha(id)]));
        for (const r of rows) if (mapa[r.jogador_id]) mapa[r.jogador_id].v[r.tipo_id] = r.quantidade;
        return Object.values(mapa);
      },
      importar(tabela) {
        for (const l of st.linhas) l.v = {};
        for (const l of tabela) {
          const row = acharOuCriar(l.Jogadores, false);
          if (!row) continue;
          for (const [col, k] of Object.entries(HONRAS_CSV)) if (inteiro(l[col])) row.v[k] = inteiro(l[col]);
        }
      },
      async salvar() {
        const p_linhas = st.linhas.map(l => ({ jogador_id: l.id, honras: l.v }));
        ok(await sb.rpc('salvar_honrarias_temporada', { p_temporada: st.temporada, p_linhas }));
      },
    },

    over: {
      desc: 'Notas dos adms (aba “Over”), de 1 a 99. Deixe em branco quem não tem nota.',
      csv: 'Over',
      vazioEhNulo: true,
      cols: () => NOTAS.map(([k, r]) => ({ k, r })),
      async carregar() {
        const rows = ok(await sb.from('notas_over').select('*').eq('temporada_id', st.temporada));
        const mapa = Object.fromEntries([...st.elenco].map(id => [id, linha(id)]));
        for (const r of rows) if (mapa[r.jogador_id]) {
          mapa[r.jogador_id].tinha = true;
          for (const [k] of NOTAS) mapa[r.jogador_id].v[k] = r[k];
        }
        return Object.values(mapa);
      },
      importar(tabela) {
        for (const l of tabela) {
          const row = acharOuCriar(l.Jogadores, false);
          if (!row) continue;
          row.v = Object.fromEntries(Object.entries(OVER_CSV).map(([col, k]) => [k, l[col] ? inteiro(l[col]) : null]));
        }
      },
      async salvar() {
        const temNota = l => NOTAS.some(([k]) => l.v[k] != null);
        const com = st.linhas.filter(temNota).map(l => ({
          temporada_id: st.temporada, jogador_id: l.id, ...Object.fromEntries(NOTAS.map(([k]) => [k, l.v[k] ?? null])),
        }));
        const sem = st.linhas.filter(l => l.tinha && !temNota(l)).map(l => l.id);
        if (com.length) ok(await sb.from('notas_over').upsert(com, { onConflict: 'temporada_id,jogador_id' }));
        if (sem.length) ok(await sb.from('notas_over').delete().eq('temporada_id', st.temporada).in('jogador_id', sem));
      },
    },
  };

  // Acha a linha do jogador na grade ou cria. Nome desconhecido vira jogador novo (se permitido).
  function acharOuCriar(nome, permitirNovo) {
    nome = limpar(nome);
    const id = resolver(nome);
    if (id) {
      if (!permitirNovo && !st.elenco.has(id)) {
        st.avisos.push(`${nome}: não está no elenco da temporada (cadastre na aba Temporada). Ignorado.`);
        return null;
      }
      let row = st.linhas.find(l => l.id === id);
      if (!row) st.linhas.push(row = linha(id, { convidado: st.aba === 'mes' && !st.elenco.has(id) }));
      return row;
    }
    if (!permitirNovo) {
      st.avisos.push(`${nome}: nome desconhecido. Ignorado.`);
      return null;
    }
    const novoId = slug(nome);
    if (!novoId) return null;
    let row = st.linhas.find(l => l.id === novoId);
    if (!row) {
      st.linhas.push(row = { id: novoId, nome, v: {}, novo: true, convidado: st.aba === 'mes' });
      st.avisos.push(`${nome}: não existe no cadastro. Será criado como jogador novo (se for apelido de alguém, corrija o nome).`);
    }
    return row;
  }

  async function abrirAba(aba) {
    st.aba = aba;
    st.avisos = [];
    $$('#abas .aba').forEach(b => b.classList.toggle('ativa', b.dataset.aba === aba));
    const conteudo = $('#conteudo');
    if (!st.temporada && aba !== 'admins') {
      conteudo.innerHTML = '<p class="adm-vazio">Nenhuma temporada cadastrada. Crie uma acima.</p>';
      return;
    }
    conteudo.innerHTML = '<p class="adm-vazio">Carregando…</p>';
    try {
      if (aba === 'admins') return await renderAdmins();
      await carregarElenco();
      st.linhas = (await ABAS[aba].carregar()).sort(porNome);
      marcarSujo(false);
      renderGrade();
    } catch (e) {
      console.error(e);
      conteudo.innerHTML = `<p class="adm-vazio adm-erro">Erro ao carregar: ${esc(erroLegivel(e))}</p>`;
    }
  }

  /* ---------------- Grade ---------------- */
  function renderGrade() {
    const a = ABAS[st.aba];
    const cols = a.cols();
    const seletorMes = st.aba === 'mes' ? `
      <select id="sel-mes" aria-label="Mês">
        ${[...new Set([...st.meses, st.mes])].sort().map(m => `<option value="${m}" ${m === st.mes ? 'selected' : ''}>${NOME_MES[+m.slice(5, 7)]} ${m.slice(0, 4)}${st.meses.includes(m) ? '' : ' (novo)'}</option>`).join('')}
      </select>
      <input type="month" id="novo-mes" aria-label="Abrir outro mês">
      <button class="btn" id="btn-novo-mes">Abrir mês</button>` : '';
    const adicionar = a.podeAdicionar ? `
      <div class="adm-add">
        <input list="lista-jogadores" id="add-nome" placeholder="Nome do jogador" autocomplete="off">
        <button class="btn" id="btn-add">Adicionar</button>
        <datalist id="lista-jogadores">${st.jogadores.map(j => `<option value="${esc(j.nome)}">`).join('')}</datalist>
      </div>` : '';
    const conferencia = st.aba === 'temporada' && st.conferencia?.length ? `
      <details class="adm-conf">
        <summary>⚠️ ${st.conferencia.length} jogador(es) com total diferente da soma dos meses</summary>
        <ul>${st.conferencia.map(c => `<li>${esc(c.nome)}: temporada ${c.gols}G/${c.assist}A · meses ${c.gols_meses}G/${c.assist_meses}A</li>`).join('')}</ul>
      </details>` : '';

    $('#conteudo').innerHTML = `
      <p class="painel-desc">${a.desc}</p>
      <div class="adm-barra">${seletorMes}</div>
      <details class="adm-csv" ${st.avisos.length ? 'open' : ''}>
        <summary>📋 Colar da planilha (aba ${esc(a.csv)})</summary>
        <p>Selecione a aba inteira no Google Planilhas (Ctrl+A), copie (Ctrl+C) e cole aqui. Também aceita o conteúdo de um .csv exportado. Nada é gravado até você clicar em Salvar.</p>
        <textarea id="csv" placeholder="Jogadores,Gols,Assist,…"></textarea>
        <div class="adm-barra"><button class="btn" id="btn-csv">Pré-visualizar</button></div>
        ${st.avisos.length ? `<ul class="adm-avisos">${st.avisos.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      </details>
      <div class="adm-barra">
        ${adicionar}
        <span class="espaco"></span>
        <span class="adm-sujo" id="aviso-sujo" ${st.sujo ? '' : 'hidden'}>Alterações não salvas</span>
        <button class="btn" id="btn-desfazer">Recarregar</button>
        <button class="btn btn-primario" id="btn-salvar">Salvar</button>
      </div>
      <div class="adm-tabela-box">
        ${st.linhas.length ? `
        <table class="adm-tabela">
          <thead><tr><th>Jogador</th>${cols.map(c => `<th title="${esc(c.t || c.r)}" class="${c.g === 'm' ? 'grupo-m' : ''}">${esc(c.r)}</th>`).join('')}${a.podeRemover ? '<th></th>' : ''}</tr></thead>
          <tbody>${st.linhas.map((l, i) => `
            <tr class="${l.novo ? 'novo' : l.convidado ? 'convidado' : ''}">
              <td>${esc(l.nome)}</td>
              ${cols.map(c => {
                const v = l.v[c.k];
                const mostra = v == null || (c.h && !v) ? '' : v;
                return `<td class="${c.h ? 'h' : ''} ${c.g === 'm' ? 'grupo-m' : ''}"><input type="number" min="0" max="${a.vazioEhNulo ? 99 : ''}" inputmode="numeric" data-i="${i}" data-k="${c.k}" value="${mostra}" aria-label="${esc(l.nome)} · ${esc(c.t || c.r)}"></td>`;
              }).join('')}
              ${a.podeRemover ? `<td><button class="remover" data-remover="${i}" aria-label="Remover ${esc(l.nome)}">×</button></td>` : ''}
            </tr>`).join('')}
          </tbody>
        </table>` : `<p class="adm-vazio">${st.aba === 'temporada' || st.aba === 'mes' ?'Nenhum jogador ainda. Adicione ou cole da planilha.' : 'O elenco da temporada está vazio. Cadastre os jogadores na aba Temporada.'}</p>`}
      </div>
      ${conferencia}`;
  }

  function adicionarJogador() {
    const nome = limpar($('#add-nome').value);
    if (!nome) return;
    const antes = st.linhas.length;
    st.avisos = [];
    const row = acharOuCriar(nome, true);
    if (!row) return toast('Nome inválido.');
    if (st.linhas.length === antes) return toast(`${row.nome} já está na lista.`);
    if (st.aba === 'temporada') row.v = { partidas: 0, gols: 0, assist: 0 };
    st.linhas.sort(porNome);
    marcarSujo();
    renderGrade();
    $('#add-nome').focus();
  }

  function importarCsv() {
    const tabela = lerTabela($('#csv').value);
    if (!tabela.length) return toast('Não achei linhas. A primeira linha precisa ter a coluna “Jogadores”.');
    st.avisos = [];
    ABAS[st.aba].importar(tabela);
    st.linhas.sort(porNome);
    marcarSujo();
    renderGrade();
    toast(`${tabela.length} linhas lidas. Confira a tabela e clique em Salvar.`);
  }

  async function salvar() {
    const btn = $('#btn-salvar');
    btn.disabled = true;
    btn.textContent = 'Salvando…';
    try {
      const novos = st.linhas.filter(l => l.novo).map(l => ({ id: l.id, nome: l.nome }));
      if (novos.length) {
        ok(await sb.from('jogadores').insert(novos));
        definirJogadores([...st.jogadores, ...novos]);
        // já gravados: se o passo seguinte falhar, o novo Salvar não tenta inserir de novo
        for (const l of st.linhas) delete l.novo;
      }
      await ABAS[st.aba].salvar();
      marcarSujo(false);
      toast('Salvo ✔');
      await abrirAba(st.aba);
    } catch (e) {
      console.error(e);
      toast('Erro ao salvar: ' + erroLegivel(e));
      btn.disabled = false;
      btn.textContent = 'Salvar';
    }
  }

  /* ---------------- Admins ---------------- */
  async function renderAdmins() {
    const [perfis, convites] = await Promise.all([
      sb.from('profiles').select('id,email,nome,papel').order('email'),
      sb.from('convites_admin').select('email').order('email'),
    ]).then(rs => rs.map(ok));
    $('#conteudo').innerHTML = `
      <p class="painel-desc">Novo adm: adicione o e-mail aqui. A pessoa entra em “Primeiro acesso”, recebe o link, já nasce adm e cria a senha. Tirar da lista não remove o acesso: use “Remover admin” abaixo.</p>
      <h2 class="adm-sub">Convites de admin</h2>
      <form class="adm-form" id="form-convite">
        <input type="email" id="convite-email" required placeholder="email@exemplo.com">
        <button class="btn btn-primario" type="submit">Convidar</button>
      </form>
      <ul class="adm-lista" style="margin-top:12px">
        ${convites.map(c => `<li><span class="grow">${esc(c.email)}</span><button class="btn btn-perigo" data-tirar-convite="${esc(c.email)}">Tirar</button></li>`).join('') || '<li>Nenhum convite.</li>'}
      </ul>
      <h2 class="adm-sub">Contas</h2>
      <ul class="adm-lista">
        ${perfis.map(p => `
          <li>
            <span class="grow">${esc(p.nome || '')} <small style="color:var(--texto-3)">${esc(p.email || '')}</small></span>
            ${p.papel === 'admin' ? '<span class="adm-tag">admin</span>' : ''}
            ${p.id === st.usuario.id ? '<small style="color:var(--texto-3)">você</small>' : `<button class="btn" data-papel="${p.papel === 'admin' ? 'leitor' : 'admin'}" data-usuario="${p.id}">${p.papel === 'admin' ? 'Remover admin' : 'Tornar admin'}</button>`}
          </li>`).join('')}
      </ul>`;
  }

  async function acaoAdmin(fn, msg) {
    try {
      await fn();
      toast(msg);
      await renderAdmins();
    } catch (e) {
      toast('Erro: ' + erroLegivel(e));
    }
  }

  /* ---------------- Eventos ---------------- */
  function ligarEventos() {
    $('#form-login').addEventListener('submit', entrarComSenha);
    $('#btn-link').addEventListener('click', enviarLink);
    $('#form-senha').addEventListener('submit', salvarSenha);
    $('#btn-senha').addEventListener('click', () => abrirSenha());
    $('#btn-senha-fechar').addEventListener('click', fecharSenha);
    $('#btn-senha-sair').addEventListener('click', async () => { fecharSenha(); await sb.auth.signOut(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal-senha').hidden && !senhaObrigatoria) fecharSenha(); });
    $('#btn-sair').addEventListener('click', async () => {
      if (!confirmarDescarte()) return;
      marcarSujo(false);
      await sb.auth.signOut();
    });

    $('#abas').addEventListener('click', e => {
      const b = e.target.closest('[data-aba]');
      if (b && confirmarDescarte()) abrirAba(b.dataset.aba);
    });

    $('#sel-temporada').addEventListener('change', e => {
      if (!confirmarDescarte()) { e.target.value = st.temporada; return; }
      st.temporada = e.target.value;
      st.mes = null;
      abrirAba(st.aba);
    });

    $('#btn-nova-temporada').addEventListener('click', async () => {
      const id = $('#nova-temporada').value.trim().toLowerCase();
      if (!/^[0-9]{4}[a-z0-9-]*$/.test(id)) return toast('Use o ano, ex.: 2027');
      if (st.temporadas.includes(id)) return toast('Essa temporada já existe.');
      try {
        ok(await sb.from('temporadas').insert({ id, nome: `Temporada ${id}` }));
        st.temporada = id;
        st.mes = null;
        $('#nova-temporada').value = '';
        await carregarBase();
        await abrirAba('temporada');
        toast(`Temporada ${id} criada.`);
      } catch (e) {
        toast('Erro: ' + erroLegivel(e));
      }
    });

    const conteudo = $('#conteudo');
    conteudo.addEventListener('input', e => {
      const inp = e.target.closest('input[data-k]');
      if (!inp) return;
      const l = st.linhas[+inp.dataset.i];
      l.v[inp.dataset.k] = inp.value === '' ? (ABAS[st.aba].vazioEhNulo ? null : 0) : Math.max(0, Math.trunc(+inp.value));
      marcarSujo();
    });
    conteudo.addEventListener('change', e => {
      if (e.target.id === 'sel-mes') {
        if (!confirmarDescarte()) { e.target.value = st.mes; return; }
        st.mes = e.target.value;
        abrirAba('mes');
      }
    });
    conteudo.addEventListener('keydown', e => {
      if (e.target.id === 'add-nome' && e.key === 'Enter') { e.preventDefault(); adicionarJogador(); }
    });
    conteudo.addEventListener('submit', e => {
      if (e.target.id !== 'form-convite') return;
      e.preventDefault();
      const email = $('#convite-email').value.trim().toLowerCase();
      acaoAdmin(async () => ok(await sb.from('convites_admin').insert({ email })), `${email} convidado.`);
    });
    conteudo.addEventListener('click', e => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.id === 'btn-add') adicionarJogador();
      else if (t.id === 'btn-csv') importarCsv();
      else if (t.id === 'btn-salvar') salvar();
      else if (t.id === 'btn-desfazer') { if (confirmarDescarte()) { st.mesNovo = false; abrirAba(st.aba); } }
      else if (t.id === 'btn-novo-mes') {
        const m = $('#novo-mes').value;
        if (!m) return toast('Escolha o mês.');
        if (!confirmarDescarte()) return;
        st.mes = m;
        st.mesNovo = !st.meses.includes(m);
        abrirAba('mes');
      } else if (t.dataset.remover != null) {
        st.linhas.splice(+t.dataset.remover, 1);
        marcarSujo();
        renderGrade();
      } else if (t.dataset.tirarConvite) {
        const email = t.dataset.tirarConvite;
        acaoAdmin(async () => ok(await sb.from('convites_admin').delete().eq('email', email)), `${email} saiu dos convites.`);
      } else if (t.dataset.papel) {
        acaoAdmin(async () => ok(await sb.rpc('definir_papel', { p_usuario: t.dataset.usuario, p_papel: t.dataset.papel })), 'Papel alterado.');
      }
    });

    window.addEventListener('beforeunload', e => { if (st.sujo) { e.preventDefault(); e.returnValue = ''; } });
  }

  ligarEventos();
  // INITIAL_SESSION chega logo após inscrever; o setTimeout evita chamar o Supabase dentro do callback.
  sb.auth.onAuthStateChange((_ev, session) => setTimeout(() => aoMudarSessao(session), 0));
})();
