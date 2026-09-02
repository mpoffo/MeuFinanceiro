import { root } from './dom.js';
import { showToast } from './toast.js';
import { APP_VERSION } from '../config.js';
import state from '../state.js';
import { saveAppData } from '../api/storage.js';
import {
  situacaoOf, situacaoLabel, effectiveDate, compareByEffectiveDate,
  computeRunningBalances, duplicateExact, moveItem
} from '../domain.js';
import {
  fmtBRL, fmtDateShort, formatGroupDate, monthLabel, shiftMonth, escapeHTML, todayISO
} from '../utils.js';

const FILTERS = [
  {key:'todos', label:'Todos'},
  {key:'pendente', label:'Pendente'},
  {key:'vencido', label:'Vencido'},
  {key:'agendado', label:'Agendado'},
  {key:'pago', label:'Pago'}
];

export function render(handlers){
  root.classList.remove('wide');
  if(!state.loaded){
    root.innerHTML = '<div style="padding:40px;text-align:center;color:var(--ink-soft);">Carregando...</div>';
    return;
  }
  const balances = computeRunningBalances(state.items);
  const today = todayISO();
  const monthItems = state.items
    .filter(it => it.vencimento && it.vencimento.slice(0,7) === state.currentMonth)
    .sort(compareByEffectiveDate);

  // saldo atual = saldo real considerando apenas lançamentos até hoje,
  // independente do mês que está sendo visualizado
  const beforeOrTodayAll = state.items
    .filter(it => effectiveDate(it) <= today)
    .sort(compareByEffectiveDate);
  const currentBalance = beforeOrTodayAll.length ? balances[beforeOrTodayAll[beforeOrTodayAll.length-1].id] : 0;

  // saldo de fechamento do mês = saldo do último item do mês,
  // ou, se não houver, o último saldo conhecido antes/até este mês
  let closing = 0;
  if(monthItems.length){
    closing = balances[monthItems[monthItems.length-1].id];
  } else {
    const before = state.items
      .filter(it => it.vencimento && it.vencimento.slice(0,7) <= state.currentMonth)
      .sort(compareByEffectiveDate);
    if(before.length) closing = balances[before[before.length-1].id];
  }

  let totalEntradas = 0, totalSaidas = 0;
  monthItems.forEach(it=>{
    if(it.tipo==='entrada') totalEntradas += Number(it.valor)||0;
    if(it.tipo==='saida') totalSaidas += Number(it.valor)||0;
  });

  const displayedItems = state.currentFilter === 'todos'
    ? monthItems
    : monthItems.filter(it => situacaoOf(it) === state.currentFilter);

  // arrastar para outro dia só é permitido com o filtro "Todos": com um filtro
  // ativo, o dia de destino pode conter lançamentos ocultos e a reordenação
  // ficaria incompleta/inconsistente.
  const dragEnabled = state.currentFilter === 'todos';

  function buildDateGroups(list){
    const groups = [];
    let lastDate = null, current = null;
    for(const it of list){
      const key = effectiveDate(it);
      if(key !== lastDate){
        current = {date: key, items: []};
        groups.push(current);
        lastDate = key;
      }
      current.items.push(it);
    }
    return groups;
  }

  const monthGroups = buildDateGroups(monthItems);
  const dateBalanceMap = {};
  monthGroups.forEach(g=>{ dateBalanceMap[g.date] = balances[g.items[g.items.length-1].id]; });

  let warningDate = null, minBalance = Infinity, minDate = null;
  monthGroups.forEach(g=>{
    const bal = dateBalanceMap[g.date];
    if(bal < 0 && warningDate === null) warningDate = g.date;
    if(bal < minBalance){ minBalance = bal; minDate = g.date; }
  });
  const hasNegative = warningDate !== null;

  const displayGroups = buildDateGroups(displayedItems);

  if(state.currentMonth === today.slice(0,7) && !monthGroups.some(g => g.date === today)){
    const beforeToday = state.items
      .filter(it => effectiveDate(it) <= today)
      .sort(compareByEffectiveDate);
    const todayBalance = beforeToday.length ? balances[beforeToday[beforeToday.length-1].id] : 0;
    dateBalanceMap[today] = todayBalance;
    let insertAt = displayGroups.findIndex(g => g.date > today);
    if(insertAt === -1) insertAt = displayGroups.length;
    displayGroups.splice(insertAt, 0, {date: today, items: [], isToday: true});
  }

  displayGroups.reverse();

  function cardsForGroup(g){
    // exibido em ordem inversa à cronológica (mais recente do dia no topo),
    // consistente com os grupos de data (mais recentes primeiro); por isso
    // o saldo do dia (cronologicamente o primeiro) fica no final do grupo.
    const displayItems = [...g.items].reverse();
    return displayItems.map(it => cardHTML(it, { saldoApos: balances[it.id], dragEnabled })).join('');
  }

  const listHTML = displayGroups.length
    ? displayGroups.map(g => `
        <div class="cf-group-header" data-date="${g.date}">
          <span class="cf-group-date">${formatGroupDate(g.date)}</span>
          <span class="cf-group-balance ${dateBalanceMap[g.date] < 0 ? 'negative' : ''}">${fmtBRL(dateBalanceMap[g.date])}</span>
        </div>
        ${g.items.length ? cardsForGroup(g) : (g.isToday ? '<div class="cf-empty-day" data-date="'+g.date+'">Nenhum lançamento hoje</div>' : '')}
      `).join('')
    : `<div class="cf-empty">${monthItems.length ? 'Nenhum lançamento com esse filtro.' : 'Nada lançado neste mês ainda.<br>Toque em + para adicionar.'}</div>`;

  root.innerHTML = `
    <div id="cf-sticky-top">
      <div class="cf-header" style="display:flex;justify-content:space-between;align-items:center;">
        <div class="cf-title" style="margin-bottom:0;">
          <svg width="24" height="24" viewBox="0 0 64 64" style="flex-shrink:0;">
            <rect width="64" height="64" rx="16" fill="#1E4D5C"/>
            <path d="M14 40 L26 28 L34 36 L50 18" stroke="white" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="50" cy="18" r="5" fill="white"/>
          </svg>
          Minhas Contas
          <span style="font-size:11px;font-weight:600;color:var(--ink-soft);background:var(--bg);border-radius:8px;padding:2px 7px;">v${APP_VERSION}</span>
        </div>
        <div style="display:flex;gap:14px;align-items:center;">
          <button id="cf-dashboard" style="background:none;border:none;font-size:12px;color:var(--ink-soft);font-weight:600;cursor:pointer;">Dashboard</button>
          <button id="cf-manage" style="background:none;border:none;font-size:12px;color:var(--ink-soft);font-weight:600;cursor:pointer;">Gerenciar</button>
          <button id="cf-logout" style="background:none;border:none;font-size:12px;color:var(--ink-soft);font-weight:600;cursor:pointer;">Sair</button>
        </div>
      </div>
      <div class="cf-header" style="padding-top:0;">
        <div class="cf-month-nav">
          <button class="cf-month-btn" id="cf-prev">‹</button>
          <div class="cf-month-label">
            ${monthLabel(state.currentMonth)}
            <input type="month" class="cf-month-input" id="cf-month-input" value="${state.currentMonth}">
          </div>
          <button class="cf-month-btn" id="cf-next">›</button>
        </div>
      </div>

      <div class="cf-balance-card">
        <div class="cf-balance-label">Saldo do mês</div>
        <div class="cf-balance-value">${fmtBRL(closing)}</div>
        <div class="cf-balance-current">Saldo atual <b>${fmtBRL(currentBalance)}</b></div>
        <div class="cf-balance-sub">
          <span>Entradas <b>${fmtBRL(totalEntradas)}</b></span>
          <span>Saídas <b>${fmtBRL(totalSaidas)}</b></span>
        </div>
      </div>
    </div>

    <div class="cf-filters">
      ${FILTERS.map(f => `<button class="cf-filter-chip ${state.currentFilter===f.key?'active':''}" data-f="${f.key}">${f.label}</button>`).join('')}
    </div>

    ${hasNegative ? `
    <div class="cf-warning-banner">
      <span class="cf-warning-title">Atenção: o saldo fica negativo em ${fmtDateShort(warningDate)}</span>
      <span class="cf-warning-sub">Mínimo previsto: ${fmtBRL(minBalance)} em ${fmtDateShort(minDate)}</span>
    </div>` : ''}

    <div class="cf-list" id="cf-list">
      ${listHTML}
    </div>

    <button class="cf-fab" id="cf-fab">+</button>
  `;

  document.getElementById('cf-prev').onclick = ()=>{ state.currentMonth = shiftMonth(state.currentMonth,-1); saveAppData(); render(handlers); };
  document.getElementById('cf-next').onclick = ()=>{ state.currentMonth = shiftMonth(state.currentMonth,1); saveAppData(); render(handlers); };
  document.getElementById('cf-month-input').onchange = (e)=>{ state.currentMonth = e.target.value; saveAppData(); render(handlers); };
  document.getElementById('cf-fab').onclick = ()=> handlers.onAdd();
  document.getElementById('cf-dashboard').onclick = ()=> handlers.onDashboard();
  document.getElementById('cf-manage').onclick = ()=> handlers.onManage();
  document.getElementById('cf-logout').onclick = ()=> handlers.onLogout();
  root.querySelectorAll('.cf-filter-chip').forEach(chip=>{
    chip.onclick = ()=>{ state.currentFilter = chip.dataset.f; render(handlers); };
  });
  displayedItems.forEach(it=>{
    const el = document.getElementById('card-'+it.id);
    if(el) attachCardGestures(el, it.id, handlers);
  });
  if(dragEnabled){
    root.querySelectorAll('.cf-drag-handle').forEach(handle=>{
      handle.addEventListener('pointerdown', (e)=> startDrag(e, handle, handlers));
    });
  }
  applyCompactClass();
}

function attachCardGestures(el, id, handlers){
  let timer = null;
  let longPressed = false;
  let startX = 0, startY = 0;

  function start(e){
    longPressed = false;
    const p = e.touches ? e.touches[0] : e;
    startX = p.clientX; startY = p.clientY;
    el.classList.add('cf-card-pressing');
    timer = setTimeout(()=>{
      longPressed = true;
      el.classList.remove('cf-card-pressing');
      if(navigator.vibrate) navigator.vibrate(15);
      duplicateExact(state.items, id);
      saveAppData();
      render(handlers);
      showToast('Lançamento duplicado');
    }, 550);
  }
  function move(e){
    const p = e.touches ? e.touches[0] : e;
    if(Math.abs(p.clientX-startX) > 10 || Math.abs(p.clientY-startY) > 10) cancel();
  }
  function cancel(){
    clearTimeout(timer);
    el.classList.remove('cf-card-pressing');
  }
  function end(){
    clearTimeout(timer);
    el.classList.remove('cf-card-pressing');
    if(!longPressed) handlers.onEditItem(id);
  }

  el.addEventListener('pointerdown', start);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('pointerleave', cancel);
}

// --- drag and drop entre lançamentos (reordenar no mesmo dia ou mover de dia) ---
// O arraste começa apenas pela alça (.cf-drag-handle), que fica fora do card
// e tem touch-action:none — assim nunca concorre com o toque/long-press do
// card (que abre edição / duplica).

function computeDropTarget(clientY, draggedId){
  const groupEls = [...root.querySelectorAll('.cf-group-header')];
  if(!groupEls.length) return null;
  let targetHeader = groupEls[0];
  for(const gh of groupEls){
    if(gh.getBoundingClientRect().top <= clientY) targetHeader = gh;
    else break;
  }
  const date = targetHeader.dataset.date;
  const rows = [...root.querySelectorAll(`.cf-card-row[data-date="${date}"]`)]
    .filter(r => r.dataset.saldo !== '1' && r.dataset.id !== draggedId);
  let displayIndex = rows.length;
  for(let i=0;i<rows.length;i++){
    const r = rows[i].getBoundingClientRect();
    if(clientY < r.top + r.height/2){ displayIndex = i; break; }
  }
  return { date, displayIndex, rows };
}

function placeIndicator(target, indicator){
  if(!target){ indicator.remove(); return; }
  const { rows, displayIndex, date } = target;
  const anchor = rows[displayIndex];
  if(anchor){
    anchor.parentNode.insertBefore(indicator, anchor);
    return;
  }
  const saldoRow = root.querySelector(`.cf-card-row[data-date="${date}"][data-saldo="1"]`);
  if(saldoRow){
    saldoRow.parentNode.insertBefore(indicator, saldoRow);
    return;
  }
  const dateRows = [...root.querySelectorAll(`.cf-card-row[data-date="${date}"]`)];
  if(dateRows.length){
    const last = dateRows[dateRows.length-1];
    last.parentNode.insertBefore(indicator, last.nextSibling);
    return;
  }
  const header = root.querySelector(`.cf-group-header[data-date="${date}"]`);
  if(header) header.parentNode.insertBefore(indicator, header.nextSibling);
}

function startDrag(e, handle, handlers){
  e.preventDefault();
  const row = handle.closest('.cf-card-row');
  const id = row.dataset.id;
  const rect = row.getBoundingClientRect();

  const ghost = row.cloneNode(true);
  ghost.classList.add('cf-drag-ghost');
  ghost.querySelectorAll('[id]').forEach(elWithId => elWithId.removeAttribute('id'));
  ghost.style.width = rect.width + 'px';
  ghost.style.left = rect.left + 'px';
  ghost.style.top = rect.top + 'px';
  document.body.appendChild(ghost);

  const indicator = document.createElement('div');
  indicator.className = 'cf-drop-indicator';

  root.querySelectorAll('.cf-card-row').forEach(r => r.classList.add('cf-dim'));
  document.body.classList.add('cf-dragging-active');

  const offsetX = e.clientX - rect.left;
  const offsetY = e.clientY - rect.top;
  let currentTarget = null;

  function onMove(ev){
    ghost.style.left = (ev.clientX - offsetX) + 'px';
    ghost.style.top = (ev.clientY - offsetY) + 'px';
    currentTarget = computeDropTarget(ev.clientY, id);
    placeIndicator(currentTarget, indicator);
  }
  function finish(commit){
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onCancel);
    ghost.remove();
    indicator.remove();
    root.querySelectorAll('.cf-card-row').forEach(r => r.classList.remove('cf-dim'));
    document.body.classList.remove('cf-dragging-active');
    if(commit && currentTarget){
      moveItem(state.items, id, currentTarget.date, currentTarget.displayIndex);
      saveAppData();
      render(handlers);
    }
  }
  function onUp(){ finish(true); }
  function onCancel(){ finish(false); }

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onCancel);
}

let isCompact = false;
function applyCompactClass(){
  const el = document.getElementById('cf-sticky-top');
  if(el) el.classList.toggle('compact', isCompact);
}
function updateStickyCompact(){
  const y = window.scrollY;
  if(!isCompact && y > 80) isCompact = true;
  else if(isCompact && y < 20) isCompact = false;
  applyCompactClass();
}
let stickyTicking = false;
window.addEventListener('scroll', ()=>{
  if(!stickyTicking){
    requestAnimationFrame(()=>{ updateStickyCompact(); stickyTicking = false; });
    stickyTicking = true;
  }
}, {passive:true});

function cardHTML(it, opts){
  const sit = situacaoOf(it);
  const isEntrada = it.tipo === 'entrada';
  const sign = it.tipo==='saldo' ? '' : (isEntrada ? '+ ' : '− ');
  const showVencimento = effectiveDate(it) !== it.vencimento;
  const saldoTitle = it.tipo === 'saldo' ? '' : ` title="Saldo após este lançamento: ${escapeHTML(fmtBRL(opts.saldoApos))}"`;
  const handleHTML = (opts.dragEnabled && it.tipo !== 'saldo')
    ? `<div class="cf-drag-handle" title="Arrastar para reordenar ou mover de dia">⠿</div>`
    : `<div class="cf-drag-handle-spacer"></div>`;
  return `
    <div class="cf-card-row" data-id="${it.id}" data-date="${effectiveDate(it)}" data-saldo="${it.tipo==='saldo'?'1':'0'}">
      <div class="cf-card" id="card-${it.id}">
        <div class="cf-card-left">
          <div class="cf-card-item">${escapeHTML(it.item)}</div>
          <div class="cf-card-meta">
            ${it.conta ? `<span>${escapeHTML(it.conta)}</span>` : ''}
            ${it.parcela ? `<span class="cf-parc-tag">${escapeHTML(it.parcela)}</span>` : ''}
            ${showVencimento ? `<span>venc. ${fmtDateShort(it.vencimento)}</span>` : ''}
          </div>
        </div>
        <div class="cf-card-right">
          <div class="cf-card-valor ${it.tipo==='saida'?'saida':'entrada'}"${saldoTitle}>${sign}${fmtBRL(it.valor)}</div>
          <div class="cf-badge ${sit}">${situacaoLabel(sit, it.tipo)}</div>
        </div>
      </div>
      ${handleHTML}
    </div>
  `;
}
