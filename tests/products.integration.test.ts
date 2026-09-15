import { adminFixture } from "./auth-fixture";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";

// Prueba de integración: crea un producto temporal y elimina solo ese registro.
test("CRUD de productos, validación y registros inexistentes", { timeout: 60000 }, async () => {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/productos`;
  let createdId: string | undefined;
  let categoryId: string | undefined;
  const auth = await adminFixture();
  const request = (method: string, path = "", body?: unknown) => fetch(base + path, {
    method,
    headers: auth.headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const product = {
    name: `Prueba CRUD ${randomUUID()}`,
    description: "Registro temporal de prueba",
    price: 12.50,
    image: "https://example.com/producto.png",
    category: `Pruebas ${randomUUID()}`,
  };
  try {
    const category = await prisma.categories.create({ data: { name: product.category } });
    categoryId = category.id;
    const list = await request("GET");
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(await list.json()));
    assert.equal((await request("GET", "/invalid")).status, 400);
    for (const body of [{}, { ...product, price: -1 }, { ...product, price: 1.234 },
      { ...product, price: 100000000 }, { ...product, name: " " },
      { ...product, available: "false" }, { ...product, id: randomUUID() }]) {
      assert.equal((await request("POST", "", body)).status, 400);
    }
    const malformed = await fetch(base, {
      method: "POST", headers: auth.headers, body: "{",
    });
    assert.equal(malformed.status, 400);
    const missing = `/${randomUUID()}`;
    for (const method of ["GET", "DELETE", "PATCH", "PUT"]) {
      const body = method === "PATCH" ? { price: 10 } : method === "PUT" ? { ...product, available: true } : undefined;
      assert.equal((await request(method, missing, body)).status, 404);
    }
    const created = await request("POST", "", product);
    assert.equal(created.status, 201);
    const saved = await created.json();
    createdId = saved.id;
    assert.equal(typeof createdId, "string");
    assert.equal(created.headers.get("location"), `/productos/${createdId}`);
    assert.equal(saved.available, true);
    assert.equal(Number(saved.price), 12.50);
    const path = `/${createdId}`;
    const found = await request("GET", path);
    assert.equal(found.status, 200);
    assert.equal((await found.json()).name, product.name);
    assert.equal((await request("PATCH", path, {})).status, 400);
    assert.equal((await request("PATCH", path, { created_at: new Date().toISOString() })).status, 400);
    assert.equal((await request("PUT", path, { price: 20 })).status, 400);
    const replaced = await request("PUT", path, { ...product, price: 20, available: false });
    assert.equal(replaced.status, 200);
    assert.equal((await replaced.json()).available, false);
    const patched = await request("PATCH", path, { price: 0 });
    assert.equal(patched.status, 200);
    const updated = await patched.json();
    assert.equal(Number(updated.price), 0);
    assert.equal(updated.available, false);
    assert.equal(updated.name, product.name);
    const deleted = await request("DELETE", path);
    assert.equal(deleted.status, 204);
    assert.equal(await deleted.text(), "");
    // El borrado de la API archiva; la limpieza física ocurre en finally.
    assert.equal((await request("GET", path)).status, 404);
    assert.equal((await request("DELETE", path)).status, 404);
  } finally {
    try {
      if (createdId) await prisma.products.delete({ where: { id: createdId } });
      if (categoryId) await prisma.categories.delete({ where: { id: categoryId } });
    } finally {
      await auth.cleanup();
      server.close();
      await prisma.$disconnect();
    }
  }
});
