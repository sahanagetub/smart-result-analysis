document.addEventListener('DOMContentLoaded', () => {
  const pageMessage = document.getElementById('pageMessage');
  const userForm = document.getElementById('userForm');
  const cancelFormBtn = document.getElementById('cancelFormBtn');
  const formTitle = document.getElementById('formTitle');
  const tableBody = document.getElementById('usersTableBody');
  const fields = {
    id: document.getElementById('userId'), username: document.getElementById('username'),
    full_name: document.getElementById('fullName'), staff_code: document.getElementById('staffCode'), email: document.getElementById('email'),
    password: document.getElementById('password'), role: document.getElementById('userRole'),
    status: document.getElementById('userStatus')
  };
  let editingId = null;
  let csrfToken = '';
  let users = [];

  function message(text, type = 'info') {
    pageMessage.className = `status-banner status-${type}`;
    pageMessage.textContent = text;
    pageMessage.style.display = text ? 'block' : 'none';
  }
  function setBusy(busy) {
    const button = document.getElementById('saveUserBtn');
    button.disabled = busy;
    button.textContent = busy ? 'Saving...' : 'Save User';
  }
  async function request(url, options = {}) {
    const response = await fetch(url, { credentials: 'include', ...options });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { window.location.href = '/login'; throw new Error('Authentication required.'); }
    if (!response.ok || data.success === false) throw new Error(data.message || data.errors?.[0]?.msg || `Request failed (${response.status}).`);
    return data;
  }
  async function getCsrf() {
    if (!csrfToken) csrfToken = (await request('/api/auth/csrf')).csrfToken;
    if (!csrfToken) throw new Error('Could not obtain a security token. Reload the page and try again.');
    return csrfToken;
  }
  async function loadUsers() {
    tableBody.innerHTML = '<tr><td colspan="8" class="empty-row">Loading users...</td></tr>';
    try {
      const data = await request('/api/auth/users');
      users = data.data || [];
      const counts = data.counts || { total: users.length, admin: 0, staff: 0 };
      document.getElementById('cardTotal').textContent = counts.total;
      document.getElementById('cardAdmin').textContent = counts.admin;
      document.getElementById('cardStaff').textContent = counts.staff;
      renderTable();
    } catch (error) {
      tableBody.innerHTML = '<tr><td colspan="8" class="empty-row">Unable to load users.</td></tr>';
      message(error.message, 'error');
    }
  }
  function cell(row, value) {
    const td = document.createElement('td');
    td.textContent = value == null || value === '' ? '-' : String(value);
    row.appendChild(td);
    return td;
  }
  function renderTable() {
    tableBody.replaceChildren();
    if (!users.length) {
      tableBody.innerHTML = '<tr><td colspan="8" class="empty-row">No users found.</td></tr>';
      return;
    }
    for (const user of users) {
      const row = document.createElement('tr');
      cell(row, user.username); cell(row, user.full_name); cell(row, user.staff_code); cell(row, user.email);
      cell(row, user.role); cell(row, user.status);
      cell(row, user.created_at ? new Date(user.created_at).toLocaleDateString() : '-');
      const actions = document.createElement('td');
      const edit = document.createElement('button');
      edit.type = 'button'; edit.className = 'action-edit'; edit.textContent = 'Edit';
      edit.addEventListener('click', () => openEdit(user));
      actions.appendChild(edit);
      if (user.username !== 'admin') {
        const del = document.createElement('button');
        del.type = 'button'; del.className = 'action-delete delete'; del.textContent = 'Delete';
        del.addEventListener('click', () => deleteUser(user));
        actions.appendChild(del);
      }
      row.appendChild(actions); tableBody.appendChild(row);
    }
  }
  function openEdit(user) {
    editingId = user.id;
    fields.id.value = user.id; fields.username.value = user.username;
    fields.username.disabled = true;
    fields.full_name.value = user.full_name; fields.email.value = user.email;
    fields.staff_code.value = user.staff_code || '';
    fields.staff_code.required = user.role === 'Staff';
    fields.password.value = ''; fields.password.required = false;
    fields.role.value = user.role === 'Staff' ? 'Staff' : '';
    fields.status.value = user.status;
    formTitle.textContent = 'Edit User'; cancelFormBtn.style.display = 'inline-block';
    userForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function resetForm() {
    editingId = null; userForm.reset(); fields.id.value = '';
    fields.username.disabled = false; fields.password.required = true;
    fields.role.value = 'Staff'; fields.status.value = 'Active'; fields.staff_code.required = true;
    formTitle.textContent = 'Add New User'; cancelFormBtn.style.display = 'none';
  }
  userForm.addEventListener('submit', async (event) => {
    event.preventDefault(); message('');
    const payload = {
      full_name: fields.full_name.value.trim(), email: fields.email.value.trim(),
      staff_code: fields.staff_code.value.trim(), role: fields.role.value, status: fields.status.value
    };
    if (!editingId) Object.assign(payload, { username: fields.username.value.trim(), password: fields.password.value });
    else if (fields.password.value) payload.password = fields.password.value;
    setBusy(true);
    try {
      const token = await getCsrf();
      const data = await request(editingId ? `/api/auth/users/${encodeURIComponent(editingId)}` : '/api/auth/users', {
        method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': token }, body: JSON.stringify(payload)
      });
      message(data.message || 'User saved successfully.', 'success'); resetForm(); await loadUsers();
    } catch (error) { message(error.message, 'error'); }
    finally { setBusy(false); }
  });
  async function deleteUser(user) {
    if (!window.confirm(`Delete user ${user.username}?`)) return;
    try {
      const token = await getCsrf();
      const data = await request(`/api/auth/users/${encodeURIComponent(user.id)}`, { method: 'DELETE', headers: { 'x-csrf-token': token } });
      message(data.message || 'User deleted.', 'success'); await loadUsers();
    } catch (error) { message(error.message, 'error'); }
  }
  document.getElementById('addUserBtn').addEventListener('click', () => { resetForm(); userForm.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  cancelFormBtn.addEventListener('click', resetForm);
  fields.role.addEventListener('change', () => { fields.staff_code.required = fields.role.value === 'Staff'; });
  document.getElementById('generateTempPassword').addEventListener('click', () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const random = new Uint8Array(18);
    window.crypto.getRandomValues(random);
    fields.password.value = Array.from(random, (byte) => alphabet[byte % alphabet.length]).join('');
    fields.password.focus();
  });
  loadUsers();
});
