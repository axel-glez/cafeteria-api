# Cambio: notificación de pedido listo

Fecha: 22 de septiembre de 2026

## DoD cubierto

Cuando el panel cambia un pedido de `preparing` a `ready`, el backend coloca una notificación durable en la cola y la envía al celular registrado mediante Expo Push.

La notificación ahora muestra:

- El folio tanto en el título como en el cuerpo.
- El nombre del primer producto del pedido.
- La cantidad de productos adicionales cuando el pedido contiene más de una línea.
- Un mensaje claro indicando que el pedido está listo para recogerse.

Ejemplo:

```text
Buster’s · Pedido B-42
Pedido B-42 listo: Matcha 20 oz y 1 producto más. ¡Pasa a recogerlo!
```

Al tocar el aviso se conserva la navegación al detalle del pedido correspondiente.

## Implementación

- El trabajador de notificaciones consulta el nombre guardado en `order_items`; no depende del nombre actual del catálogo.
- La información sensible de sesión no se incluye en el aviso.
- Se conserva la cola con reintentos y validación del token del dispositivo.
- No fue necesaria una migración adicional.
- No fue necesario cambiar la app móvil; el registro del dispositivo y la apertura del pedido ya estaban implementados.

## Verificación

- Compilación TypeScript del backend: correcta.
- Verificación directa del mensaje: folio, nombre del producto y estado “listo” presentes.
- La ejecución de la suite TypeScript mediante `tsx` continúa bloqueada por el error de memoria del runtime local; no es un error de compilación ni de la lógica modificada.
