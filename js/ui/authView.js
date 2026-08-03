import { root } from './dom.js';
import { escapeHTML } from '../utils.js';
import { signUp, signIn } from '../api/auth.js';
import state from '../state.js';

export function renderAuth(mode, errorMsg, onAuthenticated){
  root.innerHTML = `
    <div style="max-width:340px;margin:60px auto;padding:0 20px;">
      <div style="font-size:20px;font-weight:700;margin-bottom:4px;">Minhas Contas</div>
      <div style="font-size:13px;color:var(--ink-soft);margin-bottom:20px;">${mode==='signup' ? 'Criar sua conta' : 'Entrar na sua conta'}</div>
      ${errorMsg ? `<div style="background:var(--pendente-bg);color:var(--pendente);border-radius:10px;padding:10px 12px;font-size:13px;margin-bottom:14px;">${escapeHTML(errorMsg)}</div>` : ''}
      <div class="cf-field"><label>E-mail</label><input type="email" id="auth-email" placeholder="voce@email.com"></div>
      <div class="cf-field"><label>Senha</label><input type="password" id="auth-password" placeholder="mínimo 6 caracteres"></div>
      <button class="cf-btn primary" id="auth-submit" style="width:100%;margin-top:6px;">${mode==='signup' ? 'Criar conta' : 'Entrar'}</button>
      <button class="cf-quickpay" id="auth-toggle" style="margin-top:14px;">${mode==='signup' ? 'Já tenho conta' : 'Criar uma conta nova'}</button>
    </div>
  `;
  document.getElementById('auth-toggle').onclick = ()=> renderAuth(mode==='signup' ? 'login' : 'signup', undefined, onAuthenticated);
  document.getElementById('auth-submit').onclick = async ()=>{
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    if(!email || !password){ renderAuth(mode, 'Preencha e-mail e senha', onAuthenticated); return; }
    const fn = mode==='signup' ? signUp : signIn;
    const { data, error } = await fn(email, password);
    if(error){ renderAuth(mode, error.message, onAuthenticated); return; }
    if(mode==='signup' && !data.session){
      renderAuth('login', 'Conta criada. Confirme seu e-mail (se solicitado) e entre.', onAuthenticated);
      return;
    }
    state.currentUser = data.user;
    onAuthenticated();
  };
}
