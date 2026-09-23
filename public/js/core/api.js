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
  App.uploadImage = async function (file) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!file || !allowed.includes(file.type)) throw new Error('Selecciona una imagen JPG, PNG o WebP.');
    if (file.size > 4 * 1024 * 1024) throw new Error('La imagen no puede pesar más de 4 MB.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(App.apiBaseUrl + '/archivos', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': file.type, 'X-Cafe-Request': '1' }, body: file, signal: controller.signal,
      });
      const data = await response.json();
      if (response.status === 401) App.auth?.signedOut();
      if (!response.ok) throw new Error(data?.error || 'No se pudo subir la imagen');
      return data.image;
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError) throw new Error('No se pudo subir la imagen. Revisa la conexión e intenta de nuevo.');
      throw error;
    } finally { clearTimeout(timer); }
  };
})(window.BustersAdmin);
