/* =========================================================
   ESTADO Y DATOS
   Aquí están los productos, pedidos y catálogos base.
   ========================================================= */

window.BustersAdmin = window.BustersAdmin || {};

(function initializeState(App) {
  App.data = {
    categoryLabels: {
      platillo: 'Platillo',
      bebida: 'Bebida',
      snack: 'Snack',
    },

    orderStatuses: [
      { id: 'new', label: 'Nuevos' },
      { id: 'preparing', label: 'Preparando' },
      { id: 'ready', label: 'Listos' },
      { id: 'delivered', label: 'Entregados' },
    ],

    products: [],

    orders: [],
  };
})(window.BustersAdmin);
