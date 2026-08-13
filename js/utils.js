export function uid(){
  return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
}

export function todayISO(){
  return new Date().toISOString().slice(0,10);
}

export function fmtBRL(n){
  const v = Number(n)||0;
  return v.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
}

export function fmtDateShort(iso){
  if(!iso) return '';
  const [y,m,d] = iso.split('-');
  return d+'/'+m;
}

export function formatGroupDate(iso){
  const [y,m,d] = iso.split('-').map(Number);
  const dt = new Date(y, m-1, d);
  if(iso === todayISO()) return 'Hoje, ' + String(d).padStart(2,'0') + '/' + String(m).padStart(2,'0');
  let weekday = dt.toLocaleDateString('pt-BR', {weekday:'short'}).replace('.','');
  weekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  return weekday + ', ' + String(d).padStart(2,'0') + '/' + String(m).padStart(2,'0');
}

export function monthLabel(ym){
  const [y,m] = ym.split('-').map(Number);
  const d = new Date(y, m-1, 1);
  return d.toLocaleDateString('pt-BR', {month:'long', year:'numeric'});
}

export function addMonths(iso, n){
  let [y,m,d] = iso.split('-').map(Number);
  m += n;
  while(m>12){ m-=12; y+=1; }
  while(m<1){ m+=12; y-=1; }
  const lastDay = new Date(y, m, 0).getDate();
  if(d > lastDay) d = lastDay;
  return y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
}

export function shiftMonth(ym, n){
  let [y,m] = ym.split('-').map(Number);
  m += n;
  while(m>12){ m-=12; y+=1; }
  while(m<1){ m+=12; y-=1; }
  return y+'-'+String(m).padStart(2,'0');
}

export function monthLabelShort(ym){
  const [y,m] = ym.split('-').map(Number);
  const d = new Date(y, m-1, 1);
  let mon = d.toLocaleDateString('pt-BR', {month:'short'}).replace('.','');
  mon = mon.charAt(0).toUpperCase() + mon.slice(1);
  return mon+'/'+String(y).slice(2);
}

export function lastNMonths(endMonth, n){
  const result = [];
  for(let i=n-1;i>=0;i--) result.push(shiftMonth(endMonth, -i));
  return result;
}

export function fmtBRLCompact(n){
  const v = Number(n)||0;
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if(abs >= 1000000) return sign+'R$ '+(abs/1000000).toLocaleString('pt-BR',{maximumFractionDigits:1})+'M';
  if(abs >= 1000) return sign+'R$ '+(abs/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})+'k';
  return sign+'R$ '+abs.toLocaleString('pt-BR',{maximumFractionDigits:0});
}

export function escapeHTML(s){
  return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
