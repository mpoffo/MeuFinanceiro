import state from './state.js';
import { getSession, signOut } from './api/auth.js';
import { loadAppData } from './api/storage.js';
import { render } from './ui/listView.js';
import { renderAuth } from './ui/authView.js';
import { openSheet } from './ui/sheetView.js';

function refresh(){
  render({
    onAdd: () => openSheet(null, { onChange: refresh }),
    onEditItem: (id) => openSheet(id, { onChange: refresh }),
    onLogout: handleLogout
  });
}

async function handleAuthenticated(){
  await loadAppData();
  refresh();
}

async function handleLogout(){
  await signOut();
  state.currentUser = null;
  state.loaded = false;
  renderAuth('login', undefined, handleAuthenticated);
}

async function init(){
  const { data: { session } } = await getSession();
  if(session){
    state.currentUser = session.user;
    await handleAuthenticated();
  } else {
    renderAuth('login', undefined, handleAuthenticated);
  }
}

init();
