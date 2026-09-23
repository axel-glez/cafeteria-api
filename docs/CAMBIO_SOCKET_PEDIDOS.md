# Backend: estados de pedidos con Socket.IO

Fecha: 22 de septiembre de 2026

## Arquitectura

- Express y Socket.IO comparten un único `http.Server` en `src/server.ts`.
- Cada pedido utiliza una room privada por identificador: `order:<uuid>`.
- `join-order` y `leave-order` rechazan identificadores que no sean UUID válidos.
- El backend emite `order-status-updated` únicamente después de confirmar la transacción PostgreSQL.
- El payload contiene `orderId`, `status` y `updatedAt`.
- Se emite tanto para cambios del panel como para cancelaciones del estudiante.

## Notificaciones

La cola durable de Expo Push no fue reemplazada ni duplicada. El cambio administrativo sigue creando el mismo push job dentro de la transacción y, después del commit, realiza en paralelo las dos funciones independientes:

1. Emisión Socket.IO para una app abierta.
2. Procesamiento normal del push para segundo plano o app cerrada.

No requiere migración de base de datos.

## Verificación

- Compilación TypeScript correcta.
- Pruebas de Socket.IO y push: 3 aprobadas.
- Prueba real cliente-servidor: conexión, `join-order`, room y recepción de `order-status-updated` correctas.
- Se confirmó que el payload no acepta estados ajenos al modelo actual.
