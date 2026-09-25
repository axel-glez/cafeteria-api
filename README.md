# Buster’s: API y panel administrativo

Backend Express 5 con TypeScript, PostgreSQL y Prisma 7. Incluye panel administrativo, catálogo, cuentas del personal y pedidos anónimos. También ofrece Socket.IO, promociones, apertura/cierre y notificaciones Expo Push.

## 1. Instalar los programas necesarios

Instala [Node.js 24 con npm](https://nodejs.org/en/download) y [PostgreSQL 18](https://www.postgresql.org/download/) con sus herramientas de línea de comandos. Inicia el servicio PostgreSQL y conserva la contraseña del usuario local `postgres`.

En Windows, abre el instalador de Node.js, deja las opciones predeterminadas y termina la instalación. En el instalador de PostgreSQL selecciona **PostgreSQL Server** y **Command Line Tools**, conserva el puerto **5432** y anota la contraseña que elijas para `postgres`. No necesitas instalar las aplicaciones adicionales de Stack Builder. Cierra y vuelve a abrir la terminal tras instalar los programas. Si PostgreSQL no está iniciado, pulsa Win+R, escribe `services.msc`, busca el servicio cuyo nombre empieza con `postgresql` y usa **Iniciar**.

## 2. Abrir el proyecto e instalar sus dependencias

Descarga el ZIP del repositorio y extráelo (clic derecho → **Extraer todo**), o clónalo si ya utilizas Git. Abre una terminal en la carpeta de este README, junto a `package.json`. Todos los comandos parten de esa carpeta. En Windows, ábrela en el Explorador, escribe `powershell` en la barra de dirección y pulsa Enter. En macOS o Linux, abre Terminal, escribe `cd ` seguido de la ruta de esa carpeta entre comillas y pulsa Enter.

Una terminal es la ventana donde escribes los comandos de esta guía. Copia solo el contenido de cada bloque, ejecuta una línea a la vez y espera a que termine antes de continuar. No cierres las terminales que estén ejecutando servidores.

```sh
node --version
npm --version
psql --version
npm ci --include=dev --ignore-scripts
npx prisma generate --schema prisma/schema.prisma
```

Se omite la sincronización de skills del `postinstall`, innecesaria para ejecutar la aplicación. La generación explícita de Prisma no modifica la base. Si Windows no encuentra `psql`, ejecuta en esa misma terminal y vuelve a intentar:

```powershell
$env:Path += ";C:\Program Files\PostgreSQL\18\bin"
psql --version
```

Si instalaste PostgreSQL en otra ubicación, usa su carpeta `bin`. Si PowerShell bloquea `npm.ps1`, usa `npm.cmd` y `npx.cmd`.

## 3. Configurar el entorno

Copia el archivo [.env.example](.env.example) y llama a la copia **.env**. En Windows puedes hacerlo con `Copy-Item .env.example .env`; en macOS/Linux, con `cp .env.example .env`. Si ya existe un `.env`, edítalo sin sobrescribirlo. Ábrelo con un editor de texto, sustituye la contraseña y guarda los cambios. Comprueba que no se llame `.env.txt`.

Este es el contenido esperado junto a `package.json`:

```dotenv
DATABASE_URL=postgresql://postgres:TU_CLAVE_LOCAL@127.0.0.1:5432/busters_dev
DIRECT_URL=postgresql://postgres:TU_CLAVE_LOCAL@127.0.0.1:5432/busters_dev
PORT=5000
FRONTEND_DIR=public
SERVE_FRONTEND=true
APP_ORIGIN=http://localhost:5000
MOBILE_ORIGINS=http://localhost:8081
NODE_ENV=development
```

Sustituye `TU_CLAVE_LOCAL` por tu contraseña local; codifica sus caracteres especiales para una URL (por ejemplo, `@` como `%40`). No subas `.env` al repositorio.

| Variable | Función |
| --- | --- |
| `DATABASE_URL` | Conexión obligatoria de la API. |
| `DIRECT_URL` | Conexión de las herramientas Prisma; si falta, usan `DATABASE_URL`. |
| `PORT` | Puerto HTTP, 5000 por defecto. |
| `FRONTEND_DIR` | Carpeta del panel, relativa a la carpeta de ejecución. |
| `SERVE_FRONTEND` | `false` desactiva el panel. |
| `APP_ORIGIN` | URL exacta desde la que se usa el panel, sin barra final. |
| `MOBILE_ORIGINS` | Orígenes web autorizados para `/api/v1`, separados por comas. |
| `NODE_ENV` | Usa `development` con HTTP local; producción requiere HTTPS para las cookies. |

## 4. Preparar una base nueva

Ejecuta este procedimiento **una sola vez**. No abras “SQL Shell (psql)” desde el menú de Windows y no pegues las migraciones manualmente: sus rutas dependen de la carpeta desde la que se inició la terminal.

Mantente en la terminal de PowerShell abierta en `cafeadmin\api` y ejecuta este único comando. Pedirá la contraseña de `postgres`; no se muestran caracteres al escribirla:

```powershell
psql -h 127.0.0.1 -U postgres -d postgres -W -v db_name=busters_dev -f scripts/setup-local.sql
```

Espera hasta ver `Base local preparada correctamente.`. El archivo [scripts/setup-local.sql](scripts/setup-local.sql) crea `busters_dev` si todavía no existe, cambia la conexión a esa base y carga todas las migraciones mediante rutas relativas al propio archivo. Si detecta tablas existentes, se detiene sin modificarlas para evitar sobrescribir una base ya utilizada.

La base nueva queda sin productos ni cuentas. No ejecutes `prisma db push` antes ni después de este procedimiento. Si aparece un error, conserva el primer mensaje mostrado y consulta la sección **Solución de problemas** antes de continuar.

La conexión local usa `postgres` para disponer de los permisos que requieren las tablas con RLS. Producción requiere configurar permisos y migraciones por separado; este arranque no necesita credenciales ni datos de producción.

## 5. Crear el administrador y arrancar

En una terminal interactiva, fuera de psql:

```sh
npm run account:create
npm run dev
```

El primer comando solicita un alias ficticio de 3 a 32 caracteres (`a-z`, números, guion o guion bajo), una contraseña de 15 a 128 caracteres y su confirmación. La contraseña no se muestra al escribir. No hay una cuenta predeterminada. Si ya existe un administrador, crea las cuentas adicionales desde el panel.

Deja el servidor abierto y visita el [panel local](http://localhost:5000). Inicia sesión y crea categorías y productos con sus presentaciones y precios. El catálogo inicial está vacío. Detén el servidor con **Ctrl+C**.

Comprueba también:

- [Salud del proceso](http://localhost:5000/health): devuelve `{"status":"ok"}`.
- [Catálogo público](http://localhost:5000/api/v1/catalogo): devuelve JSON con `currency: "MXN"` y el arreglo `products`.

La salud del proceso no comprueba la base: verifica además el catálogo y el inicio de sesión.

Para conectar una app web, agrega el origen exacto de Expo a `MOBILE_ORIGINS` y reinicia la API. En un teléfono usa la IP LAN de la computadora y la misma red Wi-Fi. Las dos APIs del espacio de trabajo usan el puerto 5000: ejecuta una a la vez o cambia `PORT`, `APP_ORIGIN` y la URL de la app.

## 6. Volver a arrancar, compilar y comprobar

Después de la primera instalación, abre una terminal en esta carpeta y ejecuta `npm run dev`. No repitas la creación de la base ni del administrador. Para ejecutar la versión compilada, detén el servidor anterior con Ctrl+C y usa:

```sh
npm run build
npm start
```

Abre de nuevo el panel en el mismo puerto. `npm run build` crea la carpeta `dist`; repítelo si cambias el código fuente.

Para las 29 pruebas aisladas, ejecuta `npm test`: no necesitan PostgreSQL externo. `npm run test:integration` requiere una base de pruebas desechable con el esquema preparado; no lo ejecutes contra producción.

Para preparar las pruebas de integración, repite el bloque SQL del paso 4 sustituyendo **todas** las apariciones de `busters_dev` por `busters_test`. Después, en una terminal nueva de PowerShell, configura la conexión solo para esa terminal (sustituye la contraseña):

```powershell
$env:DATABASE_URL="postgresql://postgres:TU_CLAVE_LOCAL@127.0.0.1:5432/busters_test"
$env:DIRECT_URL=$env:DATABASE_URL
npm run test:integration
```

En macOS/Linux, las dos primeras líneas son `export DATABASE_URL='postgresql://postgres:TU_CLAVE_LOCAL@127.0.0.1:5432/busters_test'` y `export DIRECT_URL="$DATABASE_URL"`. Las seis pruebas de integración se ejecutan secuencialmente porque comparten la base. Cierra esa terminal al terminar para no reutilizar por accidente la conexión de pruebas.

Como alternativa de arranque sin recarga automática:

```sh
npm run start:render
```

`start:render` ejecuta directamente TypeScript y necesita las dependencias de desarrollo. `npm start` ejecuta el JavaScript generado por `npm run build`.

## Solución de problemas

| Síntoma | Acción |
| --- | --- |
| `DATABASE_URL no está definida` | Coloca `.env` junto a `package.json` y ejecuta desde esa carpeta. |
| `PostgreSQL rechazó la contraseña` | La clave de `postgres` en `DATABASE_URL` y `DIRECT_URL` no coincide con la elegida al instalar PostgreSQL. Corrígela en `.env`; si contiene caracteres especiales, codifícalos para URL (`@` → `%40`, `#` → `%23`, `%` → `%25`). |
| Conexión rechazada o contraseña incorrecta | Revisa el servicio PostgreSQL, puerto, contraseña y nombre de base. |
| Tabla inexistente | Completa la preparación SQL; generar Prisma no crea tablas. |
| `Could not open file prisma/sql/...` o `No such file or directory` | Se abrió SQL Shell desde otra carpeta. Sal con `\q` y ejecuta `psql ... -f scripts/setup-local.sql` desde `cafeadmin\api`, como indica el paso 4. |
| `La base ya contiene tablas` | El instalador se detuvo para no sobrescribir datos. Si el proyecto ya funcionaba, no repitas el paso 4. Si fue un intento fallido, revisa la base antes de eliminarla o restaurarla. |
| Cliente Prisma ausente | Repite `npx prisma generate --schema prisma/schema.prisma`. |
| Error al leer `image-origins.json` | Define `FRONTEND_DIR=public` y comprueba `public/assets/image-origins.json`. |
| Puerto ocupado | Detén el otro servidor o cambia `PORT` y `APP_ORIGIN`. |
| CORS en la app web | Autoriza el origen exacto mostrado por Expo, incluido su puerto, y reinicia la API. |
| npm busca un `npm-cli.js` inexistente | Repara Node.js/npm y revisa las rutas de npm en PATH. |

## Estructura

- `src/`: servidor, rutas y lógica del negocio.
- `public/`: panel, estilos e imágenes.
- `prisma/schema.prisma`: modelos; `prisma/sql/`: migraciones.
- `scripts/`: tareas administrativas; `tests/`: verificaciones.

## Documentación adicional

[Guía de uso](GUIA-USO.md), [pruebas](docs/PRUEBAS.md) y [promociones](docs/PROMOCIONES.md).

`EXPO_ACCESS_TOKEN` es opcional para autenticar Expo Push. Los roles `anon` y `authenticated` sin inicio de sesión permiten ejecutar la migración de push fuera de Supabase.

## Verificación de estas instrucciones

Revisión del 24 de septiembre de 2026 con Node.js 24.13.0, npm 11.6.2 y PostgreSQL 18.6:

- Instalación con `npm ci`, generación de Prisma y compilación correctas.
- Preparación SQL ejecutada desde cero con `psql` en una instancia PostgreSQL temporal local.
- Administrador creado mediante `npm run account:create`; inicio de sesión y consulta de la cuenta comprobados por HTTP.
- Arranque compilado con `npm start`: panel, recursos, `/health` y catálogo responden HTTP 200.
- Arranque de desarrollo con `npm run dev`: salud y catálogo responden HTTP 200.
- 29 pruebas aisladas y seis pruebas de integración aprobadas.
- Enlaces internos existentes y enlaces externos de instalación accesibles.

Para evitar interferencias con servicios existentes, la revisión usó puertos temporales. No se modificó la base de datos compartida. El flujo visual del panel y las notificaciones en un dispositivo móvil no forman parte de esta comprobación automatizada.
