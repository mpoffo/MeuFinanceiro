const state = {
  currentUser: null,
  items: [],
  investimentos: null,
  investRevisao: 0,
  lastConta: 'Itaú',
  currentMonth: new Date().toISOString().slice(0,7), // YYYY-MM
  currentFilter: 'todos',
  editingId: null,
  loaded: false,
  historicoImportado: false
};

export default state;
