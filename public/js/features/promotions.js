(function initializePromotionsFeature(App) {
  let items = [], revision = null, busy = false, dirty = false, version = 0;
  let imageOrigins = [];
  function previewSource(value) {
    if (/^assets\/[a-zA-Z0-9_-]+\.(png|jpe?g|webp)$/.test(value)) return value;
    try {
      const url = new URL(value);
      if (url.protocol === 'https:' && !url.username && !url.password && imageOrigins.includes(url.origin)) return value;
    } catch { /* La validación al publicar explica el formato permitido. */ }
    return 'assets/promo-coffee-photo.png';
  }
  const byId = id => document.getElementById(id);
  const form = () => byId('promotionsForm');
  const message = text => { byId('promotionsMessage').textContent = text; };
  const uuid = () => '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, n =>
    (Number(n) ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> Number(n) / 4).toString(16));
  function controls() {
    byId('addPromotion').disabled = busy || revision === null || items.length >= 12;
    byId('publishPromotions').disabled = busy || revision === null || !dirty;
    byId('refreshPromotions').disabled = busy;
    byId('promotionsCount').textContent = `${items.length}/12 anuncios · ${items.filter(p => p.active).length} visibles${dirty ? ' · Cambios sin publicar' : ''}`;
    form().querySelectorAll('input, textarea, .promotion-actions button').forEach(node => { node.disabled = busy || revision === null; });
  }
  function changed() { dirty = true; controls(); }
  function node(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  }
  function button(text, action, label) {
    const el = node('button', 'mini-btn', text);
    el.type = 'button';
    if (label) el.setAttribute('aria-label', label);
    el.addEventListener('click', action);
    return el;
  }
  function render() {
    const list = byId('promotionsList');
    list.replaceChildren();
    items.forEach((promotion, index) => {
      const card = node('article', 'promotion-editor');
      const preview = node('div', 'promotion-preview');
      const photo = node('img');
      photo.alt = '';
      photo.loading = 'lazy';
      photo.referrerPolicy = 'no-referrer';
      const fallback = 'assets/promo-coffee-photo.png';
      photo.src = previewSource(promotion.image);
      photo.addEventListener('error', () => { if (photo.getAttribute('src') !== fallback) photo.src = fallback; });
      const copy = node('div', 'promotion-preview-copy');
      const badge = node('span', 'promotion-label', promotion.label || 'ETIQUETA');
      const title = node('strong', '', promotion.title || 'Título del anuncio');
      const description = node('p', '', promotion.description || 'Descripción del anuncio');
      copy.append(badge, title, description, node('span', 'promotion-cta', 'Conocer más'));
      preview.append(photo, copy);
      card.append(preview);
      const fields = node('div', 'promotion-fields');
      const targets = { label: badge, title, description };
      for (const [key, caption, max] of [
        ['label', 'Etiqueta', 25], ['title', 'Título', 70],
        ['description', 'Descripción', 180], ['image', 'Imagen (opcional)', 1000],
      ]) {
        const label = node('label', '', caption);
        const input = node(key === 'description' ? 'textarea' : 'input');
        input.name = `${promotion.id}-${key}`;
        input.maxLength = max;
        input.required = key !== 'image';
        input.value = promotion[key];
        if (key === 'image') input.placeholder = 'assets/cappuccino.jpg o URL HTTPS autorizada';
        input.addEventListener('input', () => {
          promotion[key] = input.value;
          if (targets[key]) targets[key].textContent = input.value;
          changed();
        });
        // Evitar una petición por cada tecla de la dirección de imagen.
        if (key === 'image') input.addEventListener('change', () => { photo.src = previewSource(input.value.trim()); });
        label.append(input); fields.append(label);
      }
      const toggleLabel = node('label', 'promotion-toggle');
      const toggle = node('input'); toggle.type = 'checkbox'; toggle.checked = promotion.active;
      toggle.addEventListener('change', () => { promotion.active = toggle.checked; changed(); });
      toggleLabel.append(toggle, document.createTextNode('Visible en la app después de publicar'));
      fields.append(toggleLabel);
      const actions = node('div', 'promotion-actions');
      if (index > 0) actions.append(button('↑ Subir', () => {
        [items[index - 1], items[index]] = [items[index], items[index - 1]]; changed(); render();
      }, `Subir anuncio ${index + 1}`));
      if (index < items.length - 1) actions.append(button('↓ Bajar', () => {
        [items[index + 1], items[index]] = [items[index], items[index + 1]]; changed(); render();
      }, `Bajar anuncio ${index + 1}`));
      actions.append(button('Quitar', () => {
        if (!window.confirm('¿Quitar este anuncio? El cambio se aplicará al publicar.')) return;
        items.splice(index, 1); changed(); render();
      }, `Quitar anuncio ${index + 1}`));
      fields.append(actions); card.append(fields); list.append(card);
    });
    if (!items.length) list.append(node('p', 'muted', 'No hay anuncios. Agrega el primero y publícalo cuando esté listo.'));
    controls();
  }
  function accept(data) {
    items = data.items; revision = data.revision; dirty = false;
    imageOrigins = data.image_origins;
    byId('promotionOrigins').textContent = data.image_origins.join(', ');
  }
  async function load() {
    if (!App.auth.isAdmin() || busy) return;
    const current = ++version;
    busy = true; controls(); message('Cargando promociones…');
    try {
      const data = await App.api('/promociones');
      if (current !== version || !App.auth.isAdmin()) return;
      accept(data); message('Anuncios cargados. Editar no publica: usa «Publicar cambios» cuando termines.');
    } catch (error) {
      if (current !== version) return;
      revision = null; message(error.message);
    } finally {
      if (current === version) { busy = false; render(); }
    }
  }
  async function publish(event) {
    event.preventDefault();
    if (!App.auth.isAdmin() || busy || revision === null || !dirty || !form().reportValidity()) return;
    const current = ++version;
    busy = true; controls(); message('Publicando…');
    try {
      const data = await App.api('/promociones', { method: 'PUT', body: JSON.stringify({ items, expected_revision: revision }) });
      if (current !== version || !App.auth.isAdmin()) return;
      accept(data); message('Cambios publicados en el backend. La app actualizada los consulta al abrir el menú y cada 30 segundos mientras esté activo.');
    } catch (error) {
      if (current !== version) return;
      // Incluye conflictos y respuestas perdidas: verificar servidor antes de reintentar.
      revision = null; message(error.message + ' Recarga para comprobar lo guardado antes de editar nuevamente.');
    } finally {
      if (current === version) { busy = false; render(); }
    }
  }
  function initialize() {
    form().addEventListener('submit', publish);
    byId('addPromotion').addEventListener('click', () => {
      if (!App.auth.isAdmin() || busy || revision === null || items.length >= 12) return;
      items.push({ id: uuid(), label: '', title: '', description: '', image: '', active: false });
      changed(); render();
      byId('promotionsList').lastElementChild.querySelector('input').focus();
    });
    byId('refreshPromotions').addEventListener('click', () => {
      if (dirty && !window.confirm('Recargar descartará los cambios sin publicar. ¿Continuar?')) return;
      void load();
    });
    window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  }
  function stop() {
    version++; items = []; revision = null; busy = false; dirty = false; imageOrigins = [];
    message(''); byId('promotionOrigins').textContent = ''; render();
  }
  App.promotions = { initialize, load, stop };
})(window.BustersAdmin);
