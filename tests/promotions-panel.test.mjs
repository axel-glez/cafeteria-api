import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';

function fixture() {
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.events = {}; this.attributes = {}; this.textContent = ''; this.value = ''; this.files = []; }
    set innerHTML(_) { throw Error('El panel no debe interpretar HTML de los anuncios'); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    addEventListener(name, fn) { this.events[name] = fn; }
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name]; }
    get lastElementChild() { return this.children.at(-1); }
    querySelectorAll() { return []; }
    querySelector(tag) { return this.children.find(c => c.tag === tag) || this.children.map(c => c.querySelector?.(tag)).find(Boolean); }
    focus() {}
    reportValidity() { return true; }
  }
  const nodes = new Map();
  const byId = id => { if (!nodes.has(id)) nodes.set(id, new Element(id)); return nodes.get(id); };
  let signedIn = true, fail = false, saved = { items: [], revision: 0, image_origins: ['https://www.nespresso.com'] };
  const calls = [];
  const App = {
    auth: { isAdmin: () => signedIn },
    uploadImage: async file => `/api/v1/archivos/${file.id}`,
    api: async (route, options) => {
      calls.push({ route, options });
      if (fail) throw Error('Conflicto');
      if (options) {
        const data = JSON.parse(options.body);
        assert.equal(data.expected_revision, saved.revision);
        saved = { ...saved, items: data.items, revision: saved.revision + 1 };
      }
      return structuredClone(saved);
    },
  };
  runInNewContext(readFileSync(new URL('../public/js/features/promotions.js', import.meta.url), 'utf8'), {
    window: { BustersAdmin: App, confirm: () => true, addEventListener() {} },
    document: { getElementById: byId, createElement: tag => new Element(tag), createTextNode: text => Object.assign(new Element('text'), { textContent: text }) },
    crypto: webcrypto, Uint8Array, URL: Object.assign(URL, { createObjectURL: () => 'blob:preview' }),
  });
  const descendants = el => [el, ...el.children.flatMap(descendants)];
  const all = () => descendants(byId('promotionsList'));
  return { App, byId, calls, all, saved: () => saved, signedOut: () => { signedIn = false; App.promotions.stop(); }, fail: () => { fail = true; } };
}

test('panel: edición es borrador hasta publicar, texto seguro y controles de orden/visibilidad', async () => {
  const h = fixture(); h.App.promotions.initialize(); await h.App.promotions.load();
  h.byId('addPromotion').events.click();
  const fields = h.all().filter(n => n.name);
  for (const field of fields) {
    field.value = field.name.endsWith('-image') ? '' : '<img src=x onerror=alert(1)>';
    field.events.input();
  }
  assert.equal(h.calls.length, 1);
  const toggle = h.all().find(n => n.type === 'checkbox');
  toggle.checked = true; toggle.events.change();
  await h.byId('promotionsForm').events.submit({ preventDefault() {} });
  assert.equal(h.saved().items[0].active, true);
  assert.equal(h.saved().items[0].title, '<img src=x onerror=alert(1)>');
  assert.equal(h.calls[1].options.method, 'PUT');
  assert.equal(h.byId('publishPromotions').disabled, true);
  h.byId('addPromotion').events.click();
  h.all().find(n => n.textContent === '↑ Subir').events.click();
  await h.byId('promotionsForm').events.submit({ preventDefault() {} });
  assert.equal(h.saved().items[0].active, false);
  assert.equal(h.saved().items[1].active, true);
});
test('panel: conflicto bloquea republicación hasta recargar; cerrar sesión vacía el editor', async () => {
  const h = fixture(); h.App.promotions.initialize(); await h.App.promotions.load();
  h.byId('addPromotion').events.click(); h.fail();
  await h.byId('promotionsForm').events.submit({ preventDefault() {} });
  assert.match(h.byId('promotionsMessage').textContent, /Recarga/);
  assert.equal(h.byId('publishPromotions').disabled, true);
  const count = h.calls.length;
  await h.byId('promotionsForm').events.submit({ preventDefault() {} });
  assert.equal(h.calls.length, count);
  h.signedOut(); await h.App.promotions.load();
  assert.equal(h.calls.length, count);
  assert.equal(h.all().filter(n => n.name).length, 0);
});
test('panel: permite elegir un archivo y lo sube al publicar', async () => {
  const h = fixture(); h.App.promotions.initialize(); await h.App.promotions.load();
  h.byId('addPromotion').events.click();
  const field = h.all().find(n => n.type === 'file');
  field.files = [{ id: '10000000-1000-4000-8000-100000000001', name: 'promo.png' }]; field.events.change();
  await h.byId('promotionsForm').events.submit({ preventDefault() {} });
  assert.equal(h.saved().items[0].image, '/api/v1/archivos/10000000-1000-4000-8000-100000000001');
});
test('panel servido contiene los archivos de promociones', () => {
  for (const name of ['index.html', 'js/core/auth.js', 'js/features/promotions.js', 'css/promotions.css']) {
    assert.ok(readFileSync(new URL('../public/' + name, import.meta.url), 'utf8').length > 0);
  }
});
