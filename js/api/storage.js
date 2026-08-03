import { supabase } from './client.js';
import { DATA_VERSION } from '../config.js';
import { buildSeed } from '../seed-data.js';
import state from '../state.js';
import { showToast } from '../ui/toast.js';

export async function loadAppData(){
  let hadData = false;
  try{
    const { data, error } = await supabase
      .from('app_data')
      .select('value')
      .eq('id', state.currentUser.id)
      .maybeSingle();
    if(error) throw error;
    if(data && data.value && data.value.version === DATA_VERSION){
      state.items = data.value.items || [];
      state.lastConta = data.value.lastConta || 'Itaú';
      state.currentMonth = data.value.lastMonth || state.currentMonth;
      hadData = true;
    }
  }catch(e){
    showToast('Não foi possível carregar os dados');
  }
  if(!hadData){
    state.items = buildSeed();
    state.currentMonth = '2026-07';
    await saveAppData();
  }
  state.loaded = true;
}

export async function saveAppData(){
  try{
    const { error } = await supabase.from('app_data').upsert({
      id: state.currentUser.id,
      value: {version: DATA_VERSION, items: state.items, lastConta: state.lastConta, lastMonth: state.currentMonth},
      updated_at: new Date().toISOString()
    });
    if(error) throw error;
  }catch(e){
    showToast('Não foi possível salvar');
  }
}
