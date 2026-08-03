const state = {
  currentUser: null,
  items: [],
  lastConta: 'Itaú',
  currentMonth: new Date().toISOString().slice(0,7), // YYYY-MM
  currentFilter: 'todos',
  editingId: null,
  loaded: false
};

export default state;
