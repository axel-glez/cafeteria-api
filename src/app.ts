import path from "node:path";
import { mobileCors } from "./lib/mobile-cors";
import { mobileRouter, ordersRouter } from "./routes/orders";
import { modifiersRouter } from "./routes/modifiers";
import { ApiError } from "./lib/catalog";
import { readFileSync } from "node:fs";
import { authRouter, requireSession, requireAdmin, productPermission } from "./routes/auth";
import express, { type ErrorRequestHandler } from "express";
import { Prisma } from "./generated/prisma/client";
import { ZodError } from "zod";
import { productsRouter } from "./routes/products";
import { categoriesRouter } from "./routes/categories";

const frontendDir = process.env.FRONTEND_DIR || path.resolve(process.cwd(), '../../cafeadmin/cafeteria-admin');
const serveFrontend = process.env.SERVE_FRONTEND !== 'false';
const imageOrigins: string[] = serveFrontend ? JSON.parse(readFileSync(path.join(frontendDir, 'assets/image-origins.json'), 'utf8')) : [];
for (const origin of imageOrigins) {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password) throw new Error('Dominio de imagen inválido');
}
export const app = express();

app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Cache-Control': 'no-store', 'Cross-Origin-Embedder-Policy': 'credentialless',
    'Content-Security-Policy': `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' ${imageOrigins.join(' ')}; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'` });
  if (process.env.NODE_ENV === 'production') res.set('Strict-Transport-Security', 'max-age=31536000');
  next();
});
app.use(mobileCors);
app.get('/health', (_req, res) => { res.json({ status: 'ok' }); });
// Solo el front del mismo origen. Los métodos de escritura exigen JSON y cabecera propia.
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) { next(); return; }
  const origin = req.get('origin');
  const allowed = process.env.APP_ORIGIN || `http://localhost:${process.env.PORT || 5000}`;
  if ((origin && origin !== allowed && !res.locals.mobileOriginAllowed) || req.get('X-Cafe-Request') !== '1' || req.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json' || (req.get('sec-fetch-site') === 'cross-site' && !res.locals.mobileOriginAllowed)) {
    res.status(403).json({ error: 'Solicitud no autorizada' }); return;
  }
  next();
});
app.use(express.json({ limit: '16kb' }));
app.use('/auth', authRouter);

app.use("/api/v1", mobileRouter);
app.use("/pedidos", requireSession, ordersRouter);
app.use("/modificadores", requireSession, modifiersRouter);
app.use("/productos", requireSession, productPermission, productsRouter);
app.use(["/categorias", "/categories"], requireSession, (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') next(); else requireAdmin(req, res, next);
}, categoriesRouter);
if (serveFrontend) app.use(express.static(frontendDir, { dotfiles: 'deny', index: 'index.html' }));
app.use((_req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

const handleError: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof ApiError) { if(error.status===429) res.set('Retry-After','60'); res.status(error.status).json({error:error.message,...(error.code?{code:error.code}:{})}); return; }
  if (['23505','23503','23514','55P03','40P01'].includes(error?.code)) { res.status(409).json({error:'Los datos cambiaron o entran en conflicto. Actualiza e intenta de nuevo'}); return; }
  const isCategoryRoute = /^\/(categorias|categories)(\/|$)/.test(req.path);
  if (error instanceof ZodError) {
    res.status(400).json({
      error: "Datos inválidos",
      details: error.issues.map((issue) => ({
        field: issue.path.join("."), message: issue.message,
      })),
    });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") {
      res.status(404).json({ error: isCategoryRoute ? "Categoría no encontrada" : "Producto no encontrado" });
      return;
    }
    if (error.code === "P2002") {
      res.status(409).json({ error: "Ya existe un registro con ese nombre o identificador" });
      return;
    }
    if (error.code === "P2003") {
      res.status(409).json({ error: isCategoryRoute
        ? "No se puede eliminar una categoría que tiene productos"
        : "El registro está relacionado con otros datos o la categoría no existe" });
      return;
    }
  }
  if (error?.type === "entity.parse.failed") {
    res.status(400).json({ error: "El cuerpo debe contener JSON válido" });
    return;
  }
  if (error?.type === "entity.too.large") {
    res.status(413).json({ error: "El cuerpo de la solicitud es demasiado grande" });
    return;
  }
  console.error("Error interno al procesar la solicitud");
  res.status(500).json({ error: "No se pudo completar la operación" });
};

app.use(handleError);

