# Publicar la API en Render

1. Sube esta carpeta al repositorio de la API, incluyendo package-lock.json, prisma y certs. No subas .env ni node_modules.
2. En Render crea un Blueprint conectado al repositorio: render.yaml configura un Web Service gratuito. Si esta carpeta está dentro de otro repositorio, configura su Root Directory o mueve el Blueprint a la raíz y añade rootDir.
3. Configura DATABASE_URL con la conexión de Supabase que ya usa la API. Guárdala únicamente en Environment de Render, nunca en el código ni en la app de tus compañeros.
4. En MOBILE_ORIGINS coloca los orígenes web exactos de tus compañeros, separados por comas, sin barra final; por ejemplo http://localhost:5173,http://localhost:8081. Una app nativa no necesita CORS. No uses *.
5. Despliega y comprueba GET /health y GET /api/v1/catalogo en la URL que asigne Render. /health verifica el servidor; /api/v1/catalogo verifica además la base de datos.

## Configuración manual equivalente

- Runtime: Node
- Build: `npm ci --include=dev --ignore-scripts && npx prisma generate --schema prisma/schema.prisma && npm run build`
- Start: `npm run start:render`
- Health Check Path: `/health`
- Variables: `NODE_VERSION=24.13.0`, `NODE_ENV=production`, `SERVE_FRONTEND=true`, `DATABASE_URL` y `MOBILE_ORIGINS`.

El arranque usa tsx sin modo watch para resolver los imports TypeScript actuales. El build comprueba tipos. La generación de Prisma no ejecuta migraciones ni cambia la base de datos. Se usa la base existente, que debe tener ya las tablas del catálogo y pedidos.

Para la función de apertura/cierre, ejecutar `npm run cafe:migrate` contra la base
del entorno **antes de desplegar el nuevo backend**. Después actualizar la app.
El procedimiento y los contratos están en [docs/APERTURA-CIERRE.md](docs/APERTURA-CIERRE.md).

## Para los compañeros

Sustituye localhost o la IP local por la URL HTTPS asignada por Render, conservando el prefijo /api/v1 donde corresponda. Ejemplo ilustrativo: https://NOMBRE-REAL.onrender.com/api/v1/catalogo.

Los POST requieren Content-Type: application/json y X-Cafe-Request: 1. Crear sesión: POST /api/v1/sesiones con cuerpo {}. Las rutas de pedidos protegidas usan Authorization: Bearer con el token recibido; conserva también los requisitos de Idempotency-Key de la API. Nunca compartas DATABASE_URL.

Este despliegue sirve la API y el panel desde public/. La URL raíz abre el inicio de sesión. RENDER_EXTERNAL_URL identifica el origen permitido en Render; APP_ORIGIN permite configurarlo explícitamente. Para actualizar el panel, copia index.html, assets, css y js desde cafeteria-admin a public y sube los cambios. Las rutas administrativas mantienen su autenticación. Render gratuito se suspende tras 15 minutos sin tráfico y la primera petición posterior puede tardar en responder.

