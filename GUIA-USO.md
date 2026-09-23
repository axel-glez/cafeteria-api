# Guía de uso de la API y el panel administrativo

## Qué incluye este repositorio

- API pública para catálogo, estado de la cafetería, promociones y pedidos.
- Panel administrativo servido desde `public/`.
- Actualizaciones en tiempo real con Socket.IO para pedidos y catálogo.
- Cola durable de notificaciones de pedido listo mediante Expo Push.
- Prisma y migraciones SQL para PostgreSQL.

## Operación diaria del panel

Abre el origen donde esté desplegada la API. En producción, el panel y la API
comparten el mismo dominio.

### Iniciar sesión

Usa el alias y la contraseña entregados por el administrador. No compartas la
cuenta ni guardes contraseñas en el repositorio. Los permisos dependen del rol:

- **Empleado:** consulta pedidos y puede cambiar disponibilidad.
- **Administrador:** además puede gestionar catálogo, promociones, opciones y
  cuentas de acceso.

### Abrir o cerrar la cafetería

El control superior indica si se aceptan pedidos nuevos. Cerrar la cafetería no
elimina pedidos ni impide terminar los que ya existen. Antes de cambiarlo,
confirma que la acción corresponde al turno actual.

### Gestionar pedidos

1. Entra en **Pedidos**.
2. Revisa el folio, hora, productos, total e indicaciones especiales.
3. Avanza el pedido por los estados disponibles.
4. Al marcarlo como listo, el backend conserva el flujo actual de notificación
   push y también informa a la app abierta mediante Socket.IO.
5. Marca como entregado únicamente después de completar la entrega.

El panel recibe pedidos nuevos y cambios por Socket.IO. El botón de actualizar
permanece disponible como respaldo.

### Gestionar el menú

En **Menú** puedes buscar, filtrar y editar productos. Un producto puede tener
una o varias presentaciones, cada una con precio y disponibilidad propios.

- **Marcar agotado** impide nuevas compras sin borrar el producto ni su
  historial.
- Cambiar una variante afecta únicamente esa presentación.
- Cada cambio guardado emite `catalog-updated`; las apps abiertas recargan el
  catálogo automáticamente.
- Archivar es una operación interna para conservar integridad histórica y no
  debe sustituirse por borrado directo en la base.

### Opciones, promociones y cuentas

- Las opciones y complementos se administran desde **Configuración** y se
  asignan posteriormente a los productos.
- Las promociones son anuncios informativos; no cambian precios ni aplican
  descuentos al pedido.
- Crea cuentas con alias ficticios y contraseñas exclusivas para este sistema.
  Entrega el rol de administrador sólo cuando sea necesario.

## Ejecución local

### Requisitos

- Node.js 24.
- npm.
- PostgreSQL de desarrollo.
- Variables en un archivo `.env` local que nunca debe subirse al repositorio.

Variables principales:

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | Conexión de ejecución para Prisma, sesiones y pedidos. |
| `DIRECT_URL` | Conexión directa para herramientas Prisma; si falta, usa `DATABASE_URL`. |
| `PORT` | Puerto HTTP; el valor predeterminado es `5000`. |
| `MOBILE_ORIGINS` | Orígenes web móviles autorizados, separados por comas. |
| `APP_ORIGIN` | Origen explícito del panel cuando no coincide con el servidor. |
| `FRONTEND_DIR` | Sustituye `public/` sólo cuando se necesita otro directorio. |
| `SERVE_FRONTEND` | Usa `false` para ejecutar únicamente la API. |
| `EXPO_ACCESS_TOKEN` | Opcional para autenticar envíos a Expo Push. |

Instala y ejecuta:

```sh
npm ci
npx prisma generate --schema prisma/schema.prisma
npm run dev
```

Rutas de comprobación:

- `GET /health`: salud del proceso.
- `GET /api/v1/catalogo`: catálogo público y estado de la cafetería.
- `/`: panel administrativo cuando `SERVE_FRONTEND` no es `false`.

Las migraciones de `prisma/sql/` deben aplicarse en orden y sobre una base con
respaldo. No ejecutes scripts de migración contra producción sin revisar antes
su documentación específica.

## Pruebas y compilación

```sh
npm run build
npm test
```

`npm test` sólo ejecuta pruebas aisladas, incluidas las que usan PostgreSQL en
memoria. Para las pruebas contra PostgreSQL real:

```sh
npm run test:integration
```

Estas últimas requieren `DATABASE_URL` y `DIRECT_URL` apuntando a una base de
pruebas desechable, nunca a producción. Consulta [docs/PRUEBAS.md](docs/PRUEBAS.md).

## Despliegue

`render.yaml` define el servicio de Render. Al publicar `main`, el servicio
configurado instala dependencias, genera Prisma, compila TypeScript y arranca la
API. Después del despliegue verifica:

1. `GET /health` responde `{"status":"ok"}`.
2. El panel carga sus hojas de estilo y scripts.
3. El catálogo público responde.
4. Un cambio de disponibilidad aparece automáticamente en una app abierta.
5. La creación y el seguimiento de pedidos conservan Socket.IO y push.

El workflow `.github/workflows/api.yml` ejecuta build y pruebas seguras en cada
push o pull request.

## Problemas frecuentes

- **Render tarda en responder:** el plan gratuito puede estar despertando.
- **La app web no conecta:** agrega su origen exacto a `MOBILE_ORIGINS` y
  reinicia la API.
- **El panel no carga localmente:** ejecuta el proceso desde la raíz del
  repositorio o configura `FRONTEND_DIR` explícitamente.
- **Prisma no compila:** ejecuta `npx prisma generate --schema prisma/schema.prisma`.
- **No llega una notificación:** comprueba primero el estado del pedido, el
  token del dispositivo y la cola; Socket.IO no sustituye Expo Push.

