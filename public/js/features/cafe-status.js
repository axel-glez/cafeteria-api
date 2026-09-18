(function initializeCafeStatusFeature(App) {
  let state = null, error = '', saving = false, timer, version = 0;
  const byId = id => document.getElementById(id);
  function render() {
    const label = byId('cafeStatusLabel');
    label.textContent = error ? 'Estado sin confirmar' : state ? (state.is_open ? 'Cafetería abierta' : 'Cafetería cerrada') : 'Consultando estado…';
    label.dataset.state = error || !state ? 'unknown' : state.is_open ? 'open' : 'closed';
    byId('cafeStatusMessage').textContent = error || (state ? (state.is_open ? 'Recibiendo pedidos desde la app.' : 'No se reciben pedidos nuevos. Los pedidos existentes se siguen atendiendo.') : 'Espera mientras consultamos la cafetería.');
    const button = byId('toggleCafeStatus');
    button.hidden = !App.auth.isAdmin();
    button.disabled = saving || !state || !!error;
    button.textContent = saving ? 'Guardando…' : state?.is_open ? 'Cerrar cafetería' : 'Abrir cafetería';
    byId('refreshCafeStatus').disabled = saving;
  }
  async function refresh() {
    if (!App.auth.isSignedIn() || saving) return;
    const current = ++version;
    try {
      const result = await App.api('/cafeteria');
      if (current !== version || !App.auth.isSignedIn()) return;
      state = result; error = '';
    } catch (failure) {
      if (current !== version || !App.auth.isSignedIn()) return;
      error = failure.message;
    }
    if (current === version) render();
  }
  async function toggle() {
    if (saving || !state || error || !App.auth.isAdmin()) return;
    const current = ++version;
    saving = true;
    render();
    try {
      const result = await App.api('/cafeteria', {
        method: 'PATCH',
        body: JSON.stringify({ is_open: !state.is_open, expected_updated_at: state.updated_at }),
      });
      if (current !== version || !App.auth.isSignedIn()) return;
      state = result; error = '';
    } catch (failure) {
      if (current !== version || !App.auth.isSignedIn()) return;
      error = failure.message;
    } finally {
      if (current === version) { saving = false; render(); }
    }
  }
  function initialize() {
    byId('toggleCafeStatus').addEventListener('click', toggle);
    byId('refreshCafeStatus').addEventListener('click', refresh);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  }
  function start() {
    stop();
    render();
    void refresh();
    timer = setInterval(() => { if (!document.hidden) void refresh(); }, 15000);
  }
  function stop() {
    version++;
    clearInterval(timer);
    state = null; error = ''; saving = false;
  }
  App.cafeStatus = { initialize, start, stop };
})(window.BustersAdmin);
