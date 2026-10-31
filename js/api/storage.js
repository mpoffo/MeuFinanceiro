import { supabase } from './client.js';
import { DATA_VERSION } from '../config.js';
import { buildSeed } from '../seed-data.js';
import { buildHistorico } from '../historico-data.js';
import { buildInvestSeed, migrateInvestimentos, INVEST_REVISAO } from '../investments.js';
import state from '../state.js';
import { showToast } from '../ui/toast.js';

export async function loadAppData(){
  let hadData = false;
  state.investimentos = null;
  state.investRevisao = 0;
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
      state.historicoImportado = !!data.value.historicoImportado;
      state.investimentos = data.value.investimentos;
      state.investRevisao = data.value.investRevisao || 0;
      hadData = true;
    }
  }catch(e){
    showToast('Não foi possível carregar os dados');
  }
  if(!hadData){
    state.items = buildSeed();
    state.currentMonth = '2026-07';
    state.historicoImportado = true;
    await saveAppData();
  } else if(!state.historicoImportado){
    // migracao unica: traz para a base o historico da planilha original
    // (lancamentos anteriores a jul/2026), que ainda nao existia nos dados salvos.
    const maxOrder = state.items.reduce((m, it) => Math.max(m, it.order||0), 0);
    state.items = [...buildHistorico(maxOrder + 1), ...state.items];
    state.historicoImportado = true;
    await saveAppData();
  }
  if(!Array.isArray(state.investimentos)){
    // migracao unica: cria a carteira de investimentos com as posicoes iniciais
    state.investimentos = buildInvestSeed();
    state.investRevisao = INVEST_REVISAO;
    await saveAppData();
  } else if(migrateInvestimentos(state.investimentos, state.investRevisao)){
    state.investRevisao = INVEST_REVISAO;
    await saveAppData();
  }
  state.loaded = true;
}

export async function saveAppData(){
  try{
    const { error } = await supabase.from('app_data').upsert({
      id: state.currentUser.id,
      value: {
        version: DATA_VERSION,
        items: state.items,
        lastConta: state.lastConta,
        lastMonth: state.currentMonth,
        historicoImportado: state.historicoImportado,
        investimentos: state.investimentos,
        investRevisao: state.investRevisao
      },
      updated_at: new Date().toISOString()
    });
    if(error) throw error;
  }catch(e){
    showToast('Não foi possível salvar');
  }
}
