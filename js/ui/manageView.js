import { root } from './dom.js';
import { showToast } from './toast.js';
import state from '../state.js';
import { saveAppData } from '../api/storage.js';
import {
  situacaoOf, situacaoLabel, tipoLabel,
  bulkMarkPaid, bulkSchedule, bulkClearPayment, bulkSetConta, bulkSetValor, bulkDelete
} from '../domain.js';
import { fmtBRL, fmtDateShort, escapeHTML, todayISO, shiftMonth } from '../utils.js';

const filters = {
  search:'', tipo:'todos', situacao:'todos', conta:'todas',
  periodMode:'todos', periodMonth:'', periodDate:''
};
const selected = new Set();

function pruneSelection(){
  const ids = new Set(state.items.map(it=>it.id));
  [...selected].forEach(id=>{ if(!ids.has(id)) selected.delete(id); });
}

function distinctContas(){
  return [...new Set(state.items.map(it=>it.conta).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
}

function matchesFilters(it){
  if(filters.tipo !== 'todos' && it.tipo !== filters.tipo) return false;
  if(filters.situacao !== 'todos' && situacaoOf(it) !== filters.situacao) return false;
  if(filters.conta !== 'todas' && it.conta !== filters.conta) return false;
  if(filters.periodMode === 'mes' && it.vencimento.slice(0,7) !== filters.periodMonth) return false;
  if(filters.periodMode === 'ate' && filters.periodDate && it.vencimento > filters.periodDate) return false;
  if(filters.search){
    const q = filters.search.toLowerCase();
    const hay = `${it.item} ${it.conta} ${it.parcela}`.toLowerCase();
    if(!hay.includes(q)) return false;
  }
  return true;
}

function byVencimentoAsc(a,b){
  if(a.vencimento === b.vencimento){
    if(a.tipo === 'saldo' && b.tipo !== 'saldo') return -1;
    if(b.tipo === 'saldo' && a.tipo !== 'saldo') return 1;
    return (a.order||0) - (b.order||0);
  }
  return a.vencimento < b.vencimento ? -1 : 1;
}

export function renderManage(handlers){
  pruneSelection();
  root.classList.add('wide');

  const thisMonth = todayISO().slice(0,7);
  const nextMonth = shiftMonth(thisMonth, 1);

  root.innerHTML = `
    <div class="mv-topbar">
      <button class="cf-month-btn" id="mv-back">‹</button>
      <div class="cf-title" style="margin:0;flex:1;">Gerenciar lançamentos</div>
      <button class="cf-btn primary" id="mv-add">+ Novo lançamento</button>
    </div>
    <div class="mv-filters">
      <input type="text" id="mv-search" placeholder="Buscar por item, conta ou parcela..." value="${escapeHTML(filters.search)}">
      <select id="mv-tipo">
        <option value="todos">Tipo: todos</option>
        <option value="entrada">Entrada</option>
        <option value="saida">Saída</option>
        <option value="saldo">Saldo</option>
      </select>
      <select id="mv-situacao">
        <option value="todos">Situação: todas</option>
        <option value="pendente">Pendente</option>
        <option value="vencido">Vencido</option>
        <option value="agendado">Agendado</option>
        <option value="pago">Pago</option>
      </select>
      <select id="mv-conta">
        <option value="todas">Conta: todas</option>
        ${distinctContas().map(c=>`<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('')}
      </select>
    </div>
    <div class="mv-period">
      <span class="mv-period-label">Período:</span>
      <button type="button" class="cf-filter-chip mv-period-chip" data-period="todos">Todos</button>
      <button type="button" class="cf-filter-chip mv-period-chip" data-period="este-mes">Este mês</button>
      <button type="button" class="cf-filter-chip mv-period-chip" data-period="proximo-mes">Mês que vem</button>
      <label class="mv-period-until">até <input type="date" id="mv-periodo-ate"></label>
    </div>
    <div id="mv-body"></div>
  `;

  root.querySelector('#mv-tipo').value = filters.tipo;
  root.querySelector('#mv-situacao').value = filters.situacao;
  root.querySelector('#mv-conta').value = filters.conta;

  function syncPeriodUI(){
    root.querySelectorAll('.mv-period-chip').forEach(chip=>{
      const p = chip.dataset.period;
      const active = (p==='todos' && filters.periodMode==='todos')
        || (p==='este-mes' && filters.periodMode==='mes' && filters.periodMonth===thisMonth)
        || (p==='proximo-mes' && filters.periodMode==='mes' && filters.periodMonth===nextMonth);
      chip.classList.toggle('active', active);
    });
    root.querySelector('#mv-periodo-ate').value = filters.periodMode==='ate' ? filters.periodDate : '';
  }
  syncPeriodUI();

  root.querySelector('#mv-back').onclick = ()=>{
    root.classList.remove('wide');
    handlers.onBack();
  };
  root.querySelector('#mv-add').onclick = ()=> handlers.onAdd();
  root.querySelector('#mv-search').oninput = (e)=>{ filters.search = e.target.value; renderBody(handlers); };
  root.querySelector('#mv-tipo').onchange = (e)=>{ filters.tipo = e.target.value; renderBody(handlers); };
  root.querySelector('#mv-situacao').onchange = (e)=>{ filters.situacao = e.target.value; renderBody(handlers); };
  root.querySelector('#mv-conta').onchange = (e)=>{ filters.conta = e.target.value; renderBody(handlers); };

  root.querySelectorAll('.mv-period-chip').forEach(chip=>{
    chip.onclick = ()=>{
      const period = chip.dataset.period;
      if(period === 'este-mes'){ filters.periodMode = 'mes'; filters.periodMonth = thisMonth; }
      else if(period === 'proximo-mes'){ filters.periodMode = 'mes'; filters.periodMonth = nextMonth; }
      else { filters.periodMode = 'todos'; filters.periodMonth = ''; }
      filters.periodDate = '';
      syncPeriodUI();
      renderBody(handlers);
    };
  });
  root.querySelector('#mv-periodo-ate').onchange = (e)=>{
    const val = e.target.value;
    filters.periodMode = val ? 'ate' : 'todos';
    filters.periodDate = val;
    filters.periodMonth = '';
    syncPeriodUI();
    renderBody(handlers);
  };

  renderBody(handlers);
}

function rowHTML(it){
  const sit = situacaoOf(it);
  return `
    <tr class="mv-row" data-id="${it.id}">
      <td class="mv-td-check"><input type="checkbox" class="mv-row-check" data-id="${it.id}" ${selected.has(it.id)?'checked':''}></td>
      <td class="mv-td-item">${escapeHTML(it.item)}</td>
      <td>${tipoLabel(it.tipo)}</td>
      <td>${escapeHTML(it.conta)}</td>
      <td>${escapeHTML(it.parcela)}</td>
      <td>${fmtDateShort(it.vencimento)}</td>
      <td class="mv-valor ${it.tipo}">${fmtBRL(it.valor)}</td>
      <td>${it.dataPagto ? fmtDateShort(it.dataPagto) : '—'}</td>
      <td><span class="cf-badge ${sit}">${situacaoLabel(sit, it.tipo)}</span></td>
    </tr>
  `;
}

function renderBody(handlers){
  const filtered = state.items.filter(matchesFilters).sort(byVencimentoAsc);
  const visibleIds = filtered.map(it=>it.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id=>selected.has(id));

  const body = root.querySelector('#mv-body');
  body.innerHTML = `
    <div class="mv-summary">
      ${filtered.length} lançamento(s)${selected.size ? ` · ${selected.size} selecionado(s)` : ''}
    </div>
    <div class="mv-table-scroll">
      <table class="mv-table">
        <thead>
          <tr>
            <th><input type="checkbox" id="mv-select-all" ${allVisibleSelected?'checked':''}></th>
            <th>Item</th><th>Tipo</th><th>Conta</th><th>Parcela</th>
            <th>Vencimento</th><th>Valor</th><th>Pagamento</th><th>Situação</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.length ? filtered.map(rowHTML).join('') : `<tr><td colspan="9" class="mv-empty">Nenhum lançamento encontrado.</td></tr>`}
        </tbody>
      </table>
    </div>
    ${selected.size ? `
    <div class="mv-bulkbar">
      <span class="mv-bulkbar-count">${selected.size} selecionado(s)</span>
      <button class="cf-chip pago" id="mv-bulk-pago">Pago hoje</button>
      <button class="cf-chip agendado" id="mv-bulk-agendar">Agendar</button>
      <button class="cf-chip" id="mv-bulk-limpar">Limpar pagamento</button>
      <input type="text" id="mv-bulk-conta" placeholder="Nova conta">
      <button class="cf-chip" id="mv-bulk-conta-apply">Alterar conta</button>
      <input type="number" step="0.01" min="0" id="mv-bulk-valor" placeholder="Novo valor">
      <button class="cf-chip" id="mv-bulk-valor-apply">Alterar valor</button>
      <button class="cf-chip danger" id="mv-bulk-delete">Excluir</button>
    </div>` : ''}
  `;

  body.querySelector('#mv-select-all').onchange = (e)=>{
    if(e.target.checked) visibleIds.forEach(id=>selected.add(id));
    else visibleIds.forEach(id=>selected.delete(id));
    renderBody(handlers);
  };

  body.querySelectorAll('.mv-row-check').forEach(cb=>{
    cb.onchange = (e)=>{
      const id = e.target.dataset.id;
      if(e.target.checked) selected.add(id); else selected.delete(id);
      renderBody(handlers);
    };
  });

  body.querySelectorAll('.mv-row').forEach(row=>{
    row.onclick = (e)=>{
      if(e.target.closest('.mv-td-check')) return;
      handlers.onEditItem(row.dataset.id);
    };
  });

  const applyBulk = (fn, message)=>{
    fn();
    saveAppData();
    selected.clear();
    renderBody(handlers);
    showToast(message);
  };

  const bulkPago = body.querySelector('#mv-bulk-pago');
  if(bulkPago) bulkPago.onclick = ()=> applyBulk(
    ()=> bulkMarkPaid(state.items, selected, todayISO()),
    'Lançamentos marcados como pagos'
  );

  const bulkAgendar = body.querySelector('#mv-bulk-agendar');
  if(bulkAgendar) bulkAgendar.onclick = ()=> applyBulk(
    ()=> bulkSchedule(state.items, selected),
    'Lançamentos agendados'
  );

  const bulkLimpar = body.querySelector('#mv-bulk-limpar');
  if(bulkLimpar) bulkLimpar.onclick = ()=> applyBulk(
    ()=> bulkClearPayment(state.items, selected),
    'Pagamento removido'
  );

  const bulkContaApply = body.querySelector('#mv-bulk-conta-apply');
  if(bulkContaApply) bulkContaApply.onclick = ()=>{
    const conta = body.querySelector('#mv-bulk-conta').value.trim();
    if(!conta){ showToast('Informe a nova conta'); return; }
    applyBulk(()=> bulkSetConta(state.items, selected, conta), 'Conta alterada');
  };

  const bulkValorApply = body.querySelector('#mv-bulk-valor-apply');
  if(bulkValorApply) bulkValorApply.onclick = ()=>{
    const valor = parseFloat(body.querySelector('#mv-bulk-valor').value);
    if(isNaN(valor)){ showToast('Informe um valor válido'); return; }
    applyBulk(()=> bulkSetValor(state.items, selected, valor), 'Valor alterado');
  };

  const bulkDeleteBtn = body.querySelector('#mv-bulk-delete');
  if(bulkDeleteBtn) bulkDeleteBtn.onclick = ()=>{
    if(!confirm(`Excluir ${selected.size} lançamento(s) selecionado(s)?`)) return;
    applyBulk(()=>{ state.items = bulkDelete(state.items, selected); }, 'Lançamentos excluídos');
  };
}
