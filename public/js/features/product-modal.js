/* =========================================================
   MODAL: NUEVO PRODUCTO
   Abrir, cerrar y guardar productos nuevos.
   ========================================================= */

(function initializeProductModalFeature(App) {
  const elements = App.elements;

  let editingId = null;

  async function open(product = null) {
    if (saving || !App.auth.isAdmin()) return;
    try { await App.modifiers.load(); }
    catch (error) { document.getElementById('catalogStatus').textContent = error.message; return; }
    if (!App.auth.isAdmin()) return;
    editingId = product?.id || null;
    elements.productForm.reset();
    elements.productForm.elements.image.value = product?.image || '';
    document.getElementById('productImageStatus').textContent = product?.image
      ? 'Se conservará la imagen actual si no eliges otra.'
      : 'Selecciona una imagen JPG, PNG o WebP de hasta 4 MB.';
    document.getElementById('productFormError').textContent = '';
    document.getElementById('modalTitle').textContent = editingId ? 'Editar producto' : 'Nuevo producto';
    elements.productForm.querySelector('[type="submit"]').textContent = editingId ? 'Guardar cambios' : 'Guardar producto';
    if (editingId) {
      for (const field of ['name', 'price', 'category', 'description', 'image']) {
        elements.productForm.elements[field].value = product[field] ?? '';
      }
    }
    App.modifiers.assignments(product?.modifier_groups?.map(g => g.id) || []);
    const variants = product?.variants || [];
    document.getElementById('useVariants').checked = variants.length > 1 || (variants.length === 1 && variants[0].label !== 'Único');
    document.getElementById('variantRows').replaceChildren();
    variants.forEach(addVariantRow);
    updatePricingMode();
    elements.productModal.classList.add('open');
    elements.productModal.setAttribute('aria-hidden', 'false');
    elements.productForm.elements.name.focus();
  }

  function close() {
    if (saving || !App.auth.isAdmin()) return;
    elements.productModal.classList.remove('open');
    elements.productModal.setAttribute('aria-hidden', 'true');
  }

  let saving = false;
  async function handleSubmit(event) {
    event.preventDefault();
    if (saving || !App.auth.isAdmin()) return;
    const form = event.currentTarget;
    const errorMessage = document.getElementById('productFormError');
    errorMessage.textContent = '';
    saving = true;
    const buttons = [form.querySelector('[type="submit"]'), elements.cancelModalButton, elements.closeModalButton];
    buttons.forEach(button => { button.disabled = true; });
    try {
      const data = Object.fromEntries(new FormData(form));
      const imageFile = form.elements.image_file.files[0];
      delete data.image_file;
      if (imageFile) {
        errorMessage.textContent = 'Subiendo imagen…';
        data.image = await App.uploadImage(imageFile);
      }
      data.variants = document.getElementById('useVariants').checked
        ? [...document.querySelectorAll('#variantRows .variant-row')].map(row => ({
            ...(row.dataset.id ? { id: row.dataset.id } : {}),
            label: row.querySelector('[data-field="label"]').value.trim(),
            price: Number(row.querySelector('[data-field="price"]').value),
            volume_ml: row.querySelector('[data-field="volume_ml"]').value ? Number(row.querySelector('[data-field="volume_ml"]').value) : null,
          }))
        : [{ label: 'Único', price: Number(data.price), volume_ml: null }];
      data.modifier_group_ids = [...document.querySelectorAll('#productModifiers input:checked')].map(input => input.value);
      if (!data.variants.length) throw new Error('Agrega al menos un tamaño.');
      data.price = Math.min(...data.variants.map(variant => variant.price));
      data.image = String(data.image || '').trim();
      if (!data.image || !App.products.isAllowedImage(data.image)) throw new Error('Selecciona una imagen válida para el producto.');
      if (editingId) await App.products.updateProduct(editingId, data);
      else await App.products.addProduct(data);
      form.reset();
      saving = false;
      close();
    } catch (error) { errorMessage.textContent = error.message; }
    finally {
      saving = false;
      buttons.forEach(button => { button.disabled = false; });
    }
  }

  function addVariantRow(variant = {}) {
    const container = document.getElementById('variantRows');
    if (container.children.length >= 12) return;
    const row = document.createElement('div');
    row.className = 'variant-row';
    if (variant.id) row.dataset.id = variant.id;
    for (const [field, title, type, placeholder] of [['label', 'Tamaño', 'text', 'M / G / +G'], ['volume_ml', 'ml (opcional)', 'number', 'Sin definir'], ['price', 'Precio $', 'number', '0.00']]) {
      const label = document.createElement('label');
      label.textContent = title;
      const input = document.createElement('input');
      input.dataset.field = field;
      input.type = type;
      input.placeholder = placeholder;
      input.value = variant[field] ?? '';
      input.required = field !== 'volume_ml';
      if (field === 'label') input.maxLength = 30;
      else { input.min = field === 'price' ? '0' : '1'; input.max = field === 'price' ? '99999999.99' : '10000'; input.step = field === 'price' ? '0.01' : '1'; }
      label.append(input); row.append(label);
    }
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'mini-btn'; remove.textContent = 'Quitar';
    remove.addEventListener('click', () => { row.remove(); });
    row.append(remove); container.append(row);
  }
  function updatePricingMode() {
    const enabled = document.getElementById('useVariants').checked;
    document.getElementById('variantFields').hidden = !enabled;
    elements.productForm.elements.price.disabled = enabled;
    if (enabled && !document.getElementById('variantRows').children.length) [{ label: 'M', volume_ml: 350 }, { label: 'G', volume_ml: 470 }, { label: '+G', volume_ml: 590 }].forEach(addVariantRow);
    document.querySelectorAll('#variantRows input').forEach(input => { input.disabled = !enabled; });
  }

  function initialize() {
    document.getElementById('useVariants').addEventListener('change', updatePricingMode);
    document.getElementById('addVariant').addEventListener('click', () => addVariantRow());
    document.getElementById('productImageFile').addEventListener('change', event => {
      const file = event.target.files[0];
      document.getElementById('productImageStatus').textContent = file ? `${file.name} · lista para subir al guardar` : 'No se seleccionó una imagen nueva.';
    });
    elements.newProductButton.addEventListener('click', () => open());
    elements.closeModalButton.addEventListener('click', close);
    elements.cancelModalButton.addEventListener('click', close);
    elements.productForm.addEventListener('submit', handleSubmit);

    elements.productModal.addEventListener('click', (event) => {
      if (event.target === elements.productModal) close();
    });
  }

  App.productModal = {
    open,
    close,
    initialize,
  };
})(window.BustersAdmin);
