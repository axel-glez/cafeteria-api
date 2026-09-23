# API y panel de Buster’s

Backend de catálogo y pedidos, panel administrativo, actualizaciones en tiempo
real con Socket.IO y entrega de notificaciones mediante Expo Push.

La [guía de uso](GUIA-USO.md) explica la operación diaria del panel, la
configuración local, las pruebas y el despliegue.

## Inicio rápido

Requisitos: Node.js 24, npm y una base PostgreSQL de desarrollo con las
migraciones del proyecto aplicadas.

```sh
npm ci
npx prisma generate --schema prisma/schema.prisma
npm run dev
```

El servidor escucha en `http://localhost:5000` por defecto y sirve el panel
desde `public/`. Comprueba su estado en `GET /health`.

No uses credenciales ni copias de la base de producción para desarrollo o
pruebas locales.

