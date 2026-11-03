document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const errorEl = document.getElementById('loginError');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (data && data.success) {
        window.location.href = data.redirect || '/dashboard.html';
      } else {
        errorEl.textContent = (data && data.message) || 'Login failed.';
      }
    } catch (err) {
      errorEl.textContent = 'Network error. Please try again.';
    }
  });
});
