(function initializeOrdersFeature(App) {
  const orders = App.data.orders;
  const statuses = [...App.data.orderStatuses, { id: 'cancelled', label: 'Cancelados' }];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => Number(value).toFixed(2);
  const next = { new: 'preparing', preparing: 'ready', ready: 'delivered' };
  const action = { new: 'Comenzar preparación', preparing: 'Pedido listo', ready: 'Marcar entregado' };
  let timer, socket, loading = false, reloadRequested = false, generation = 0, toastTimer, feedbackUntil = 0;
  const pending = new Set();
  function elapsed(value) {
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
    if (seconds < 60) return 'Hace menos de 1 min';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `Hace ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Hace ${hours} h`;
    return `Hace ${Math.floor(hours / 24)} d`;
  }
  function notifyNewOrder(folio) {
    const toast = document.getElementById('orderToast');
    toast.textContent = `Nuevo pedido ${folio} recibido.`;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 5000);
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const context = new AudioContext();const oscillator = context.createOscillator();const gain = context.createGain();
      oscillator.frequency.value = 660;gain.gain.value = 0.035;oscillator.connect(gain);gain.connect(context.destination);
      oscillator.start();oscillator.stop(context.currentTime + 0.12);oscillator.addEventListener('ended', () => context.close());
    } catch { /* El aviso visual siempre funciona aunque el navegador bloquee audio. */ }
  }
  function renderOrders() {
    App.elements.ordersBoard.innerHTML = statuses.map(status => {
      const selected = orders.filter(o => o.status === status.id);
      return `<section class="kanban-column" data-status="${status.id}"><div class="kanban-title"><span>${status.label}</span><b>${selected.length}</b></div><div class="kanban-orders">${selected.map(order => `<article class="order-card ${order.status === 'preparing' ? 'accent' : ''}">
        <strong>${escape(order.folio)}</strong><small title="${escape(new Date(order.created_at).toLocaleString('es-MX'))}">${escape(elapsed(order.created_at))}</small>
        ${order.notes ? `<div class="order-notes"><strong>Indicaciones especiales</strong><p>${escape(order.notes)}</p></div>` : ''}
        <ul class="order-items">${order.items.map(i => `<li>${i.quantity} × ${escape(i.product_name)} · ${escape(i.presentation_label)}${i.volume_ml ? ` (${i.volume_ml} ml)` : ''}${i.options.length ? `<small>${i.options.map(o => escape(o.option_name)).join(', ')}</small>` : ''}</li>`).join('')}</ul>
        <div class="order-card-footer"><b>$${money(order.total)}</b>${next[order.status] ? `<button type="button" class="mini-btn" data-order-id="${order.id}" data-status="${next[order.status]}" ${pending.has(order.id) ? 'disabled' : ''}>${action[order.status]}</button>` : ''}</div>
        ${['new','preparing'].includes(order.status) ? `<button type="button" class="remove-order-btn" data-order-id="${order.id}" data-status="cancelled" ${pending.has(order.id) ? 'disabled' : ''}>Cancelar pedido</button>` : ''}
      </article>`).join('') || '<p class="empty-orders">Sin pedidos</p>'}</div></section>`;
    }).join('');
    const active = orders.filter(o => !['delivered','cancelled'].includes(o.status)).length;
    document.querySelectorAll('[data-active-orders]').forEach(el => {el.textContent = active;});
    document.getElementById('preparingCount').textContent = orders.filter(o => o.status === 'preparing').length;
    document.getElementById('deliveredCount').textContent = orders.filter(o => o.status === 'delivered').length;
    document.getElementById('recentOrders').innerHTML = orders.slice(0,5).map(o => `<tr><td><strong>${escape(o.folio)}</strong><small>${o.items.reduce((n,i) => n+i.quantity,0)} productos</small></td><td>${escape(new Date(o.created_at).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}))}</td><td>$${money(o.total)}</td><td><span class="status ${o.status}">${statuses.find(s => s.id === o.status).label}</span></td><td></td></tr>`).join('') || '<tr><td colspan="5">Todavía no hay pedidos.</td></tr>';
  }
  async function loadOrders() {
    if (loading) { reloadRequested = true; return; }
    if (!App.auth.isSignedIn()) return;
    loading = true;const current = generation;
    try {
      const all = [];let cursor = null;
      do {
        const page = await App.api('/pedidos?scope=active' + (cursor ? '&cursor=' + cursor : ''));
        all.push(...page.orders);cursor = page.next_cursor;
        if (current !== generation || !App.auth.isSignedIn()) return;
      } while (cursor);
      const recent = await App.api('/pedidos?limit=50');
      if (current !== generation || !App.auth.isSignedIn()) return;
      // Conservar todos los activos y una ventana del historial, sin descargarlo entero cada vez.
      const merged = new Map(all.map(order => [order.id,order]));
      recent.orders.forEach(order => merged.set(order.id,order));
      orders.splice(0,orders.length,...[...merged.values()].sort((a,b) => new Date(b.created_at)-new Date(a.created_at)));renderOrders();
      if (Date.now() >= feedbackUntil) document.getElementById('ordersStatus').textContent = 'Al día · Los pedidos se actualizan automáticamente.';
    } catch (error) {if (current === generation && App.auth.isSignedIn()) document.getElementById('ordersStatus').textContent = error.message;}
    finally {loading = false;if (reloadRequested) {reloadRequested = false;void loadOrders();}}
  }
  function start() {
    clearInterval(timer);loadOrders();timer = setInterval(() => {if (!document.hidden) loadOrders();},15000);
    if (!socket && window.io) {
      socket = window.io({ transports: ['websocket', 'polling'] });
      socket.on('admin-orders-updated', event => {
        if (!App.auth.isSignedIn()) return;
        if (event?.type === 'created' && typeof event.folio === 'string') notifyNewOrder(event.folio);
        void loadOrders();
      });
    } else socket?.connect();
  }
  function stop() {generation++;clearInterval(timer);reloadRequested = false;socket?.disconnect();orders.splice(0);renderOrders();}
  function initialize() {
    document.getElementById('refreshOrders').addEventListener('click',loadOrders);
    App.elements.ordersBoard.addEventListener('click',async event => {
      const button = event.target.closest('[data-order-id]');
      if (!button || button.disabled || pending.has(button.dataset.orderId)) return;
      const order = orders.find(o => o.id === button.dataset.orderId);if (!order) return;
      if (button.dataset.status === 'cancelled' && !window.confirm(`¿Cancelar el pedido ${order.folio}?`)) return;
      const target = button.dataset.status;pending.add(order.id);renderOrders();
      try {
        const updated = await App.api('/pedidos/' + order.id + '/estado',{method:'PATCH',body:JSON.stringify({from_status:order.status,status:target})});
        if (App.auth.isSignedIn()) {const existing = orders.find(o => o.id === updated.id);if (existing) Object.assign(existing,updated);}
        if (target === 'ready') {feedbackUntil = Date.now() + 5000;document.getElementById('ordersStatus').textContent = `Pedido ${updated.folio} marcado como listo. Se notificó al alumno.`;}
      } catch (error) {document.getElementById('ordersStatus').textContent = error.message;}
      finally {pending.delete(order.id);renderOrders();}
    });renderOrders();
  }
  App.orders = {initialize,start,stop,loadOrders,renderOrders};
})(window.BustersAdmin);
