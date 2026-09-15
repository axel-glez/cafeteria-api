(function initializeModifiers(App) {
  let groups = [], editingId = null;
  const byId = id => document.getElementById(id);
  function row(option = {}) {
    const el = document.createElement('div');el.className = 'modifier-option-row';if (option.id) el.dataset.id = option.id;
    for (const [key,title,type] of [['name','Opción','text'],['price','Precio adicional','number']]) {
      const label = document.createElement('label');label.textContent = title;
      const input = document.createElement('input');input.dataset.field = key;input.type = type;input.required = true;input.value = option[key] ?? (key === 'price' ? 0 : '');
      if (key === 'price') {input.min = 0;input.max = 99999999.99;input.step = '0.01';} else input.maxLength = 80;
      label.append(input);el.append(label);
    }
    const label = document.createElement('label');label.className = 'variant-switch';
    const available = document.createElement('input');available.type = 'checkbox';available.dataset.field = 'available';available.checked = option.available ?? true;
    label.append(available,document.createTextNode('Disponible'));el.append(label);
    if (!option.id) {const remove = document.createElement('button');remove.type = 'button';remove.className = 'mini-btn';remove.textContent = 'Quitar opción';remove.addEventListener('click',() => el.remove());el.append(remove);}
    byId('modifierOptions').append(el);
  }
  function edit(group = null, focus = true) {
    editingId = group?.id ?? null;const form = byId('modifierForm');form.reset();
    form.elements.name.value = group?.name ?? '';form.elements.min_selections.value = group?.min_selections ?? 0;form.elements.max_selections.value = group?.max_selections ?? 1;
    byId('modifierOptions').replaceChildren();(group?.options ?? [{}]).forEach(row);
    byId('modifierFormTitle').textContent = group ? 'Editar grupo de opciones' : 'Nuevo grupo de opciones';
    if (focus) byId('modifierFormTitle').scrollIntoView({block:'center',behavior:'smooth'});
  }
  async function load() {
    if (!App.auth.isAdmin()) return;
    groups = await App.api('/modificadores');if (!App.auth.isAdmin()) return;byId('modifierList').replaceChildren();
    groups.forEach(group => {
      const container = document.createElement('div');container.className = 'account-row';
      const text = document.createElement('span');text.textContent = `${group.name} · ${group.min_selections} a ${group.max_selections} selecciones`;
      const button = document.createElement('button');button.type = 'button';button.className = 'mini-btn';button.textContent = 'Editar';button.addEventListener('click',() => edit(group));
      container.append(text,button);byId('modifierList').append(container);
    });
  }
  function assignments(selected = []) {
    const container = byId('productModifiers');container.replaceChildren();
    groups.forEach(group => {
      const label = document.createElement('label');label.className = 'variant-switch';
      const input = document.createElement('input');input.type = 'checkbox';input.value = group.id;input.checked = selected.includes(group.id);
      label.append(input,document.createTextNode(`${group.name} (${group.min_selections === 0 ? 'opcional' : 'obligatorio'})`));container.append(label);
    });
    if (!groups.length) container.textContent = 'Puedes crear grupos de opciones en Configuración.';
  }
  function initialize() {
    edit(null,false);byId('newModifier').addEventListener('click',() => edit());
    byId('addModifierOption').addEventListener('click',() => {if (byId('modifierOptions').children.length < 30) row();});
    byId('modifierForm').addEventListener('submit',async event => {
      event.preventDefault();if (!App.auth.isAdmin()) return;
      const form = event.currentTarget,button = form.querySelector('[type="submit"]');if (button.disabled) return;button.disabled = true;
      try {
        const data = {name:form.elements.name.value.trim(),min_selections:Number(form.elements.min_selections.value),max_selections:Number(form.elements.max_selections.value),options:[...byId('modifierOptions').children].map(el => ({...(el.dataset.id ? {id:el.dataset.id} : {}),name:el.querySelector('[data-field="name"]').value.trim(),price:Number(el.querySelector('[data-field="price"]').value),available:el.querySelector('[data-field="available"]').checked}))};
        await App.api('/modificadores' + (editingId ? '/' + editingId : ''),{method:editingId ? 'PUT' : 'POST',body:JSON.stringify(data)});
        await load();await App.products.loadCatalog();edit();byId('modifierMessage').textContent = 'Opciones guardadas. Asígnalas a los productos desde Editar.';
      } catch (error) {byId('modifierMessage').textContent = error.message;}finally {button.disabled = false;}
    });
  }
  App.modifiers = {initialize,load,assignments};
})(window.BustersAdmin);
