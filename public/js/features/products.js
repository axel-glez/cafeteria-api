/* =========================================================
   PRODUCTOS / MENÚ
   Renderizado, filtros, búsqueda y disponibilidad de productos.
   ========================================================= */

(function initializeProductsFeature(App) {
  const { products, categoryLabels } = App.data;
  const elements = App.elements;

  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
  const normalize = product => ({ ...product, price: Number(product.price), active: product.available });
  const isAvailable = product => product.active && (product.variants || []).some(variant => variant.available);
  const status = document.getElementById('catalogStatus');
  const retry = document.getElementById('retryCatalog');

  const fallbackImage = 'assets/product-placeholder.svg';
  let imageOrigins = new Set();
  let catalogCategories = [];

  function renderCategories(selectedName = '') {
    const menuSelection = elements.menuFilter.value;
    const productSelection = selectedName || elements.productForm.elements.category.value;
    const options = catalogCategories.map(category => `<option value="${escape(category.name)}">${escape(category.name)}</option>`).join('');
    elements.menuFilter.innerHTML = '<option value="todos">Todas las categorías</option>' + options;
    elements.menuFilter.value = catalogCategories.some(category => category.name === menuSelection) ? menuSelection : 'todos';
    elements.productForm.elements.category.innerHTML = options;
    if (catalogCategories.some(category => category.name === productSelection)) elements.productForm.elements.category.value = productSelection;
    document.getElementById('categoryTabs').innerHTML = '<button class="tab active" data-category="todos">Todos</button>' + catalogCategories.map(category => `<button class="tab" data-category="${escape(category.name)}">${escape(category.name)}</button>`).join('');
    initializeCategoryTabs();
  }
  function isAllowedImage(value) {
    if (typeof value !== 'string') return false;
    if (/^assets\/[a-zA-Z0-9_.-]+$/.test(value) || /^\/api\/v1\/archivos\/[0-9a-f-]{36}$/i.test(value)) return true;
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
      catalogCategories = categories;
      renderCategories();
      refreshProductViews();
      status.textContent = categories.length ? 'Catálogo conectado.' : 'Aún no hay categorías. Pulsa Nuevo producto para crear la primera.';
      elements.newProductButton.disabled = !App.auth.isAdmin();
      elements.newProductMobileButton.disabled = !App.auth.isAdmin();
    } catch (error) {
      status.textContent = error.message;
      retry.hidden = false;
      elements.productGrid.textContent = 'No se pudo cargar el catálogo.';
      elements.menuProductGrid.textContent = 'No se pudo cargar el catálogo.';
    }
  }

  function getProductCard(product, { admin = false } = {}) {
    const available = isAvailable(product);
    const availabilityClass = available ? '' : 'off';
    const availabilityText = available ? 'Disponible' : 'Agotado';
    const actionText = product.active ? 'Marcar agotado' : 'Marcar disponible';

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

          ${admin ? '<div class="variant-availability">' + (product.variants || []).map(v => '<button type="button" class="mini-btn" data-toggle-variant="' + escape(v.id) + '" data-product-id="' + escape(product.id) + '">' + escape(v.label) + ': ' + (v.available ? 'Marcar agotado' : 'Marcar disponible') + '</button>').join('') + '</div>' : ''}
          <div class="product-meta">
            <span class="product-price">${product.variants?.length > 1 ? 'Desde ' : ''}$${Number(product.price).toFixed(2)}</span>
            <span class="availability ${availabilityClass}">${availabilityText}</span>
          </div>

          ${
            admin
              ? `
                <div class="card-actions">
                  ${App.auth.isAdmin() ? `<button class="mini-btn" type="button" data-edit-product="${escape(product.id)}">Editar</button>` : ''}
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

  function getFilteredProducts(category = 'todos', query = '', availability = 'todos') {
    const simplify = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const normalizedQuery = simplify(query.trim());

    return products.filter((product) => {
      const matchesCategory =
        category === 'todos' || product.category === category;
      const matchesQuery =
        !normalizedQuery || simplify(product.name).includes(normalizedQuery);
      const available = isAvailable(product);
      const matchesAvailability = availability === 'todos' || (availability === 'disponibles' ? available : !available);

      return matchesCategory && matchesQuery && matchesAvailability;
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
    const filteredProducts = getFilteredProducts(category, query, document.getElementById('availabilityFilter').value);

    elements.menuProductGrid.innerHTML = filteredProducts.length
      ? filteredProducts
          .map((product) => getProductCard(product, { admin: true }))
          .join('')
      : '<p class="muted">No se encontraron productos.</p>';
  }

  function refreshProductViews() {
    const availableCount = products.filter(isAvailable).length;
    document.getElementById('productCount').textContent = `${availableCount} productos disponibles`;
    document.getElementById('exhaustedProductCount').textContent = products.length - availableCount;
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

  async function createCategory(name) {
    const category = await App.api('/categorias', {
      method: 'POST', body: JSON.stringify({ name }),
    });
    catalogCategories = [...catalogCategories, category].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    categoryLabels[category.name] = category.name;
    renderCategories(category.name);
    status.textContent = `Categoría “${category.name}” creada.`;
    return category;
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

    document.getElementById('availabilityFilter').addEventListener('change', () => {
      renderAdminProducts(elements.menuFilter.value, elements.menuSearch.value);
    });

    document.getElementById('exhaustedProductsCard').addEventListener('click', () => {
      App.navigation.showView('menu');
      document.getElementById('availabilityFilter').value = 'agotados';
      renderAdminProducts(elements.menuFilter.value, elements.menuSearch.value);
    });

    elements.globalSearch.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;

      App.navigation.showView('menu');
      elements.menuFilter.value = 'todos';
      document.getElementById('availabilityFilter').value = 'todos';
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
      const button = event.target.closest('[data-toggle-product], [data-edit-product]');
      if (!button || button.disabled) return;
      const id = button.dataset.toggleProduct || button.dataset.editProduct;
      const product = products.find(item => item.id === id);
      if (!product || pending.has(id)) return;
      if (button.dataset.editProduct) {
        App.productModal.open(product);
        return;
      }
      pending.add(id);
      const buttons = button.closest('.card-actions').querySelectorAll('button');
      buttons.forEach(item => { item.disabled = true; });
      try {
        await toggleProduct(id);
        status.textContent = product.active ? 'Producto marcado como disponible.' : 'Producto marcado como agotado.';
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
    createCategory,
    updateProduct,
    refreshProductViews,
    renderProducts,
    renderAdminProducts,
    initialize,
  };
})(window.BustersAdmin);
