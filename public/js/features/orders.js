(function initializeOrdersFeature(App) {
  const orders = App.data.orders;
  const statuses = [...App.data.orderStatuses, { id: 'cancelled', label: 'Cancelados' }];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => Number(value).toFixed(2);
  const next = { new: 'preparing', preparing: 'ready', ready: 'delivered' };
  const action = { new: 'Preparar', preparing: 'Marcar listo', ready: 'Entregar' };
  let timer, loading = false, generation = 0;
  const pending = new Set();
  function renderOrders() {
    App.elements.ordersBoard.innerHTML = statuses.map(status => {
      const selected = orders.filter(o => o.status === status.id);
      return `<section class="kanban-column"><div class="kanban-title"><span>${status.label}</span><b>${selected.length}</b></div><div class="kanban-orders">${selected.map(order => `<article class="order-card ${order.status === 'preparing' ? 'accent' : ''}">
        <strong>${escape(order.folio)}</strong><small>${escape(new Date(order.created_at).toLocaleString('es-MX'))}</small>
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
    if (loading || !App.auth.isSignedIn()) return;
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
      document.getElementById('ordersStatus').textContent = 'Todos los pedidos activos y los últimos 50 recibidos. Actualización automática cada 15 segundos.';
    } catch (error) {if (current === generation && App.auth.isSignedIn()) document.getElementById('ordersStatus').textContent = error.message;}
    finally {loading = false;}
  }
  function start() {clearInterval(timer);loadOrders();timer = setInterval(() => {if (!document.hidden) loadOrders();},15000);}
  function stop() {generation++;clearInterval(timer);orders.splice(0);renderOrders();}
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
      } catch (error) {document.getElementById('ordersStatus').textContent = error.message;}
      finally {pending.delete(order.id);renderOrders();}
    });renderOrders();
  }
  App.orders = {initialize,start,stop,loadOrders,renderOrders};
})(window.BustersAdmin);
