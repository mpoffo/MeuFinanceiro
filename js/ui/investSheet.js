import { escapeHTML, todayISO, uid, fmtBRL, fmtDateShort } from '../utils.js';
import { CATEGORIAS, lastPoint } from '../investments.js';
import state from '../state.js';
import { saveAppData } from '../api/storage.js';
import { showToast } from './toast.js';

function openBackdrop(html){
  const backdrop = document.createElement('div');
  backdrop.className = 'cf-sheet-backdrop';
  backdrop.innerHTML = `<div class="cf-sheet"><div class="cf-sheet-handle"></div>${html}</div>`;
  document.body.appendChild(backdrop);
  backdrop.onclick = (e)=>{ if(e.target===backdrop) backdrop.remove(); };
  return backdrop;
}

// novo investimento (id = null) ou edição de cadastro + histórico de saldos
export function openInvestSheet(id, { onChange }){
  const original = id ? state.investimentos.find(i => i.id === id) : null;
  const inv = original ? {...original, historico: [...(original.historico||[])], movimentos: [...(original.movimentos||[])]} : {
    id: null, codigo:'', emissor:'', categoria:'CDB', dataAporte: todayISO(), valorAportado:'',
    taxa:'', vencimento:'', carencia:'', ir:'', fgc:'', historico:[], movimentos:[]
  };

  const backdrop = openBackdrop(`
    <div class="cf-sheet-title">${id ? 'Editar investimento' : 'Novo investimento'}</div>

    <div class="cf-field">
      <label>Identificação</label>
      <input type="text" id="iv-codigo" value="${escapeHTML(inv.codigo)}" placeholder="Ex: CDB-BANCO-2026-11">
    </div>
    <div class="cf-row2">
      <div class="cf-field">
        <label>Emissor</label>
        <input type="text" id="iv-emissor" value="${escapeHTML(inv.emissor)}" placeholder="Ex: Itaú Unibanco">
      </div>
      <div class="cf-field">
        <label>Categoria</label>
        <select id="iv-categoria">
          ${CATEGORIAS.map(c=>`<option value="${c.key}" ${inv.categoria===c.key?'selected':''}>${c.label}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="cf-row2">
      <div class="cf-field">
        <label>Data do aporte</label>
        <input type="date" id="iv-data" value="${inv.dataAporte}">
      </div>
      <div class="cf-field">
        <label>Valor aportado (R$)</label>
        <input type="number" step="0.01" min="0" id="iv-valor" value="${inv.valorAportado}" placeholder="0,00">
      </div>
    </div>
    <div class="cf-row2">
      <div class="cf-field">
        <label>Taxa contratada</label>
        <input type="text" id="iv-taxa" value="${escapeHTML(inv.taxa)}" placeholder="Ex: 100% do CDI">
      </div>
      <div class="cf-field">
        <label>Vencimento</label>
        <input type="date" id="iv-venc" value="${inv.vencimento||''}">
      </div>
    </div>
    <div class="cf-row2">
      <div class="cf-field">
        <label>Carência</label>
        <input type="text" id="iv-carencia" value="${escapeHTML(inv.carencia)}" placeholder="Ex: 6 meses">
      </div>
      <div class="cf-field">
        <label>IR</label>
        <input type="text" id="iv-ir" value="${escapeHTML(inv.ir)}" placeholder="Isento / Regressivo">
      </div>
      <div class="cf-field">
        <label>FGC</label>
        <input type="text" id="iv-fgc" value="${escapeHTML(inv.fgc)}" placeholder="Sim / Não">
      </div>
    </div>

    <div class="cf-field">
      <label>Aportes e resgates (após o aporte inicial)</label>
      <div class="iv-hist" id="iv-mov"></div>
      <div class="cf-row2 iv-hist-add">
        <select id="iv-mov-tipo">
          <option value="aporte">Aporte</option>
          <option value="resgate">Resgate</option>
        </select>
        <input type="date" id="iv-mov-data" value="${todayISO()}">
        <input type="number" step="0.01" min="0" id="iv-mov-valor" placeholder="Valor (R$)">
      </div>
      <div class="cf-row2 iv-hist-add" style="margin-top:6px;">
        <input type="number" step="0.01" min="0" id="iv-mov-saldo" placeholder="Saldo após o movimento (opcional)">
        <button class="cf-btn ghost" id="iv-mov-add">Adicionar</button>
      </div>
    </div>

    <div class="cf-field">
      <label>Histórico de saldo bruto</label>
      <div class="iv-hist" id="iv-hist"></div>
      <div class="cf-row2 iv-hist-add">
        <input type="date" id="iv-hist-data" value="${todayISO()}">
        <input type="number" step="0.01" min="0" id="iv-hist-saldo" placeholder="Saldo (R$)">
        <button class="cf-btn ghost" id="iv-hist-add">Adicionar</button>
      </div>
    </div>

    <div class="cf-sheet-actions">
      <button class="cf-btn ghost" id="iv-cancel">Cancelar</button>
      <button class="cf-btn primary" id="iv-save">Salvar</button>
    </div>

    ${id ? `
    <div class="cf-extra-actions">
      <button class="cf-chip danger" id="iv-delete">Excluir investimento</button>
    </div>` : ''}
  `);

  const histEl = backdrop.querySelector('#iv-hist');
  function renderHist(){
    const sorted = [...inv.historico].sort((a,b)=> a.data < b.data ? -1 : 1);
    histEl.innerHTML = sorted.length
      ? sorted.map(h=>`
          <div class="iv-hist-row">
            <span>${fmtDateShort(h.data)}/${h.data.slice(0,4)}</span>
            <b>${fmtBRL(h.saldo)}</b>
            <button class="dv-sim-remove" data-data="${h.data}" title="Remover">×</button>
          </div>`).join('')
      : '<div class="dv-sim-empty">Nenhum saldo informado ainda.</div>';
    histEl.querySelectorAll('.dv-sim-remove').forEach(btn=>{
      btn.onclick = ()=>{
        inv.historico = inv.historico.filter(h => h.data !== btn.dataset.data);
        renderHist();
      };
    });
  }
  renderHist();

  const movEl = backdrop.querySelector('#iv-mov');
  function renderMov(){
    const sorted = [...inv.movimentos].sort((a,b)=> a.data < b.data ? -1 : 1);
    movEl.innerHTML = sorted.length
      ? sorted.map(m=>`
          <div class="iv-hist-row">
            <span>${fmtDateShort(m.data)}/${m.data.slice(0,4)}</span>
            <span class="iv-mov-tipo ${m.valor < 0 ? 'saida' : 'entrada'}">${m.valor < 0 ? 'Resgate' : 'Aporte'}</span>
            <b>${fmtBRL(Math.abs(m.valor))}</b>
            <button class="dv-sim-remove" data-id="${m.id}" title="Remover">×</button>
          </div>`).join('')
      : '<div class="dv-sim-empty">Nenhum aporte ou resgate adicional.</div>';
    movEl.querySelectorAll('.dv-sim-remove').forEach(btn=>{
      btn.onclick = ()=>{
        inv.movimentos = inv.movimentos.filter(m => m.id !== btn.dataset.id);
        renderMov();
      };
    });
  }
  renderMov();

  backdrop.querySelector('#iv-mov-add').onclick = ()=>{
    const tipo = backdrop.querySelector('#iv-mov-tipo').value;
    const data = backdrop.querySelector('#iv-mov-data').value;
    const valor = parseFloat(backdrop.querySelector('#iv-mov-valor').value);
    const saldo = parseFloat(backdrop.querySelector('#iv-mov-saldo').value);
    if(!data || isNaN(valor) || valor <= 0){ showToast('Informe data e valor'); return; }
    const dataAporte = backdrop.querySelector('#iv-data').value;
    if(dataAporte && data <= dataAporte){ showToast('A data deve ser posterior ao aporte inicial'); return; }
    inv.movimentos.push({id: uid(), data, valor: tipo === 'resgate' ? -valor : valor});
    // o saldo informado junto vale como posição naquela data
    if(!isNaN(saldo)){
      inv.historico = inv.historico.filter(h => h.data !== data);
      inv.historico.push({data, saldo});
      renderHist();
    }
    backdrop.querySelector('#iv-mov-valor').value = '';
    backdrop.querySelector('#iv-mov-saldo').value = '';
    renderMov();
  };

  backdrop.querySelector('#iv-hist-add').onclick = ()=>{
    const data = backdrop.querySelector('#iv-hist-data').value;
    const saldo = parseFloat(backdrop.querySelector('#iv-hist-saldo').value);
    if(!data || isNaN(saldo)){ showToast('Informe data e saldo'); return; }
    inv.historico = inv.historico.filter(h => h.data !== data);
    inv.historico.push({data, saldo});
    backdrop.querySelector('#iv-hist-saldo').value = '';
    renderHist();
  };

  backdrop.querySelector('#iv-cancel').onclick = ()=> backdrop.remove();

  backdrop.querySelector('#iv-save').onclick = ()=>{
    const val = (sel)=> backdrop.querySelector(sel).value.trim();
    const codigo = val('#iv-codigo');
    const dataAporte = val('#iv-data');
    const valorAportado = parseFloat(val('#iv-valor'));
    if(!codigo){ showToast('Informe a identificação'); return; }
    if(!dataAporte){ showToast('Informe a data do aporte'); return; }
    if(isNaN(valorAportado) || valorAportado <= 0){ showToast('Informe o valor aportado'); return; }
    const saved = {
      ...inv, id: inv.id || uid(), codigo, emissor: val('#iv-emissor'), categoria: val('#iv-categoria'),
      dataAporte, valorAportado, taxa: val('#iv-taxa'), vencimento: val('#iv-venc'),
      carencia: val('#iv-carencia'), ir: val('#iv-ir'), fgc: val('#iv-fgc')
    };
    if(id){
      state.investimentos = state.investimentos.map(i => i.id === id ? saved : i);
    } else {
      state.investimentos = [...state.investimentos, saved];
    }
    saveAppData();
    backdrop.remove();
    onChange();
    showToast(id ? 'Investimento atualizado' : 'Investimento criado');
  };

  if(id){
    backdrop.querySelector('#iv-delete').onclick = ()=>{
      if(!confirm(`Excluir "${inv.codigo}" e todo o seu histórico?`)) return;
      state.investimentos = state.investimentos.filter(i => i.id !== id);
      saveAppData();
      backdrop.remove();
      onChange();
      showToast('Investimento excluído');
    };
  }
}

// informa, numa mesma data, o saldo bruto de vários investimentos de uma vez
export function openUpdateBalancesSheet({ onChange }){
  const invs = state.investimentos;
  const backdrop = openBackdrop(`
    <div class="cf-sheet-title">Atualizar saldos</div>
    <div class="cf-field">
      <label>Data da posição</label>
      <input type="date" id="iv-up-data" value="${todayISO()}">
    </div>
    ${invs.map(inv=>{
      const last = lastPoint(inv);
      return `
      <div class="cf-field">
        <label>${escapeHTML(inv.codigo)} <span class="iv-up-last">último: ${fmtBRL(last.saldo)} em ${fmtDateShort(last.data)}</span></label>
        <input type="number" step="0.01" min="0" data-id="${inv.id}" class="iv-up-saldo" placeholder="Saldo bruto (R$)">
      </div>`;
    }).join('')}
    <div class="cf-adj-info">Deixe em branco os que não quiser atualizar. Se já houver saldo na data, ele é substituído.</div>
    <div class="cf-sheet-actions">
      <button class="cf-btn ghost" id="iv-up-cancel">Cancelar</button>
      <button class="cf-btn primary" id="iv-up-save">Salvar</button>
    </div>
  `);

  backdrop.querySelector('#iv-up-cancel').onclick = ()=> backdrop.remove();
  backdrop.querySelector('#iv-up-save').onclick = ()=>{
    const data = backdrop.querySelector('#iv-up-data').value;
    if(!data){ showToast('Informe a data'); return; }
    const novos = {};
    backdrop.querySelectorAll('.iv-up-saldo').forEach(input=>{
      const v = parseFloat(input.value);
      if(!isNaN(v)) novos[input.dataset.id] = v;
    });
    const ids = Object.keys(novos);
    if(!ids.length){ showToast('Nenhum saldo informado'); return; }
    state.investimentos = state.investimentos.map(inv=>{
      if(!(inv.id in novos)) return inv;
      const historico = (inv.historico||[]).filter(h => h.data !== data);
      historico.push({data, saldo: novos[inv.id]});
      return {...inv, historico};
    });
    saveAppData();
    backdrop.remove();
    onChange();
    showToast(ids.length === 1 ? 'Saldo atualizado' : `${ids.length} saldos atualizados`);
  };
}
