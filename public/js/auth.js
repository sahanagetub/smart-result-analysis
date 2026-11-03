document.addEventListener('DOMContentLoaded', () => {
  // If already authenticated, redirect away from login
  fetch('/api/auth/me')
    .then((r) => r.json())
    .then((data) => {
      if (data && data.success) {
        window.location.href = '/dashboard.html';
      }
    })
    .catch(() => {});

  const form = document.getElementById('loginForm');
  const errorEl = document.getElementById('loginError');
  const toggleBtn = document.getElementById('togglePassword');
  const passwordInput = document.getElementById('password');
  const loginBtn = document.getElementById('loginBtn');

  if (toggleBtn && passwordInput) {
    toggleBtn.addEventListener('click', () => {
      const isHidden = passwordInput.type === 'password';
      passwordInput.type = isHidden ? 'text' : 'password';
      toggleBtn.textContent = isHidden ? 'Hide' : 'Show';
      toggleBtn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
    });
  }

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';

    const username = document.getElementById('username').value.trim();
    const password = passwordInput.value;

    if (!username) { errorEl.textContent = 'Username or email is required.'; return; }
    if (!password) { errorEl.textContent = 'Password is required.'; return; }

    loginBtn.disabled = true;
    loginBtn.textContent = 'Signing in...';

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
        errorEl.textContent = (data && data.message) || 'Invalid credentials.';
      }
    } catch (err) {
      errorEl.textContent = 'Network error. Please try again.';
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Login';
    }
  });
});
