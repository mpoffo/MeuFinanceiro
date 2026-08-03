import { root } from './dom.js';

let toastTimer = null;

export function showToast(msg){
  let t = document.querySelector('.cf-toast');
  if(!t){
    t = document.createElement('div');
    t.className = 'cf-toast';
    root.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove('show'), 1800);
}
