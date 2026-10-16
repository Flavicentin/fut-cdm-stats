/* Fut CDM — gráficos (Apache ECharts). Cores sempre lidas dos tokens CSS. */
const Charts = (() => {
  'use strict';

  const registro = {};           // id do elemento -> { chart, montar }
  let jogadores = [];            // com jogos registrados
  let regulares = [];            // com o mínimo de jogos para médias
  let metricaFatia = 'gols';

  const tok = n => getComputedStyle(document.documentElement).getPropertyValue('--' + n).trim();
  const dec = v => v.toFixed(1).replace('.', ',');
  const estreito = () => window.innerWidth < 600;
  const abrir = p => { if (p.data && p.data.id) location.hash = `jogador/${p.data.id}`; };

  function base() {
    return {
      animationDuration: 900,
      animationEasing: 'cubicOut',
      textStyle: { fontFamily: 'Inter, system-ui, sans-serif', color: tok('texto-2') },
      tooltip: {
        backgroundColor: tok('surface'),
        borderColor: tok('borda-forte'),
        borderWidth: 1,
        padding: [8, 12],
        textStyle: { color: tok('texto'), fontSize: 13 },
        extraCssText: 'border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.25);',
      },
    };
  }

  const eixo = (nome, extra = {}) => ({
    name: nome,
    nameLocation: 'middle',
    nameGap: 30,
    nameTextStyle: { color: tok('texto-2'), fontWeight: 600, fontSize: 12 },
    axisLine: { lineStyle: { color: tok('borda-forte') } },
    axisTick: { show: false },
    axisLabel: { color: tok('texto-3'), fontSize: 11 },
    splitLine: { lineStyle: { color: tok('borda'), type: [3, 4] } },
    ...extra,
  });

  function montar(el, fn) {
    if (!el) return;
    let r = registro[el.id];
    if (r && r.chart.getDom() !== el) { r.chart.dispose(); r = null; }
    const chart = r ? r.chart : echarts.init(el, null, { renderer: 'svg' });
    if (!r) chart.on('click', abrir);
    registro[el.id] = { chart, montar: fn };
    chart.setOption(fn(), true);
  }

  /* Finalizador × Garçom */
  function opPerfil() {
    const mx = regulares.reduce((s, j) => s + j.gpj, 0) / regulares.length;
    const my = regulares.reduce((s, j) => s + j.apj, 0) / regulares.length;
    const quad = (txt, pos) => ({ type: 'text', ...pos, style: { text: txt, fill: tok('texto-3'), font: '700 11px Inter, sans-serif' }, silent: true });
    const g = { left: 48, right: 24, top: 24, bottom: 48 };
    return {
      ...base(),
      grid: g,
      xAxis: eixo('Gols por jogo', { min: 0, max: v => Math.ceil(v.max + .4) }),
      yAxis: eixo('Assistências por jogo', { min: 0, max: v => Math.ceil(v.max + .3) }),
      graphic: [
        quad('COMPLETOS ↗', { right: g.right + 10, top: g.top + 8 }),
        quad('↖ GARÇONS', { left: g.left + 10, top: g.top + 8 }),
        quad('FINALIZADORES ↘', { right: g.right + 10, bottom: g.bottom + 10 }),
        quad('↙ EM CONSTRUÇÃO', { left: g.left + 10, bottom: g.bottom + 10 }),
      ],
      tooltip: {
        ...base().tooltip,
        formatter: p => `<b>${p.data.name}</b><br>${dec(p.value[0])} gols/jogo<br>${dec(p.value[1])} assist/jogo<br><span style="opacity:.7">${p.data.partidas} jogos</span>`,
      },
      series: [{
        type: 'scatter',
        symbolSize: estreito() ? 11 : 14,
        itemStyle: { color: tok('acento'), borderColor: tok('surface'), borderWidth: 2 },
        emphasis: { scale: 1.5, itemStyle: { color: tok('ouro') } },
        label: { show: true, position: 'right', formatter: p => p.data.name, color: tok('texto'), fontSize: estreito() ? 10 : 12, fontWeight: 600 },
        labelLayout: { hideOverlap: true },
        data: regulares.map(j => ({ id: j.id, name: j.nome, partidas: j.partidas, value: [j.gpj, j.apj] })),
        markLine: {
          silent: true, symbol: 'none',
          lineStyle: { color: tok('texto-3'), type: [6, 5], width: 1 },
          label: { position: 'insideEndTop', color: tok('texto-3'), fontSize: 10, formatter: p => `média ${dec(p.value)}` },
          data: [{ xAxis: mx }, { yAxis: my }],
        },
      }],
    };
  }

  /* Presença × Rendimento */
  function opPresenca() {
    const maxGa = Math.max(...regulares.map(j => j.ga));
    return {
      ...base(),
      grid: { left: 44, right: 20, top: 20, bottom: 48 },
      xAxis: eixo('Partidas jogadas', { min: v => Math.floor(v.min - 2), max: v => Math.ceil(v.max + 2) }),
      yAxis: eixo('G+A por jogo', { min: 0, max: v => Math.ceil(v.max + .5) }),
      tooltip: {
        ...base().tooltip,
        formatter: p => `<b>${p.data.name}</b><br>${p.value[0]} jogos<br>${dec(p.value[1])} G+A por jogo<br>${p.data.ga} G+A no total`,
      },
      series: [{
        type: 'scatter',
        symbolSize: (v, p) => 10 + 34 * Math.sqrt(p.data.ga / maxGa),
        itemStyle: { color: tok('acento'), opacity: .75, borderColor: tok('surface'), borderWidth: 2 },
        emphasis: { itemStyle: { opacity: 1, color: tok('ouro') } },
        label: { show: true, formatter: p => p.data.name, color: tok('texto'), fontSize: estreito() ? 10 : 11, fontWeight: 600, position: 'top' },
        labelLayout: { hideOverlap: true },
        data: regulares.map(j => ({ id: j.id, name: j.nome, ga: j.ga, value: [j.partidas, j.gapj] })),
      }],
    };
  }

  /* Fatia do total */
  function opFatia() {
    const rot = { gols: 'gols', assist: 'assistências', ga: 'G+A' }[metricaFatia];
    // Escala sequencial de um só tom: o verde do acento, mais opaco = maior fatia
    const hex = tok('acento').replace('#', '');
    const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
    const ord = jogadores.map(j => ({ id: j.id, name: j.nome, value: j[metricaFatia] })).sort((a, b) => b.value - a.value);
    const total = ord.reduce((s, d) => s + d.value, 0);
    const min = ord[ord.length - 1].value, max = ord[0].value;
    const dados = ord.map(d => {
      const a = .2 + .8 * (d.value - min) / (max - min || 1);
      const forte = a > .6;
      return {
        ...d,
        itemStyle: { color: `rgba(${r},${g},${b},${a.toFixed(2)})` },
        label: { color: forte ? '#04150a' : tok('texto'), rich: { v: { color: forte ? '#04150a' : tok('texto-2') } } },
      };
    });
    return {
      ...base(),
      tooltip: { ...base().tooltip, formatter: p => `<b>${p.name}</b><br>${p.value} ${rot} · ${(p.value / total * 100).toFixed(1).replace('.', ',')}% do total` },
      series: [{
        type: 'treemap',
        roam: false, nodeClick: false, breadcrumb: { show: false },
        width: '100%', height: '100%', top: 8, left: 0,
        itemStyle: { borderColor: tok('surface'), borderWidth: 2, gapWidth: 2, borderRadius: 6 },
        label: {
          show: true, fontWeight: 700, fontSize: 12, lineHeight: 15,
          formatter: p => `${p.name}\n{v|${(p.value / total * 100).toFixed(0)}%}`,
          rich: { v: { fontSize: 11, fontWeight: 500 } },
        },
        upperLabel: { show: false },
        data: dados,
      }],
    };
  }

  /* Composição do G+A */
  function opComposicao() {
    const ord = [...jogadores].sort((a, b) => b.ga - a.ga || b.gols - a.gols);
    const seg = (nome, k, cor, ultimo) => ({
      name: nome, type: 'bar', stack: 'ga', barWidth: estreito() ? 14 : 18,
      itemStyle: { color: cor, borderColor: tok('surface'), borderWidth: 1, borderRadius: ultimo ? [0, 4, 4, 0] : 0 },
      emphasis: { focus: 'series' },
      label: ultimo
        ? { show: true, position: 'right', color: tok('texto'), fontWeight: 700, fontSize: 12, formatter: p => ord[p.dataIndex].ga }
        : { show: !estreito(), position: 'insideRight', color: '#fff', fontSize: 11, fontWeight: 600, formatter: p => p.value >= 30 ? p.value : '' },
      data: ord.map(j => ({ id: j.id, value: j[k] })),
    });
    return {
      ...base(),
      legend: { top: 0, left: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 12, textStyle: { color: tok('texto-2'), fontWeight: 600 } },
      grid: { left: 4, right: 40, top: 36, bottom: 8, containLabel: true },
      tooltip: {
        ...base().tooltip, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: tok('acento-suave') } },
        formatter: ps => {
          const j = ord[ps[0].dataIndex];
          return `<b>${j.nome}</b><br>${ps.map(p => `${p.marker}${p.seriesName}: <b>${p.value}</b>`).join('<br>')}<br>G+A: <b>${j.ga}</b> · ${Math.round(j.gols / j.ga * 100)}% em gols`;
        },
      },
      xAxis: { type: 'value', axisLabel: { color: tok('texto-3'), fontSize: 11 }, splitLine: { lineStyle: { color: tok('borda'), type: [3, 4] } } },
      yAxis: { type: 'category', inverse: true, data: ord.map(j => j.nome), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: tok('texto'), fontWeight: 600, fontSize: 12 } },
      series: [seg('Gols', 'gols', tok('s-gols'), false), seg('Assistências', 'assist', tok('s-assist'), true)],
    };
  }

  /* Radar (perfil e comparação) */
  function opRadar(series, atributos, legenda, escala = { min: 40, max: 99 }) {
    const cores = { acento: tok('acento'), neutro: tok('texto-3'), 's-a': tok('s-a'), 's-b': tok('s-b') };
    return {
      ...base(),
      tooltip: { ...base().tooltip, trigger: 'item' },
      legend: legenda ? { bottom: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 12, textStyle: { color: tok('texto-2'), fontWeight: 600 } } : undefined,
      radar: {
        center: ['50%', legenda ? '46%' : '52%'],
        radius: '62%',
        axisNameGap: 14,
        indicator: atributos.map(([s, nome]) => ({ name: `${s}\n{n|${nome}}`, min: 40, max: 99 })),
        splitNumber: 4,
        shape: 'polygon',
        axisName: { color: tok('texto'), fontWeight: 700, fontSize: 13, rich: { n: { color: tok('texto-3'), fontSize: 10, fontWeight: 500 } } },
        splitLine: { lineStyle: { color: tok('borda-forte') } },
        splitArea: { areaStyle: { color: ['transparent'] } },
        axisLine: { lineStyle: { color: tok('borda') } },
      },
      series: [{
        type: 'radar',
        symbol: 'circle', symbolSize: 7,
        data: series.map(s => {
          const c = cores[s.cor];
          const neutro = s.cor === 'neutro';
          return {
            name: s.nome, value: s.valores,
            itemStyle: { color: c, borderColor: tok('surface'), borderWidth: 2 },
            lineStyle: { color: c, width: 2, type: neutro ? [5, 4] : 'solid' },
            areaStyle: neutro ? undefined : { color: c, opacity: .18 },
            label: neutro ? undefined : { show: true, color: tok('texto'), fontWeight: 700, fontSize: 11, distance: 6 },
          };
        }),
      }],
    };
  }

  /* Heatmap genérico: linhas × colunas, um só tom de verde (mais escuro = maior) */
  function opHeatmap({ linhas, colunas, valores, unidade = '' }) {
    const max = Math.max(1, ...valores.flat());
    const dados = [];
    valores.forEach((linha, y) => linha.forEach((v, x) => dados.push({
      value: [x, y, v || '-'], id: linhas[y].id,
      label: { color: v / max > .55 ? '#04150a' : tok('texto') },   // texto escuro sobre o verde forte
    })));
    return {
      ...base(),
      animation: false,
      grid: { left: 4, right: 8, top: 34, bottom: 8, containLabel: true },
      tooltip: {
        ...base().tooltip,
        formatter: p => p.value[2] === '-' ? '' : `<b>${linhas[p.value[1]].nome}</b><br>${colunas[p.value[0]].titulo}: <b>${p.value[2]}</b>${unidade}`,
      },
      xAxis: {
        type: 'category', position: 'top', data: colunas.map(c => c.rotulo),
        axisTick: { show: false }, axisLine: { show: false }, splitArea: { show: false },
        axisLabel: { color: tok('texto-2'), fontSize: estreito() ? 11 : 13, fontWeight: 700, interval: 0 },
      },
      yAxis: {
        type: 'category', inverse: true, data: linhas.map(l => l.nome),
        axisTick: { show: false }, axisLine: { show: false },
        axisLabel: { color: tok('texto'), fontSize: 12, fontWeight: 600 },
      },
      visualMap: {
        show: false, min: 0, max, dimension: 2, seriesIndex: 0,
        inRange: { color: [tok('acento-suave').replace(/[\d.]+\)$/, '.18)'), tok('acento')] },
        outOfRange: { color: 'transparent' },
      },
      series: [{
        type: 'heatmap', data: dados,
        itemStyle: { borderColor: tok('surface'), borderWidth: 2, borderRadius: 6 },
        label: {
          show: true, fontSize: 12, fontWeight: 700,
          formatter: p => p.value[2] === '-' ? '' : p.value[2],
          color: tok('texto'),
        },
        emphasis: { itemStyle: { borderColor: tok('ouro'), borderWidth: 2 } },
      }],
    };
  }

  /* Corrida acumulada mês a mês: todos em cinza, top 3 coloridos com nome na ponta */
  function opCorrida({ meses, series }) {
    const cores = [tok('acento'), tok('s-a'), tok('s-b')];
    const top = [...series].sort((a, b) => b.valores.at(-1) - a.valores.at(-1)).slice(0, 3).map(s => s.id);
    return {
      ...base(),
      grid: { left: 8, right: estreito() ? 70 : 96, top: 16, bottom: 8, containLabel: true },
      tooltip: {
        ...base().tooltip, trigger: 'axis',
        formatter: ps => {
          const linhas = ps.filter(p => p.value > 0).sort((a, b) => b.value - a.value).slice(0, 8);
          return `<b>${ps[0].axisValue}</b><br>` + linhas.map(p => `${p.marker}${p.seriesName}: <b>${p.value}</b>`).join('<br>');
        },
      },
      xAxis: { ...eixo(''), type: 'category', boundaryGap: false, data: meses, splitLine: { show: false } },
      yAxis: { ...eixo(''), type: 'value' },
      series: series.map(s => {
        const i = top.indexOf(s.id), destaque = i >= 0;
        return {
          name: s.nome, type: 'line', data: s.valores, id: s.id,
          symbol: 'circle', symbolSize: destaque ? 7 : 4, showSymbol: destaque,
          z: destaque ? 3 : 1,
          lineStyle: { width: destaque ? 2.5 : 1.2, color: destaque ? cores[i] : tok('borda-forte') },
          itemStyle: { color: destaque ? cores[i] : tok('texto-3'), borderColor: tok('surface'), borderWidth: 2 },
          emphasis: { focus: 'series', lineStyle: { width: 3 } },
          endLabel: destaque ? { show: true, formatter: '{a}  {c}', color: tok('texto'), fontWeight: 700, fontSize: 12 } : undefined,
          blur: { lineStyle: { opacity: .25 } },
          labelLayout: { moveOverlap: 'shiftY' },
        };
      }),
    };
  }

  /* Barras empilhadas de gols + assistências por mês (perfil) */
  function opBarrasMes({ meses, gols, assist }) {
    const seg = (nome, dados, cor, topo) => ({
      name: nome, type: 'bar', stack: 'm', barMaxWidth: 26, data: dados,
      itemStyle: { color: cor, borderColor: tok('surface'), borderWidth: 1, borderRadius: topo ? [4, 4, 0, 0] : 0 },
      label: topo ? { show: true, position: 'top', color: tok('texto'), fontWeight: 700, fontSize: 11, formatter: p => (gols[p.dataIndex] + assist[p.dataIndex]) || '' } : undefined,
    });
    return {
      ...base(),
      legend: { top: 0, right: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: tok('texto-2'), fontWeight: 600, fontSize: 12 } },
      grid: { left: 4, right: 4, top: 34, bottom: 4, containLabel: true },
      tooltip: { ...base().tooltip, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: tok('acento-suave') } } },
      xAxis: { type: 'category', data: meses, axisTick: { show: false }, axisLine: { lineStyle: { color: tok('borda-forte') } }, axisLabel: { color: tok('texto-2'), fontSize: 11 } },
      yAxis: { type: 'value', axisLabel: { color: tok('texto-3'), fontSize: 11 }, splitLine: { lineStyle: { color: tok('borda'), type: [3, 4] } } },
      series: [seg('Gols', gols, tok('s-gols'), false), seg('Assistências', assist, tok('s-assist'), true)],
    };
  }

  function iniciar(js, minJogos) {
    jogadores = js.filter(j => j.partidas > 0);
    regulares = jogadores.filter(j => j.partidas >= minJogos);
    const comp = document.getElementById('g-composicao');
    comp.style.height = `${jogadores.length * 26 + 60}px`;
    montar(document.getElementById('g-perfil'), opPerfil);
    montar(document.getElementById('g-presenca'), opPresenca);
    montar(document.getElementById('g-fatia'), opFatia);
    montar(document.getElementById('g-composicao'), opComposicao);
    let t;
    window.addEventListener('resize', () => {
      clearTimeout(t);
      t = setTimeout(() => Object.values(registro).forEach(r => { r.chart.setOption(r.montar(), true); r.chart.resize(); }), 150);
    });
  }

  return {
    iniciar,
    fatia(m) { metricaFatia = m; montar(document.getElementById('g-fatia'), opFatia); },
    radar(el, series, atributos, legenda = true, escala) { montar(el, () => opRadar(series, atributos, legenda, escala)); },
    heatmap(el, cfg) { el.style.height = `${cfg.linhas.length * 30 + 50}px`; montar(el, () => opHeatmap(cfg)); },
    corrida(el, cfg) { montar(el, () => opCorrida(cfg)); },
    barrasMes(el, cfg) { montar(el, () => opBarrasMes(cfg)); },
    descartar(id) { if (registro[id]) { registro[id].chart.dispose(); delete registro[id]; } },
    retematizar() {
      for (const [id, r] of Object.entries(registro)) {
        if (!document.getElementById(id)) { r.chart.dispose(); delete registro[id]; continue; }
        r.chart.setOption(r.montar(), true);
      }
    },
  };
})();
