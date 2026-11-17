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

  const card = document.getElementById('loginCard');
  const form = document.getElementById('loginForm');
  const errorEl = document.getElementById('loginError');
  const toggleBtn = document.getElementById('togglePassword');
  const passwordInput = document.getElementById('password');
  const usernameInput = document.getElementById('username');
  const loginBtn = document.getElementById('loginBtn');
  const capsWarning = document.getElementById('capsWarning');
  const rememberCheckbox = document.getElementById('rememberMe');
  const portalSubtitle = document.getElementById('portalSubtitle');

  const tabAdmin = document.getElementById('tabAdmin');
  const tabStaff = document.getElementById('tabStaff');
  const btnFillAdmin = document.getElementById('btnFillAdmin');
  const btnFillStaff = document.getElementById('btnFillStaff');

  // Restore remembered username
  try {
    const savedUser = localStorage.getItem('sras_remembered_username');
    if (savedUser && usernameInput) {
      usernameInput.value = savedUser;
      if (rememberCheckbox) rememberCheckbox.checked = true;
      if (passwordInput) passwordInput.focus();
    }
  } catch (_) {}

  // Password Visibility Toggle
  if (toggleBtn && passwordInput) {
    toggleBtn.addEventListener('click', () => {
      const isHidden = passwordInput.type === 'password';
      passwordInput.type = isHidden ? 'text' : 'password';
      toggleBtn.textContent = isHidden ? 'Hide' : 'Show';
      toggleBtn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
      passwordInput.focus();
    });
  }

  // Caps Lock Detection
  function checkCapsLock(e) {
    if (!capsWarning || !e.getModifierState) return;
    if (e.getModifierState('CapsLock')) {
      capsWarning.classList.add('active');
    } else {
      capsWarning.classList.remove('active');
    }
  }

  if (passwordInput) {
    passwordInput.addEventListener('keydown', checkCapsLock);
    passwordInput.addEventListener('keyup', checkCapsLock);
    passwordInput.addEventListener('blur', () => {
      if (capsWarning) capsWarning.classList.remove('active');
    });
  }

  // Flash input highlight animation helper
  function flashInputs() {
    [usernameInput, passwordInput].forEach((el) => {
      if (!el) return;
      el.style.transition = 'background-color 0.15s ease';
      el.style.backgroundColor = '#dbeafe';
      setTimeout(() => {
        el.style.backgroundColor = '';
      }, 350);
    });
  }

  // Role Fill Helpers
  function setCredentials(username, password, roleName) {
    if (usernameInput) usernameInput.value = username;
    if (passwordInput) passwordInput.value = password;
    if (portalSubtitle) portalSubtitle.textContent = `${roleName} Portal`;
    if (errorEl) errorEl.textContent = '';
    flashInputs();
  }

  function activateTab(activeTab, inactiveTab) {
    if (activeTab) {
      activeTab.classList.add('active');
      activeTab.setAttribute('aria-selected', 'true');
    }
    if (inactiveTab) {
      inactiveTab.classList.remove('active');
      inactiveTab.setAttribute('aria-selected', 'false');
    }
  }

  if (tabAdmin) {
    tabAdmin.addEventListener('click', () => {
      activateTab(tabAdmin, tabStaff);
      setCredentials('ravi', 'Ravi@123', 'Administrator');
    });
  }

  if (tabStaff) {
    tabStaff.addEventListener('click', () => {
      activateTab(tabStaff, tabAdmin);
      setCredentials('staff', 'Staff@123', 'Faculty & Staff');
    });
  }

  if (btnFillAdmin) {
    btnFillAdmin.addEventListener('click', () => {
      activateTab(tabAdmin, tabStaff);
      setCredentials('ravi', 'Ravi@123', 'Administrator');
    });
  }

  if (btnFillStaff) {
    btnFillStaff.addEventListener('click', () => {
      activateTab(tabStaff, tabAdmin);
      setCredentials('staff', 'Staff@123', 'Faculty & Staff');
    });
  }

  // Keyboard Shortcuts (Alt+A for Admin, Alt+S for Staff, Escape to clear errors)
  document.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      activateTab(tabAdmin, tabStaff);
      setCredentials('ravi', 'Ravi@123', 'Administrator');
    } else if (e.altKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      activateTab(tabStaff, tabAdmin);
      setCredentials('staff', 'Staff@123', 'Faculty & Staff');
    } else if (e.key === 'Escape' && errorEl) {
      errorEl.textContent = '';
    }
  });

  // Shake card animation for error feedback
  function triggerShake() {
    if (!card) return;
    card.classList.remove('shake');
    // Trigger reflow
    void card.offsetWidth;
    card.classList.add('shake');
    setTimeout(() => {
      card.classList.remove('shake');
    }, 500);
  }

  if (!form) return;

  // Clear error message when user starts typing
  [usernameInput, passwordInput].forEach((input) => {
    if (input) {
      input.addEventListener('input', () => {
        if (errorEl && errorEl.textContent) {
          errorEl.textContent = '';
        }
      });
    }
  });

  // Form Submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errorEl) errorEl.textContent = '';

    const username = usernameInput ? usernameInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';

    if (!username) {
      if (errorEl) errorEl.textContent = 'Username or email is required.';
      triggerShake();
      if (usernameInput) usernameInput.focus();
      return;
    }
    if (!password) {
      if (errorEl) errorEl.textContent = 'Password is required.';
      triggerShake();
      if (passwordInput) passwordInput.focus();
      return;
    }

    // Set loading state
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>Signing in...</span>';
    if (usernameInput) usernameInput.disabled = true;
    if (passwordInput) passwordInput.disabled = true;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (data && data.success) {
        // Save remembered username if checked
        try {
          if (rememberCheckbox && rememberCheckbox.checked) {
            localStorage.setItem('sras_remembered_username', username);
          } else {
            localStorage.removeItem('sras_remembered_username');
          }
        } catch (_) {}

        // Success interactive state
        loginBtn.classList.add('btn-success');
        loginBtn.innerHTML = '<span>&#10003; Success! Redirecting...</span>';
        setTimeout(() => {
          window.location.href = data.redirect || '/dashboard.html';
        }, 400);
      } else {
        if (errorEl) errorEl.textContent = (data && data.message) || 'Invalid username or password.';
        triggerShake();
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<span class="btn-text">Sign In</span>';
        if (usernameInput) usernameInput.disabled = false;
        if (passwordInput) {
          passwordInput.disabled = false;
          passwordInput.focus();
        }
      }
    } catch (err) {
      if (errorEl) errorEl.textContent = 'Network error. Please try again.';
      triggerShake();
      loginBtn.disabled = false;
      loginBtn.innerHTML = '<span class="btn-text">Sign In</span>';
      if (usernameInput) usernameInput.disabled = false;
      if (passwordInput) passwordInput.disabled = false;
    }
  });
});
