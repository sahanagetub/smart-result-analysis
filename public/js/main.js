document.addEventListener('DOMContentLoaded', () => {
  // Auth check on protected pages (backend is authoritative; this is UX)
  const isLoginPage = window.location.pathname.toLowerCase().endsWith('login.html');
  if (!isLoginPage) {
    fetch('/api/auth/me')
      .then((r) => {
        if (!r.ok) throw new Error('unauth');
        return r.json();
      })
      .then((data) => {
        if (data && data.success && data.data) {
          const el = document.getElementById('userInfo');
          if (el) el.textContent = data.data.displayName || data.data.username;
          const clerkName = document.querySelector('.clerk-name');
          if (clerkName) clerkName.textContent = data.data.displayName || data.data.username;
        } else {
          window.location.href = '/login.html';
        }
      })
      .catch(() => { window.location.href = '/login.html'; });
  }

  // Highlight active nav link
  const current = (window.location.pathname.split('/').pop() || 'dashboard.html').toLowerCase();
  document.querySelectorAll('.nav-link').forEach((link) => {
    const href = (link.getAttribute('href') || '').split('/').pop().toLowerCase();
    if (href && href === current) link.classList.add('active');
  });

  // Mobile sidebar toggle injection
  const navbarRight = document.querySelector('.navbar-right') || document.querySelector('.header-right');
  const sidebar = document.getElementById('sidebar');
  if (navbarRight && sidebar && !document.getElementById('sidebarToggle')) {
    const btn = document.createElement('button');
    btn.id = 'sidebarToggle';
    btn.className = 'btn-logout';
    btn.textContent = 'Menu';
    btn.style.marginRight = '8px';
    navbarRight.insertBefore(btn, navbarRight.firstChild);
    btn.addEventListener('click', () => sidebar.classList.toggle('open'));
  }

  // Collapsible nav groups
  const groups = document.querySelectorAll('.nav-group');
  groups.forEach((group) => {
    group.style.cursor = 'pointer';
    group.addEventListener('click', () => {
      let el = group.nextElementSibling;
      let collapsed = group.classList.toggle('collapsed');
      while (el && !el.classList.contains('nav-group')) {
        el.style.display = collapsed ? 'none' : '';
        el = el.nextElementSibling;
      }
    });
  });

  // Logout handler
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) {}
      // clear client-side state
      try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
      window.location.href = '/login.html';
    });
  }
});
