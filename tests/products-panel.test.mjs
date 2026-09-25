import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

test('un administrador puede abrir productos sin categorías y crear la primera', async () => {
  const node = (value = '') => ({
    value,
    disabled: false,
    hidden: false,
    innerHTML: '',
    textContent: '',
    addEventListener() {},
  });
  const nodes = new Map([
    ['catalogStatus', node()],
    ['retryCatalog', node()],
    ['categoryTabs', node()],
    ['productCount', node()],
    ['exhaustedProductCount', node()],
    ['availabilityFilter', node('todos')],
  ]);
  const category = node();
  const elements = {
    newProductButton: node(),
    newProductMobileButton: node(),
    menuFilter: node('todos'),
    menuSearch: node(),
    productForm: { elements: { category } },
    productGrid: node(),
    menuProductGrid: node(),
    globalSearch: node(),
  };
  const calls = [];
  const App = {
    data: { products: [], categoryLabels: {} },
    elements,
    auth: { isSignedIn: () => true, isAdmin: () => true },
    api: async (route, options) => {
      calls.push({ route, options });
      if (route === '/productos') return [];
      if (route === '/categorias' && !options) return [];
      if (route === '/assets/image-origins.json') return [];
      if (route === '/categorias' && options?.method === 'POST') {
        return { id: '10000000-1000-4000-8000-100000000001', name: JSON.parse(options.body).name };
      }
      throw new Error('Petición inesperada: ' + route);
    },
  };
  const document = {
    getElementById: id => nodes.get(id) || node(),
    querySelector: () => null,
    querySelectorAll: () => [],
  };

  runInNewContext(readFileSync(new URL('../public/js/features/products.js', import.meta.url), 'utf8'), {
    window: { BustersAdmin: App }, document, URL,
  });

  await App.products.loadCatalog();
  assert.equal(elements.newProductButton.disabled, false);
  assert.equal(elements.newProductMobileButton.disabled, false);
  assert.match(nodes.get('catalogStatus').textContent, /Nuevo producto/);

  const created = await App.products.createCategory('Bebidas calientes');
  assert.equal(created.name, 'Bebidas calientes');
  assert.equal(category.value, 'Bebidas calientes');
  const request = calls.find(call => call.options?.method === 'POST');
  assert.equal(request.route, '/categorias');
  assert.deepEqual(JSON.parse(request.options.body), { name: 'Bebidas calientes' });
});
