/* Cambia esta URL si la API se ejecuta en otro servidor. */
(function initializeApi(App) {
  App.apiBaseUrl = ''; // El front y la API se sirven desde el mismo origen.
  App.api = async function (path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(App.apiBaseUrl + path, {
        ...options,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Cafe-Request': '1', ...options.headers },
        signal: controller.signal,
      });
      const data = response.status === 204 ? null : await response.json();
      if (response.status === 401 && path !== '/auth/login') App.auth?.signedOut();
      if (!response.ok) throw new Error(data?.details?.map(issue => issue.message).join('. ') || data?.error || 'No se pudo completar la operación');
      return data;
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError) {
        throw new Error('No se pudo conectar con la API. Revisa que esté encendida y vuelve a intentar.');
      }
      throw error;
    } finally { clearTimeout(timer); }
  };
})(window.BustersAdmin);
