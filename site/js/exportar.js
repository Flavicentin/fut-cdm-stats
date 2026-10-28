/* Fut CDM — exportar o perfil do jogador como imagem (PNG, formato post) ou PDF (A4).
   Desenha num canvas; o PDF usa o jsPDF, carregado só quando alguém pede. */
window.Exportar = (() => {
  'use strict';

  const COR = {
    fundo1: '#0d1f14', fundo2: '#050806', linha: 'rgba(59, 226, 127, .07)', acento: '#3be27f',
    texto: '#eef3ef', texto2: '#a9b5ad', texto3: '#74827a', card: 'rgba(255, 255, 255, .05)',
    borda: 'rgba(255, 255, 255, .10)', ouro: '#f5c542', prata: '#c9d1d9', bronze: '#e0995a',
    gols: '#23b05e', assist: '#3987e5',
  };
  const TITULO = '"Bebas Neue", Impact, "Arial Narrow", sans-serif';
  const TEXTO = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';
  const EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

  async function fontesProntas() {
    try {
      await Promise.all([
        document.fonts.load(`80px ${TITULO}`), document.fonts.load(`700 28px ${TEXTO}`), document.fonts.load(`500 28px ${TEXTO}`),
      ]);
    } catch { /* sem as fontes, usa as do sistema */ }
  }

  function carregarImagem(src) {
    return new Promise((ok, falha) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';   // o Storage do Supabase libera CORS; sem isso o canvas não exporta
      img.onload = () => ok(img);
      img.onerror = falha;
      img.src = src;
    });
  }

  function retangulo(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function card(ctx, x, y, w, h, r = 22) {
    retangulo(ctx, x, y, w, h, r);
    ctx.fillStyle = COR.card;
    ctx.fill();
    ctx.strokeStyle = COR.borda;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Escreve diminuindo a fonte até caber na largura
  function textoAjustado(ctx, txt, x, y, larguraMax, tamanho, familia, peso = '') {
    let t = tamanho;
    do { ctx.font = `${peso} ${t}px ${familia}`; t -= 2; } while (ctx.measureText(txt).width > larguraMax && t > 20);
    ctx.fillText(txt, x, y);
  }

  function letrasEspacadas(ctx, txt, x, y, espaco) {
    let px = x;
    for (const c of txt) { ctx.fillText(c, px, y); px += ctx.measureText(c).width + espaco; }
  }

  const corPos = p => (p === 1 ? COR.ouro : p === 2 ? COR.prata : p === 3 ? COR.bronze : COR.acento);

  function fundo(ctx, W, H) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, COR.fundo1);
    g.addColorStop(1, COR.fundo2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // linhas de campo bem discretas
    ctx.strokeStyle = COR.linha;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(W / 2, H * 0.62, W * 0.22, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, H * 0.62); ctx.lineTo(W, H * 0.62); ctx.stroke();
    ctx.strokeRect(40, 40, W - 80, H - 110);
  }

  // Parte comum aos dois formatos: cabeçalho, foto, números e honrarias. Devolve o y onde terminou.
  function desenharCartao(ctx, W, d, foto) {
    const M = 70;
    // marca e temporada
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = COR.texto;
    ctx.font = `56px ${TITULO}`;
    ctx.fillText('FUT', M, 120);
    ctx.fillStyle = COR.acento;
    ctx.fillText('CDM', M + ctx.measureText('FUT ').width, 120);
    ctx.font = `700 24px ${TEXTO}`;
    ctx.textAlign = 'right';
    ctx.fillText(`TEMPORADA ${d.temporada}`, W - M, 116);
    ctx.textAlign = 'left';

    // foto (ou iniciais) num círculo
    const R = 130, cx = M + R, cy = 180 + R;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.closePath();
    ctx.fillStyle = 'rgba(59, 226, 127, .12)';
    ctx.fill();
    ctx.clip();
    if (foto) {
      const lado = Math.min(foto.width, foto.height);
      ctx.drawImage(foto, (foto.width - lado) / 2, (foto.height - lado) / 2, lado, lado, cx - R, cy - R, R * 2, R * 2);
    } else {
      ctx.fillStyle = COR.acento;
      ctx.font = `120px ${TITULO}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(d.iniciais, cx, cy + 6);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = COR.acento; ctx.lineWidth = 8; ctx.stroke();

    // nome e descrição
    const xNome = cx + R + 44, largNome = W - M - xNome;
    ctx.fillStyle = COR.texto;
    textoAjustado(ctx, d.nome.toUpperCase(), xNome, 300, largNome, 128, TITULO);
    ctx.fillStyle = COR.texto2;
    textoAjustado(ctx, d.sub, xNome, 350, largNome, 26, TEXTO, '500');
    if (d.destaque) {
      ctx.fillStyle = COR.acento;
      textoAjustado(ctx, d.destaque, xNome, 396, largNome, 26, TEXTO, '700');
    }

    // números: 3 colunas x 2 linhas
    let y = 460;
    const gap = 16, wTile = (W - 2 * M - 2 * gap) / 3, hTile = 136;
    d.nums.forEach((n, i) => {
      const x = M + (i % 3) * (wTile + gap), yy = y + Math.floor(i / 3) * (hTile + gap);
      card(ctx, x, yy, wTile, hTile);
      ctx.fillStyle = COR.texto;
      ctx.font = `82px ${TITULO}`;
      ctx.fillText(n.valor, x + 24, yy + 84);
      ctx.fillStyle = COR.texto2;
      ctx.font = `600 23px ${TEXTO}`;
      ctx.fillText(n.rotulo, x + 24, yy + 118);
      if (n.pos) {
        ctx.fillStyle = corPos(n.pos);
        ctx.font = `52px ${TITULO}`;
        ctx.textAlign = 'right';
        ctx.fillText(`${n.pos}º`, x + wTile - 22, yy + 64);
        ctx.textAlign = 'left';
      }
    });
    y += 2 * hTile + gap + 62;

    // honrarias
    ctx.fillStyle = COR.texto;
    ctx.font = `50px ${TITULO}`;
    ctx.fillText('HONRARIAS', M, y);
    y += 20;
    const grupos = [['POR FUT', d.honrasS], ['NO MÊS', d.honrasM]].filter(([, l]) => l.length);
    if (!grupos.length) {
      ctx.fillStyle = COR.texto3;
      ctx.font = `500 26px ${TEXTO}`;
      ctx.fillText('Ainda sem honrarias nesta temporada.', M, y + 40);
      return y + 70;
    }
    // 9 por linha: cada grupo tem no máximo 9 honrarias, então nunca passa de uma linha por grupo
    const porLinha = 9, gapH = 9, wH = (W - 2 * M - (porLinha - 1) * gapH) / porLinha, hH = 124;
    for (const [rotulo, lista] of grupos) {
      ctx.fillStyle = COR.texto3;
      ctx.font = `700 20px ${TEXTO}`;
      letrasEspacadas(ctx, rotulo, M, y + 30, 3);
      y += 42;
      lista.forEach((h, i) => {
        const x = M + (i % porLinha) * (wH + gapH), yy = y + Math.floor(i / porLinha) * (hH + gapH);
        card(ctx, x, yy, wH, hH, 18);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';   // emoji sem cor (fonte monocromática) sai branco, não transparente
        ctx.font = `34px ${EMOJI}`;
        ctx.fillText(h.ic, x + wH / 2, yy + 42);
        ctx.fillStyle = COR.texto;
        ctx.font = `42px ${TITULO}`;
        ctx.fillText(`${h.n}×`, x + wH / 2, yy + 88);
        ctx.fillStyle = COR.texto2;
        textoAjustado(ctx, h.nome, x + wH / 2, yy + 112, wH - 10, 17, TEXTO, '600');
        ctx.textAlign = 'left';
      });
      y += Math.ceil(lista.length / porLinha) * (hH + gapH);
    }
    return y;
  }

  function rodape(ctx, W, H, d) {
    ctx.fillStyle = COR.texto3;
    ctx.font = `600 22px ${TEXTO}`;
    // fica na faixa entre a moldura e a borda, sem encostar no conteúdo
    ctx.fillText(d.site, 70, H - 52);
    ctx.textAlign = 'right';
    ctx.fillText(`Atualizado em ${d.atualizado}`, W - 70, H - 52);
    ctx.textAlign = 'left';
  }

  // Extras da página A4: mês a mês em barras e a avaliação dos adms
  function desenharExtrasA4(ctx, W, H, d, y0) {
    const M = 70;
    let y = y0 + 40;
    if (d.meses.length) {
      ctx.fillStyle = COR.texto;
      ctx.font = `50px ${TITULO}`;
      ctx.fillText('MÊS A MÊS', M, y);
      ctx.font = `600 20px ${TEXTO}`;
      ctx.fillStyle = COR.gols; ctx.fillText('■ Gols', W - M - 260, y - 8);
      ctx.fillStyle = COR.assist; ctx.fillText('■ Assistências', W - M - 160, y - 8);
      y += 24;
      const hGraf = 150, larg = W - 2 * M;
      card(ctx, M, y, larg, hGraf + 58);
      const max = Math.max(1, ...d.meses.map(m => m.g + m.a));
      const passo = larg / d.meses.length, wBarra = Math.min(60, passo * 0.55), base = y + hGraf;
      d.meses.forEach((m, i) => {
        const x = M + passo * i + (passo - wBarra) / 2;
        const hg = (m.g / max) * (hGraf - 50), ha = (m.a / max) * (hGraf - 50);
        ctx.fillStyle = COR.gols; ctx.fillRect(x, base - hg, wBarra, hg);
        ctx.fillStyle = COR.assist; ctx.fillRect(x, base - hg - ha, wBarra, ha);
        ctx.fillStyle = COR.texto; ctx.font = `600 20px ${TEXTO}`; ctx.textAlign = 'center';
        if (m.g + m.a) ctx.fillText(String(m.g + m.a), x + wBarra / 2, base - hg - ha - 10);
        ctx.fillStyle = COR.texto2; ctx.font = `500 20px ${TEXTO}`;
        ctx.fillText(m.rotulo, x + wBarra / 2, base + 36);
        ctx.textAlign = 'left';
      });
      y += hGraf + 58 + 56;
    }
    if (d.over) {
      ctx.fillStyle = COR.texto;
      ctx.font = `50px ${TITULO}`;
      ctx.fillText('AVALIAÇÃO DOS ADMS', M, y);
      y += 24;
      const notas = d.over.notas.filter(n => n.v != null);
      const wN = (W - 2 * M - 200 - (notas.length - 1) * 12) / Math.max(1, notas.length);
      if (d.over.ovr != null) {
        card(ctx, M, y, 180, 128);
        ctx.fillStyle = COR.ouro; ctx.font = `84px ${TITULO}`; ctx.textAlign = 'center';
        ctx.fillText(String(d.over.ovr), M + 90, y + 84);
        ctx.fillStyle = COR.texto2; ctx.font = `700 19px ${TEXTO}`; ctx.fillText('OVERALL', M + 90, y + 112);
        ctx.textAlign = 'left';
      }
      notas.forEach((n, i) => {
        const x = M + 200 + i * (wN + 12);
        card(ctx, x, y, wN, 128, 18);
        ctx.textAlign = 'center';
        ctx.fillStyle = COR.texto; ctx.font = `58px ${TITULO}`; ctx.fillText(String(n.v), x + wN / 2, y + 76);
        ctx.fillStyle = COR.texto2; ctx.font = `700 19px ${TEXTO}`; ctx.fillText(n.sigla, x + wN / 2, y + 108);
        ctx.textAlign = 'left';
      });
    }
    rodape(ctx, W, H, d);
  }

  async function gerarCanvas(d, formato) {
    await fontesProntas();
    let foto = null;
    if (d.foto) { try { foto = await carregarImagem(d.foto); } catch { foto = null; } }
    const [W, H] = formato === 'a4' ? [1240, 1754] : [1080, 1350];
    const desenhar = f => {
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      fundo(ctx, W, H);
      const fim = desenharCartao(ctx, W, d, f);
      if (formato === 'a4') desenharExtrasA4(ctx, W, H, d, fim); else rodape(ctx, W, H, d);
      return canvas;
    };
    let canvas = desenhar(foto);
    try { canvas.toDataURL('image/png', 0); } catch { canvas = desenhar(null); }   // foto sem CORS: usa as iniciais
    return canvas;
  }

  // Compartilha (celular) ou baixa (computador)
  async function entregar(blob, nome, titulo) {
    const arquivo = new File([blob], nome, { type: blob.type });
    if (navigator.canShare?.({ files: [arquivo] })) {
      try { await navigator.share({ files: [arquivo], title: titulo }); return 'compartilhado'; }
      catch (e) { if (e.name === 'AbortError') return 'cancelado'; }
    }
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: nome });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return 'baixado';
  }

  let jsPDFPromise;
  function carregarJsPDF() {
    jsPDFPromise ||= new Promise((ok, falha) => {
      if (window.jspdf) return ok(window.jspdf);
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload = () => ok(window.jspdf);
      s.onerror = () => { jsPDFPromise = null; falha(new Error('Não foi possível carregar o gerador de PDF')); };
      document.head.appendChild(s);
    });
    return jsPDFPromise;
  }

  async function imagem(d) {
    const canvas = await gerarCanvas(d, 'post');
    const blob = await new Promise(ok => canvas.toBlob(ok, 'image/png'));
    return entregar(blob, `fut-cdm-${d.id}-${d.temporada}.png`, `${d.nome} · Fut CDM ${d.temporada}`);
  }

  async function pdf(d) {
    const [{ jsPDF }, canvas] = await Promise.all([carregarJsPDF(), gerarCanvas(d, 'a4')]);
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
    doc.setProperties({ title: `${d.nome} · Fut CDM ${d.temporada}`, author: 'Fut CDM' });
    doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight());
    return entregar(doc.output('blob'), `fut-cdm-${d.id}-${d.temporada}.pdf`, `${d.nome} · Fut CDM ${d.temporada}`);
  }

  /* Ranking (top 10) em imagem: d = { titulo, subtitulo, temporada, site, atualizado, itens: [{ pos, nome, iniciais, foto, valor, sub }] } */
  async function gerarCanvasRanking(d) {
    await fontesProntas();
    const fotos = await Promise.all(d.itens.map(i => (i.foto ? carregarImagem(i.foto).catch(() => null) : null)));
    const W = 1080, H = 1350, M = 70;
    const desenhar = comFotos => {
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      fundo(ctx, W, H);
      ctx.fillStyle = COR.texto; ctx.font = `56px ${TITULO}`; ctx.fillText('FUT', M, 120);
      ctx.fillStyle = COR.acento; ctx.fillText('CDM', M + ctx.measureText('FUT ').width, 120);
      ctx.font = `700 24px ${TEXTO}`; ctx.textAlign = 'right'; ctx.fillText(`TEMPORADA ${d.temporada}`, W - M, 116); ctx.textAlign = 'left';
      ctx.fillStyle = COR.texto; textoAjustado(ctx, d.titulo.toUpperCase(), M, 222, W - 2 * M, 96, TITULO);
      ctx.fillStyle = COR.texto2; textoAjustado(ctx, d.subtitulo || '', M, 264, W - 2 * M, 26, TEXTO, '500');

      const y0 = 296, hL = 92, gap = 0;
      d.itens.slice(0, 10).forEach((it, i) => {
        const y = y0 + i * (hL + gap);
        if (i % 2 === 0) { retangulo(ctx, M - 10, y + 4, W - 2 * M + 20, hL - 8, 18); ctx.fillStyle = COR.card; ctx.fill(); }
        const meio = y + hL / 2;
        // posição
        ctx.fillStyle = it.pos <= 3 ? corPos(it.pos) : COR.texto3;
        ctx.font = `60px ${TITULO}`; ctx.textAlign = 'center';
        ctx.fillText(String(it.pos), M + 30, meio + 21);
        // foto ou iniciais
        const R = 34, cx = M + 112;
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, meio, R, 0, Math.PI * 2); ctx.closePath();
        ctx.fillStyle = 'rgba(59, 226, 127, .14)'; ctx.fill(); ctx.clip();
        const f = comFotos && fotos[i];
        if (f) {
          const lado = Math.min(f.width, f.height);
          ctx.drawImage(f, (f.width - lado) / 2, (f.height - lado) / 2, lado, lado, cx - R, meio - R, R * 2, R * 2);
        } else {
          ctx.fillStyle = COR.acento; ctx.font = `32px ${TITULO}`; ctx.textBaseline = 'middle';
          ctx.fillText(it.iniciais, cx, meio + 2); ctx.textBaseline = 'alphabetic';
        }
        ctx.restore();
        ctx.beginPath(); ctx.arc(cx, meio, R, 0, Math.PI * 2);
        ctx.strokeStyle = it.pos <= 3 ? corPos(it.pos) : COR.borda; ctx.lineWidth = 3; ctx.stroke();
        // nome, detalhe e valor
        ctx.textAlign = 'left';
        const xNome = cx + R + 24, xValor = W - M - 10;
        ctx.font = `76px ${TITULO}`;
        const largValor = ctx.measureText(it.valor).width;
        ctx.fillStyle = COR.texto;
        textoAjustado(ctx, it.nome, xNome, it.sub ? meio + 2 : meio + 12, xValor - largValor - xNome - 24, 34, TEXTO, '700');
        if (it.sub) { ctx.fillStyle = COR.texto2; textoAjustado(ctx, it.sub, xNome, meio + 32, xValor - largValor - xNome - 24, 22, TEXTO, '500'); }
        ctx.fillStyle = it.pos === 1 ? COR.ouro : COR.texto;
        ctx.font = `76px ${TITULO}`; ctx.textAlign = 'right';
        ctx.fillText(it.valor, xValor, meio + 26);
        ctx.textAlign = 'left';
      });
      rodape(ctx, W, H, d);
      return canvas;
    };
    let canvas = desenhar(true);
    try { canvas.toDataURL('image/png', 0); } catch { canvas = desenhar(false); }
    return canvas;
  }

  async function ranking(d) {
    const canvas = await gerarCanvasRanking(d);
    const blob = await new Promise(ok => canvas.toBlob(ok, 'image/png'));
    const nome = `fut-cdm-ranking-${d.arquivo || 'top10'}.png`;
    return entregar(blob, nome, `${d.titulo} · Fut CDM ${d.temporada}`);
  }

  return { imagem, pdf, ranking, gerarCanvas, gerarCanvasRanking };
})();
