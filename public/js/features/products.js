/* =========================================================
   PRODUCTOS / MENÚ
   Renderizado, filtros, búsqueda, activar/ocultar productos.
   ========================================================= */

(function initializeProductsFeature(App) {
  const { products, categoryLabels } = App.data;
  const elements = App.elements;

  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
  const normalize = product => ({ ...product, price: Number(product.price), active: product.available });
  const status = document.getElementById('catalogStatus');
  const retry = document.getElementById('retryCatalog');

  const fallbackImage = 'assets/product-placeholder.svg';
  let imageOrigins = new Set();
  function isAllowedImage(value) {
    if (typeof value !== 'string') return false;
    if (/^assets\/[a-zA-Z0-9_.-]+$/.test(value)) return true;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password && imageOrigins.has(url.origin);
    } catch { return false; }
  }
  function handleImageError(event) {
    const img = event.target;
    if (img.tagName !== 'IMG' || img.dataset.fallbackApplied) return;
    img.dataset.fallbackApplied = 'true';
    img.src = fallbackImage;
  }

  async function loadCatalog() {
    if (!App.auth.isSignedIn()) return;
    status.textContent = 'Cargando catálogo…';
    retry.hidden = true;
    elements.newProductButton.disabled = true;
    try {
      const [items, categories, origins] = await Promise.all([App.api('/productos'), App.api('/categorias'), App.api('/assets/image-origins.json')]);
      imageOrigins = new Set(origins);
      if (!App.auth.isSignedIn()) return;
      products.splice(0, products.length, ...items.map(normalize));
      for (const key of Object.keys(categoryLabels)) delete categoryLabels[key];
      categories.forEach(category => { categoryLabels[category.name] = category.name; });
      const options = categories.map(category => `<option value="${escape(category.name)}">${escape(category.name)}</option>`).join('');
      elements.menuFilter.innerHTML = '<option value="todos">Todas las categorías</option>' + options;
      elements.productForm.elements.category.innerHTML = options;
      document.getElementById('categoryTabs').innerHTML = '<button class="tab active" data-category="todos">Todos</button>' + categories.map(category => `<button class="tab" data-category="${escape(category.name)}">${escape(category.name)}</button>`).join('');
      initializeCategoryTabs();
      refreshProductViews();
      status.textContent = categories.length ? 'Catálogo conectado.' : 'Crea una categoría en la API antes de agregar productos.';
      elements.newProductButton.disabled = !categories.length || !App.auth.isAdmin();
    } catch (error) {
      status.textContent = error.message;
      retry.hidden = false;
      elements.productGrid.textContent = 'No se pudo cargar el catálogo.';
      elements.menuProductGrid.textContent = 'No se pudo cargar el catálogo.';
    }
  }

  function getProductCard(product, { admin = false } = {}) {
    const availabilityClass = product.active ? '' : 'off';
    const availabilityText = product.active ? 'Disponible' : 'Agotado';
    const actionText = product.active ? 'Ocultar' : 'Activar';

    return `
      <article
        class="product-card"
        data-category="${escape(product.category)}"
        data-name="${escape(product.name.toLowerCase())}"
      >
        <div class="product-image">
          <img src="${escape(isAllowedImage(product.image) ? product.image : fallbackImage)}" alt="${escape(product.name)}" loading="lazy" referrerpolicy="no-referrer" />
          <span class="product-category">${escape(categoryLabels[product.category] || product.category)}</span>
        </div>

        <div class="product-body">
          <h3>${escape(product.name)}</h3>
          <p class="product-description">${escape(product.description)}</p>
          ${(product.variants?.length > 1 || product.variants?.[0]?.label !== 'Único' && product.variants?.length) ? `<div class="product-sizes">${product.variants.map(variant => `<span><b>${escape(variant.label)}</b>${variant.volume_ml ? ` <small>${escape(variant.volume_ml)} ml</small>` : ''}<strong>$${Number(variant.price).toFixed(2)}</strong></span>`).join('')}</div>` : ''}

          ${admin ? '<div class="variant-availability">' + (product.variants || []).map(v => '<button type="button" class="mini-btn" data-toggle-variant="' + escape(v.id) + '" data-product-id="' + escape(product.id) + '">' + escape(v.label) + ': ' + (v.available ? 'disponible' : 'agotado') + '</button>').join('') + '</div>' : ''}
          <div class="product-meta">
            <span class="product-price">${product.variants?.length > 1 ? 'Desde ' : ''}$${Number(product.price).toFixed(2)}</span>
            <span class="availability ${availabilityClass}">${availabilityText}</span>
          </div>

          ${
            admin
              ? `
                <div class="card-actions">
                  ${App.auth.isAdmin() ? `<button class="mini-btn" type="button" data-edit-product="${escape(product.id)}">Editar</button>
                  <button class="mini-btn" type="button" data-delete-product="${escape(product.id)}">Archivar</button>` : ''}
                  <button
                    class="mini-btn"
                    type="button"
                    data-toggle-product="${escape(product.id)}"
                  >
                    ${actionText}
                  </button>
                </div>
              `
              : ''
          }
        </div>
      </article>
    `;
  }

  function getActiveHomeCategory() {
    return document.querySelector('.tab.active')?.dataset.category || 'todos';
  }

  function getFilteredProducts(category = 'todos', query = '') {
    const simplify = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const normalizedQuery = simplify(query.trim());

    return products.filter((product) => {
      const matchesCategory =
        category === 'todos' || product.category === category;
      const matchesQuery =
        !normalizedQuery || simplify(product.name).includes(normalizedQuery);

      return matchesCategory && matchesQuery;
    });
  }

  function renderProducts(category = 'todos') {
    const filteredProducts = getFilteredProducts(category);

    elements.productGrid.innerHTML = filteredProducts
      .slice(0, 8)
      .map((product) => getProductCard(product))
      .join('') || '<p class="muted">No se encontraron productos.</p>';
  }

  function renderAdminProducts(category = 'todos', query = '') {
    const filteredProducts = getFilteredProducts(category, query);

    elements.menuProductGrid.innerHTML = filteredProducts.length
      ? filteredProducts
          .map((product) => getProductCard(product, { admin: true }))
          .join('')
      : '<p class="muted">No se encontraron productos.</p>';
  }

  function refreshProductViews() {
    document.getElementById('productCount').textContent = `${products.filter(product => product.active).length} productos disponibles`;
    renderProducts(getActiveHomeCategory());
    renderAdminProducts(elements.menuFilter.value, elements.menuSearch.value);
  }

  async function toggleProduct(productId) {
    const product = products.find(item => item.id === productId);
    if (!product) return;
    const updated = await App.api('/productos/' + encodeURIComponent(productId), {
      method: 'PATCH', body: JSON.stringify({ available: !product.active }),
    });
    Object.assign(product, normalize(updated));
    refreshProductViews();
  }

  async function addProduct({ name, price, category, description, image, variants, modifier_group_ids }) {
    const product = await App.api('/productos', {
      method: 'POST', body: JSON.stringify({ name, price: Number(price), category, description, image, variants, modifier_group_ids, available: true }),
    });
    products.unshift(normalize(product));
    refreshProductViews();
  }

  async function updateProduct(productId, { name, price, category, description, image, variants, modifier_group_ids }) {
    const updated = await App.api('/productos/' + encodeURIComponent(productId), {
      method: 'PATCH', body: JSON.stringify({ name, price: Number(price), category, description, image, variants, modifier_group_ids }),
    });
    const product = products.find(item => item.id === productId);
    if (product) Object.assign(product, normalize(updated));
    refreshProductViews();
    status.textContent = 'Producto actualizado.';
  }

  async function deleteProduct(productId) {
    await App.api('/productos/' + encodeURIComponent(productId), { method: 'DELETE' });
    const index = products.findIndex(item => item.id === productId);
    if (index !== -1) products.splice(index, 1);
    refreshProductViews();
    status.textContent = 'Producto archivado.';
  }

  function initializeCategoryTabs() {
    document.querySelectorAll('.tab').forEach((button) => {
      button.addEventListener('click', () => {
        document
          .querySelectorAll('.tab')
          .forEach((tab) => tab.classList.remove('active'));

        button.classList.add('active');
        renderProducts(button.dataset.category);
      });
    });
  }

  function initializeMenuFilters() {
    elements.menuFilter.addEventListener('change', (event) => {
      renderAdminProducts(event.target.value, elements.menuSearch.value);
    });

    elements.menuSearch.addEventListener('input', (event) => {
      renderAdminProducts(elements.menuFilter.value, event.target.value);
    });

    elements.globalSearch.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;

      App.navigation.showView('menu');
      elements.menuFilter.value = 'todos';
      elements.menuSearch.value = event.target.value;
      renderAdminProducts('todos', event.target.value);
    });
  }

  function initializeProductActions() {
    const pending = new Set();
    elements.menuProductGrid.addEventListener('click', async (event) => {
      const variantButton = event.target.closest('[data-toggle-variant]');
      if (variantButton) {
        if (variantButton.disabled) return;
        const product = products.find(p => p.id === variantButton.dataset.productId);
        const variant = product?.variants.find(v => v.id === variantButton.dataset.toggleVariant);
        if (!variant) return;variantButton.disabled = true;
        try { const updated = await App.api('/productos/' + product.id + '/variantes/' + variant.id,{method:'PATCH',body:JSON.stringify({available:!variant.available})});Object.assign(product,normalize(updated));refreshProductViews();status.textContent = 'Disponibilidad guardada.'; } catch(error) {status.textContent = error.message;} finally {variantButton.disabled = false;}
        return;
      }
      const button = event.target.closest('[data-toggle-product], [data-edit-product], [data-delete-product]');
      if (!button || button.disabled) return;
      const id = button.dataset.toggleProduct || button.dataset.editProduct || button.dataset.deleteProduct;
      const product = products.find(item => item.id === id);
      if (!product || pending.has(id)) return;
      if (button.dataset.editProduct) {
        App.productModal.open(product);
        return;
      }
      if (button.dataset.deleteProduct && !window.confirm(`¿Archivar "${product.name}"? Dejará de ofrecerse; sus pedidos se conservarán.`)) return;
      pending.add(id);
      const buttons = button.closest('.card-actions').querySelectorAll('button');
      buttons.forEach(item => { item.disabled = true; });
      try {
        if (button.dataset.deleteProduct) await deleteProduct(id);
        else {
          await toggleProduct(id);
          status.textContent = 'Disponibilidad guardada.';
        }
      } catch (error) { status.textContent = error.message; }
      finally {
        pending.delete(id);
        buttons.forEach(item => { item.disabled = false; });
      }
    });
  }

  function initialize() {
    elements.productGrid.addEventListener('error', handleImageError, true);
    elements.menuProductGrid.addEventListener('error', handleImageError, true);
    renderProducts();
    renderAdminProducts();
    initializeCategoryTabs();
    initializeMenuFilters();
    initializeProductActions();
    retry.addEventListener('click', loadCatalog);
    loadCatalog();
  }

  App.products = {
    isAllowedImage,
    loadCatalog,
    addProduct,
    updateProduct,
    deleteProduct,
    refreshProductViews,
    renderProducts,
    renderAdminProducts,
    initialize,
  };
})(window.BustersAdmin);
