document.addEventListener('DOMContentLoaded', () => {
  const dbDisabled = (document.body.dataset.dbDisabled === 'true');
  const dbStatusBanner = document.getElementById('dbStatusBanner');
  const pageMessage = document.getElementById('pageMessage');
  const userForm = document.getElementById('userForm');
  const addUserBtn = document.getElementById('addUserBtn');
  const cancelFormBtn = document.getElementById('cancelFormBtn');
  const formTitle = document.getElementById('formTitle');
  const tableBody = document.getElementById('usersTableBody');

  const userIdInput = document.getElementById('userId');
  const usernameInput = document.getElementById('username');
  const fullNameInput = document.getElementById('fullName');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const userRoleInput = document.getElementById('userRole');
  const userStatusInput = document.getElementById('userStatus');
  const saveBtn = document.getElementById('saveUserBtn');

  const errEls = {
    username: document.getElementById('errUsername'),
    fullName: document.getElementById('errFullName'),
    email: document.getElementById('errEmail'),
    password: document.getElementById('errPassword'),
    role: document.getElementById('errRole'),
    status: document.getElementById('errStatus')
  };

  let editId = null;
  let users = [];

  function clearErrors() {
    Object.values(errEls).forEach((e) => { if (e) e.textContent = ''; });
    pageMessage.style.display = 'none';
  }

  function showMessage(text, type = 'info') {
    pageMessage.className = 'status-banner status-' + type;
    pageMessage.textContent = text;
    pageMessage.style.display = 'block';
  }

  function setLoading(btn, loading) {
    if (btn) {
      btn.disabled = loading;
      btn.textContent = loading ? 'Saving...' : 'Save User';
    }
  }

  async function loadUsers() {
    clearErrors();
    tableBody.innerHTML = '<tr><td colspan="7" class="empty-row">Loading users...</td></tr>';
    try {
      const res = await fetch('/api/auth/users', { credentials: 'include' });
      if (res.status === 401) { window.location.href = '/login.html'; return; }
      if (res.status === 403) {
        tableBody.innerHTML = '<tr><td colspan="7" class="empty-row">Access denied. Admin only.</td></tr>';
        showMessage('Access denied. Admin only.', 'error');
        return;
      }
      if (!res.ok) throw new Error('Failed to load users.');
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to load users.');
      users = data.data || [];
      const counts = data.counts || { admin: 0, staff: 0, total: 0 };
      document.getElementById('cardTotal').textContent = counts.total;
      document.getElementById('cardAdmin').textContent = counts.admin;
      document.getElementById('cardStaff').textContent = counts.staff;
      renderTable(users);
    } catch (err) {
      tableBody.innerHTML = '<tr><td colspan="7" class="empty-row">Error loading users.</td></tr>';
      showMessage(err.message, 'error');
      console.error(err);
    }
  }

  function renderTable(list) {
    tableBody.innerHTML = '';
    if (!list || list.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="7" class="empty-row">No users found.</td></tr>';
      return;
    }
    list.forEach((u) => {
      const tr = document.createElement('tr');
      const created = u.created_at ? new Date(u.created_at).toLocaleDateString() : '-';
      const roleClass = (u.role === 'Admin') ? 'admin' : 'staff';
      const statusClass = (u.status === 'Active') ? 'active' : 'inactive';
      tr.innerHTML = `
        <td>${escapeHtml(u.username)}</td>
        <td>${escapeHtml(u.full_name)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td><span class="role-badge ${roleClass}">${u.role}</span></td>
        <td><span class="status-badge ${statusClass}">${u.status}</span></td>
        <td>${created}</td>
        <td class="action-links">
          <a href="#" class="action-edit" data-id="${u.id}">Edit</a>
          ${u.username !== 'admin' ? `<a href="#" class="action-delete delete" data-id="${u.id}">Delete</a>` : ''}
        </td>
      `;
      tableBody.appendChild(tr);
    });
    attachRowListeners();
  }

  function attachRowListeners() {
    tableBody.querySelectorAll('.action-edit').forEach((a) => {
      a.addEventListener('click', (e) => { e.preventDefault(); openEdit(a.dataset.id); });
    });
    tableBody.querySelectorAll('.action-delete').forEach((a) => {
      a.addEventListener('click', (e) => { e.preventDefault(); deleteUser(a.dataset.id); });
    });
  }

  function openEdit(id) {
    const u = users.find((x) => x.id == id);
    if (!u) return;
    editId = id;
    userIdInput.value = u.id;
    usernameInput.value = u.username;
    fullNameInput.value = u.full_name;
    emailInput.value = u.email;
    passwordInput.value = '';
    userRoleInput.value = u.role;
    userStatusInput.value = u.status;
    formTitle.textContent = 'Edit User';
    cancelFormBtn.style.display = 'inline-block';
    userForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resetForm() {
    editId = null;
    userIdInput.value = '';
    userForm.reset();
    userRoleInput.value = 'Staff';
    userStatusInput.value = 'Active';
    formTitle.textContent = 'Add New User';
    cancelFormBtn.style.display = 'none';
    clearErrors();
  }
