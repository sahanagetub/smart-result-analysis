document.addEventListener('DOMContentLoaded', () => {
  const current = (window.location.pathname.split('/').pop() || 'dashboard.html').toLowerCase();
  document.querySelectorAll('.nav-link').forEach((link) => {
    const href = (link.getAttribute('href') || '').split('/').pop().toLowerCase();
    if (href && href === current) link.classList.add('active');
  });

  const userInfo = document.getElementById('userInfo');
  if (userInfo) {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => {
        if (data && data.success && data.data) {
          userInfo.textContent = data.data.username + ' (' + (data.data.role || 'user') + ')';
        } else {
          userInfo.textContent = 'Guest';
        }
      })
      .catch(() => { userInfo.textContent = 'Guest'; });
  }

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) {}
      window.location.href = '/login.html';
    });
  }
});
