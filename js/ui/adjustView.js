import { fmtBRL, todayISO } from '../utils.js';
import { balanceAtEndOfDay, findBalanceAdjustment, applyBalanceAdjustment } from '../domain.js';
import state from '../state.js';
import { saveAppData } from '../api/storage.js';
import { showToast } from './toast.js';

// sheet para informar o saldo efetivo da conta em uma data; o sistema lança
// (ou ajusta) um "Acerto de saldo" naquele dia cobrindo a diferença.
export function openAdjustSheet(date, { onChange }){
  const backdrop = document.createElement('div');
  backdrop.className = 'cf-sheet-backdrop';
  backdrop.innerHTML = `
    <div class="cf-sheet">
      <div class="cf-sheet-handle"></div>
      <div class="cf-sheet-title">Acertar saldo</div>

      <div class="cf-row2">
        <div class="cf-field">
          <label>Data</label>
          <input type="date" id="cf-adj-date" value="${date || todayISO()}">
        </div>
        <div class="cf-field">
          <label>Saldo efetivo (R$)</label>
          <input type="number" step="0.01" id="cf-adj-valor" placeholder="0,00">
        </div>
      </div>

      <div class="cf-adj-info" id="cf-adj-info"></div>

      <div class="cf-sheet-actions">
        <button class="cf-btn ghost" id="cf-cancel">Cancelar</button>
        <button class="cf-btn primary" id="cf-save">Acertar</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const dateInput = backdrop.querySelector('#cf-adj-date');
  const valorInput = backdrop.querySelector('#cf-adj-valor');
  const info = backdrop.querySelector('#cf-adj-info');

  function sistemaFor(d){
    const existing = findBalanceAdjustment(state.items, d);
    return { existing, sistema: balanceAtEndOfDay(state.items, d, existing && existing.id) };
  }

  function updateInfo(){
    const d = dateInput.value;
    if(!d){ info.innerHTML = ''; return; }
    const { existing, sistema } = sistemaFor(d);
    const efetivo = parseFloat(valorInput.value);
    let diffHTML = '';
    if(!isNaN(efetivo)){
      const diff = Math.round((efetivo - sistema) * 100) / 100;
      diffHTML = diff === 0
        ? `<div>Sem diferença${existing ? ' — o acerto existente será removido' : ''}</div>`
        : `<div>Acerto: <b class="${diff > 0 ? 'entrada' : 'saida'}">${diff > 0 ? '+ ' : '− '}${fmtBRL(Math.abs(diff))}</b></div>`;
    }
    info.innerHTML = `
      <div>Saldo no sistema ao fim do dia: <b>${fmtBRL(sistema)}</b></div>
      ${existing ? `<div class="cf-adj-note">Já existe um acerto neste dia (${existing.tipo==='entrada'?'+ ':'− '}${fmtBRL(existing.valor)}); ele será substituído.</div>` : ''}
      ${diffHTML}
    `;
  }

  dateInput.oninput = updateInfo;
  valorInput.oninput = updateInfo;
  updateInfo();
  setTimeout(()=> valorInput.focus(), 50);

  backdrop.querySelector('#cf-cancel').onclick = ()=> backdrop.remove();
  backdrop.onclick = (e)=>{ if(e.target===backdrop) backdrop.remove(); };

  backdrop.querySelector('#cf-save').onclick = ()=>{
    const d = dateInput.value;
    const efetivo = parseFloat(valorInput.value);
    if(!d){ showToast('Informe a data'); return; }
    if(isNaN(efetivo)){ showToast('Informe o saldo efetivo'); return; }
    const { action, diff } = applyBalanceAdjustment(state.items, d, efetivo, state.lastConta);
    if(action !== 'none') saveAppData();
    backdrop.remove();
    onChange();
    showToast({
      none: 'Saldo já confere',
      removed: 'Saldo confere — acerto removido',
      updated: 'Acerto atualizado: ' + (diff > 0 ? '+ ' : '− ') + fmtBRL(Math.abs(diff)),
      created: 'Acerto lançado: ' + (diff > 0 ? '+ ' : '− ') + fmtBRL(Math.abs(diff))
    }[action]);
  };
}
