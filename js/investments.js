import { todayISO, addMonths } from './utils.js';

export const CATEGORIAS = [
  {key:'LCI', label:'LCI', color:'#2a78d6'},
  {key:'LCA', label:'LCA', color:'#eb6834'},
  {key:'TES_SELIC', label:'Tes. SELIC', color:'#1baf7a'},
  {key:'TES_IPCA', label:'Tes. IPCA', color:'#eda100'},
  {key:'CDB', label:'CDB', color:'#e87ba4'}
];

// paleta categórica em ordem fixa; cada investimento usa o slot da sua posição na lista
export const INVEST_COLORS = ['#2a78d6','#eb6834','#1baf7a','#eda100','#e87ba4','#008300','#6250d6','#e34948'];
export const COLOR_CDI = '#1C2530';

export function categoriaOf(key){
  return CATEGORIAS.find(c => c.key === key) || {key, label:key, color:'#5B6672'};
}

// PicPay = saldo em conta + Cofrinho Turbinado, desde 11/06/2026 (extrato de 30/10/2026).
// Aportes: Pix recebidos e resgates de outros cofrinhos; a transferência da conta para o
// cofrinho é interna. O cofrinho só tem saldo conhecido em 31/08 (10.000,00) e 28/10
// (10.203,58); nas datas intermediárias o saldo é a conta do extrato + o cofrinho
// estimado pelo CDI.
export function picpayRevisado(){
  return {id:'inv-picpay-cofrinho', codigo:'PICPAY-COFRINHO', emissor:'PicPay', categoria:'CDB',
    dataAporte:'2026-06-11', valorAportado:2.75, taxa:'Cofrinho 102% do CDI + saldo em conta', vencimento:'',
    carencia:'', ir:'Regressivo', fgc:'Sim',
    movimentos:[
      {id:'pp-m1', data:'2026-08-31', valor:15005.98},
      {id:'pp-m2', data:'2026-09-01', valor:1000},
      {id:'pp-m3', data:'2026-10-01', valor:1000},
      {id:'pp-m4', data:'2026-10-06', valor:25000}
    ],
    historico:[
      {data:'2026-07-13', saldo:2.78}, {data:'2026-08-11', saldo:2.80},
      {data:'2026-08-31', saldo:15008.78}, {data:'2026-09-01', saldo:16013.88},
      {data:'2026-09-11', saldo:16049.68}, {data:'2026-10-01', saldo:17174.15},
      {data:'2026-10-06', saldo:42189.37}, {data:'2026-10-13', saldo:42209.71},
      {data:'2026-10-28', saldo:42265.82}
    ]};
}

// aplica correções pontuais nos dados já salvos; devolve true se algo mudou
export const INVEST_REVISAO = 1;
export function migrateInvestimentos(invs, revisao){
  if(revisao >= 1) return false;
  const i = invs.findIndex(inv => inv.id === 'inv-picpay-cofrinho');
  if(i >= 0){
    const rev = picpayRevisado();
    const posteriores = (invs[i].historico || []).filter(h => h.data > '2026-10-28');
    const movPosteriores = (invs[i].movimentos || []).filter(m => m.data > '2026-10-28');
    invs[i] = {...invs[i], dataAporte: rev.dataAporte, valorAportado: rev.valorAportado, taxa: rev.taxa,
      movimentos: [...rev.movimentos, ...movPosteriores], historico: [...rev.historico, ...posteriores]};
  }
  return true;
}

export function buildInvestSeed(){
  return [
    {id:'inv-td-selic-2031', codigo:'TD-SELIC2031-2026-09-08', emissor:'Tesouro Nacional', categoria:'TES_SELIC',
      dataAporte:'2026-09-08', valorAportado:169934.10, taxa:'SELIC + 0,0730%', vencimento:'2031-03-01',
      carencia:'', ir:'Regressivo', fgc:'Não (soberano)', historico:[{data:'2026-10-28', saldo:172797.65}]},
    {id:'inv-lca-cdi', codigo:'LCA-CDI-2026-09-03', emissor:'Itaú Unibanco', categoria:'LCA',
      dataAporte:'2026-09-03', valorAportado:75000, taxa:'89% do CDI', vencimento:'',
      carencia:'6 meses (a confirmar)', ir:'Isento', fgc:'Sim', historico:[{data:'2026-10-28', saldo:76255.53}]},
    {id:'inv-lca-pre', codigo:'LCA-PRE-2026-09-03', emissor:'Itaú Unibanco', categoria:'LCA',
      dataAporte:'2026-09-03', valorAportado:75000, taxa:'12,50% a.a. (a confirmar)', vencimento:'',
      carencia:'6 meses (a confirmar)', ir:'Isento', fgc:'Sim', historico:[{data:'2026-10-28', saldo:76229.03}]},
    picpayRevisado()
  ];
}

// pontos conhecidos do saldo: o aporte (saldo = valor aportado) seguido do histórico
export function pointsOf(inv){
  const hist = (inv.historico || [])
    .filter(h => h.data > inv.dataAporte)
    .sort((a,b)=> a.data < b.data ? -1 : 1);
  return [{data: inv.dataAporte, saldo: Number(inv.valorAportado)||0}, ...hist];
}

export function lastPoint(inv){
  const pts = pointsOf(inv);
  return pts[pts.length-1];
}

// aportes (+) e resgates (−) posteriores ao aporte inicial, em ordem de data
export function movimentosOf(inv){
  return (inv.movimentos || [])
    .filter(m => m.data > inv.dataAporte)
    .sort((a,b)=> a.data < b.data ? -1 : 1);
}

// soma dos movimentos em (a, b]
function flowsBetween(inv, a, b){
  return movimentosOf(inv)
    .filter(m => m.data > a && m.data <= b)
    .reduce((s,m)=>s+(Number(m.valor)||0), 0);
}

// valor líquido aplicado até t (aporte inicial + aportes − resgates)
function investedAt(inv, t){
  return (Number(inv.valorAportado)||0) + flowsBetween(inv, inv.dataAporte, t);
}

// saldo em t: entre dois saldos conhecidos, o rendimento é distribuído linearmente
// no tempo e os movimentos entram na data em que ocorreram;
// null = ainda não aplicado; undefined = depois do último saldo informado (desconhecido)
function valueAt(inv, t){
  const pts = pointsOf(inv);
  if(t < pts[0].data) return null;
  for(let i=0;i<pts.length;i++){
    if(pts[i].data === t) return pts[i].saldo;
    if(i+1 < pts.length && pts[i].data < t && t < pts[i+1].data){
      const a = pts[i], b = pts[i+1];
      const growth = b.saldo - a.saldo - flowsBetween(inv, a.data, b.data);
      const frac = (Date.parse(t) - Date.parse(a.data)) / (Date.parse(b.data) - Date.parse(a.data));
      return a.saldo + flowsBetween(inv, a.data, t) + growth * frac;
    }
  }
  return undefined;
}

// ===== CDI (BCB/SGS série 12: taxa diária em %) =====

const CDI_CACHE_KEY = 'cf-cdi-cache';

function toBR(iso){
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export async function loadCDI(startISO){
  const today = todayISO();
  try{
    const cached = JSON.parse(localStorage.getItem(CDI_CACHE_KEY) || 'null');
    if(cached && cached.fetchedOn === today && cached.start <= startISO) return buildCdiIndex(cached.rows);
  }catch(e){
    // cache indisponível ou corrompido: busca de novo
  }
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=${toBR(startISO)}&dataFinal=${toBR(today)}`;
  const resp = await fetch(url);
  if(!resp.ok) throw new Error('CDI ' + resp.status);
  const data = await resp.json();
  const rows = data.map(r => {
    const [d,m,y] = r.data.split('/');
    return [`${y}-${m}-${d}`, parseFloat(r.valor)];
  });
  try{
    localStorage.setItem(CDI_CACHE_KEY, JSON.stringify({fetchedOn: today, start: startISO, rows}));
  }catch(e){
    // sem localStorage: segue só em memória
  }
  return buildCdiIndex(rows);
}

// índice acumulado: idx(t) = produto dos fatores diários dos dias úteis anteriores a t
function buildCdiIndex(rows){
  const dates = rows.map(r => r[0]);
  const cum = [1];
  rows.forEach(r => cum.push(cum[cum.length-1] * (1 + r[1]/100)));
  function idx(t){
    let lo = 0, hi = dates.length;
    while(lo < hi){
      const mid = (lo+hi) >> 1;
      if(dates[mid] < t) lo = mid+1; else hi = mid;
    }
    return cum[lo];
  }
  return {
    firstDate: dates[0],
    lastDate: dates[dates.length-1],
    factor: (a, b) => idx(b) / idx(a)
  };
}

// ===== séries de rentabilidade =====

// Rentabilidade ponderada pelo tempo (TWR) de um conjunto de investimentos a partir
// de windowStart, encadeando os períodos entre datas com saldo conhecido e
// descontando os aportes. Uma data só entra se todos os investimentos já aplicados
// nela tiverem saldo conhecido (informado ou interpolado).
export function buildReturnSeries(invs, windowStart, today, cdi){
  const candidates = new Set([windowStart]);
  invs.forEach(inv => [...pointsOf(inv), ...movimentosOf(inv)].forEach(p => {
    if(p.data >= windowStart && p.data <= today) candidates.add(p.data);
  }));
  const dates = [...candidates].sort();

  const result = [];
  let prev = null;
  let twr = 1;
  let baseDate = null;
  dates.forEach(t=>{
    const active = invs.filter(inv => inv.dataAporte <= t);
    if(!active.length) return;
    const values = active.map(inv => valueAt(inv, t));
    if(values.some(v => v === undefined)) return;
    const saldo = values.reduce((s,v)=>s+v, 0);
    const aportado = active.reduce((s,inv)=>s+investedAt(inv, t), 0);
    if(prev){
      // dinheiro que entrou/saiu no intervalo não é rendimento
      const fluxo = active.reduce((s,inv)=> s + (inv.dataAporte > prev.date
        ? (Number(inv.valorAportado)||0) + flowsBetween(inv, inv.dataAporte, t)
        : flowsBetween(inv, prev.date, t)), 0);
      if(prev.saldo > 0) twr *= (saldo - fluxo) / prev.saldo;
    } else {
      baseDate = t;
    }
    const rent = twr - 1;
    const cdiRent = cdi ? cdi.factor(baseDate, t) - 1 : null;
    result.push({
      date: t, saldo, aportado, rent, cdi: cdiRent,
      pctCdi: (cdiRent && cdiRent > 0 && t !== baseDate) ? rent / cdiRent : null
    });
    prev = {date: t, saldo};
  });
  return result;
}

// posição consolidada desde o aporte, no último saldo informado;
// rentabilidade ponderada pelo tempo, para não contar aportes como rendimento
export function positionOf(inv, cdi){
  const last = lastPoint(inv);
  const aportado = investedAt(inv, last.data);
  const series = buildReturnSeries([inv], inv.dataAporte, last.data, cdi);
  const end = series[series.length-1];
  return {
    data: last.data, saldo: last.saldo, aportado, rend: last.saldo - aportado,
    rent: end ? end.rent : 0,
    cdiRent: end && end.date > inv.dataAporte ? end.cdi : null,
    pctCdi: end ? end.pctCdi : null
  };
}

export const PERIODOS = [
  {months:24, label:'2 anos'},
  {months:12, label:'1 ano'},
  {months:6, label:'6 meses'},
  {months:3, label:'3 meses'}
];

export function windowStartFor(months){
  return addMonths(todayISO(), -months);
}
