import { uid, todayISO, addMonths } from './utils.js';

export function situacaoOf(it){
  if(it.tipo === 'saldo') return 'saldo';
  if(!it.dataPagto){
    return it.vencimento < todayISO() ? 'vencido' : 'pendente';
  }
  if(it.dataPagto <= todayISO()) return 'pago';
  return 'agendado';
}

export function situacaoLabel(s){
  return {pago:'Pago', agendado:'Agendado', pendente:'Pendente', vencido:'Vencido', saldo:'Saldo'}[s] || s;
}

export function tipoLabel(t){
  return {entrada:'Entrada', saida:'Saída', saldo:'Saldo'}[t] || t;
}

export function effectiveDate(it){
  return it.dataPagto || it.vencimento;
}

export function compareByEffectiveDate(a,b){
  const da = effectiveDate(a), db = effectiveDate(b);
  if(da === db) return (a.order||0) - (b.order||0);
  return da < db ? -1 : 1;
}

export function computeRunningBalances(items){
  const sorted = [...items].sort(compareByEffectiveDate);
  let running = 0;
  const map = {};
  for(const it of sorted){
    if(it.tipo === 'saldo'){
      running = Number(it.valor)||0;
    } else if(it.tipo === 'entrada'){
      running += Number(it.valor)||0;
    } else {
      running -= Number(it.valor)||0;
    }
    map[it.id] = running;
  }
  return map;
}

export function parcelaBase(p){
  const m = (p||'').match(/^(\d+)\s*-\s*(\d+)$/);
  return m ? {n:parseInt(m[1],10), total:parseInt(m[2],10)} : null;
}

export function parcelar(items, id, additionalCount){
  const orig = items.find(i=>i.id===id);
  if(!orig || additionalCount < 1) return;
  let base = parcelaBase(orig.parcela);
  if(!base){
    base = {n:1, total: 1 + additionalCount};
    orig.parcela = base.n+'-'+base.total;
  } else {
    const neededTotal = base.n + additionalCount;
    if(neededTotal > base.total){
      base.total = neededTotal;
      orig.parcela = base.n+'-'+base.total;
    }
  }
  let vencimento = orig.vencimento;
  for(let i=1;i<=additionalCount;i++){
    vencimento = addMonths(vencimento,1);
    items.push({
      ...orig,
      id: uid(),
      vencimento,
      dataPagto:'',
      parcela: (base.n+i)+'-'+base.total,
      order: Date.now()+i
    });
  }
}

export function duplicateExact(items, id){
  const orig = items.find(i=>i.id===id);
  if(!orig) return;
  items.push({...orig, id: uid(), order:Date.now()});
}

export function monthSummaries(items, months){
  return months.map(month=>{
    const monthItems = items.filter(it => it.vencimento && it.vencimento.slice(0,7) === month);
    let entradas = 0, saidas = 0;
    monthItems.forEach(it=>{
      if(it.tipo==='entrada') entradas += Number(it.valor)||0;
      if(it.tipo==='saida') saidas += Number(it.valor)||0;
    });
    // saldo do comparativo = resultado do mês (entradas - saídas), não o
    // saldo bancário acumulado (que depende dos lançamentos tipo 'saldo')
    const saldo = entradas - saidas;
    return {month, entradas, saidas, saldo};
  });
}

export function getClosingBalanceBeforeMonth(items, month){
  const balances = computeRunningBalances(items);
  const before = items
    .filter(it => it.vencimento && it.vencimento.slice(0,7) < month)
    .sort(compareByEffectiveDate);
  return before.length ? balances[before[before.length-1].id] : 0;
}

export function bulkMarkPaid(items, ids, date){
  items.forEach(it=>{ if(ids.has(it.id) && it.tipo !== 'saldo') it.dataPagto = date; });
}

export function bulkSchedule(items, ids){
  items.forEach(it=>{ if(ids.has(it.id) && it.tipo !== 'saldo') it.dataPagto = it.vencimento; });
}

export function bulkClearPayment(items, ids){
  items.forEach(it=>{ if(ids.has(it.id) && it.tipo !== 'saldo') it.dataPagto = ''; });
}

export function bulkSetConta(items, ids, conta){
  items.forEach(it=>{ if(ids.has(it.id)) it.conta = conta; });
}

export function bulkSetValor(items, ids, valor){
  items.forEach(it=>{ if(ids.has(it.id)) it.valor = valor; });
}

export function bulkDelete(items, ids){
  return items.filter(it => !ids.has(it.id));
}
