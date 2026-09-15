# Productos en Postman

URL base: `http://localhost:5000`. Inicia la API con `npm run dev`.

| Método | Ruta | Resultado |
| --- | --- | --- |
| GET | /productos | 200: lista de productos |
| GET | /productos/:id | 200: un producto |
| POST | /productos | 201: producto creado |
| PUT | /productos/:id | 200: actualiza todos los campos editables |
| PATCH | /productos/:id | 200: actualiza solo los campos enviados |
| DELETE | /productos/:id | 204: producto eliminado, sin cuerpo |

En Postman selecciona **Body → raw → JSON** para POST, PUT y PATCH.
Ejemplo para POST y PUT:

```json
{
  "name": "Café americano",
  "description": "Café caliente de 355 ml",
  "price": 35.50,
  "image": "https://example.com/cafe.jpg",
  "category": "Bebidas",
  "available": true
}
```

Copia el `id` de la respuesta del POST y sustituye `:id` en las demás rutas.
La categoría enviada en `category` debe existir en `/categorias` y coincidir
exactamente con su `name`. Si no existe, la API devuelve 409.
POST permite omitir `available` (se guarda `true`). PUT exige todos los campos.
PATCH acepta uno o varios campos; por ejemplo `{"price": 40, "available": false}`.
`id` y `created_at` se generan automáticamente y no se aceptan en el cuerpo.
El precio se envía como número no negativo, con hasta dos decimales y máximo
99999999.99. En las respuestas Prisma lo serializa como texto para conservar
la precisión decimal. `image` acepta una URL o ruta no vacía.

Los datos inválidos y los UUID incorrectos devuelven 400; un producto inexistente
devuelve 404; un conflicto de datos, 409. Los errores de validación incluyen
`details` con el campo y el mensaje. DELETE elimina el registro definitivamente.

## Verificación

`node node_modules/typescript/bin/tsc --noEmit`

`node --import tsx --test tests/products.integration.test.ts tests/categories.integration.test.ts`

Las pruebas de integración usan la base configurada en `.env`, crean productos
y categorías temporales y eliminan únicamente esos registros al terminar.

## Categorías en Postman

También puedes usar `/categories` en todas las rutas de categorías.
Para listar las categorías: `GET http://localhost:5000/categories`.
La respuesta incluye `id`, `name` y `created_at` de cada categoría.

Para filtrar productos, usa `GET http://localhost:5000/productos?category=Bebidas`.
En Postman, en **Params**, agrega la clave `category` y como valor el `name`
exacto de la categoría obtenida. Sin ese parámetro se listan todos los productos;
si no hay coincidencias se devuelve `[]`. Un filtro vacío o repetido devuelve 400.

También puedes usar el ID: `GET http://localhost:5000/categories/:id/products`.
Sustituye `:id` por el ID recibido; las rutas anteriores en español siguen disponibles.

| Método | Ruta | Resultado |
| --- | --- | --- |
| GET | /categorias | 200: lista ordenada por nombre |
| GET | /categorias/:id | 200: una categoría |
| GET | /categorias/:id/productos | 200: productos de la categoría |
| POST | /categorias | 201: categoría creada |
| PUT o PATCH | /categorias/:id | 200: renombra la categoría |
| DELETE | /categorias/:id | 204: elimina una categoría vacía |

Para crear o renombrar, usa **Body → raw → JSON**:

```json
{ "name": "Bebidas" }
```

El nombre es obligatorio, no puede estar vacío y debe ser único (distingue
mayúsculas y minúsculas). Los espacios exteriores se eliminan al recibirlo.
No se aceptan `id`, `created_at` ni otros campos en el cuerpo.

Primero crea la categoría y después envía su nombre en `category` al crear o
actualizar un producto. Al renombrar una categoría, los productos asociados
cambian automáticamente su campo `category`. El ID de la categoría se conserva.
DELETE devuelve 409 si hay productos asociados: asígnalos a otra categoría antes
de eliminarla. Un nombre duplicado devuelve 409, un ID inexistente 404 y los
datos inválidos 400.

## Migración de categorías aplicada

`prisma/sql/001_categories.sql` crea la tabla con RLS habilitado, importa los
nombres existentes y agrega una clave foránea sobre `products.category`, con
actualización en cascada y borrado restringido. Se conserva el contrato de la API:
los productos usan el nombre de la categoría, no un nuevo `category_id`.

`node scripts/migrate-categories.mjs` ejecuta esta migración **una sola vez**
sobre una base que todavía no tenga `categories`. Usa una transacción y compara
la cantidad y una huella de todos los productos antes y después; si detecta un
cambio, revierte. No se debe repetir sobre la base actual, donde ya se aplicó.
No habilita acceso público a categorías mediante la API de Supabase; estas rutas
usan la conexión del backend, igual que productos.
