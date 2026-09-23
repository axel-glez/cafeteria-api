/* =========================================================
   REFERENCIAS DEL DOM
   Todos los elementos usados por JavaScript están aquí.
   ========================================================= */

(function initializeDomReferences(App) {
  App.elements = {
    sidebar: document.getElementById('sidebar'),
    sidebarBackdrop: document.getElementById('sidebarBackdrop'),
    menuToggle: document.getElementById('menuToggle'),

    productGrid: document.getElementById('productGrid'),
    menuProductGrid: document.getElementById('menuProductGrid'),
    menuFilter: document.getElementById('menuFilter'),
    menuSearch: document.getElementById('menuSearch'),
    globalSearch: document.getElementById('globalSearch'),

    ordersBoard: document.getElementById('ordersBoard'),

    productModal: document.getElementById('productModal'),
    productForm: document.getElementById('productForm'),
    newProductButton: document.getElementById('newProductBtn'),
    newProductMobileButton: document.getElementById('newProductMobileBtn'),
    closeModalButton: document.getElementById('closeModal'),
    cancelModalButton: document.getElementById('cancelModal'),
  };
})(window.BustersAdmin);
