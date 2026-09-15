/* =========================================================
   NAVEGACIÓN
   Cambio entre Inicio, Pedidos, Menú, Ventas y Configuración.
   ========================================================= */

(function initializeNavigationFeature(App) {
  const elements = App.elements;

  function showView(viewName) {
    if (!App.auth.isSignedIn() || (!App.auth.isAdmin() && !['pedidos', 'menu'].includes(viewName))) return;
    const targetView = document.getElementById(`view-${viewName}`);
    const targetNavItem = document.querySelector(
      `.nav-item[data-view="${viewName}"]`,
    );

    if (!targetView || !targetNavItem) return;

    document
      .querySelectorAll('.nav-item')
      .forEach((item) => item.classList.remove('active'));
    targetNavItem.classList.add('active');

    document
      .querySelectorAll('.content')
      .forEach((section) => section.classList.remove('active-view'));
    targetView.classList.add('active-view');

    elements.sidebar.classList.remove('open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function initializeLinks() {
    document.querySelectorAll('.nav-item[data-view]').forEach((button) => {
      button.addEventListener('click', () => showView(button.dataset.view));
    });

    document.querySelectorAll('[data-go]').forEach((button) => {
      button.addEventListener('click', () => showView(button.dataset.go));
    });
  }

  function initializeMobileMenu() {
    elements.menuToggle.addEventListener('click', () => {
      elements.sidebar.classList.toggle('open');
    });
  }

  function initialize() {
    initializeLinks();
    initializeMobileMenu();
  }

  App.navigation = {
    showView,
    initialize,
  };
})(window.BustersAdmin);
