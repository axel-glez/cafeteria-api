import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { catalogInclude, serializeProduct } from "../lib/catalog.js";

const categoryId = z.uuid({ error: "El ID debe ser un UUID válido" });
const categoryBody = z.strictObject({
  name: z.string().trim().min(1, "El nombre no puede estar vacío"),
});

export const categoriesRouter = Router();

categoriesRouter.get("/", async (_req, res) => {
  res.json(await prisma.categories.findMany({ orderBy: { name: "asc" } }));
});

categoriesRouter.get("/:id", async (req, res) => {
  const id = categoryId.parse(req.params.id);
  res.json(await prisma.categories.findUniqueOrThrow({ where: { id } }));
});

categoriesRouter.get(["/:id/productos", "/:id/products"], async (req, res) => {
  const id = categoryId.parse(req.params.id);
  const category = await prisma.categories.findUniqueOrThrow({ where: { id } });
  res.json((await prisma.products.findMany({
    where: { category_id: category.id, archived: false },
    include: catalogInclude,
    orderBy: [{ created_at: "desc" }, { id: "asc" }],
  })).map(serializeProduct));
});

categoriesRouter.post("/", async (req, res) => {
  const data = categoryBody.parse(req.body);
  const category = await prisma.categories.create({ data });
  res.location(`${req.baseUrl}/${category.id}`).status(201).json(category);
});

// Solo name es editable, por lo que PUT y PATCH aceptan el mismo cuerpo.
categoriesRouter.route("/:id").put(async (req, res) => {
  const id = categoryId.parse(req.params.id);
  const data = categoryBody.parse(req.body);
  res.json(await prisma.categories.update({ where: { id }, data }));
}).patch(async (req, res) => {
  const id = categoryId.parse(req.params.id);
  const data = categoryBody.parse(req.body);
  res.json(await prisma.categories.update({ where: { id }, data }));
});

categoriesRouter.delete("/:id", async (req, res) => {
  const id = categoryId.parse(req.params.id);
  // La clave foránea impide borrar categorías en uso, incluso con peticiones concurrentes.
  await prisma.categories.delete({ where: { id } });
  res.status(204).end();
});
