import { root } from './dom.js';
import { showToast } from './toast.js';
import { APP_VERSION } from '../config.js';
import state from '../state.js';
import { saveAppData } from '../api/storage.js';
import {
  situacaoOf, situacaoLabel, effectiveDate, compareByEffectiveDate,
  computeRunningBalances, duplicateExact
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

  const listHTML = displayGroups.length
    ? displayGroups.map(g => `
        <div class="cf-group-header">
          <span class="cf-group-date">${formatGroupDate(g.date)}</span>
          <span class="cf-group-balance ${dateBalanceMap[g.date] < 0 ? 'negative' : ''}">${fmtBRL(dateBalanceMap[g.date])}</span>
        </div>
        ${g.items.length ? g.items.map(cardHTML).join('') : (g.isToday ? '<div class="cf-empty-day">Nenhum lançamento hoje</div>' : '')}
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

function cardHTML(it){
  const sit = situacaoOf(it);
  const isEntrada = it.tipo === 'entrada';
  const sign = it.tipo==='saldo' ? '' : (isEntrada ? '+ ' : '− ');
  const showVencimento = effectiveDate(it) !== it.vencimento;
  return `
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
        <div class="cf-card-valor ${it.tipo==='saida'?'saida':'entrada'}">${sign}${fmtBRL(it.valor)}</div>
        <div class="cf-badge ${sit}">${situacaoLabel(sit, it.tipo)}</div>
      </div>
    </div>
  `;
}
