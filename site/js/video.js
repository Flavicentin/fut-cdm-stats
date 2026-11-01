/* Fut CDM — vídeo Bar Chart Race de um fut: cada lance sobe a barra do jogador.
   Desenha num canvas vertical e grava com MediaRecorder, no navegador de quem pediu. */
window.VideoFut = (() => {
  'use strict';

  const W = 1080, H = 1920, M = 60;
  const ABERTURA = 3, FINAL = 6, RESPIRO = 1;     // segundos
  const CORRIDA_ALVO = 50, PASSO_MIN = .6, PASSO_MAX = 1.2;
  const ANIMACAO = .35;                           // duração da subida da barra a cada lance
  const LINHAS = 10, ALTURA_LINHA = 130, TOPO_LINHAS = 340;
  const FORMATOS = ['video/mp4;codecs=avc1.42E01F', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

  const suave = p => 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3);
  const entre = (a, b, p) => a + (b - a) * p;

  /* Confere os lances contra os números do fut: o vídeo nunca pode mostrar um total diferente do site */
  function lancesConferem(d) {
    const conta = {};
    for (const l of d.lances) (conta[l.jogador] ||= { gol: 0, assist: 0 })[l.tipo]++;
    const jogadores = d.times.flatMap(t => t.jogadores);
    return Object.keys(conta).every(id => jogadores.some(p => p.id === id))
      && jogadores.every(p => (conta[p.id]?.gol || 0) === p.gols && (conta[p.id]?.assist || 0) === p.assist);
  }

  /* Uma foto da partida a cada lance: G+A, ordem das barras e placar depois dele */
  function montarLinhaDoTempo(d) {
    const pessoas = {};
    d.times.forEach(t => t.jogadores.forEach(p => { pessoas[p.id] = { ...p, n: t.n }; }));
    const ga = Object.fromEntries(Object.keys(pessoas).map(id => [id, 0]));
    const chegou = {};
    const placar = Object.fromEntries(d.times.map(t => [t.n, 0]));
    const foto = () => ({
      ga: { ...ga }, placar: { ...placar },
      rank: Object.fromEntries(Object.keys(ga)
        .sort((a, b) => ga[b] - ga[a] || (chegou[a] ?? 1e9) - (chegou[b] ?? 1e9) || pessoas[a].nome.localeCompare(pessoas[b].nome))
        .map((id, i) => [id, i])),
    });
    const quadros = [foto()];
    d.lances.forEach((l, i) => {
      ga[l.jogador]++;
      chegou[l.jogador] = i;
      if (l.tipo === 'gol') placar[pessoas[l.jogador].n]++;
      quadros.push(foto());
    });
    const passo = Math.min(PASSO_MAX, Math.max(PASSO_MIN, CORRIDA_ALVO / d.lances.length));
    const corrida = d.lances.length * passo + RESPIRO;
    return { pessoas, quadros, passo, corrida, total: ABERTURA + corrida + FINAL };
  }

  /* ---------------- Desenho ---------------- */
  function foto(ctx, x, y, r, pessoa, img, cor) {
    const { COR, TITULO } = Exportar;
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath();
    ctx.fillStyle = '#16211b'; ctx.fill(); ctx.clip();
    if (img) {
      const lado = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, x - r, y - r, r * 2, r * 2);
    } else {
      ctx.fillStyle = COR.texto; ctx.font = `${r * .8}px ${TITULO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(pessoa.iniciais, x, y + 2);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = cor; ctx.lineWidth = 5; ctx.stroke();
  }

  function marca(ctx, d) {
    const { COR, TITULO, TEXTO } = Exportar;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = COR.texto; ctx.font = `64px ${TITULO}`; ctx.fillText('FUT', M, 120);
    ctx.fillStyle = COR.acento; ctx.fillText('CDM', M + ctx.measureText('FUT ').width, 120);
    ctx.font = `700 30px ${TEXTO}`; ctx.textAlign = 'right';
    ctx.fillText(`FUT DE ${d.data}`, W - M, 114);
    ctx.textAlign = 'left';
  }

  function rodape(ctx, d) {
    const { COR, TEXTO } = Exportar;
    ctx.fillStyle = COR.texto3; ctx.font = `600 26px ${TEXTO}`; ctx.textAlign = 'center';
    ctx.fillText(d.site, W / 2, H - 44);
    ctx.textAlign = 'left';
  }

  function desenharAbertura(ctx, d, p) {
    const { COR, TITULO, TEXTO, retangulo, fundo } = Exportar;
    fundo(ctx, W, H);
    marca(ctx, d);
    ctx.globalAlpha = suave(p * 3);
    ctx.fillStyle = COR.texto; ctx.font = `150px ${TITULO}`; ctx.textAlign = 'center';
    ctx.fillText('A CORRIDA', W / 2, 620);
    ctx.fillStyle = COR.acento; ctx.fillText('DO FUT', W / 2, 770);
    ctx.font = `600 38px ${TEXTO}`; ctx.fillStyle = COR.texto2;
    ctx.fillText('Cada gol e assistência, na ordem', W / 2, 850);
    ctx.textAlign = 'left';
    d.times.forEach((t, i) => {
      const y = 960 + i * 130;
      ctx.globalAlpha = suave((p - .15 - i * .1) * 4);
      retangulo(ctx, M + 80, y, W - 2 * M - 160, 106, 22); ctx.fillStyle = COR.card; ctx.fill();
      retangulo(ctx, M + 80, y, 16, 106, 8); ctx.fillStyle = d.cores[t.n]; ctx.fill();
      ctx.fillStyle = COR.texto; ctx.font = `62px ${TITULO}`; ctx.fillText(t.nome.toUpperCase(), M + 130, y + 74);
    });
    ctx.globalAlpha = 1;
    rodape(ctx, d);
  }

  function desenharPlacar(ctx, d, antes, depois, p) {
    const { COR, TITULO, TEXTO, retangulo } = Exportar;
    const larg = (W - 2 * M - 30 * (d.times.length - 1)) / d.times.length;
    const lider = Math.max(...Object.values(depois.placar));
    d.times.forEach((t, i) => {
      const x = M + i * (larg + 30), valor = depois.placar[t.n];
      retangulo(ctx, x, 170, larg, 130, 20); ctx.fillStyle = COR.card; ctx.fill();
      retangulo(ctx, x, 170, larg, 10, 5); ctx.fillStyle = d.cores[t.n]; ctx.fill();
      ctx.fillStyle = COR.texto2; ctx.font = `600 26px ${TEXTO}`; ctx.textAlign = 'center';
      ctx.fillText(t.nome, x + larg / 2, 222);
      const cresceu = valor !== antes.placar[t.n] ? 1 + .25 * (1 - suave(p)) : 1;
      ctx.fillStyle = valor === lider && valor > 0 ? COR.acento : COR.texto;
      ctx.font = `${Math.round(66 * cresceu)}px ${TITULO}`;
      ctx.fillText(String(valor), x + larg / 2, 284);
      ctx.textAlign = 'left';
    });
  }

  function desenharBarras(ctx, d, tl, antes, depois, p, atual) {
    const { COR, TITULO, TEXTO, retangulo, textoAjustado } = Exportar;
    const X = 118, R = 46, FOLGA = 150;
    const escala = (W - X - R - FOLGA) / Math.max(3, entre(Math.max(...Object.values(antes.ga)), Math.max(...Object.values(depois.ga)), p));
    const linhas = Object.keys(tl.pessoas)
      .map(id => ({ id, pessoa: tl.pessoas[id], pos: entre(antes.rank[id], depois.rank[id], p), valor: entre(antes.ga[id], depois.ga[id], p), final: depois.ga[id] }))
      .filter(l => l.pos < LINHAS)
      .sort((a, b) => b.pos - a.pos);      // quem está na frente é desenhado por cima
    for (const l of linhas) {
      const y = TOPO_LINHAS + l.pos * ALTURA_LINHA, destaque = l.id === atual && p < 1;
      ctx.globalAlpha = Math.min(1, LINHAS - l.pos);
      const fim = X + Math.max(R, l.valor * escala), cor = d.cores[l.pessoa.n];
      ctx.fillStyle = l.pos < 3 ? [COR.ouro, COR.prata, COR.bronze][Math.round(l.pos)] : COR.texto3;
      ctx.font = `64px ${TITULO}`; ctx.textAlign = 'center';
      ctx.fillText(String(Math.round(l.pos) + 1), M + 8, y + 92);
      ctx.textAlign = 'left';
      ctx.fillStyle = COR.texto; textoAjustado(ctx, l.pessoa.nome, X, y + 32, W - X - M, 30, TEXTO, '700');
      retangulo(ctx, X, y + 46, fim - X, 62, 12); ctx.fillStyle = cor; ctx.fill();
      if (destaque) { ctx.strokeStyle = COR.ouro; ctx.lineWidth = 5; ctx.stroke(); }
      foto(ctx, fim, y + 77, R, l.pessoa, d.fotos[l.id], destaque ? COR.ouro : cor);
      ctx.fillStyle = COR.texto; ctx.font = `64px ${TITULO}`;
      ctx.fillText(String(l.final), fim + R + 18, y + 100);
    }
    ctx.globalAlpha = 1;
  }

  function desenharLance(ctx, d, tl, lance, idade) {
    const { COR, TITULO, EMOJI, retangulo, textoAjustado } = Exportar;
    const y = 1668, pessoa = tl.pessoas[lance.jogador];
    ctx.globalAlpha = suave(idade * 6);
    retangulo(ctx, M, y, W - 2 * M, 130, 24); ctx.fillStyle = COR.card; ctx.fill();
    ctx.strokeStyle = d.cores[pessoa.n]; ctx.lineWidth = 4; ctx.stroke();
    ctx.font = `70px ${EMOJI}`; ctx.fillStyle = COR.texto;
    ctx.fillText(lance.tipo === 'gol' ? '⚽' : '🎁', M + 34, y + 90);
    textoAjustado(ctx, `${lance.tipo === 'gol' ? 'GOL' : 'ASSISTÊNCIA'} DE ${pessoa.nome.toUpperCase()}`, M + 136, y + 90, W - 2 * M - 170, 76, TITULO);
    ctx.globalAlpha = 1;
  }

  function desenharCorrida(ctx, d, tl, t) {
    const { fundo } = Exportar;
    fundo(ctx, W, H);
    marca(ctx, d);
    // quantos lances já entraram: o primeiro entra logo no começo da corrida
    const n = Math.min(d.lances.length, Math.floor(t / tl.passo) + 1);
    const idade = t - (n - 1) * tl.passo, p = suave(idade / ANIMACAO);
    const antes = tl.quadros[n - 1], depois = tl.quadros[n], lance = d.lances[n - 1];
    desenharPlacar(ctx, d, antes, depois, p);
    desenharBarras(ctx, d, tl, antes, depois, p, lance.jogador);
    desenharLance(ctx, d, tl, lance, idade);
    rodape(ctx, d);
  }

  function desenharFinal(ctx, d, tl, p) {
    const { COR, TITULO, TEXTO, EMOJI, fundo, retangulo, textoAjustado } = Exportar;
    const fim = tl.quadros.at(-1);
    fundo(ctx, W, H);
    marca(ctx, d);
    desenharPlacar(ctx, d, fim, fim, 1);
    ctx.globalAlpha = suave(p * 4);
    ctx.fillStyle = COR.texto; ctx.font = `120px ${TITULO}`; ctx.textAlign = 'center';
    ctx.fillText('TOP 3 DO FUT', W / 2, 460);
    ctx.textAlign = 'left';
    Object.keys(tl.pessoas).sort((a, b) => fim.rank[a] - fim.rank[b]).slice(0, 3).forEach((id, i) => {
      const y = 510 + i * 240, pessoa = tl.pessoas[id], cor = [COR.ouro, COR.prata, COR.bronze][i];
      ctx.globalAlpha = suave((p - .1 - i * .08) * 5);
      retangulo(ctx, M, y, W - 2 * M, 210, 28); ctx.fillStyle = COR.card; ctx.fill();
      foto(ctx, M + 110, y + 105, 80, pessoa, d.fotos[id], cor);
      ctx.fillStyle = COR.texto; textoAjustado(ctx, pessoa.nome.toUpperCase(), M + 220, y + 106, W - 2 * M - 420, 78, TITULO);
      ctx.fillStyle = COR.texto2; ctx.font = `600 32px ${TEXTO}`; ctx.fillText(`${pessoa.gols}G · ${pessoa.assist}A`, M + 220, y + 156);
      ctx.fillStyle = cor; ctx.font = `110px ${TITULO}`; ctx.textAlign = 'right';
      ctx.fillText(String(fim.ga[id]), W - M - 40, y + 142);
      ctx.textAlign = 'left';
    });
    d.premios.forEach((pr, i) => {
      const y = 1270 + i * 140;
      ctx.globalAlpha = suave((p - .35 - i * .08) * 5);
      retangulo(ctx, M, y, W - 2 * M, 120, 22); ctx.fillStyle = COR.card; ctx.fill();
      ctx.font = `60px ${EMOJI}`; ctx.fillStyle = COR.texto; ctx.fillText(pr.icone, M + 30, y + 80);
      ctx.fillStyle = COR.ouro; ctx.font = `700 28px ${TEXTO}`; ctx.fillText(pr.titulo.toUpperCase(), M + 124, y + 48);
      ctx.fillStyle = COR.texto; textoAjustado(ctx, pr.nomes, M + 124, y + 96, W - 2 * M - 160, 40, TEXTO, '700');
    });
    ctx.globalAlpha = 1;
    rodape(ctx, d);
  }

  function desenharQuadro(ctx, d, tl, t) {
    if (t < ABERTURA) return desenharAbertura(ctx, d, t / ABERTURA);
    if (t < ABERTURA + tl.corrida) return desenharCorrida(ctx, d, tl, t - ABERTURA);
    desenharFinal(ctx, d, tl, Math.min(1, (t - ABERTURA - tl.corrida) / FINAL));
  }

  /* ---------------- Gravação ---------------- */
  async function preparar(d) {
    await Exportar.fontesProntas();
    const fotos = {};
    await Promise.all(d.times.flatMap(t => t.jogadores).map(async p => {
      if (p.foto) fotos[p.id] = await Exportar.carregarImagem(p.foto).catch(() => null);
    }));
    return { ...d, fotos };
  }

  // Grava em tempo real. aoProgresso recebe de 0 a 1; sinal.cancelado interrompe. Devolve { blob, extensao }.
  function gravar(canvas, d, tl, aoProgresso, sinal) {
    return new Promise((ok, falha) => {
      const tipo = FORMATOS.find(f => MediaRecorder.isTypeSupported(f));
      if (!tipo) return falha(new Error('sem-formato'));
      const ctx = canvas.getContext('2d');
      desenharQuadro(ctx, d, tl, 0);
      const stream = canvas.captureStream(30);
      // cerca de 11 MB por minuto: leve o bastante para mandar no WhatsApp
      const rec = new MediaRecorder(stream, { mimeType: tipo, videoBitsPerSecond: 1_500_000 });
      const partes = [];
      let erro = null, t0, ultimoQuadro = performance.now(), parado = false;
      const parar = motivo => {
        if (parado) return;
        parado = true;
        if (motivo) erro = new Error(motivo);
        rec.stop();
      };
      // Aba escondida para de desenhar sem nenhum aviso no quadro: o vigia percebe e encerra
      const vigia = setInterval(() => {
        if (sinal.cancelado) parar('cancelado');
        else if (document.hidden || performance.now() - ultimoQuadro > 3000) parar('aba-escondida');
      }, 500);
      rec.ondataavailable = e => { if (e.data.size) partes.push(e.data); };
      rec.onerror = e => { erro = e.error || new Error('gravacao'); };
      rec.onstop = () => {
        clearInterval(vigia);
        stream.getTracks().forEach(s => s.stop());
        if (erro) return falha(erro);
        ok({ blob: new Blob(partes, { type: tipo.split(';')[0] }), extensao: tipo.includes('mp4') ? 'mp4' : 'webm' });
      };
      const quadro = agora => {
        if (parado) return;
        ultimoQuadro = performance.now();
        t0 ??= agora;
        const t = (agora - t0) / 1000;
        desenharQuadro(ctx, d, tl, Math.min(t, tl.total));
        aoProgresso(Math.min(1, t / tl.total));
        if (t >= tl.total) return parar();
        requestAnimationFrame(quadro);
      };
      rec.start(1000);
      requestAnimationFrame(quadro);
    });
  }

  /* d = { data, titulo, arquivo, site, times, lances, premios, cores }; canvas é a prévia que o vídeo grava */
  async function gerar(canvas, dados, aoProgresso, sinal) {
    const d = await preparar(dados);
    return gravar(canvas, d, montarLinhaDoTempo(d), aoProgresso, sinal);
  }

  return { gerar, lancesConferem, montarLinhaDoTempo, desenharQuadro, preparar, W, H };
})();
