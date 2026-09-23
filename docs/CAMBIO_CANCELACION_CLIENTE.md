# Backend: cancelación de pedido por el cliente

Fecha: 22 de septiembre de 2026

## Endpoint

`PATCH /api/v1/pedidos/:id/cancelacion`

- Requiere la sesión de compra en `Authorization: Bearer`.
- Acepta únicamente un objeto JSON vacío.
- Solo encuentra pedidos pertenecientes a esa sesión.
- Bloquea la fila antes de validar el estado.
- Cambia `new` a `cancelled` y registra el historial.
- Si el pedido ya está en preparación devuelve HTTP 409 con código `ORDER_ALREADY_PREPARING`.
- No elimina información del pedido.

No requiere migración.
