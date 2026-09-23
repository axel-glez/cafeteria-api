# Promociones compartidas entre el panel y la app

## Alcance

El administrador puede editar hasta 12 anuncios, reordenarlos, ocultarlos o quitarlos. Los cambios se envían juntos con **Publicar cambios**. Los empleados y clientes no pueden escribir anuncios. La app consulta los activos al abrir el menú y cada 30 segundos mientras la pantalla está activa.

Los anuncios son informativos: no crean productos, variantes, combos comprables ni descuentos. Los precios del carrito y los pedidos conservan su cálculo actual. Los días y horarios son texto, no una programación automática. La app muestra las condiciones completas en «Conocer más» y aclara que no aplica descuentos automáticos.

## Activación (pendiente de ejecutar en el entorno real)

Desde `api`, con `DATABASE_URL` configurada para el entorno correcto:

```powershell
npm run promotions:migrate
npm run promotions:seed
```

1. La migración `009_promotions.sql` crea únicamente `public.promotion_settings`, con RLS y sin acceso directo de `anon` ni `authenticated`. No toca pedidos ni catálogo. Es repetible y no reemplaza anuncios existentes.
2. La carga añade los cuatro anuncios de `content/promotions-2026-09-22.json`, solicitados por el usuario. Conserva los existentes y las ediciones de los mismos IDs. Si se repite, no duplica; si no caben en el límite de 12, revierte sin cambiar datos. Los anuncios añadidos quedan activos.
3. Publicar el backend con su directorio `public/` actualizado. Subir también `content/`, `scripts/` y la migración. No subir `.env`.
4. Verificar `GET /api/v1/promociones` y la sección **Promociones** con una cuenta administradora. Generar e instalar una nueva build de `bustersDog-main/my-app`.

La migración y la carga no se ejecutan automáticamente al arrancar ni durante el build. Se evita que un despliegue sobrescriba contenido.

## Anuncios preparados

- **Lunes en pareja — Matcha y Taro:** 1 Matcha de 16 oz + 1 de 20 oz por $150; o 1 Taro de 16 oz + 1 de 20 oz por $150.
- **Miércoles Frescholes:** smoothie de mango o fresa de 12 oz por $46.
- **Viernes de mal tercio — 3×2:** solo de 2 a 3 pm; compra 2 bebidas y recibe una igual, tamaño mediano, gratis. Café Moka, Café Frappe, Latte, Capuchino y Americano.
- **Chamoyada de mango:** 20 oz con banderilla de tamarindo y gomita de topping, $65.

Usan el fondo genérico de café, no fotografías específicas de esos productos. El panel permite sustituirlo.

## Contrato

- `GET /api/v1/promociones`: público, `{ "items": [...] }`, solo activos y en orden. No requiere sesión de compra.
- `GET /promociones`: sesión administrativa; devuelve `items`, `revision`, `updated_at` e `image_origins`.
- `PUT /promociones`: sesión administrativa, `Content-Type: application/json`, `X-Cafe-Request: 1`, cuerpo `{ "items": [...], "expected_revision": 0 }`. Devuelve el estado nuevo. Revisión antigua: HTTP 409. Datos inválidos: 400. Sin migración: 503.
- Cada anuncio: `id` UUID, `label` (1–25 caracteres), `title` (1–70), `description` (1–180), `image` (hasta 1000, puede ser vacía), `active` booleano. IDs únicos; hasta 12 anuncios.
- Imágenes: el panel permite subir archivos JPG, PNG y WebP de hasta 4 MB mediante el servicio global `POST /archivos`. Los archivos se guardan en `media_files` y se sirven públicamente por `GET /api/v1/archivos/:id`. Las rutas antiguas de `assets/` y URLs HTTPS autorizadas siguen siendo compatibles con datos ya existentes.

Antes de desplegar esta función ejecuta una vez `npm run media:migrate` con la misma `DATABASE_URL` del backend.

Si no hay activos, la app oculta el carrusel. Si la consulta falla, usa una bienvenida genérica y descarta los anuncios anteriores; un error de promociones no bloquea compras. Una imagen fallida usa la foto de respaldo.

## Verificación local, sin producción

```powershell
npm run build
npm run test:promotions
npm run test:notes
```

Las pruebas utilizan PostgreSQL en memoria y sustituyen el transporte de base de datos únicamente en el proceso de pruebas. Cubren permisos, validación, orden, ocultación, conflictos, migración repetible, carga de anuncios y seguridad del texto del panel.

Para la revisión visual aislada, exportar la app hacia `dist-preview` con `EXPO_PUBLIC_API_URL=http://127.0.0.1:5182` y `--clear` (evita reutilizar la URL del caché de Metro). Después, desde `api`, ejecutar `npx tsx scripts/preview-design-local.ts`. La app se sirve en `127.0.0.1:5181` y el panel en `127.0.0.1:5182`.

Ese servidor es exclusivamente de prueba: usa una sesión administrativa temporal automática en localhost y PostgreSQL en memoria, con un producto ficticio. No ejecutarlo como servidor público ni usarlo para desplegar. Al detenerlo se pierde la base temporal. El arranque de producción sigue siendo `src/server.ts`.
