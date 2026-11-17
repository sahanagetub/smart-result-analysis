(() => {
  const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

  window.apiFetch = async (url, options = {}) => {
    const method = String(options.method || 'GET').toUpperCase();
    const headers = new Headers(options.headers || {});

    if (!safeMethods.has(method) && !headers.has('X-CSRF-Token')) {
      const tokenResponse = await fetch('/api/auth/csrf', { credentials: 'include' });
      let tokenBody;
      try { tokenBody = await tokenResponse.json(); } catch { throw new Error('Could not get a security token. Reload the page and try again.'); }
      if (!tokenResponse.ok || !tokenBody.csrfToken) {
        throw new Error(tokenBody.message || 'Could not get a security token. Reload the page and try again.');
      }
      headers.set('X-CSRF-Token', tokenBody.csrfToken);
    }

    return fetch(url, { ...options, method, headers, credentials: options.credentials || 'include' });
  };
})();
