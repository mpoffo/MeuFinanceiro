import { escapeHTML, todayISO, uid } from '../utils.js';
import { duplicateExact, parcelar, getClosingBalanceBeforeMonth } from '../domain.js';
import state from '../state.js';
import { saveAppData } from '../api/storage.js';
import { showToast } from './toast.js';

export function openSheet(id, { onChange }){
  state.editingId = id;
  const it = id ? state.items.find(i=>i.id===id) : {
    id:null, item:'', tipo:'saida', conta:state.lastConta, parcela:'',
    vencimento: todayISO(), valor:'', dataPagto:'', order: Date.now()
  };

  const backdrop = document.createElement('div');
  backdrop.className = 'cf-sheet-backdrop';
  backdrop.innerHTML = `
    <div class="cf-sheet">
      <div class="cf-sheet-handle"></div>
      <div class="cf-sheet-title">${id ? 'Editar lançamento' : 'Novo lançamento'}</div>

      <div class="cf-field">
        <label>Tipo</label>
        <div class="cf-segmented" id="cf-tipo">
          <button data-v="entrada" class="${it.tipo==='entrada'?'active':''}">Entrada</button>
          <button data-v="saida" class="${it.tipo==='saida'?'active':''}">Saída</button>
          <button data-v="saldo" class="${it.tipo==='saldo'?'active':''}">Saldo</button>
        </div>
      </div>

      <div class="cf-field">
        <label>Item</label>
        <input type="text" id="cf-item" value="${escapeHTML(it.item)}" placeholder="Ex: Cartão, Salário, Aluguel">
      </div>

      <div class="cf-row2">
        <div class="cf-field">
          <label>Conta</label>
          <input type="text" id="cf-conta" value="${escapeHTML(it.conta)}" placeholder="Itaú">
        </div>
        <div class="cf-field">
          <label>Parcela</label>
          <input type="text" id="cf-parcela" value="${escapeHTML(it.parcela)}" placeholder="Ex: 2-12">
        </div>
      </div>

      <div class="cf-row2">
        <div class="cf-field">
          <label>Vencimento</label>
          <input type="date" id="cf-vencimento" value="${it.vencimento}">
        </div>
        <div class="cf-field">
          <label>Valor (R$)</label>
          <input type="number" step="0.01" min="0" id="cf-valor" value="${it.valor}" placeholder="0,00">
        </div>
      </div>

      <div class="cf-field" id="cf-pagto-wrap" style="${it.tipo==='saldo'?'display:none':''}">
        <label>Data de pagamento (deixe em branco se ainda não pagou)</label>
        <input type="date" id="cf-pagto" value="${it.dataPagto||''}">
        <button class="cf-quickpay" id="cf-quickpay">Marcar como pago hoje</button>
      </div>

      <div class="cf-sheet-actions">
        <button class="cf-btn ghost" id="cf-cancel">Cancelar</button>
        <button class="cf-btn primary" id="cf-save">Salvar</button>
      </div>

      ${id ? `
      <div class="cf-extra-actions">
        <button class="cf-chip" id="cf-dup">Duplicar</button>
        <button class="cf-chip" id="cf-parcelar-toggle">Parcelar</button>
        <button class="cf-chip danger" id="cf-delete">Excluir</button>
      </div>
      <div class="cf-parcelar-box" id="cf-parcelar-box" style="display:none;">
        <label>Quantas parcelas adicionais criar? (mensal, a partir do vencimento atual)</label>
        <div class="cf-row2">
          <input type="number" min="1" step="1" id="cf-parcelar-count" value="1">
          <button class="cf-btn primary" id="cf-parcelar-confirm">Criar</button>
        </div>
      </div>` : ''}
    </div>
  `;
  document.body.appendChild(backdrop);

  backdrop.querySelectorAll('#cf-tipo button').forEach(btn=>{
    btn.onclick = ()=>{
      backdrop.querySelectorAll('#cf-tipo button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const tipo = btn.dataset.v;
      backdrop.querySelector('#cf-pagto-wrap').style.display = tipo==='saldo' ? 'none' : '';
      if(!id){
        const itemInput = backdrop.querySelector('#cf-item');
        const vencInput = backdrop.querySelector('#cf-vencimento');
        const pagtoInput = backdrop.querySelector('#cf-pagto');
        const valorInput = backdrop.querySelector('#cf-valor');
        if(tipo === 'saldo'){
          itemInput.value = 'Saldo';
          vencInput.value = state.currentMonth+'-01';
          pagtoInput.value = state.currentMonth+'-01';
          valorInput.value = getClosingBalanceBeforeMonth(state.items, state.currentMonth).toFixed(2);
        } else {
          vencInput.value = todayISO();
          if(itemInput.value === 'Saldo') itemInput.value = '';
        }
      }
    };
  });

  backdrop.querySelector('#cf-quickpay').onclick = ()=>{
    backdrop.querySelector('#cf-pagto').value = todayISO();
  };

  backdrop.querySelector('#cf-cancel').onclick = ()=> backdrop.remove();
  backdrop.onclick = (e)=>{ if(e.target===backdrop) backdrop.remove(); };

  backdrop.querySelector('#cf-save').onclick = ()=>{
    const tipo = backdrop.querySelector('#cf-tipo .active').dataset.v;
    const itemName = backdrop.querySelector('#cf-item').value.trim();
    const vencimento = backdrop.querySelector('#cf-vencimento').value;
    const valor = parseFloat(backdrop.querySelector('#cf-valor').value);
    if(!itemName){ showToast('Dê um nome ao item'); return; }
    if(!vencimento){ showToast('Informe o vencimento'); return; }
    if(isNaN(valor)){ showToast('Informe o valor'); return; }

    const conta = backdrop.querySelector('#cf-conta').value.trim();
    const parcela = backdrop.querySelector('#cf-parcela').value.trim();
    const dataPagto = tipo==='saldo' ? '' : backdrop.querySelector('#cf-pagto').value;

    if(id){
      const existing = state.items.find(i=>i.id===id);
      Object.assign(existing, {item:itemName, tipo, conta, parcela, vencimento, valor, dataPagto});
    }else{
      state.items.push({id: uid(), item:itemName, tipo, conta, parcela, vencimento, valor, dataPagto, order:Date.now()});
    }
    state.lastConta = conta || state.lastConta;
    saveAppData();
    backdrop.remove();
    onChange();
    showToast('Salvo');
  };

  if(id){
    backdrop.querySelector('#cf-dup').onclick = ()=>{
      duplicateExact(state.items, id);
      saveAppData();
      backdrop.remove();
      onChange();
      showToast('Lançamento duplicado');
    };
    backdrop.querySelector('#cf-parcelar-toggle').onclick = ()=>{
      const box = backdrop.querySelector('#cf-parcelar-box');
      const showing = box.style.display !== 'none';
      box.style.display = showing ? 'none' : 'block';
      if(!showing) backdrop.querySelector('#cf-parcelar-count').focus();
    };
    backdrop.querySelector('#cf-parcelar-confirm').onclick = ()=>{
      const count = parseInt(backdrop.querySelector('#cf-parcelar-count').value, 10);
      if(!count || count < 1){ showToast('Informe um número válido'); return; }
      parcelar(state.items, id, count);
      saveAppData();
      backdrop.remove();
      onChange();
      showToast(count + ' parcela(s) criada(s)');
    };
    backdrop.querySelector('#cf-delete').onclick = ()=>{
      state.items = state.items.filter(i=>i.id!==id);
      saveAppData();
      backdrop.remove();
      onChange();
      showToast('Excluído');
    };
  }
}
