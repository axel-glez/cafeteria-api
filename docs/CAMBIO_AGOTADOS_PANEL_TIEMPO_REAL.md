# Disponibilidad del catálogo y pedidos en tiempo real

## Qué cambió

- El panel ya no ofrece la acción de archivar productos. La disponibilidad se controla con **Marcar agotado** y **Marcar disponible**.
- El panel permite filtrar productos por todos, disponibles o agotados, e Inicio muestra el total de agotados con acceso directo al filtro.
- La sección Ventas simulada quedó fuera de la navegación y oculta temporalmente.
- Los pedidos muestran el tiempo transcurrido y usan textos de avance más claros.
- La API emite `admin-orders-updated` después de crear o actualizar un pedido. El panel actualiza el tablero inmediatamente y conserva la consulta cada 15 segundos como respaldo.
- Al recibir un pedido se muestra un aviso discreto y se intenta reproducir un sonido corto si el navegador lo permite.
- El catálogo móvil conserva productos y variantes con `available=false`; la app los presenta como agotados y bloquea su selección y compra.
- La validación del servidor al confirmar un pedido no cambió: solo acepta productos y variantes disponibles.

## Archivos principales

- API: `src/routes/orders.ts`, `src/lib/socket.ts`.
- Panel: `public/index.html`, `public/js/features/products.js`, `public/js/features/orders.js`, `public/css/pages.css`.
- App: `src/components/ProductCard.tsx`, `src/components/OrderUI.tsx`, `src/app/products/[id].tsx`.

## Operación

No requiere migración de base de datos ni variables de entorno nuevas. `archived` continúa existiendo internamente para bajas históricas, pero ya no se expone como acción en el panel. `available` representa si el producto o la variante se puede pedir.
