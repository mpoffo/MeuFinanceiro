import { root } from './dom.js';
import state from '../state.js';
import { monthSummaries } from '../domain.js';
import {
  fmtBRL, fmtBRLCompact, fmtDateShort, monthLabelShort, lastNMonths, shiftMonth, todayISO, uid, escapeHTML
} from '../utils.js';

const MONTHS_BACK = 12;
const MIN_MONTH = '2026-01';

const HORIZON_OPTIONS = [
  {value:0, label:'Sem projeção'},
  {value:12, label:'12 meses'},
  {value:24, label:'24 meses'},
  {value:36, label:'36 meses'},
  {value:48, label:'48 meses'}
];

const SERIES = [
  {key:'entradas', label:'Entradas', color:'#1B8A5A'},
  {key:'saidas', label:'Saídas', color:'#B42318'},
  {key:'saldo', label:'Saldo', color:'#2563EB'}
];
const COLOR_SALDO = '#2563EB';
const DEFAULT_GROUP = 'Padrão';

// simulação: nunca é salva no Supabase, mas persiste no localStorage do navegador
// (por usuário) para sobreviver a recarregamentos da página
let projectionHorizon = 12;
let simulatedEntries = [];
let projectedEntradas = 0;
let projectedSaidas = 0;
// grupos de simulação: nome -> ativo (true/false); grupo sem entrada aqui é tratado como ativo
let groupState = {};
let simulationLoaded = false;
// mês selecionado (índice na série combinada realizado+projetado) para o painel de detalhe;
// null = usa o mês atual (boundaryIndex) como padrão
let selectedMonthIndex = null;

function simulationStorageKey(){
  return `cf-simulacao-${state.currentUser ? state.currentUser.id : 'anon'}`;
}

function loadSimulationFromStorage(){
  simulationLoaded = true;
  try{
    const raw = localStorage.getItem(simulationStorageKey());
    if(!raw) return;
    const parsed = JSON.parse(raw);
    if(Array.isArray(parsed.simulatedEntries)){
      // simulados salvos antes do recurso de grupos assumem o grupo padrão
      simulatedEntries = parsed.simulatedEntries.map(it => ({...it, grupo: it.grupo || DEFAULT_GROUP}));
    }
    if(typeof parsed.projectionHorizon === 'number') projectionHorizon = parsed.projectionHorizon;
    if(typeof parsed.projectedEntradas === 'number') projectedEntradas = parsed.projectedEntradas;
    if(typeof parsed.projectedSaidas === 'number') projectedSaidas = parsed.projectedSaidas;
    if(parsed.groupState && typeof parsed.groupState === 'object') groupState = parsed.groupState;
  }catch(e){
    // localStorage indisponível ou dados corrompidos: segue com o padrão em memória
  }
}

function saveSimulationToStorage(){
  try{
    localStorage.setItem(simulationStorageKey(), JSON.stringify({
      simulatedEntries, projectionHorizon, projectedEntradas, projectedSaidas, groupState
    }));
  }catch(e){
    // localStorage indisponível (modo privado, cota cheia etc.): simulação continua só em memória
  }
}

function isGroupActive(grupo){
  return groupState[grupo || DEFAULT_GROUP] !== false;
}

function activeSimulatedEntries(simulated){
  return simulated.filter(it => isGroupActive(it.grupo));
}

function distinctGroups(simulated){
  return [...new Set(simulated.map(it => it.grupo || DEFAULT_GROUP))];
}

function groupLanesHTML(simulated){
  if(!simulated.length) return '<div class="dv-sim-empty">Nenhum lançamento simulado ainda.</div>';
  return `
    <div class="dv-group-lanes">
      ${distinctGroups(simulated).map(g=>{
        const active = isGroupActive(g);
        const entries = simulated.filter(it => (it.grupo || DEFAULT_GROUP) === g);
        return `
        <div class="dv-group-lane ${active?'':'inactive'}">
          <div class="dv-group-lane-head">
            <button type="button" class="dv-group-chip ${active?'active':'inactive'}" data-grupo="${escapeHTML(g)}">${escapeHTML(g)}</button>
            <button type="button" class="dv-group-dup" data-grupo="${escapeHTML(g)}" title="Duplicar grupo">⧉</button>
            <span class="dv-group-lane-count">${entries.length} lançamento(s)</span>
          </div>
          <div class="dv-sim-list">
            ${entries.map(it=>`
              <span class="dv-sim-chip ${it.tipo}">
                ${monthLabelShort(it.month)} · ${it.tipo==='entrada'?'+':'−'} ${fmtBRL(it.valor)}${it.parcelas>1 ? ' · '+it.parcelas+'x '+(it.frequencia==='anual'?'anual':'mensal') : ''}${it.descricao ? ' · '+escapeHTML(it.descricao) : ''}
                <button class="dv-sim-remove" data-id="${it.id}">×</button>
              </span>
            `).join('')}
          </div>
        </div>`;
      }).join('')}
    </div>
  `;
}

function niceMax(v){
  if(v <= 0) return 100;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const n = v / base;
  let niceN;
  if(n <= 1) niceN = 1;
  else if(n <= 2) niceN = 2;
  else if(n <= 5) niceN = 5;
  else niceN = 10;
  return niceN * base;
}

function simulatedOccurrenceMonths(entry){
  const step = entry.frequencia === 'anual' ? 12 : 1;
  const result = [];
  for(let i=0;i<entry.parcelas;i++) result.push(shiftMonth(entry.month, i*step));
  return result;
}

function simulatedTotalsFor(month, simulated){
  let entradas = 0, saidas = 0;
  simulated.forEach(entry=>{
    if(!simulatedOccurrenceMonths(entry).includes(month)) return;
    if(entry.tipo === 'entrada') entradas += entry.valor; else saidas += entry.valor;
  });
  return {entradas, saidas};
}

function simulatedEntriesForMonth(simulated, month){
  return simulated.filter(entry => simulatedOccurrenceMonths(entry).includes(month));
}

function realItemsForMonth(items, month){
  return items
    .filter(it => it.tipo !== 'saldo' && it.vencimento && it.vencimento.slice(0,7) === month)
    .sort((a,b)=> (a.vencimento < b.vencimento ? -1 : a.vencimento > b.vencimento ? 1 : 0));
}

function buildCumulativeSeries(items, historicalMonths, futureMonths, fixedEntradas, fixedSaidas, simulated){
  const real = monthSummaries(items, historicalMonths).map(s=>({...s, projected:false}));
  const projected = futureMonths.map(month=>({
    month, entradas: fixedEntradas, saidas: fixedSaidas, saldo: fixedEntradas-fixedSaidas, projected:true
  }));
  let cum = 0;
  return [...real, ...projected].map(s=>{
    const sim = simulatedTotalsFor(s.month, simulated);
    const entradas = s.entradas + sim.entradas;
    const saidas = s.saidas + sim.saidas;
    const saldo = entradas - saidas;
    cum += saldo;
    return {month: s.month, entradas, saidas, saldo, projected: s.projected, acumulado: cum};
  });
}

export function renderDashboard(handlers){
  root.classList.add('wide');
  if(!simulationLoaded) loadSimulationFromStorage();

  const anchorMonth = todayISO().slice(0,7);
  const months = lastNMonths(anchorMonth, MONTHS_BACK).filter(m => m >= MIN_MONTH);
  const summaries = monthSummaries(state.items, months);

  const totalEntradas = summaries.reduce((s,m)=>s+m.entradas, 0);
  const totalSaidas = summaries.reduce((s,m)=>s+m.saidas, 0);
  const saldoPeriodo = totalEntradas - totalSaidas;
  const rangeLabel = `${monthLabelShort(months[0])} – ${monthLabelShort(months[months.length-1])}`;

  root.innerHTML = `
    <div class="mv-topbar">
      <button class="cf-month-btn" id="dv-back">‹</button>
      <div class="cf-title" style="margin:0;flex:1;">Dashboard</div>
    </div>

    <div class="dv-subtitle">Últimos ${months.length===1?'1 mês':months.length+' meses'} · ${rangeLabel}</div>

    <div class="dv-kpi-row">
      <div class="dv-kpi-tile">
        <div class="dv-kpi-label">Entradas no período</div>
        <div class="dv-kpi-value" style="color:${SERIES[0].color};">${fmtBRL(totalEntradas)}</div>
      </div>
      <div class="dv-kpi-tile">
        <div class="dv-kpi-label">Saídas no período</div>
        <div class="dv-kpi-value" style="color:${SERIES[1].color};">${fmtBRL(totalSaidas)}</div>
      </div>
      <div class="dv-kpi-tile">
        <div class="dv-kpi-label">Saldo do período</div>
        <div class="dv-kpi-value" style="color:${SERIES[2].color};">${fmtBRL(saldoPeriodo)}</div>
      </div>
    </div>

    <div class="dv-section">
      <div class="dv-section-head">
        <div class="dv-section-title">Entradas, saídas e saldo por mês</div>
        <div class="dv-legend">
          ${SERIES.map(s=>`<span class="dv-legend-item"><span class="dv-legend-swatch line" style="background:${s.color};"></span>${s.label}</span>`).join('')}
        </div>
      </div>
      <div class="dv-chart-wrap" id="dv-chart-wrap"></div>
      <button class="dv-table-toggle" id="dv-table-toggle">Ver como tabela</button>
      <div class="dv-table-wrap" id="dv-table-wrap" style="display:none;"></div>
    </div>

    <div class="dv-section" id="dv-projection-section"></div>
  `;

  document.getElementById('dv-back').onclick = ()=>{
    root.classList.remove('wide');
    handlers.onBack();
  };

  renderLineChart(document.getElementById('dv-chart-wrap'), summaries);
  renderTable(document.getElementById('dv-table-wrap'), summaries);

  const tableToggle = document.getElementById('dv-table-toggle');
  const tableWrap = document.getElementById('dv-table-wrap');
  tableToggle.onclick = ()=>{
    const showing = tableWrap.style.display !== 'none';
    tableWrap.style.display = showing ? 'none' : 'block';
    tableToggle.textContent = showing ? 'Ver como tabela' : 'Ocultar tabela';
  };

  renderProjectionSection(document.getElementById('dv-projection-section'), months, anchorMonth);
}

function renderProjectionSection(container, months, anchorMonth){
  const futureMonths = projectionHorizon > 0
    ? Array.from({length:projectionHorizon}, (_,i)=> shiftMonth(anchorMonth, i+1))
    : [];
  const activeSim = activeSimulatedEntries(simulatedEntries);
  const series = buildCumulativeSeries(state.items, months, futureMonths, projectedEntradas, projectedSaidas, activeSim);
  const boundaryIndex = months.length - 1;
  const lastMonthAllowed = futureMonths.length ? futureMonths[futureMonths.length-1] : months[months.length-1];
  const selIndex = (selectedMonthIndex !== null && selectedMonthIndex < series.length) ? selectedMonthIndex : boundaryIndex;

  container.innerHTML = `
    <div class="dv-projected-inputs">
      <div class="dv-projected-field">
        <label for="dv-proj-entradas">Entradas fixas projetadas / mês</label>
        <input type="number" id="dv-proj-entradas" step="0.01" min="0" value="${projectedEntradas || ''}" placeholder="R$ 0,00">
      </div>
      <div class="dv-projected-field">
        <label for="dv-proj-saidas">Saídas fixas projetadas / mês</label>
        <input type="number" id="dv-proj-saidas" step="0.01" min="0" value="${projectedSaidas || ''}" placeholder="R$ 0,00">
      </div>
    </div>

    <div class="cf-segmented dv-horizon-toggle" id="dv-horizon">
      ${HORIZON_OPTIONS.map(o=>`<button data-v="${o.value}" class="${projectionHorizon===o.value?'active':''}">${o.label}</button>`).join('')}
    </div>

    <div class="dv-sim-box">
      <div class="dv-sim-title">Simular lançamento (entrada ou saída)</div>
      <div class="dv-sim-form">
        <div class="cf-segmented" id="dv-sim-tipo" style="max-width:160px;">
          <button data-v="entrada" class="active">Entrada</button>
          <button data-v="saida">Saída</button>
        </div>
        <input type="month" id="dv-sim-mes" min="${months[0]}" max="${lastMonthAllowed}" value="${futureMonths[0] || months[months.length-1]}">
        <input type="number" id="dv-sim-valor" step="0.01" min="0" placeholder="Valor (R$)">
        <input type="number" id="dv-sim-parcelas" min="1" step="1" value="1" title="Parcelas" placeholder="Parcelas">
        <div class="cf-segmented" id="dv-sim-freq" style="max-width:160px;" title="Repetição das parcelas">
          <button data-v="mensal" class="active">Mensal</button>
          <button data-v="anual">Anual</button>
        </div>
        <input type="text" id="dv-sim-grupo" list="dv-sim-grupo-list" placeholder="Grupo" value="${DEFAULT_GROUP}">
        <datalist id="dv-sim-grupo-list">
          ${distinctGroups(simulatedEntries).map(g=>`<option value="${escapeHTML(g)}"></option>`).join('')}
        </datalist>
        <input type="text" id="dv-sim-desc" placeholder="Descrição (opcional)">
        <button class="cf-btn primary" id="dv-sim-add">Adicionar</button>
      </div>

      ${groupLanesHTML(simulatedEntries)}
    </div>

    <div class="dv-section-head" style="margin-top:20px;">
      <div class="dv-section-title">Projeção de saldo (acumulado)</div>
      <div class="dv-legend">
        <span class="dv-legend-item"><span class="dv-legend-swatch line" style="background:${COLOR_SALDO};"></span>Realizado</span>
        ${projectionHorizon>0 ? `<span class="dv-legend-item"><span class="dv-legend-swatch line dashed" style="border-top-color:${COLOR_SALDO};"></span>Projetado</span>` : ''}
      </div>
    </div>
    <div class="dv-chart-wrap" id="dv-cumulative-wrap"></div>
    <button class="dv-table-toggle" id="dv-cum-table-toggle">Ver como tabela</button>
    <div class="dv-table-wrap" id="dv-cum-table-wrap" style="display:none;"></div>

    <div class="dv-section-head" style="margin-top:20px;">
      <div class="dv-section-title">Entradas, saídas e saldo por mês (projeção)</div>
      <div class="dv-legend">
        ${SERIES.map(s=>`<span class="dv-legend-item"><span class="dv-legend-swatch line" style="background:${s.color};"></span>${s.label}</span>`).join('')}
      </div>
    </div>
    <div class="dv-chart-wrap" id="dv-monthly-wrap"></div>

    <div class="dv-stepper">
      <button class="cf-month-btn" id="dv-month-prev">‹</button>
      <div class="dv-stepper-label" id="dv-month-label"></div>
      <button class="cf-month-btn" id="dv-month-next">›</button>
    </div>
    <div class="dv-detail-panel" id="dv-detail-panel"></div>
  `;

  renderCumulativeChart(document.getElementById('dv-cumulative-wrap'), series, boundaryIndex);
  renderCumulativeTable(document.getElementById('dv-cum-table-wrap'), series);

  const detailPanel = document.getElementById('dv-detail-panel');
  const monthLabelEl = document.getElementById('dv-month-label');

  function selectMonth(i){
    selectedMonthIndex = Math.max(0, Math.min(series.length-1, i));
    monthChart.markSelected(selectedMonthIndex);
    updateStepperLabel();
    renderMonthDetail(detailPanel, series[selectedMonthIndex], state.items, simulatedEntries);
  }

  function updateStepperLabel(){
    const s = series[selectedMonthIndex];
    monthLabelEl.textContent = `${monthLabelShort(s.month)} · ${s.projected ? 'Projetado' : 'Realizado'}`;
  }

  const monthChart = renderMonthlySeriesChart(document.getElementById('dv-monthly-wrap'), series, boundaryIndex, (i)=> selectMonth(i));

  document.getElementById('dv-month-prev').onclick = ()=> selectMonth(selectedMonthIndex - 1);
  document.getElementById('dv-month-next').onclick = ()=> selectMonth(selectedMonthIndex + 1);

  selectMonth(selIndex);

  const cumToggle = document.getElementById('dv-cum-table-toggle');
  const cumWrap = document.getElementById('dv-cum-table-wrap');
  cumToggle.onclick = ()=>{
    const showing = cumWrap.style.display !== 'none';
    cumWrap.style.display = showing ? 'none' : 'block';
    cumToggle.textContent = showing ? 'Ver como tabela' : 'Ocultar tabela';
  };

  container.querySelectorAll('#dv-horizon button').forEach(btn=>{
    btn.onclick = ()=>{
      projectionHorizon = +btn.dataset.v;
      selectedMonthIndex = null;
      saveSimulationToStorage();
      renderProjectionSection(container, months, anchorMonth);
    };
  });

  container.querySelector('#dv-proj-entradas').onchange = (e)=>{
    projectedEntradas = Math.max(0, parseFloat(e.target.value) || 0);
    saveSimulationToStorage();
    renderProjectionSection(container, months, anchorMonth);
  };
  container.querySelector('#dv-proj-saidas').onchange = (e)=>{
    projectedSaidas = Math.max(0, parseFloat(e.target.value) || 0);
    saveSimulationToStorage();
    renderProjectionSection(container, months, anchorMonth);
  };

  const tipoSeg = container.querySelector('#dv-sim-tipo');
  tipoSeg.querySelectorAll('button').forEach(b=>{
    b.onclick = ()=>{
      tipoSeg.querySelectorAll('button').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
    };
  });

  const freqSeg = container.querySelector('#dv-sim-freq');
  freqSeg.querySelectorAll('button').forEach(b=>{
    b.onclick = ()=>{
      freqSeg.querySelectorAll('button').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
    };
  });

  container.querySelector('#dv-sim-add').onclick = ()=>{
    const tipo = tipoSeg.querySelector('.active').dataset.v;
    const month = container.querySelector('#dv-sim-mes').value;
    const valor = parseFloat(container.querySelector('#dv-sim-valor').value);
    const descricao = container.querySelector('#dv-sim-desc').value.trim();
    const parcelas = Math.max(1, parseInt(container.querySelector('#dv-sim-parcelas').value, 10) || 1);
    const frequencia = freqSeg.querySelector('.active').dataset.v;
    const grupo = container.querySelector('#dv-sim-grupo').value.trim() || DEFAULT_GROUP;
    if(!month || isNaN(valor) || valor <= 0) return;
    simulatedEntries.push({id: uid(), tipo, month, valor, descricao, parcelas, frequencia, grupo});
    saveSimulationToStorage();
    renderProjectionSection(container, months, anchorMonth);
  };

  container.querySelectorAll('.dv-group-chip').forEach(btn=>{
    btn.onclick = ()=>{
      const grupo = btn.dataset.grupo;
      groupState[grupo] = !isGroupActive(grupo);
      saveSimulationToStorage();
      renderProjectionSection(container, months, anchorMonth);
    };
  });

  container.querySelectorAll('.dv-group-dup').forEach(btn=>{
    btn.onclick = ()=>{
      const grupo = btn.dataset.grupo;
      const sugestao = grupo + ' (cópia)';
      const novoNome = prompt('Nome do novo grupo (cópia de "'+grupo+'")', sugestao);
      if(!novoNome || !novoNome.trim()) return;
      const nome = novoNome.trim();
      const copiados = simulatedEntries
        .filter(it => (it.grupo || DEFAULT_GROUP) === grupo)
        .map(it => ({...it, id: uid(), grupo: nome}));
      simulatedEntries.push(...copiados);
      saveSimulationToStorage();
      renderProjectionSection(container, months, anchorMonth);
    };
  });

  container.querySelectorAll('.dv-sim-remove').forEach(btn=>{
    btn.onclick = ()=>{
      simulatedEntries = simulatedEntries.filter(it=>it.id !== btn.dataset.id);
      saveSimulationToStorage();
      renderProjectionSection(container, months, anchorMonth);
    };
  });
}

function showTooltip(tip, container, x, y, html){
  tip.innerHTML = html;
  tip.style.display = 'block';
  const rect = container.getBoundingClientRect();
  let left = x + 12;
  if(left + 200 > rect.width) left = x - 212;
  tip.style.left = left + 'px';
  tip.style.top = Math.max(0, y - 10) + 'px';
}

function hideTooltip(tip){
  tip.style.display = 'none';
}

function labelSkip(n){
  if(n <= 12) return 1;
  if(n <= 24) return 2;
  return 3;
}

function renderLineChart(container, summaries){
  const W = 880, H = 300;
  const marginL = 58, marginR = 12, marginT = 16, marginB = 34;
  const plotW = W - marginL - marginR;
  const plotH = H - marginT - marginB;
  const n = summaries.length;
  const stepX = n > 1 ? plotW/(n-1) : 0;

  const allVals = summaries.flatMap(s=>[s.entradas, s.saidas, s.saldo]);
  const minV = Math.min(0, ...allVals);
  const maxRaw = Math.max(1, ...allVals.map(Math.abs));
  const maxVal = niceMax(maxRaw);
  const spanMin = minV < 0 ? -maxVal : 0;
  const span = maxVal - spanMin;

  const xOf = (i)=> marginL + i*stepX;
  const yOf = (v)=> marginT + plotH - ((v-spanMin)/span)*plotH;
  const baseY = yOf(Math.max(spanMin,0));

  let gridSVG = '';
  for(let i=0;i<=4;i++){
    const t = i/4;
    const v = spanMin + t*span;
    const y = yOf(v);
    gridSVG += `<line x1="${marginL}" y1="${y}" x2="${W-marginR}" y2="${y}" class="dv-grid"/>`;
    gridSVG += `<text x="${marginL-8}" y="${y+3}" class="dv-axis-label" text-anchor="end">${fmtBRLCompact(v)}</text>`;
  }
  if(spanMin < 0){
    gridSVG += `<line x1="${marginL}" y1="${baseY}" x2="${W-marginR}" y2="${baseY}" class="dv-grid dv-grid-zero"/>`;
  }

  const seriesPoints = SERIES.map(s=> summaries.map((m,i)=>[xOf(i), yOf(m[s.key])]));
  const linesSVG = SERIES.map((s,si)=>{
    const pts = seriesPoints[si];
    const path = pts.map((p,i)=> (i===0?'M':'L')+p[0]+','+p[1]).join(' ');
    return `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  }).join('');

  const skip = labelSkip(n);
  let labelsSVG = '';
  summaries.forEach((s,i)=>{
    if(i % skip !== 0 && i !== n-1) return;
    labelsSVG += `<text x="${xOf(i)}" y="${H-marginB+18}" class="dv-axis-label" text-anchor="middle">${monthLabelShort(s.month)}</text>`;
  });

  const dotsSVG = SERIES.map(s=>`
    <circle class="dv-dot-ring" data-series="${s.key}" r="6" fill="#fff" style="display:none;"/>
    <circle class="dv-dot" data-series="${s.key}" r="4" fill="${s.color}" style="display:none;"/>
  `).join('');

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="dv-svg" preserveAspectRatio="xMidYMid meet">
      ${gridSVG}
      ${linesSVG}
      ${labelsSVG}
      <line id="dv-crosshair" x1="0" y1="${marginT}" x2="0" y2="${marginT+plotH}" class="dv-crosshair" style="display:none;"/>
      ${dotsSVG}
      <rect class="dv-hit-full" x="${marginL}" y="${marginT}" width="${plotW}" height="${plotH}" fill="transparent"/>
    </svg>
  `;

  const tip = document.createElement('div');
  tip.className = 'dv-tooltip';
  container.appendChild(tip);

  const svgEl = container.querySelector('svg');
  const hit = container.querySelector('.dv-hit-full');
  const crosshair = container.querySelector('#dv-crosshair');
  const dots = container.querySelectorAll('.dv-dot');
  const dotRings = container.querySelectorAll('.dv-dot-ring');

  function nearestIndex(px){
    let best = 0, bestDist = Infinity;
    summaries.forEach((s,i)=>{
      const d = Math.abs(xOf(i)-px);
      if(d < bestDist){ bestDist = d; best = i; }
    });
    return best;
  }

  hit.addEventListener('pointerleave', ()=>{
    crosshair.style.display = 'none';
    dots.forEach(d=> d.style.display = 'none');
    dotRings.forEach(d=> d.style.display = 'none');
    hideTooltip(tip);
  });
  hit.addEventListener('pointermove', (e)=>{
    const rect = svgEl.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const scaleX = rect.width / W;
    const scaleY = rect.height / H;
    const offsetX = rect.left - containerRect.left;
    const offsetY = rect.top - containerRect.top;
    const px = (e.clientX - rect.left) / scaleX;
    const i = nearestIndex(px);
    const dx = xOf(i);

    crosshair.setAttribute('x1', dx); crosshair.setAttribute('x2', dx);
    crosshair.style.display = 'block';

    const s = summaries[i];
    let rowsHTML = '';
    SERIES.forEach((series, si)=>{
      const dy = yOf(s[series.key]);
      dots[si].setAttribute('cx', dx); dots[si].setAttribute('cy', dy); dots[si].style.display = 'block';
      dotRings[si].setAttribute('cx', dx); dotRings[si].setAttribute('cy', dy); dotRings[si].style.display = 'block';
      rowsHTML += `<div class="dv-tooltip-row"><span class="dv-tooltip-key" style="background:${series.color};"></span>${series.label} <b>${fmtBRL(s[series.key])}</b></div>`;
    });

    const tipX = dx*scaleX + offsetX;
    const tipY = yOf(s.entradas)*scaleY + offsetY;
    showTooltip(tip, container, tipX, tipY, `<div class="dv-tooltip-title">${monthLabelShort(s.month)}</div>${rowsHTML}`);
  });
}

function renderCumulativeChart(container, series, boundaryIndex){
  const W = 880, H = 300;
  const marginL = 58, marginR = 12, marginT = 16, marginB = 34;
  const plotW = W - marginL - marginR;
  const plotH = H - marginT - marginB;
  const n = series.length;
  const stepX = n > 1 ? plotW/(n-1) : 0;

  const vals = series.map(s=>s.acumulado);
  const minV = Math.min(0, ...vals);
  const maxRaw = Math.max(1, ...vals.map(Math.abs));
  const maxVal = niceMax(maxRaw);
  const spanMin = minV < 0 ? -maxVal : 0;
  const span = maxVal - spanMin;

  const xOf = (i)=> marginL + i*stepX;
  const yOf = (v)=> marginT + plotH - ((v-spanMin)/span)*plotH;
  const baseY = yOf(Math.max(spanMin,0));

  let gridSVG = '';
  for(let i=0;i<=4;i++){
    const t = i/4;
    const v = spanMin + t*span;
    const y = yOf(v);
    gridSVG += `<line x1="${marginL}" y1="${y}" x2="${W-marginR}" y2="${y}" class="dv-grid"/>`;
    gridSVG += `<text x="${marginL-8}" y="${y+3}" class="dv-axis-label" text-anchor="end">${fmtBRLCompact(v)}</text>`;
  }
  if(spanMin < 0){
    gridSVG += `<line x1="${marginL}" y1="${baseY}" x2="${W-marginR}" y2="${baseY}" class="dv-grid dv-grid-zero"/>`;
  }

  const points = series.map((s,i)=>[xOf(i), yOf(s.acumulado)]);
  const realPath = points.slice(0, boundaryIndex+1).map((p,i)=> (i===0?'M':'L')+p[0]+','+p[1]).join(' ');
  let projectedPath = '';
  if(boundaryIndex < n-1){
    projectedPath = points.slice(boundaryIndex).map((p,i)=> (i===0?'M':'L')+p[0]+','+p[1]).join(' ');
  }

  const skip = labelSkip(n);
  let labelsSVG = '';
  series.forEach((s,i)=>{
    if(i % skip !== 0 && i !== n-1) return;
    labelsSVG += `<text x="${xOf(i)}" y="${H-marginB+18}" class="dv-axis-label" text-anchor="middle">${monthLabelShort(s.month)}</text>`;
  });

  let boundarySVG = '';
  if(boundaryIndex < n-1){
    const [bx, by] = points[boundaryIndex];
    boundarySVG = `
      <line x1="${bx}" y1="${marginT}" x2="${bx}" y2="${marginT+plotH}" class="dv-grid" stroke-dasharray="3,3"/>
      <circle cx="${bx}" cy="${by}" r="5" fill="#fff" stroke="${COLOR_SALDO}" stroke-width="2"/>
      <text x="${bx}" y="${marginT-4}" class="dv-boundary-label" text-anchor="middle">Hoje</text>
    `;
  }

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="dv-svg" preserveAspectRatio="xMidYMid meet">
      ${gridSVG}
      <path d="${realPath}" fill="none" stroke="${COLOR_SALDO}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${projectedPath ? `<path d="${projectedPath}" fill="none" stroke="${COLOR_SALDO}" stroke-width="2" stroke-dasharray="6,5" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
      ${boundarySVG}
      ${labelsSVG}
      <line id="dv-cum-crosshair" x1="0" y1="${marginT}" x2="0" y2="${marginT+plotH}" class="dv-crosshair" style="display:none;"/>
      <circle id="dv-cum-dot-ring" r="6" fill="#fff" style="display:none;"/>
      <circle id="dv-cum-dot" r="4" fill="${COLOR_SALDO}" style="display:none;"/>
      <rect class="dv-hit-full" x="${marginL}" y="${marginT}" width="${plotW}" height="${plotH}" fill="transparent"/>
    </svg>
  `;

  const tip = document.createElement('div');
  tip.className = 'dv-tooltip';
  container.appendChild(tip);

  const svgEl = container.querySelector('svg');
  const hit = container.querySelector('.dv-hit-full');
  const crosshair = container.querySelector('#dv-cum-crosshair');
  const dot = container.querySelector('#dv-cum-dot');
  const dotRing = container.querySelector('#dv-cum-dot-ring');

  function nearestIndex(px){
    let best = 0, bestDist = Infinity;
    series.forEach((s,i)=>{
      const d = Math.abs(xOf(i)-px);
      if(d < bestDist){ bestDist = d; best = i; }
    });
    return best;
  }

  hit.addEventListener('pointerleave', ()=>{
    crosshair.style.display = 'none';
    dot.style.display = 'none';
    dotRing.style.display = 'none';
    hideTooltip(tip);
  });
  hit.addEventListener('pointermove', (e)=>{
    const rect = svgEl.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const scaleX = rect.width / W;
    const scaleY = rect.height / H;
    const offsetX = rect.left - containerRect.left;
    const offsetY = rect.top - containerRect.top;
    const px = (e.clientX - rect.left) / scaleX;
    const i = nearestIndex(px);
    const [dx, dy] = points[i];

    crosshair.setAttribute('x1', dx); crosshair.setAttribute('x2', dx);
    crosshair.style.display = 'block';
    dot.setAttribute('cx', dx); dot.setAttribute('cy', dy); dot.style.display = 'block';
    dotRing.setAttribute('cx', dx); dotRing.setAttribute('cy', dy); dotRing.style.display = 'block';

    const s = series[i];
    const tipX = dx*scaleX + offsetX;
    const tipY = dy*scaleY + offsetY;
    showTooltip(tip, container, tipX, tipY, `
      <div class="dv-tooltip-title">${monthLabelShort(s.month)}${s.projected ? ' · projetado' : ''}</div>
      <div class="dv-tooltip-row"><span class="dv-tooltip-key" style="background:${COLOR_SALDO};"></span>Saldo acumulado <b>${fmtBRL(s.acumulado)}</b></div>
      <div class="dv-tooltip-row">Saldo do mês <b>${fmtBRL(s.saldo)}</b></div>
    `);
  });
}

function renderMonthlySeriesChart(container, series, boundaryIndex, onSelect){
  const W = 880, H = 300;
  const marginL = 58, marginR = 12, marginT = 16, marginB = 34;
  const plotW = W - marginL - marginR;
  const plotH = H - marginT - marginB;
  const n = series.length;
  const stepX = n > 1 ? plotW/(n-1) : 0;

  const allVals = series.flatMap(s=>[s.entradas, s.saidas, s.saldo]);
  const minV = Math.min(0, ...allVals);
  const maxRaw = Math.max(1, ...allVals.map(Math.abs));
  const maxVal = niceMax(maxRaw);
  const spanMin = minV < 0 ? -maxVal : 0;
  const span = maxVal - spanMin;

  const xOf = (i)=> marginL + i*stepX;
  const yOf = (v)=> marginT + plotH - ((v-spanMin)/span)*plotH;
  const baseY = yOf(Math.max(spanMin,0));

  let gridSVG = '';
  for(let i=0;i<=4;i++){
    const t = i/4;
    const v = spanMin + t*span;
    const y = yOf(v);
    gridSVG += `<line x1="${marginL}" y1="${y}" x2="${W-marginR}" y2="${y}" class="dv-grid"/>`;
    gridSVG += `<text x="${marginL-8}" y="${y+3}" class="dv-axis-label" text-anchor="end">${fmtBRLCompact(v)}</text>`;
  }
  if(spanMin < 0){
    gridSVG += `<line x1="${marginL}" y1="${baseY}" x2="${W-marginR}" y2="${baseY}" class="dv-grid dv-grid-zero"/>`;
  }

  const linesSVG = SERIES.map(s=>{
    const pts = series.map((m,i)=>[xOf(i), yOf(m[s.key])]);
    const solid = pts.slice(0, boundaryIndex+1).map((p,i)=> (i===0?'M':'L')+p[0]+','+p[1]).join(' ');
    let dashed = '';
    if(boundaryIndex < n-1){
      dashed = pts.slice(boundaryIndex).map((p,i)=> (i===0?'M':'L')+p[0]+','+p[1]).join(' ');
    }
    return `<path d="${solid}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` +
      (dashed ? `<path d="${dashed}" fill="none" stroke="${s.color}" stroke-width="2" stroke-dasharray="6,5" stroke-linejoin="round" stroke-linecap="round"/>` : '');
  }).join('');

  const skip = labelSkip(n);
  let labelsSVG = '';
  series.forEach((s,i)=>{
    if(i % skip !== 0 && i !== n-1) return;
    labelsSVG += `<text x="${xOf(i)}" y="${H-marginB+18}" class="dv-axis-label" text-anchor="middle">${monthLabelShort(s.month)}</text>`;
  });

  let boundarySVG = '';
  if(boundaryIndex < n-1){
    const bx = xOf(boundaryIndex);
    boundarySVG = `
      <line x1="${bx}" y1="${marginT}" x2="${bx}" y2="${marginT+plotH}" class="dv-grid" stroke-dasharray="3,3"/>
      <text x="${bx}" y="${marginT-4}" class="dv-boundary-label" text-anchor="middle">Hoje</text>
    `;
  }

  const dotsSVG = SERIES.map(s=>`
    <circle class="dv-dot-ring" data-series="${s.key}" r="6" fill="#fff" style="display:none;"/>
    <circle class="dv-dot" data-series="${s.key}" r="4" fill="${s.color}" style="display:none;"/>
  `).join('');

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="dv-svg" preserveAspectRatio="xMidYMid meet">
      ${gridSVG}
      ${linesSVG}
      ${boundarySVG}
      ${labelsSVG}
      <line id="dv-mc-crosshair" x1="0" y1="${marginT}" x2="0" y2="${marginT+plotH}" class="dv-crosshair" style="display:none;"/>
      <line id="dv-mc-selected" x1="0" y1="${marginT}" x2="0" y2="${marginT+plotH}" class="dv-selected-line" style="display:none;"/>
      ${dotsSVG}
      <rect class="dv-hit-full dv-hit-clickable" x="${marginL}" y="${marginT}" width="${plotW}" height="${plotH}" fill="transparent"/>
    </svg>
  `;

  const tip = document.createElement('div');
  tip.className = 'dv-tooltip';
  container.appendChild(tip);

  const svgEl = container.querySelector('svg');
  const hit = container.querySelector('.dv-hit-full');
  const crosshair = container.querySelector('#dv-mc-crosshair');
  const selectedLine = container.querySelector('#dv-mc-selected');
  const dots = container.querySelectorAll('.dv-dot');
  const dotRings = container.querySelectorAll('.dv-dot-ring');

  function nearestIndex(px){
    let best = 0, bestDist = Infinity;
    series.forEach((s,i)=>{
      const d = Math.abs(xOf(i)-px);
      if(d < bestDist){ bestDist = d; best = i; }
    });
    return best;
  }

  hit.addEventListener('pointerleave', ()=>{
    crosshair.style.display = 'none';
    dots.forEach(d=> d.style.display = 'none');
    dotRings.forEach(d=> d.style.display = 'none');
    hideTooltip(tip);
  });
  hit.addEventListener('pointermove', (e)=>{
    const rect = svgEl.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const scaleX = rect.width / W;
    const scaleY = rect.height / H;
    const offsetX = rect.left - containerRect.left;
    const offsetY = rect.top - containerRect.top;
    const px = (e.clientX - rect.left) / scaleX;
    const i = nearestIndex(px);
    const dx = xOf(i);

    crosshair.setAttribute('x1', dx); crosshair.setAttribute('x2', dx);
    crosshair.style.display = 'block';

    const s = series[i];
    let rowsHTML = '';
    SERIES.forEach((sr, si)=>{
      const dy = yOf(s[sr.key]);
      dots[si].setAttribute('cx', dx); dots[si].setAttribute('cy', dy); dots[si].style.display = 'block';
      dotRings[si].setAttribute('cx', dx); dotRings[si].setAttribute('cy', dy); dotRings[si].style.display = 'block';
      rowsHTML += `<div class="dv-tooltip-row"><span class="dv-tooltip-key" style="background:${sr.color};"></span>${sr.label} <b>${fmtBRL(s[sr.key])}</b></div>`;
    });

    const tipX = dx*scaleX + offsetX;
    const tipY = yOf(s.entradas)*scaleY + offsetY;
    showTooltip(tip, container, tipX, tipY, `<div class="dv-tooltip-title">${monthLabelShort(s.month)}${s.projected ? ' · projetado' : ''}</div>${rowsHTML}<div class="dv-tooltip-hint">Clique para ver os itens</div>`);
  });
  hit.addEventListener('click', (e)=>{
    const rect = svgEl.getBoundingClientRect();
    const scaleX = rect.width / W;
    const px = (e.clientX - rect.left) / scaleX;
    onSelect(nearestIndex(px));
  });

  return {
    markSelected(i){
      const x = xOf(i);
      selectedLine.setAttribute('x1', x); selectedLine.setAttribute('x2', x);
      selectedLine.style.display = 'block';
    }
  };
}

function renderMonthDetail(container, s, items, simulated){
  const simForMonth = simulatedEntriesForMonth(simulated, s.month);
  const simHTML = simForMonth.length ? `
    <div class="dv-sim-list">
      ${simForMonth.map(it=>`
        <span class="dv-sim-chip ${it.tipo} ${isGroupActive(it.grupo)?'':'inactive'}">
          ${it.tipo==='entrada'?'+':'−'} ${fmtBRL(it.valor)}${it.parcelas>1 ? ' · '+it.parcelas+'x '+(it.frequencia==='anual'?'anual':'mensal') : ''}${it.descricao ? ' · '+escapeHTML(it.descricao) : ''}
          <span class="dv-sim-group-tag">${escapeHTML(it.grupo || DEFAULT_GROUP)}</span>
        </span>
      `).join('')}
    </div>
  ` : `<div class="dv-sim-empty">Nenhum lançamento simulado aplicado a este mês.</div>`;

  let bodyHTML;
  if(!s.projected){
    const realItems = realItemsForMonth(items, s.month);
    bodyHTML = `
      <div class="dv-detail-sub">Lançamentos reais considerados (${realItems.length})</div>
      ${realItems.length ? `
      <div class="mv-table-scroll">
        <table class="mv-table dv-table dv-detail-table">
          <tbody>
            ${realItems.map(it=>`
              <tr>
                <td class="mv-td-item">${escapeHTML(it.item)}</td>
                <td>${fmtDateShort(it.vencimento)}</td>
                <td class="mv-valor ${it.tipo}">${it.tipo==='entrada'?'+':'−'} ${fmtBRL(it.valor)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>` : `<div class="dv-sim-empty">Nenhum lançamento real neste mês.</div>`}
      <div class="dv-detail-sub">Lançamentos simulados aplicados a este mês (${simForMonth.length})</div>
      ${simHTML}
    `;
  } else {
    bodyHTML = `
      <div class="dv-detail-sub">Base fixa projetada</div>
      <div class="dv-detail-fixed">
        <span>Entradas <b style="color:${SERIES[0].color};">${fmtBRL(projectedEntradas)}</b></span>
        <span>Saídas <b style="color:${SERIES[1].color};">${fmtBRL(projectedSaidas)}</b></span>
      </div>
      <div class="dv-detail-sub">Lançamentos simulados que compõem este mês (${simForMonth.length})</div>
      ${simHTML}
    `;
  }

  container.innerHTML = `
    <div class="dv-detail-head">
      <div class="dv-detail-title">
        ${monthLabelShort(s.month)}
        <span class="cf-badge ${s.projected ? 'agendado' : 'pago'}">${s.projected ? 'Projetado' : 'Realizado'}</span>
      </div>
      <div class="dv-detail-totals">
        <span>Entradas <b style="color:${SERIES[0].color};">${fmtBRL(s.entradas)}</b></span>
        <span>Saídas <b style="color:${SERIES[1].color};">${fmtBRL(s.saidas)}</b></span>
        <span>Saldo <b style="color:${SERIES[2].color};">${fmtBRL(s.saldo)}</b></span>
      </div>
    </div>
    ${bodyHTML}
  `;
}

function renderTable(container, summaries){
  container.innerHTML = `
    <div class="mv-table-scroll">
      <table class="mv-table dv-table">
        <thead>
          <tr><th>Mês</th><th>Entradas</th><th>Saídas</th><th>Saldo</th></tr>
        </thead>
        <tbody>
          ${summaries.map(s=>`
            <tr>
              <td>${monthLabelShort(s.month)}</td>
              <td class="mv-valor entrada">${fmtBRL(s.entradas)}</td>
              <td class="mv-valor saida">${fmtBRL(s.saidas)}</td>
              <td class="mv-valor saldo">${fmtBRL(s.saldo)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderCumulativeTable(container, series){
  container.innerHTML = `
    <div class="mv-table-scroll">
      <table class="mv-table dv-table">
        <thead>
          <tr><th>Mês</th><th>Entradas</th><th>Saídas</th><th>Saldo do mês</th><th>Saldo acumulado</th><th>Situação</th></tr>
        </thead>
        <tbody>
          ${series.map(s=>`
            <tr>
              <td>${monthLabelShort(s.month)}</td>
              <td class="mv-valor entrada">${fmtBRL(s.entradas)}</td>
              <td class="mv-valor saida">${fmtBRL(s.saidas)}</td>
              <td class="mv-valor saldo">${fmtBRL(s.saldo)}</td>
              <td class="mv-valor saldo">${fmtBRL(s.acumulado)}</td>
              <td>${s.projected ? 'Projetado' : 'Realizado'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}
