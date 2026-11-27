document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('firstLoginPasswordForm');
  const newPassword = document.getElementById('newPassword');
  const confirmPassword = document.getElementById('confirmPassword');
  const message = document.getElementById('passwordChangeMessage');
  const button = document.getElementById('saveFirstPassword');

  function showMessage(text, type) {
    message.textContent = text;
    message.className = `status-banner status-${type}`;
    message.hidden = !text;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showMessage('', 'info');
    if (newPassword.value.length < 8 || newPassword.value.length > 128) {
      showMessage('Choose a password between 8 and 128 characters.', 'error');
      newPassword.focus();
      return;
    }
    if (newPassword.value !== confirmPassword.value) {
      showMessage('The passwords do not match.', 'error');
      confirmPassword.focus();
      return;
    }

    button.disabled = true;
    button.textContent = 'Updating password…';
    try {
      const response = await window.apiFetch('/api/auth/first-login-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ newPassword: newPassword.value, confirmPassword: confirmPassword.value })
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.message || 'Could not update your password.');
      form.reset();
      showMessage(body.message, 'success');
      setTimeout(() => { window.location.assign(body.redirect || '/login.html'); }, 900);
    } catch (error) {
      showMessage(error.message || 'Could not update your password. Please try again.', 'error');
      button.disabled = false;
      button.textContent = 'Update password';
    }
  });
});
