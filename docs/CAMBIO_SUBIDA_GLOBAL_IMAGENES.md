# Cambio: subida global de imágenes

Fecha: 22 de septiembre de 2026

## Qué cambió

- El formulario de productos ahora permite elegir una imagen JPG, PNG o WebP desde la computadora.
- El editor de promociones usa el mismo cargador de archivos y muestra una vista previa antes de publicar.
- El backend incluye un servicio administrativo global en `POST /archivos` y sirve las imágenes desde `GET /api/v1/archivos/:id`.
- Las imágenes se guardan en PostgreSQL para que sobrevivan a nuevos despliegues del backend.
- Se conservó compatibilidad con las imágenes antiguas que ya usan rutas de `assets` o URLs autorizadas.

## Seguridad y límites

- Solo un administrador autenticado puede subir archivos.
- Se aceptan únicamente JPG, PNG y WebP, validados también por la firma interna del archivo.
- Tamaño máximo por imagen: 4 MB.
- Capacidad total inicial: 50 MB.
- Los archivos abandonados durante más de 24 horas se limpian al realizar una nueva subida.

## Migración aplicada

La migración `010_media_files.sql` se aplicó correctamente el 22 de septiembre de 2026 sobre la base de datos configurada del backend.

- Tabla comprobada: `public.media_files`.
- Productos activos después de la migración: 67.
- Pedidos conservados después de la migración: 50.
- Configuración de promociones conservada: 1 registro.

Todavía se debe subir el backend actualizado y generar una nueva build de la app para que las promociones con archivos nuevos se visualicen en los clientes.

## Verificación realizada

- Compilación TypeScript del backend: correcta.
- Comprobación TypeScript de la app: correcta.
- Sintaxis JavaScript del panel: correcta.
- Pruebas del editor de promociones: 4 correctas.
- La prueba integral en memoria quedó bloqueada por un error de memoria del runtime local al iniciar `tsx`; no fue un fallo funcional de la aplicación.
