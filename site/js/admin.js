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
    if (/alteracoes_uma_pendente/.test(m)) return 'Já existe uma alteração desta aba esperando revisão. Aprove ou cancele em Revisões antes.';
    if (/relation .*alteracoes.* does not exist|Could not find the table/i.test(m)) return 'A revisão de alterações ainda não foi instalada no banco (rode a migração revisao_de_alteracoes).';
    if (/row-level security|permission denied|42501/.test(m)) return 'Sem permissão. Sua conta precisa ser admin (ou a sessão expirou: saia e entre de novo).';
    return m;
  }

  function mostrar(tela) {
    $('#carregando').hidden = true;
    for (const t of ['login', 'espera', 'painel']) $(`#tela-${t}`).hidden = t !== tela;
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
      // Conta nova fica pendente até um adm aprovar na aba Admins (como um pedido de amizade)
      if (!ok(await sb.rpc('is_admin'))) return mostrarEspera();
      await carregarBase();
      atualizarPedidos();
      atualizarRevisoes();
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

  async function mostrarEspera() {
    const { data } = await sb.from('profiles').select('papel').eq('id', st.usuario.id).maybeSingle();
    const recusado = data?.papel === 'recusado';
    $('#espera-kicker').textContent = recusado ? 'Pedido recusado' : 'Pedido enviado';
    $('#espera-titulo').textContent = recusado ? 'Sem acesso' : 'Aguardando aprovação';
    $('#espera-desc').textContent = recusado
      ? `Os adms não liberaram o acesso para ${st.usuario.email}. Os números continuam no site público.`
      : `Sua conta (${st.usuario.email}) foi criada. Um adm precisa aprovar o seu acesso. Depois da aprovação, clique em “Verificar de novo”.`;
    $('#btn-espera-verificar').hidden = recusado;
    mostrar('espera');
  }

  // Mostra no botão da aba quantos pedidos de acesso estão esperando
  async function atualizarPedidos() {
    const { count } = await sb.from('profiles').select('id', { count: 'exact', head: true }).eq('papel', 'leitor');
    $('[data-aba="admins"]').textContent = count ? `🔑 Admins · ${count} pedido${count > 1 ? 's' : ''}` : '🔑 Admins';
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
    // Qualquer um pode criar conta; ela fica pendente até um adm aprovar
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
    msg.textContent = `Pronto! Abra o link enviado para ${email}. No primeiro acesso, um adm precisa aprovar sua conta. Se não aparecer, olhe o spam.`;
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
      desc: 'Totais oficiais da temporada (aba “Médias”). Quem está aqui faz parte do elenco. Gols, assistências e honrarias lançados na aba Mês já somam aqui sozinhos ao aprovar; use esta aba para jogos, novos jogadores no elenco e correções.',
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
      payload: () => ({
        linhas: st.linhas.map(l => ({ jogador_id: l.id, partidas: l.v.partidas || 0, gols: l.v.gols || 0, assist: l.v.assist || 0 })),
      }),
    },

    mes: {
      desc: 'Gols, assistências e honrarias de um mês (aba do mês). Ao aprovar, substitui o mês inteiro e soma a diferença nos totais da temporada de quem é do elenco. Jogos: atualize na aba Temporada.',
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
      payload: () => ({
        linhas: st.linhas
          .filter(l => Object.values(l.v).some(Boolean))
          .map(l => ({
            jogador_id: l.id, gols: l.v.gols || 0, assist: l.v.assist || 0,
            honras: Object.fromEntries(st.tipos.filter(t => l.v[t.id] > 0).map(t => [t.id, l.v[t.id]])),
          })),
      }),
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
      payload: () => ({ linhas: st.linhas.map(l => ({ jogador_id: l.id, honras: l.v })) }),
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
      payload() {
        const temNota = l => NOTAS.some(([k]) => l.v[k] != null);
        return {
          com: st.linhas.filter(temNota).map(l => ({ jogador_id: l.id, ...Object.fromEntries(NOTAS.map(([k]) => [k, l.v[k] ?? null])) })),
          sem: st.linhas.filter(l => l.tinha && !temNota(l)).map(l => l.id),
        };
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
    if (!st.temporada && aba !== 'admins' && aba !== 'revisoes') {
      conteudo.innerHTML = '<p class="adm-vazio">Nenhuma temporada cadastrada. Crie uma acima.</p>';
      return;
    }
    conteudo.innerHTML = '<p class="adm-vazio">Carregando…</p>';
    try {
      if (aba === 'admins') return await renderAdmins();
      if (aba === 'revisoes') return await renderRevisoes();
      await carregarElenco();
      st.linhas = (await ABAS[aba].carregar()).sort(porNome);
      // foto do que está gravado, para montar o resumo da alteração
      st.original = new Map(st.linhas.map(l => [l.id, { nome: l.nome, v: { ...l.v } }]));
      st.pendente = await pendenteDaAba();
      marcarSujo(false);
      renderGrade();
    } catch (e) {
      console.error(e);
      conteudo.innerHTML = `<p class="adm-vazio adm-erro">Erro ao carregar: ${esc(erroLegivel(e))}</p>`;
    }
  }

  /* ---------------- Revisão ---------------- */
  const mesData = () => (st.aba === 'mes' ? `${st.mes}-01` : null);
  const nomeMes = m => `${NOME_MES[+m.slice(5, 7)]} ${m.slice(0, 4)}`;
  const sinal = n => (n > 0 ? `+${n}` : String(n));

  async function pendenteDaAba() {
    let q = sb.from('alteracoes').select('id,autor').eq('temporada_id', st.temporada).eq('aba', st.aba).eq('status', 'pendente');
    q = st.aba === 'mes' ? q.eq('mes', mesData()) : q.is('mes', null);
    const { data } = await q.maybeSingle();
    return data || null;
  }

  // Compara a grade com o que está gravado: [{ nome, estado, mudancas: [{ r, tipo, de, para }] }]
  function montarResumo() {
    const a = ABAS[st.aba];
    const cols = a.cols();
    const tipo = c => (c.h ? 'honra' : a.vazioEhNulo ? 'nota' : 'num');
    const rotulo = c => {
      if (!c.h) return c.r;
      const t = st.tipos.find(x => x.id === c.k);
      return `${t.icone} ${t.nome}${t.grupo === 'm' ? ' do mês' : ''}`;
    };
    const norm = v => (a.vazioEhNulo ? v ?? null : v || 0);
    const atuais = new Map(st.linhas
      .filter(l => st.aba !== 'mes' || Object.values(l.v).some(Boolean))
      .map(l => [l.id, l]));
    const itens = [];
    for (const id of new Set([...st.original.keys(), ...atuais.keys()])) {
      const ori = st.original.get(id), cur = atuais.get(id);
      const mudancas = cols
        .map(c => ({ k: c.k, r: rotulo(c), tipo: tipo(c), de: norm(ori?.v[c.k]), para: norm(cur?.v[c.k]) }))
        .filter(m => m.de !== m.para);
      const estado = !ori ? 'entrou' : !cur ? 'saiu' : null;
      if (mudancas.length || estado) itens.push({ id, nome: (cur || ori).nome, estado, cadastroNovo: !!cur?.novo, mudancas });
    }
    itens.sort(porNome);
    const titulo = { temporada: `Totais da temporada ${st.temporada}`, mes: nomeMes(st.mes), honrarias: `Honrarias da temporada ${st.temporada}`, over: `Notas dos adms · ${st.temporada}` }[st.aba];
    return { titulo, itens };
  }

  const textoMudanca = m => (m.tipo === 'nota'
    ? `${m.r} ${m.de ?? '—'} → ${m.para ?? '—'}`
    : `${m.r} ${m.de} → ${m.para} (${sinal(m.para - m.de)})`);

  // Texto para o grupo do WhatsApp (negrito com *)
  function relatorio(alt) {
    const curto = (m, n) => (m.tipo === 'honra' ? m.r
      : { Gols: Math.abs(n) === 1 ? 'gol' : 'gols', Assist: 'assist.', Jogos: Math.abs(n) === 1 ? 'jogo' : 'jogos' }[m.r] || m.r);
    const linhas = alt.resumo.itens.map(i => {
      if (i.estado === 'saiu') return `*${i.nome}*: saiu da lista`;
      const partes = i.mudancas.map(m => (m.tipo === 'nota'
        ? `${m.r} ${m.de ?? '—'}→${m.para ?? '—'}`
        : `${sinal(m.para - m.de)} ${curto(m, m.para - m.de)}`));
      return `*${i.nome}*${i.estado === 'entrou' ? ' (novo na lista)' : ''}: ${partes.join(' · ')}`;
    });
    return [`⚽ *FUT CDM · ${alt.resumo.titulo}*`, 'Atualização revisada e aprovada ✅', '', ...linhas, '', `📊 ${location.origin}/`].join('\n');
  }

  function abrirRelatorio(alt) {
    const texto = relatorio(alt);
    $('#relatorio-texto').value = texto;
    $('#btn-rel-whats').href = `https://wa.me/?text=${encodeURIComponent(texto)}`;
    $('#modal-relatorio').hidden = false;
  }

  async function enviarRevisao() {
    const resumo = montarResumo();
    if (!resumo.itens.length) return toast('Nada mudou em relação ao que está gravado.');
    const btn = $('#btn-salvar');
    btn.disabled = true;
    btn.textContent = 'Enviando…';
    try {
      const payload = { ...ABAS[st.aba].payload(), novos: st.linhas.filter(l => l.novo).map(l => ({ id: l.id, nome: l.nome })) };
      ok(await sb.from('alteracoes').insert({ temporada_id: st.temporada, aba: st.aba, mes: mesData(), payload, resumo }));
      marcarSujo(false);
      toast('Enviado para revisão. Outro adm precisa aprovar.');
      atualizarRevisoes();
      await abrirAba(st.aba);
    } catch (e) {
      console.error(e);
      toast('Erro ao enviar: ' + erroLegivel(e));
      btn.disabled = false;
      btn.textContent = 'Enviar para revisão';
    }
  }

  async function atualizarRevisoes() {
    const { count } = await sb.from('alteracoes').select('id', { count: 'exact', head: true }).eq('status', 'pendente');
    $('[data-aba="revisoes"]').textContent = count ? `🧾 Revisões · ${count}` : '🧾 Revisões';
  }

  async function renderRevisoes() {
    const rows = ok(await sb.from('alteracoes')
      .select('id,temporada_id,aba,mes,resumo,status,criado_por,autor,criado_em,revisor,revisado_em,motivo')
      .order('criado_em', { ascending: false }).limit(40));
    st.revisoes = Object.fromEntries(rows.map(r => [r.id, r]));
    const quando = d => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const pendentes = rows.filter(r => r.status === 'pendente');
    const historico = rows.filter(r => r.status !== 'pendente');
    const STATUS = { aprovada: '✅ aprovada', recusada: '❌ recusada', cancelada: '↩️ cancelada' };
    const cartao = r => {
      const meu = r.criado_por === st.usuario.id;
      return `
        <article class="adm-rev">
          <header><b>${esc(r.resumo.titulo)}</b> <small>enviado por ${esc(r.autor || '?')} · ${quando(r.criado_em)}</small></header>
          <ul>${r.resumo.itens.map(i => `
            <li><b>${esc(i.nome)}</b>${i.estado === 'entrou' ? ` <span class="adm-tag">${i.cadastroNovo ? 'jogador novo' : 'entrou'}</span>` : ''}${i.estado === 'saiu' ? ' <span class="adm-tag adm-tag-saiu">saiu</span>' : ''}
              ${i.mudancas.length ? `<span class="adm-rev-mud">${i.mudancas.map(m => esc(textoMudanca(m))).join(' · ')}</span>` : ''}</li>`).join('')}
          </ul>
          <div class="adm-barra">
            ${meu
              ? '<span class="adm-sujo">Aguardando outro adm aprovar</span><span class="espaco"></span><button class="btn btn-perigo" data-cancelar="' + r.id + '">Cancelar</button>'
              : '<span class="espaco"></span><button class="btn btn-perigo" data-recusar="' + r.id + '">Recusar</button><button class="btn btn-primario" data-aprovar="' + r.id + '">Aprovar</button>'}
          </div>
        </article>`;
    };
    $('#conteudo').innerHTML = `
      <p class="painel-desc">Toda mudança nas estatísticas passa por aqui: outro adm confere e aprova, e só então ela vai para o site. Depois de aprovar, mande o relatório no grupo.</p>
      <h2 class="adm-sub">Pendentes${pendentes.length ? ` · ${pendentes.length}` : ''}</h2>
      ${pendentes.map(cartao).join('') || '<p class="adm-vazio">Nenhuma alteração esperando revisão.</p>'}
      <h2 class="adm-sub">Histórico</h2>
      <ul class="adm-lista">
        ${historico.map(r => `
          <li>
            <span class="grow"><b>${esc(r.resumo.titulo)}</b> <small style="color:var(--texto-3)">${STATUS[r.status]} · por ${esc(r.autor || '?')}${r.revisor ? `, revisado por ${esc(r.revisor)}` : ''} · ${quando(r.revisado_em || r.criado_em)}${r.motivo ? ` · “${esc(r.motivo)}”` : ''}</small></span>
            ${r.status === 'aprovada' ? `<button class="btn" data-relatorio="${r.id}">Relatório</button>` : ''}
          </li>`).join('') || '<li>Nada ainda.</li>'}
      </ul>`;
    atualizarRevisoes();
  }

  async function acaoRevisao(fn, msg, depois) {
    try {
      await fn();
      toast(msg);
      await renderRevisoes();
      depois?.();
    } catch (e) {
      toast('Erro: ' + erroLegivel(e));
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
        <p>Selecione a aba inteira no Google Planilhas (Ctrl+A), copie (Ctrl+C) e cole aqui. Também aceita o conteúdo de um .csv exportado. Nada vai para o site até outro adm aprovar.</p>
        <textarea id="csv" placeholder="Jogadores,Gols,Assist,…"></textarea>
        <div class="adm-barra"><button class="btn" id="btn-csv">Pré-visualizar</button></div>
        ${st.avisos.length ? `<ul class="adm-avisos">${st.avisos.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      </details>
      ${st.pendente ? `<p class="adm-pendente">⏳ Já existe uma alteração desta ${st.aba === 'mes' ? 'aba neste mês' : 'aba'} esperando revisão (enviada por ${esc(st.pendente.autor || '?')}). Ela precisa ser aprovada ou cancelada antes de enviar outra. <button class="adm-link" data-ir="revisoes">Ver em Revisões</button></p>` : ''}
      <div class="adm-barra">
        ${adicionar}
        <span class="espaco"></span>
        <span class="adm-sujo" id="aviso-sujo" ${st.sujo ? '' : 'hidden'}>Alterações não enviadas</span>
        <button class="btn" id="btn-desfazer">Recarregar</button>
        <button class="btn btn-primario" id="btn-salvar" ${st.pendente ? 'disabled' : ''}>${st.pendente ? 'Aguardando revisão' : 'Enviar para revisão'}</button>
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
    toast(`${tabela.length} linhas lidas. Confira a tabela e clique em Enviar para revisão.`);
  }

  /* ---------------- Admins ---------------- */
  async function renderAdmins() {
    const [perfis, convites] = await Promise.all([
      sb.from('profiles').select('id,email,nome,papel').order('email'),
      sb.from('convites_admin').select('email').order('email'),
    ]).then(rs => rs.map(ok));
    const conta = p => `<span class="grow">${esc(p.nome || '')} <small style="color:var(--texto-3)">${esc(p.email || '')}</small></span>`;
    const pedidos = perfis.filter(p => p.papel === 'leitor');
    const admins = perfis.filter(p => p.papel === 'admin');
    const recusados = perfis.filter(p => p.papel === 'recusado');
    $('#conteudo').innerHTML = `
      <p class="painel-desc">Qualquer pessoa pode criar conta em “Primeiro acesso”. A conta só vira adm quando alguém daqui aprova.</p>
      <h2 class="adm-sub">Pedidos de acesso${pedidos.length ? ` · ${pedidos.length}` : ''}</h2>
      <ul class="adm-lista">
        ${pedidos.map(p => `
          <li>
            ${conta(p)}
            <button class="btn btn-primario" data-papel="admin" data-usuario="${p.id}" data-msg="${esc(p.email)} agora é adm.">Aprovar</button>
            <button class="btn btn-perigo" data-papel="recusado" data-usuario="${p.id}" data-msg="Pedido de ${esc(p.email)} recusado.">Recusar</button>
          </li>`).join('') || '<li>Nenhum pedido esperando.</li>'}
      </ul>
      <h2 class="adm-sub">Adms</h2>
      <ul class="adm-lista">
        ${admins.map(p => `
          <li>
            ${conta(p)}
            ${p.id === st.usuario.id ? '<small style="color:var(--texto-3)">você</small>' : `<button class="btn btn-perigo" data-papel="recusado" data-usuario="${p.id}" data-msg="${esc(p.email)} não é mais adm.">Remover</button>`}
          </li>`).join('')}
      </ul>
      ${recusados.length ? `
      <details class="adm-conf">
        <summary>Recusados (${recusados.length})</summary>
        <ul class="adm-lista" style="margin-top:8px">
          ${recusados.map(p => `<li>${conta(p)}<button class="btn" data-papel="admin" data-usuario="${p.id}" data-msg="${esc(p.email)} agora é adm.">Aprovar</button></li>`).join('')}
        </ul>
      </details>` : ''}
      <details class="adm-conf">
        <summary>Pré-aprovados (${convites.length}): e-mails que já entram como adm, sem pedido</summary>
        <form class="adm-form" id="form-convite" style="margin-top:8px">
          <input type="email" id="convite-email" required placeholder="email@exemplo.com">
          <button class="btn btn-primario" type="submit">Adicionar</button>
        </form>
        <ul class="adm-lista" style="margin-top:8px">
          ${convites.map(c => `<li><span class="grow">${esc(c.email)}</span><button class="btn btn-perigo" data-tirar-convite="${esc(c.email)}">Tirar</button></li>`).join('') || '<li>Nenhum.</li>'}
        </ul>
      </details>`;
    atualizarPedidos();
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
    $('#btn-espera-verificar').addEventListener('click', async () => {
      const { data } = await sb.auth.getSession();
      sessaoAtual = undefined;
      await aoMudarSessao(data.session);
      if (!$('#tela-espera').hidden) toast('Ainda não foi aprovado.');
    });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (!$('#modal-senha').hidden && !senhaObrigatoria) fecharSenha();
      $('#modal-relatorio').hidden = true;
    });
    $('#btn-rel-fechar').addEventListener('click', () => { $('#modal-relatorio').hidden = true; });
    $('#btn-rel-copiar').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText($('#relatorio-texto').value);
        toast('Relatório copiado. É só colar no grupo.');
      } catch {
        $('#relatorio-texto').select();
        toast('Selecionei o texto: use Ctrl+C.');
      }
    });
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
      else if (t.id === 'btn-salvar') enviarRevisao();
      else if (t.dataset.ir) { if (confirmarDescarte()) abrirAba(t.dataset.ir); }
      else if (t.dataset.aprovar) {
        const alt = st.revisoes[t.dataset.aprovar];
        acaoRevisao(async () => ok(await sb.rpc('aprovar_alteracao', { p_id: alt.id })), 'Aprovado e aplicado no site ✔', () => abrirRelatorio(alt));
      } else if (t.dataset.recusar) {
        const motivo = prompt('Motivo da recusa (opcional):');
        if (motivo === null) return;
        acaoRevisao(async () => ok(await sb.rpc('recusar_alteracao', { p_id: +t.dataset.recusar, p_motivo: motivo })), 'Alteração recusada.');
      } else if (t.dataset.cancelar) {
        if (!confirm('Cancelar esta alteração? Ela não será aplicada.')) return;
        acaoRevisao(async () => ok(await sb.rpc('recusar_alteracao', { p_id: +t.dataset.cancelar })), 'Alteração cancelada.');
      } else if (t.dataset.relatorio) abrirRelatorio(st.revisoes[t.dataset.relatorio]);
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
        acaoAdmin(async () => ok(await sb.rpc('definir_papel', { p_usuario: t.dataset.usuario, p_papel: t.dataset.papel })), t.dataset.msg || 'Papel alterado.');
      }
    });

    window.addEventListener('beforeunload', e => { if (st.sujo) { e.preventDefault(); e.returnValue = ''; } });
  }

  ligarEventos();
  // INITIAL_SESSION chega logo após inscrever; o setTimeout evita chamar o Supabase dentro do callback.
  sb.auth.onAuthStateChange((_ev, session) => setTimeout(() => aoMudarSessao(session), 0));
})();
