import { root } from './dom.js';
import state from '../state.js';
import { fmtBRL, fmtBRLCompact, todayISO, escapeHTML } from '../utils.js';
import {
  CATEGORIAS, INVEST_COLORS, COLOR_CDI, PERIODOS, categoriaOf,
  loadCDI, buildReturnSeries, positionOf, windowStartFor
} from '../investments.js';
import { openInvestSheet, openUpdateBalancesSheet } from './investSheet.js';

let periodMonths = 12;
// 'rent' = rendimento acumulado (%), 'valor' = saldo bruto (R$)
let viewMode = 'rent';
// séries ocultas pelo usuário, como 'grafico:rótulo'; vale para a sessão
const hiddenSeries = new Set();
// índice do CDI carregado uma vez por sessão; status: idle | loading | ok | error
let cdi = null;
let cdiStatus = 'idle';

function fmtPct(v, digits=2){
  if(v === null || v === undefined || isNaN(v)) return '—';
  return (v*100).toLocaleString('pt-BR', {minimumFractionDigits:digits, maximumFractionDigits:digits}) + '%';
}

function fmtDateFull(iso){
  if(!iso) return '—';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function investColor(inv){
  const i = state.investimentos.indexOf(inv);
  return INVEST_COLORS[i % INVEST_COLORS.length];
}

function ensureCDI(handlers){
  if(cdiStatus !== 'idle') return;
  cdiStatus = 'loading';
  const earliest = state.investimentos.reduce((m, inv) => inv.dataAporte < m ? inv.dataAporte : m, windowStartFor(24));
  loadCDI(earliest)
    .then(idx => { cdi = idx; cdiStatus = 'ok'; })
    .catch(() => { cdiStatus = 'error'; })
    .finally(() => { if(document.getElementById('iv-page')) renderInvestments(handlers); });
}

export function renderInvestments(handlers){
  root.classList.add('wide');
  ensureCDI(handlers);

  const today = todayISO();
  const windowStart = windowStartFor(periodMonths);
  const invs = state.investimentos;
  const cdiReady = cdiStatus === 'ok' ? cdi : null;

  const carteira = buildReturnSeries(invs, windowStart, today, cdiReady);
  const lastCarteira = carteira[carteira.length-1];
  const positions = invs.map(inv => ({inv, pos: positionOf(inv, cdiReady)}));
  const totalAportado = positions.reduce((s,p)=>s+p.pos.aportado, 0);
  const totalSaldo = positions.reduce((s,p)=>s+p.pos.saldo, 0);
  const totalRend = totalSaldo - totalAportado;

  const cdiNote = {
    loading: '<div class="iv-note">Carregando CDI do Banco Central…</div>',
    error: '<div class="iv-note iv-note-warn">Não foi possível carregar o CDI do Banco Central. Os comparativos ficam indisponíveis.</div>'
  }[cdiStatus] || '';

  root.innerHTML = `
    <div id="iv-page">
    <div class="mv-topbar iv-topbar">
      <button class="cf-month-btn" id="iv-back">‹</button>
      <div class="cf-title" style="margin:0;flex:1;">Investimentos</div>
      <button class="cf-btn ghost" id="iv-update">Atualizar saldos</button>
      <button class="cf-btn primary" id="iv-new">+ Investimento</button>
    </div>

    <div class="iv-period">
      <div class="cf-segmented" id="iv-period">
        ${PERIODOS.map(p=>`<button data-v="${p.months}" class="${periodMonths===p.months?'active':''}">${p.label}</button>`).join('')}
      </div>
      <div class="cf-segmented iv-mode" id="iv-mode">
        <button data-v="rent" class="${viewMode==='rent'?'active':''}">Rendimento</button>
        <button data-v="valor" class="${viewMode==='valor'?'active':''}">Valor</button>
      </div>
    </div>
    ${cdiNote}

    <div class="dv-kpi-row">
      <div class="dv-kpi-tile">
        <div class="dv-kpi-label">Total aportado</div>
        <div class="dv-kpi-value">${fmtBRL(totalAportado)}</div>
      </div>
      <div class="dv-kpi-tile">
        <div class="dv-kpi-label">Saldo bruto</div>
        <div class="dv-kpi-value">${fmtBRL(totalSaldo)}</div>
      </div>
      <div class="dv-kpi-tile">
        <div class="dv-kpi-label">Rendimento bruto</div>
        <div class="dv-kpi-value">${fmtBRL(totalRend)}</div>
        <div class="iv-kpi-sub">${fmtPct(totalAportado ? totalRend/totalAportado : 0)} sobre o aportado</div>
      </div>
      <div class="dv-kpi-tile">
        <div class="dv-kpi-label">Carteira no período</div>
        <div class="dv-kpi-value">${lastCarteira ? fmtPct(lastCarteira.rent) : '—'}</div>
        <div class="iv-kpi-sub">CDI ${lastCarteira ? fmtPct(lastCarteira.cdi) : '—'} · ${lastCarteira && lastCarteira.pctCdi !== null ? fmtPct(lastCarteira.pctCdi, 1)+' do CDI' : '—'}</div>
      </div>
    </div>

    <div class="dv-section" id="iv-sec-geral"></div>
    <div class="dv-section" id="iv-sec-cat"></div>
    <div class="dv-section" id="iv-sec-inv"></div>

    <div class="dv-section">
      <div class="dv-section-head">
        <div class="dv-section-title">Posições atuais</div>
        <button class="cf-chip" id="iv-new-2">+ Novo investimento</button>
      </div>
      ${positionsTableHTML(positions, totalAportado, totalSaldo)}
    </div>
    </div>
  `;

  document.getElementById('iv-back').onclick = ()=>{
    root.classList.remove('wide');
    handlers.onBack();
  };
  const rerender = ()=> renderInvestments(handlers);
  document.getElementById('iv-new').onclick = ()=> openInvestSheet(null, { onChange: rerender });
  document.getElementById('iv-new-2').onclick = ()=> openInvestSheet(null, { onChange: rerender });
  document.getElementById('iv-update').onclick = ()=> openUpdateBalancesSheet({ onChange: rerender });
  root.querySelectorAll('.iv-pos-row').forEach(tr=>{
    tr.onclick = ()=> openInvestSheet(tr.dataset.id, { onChange: rerender });
  });
  root.querySelectorAll('#iv-period button').forEach(btn=>{
    btn.onclick = ()=>{ periodMonths = +btn.dataset.v; rerender(); };
  });

  root.querySelectorAll('#iv-mode button').forEach(btn=>{
    btn.onclick = ()=>{ viewMode = btn.dataset.v; rerender(); };
  });

  const domainStart = carteira.length ? carteira[0].date : windowStart;
  const domain = [domainStart, today];
  const isValor = viewMode === 'valor';

  const catGroups = CATEGORIAS
    .map(c => ({cat: c, invs: invs.filter(inv => inv.categoria === c.key)}))
    .filter(x => x.invs.length);
  const catSeries = catGroups.map(x =>
    toSeries(x.cat.label, x.cat.color, buildReturnSeries(x.invs, windowStart, today, cdiReady)));
  const invSeries = invs.map(inv =>
    toSeries(inv.codigo, investColor(inv), buildReturnSeries([inv], windowStart, today, cdiReady)));
  const carteiraSeries = toSeries('Carteira', INVEST_COLORS[0], carteira);

  // a linha do CDI parte do início do gráfico; cada série tem seu próprio CDI no tooltip
  const withCdi = (series)=>{
    if(isValor || !cdiReady) return series;
    const dates = [...new Set(series.flatMap(s => s.points.map(p => p.date)))].sort();
    const cdiPoints = dates.map(d => ({date: d, y: cdiReady.factor(domainStart, d) - 1}));
    return [...series, {label:'CDI', color: COLOR_CDI, dashed:true, points: cdiPoints}];
  };

  const common = {
    domain,
    fmtY: isValor ? fmtBRLCompact : (v => fmtPct(v, 1)),
    tipValue: isValor ? valorTip : rendTip
  };
  const metricLabel = isValor ? 'saldo bruto' : 'rendimento acumulado no período';

  // 1) carteira
  renderChartSection(document.getElementById('iv-sec-geral'), {
    ...common, key: 'geral',
    title: isValor ? 'Carteira — saldo bruto' : 'Carteira x CDI — rendimento acumulado no período',
    hint: isValor
      ? 'Soma dos saldos brutos; as subidas fortes são novos aportes, não rendimento.'
      : 'Rendimento ponderado pelo tempo (desconta os aportes), a partir do início do período.',
    series: withCdi([carteiraSeries])
  });

  // 2) por categoria
  renderChartSection(document.getElementById('iv-sec-cat'), {
    ...common, key: 'cat',
    title: `Por categoria — ${metricLabel}`,
    hint: isValor
      ? 'Soma dos saldos brutos dos investimentos de cada categoria.'
      : 'Cada categoria parte de 0% no primeiro aporte do período. O tracejado é o CDI desde o início do gráfico; o CDI exato de cada uma aparece ao passar o mouse.',
    series: withCdi(catSeries)
  });

  // 3) por investimento
  renderChartSection(document.getElementById('iv-sec-inv'), {
    ...common, key: 'inv',
    title: `Por investimento — ${metricLabel}`,
    hint: isValor
      ? 'Saldo bruto de cada investimento nas datas informadas.'
      : 'Cada investimento parte de 0% no aporte (ou no início do período). O CDI exato de cada um aparece ao passar o mouse.',
    series: withCdi(invSeries)
  });
}

function toSeries(label, color, points){
  return {label, color, points: points.map(p => ({date: p.date, y: viewMode === 'valor' ? p.saldo : p.rent, extra: p}))};
}

function rendTip(p){
  if(!p.extra) return fmtPct(p.y, 2);
  const e = p.extra;
  const cdiPart = e.cdi === null ? '' :
    ` <span class="iv-tip-soft">· CDI ${fmtPct(e.cdi)}${e.pctCdi !== null ? ' · ' + fmtPct(e.pctCdi, 1) + ' do CDI' : ''}</span>`;
  return fmtPct(e.rent) + cdiPart;
}

function valorTip(p){
  const e = p.extra;
  return `${fmtBRL(e.saldo)} <span class="iv-tip-soft">· aportado ${fmtBRL(e.aportado)}</span>`;
}

function positionsTableHTML(positions, totalAportado, totalSaldo){
  if(!positions.length) return '<div class="dv-sim-empty">Nenhum investimento cadastrado. Use “+ Investimento”.</div>';
  const totalRend = totalSaldo - totalAportado;
  return `
    <div class="mv-table-scroll">
      <table class="mv-table iv-table">
        <thead>
          <tr>
            <th>ID</th><th>Categoria</th><th>Emissor</th><th>Aporte</th><th title="Aporte inicial + aportes − resgates">Aportado</th><th>Taxa</th>
            <th>Vencimento</th><th>Carência</th><th>IR</th><th>FGC</th><th>Posição em</th>
            <th>Saldo bruto</th><th>Rend. bruto</th><th>Rent. bruta</th><th>CDI</th><th>% do CDI</th>
          </tr>
        </thead>
        <tbody>
          ${positions.map(({inv, pos})=>`
            <tr class="mv-row iv-pos-row" data-id="${inv.id}">
              <td class="mv-td-item"><span class="dv-legend-swatch" style="background:${investColor(inv)};"></span> ${escapeHTML(inv.codigo)}</td>
              <td>${escapeHTML(categoriaOf(inv.categoria).label)}</td>
              <td>${escapeHTML(inv.emissor)}</td>
              <td>${fmtDateFull(inv.dataAporte)}</td>
              <td class="iv-num">${fmtBRL(pos.aportado)}</td>
              <td>${escapeHTML(inv.taxa) || '—'}</td>
              <td>${inv.vencimento ? fmtDateFull(inv.vencimento) : 'a confirmar'}</td>
              <td>${escapeHTML(inv.carencia) || '—'}</td>
              <td>${escapeHTML(inv.ir) || '—'}</td>
              <td>${escapeHTML(inv.fgc) || '—'}</td>
              <td>${fmtDateFull(pos.data)}</td>
              <td class="iv-num"><b>${fmtBRL(pos.saldo)}</b></td>
              <td class="iv-num">${fmtBRL(pos.rend)}</td>
              <td class="iv-num">${fmtPct(pos.rent)}</td>
              <td class="iv-num">${fmtPct(pos.cdiRent)}</td>
              <td class="iv-num">${fmtPct(pos.pctCdi, 1)}</td>
            </tr>
          `).join('')}
          <tr class="iv-total-row">
            <td>Total</td><td></td><td></td><td></td>
            <td class="iv-num">${fmtBRL(totalAportado)}</td>
            <td></td><td></td><td></td><td></td><td></td><td></td>
            <td class="iv-num"><b>${fmtBRL(totalSaldo)}</b></td>
            <td class="iv-num">${fmtBRL(totalRend)}</td>
            <td class="iv-num">${fmtPct(totalAportado ? totalRend/totalAportado : 0)}</td>
            <td></td><td></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="iv-note" style="padding:8px 0 0;">Rendimento e % do CDI desde o aporte até a última posição informada. Toque numa linha para editar o cadastro e o histórico.</div>
  `;
}

function renderChartSection(container, cfg, tableOpen = false){
  const isHidden = (s)=> hiddenSeries.has(cfg.key + ':' + s.label);
  const visible = { ...cfg, series: cfg.series.filter(s => !isHidden(s)) };
  const legend = cfg.series.map(s=>`
    <button type="button" class="dv-legend-item iv-legend-btn ${isHidden(s)?'off':''}" data-label="${escapeHTML(s.label)}" title="${isHidden(s)?'Mostrar':'Ocultar'} série">
      <span class="dv-legend-swatch line ${s.dashed?'dashed':''}" style="${s.dashed ? 'border-top-color:'+s.color : 'background:'+s.color};"></span>${escapeHTML(s.label)}
    </button>`).join('');
  container.innerHTML = `
    <div class="dv-section-head">
      <div class="dv-section-title">${cfg.title}</div>
      <div class="dv-legend iv-legend">${legend}</div>
    </div>
    <div class="iv-hint">${cfg.hint}</div>
    <div class="dv-chart-wrap"></div>
    <button class="dv-table-toggle">${tableOpen ? 'Ocultar tabela' : 'Ver como tabela'}</button>
    <div class="dv-table-wrap" style="display:${tableOpen ? 'block' : 'none'};"></div>
  `;
  const toggle = container.querySelector('.dv-table-toggle');
  const tableWrap = container.querySelector('.dv-table-wrap');

  container.querySelectorAll('.iv-legend-btn').forEach(btn=>{
    btn.onclick = ()=>{
      const k = cfg.key + ':' + btn.dataset.label;
      if(hiddenSeries.has(k)) hiddenSeries.delete(k); else hiddenSeries.add(k);
      renderChartSection(container, cfg, tableWrap.style.display !== 'none');
    };
  });

  const wrap = container.querySelector('.dv-chart-wrap');
  if(!visible.series.some(s => s.points.length)){
    wrap.innerHTML = `<div class="iv-empty">${cfg.series.some(s => s.points.length) ? 'Todas as séries estão ocultas. Toque na legenda para exibir.' : 'Sem dados suficientes neste período.'}</div>`;
    toggle.style.display = 'none';
    tableWrap.style.display = 'none';
    return;
  }
  renderTimeChart(wrap, visible);
  renderSeriesTable(tableWrap, visible);
  toggle.onclick = ()=>{
    const showing = tableWrap.style.display !== 'none';
    tableWrap.style.display = showing ? 'none' : 'block';
    toggle.textContent = showing ? 'Ver como tabela' : 'Ocultar tabela';
  };
}

function renderSeriesTable(container, cfg){
  const dates = [...new Set(cfg.series.flatMap(s => s.points.map(p => p.date)))].sort();
  container.innerHTML = `
    <div class="mv-table-scroll">
      <table class="mv-table dv-table">
        <thead><tr><th>Data</th>${cfg.series.map(s=>`<th>${escapeHTML(s.label)}</th>`).join('')}</tr></thead>
        <tbody>
          ${dates.map(d=>`
            <tr>
              <td>${fmtDateFull(d)}</td>
              ${cfg.series.map(s=>{
                const p = s.points.find(x => x.date === d);
                return `<td class="iv-num">${p ? cfg.fmtY(p.y) : '—'}</td>`;
              }).join('')}
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function niceStep(raw){
  const exp = Math.floor(Math.log10(raw));
  const base = Math.pow(10, exp);
  const n = raw / base;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * base;
}

function timeTicks(d0, d1){
  const spanDays = (Date.parse(d1) - Date.parse(d0)) / 86400000;
  const ticks = [];
  let [y, m] = d0.split('-').map(Number);
  const days = spanDays < 120 ? [1, 15] : [1];
  while(true){
    for(const d of days){
      const iso = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      if(iso > d1) return thin(ticks);
      if(iso >= d0) ticks.push(iso);
    }
    m++; if(m > 12){ m = 1; y++; }
  }
  function thin(t){
    const skip = Math.ceil(t.length / 8);
    return t.filter((_,i) => i % skip === 0);
  }
}

function tickLabel(iso, spanDays){
  const [y,m,d] = iso.split('-');
  if(spanDays < 120) return `${d}/${m}`;
  const mon = new Date(+y, +m-1, 1).toLocaleDateString('pt-BR', {month:'short'}).replace('.','');
  return mon.charAt(0).toUpperCase() + mon.slice(1) + '/' + y.slice(2);
}

// gráfico de linhas com eixo de tempo contínuo; séries podem ter datas diferentes
function renderTimeChart(container, cfg){
  const W = 880, H = 300;
  const marginL = 58, marginR = 16, marginT = 16, marginB = 34;
  const plotW = W - marginL - marginR;
  const plotH = H - marginT - marginB;

  const [d0, d1] = cfg.domain;
  const t0 = Date.parse(d0), t1 = Math.max(Date.parse(d1), t0 + 86400000);
  const spanDays = (t1 - t0) / 86400000;
  const xOf = (iso)=> marginL + (Date.parse(iso) - t0) / (t1 - t0) * plotW;

  const ys = cfg.series.flatMap(s => s.points.map(p => p.y));
  let minY = cfg.includeZero === false ? Math.min(...ys) : Math.min(0, ...ys);
  let maxY = Math.max(...ys);
  if(maxY - minY < 1e-9){ minY -= 0.05; maxY += 0.05; }
  const step = niceStep((maxY - minY) / 4);
  minY = Math.floor(minY / step) * step;
  maxY = Math.ceil(maxY / step) * step;
  const yOf = (v)=> marginT + plotH - (v - minY) / (maxY - minY) * plotH;

  let gridSVG = '';
  for(let v = minY; v <= maxY + step/2; v += step){
    const y = yOf(v);
    gridSVG += `<line x1="${marginL}" y1="${y}" x2="${W-marginR}" y2="${y}" class="dv-grid ${Math.abs(v) < step/2 ? 'dv-grid-zero' : ''}"/>`;
    gridSVG += `<text x="${marginL-8}" y="${y+3}" class="dv-axis-label" text-anchor="end">${cfg.fmtY(v)}</text>`;
  }
  const labelsSVG = timeTicks(d0, d1).map(iso =>
    `<text x="${xOf(iso)}" y="${H-marginB+18}" class="dv-axis-label" text-anchor="middle">${tickLabel(iso, spanDays)}</text>`
  ).join('');

  const linesSVG = cfg.series.map(s=>{
    const pts = s.points.map(p => [xOf(p.date), yOf(p.y)]);
    const path = pts.length > 1
      ? `<path d="${pts.map((p,i)=> (i===0?'M':'L')+p[0]+','+p[1]).join(' ')}" fill="none" stroke="${s.color}" stroke-width="2" ${s.dashed?'stroke-dasharray="6,5"':''} stroke-linejoin="round" stroke-linecap="round"/>`
      : '';
    const markers = s.dashed ? '' : pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${s.color}" stroke="#fff" stroke-width="2"/>`).join('');
    return path + markers;
  }).join('');

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="dv-svg" preserveAspectRatio="xMidYMid meet">
      ${gridSVG}
      ${linesSVG}
      ${labelsSVG}
      <line class="dv-crosshair iv-crosshair" x1="0" y1="${marginT}" x2="0" y2="${marginT+plotH}" style="display:none;"/>
      <rect class="dv-hit-full" x="${marginL}" y="${marginT}" width="${plotW}" height="${plotH}" fill="transparent"/>
    </svg>
  `;

  const tip = document.createElement('div');
  tip.className = 'dv-tooltip';
  container.appendChild(tip);

  const svgEl = container.querySelector('svg');
  const hit = container.querySelector('.dv-hit-full');
  const crosshair = container.querySelector('.iv-crosshair');
  const allDates = [...new Set(cfg.series.flatMap(s => s.points.map(p => p.date)))].sort();

  hit.addEventListener('pointerleave', ()=>{
    crosshair.style.display = 'none';
    tip.style.display = 'none';
  });
  hit.addEventListener('pointermove', (e)=>{
    const rect = svgEl.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const scale = rect.width / W;
    const px = (e.clientX - rect.left) / scale;
    let best = allDates[0], bestDist = Infinity;
    allDates.forEach(d=>{
      const dist = Math.abs(xOf(d) - px);
      if(dist < bestDist){ bestDist = dist; best = d; }
    });
    const dx = xOf(best);
    crosshair.setAttribute('x1', dx); crosshair.setAttribute('x2', dx);
    crosshair.style.display = 'block';

    const rows = cfg.series
      .map(s => ({s, p: s.points.find(p => p.date === best)}))
      .filter(r => r.p)
      .sort((a,b) => b.p.y - a.p.y)
      .map(r => `<div class="dv-tooltip-row"><span class="dv-tooltip-key" style="background:${r.s.color};${r.s.dashed ? 'box-shadow:0 0 0 1px #fff;' : ''}"></span>${escapeHTML(r.s.label)} <b>${cfg.tipValue ? cfg.tipValue(r.p) : cfg.fmtY(r.p.y)}</b></div>`)
      .join('');

    tip.innerHTML = `<div class="dv-tooltip-title">${fmtDateFull(best)}</div>${rows}`;
    tip.style.display = 'block';
    const x = dx*scale + rect.left - containerRect.left;
    let left = x + 12;
    if(left + 260 > containerRect.width) left = x - 272;
    tip.style.left = Math.max(0, left) + 'px';
    tip.style.top = (marginT*scale + rect.top - containerRect.top) + 'px';
  });
}
