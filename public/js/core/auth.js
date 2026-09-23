(function initializeAuth(App) {
  let user = null;
  let initialized = false;
  const byId = id => document.getElementById(id);
  const isAdmin = () => user?.role === 'admin';
  function signedOut() {
    user = null;
    App.orders?.stop();
    App.cafeStatus?.stop();
    App.promotions?.stop();
    resetPasswordVisibility();
    byId('appShell').hidden = true;
    byId('loginView').hidden = false;
    App.elements.productModal.classList.remove('open');
    App.elements.productModal.setAttribute('aria-hidden', 'true');
    App.elements.sidebar.classList.remove('open');
    App.elements.sidebarBackdrop.classList.remove('open');
    App.elements.menuToggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('modal-open', 'sidebar-open');
    App.elements.productForm.reset();
    byId('accountForm').reset();
    byId('accountList').replaceChildren();
    App.data.products.splice(0);
    App.elements.menuProductGrid.replaceChildren();
    App.elements.productGrid.replaceChildren();
  }
  async function signedIn(account) {
    user = account;
    byId('loginView').hidden = true;
    byId('appShell').hidden = false;
    byId('sessionAlias').textContent = account.username;
    byId('sessionRole').textContent = isAdmin() ? 'Administrador' : 'Empleado';
    App.elements.newProductButton.hidden = !isAdmin();
    App.elements.newProductMobileButton.hidden = !isAdmin();
    document.querySelectorAll('[data-view], [data-go]').forEach(button => {
      button.hidden = !isAdmin() && !['pedidos', 'menu'].includes(button.dataset.view || button.dataset.go);
    });
    if (!initialized) {
      App.navigation.initialize();
      App.products.initialize();
      App.orders.initialize();
      App.cafeStatus.initialize();
      App.promotions.initialize();
      App.productModal.initialize();
      App.modifiers.initialize();
      initialized = true;
    } else await App.products.loadCatalog();
    App.navigation.showView(isAdmin() ? 'inicio' : 'pedidos');
    App.orders.start();
    App.cafeStatus.start();
    if (isAdmin()) void App.promotions.load();
    if (isAdmin()) { await loadAccounts(); try { await App.modifiers.load(); } catch(error) { byId('modifierMessage').textContent = error.message; } }
  }
  async function loadAccounts() {
    if (!isAdmin()) return;
    try {
      const accounts = await App.api('/auth/accounts');
      if (!isAdmin()) return;
      byId('accountList').replaceChildren();
      accounts.forEach(account => {
        const row = document.createElement('div');
        row.className = 'account-row';
        const label = document.createElement('span');
        label.textContent = `${account.username} · ${account.role === 'admin' ? 'Administrador' : 'Empleado'} · ${account.active ? 'Activo' : 'Inactivo'}`;
        const button = document.createElement('button');
        button.className = 'mini-btn';
        button.textContent = account.active ? 'Desactivar' : 'Activar';
        button.disabled = account.id === user.id;
        button.addEventListener('click', async () => {
          button.disabled = true;
          try {
            await App.api('/auth/accounts/' + account.id, { method: 'PATCH', body: JSON.stringify({ active: !account.active }) });
            await loadAccounts();
          } catch (error) { byId('accountMessage').textContent = error.message; }
          finally { button.disabled = account.id === user?.id; }
        });
        row.append(label, button);
        byId('accountList').append(row);
      });
    } catch (error) { byId('accountMessage').textContent = error.message; }
  }
  function resetPasswordVisibility() {
    byId('loginPassword').type = 'password';
    byId('togglePassword').textContent = 'Mostrar';
    byId('togglePassword').setAttribute('aria-label', 'Mostrar contraseña');
    byId('togglePassword').setAttribute('aria-pressed', 'false');
  }
  async function initialize() {
    byId('togglePassword').addEventListener('click', () => {
      const visible = byId('loginPassword').type === 'password';
      byId('loginPassword').type = visible ? 'text' : 'password';
      byId('togglePassword').textContent = visible ? 'Ocultar' : 'Mostrar';
      byId('togglePassword').setAttribute('aria-label', visible ? 'Ocultar contraseña' : 'Mostrar contraseña');
      byId('togglePassword').setAttribute('aria-pressed', String(visible));
    });
    byId('loginForm').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('[type="submit"]');
      if (button.disabled) return;
      button.disabled = true;
      resetPasswordVisibility();
      byId('loginError').textContent = '';
      button.querySelector('span').textContent = 'Ingresando…';
      try {
        const account = await App.api('/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
        form.reset();
        await signedIn(account);
      } catch (error) { byId('loginError').textContent = error.message; }
      finally { button.disabled = false; button.querySelector('span').textContent = 'Entrar al panel'; }
    });
    byId('logoutBtn').addEventListener('click', async () => {
      try { await App.api('/auth/logout', { method: 'POST', body: '{}' }); signedOut(); }
      catch (error) { byId('catalogStatus').textContent = 'No se pudo cerrar la sesión: ' + error.message; }
    });
    byId('accountForm').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('[type="submit"]');
      if (!isAdmin() || button.disabled) return;
      button.disabled = true;
      try {
        await App.api('/auth/accounts', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
        form.reset();
        byId('accountMessage').textContent = 'Cuenta creada.';
        await loadAccounts();
      } catch (error) { byId('accountMessage').textContent = error.message; }
      finally { button.disabled = false; }
    });
    if (location.protocol === 'file:') {
      byId('loginError').textContent = 'Abre http://localhost:5000 para usar el acceso protegido.';
      byId('loginForm').querySelector('[type="submit"]').disabled = true;
      return;
    }
    try { await signedIn(await App.api('/auth/me')); }
    catch (error) { signedOut(); if (!error.message.includes('sesión')) byId('loginError').textContent = error.message; }
  }
  App.auth = { initialize, signedOut, isAdmin, isSignedIn: () => Boolean(user) };
})(window.BustersAdmin);
