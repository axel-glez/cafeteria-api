# Pruebas de la API

`npm test` ejecuta las pruebas seguras y aisladas: lógica de Socket.IO y push,
panel administrativo y rutas que usan PostgreSQL en memoria con PGlite. No lee
ni modifica la base configurada en el entorno.

`npm run test:integration` ejecuta las pruebas de integración contra una base
PostgreSQL real. Requiere `DATABASE_URL` y `DIRECT_URL` apuntando a una base de
pruebas desechable con las migraciones aplicadas. Estas pruebas crean y eliminan
registros temporales; no deben ejecutarse contra producción.

`npm run build` comprueba TypeScript y genera `dist/`.
