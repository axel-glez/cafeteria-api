# Apertura y cierre manual de la cafetería

El estado es único y persistente en `public.cafe_settings`. Solo una sesión de
administrador puede cambiarlo. Los empleados pueden consultarlo.

## Activación

Desde `api/`, con `DATABASE_URL` configurada para el entorno que se quiere actualizar:

```powershell
npm run cafe:migrate
npx prisma generate --schema prisma/schema.prisma
npm run build
```

Aplicar la migración **antes de publicar este backend**. Después publicar el panel
y la app actualizados. La migración crea la fila con `is_open=true` para conservar
el comportamiento previo; si la fila ya existe, conserva su estado. No borra pedidos
ni productos. No se ejecuta automáticamente al arrancar el servidor.

En Render el panel se sirve desde `api/public/`, cuya copia también está actualizada.
La app nueva exige el campo `cafeteria` en el catálogo: publicar primero el backend.

## Contrato

`GET /api/v1/cafeteria`: público, sin inicio de sesión.

`GET /cafeteria`: requiere sesión de administrador o empleado.

Ambos responden:

```json
{
  "is_open": true,
  "updated_at": "2026-09-18T15:00:00.000Z"
}
```

`GET /api/v1/catalogo` conserva `currency` y `products` y añade `cafeteria` con el
mismo objeto. Cerrar no filtra productos adicionales ni elimina el carrito.

`PATCH /cafeteria`: requiere sesión de administrador, JSON y `X-Cafe-Request: 1`.
Enviar el `updated_at` obtenido en la última consulta:

```json
{
  "is_open": false,
  "expected_updated_at": "2026-09-18T15:00:00.000Z"
}
```

Devuelve el estado guardado. Si otro administrador ya lo cambió, responde
`409 CAFE_STATE_CHANGED`; consultar de nuevo antes de repetir. Una petición sin
sesión devuelve 401 y un empleado que intenta cambiar el estado recibe 403.

## Pedidos y reintentos

- `POST /api/v1/pedidos` consulta el estado dentro de la transacción y devuelve
  `409` con `code: "CAFE_CLOSED"` si está cerrada, sin insertar el pedido.
- El estado se lee con `FOR SHARE`: el cierre espera a que terminen los pedidos
  que ya tomaron ese bloqueo. Una vez confirmado el cierre, pedidos posteriores
  ven el estado cerrado. Los pedidos ya aceptados se siguen atendiendo.
- Primero se busca un pedido ya creado con la misma clave de idempotencia.
  Ese reintento devuelve el pedido existente incluso durante el cierre.
- La app conserva el carrito al recibir `CAFE_CLOSED` y libera el envío rechazado.
  Los errores de red de resultado incierto conservan su clave de reintento.
- Si no se puede consultar el estado, no se permite crear un pedido nuevo.

## Actualización visual

Panel y app consultan cada 15 segundos mientras están activos. También actualizan
al recuperar visibilidad o volver a primer plano. El panel permite actualizar a mano;
la app ofrece reintentar cuando no puede consultar el estado. El backend valida
siempre al crear el pedido aunque la pantalla todavía muestre un estado anterior.

## Verificación local aislada

```powershell
npm run test:cafe
npm run build
```

La prueba usa PostgreSQL en memoria (PGlite), aplica la migración real y ejecuta
las rutas reales. Adapta el transporte de consultas y simula únicamente la lectura
de productos de Prisma. No usa `DATABASE_URL` de producción. Comprueba permisos,
reapertura, rechazo de pedidos, persistencia del estado, conflictos y reintentos.
No sustituye una prueba de concurrencia con varias conexiones PostgreSQL reales.
