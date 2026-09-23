/* =========================================================
   NAVEGACIÓN
   Cambio entre Inicio, Pedidos, Menú y Configuración.
   ========================================================= */

(function initializeNavigationFeature(App) {
  const elements = App.elements;

  function closeMobileMenu({ restoreFocus = false } = {}) {
    if (!elements.sidebar.classList.contains('open')) return;
    elements.sidebar.classList.remove('open');
    elements.sidebarBackdrop.classList.remove('open');
    elements.menuToggle.setAttribute('aria-expanded', 'false');
    elements.menuToggle.setAttribute('aria-label', 'Abrir menú');
    document.body.classList.remove('sidebar-open');
    if (window.innerWidth <= 880) elements.sidebar.inert = true;
    if (restoreFocus) elements.menuToggle.focus();
  }

  function openMobileMenu() {
    elements.sidebar.inert = false;
    elements.sidebar.classList.add('open');
    elements.sidebarBackdrop.classList.add('open');
    elements.menuToggle.setAttribute('aria-expanded', 'true');
    elements.menuToggle.setAttribute('aria-label', 'Cerrar menú');
    document.body.classList.add('sidebar-open');
    elements.sidebar.querySelector('.nav-item:not([hidden])')?.focus();
  }

  function showView(viewName) {
    if (!App.auth.isSignedIn() || (!App.auth.isAdmin() && !['pedidos', 'menu'].includes(viewName))) return;
    const targetView = document.getElementById(`view-${viewName}`);
    const targetNavItem = document.querySelector(
      `.nav-item[data-view="${viewName}"]`,
    );

    if (!targetView || !targetNavItem) return;

    document.querySelectorAll('.nav-item').forEach((item) => {
      item.classList.remove('active');
      item.removeAttribute('aria-current');
    });
    targetNavItem.classList.add('active');
    targetNavItem.setAttribute('aria-current', 'page');

    document
      .querySelectorAll('.content')
      .forEach((section) => section.classList.remove('active-view'));
    targetView.classList.add('active-view');

    closeMobileMenu({ restoreFocus: true });
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
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
      if (elements.sidebar.classList.contains('open')) closeMobileMenu({ restoreFocus: true });
      else openMobileMenu();
    });
    elements.sidebarBackdrop.addEventListener('click', () => closeMobileMenu({ restoreFocus: true }));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeMobileMenu({ restoreFocus: true });
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 880) {
        closeMobileMenu();
        elements.sidebar.inert = false;
      } else if (!elements.sidebar.classList.contains('open')) elements.sidebar.inert = true;
    });
    if (window.innerWidth <= 880) elements.sidebar.inert = true;
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
