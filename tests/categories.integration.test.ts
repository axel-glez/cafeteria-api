import { adminFixture } from "./auth-fixture";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";

test("CRUD de categorías, relación con productos y protección de borrado", { timeout: 60000 }, async () => {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const auth = await adminFixture();
  const request = (method: string, path: string, body?: unknown) => fetch(base + path, {
    method, headers: auth.headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const name = `Categoría temporal ${randomUUID()}`;
  let categoryId: string | undefined;
  let secondCategoryId: string | undefined;
  let productId: string | undefined;
  try {
    const list = await request("GET", "/categorias");
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(await list.json()));
    assert.equal((await request("GET", "/categorias/invalido")).status, 400);
    for (const body of [{}, { name: " " }, { name: 123 }, { name, id: randomUUID() }]) {
      assert.equal((await request("POST", "/categorias", body)).status, 400);
    }
    const missing = `/categorias/${randomUUID()}`;
    for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
      assert.equal((await request(method, missing, method === "PUT" || method === "PATCH" ? { name } : undefined)).status, 404);
    }
    assert.equal((await request("GET", `${missing}/productos`)).status, 404);

    const created = await request("POST", "/categorias", { name });
    assert.equal(created.status, 201);
    categoryId = (await created.json()).id;
    assert.equal(typeof categoryId, "string");
    const path = `/categorias/${categoryId}`;
    assert.equal(created.headers.get("location"), path);
    assert.equal((await request("POST", "/categorias", { name })).status, 409);
    assert.deepEqual(await (await request("GET", `${path}/productos`)).json(), []);

    const product = {
      name: `Producto temporal ${randomUUID()}`, description: "Prueba de categorías",
      price: 5, image: "https://example.com/test.png", category: name,
    };
    assert.equal((await request("POST", "/productos", { ...product, category: randomUUID() })).status, 409);
    const createdProduct = await request("POST", "/productos", product);
    assert.equal(createdProduct.status, 201);
    productId = (await createdProduct.json()).id;
    assert.equal(typeof productId, "string");
    assert.equal((await request("DELETE", path)).status, 409);
    assert.equal((await request("PATCH", `/productos/${productId}`, { category: randomUUID() })).status, 409);
    assert.equal((await request("PATCH", path, {})).status, 400);

    const renamed = `${name} editada`;
    assert.equal((await request("PUT", path, { name: renamed })).status, 200);
    const readProduct = await request("GET", `/productos/${productId}`);
    assert.equal((await readProduct.json()).category, renamed);
    const members = await request("GET", `${path}/productos`);
    assert.equal(members.status, 200);
    assert.deepEqual((await members.json()).map((p: { id: string }) => p.id), [productId]);
    assert.equal((await request("PATCH", path, { name })).status, 200);
    assert.equal((await (await request("GET", path)).json()).name, name);
    assert.equal((await (await request("GET", `/productos/${productId}`)).json()).category, name);

    const second = await request("POST", "/categorias", { name: `${name} segunda` });
    assert.equal(second.status, 201);
    secondCategoryId = (await second.json()).id;
    assert.equal((await request("PATCH", path, { name: `${name} segunda` })).status, 409);
    assert.equal((await (await request("GET", `/productos/${productId}`)).json()).category, name);
    assert.equal((await request("PATCH", `/productos/${productId}`, { category: `${name} segunda` })).status, 200);
    assert.equal((await request("DELETE", path)).status, 204);
    categoryId = undefined;
    assert.equal((await request("GET", path)).status, 404);
    assert.equal((await request("DELETE", path)).status, 404);
    assert.equal((await request("DELETE", `/categorias/${secondCategoryId}`)).status, 409);
    assert.equal((await request("DELETE", `/productos/${productId}`)).status, 204);
    await prisma.products.delete({where:{id:productId}});
    productId = undefined;
    const deleted = await request("DELETE", `/categorias/${secondCategoryId}`);
    assert.equal(deleted.status, 204);
    assert.equal(await deleted.text(), "");
    secondCategoryId = undefined;
  } finally {
    try {
      if (productId) await prisma.products.delete({ where: { id: productId } });
      if (categoryId) await prisma.categories.delete({ where: { id: categoryId } });
      if (secondCategoryId) await prisma.categories.delete({ where: { id: secondCategoryId } });
    } finally {
      await auth.cleanup();
      server.close();
      await prisma.$disconnect();
    }
  }
});
