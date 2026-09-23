/* =========================================================
   NAVEGACIÓN
   Cambio entre Inicio, Pedidos, Menú y Configuración.
   ========================================================= */

(function initializeNavigationFeature(App) {
  const elements = App.elements;

  function closeMobileMenu({ restoreFocus = false } = {}) {
    const wasOpen = elements.sidebar.classList.contains('open');
    elements.sidebar.classList.remove('open');
    elements.sidebarBackdrop.classList.remove('open');
    elements.sidebarBackdrop.setAttribute('aria-hidden', 'true');
    elements.menuToggle.setAttribute('aria-expanded', 'false');
    elements.menuToggle.setAttribute('aria-label', 'Abrir menú');
    document.body.classList.remove('sidebar-open');
    document.querySelector('.main').inert = false;
    document.querySelector('.mobile-nav').inert = false;
    if (window.innerWidth <= 880) elements.sidebar.inert = true;
    if (restoreFocus && wasOpen) elements.menuToggle.focus();
  }

  function openMobileMenu() {
    elements.sidebar.scrollTop = 0;
    elements.sidebar.inert = false;
    elements.sidebar.classList.add('open');
    elements.sidebarBackdrop.classList.add('open');
    elements.sidebarBackdrop.setAttribute('aria-hidden', 'false');
    elements.menuToggle.setAttribute('aria-expanded', 'true');
    elements.menuToggle.setAttribute('aria-label', 'Cerrar menú');
    document.body.classList.add('sidebar-open');
    document.querySelector('.main').inert = true;
    document.querySelector('.mobile-nav').inert = true;
    document.getElementById('closeSidebar').focus({ preventScroll: true });
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
    document.querySelectorAll('.mobile-nav [data-go]').forEach(button => {
      if (button.dataset.go === viewName) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    document.getElementById('pageHeading').textContent = {
      inicio: 'Nuestro turno', pedidos: 'De la cocina a la mesa', menu: 'La carta de Buster',
      promociones: 'Novedades de la casa', configuracion: 'Nuestro equipo',
    }[viewName];

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
    closeMobileMenu();
    elements.menuToggle.addEventListener('click', () => {
      if (elements.sidebar.classList.contains('open')) closeMobileMenu({ restoreFocus: true });
      else openMobileMenu();
    });
    elements.sidebarBackdrop.addEventListener('click', () => closeMobileMenu({ restoreFocus: true }));
    document.getElementById('closeSidebar').addEventListener('click', () => closeMobileMenu({ restoreFocus: true }));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeMobileMenu({ restoreFocus: true });
      if (event.key === 'Tab' && elements.sidebar.classList.contains('open')) {
        const buttons = [...elements.sidebar.querySelectorAll('button:not([hidden]):not(:disabled)')].filter(button => button.getClientRects().length);
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
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
    closeMobileMenu,
    showView,
    initialize,
  };
})(window.BustersAdmin);
