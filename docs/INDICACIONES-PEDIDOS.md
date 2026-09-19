# Indicaciones especiales en pedidos

El cliente puede escribir un comentario opcional para el pedido completo antes
de confirmar. Ejemplo: `Hot dog sin mostaza y hamburguesa sin cebolla`.

## Contrato

`POST /api/v1/pedidos` acepta `notes` como cadena opcional de hasta 500 caracteres.
Se recortan los espacios exteriores. Una cadena vacía o compuesta solo por espacios
equivale a omitir el campo. Se rechazan valores no textuales, `null`, el carácter
nulo y textos que excedan el límite. La API mantiene las cabeceras de sesión e
idempotencia existentes.

```json
{
  "items": [
    { "variant_id": "UUID_DE_LA_PRESENTACION", "quantity": 1, "option_ids": [] }
  ],
  "notes": "Hot dog sin mostaza."
}
```

La respuesta de creación, consulta del cliente y listado/detalle del administrador
incluye `notes`. Los pedidos sin comentario devuelven `""`. El comentario forma parte
del pedido guardado y no cambia al actualizar el estado ni al modificar el catálogo.
No se incluye en las notificaciones push.

Las indicaciones no cambian precios ni complementos. Si hay varios productos,
el cliente puede identificar a cuál se refiere dentro del texto.

## Reintentos y compatibilidad

- El hash del pedido incluye las indicaciones cuando no están vacías.
- Cambiar el comentario reutilizando una clave de idempotencia produce un conflicto
  HTTP 409. Reenviar la misma solicitud recupera el mismo pedido.
- Los pedidos sin comentario conservan la normalización anterior para que los
  reintentos creados por versiones previas sigan siendo válidos.
- La app conserva el texto junto con el carrito y lo bloquea cuando hay un envío
  pendiente de confirmación. Solo lo limpia al confirmar correctamente la compra.
- El panel escapa el texto antes de mostrarlo y conserva saltos de línea. No
  interpreta HTML introducido por el cliente.

## Activación

1. Con `DATABASE_URL` del entorno correcto, ejecutar desde `api/`:

   ```powershell
   npm run notes:migrate
   npx prisma generate --schema prisma/schema.prisma
   npm run build
   ```

2. Publicar backend y panel (`public/`).
3. Generar e instalar una nueva build de la app que incluya este cambio.

La migración `008_order_notes.sql` añade `orders.notes` con valor vacío por defecto
y límite en la base de datos. Es repetible, no borra pedidos y conserva los comentarios
ya existentes. Debe ejecutarse **antes de publicar el backend actualizado**.
Publicar el backend antes que la app: el backend anterior rechaza campos desconocidos.

## Verificación

`npm run test:notes` ejecuta pruebas aisladas de rutas/SQL en memoria y del renderizado
seguro del panel. Desde la app, `npm test` cubre persistencia, límites, reintentos y
compatibilidad con datos locales anteriores. La prueba final en dispositivo consiste
en enviar una indicación, verla en el panel y comprobarla en el seguimiento del pedido.
