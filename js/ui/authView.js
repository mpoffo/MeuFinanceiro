import { root } from './dom.js';
import { escapeHTML } from '../utils.js';
import { signUp, signIn, resetPasswordForEmail, updatePassword } from '../api/auth.js';
import state from '../state.js';

const TITLES = {
  signup: 'Criar sua conta',
  login: 'Entrar na sua conta',
  forgot: 'Recuperar senha',
  recovery: 'Definir nova senha'
};

export function renderAuth(mode, errorMsg, onAuthenticated){
  if(mode === 'forgot') return renderForgot(errorMsg, onAuthenticated);
  if(mode === 'recovery') return renderRecovery(errorMsg, onAuthenticated);

  root.innerHTML = `
    <div style="max-width:340px;margin:60px auto;padding:0 20px;">
      <div style="font-size:20px;font-weight:700;margin-bottom:4px;">Minhas Contas</div>
      <div style="font-size:13px;color:var(--ink-soft);margin-bottom:20px;">${TITLES[mode]}</div>
      ${errorMsg ? `<div style="background:var(--pendente-bg);color:var(--pendente);border-radius:10px;padding:10px 12px;font-size:13px;margin-bottom:14px;">${escapeHTML(errorMsg)}</div>` : ''}
      <div class="cf-field"><label>E-mail</label><input type="email" id="auth-email" placeholder="voce@email.com"></div>
      <div class="cf-field"><label>Senha</label><input type="password" id="auth-password" placeholder="mínimo 6 caracteres"></div>
      <button class="cf-btn primary" id="auth-submit" style="width:100%;margin-top:6px;">${mode==='signup' ? 'Criar conta' : 'Entrar'}</button>
      ${mode==='login' ? `<button class="cf-quickpay" id="auth-forgot" style="display:block;margin-top:10px;">Esqueci minha senha</button>` : ''}
      <button class="cf-quickpay" id="auth-toggle" style="display:block;margin-top:14px;">${mode==='signup' ? 'Já tenho conta' : 'Criar uma conta nova'}</button>
    </div>
  `;
  document.getElementById('auth-toggle').onclick = ()=> renderAuth(mode==='signup' ? 'login' : 'signup', undefined, onAuthenticated);
  const forgotBtn = document.getElementById('auth-forgot');
  if(forgotBtn) forgotBtn.onclick = ()=> renderAuth('forgot', undefined, onAuthenticated);
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

function renderForgot(msg, onAuthenticated){
  root.innerHTML = `
    <div style="max-width:340px;margin:60px auto;padding:0 20px;">
      <div style="font-size:20px;font-weight:700;margin-bottom:4px;">Minhas Contas</div>
      <div style="font-size:13px;color:var(--ink-soft);margin-bottom:20px;">${TITLES.forgot}</div>
      ${msg ? `<div style="background:var(--pago-bg);color:var(--pago);border-radius:10px;padding:10px 12px;font-size:13px;margin-bottom:14px;">${escapeHTML(msg)}</div>` : ''}
      <div style="font-size:13px;color:var(--ink-soft);margin-bottom:14px;">Informe seu e-mail e enviaremos um link para redefinir sua senha.</div>
      <div class="cf-field"><label>E-mail</label><input type="email" id="forgot-email" placeholder="voce@email.com"></div>
      <button class="cf-btn primary" id="forgot-submit" style="width:100%;margin-top:6px;">Enviar link de redefinição</button>
      <button class="cf-quickpay" id="forgot-back" style="margin-top:14px;">Voltar para entrar</button>
    </div>
  `;
  document.getElementById('forgot-back').onclick = ()=> renderAuth('login', undefined, onAuthenticated);
  document.getElementById('forgot-submit').onclick = async ()=>{
    const email = document.getElementById('forgot-email').value.trim();
    if(!email){ renderForgot('Informe seu e-mail', onAuthenticated); return; }
    await resetPasswordForEmail(email);
    renderAuth('login', 'Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.', onAuthenticated);
  };
}

function renderRecovery(errorMsg, onDone){
  root.innerHTML = `
    <div style="max-width:340px;margin:60px auto;padding:0 20px;">
      <div style="font-size:20px;font-weight:700;margin-bottom:4px;">Minhas Contas</div>
      <div style="font-size:13px;color:var(--ink-soft);margin-bottom:20px;">${TITLES.recovery}</div>
      ${errorMsg ? `<div style="background:var(--pendente-bg);color:var(--pendente);border-radius:10px;padding:10px 12px;font-size:13px;margin-bottom:14px;">${escapeHTML(errorMsg)}</div>` : ''}
      <div class="cf-field"><label>Nova senha</label><input type="password" id="recovery-password" placeholder="mínimo 6 caracteres"></div>
      <button class="cf-btn primary" id="recovery-submit" style="width:100%;margin-top:6px;">Salvar nova senha</button>
    </div>
  `;
  document.getElementById('recovery-submit').onclick = async ()=>{
    const password = document.getElementById('recovery-password').value;
    if(!password || password.length < 6){ renderRecovery('A senha deve ter ao menos 6 caracteres', onDone); return; }
    const { error } = await updatePassword(password);
    if(error){ renderRecovery(error.message, onDone); return; }
    onDone();
  };
}
