document.addEventListener('DOMContentLoaded', () => {
  const dbDisabled = (document.body.dataset.dbDisabled === 'true');
  const dbStatusBanner = document.getElementById('dbStatusBanner');
  const pageMessage = document.getElementById('pageMessage');
  const batchForm = document.getElementById('batchForm');
  const addBatchBtn = document.getElementById('addBatchBtn');
  const cancelFormBtn = document.getElementById('cancelFormBtn');
  const formTitle = document.getElementById('formTitle');
  const searchInput = document.getElementById('searchBatches');
  const statusFilter = document.getElementById('batchStatusFilter');
  const tableBody = document.getElementById('batchesTableBody');

  const batchIdInput = document.getElementById('batchId');
  const batchNameInput = document.getElementById('batchName');
  const startYearInput = document.getElementById('startYear');
  const endYearInput = document.getElementById('endYear');
  const batchStatusInput = document.getElementById('batchStatus');
  const saveBtn = document.getElementById('saveBatchBtn');

  const errEls = {
    batchName: document.getElementById('errBatchName'),
    startYear: document.getElementById('errStartYear'),
    endYear: document.getElementById('errEndYear'),
    status: document.getElementById('errStatus')
  };

  let editId = null;
  let batches = [];
  let csrfToken = '';

  async function getCsrfToken() {
    if (csrfToken) return csrfToken;
    const response = await fetch('/api/auth/csrf', { credentials: 'include' });
    const data = await response.json();
    if (!response.ok || !data.csrfToken) throw new Error(data.message || 'Could not get a security token. Reload the page and try again.');
    csrfToken = data.csrfToken;
    return csrfToken;
  }

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
      btn.textContent = loading ? 'Saving...' : 'Save Batch';
    }
  }

  async function loadBatches() {
    clearErrors();
    tableBody.innerHTML = '<tr><td colspan="7" class="empty-row">Loading batches...</td></tr>';
    try {
      const params = new URLSearchParams();
      const q = searchInput.value.trim();
      if (q) params.set('search', q);
      const res = await fetch('/api/batches?' + params.toString(), { credentials: 'include' });
      if (res.status === 401) { window.location.href = '/login.html'; return; }
      if (!res.ok) throw new Error('Failed to load batches.');
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to load batches.');
      batches = data.data || [];
      const counts = data.counts || { total: 0, active: 0, inactive: 0 };
      document.getElementById('cardTotal').textContent = counts.total;
      document.getElementById('cardActive').textContent = counts.active;
      document.getElementById('cardInactive').textContent = counts.inactive;
      renderTable(batches);
    } catch (err) {
      tableBody.innerHTML = '<tr><td colspan="7" class="empty-row">Error loading batches.</td></tr>';
      showMessage(err.message, 'error');
      console.error(err);
    }
  }

  function renderTable(list) {
    const selectedStatus = statusFilter ? statusFilter.value : '';
    if (selectedStatus) list = list.filter((batch) => batch.status === selectedStatus);
    tableBody.innerHTML = '';
    if (!list || list.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="7" class="empty-row">No batches found.</td></tr>';
      return;
    }
    list.forEach((b) => {
      const tr = document.createElement('tr');
      const created = b.created_at ? new Date(b.created_at).toLocaleDateString() : '-';
      const statusClass = (b.status === 'Active') ? 'active' : 'inactive';
      tr.innerHTML = `
        <td>${escapeHtml(b.batch_name)}</td>
        <td>${b.start_year}</td>
        <td>${b.end_year}</td>
        <td><span class="status-badge ${statusClass}">${b.status}</span></td>
        <td>${b.student_count !== undefined ? b.student_count : 0}</td>
        <td>${created}</td>
        <td class="action-links">
          <button type="button" class="action-btn action-edit" data-id="${b.id}" aria-label="Edit ${escapeHtml(b.batch_name)}" title="Edit batch"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5 5 5M4 20l4.2-.8L19 8.4 15.6 5 4.8 15.8z"/></svg><span>Edit</span></button>
          <button type="button" class="action-btn action-status" data-id="${b.id}" data-status="${b.status}" aria-label="${b.status === 'Active' ? 'Deactivate' : 'Activate'} ${escapeHtml(b.batch_name)}" title="${b.status === 'Active' ? 'Deactivate' : 'Activate'} batch"><svg viewBox="0 0 24 24" aria-hidden="true">${b.status === 'Active' ? '<path d="M12 3v9m6.4-5.4a8 8 0 1 1-12.8 0"/>' : '<path d="M12 3v9m-4-4 4 4 4-4M5.6 7.6a8 8 0 1 0 12.8 0"/>'}</svg><span>${b.status === 'Active' ? 'Deactivate' : 'Activate'}</span></button>
          <button type="button" class="action-btn action-delete" data-id="${b.id}" aria-label="Delete ${escapeHtml(b.batch_name)}" title="Delete batch"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/></svg><span>Delete</span></button>
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
    tableBody.querySelectorAll('.action-status').forEach((a) => {
      a.addEventListener('click', (e) => { e.preventDefault(); toggleStatus(a.dataset.id, a.dataset.status); });
    });
    tableBody.querySelectorAll('.action-delete').forEach((a) => {
      a.addEventListener('click', (e) => { e.preventDefault(); deleteBatch(a.dataset.id); });
    });
  }

  function openEdit(id) {
    const b = batches.find((x) => x.id == id);
    if (!b) return;
    editId = id;
    batchIdInput.value = b.id;
    batchNameInput.value = b.batch_name;
    startYearInput.value = b.start_year;
    endYearInput.value = b.end_year;
    batchStatusInput.value = b.status;
    formTitle.textContent = 'Edit Batch';
    cancelFormBtn.style.display = 'inline-block';
    batchForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resetForm() {
    editId = null;
    batchIdInput.value = '';
    batchForm.reset();
    batchStatusInput.value = 'Active';
    formTitle.textContent = 'Add New Batch';
    cancelFormBtn.style.display = 'none';
    clearErrors();
  }
  async function toggleStatus(id, currentStatus) {
    const newStatus = currentStatus === 'Active' ? 'Inactive' : 'Active';
    if (!confirm(`Are you sure you want to ${newStatus.toLowerCase()} this batch?`)) return;
    try {
      const token = await getCsrfToken();
      const res = await fetch(`/api/batches/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({ status: newStatus }),
        credentials: 'include'
      });
      if (res.status === 401) { window.location.href = '/login.html'; return; }
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to update status.');
      showMessage(data.message || `Batch ${newStatus.toLowerCase()}d.`, 'success');
      loadBatches();
    } catch (err) {
      showMessage(err.message, 'error');
    }
  }

  async function deleteBatch(id) {
    if (!confirm('Are you sure you want to delete this batch?')) return;
    try {
      const token = await getCsrfToken();
      const res = await fetch(`/api/batches/${id}`, {
        method: 'DELETE',
        headers: { 'x-csrf-token': token },
        credentials: 'include'
      });
      if (res.status === 401) { window.location.href = '/login.html'; return; }
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to delete batch.');
      showMessage('Batch deleted.', 'success');
      loadBatches();
    } catch (err) {
      showMessage(err.message, 'error');
    }
  }

  batchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();
    const payload = {
      batch_name: batchNameInput.value.trim(),
      start_year: parseInt(startYearInput.value, 10),
      end_year: parseInt(endYearInput.value, 10),
      status: batchStatusInput.value
    };
    let valid = true;
    if (!payload.batch_name) { errEls.batchName.textContent = 'Batch name is required.'; valid = false; }
    if (!payload.start_year || payload.start_year < 1900 || payload.start_year > 2100) { errEls.startYear.textContent = 'Valid start year required.'; valid = false; }
    if (!payload.end_year || payload.end_year < 1900 || payload.end_year > 2100) { errEls.endYear.textContent = 'Valid end year required.'; valid = false; }
    if (payload.end_year <= payload.start_year) { errEls.endYear.textContent = 'End year must be greater than start year.'; valid = false; }
    if (!payload.status) { errEls.status.textContent = 'Status is required.'; valid = false; }
    if (!valid) return;

    setLoading(saveBtn, true);
    try {
      const isEdit = !!editId;
      const url = isEdit ? `/api/batches/${editId}` : '/api/batches';
      const method = isEdit ? 'PUT' : 'POST';
      const token = await getCsrfToken();
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify(payload),
        credentials: 'include'
      });
      if (res.status === 401) { window.location.href = '/login.html'; return; }
      const data = await res.json();
      if (!data.success) {
        if (data.errors) {
          data.errors.forEach((err) => {
            const key = err.path || err.param || 'batch_name';
            if (errEls[key]) errEls[key].textContent = err.msg;
          });
        }
        throw new Error(data.message || 'Operation failed.');
      }
      showMessage(data.message || (isEdit ? 'Batch updated.' : 'Batch created.'), 'success');
      resetForm();
      loadBatches();
    } catch (err) {
      showMessage(err.message, 'error');
    } finally {
      setLoading(saveBtn, false);
    }
  });

  addBatchBtn.addEventListener('click', () => {
    resetForm();
    batchForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  cancelFormBtn.addEventListener('click', resetForm);

  searchInput.addEventListener('input', () => {
    clearTimeout(window._batchSearchTimer);
    window._batchSearchTimer = setTimeout(loadBatches, 300);
  });

  if (statusFilter) statusFilter.addEventListener('change', () => renderTable(batches));

  if (dbDisabled && dbStatusBanner) {
    dbStatusBanner.style.display = 'block';
  }
  loadBatches();
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

