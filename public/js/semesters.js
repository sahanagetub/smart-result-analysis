document.addEventListener('DOMContentLoaded', () => {
  const dbStatusBanner = document.getElementById('dbStatusBanner');
  const pageMessage = document.getElementById('pageMessage');
  const batchSelect = document.getElementById('batchSelect');
  const addSemesterBtn = document.getElementById('addSemesterBtn');
  const cancelSemesterBtn = document.getElementById('cancelSemesterBtn');
  const addSemesterForm = document.getElementById('addSemesterForm');
  const semesterForm = document.getElementById('semesterForm');
  const semestersTableBody = document.getElementById('semestersTableBody');

  const semesterBatchId = document.getElementById('semesterBatchId');
  const semesterId = document.getElementById('semesterId');
  const semesterNumber = document.getElementById('semesterNumber');
  const semesterName = document.getElementById('semesterName');
  const semesterStatus = document.getElementById('semesterStatus');
  const saveSemesterBtn = document.getElementById('saveSemesterBtn');

  const errSemesterNumber = document.getElementById('errSemesterNumber');
  const errSemesterName = document.getElementById('errSemesterName');
  const errSemesterStatus = document.getElementById('errSemesterStatus');

  let currentBatchId = '';
  let semesters = [];
  let editId = null;

  function showMessage(text, type = 'info') {
    if (!pageMessage) return;
    pageMessage.className = 'status-banner status-' + type;
    pageMessage.textContent = text;
    pageMessage.style.display = 'block';
  }

  function clearErrors() {
    if (errSemesterNumber) errSemesterNumber.textContent = '';
    if (errSemesterName) errSemesterName.textContent = '';
    if (errSemesterStatus) errSemesterStatus.textContent = '';
    if (pageMessage) pageMessage.style.display = 'none';
  }

  async function loadBatches() {
    try {
      const res = await fetch('/api/batches', { credentials: 'include' });
      if (res.status === 401) { window.location.href = '/login'; return; }
      if (!res.ok) throw new Error('Failed to load batches.');
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to load batches.');

      const batches = data.data || [];
      batchSelect.innerHTML = '<option value="">Select a batch...</option>';
      batches.forEach((b) => {
        const opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = `${b.batch_name} (${b.start_year}-${b.end_year})`;
        batchSelect.appendChild(opt);
      });

      // Check query param
      const urlParams = new URLSearchParams(window.location.search);
      const queryBatch = urlParams.get('batchId');
      if (queryBatch && batches.some((b) => b.id == queryBatch)) {
        batchSelect.value = queryBatch;
        handleBatchChange(queryBatch);
      }
    } catch (err) {
      console.error(err);
      showMessage('Could not load batches.', 'error');
    }
  }

  async function handleBatchChange(batchId) {
    currentBatchId = batchId;
    hideForm();
    if (!batchId) {
      if (addSemesterBtn) addSemesterBtn.style.display = 'none';
      semestersTableBody.innerHTML = '<tr><td colspan="5" class="empty-row">Select a batch to view semesters.</td></tr>';
      return;
    }
    if (addSemesterBtn) addSemesterBtn.style.display = 'inline-block';
    await loadSemesters(batchId);
  }

  async function loadSemesters(batchId) {
    if (!semestersTableBody) return;
    semestersTableBody.innerHTML = '<tr><td colspan="5" class="empty-row">Loading semesters...</td></tr>';
    try {
      const res = await fetch(`/api/semesters/batch/${batchId}`, { credentials: 'include' });
      if (res.status === 401) { window.location.href = '/login'; return; }
      if (!res.ok) throw new Error('Failed to load semesters.');
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to load semesters.');

      semesters = data.data || [];
      renderSemesters(semesters);
    } catch (err) {
      semestersTableBody.innerHTML = '<tr><td colspan="5" class="empty-row">Error loading semesters.</td></tr>';
      showMessage(err.message, 'error');
      console.error(err);
    }
  }

  function renderSemesters(list) {
    if (!semestersTableBody) return;
    if (!list || list.length === 0) {
      semestersTableBody.innerHTML = '<tr><td colspan="5" class="empty-row">No semesters defined for this batch.</td></tr>';
      return;
    }
    semestersTableBody.innerHTML = '';
    list.forEach((sem) => {
      const tr = document.createElement('tr');
      const statusClass = (sem.status === 'Active') ? 'active' : 'inactive';
      const sessionCount = sem.exam_session_count !== undefined ? sem.exam_session_count : 0;
      const subjectCount = sem.subject_count !== undefined ? sem.subject_count : 0;
      tr.innerHTML = `
        <td><strong>Semester ${sem.semester_number}</strong></td>
        <td>${escapeHtml(sem.semester_name)}</td>
        <td><span class="status-badge ${statusClass}">${sem.status}</span></td>
        <td>${sessionCount} sessions (${subjectCount} subjects)</td>
        <td>
          <button class="btn btn-link text-primary btn-sm edit-semester" data-id="${sem.id}">Edit</button>
          <button class="btn btn-link text-danger btn-sm delete-semester" data-id="${sem.id}" style="color:#dc2626; margin-left:8px;">Delete</button>
        </td>
      `;
      semestersTableBody.appendChild(tr);
    });

    semestersTableBody.querySelectorAll('.edit-semester').forEach((btn) => {
      btn.addEventListener('click', () => openEditForm(btn.dataset.id));
    });
    semestersTableBody.querySelectorAll('.delete-semester').forEach((btn) => {
      btn.addEventListener('click', () => deleteSemester(btn.dataset.id));
    });
  }

  function showAddForm() {
    clearErrors();
    editId = null;
    semesterForm.reset();
    semesterBatchId.value = currentBatchId;
    semesterId.value = '';
    semesterStatus.value = 'Active';
    const formHeader = addSemesterForm.querySelector('.card-header h3');
    if (formHeader) formHeader.textContent = 'Add Semester';
    if (saveSemesterBtn) saveSemesterBtn.textContent = 'Save Semester';
    addSemesterForm.style.display = 'block';
    addSemesterForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function openEditForm(id) {
    const sem = semesters.find((s) => s.id == id);
    if (!sem) return;
    clearErrors();
    editId = sem.id;
    semesterBatchId.value = sem.batch_id;
    semesterId.value = sem.id;
    semesterNumber.value = sem.semester_number;
    semesterName.value = sem.semester_name;
    semesterStatus.value = sem.status;
    const formHeader = addSemesterForm.querySelector('.card-header h3');
    if (formHeader) formHeader.textContent = 'Edit Semester';
    if (saveSemesterBtn) saveSemesterBtn.textContent = 'Update Semester';
    addSemesterForm.style.display = 'block';
    addSemesterForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function hideForm() {
    if (addSemesterForm) addSemesterForm.style.display = 'none';
    editId = null;
    if (semesterForm) semesterForm.reset();
    clearErrors();
  }

  async function deleteSemester(id) {
    if (!confirm('Are you sure you want to delete this semester?')) return;
    try {
      const res = await fetch(`/api/semesters/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.status === 401) { window.location.href = '/login'; return; }
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to delete semester.');
      showMessage(data.message || 'Semester deleted.', 'success');
      loadSemesters(currentBatchId);
    } catch (err) {
      showMessage(err.message, 'error');
    }
  }

  if (batchSelect) {
    batchSelect.addEventListener('change', (e) => {
      handleBatchChange(e.target.value);
    });
  }

  if (addSemesterBtn) {
    addSemesterBtn.addEventListener('click', showAddForm);
  }

  if (cancelSemesterBtn) {
    cancelSemesterBtn.addEventListener('click', hideForm);
  }

  if (semesterForm) {
    semesterForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors();

      const numVal = parseInt(semesterNumber.value, 10);
      const nameVal = semesterName.value.trim();
      const statusVal = semesterStatus.value;

      let valid = true;
      if (!numVal || isNaN(numVal) || numVal < 1 || numVal > 12) {
        if (errSemesterNumber) errSemesterNumber.textContent = 'Semester number must be between 1 and 12.';
        valid = false;
      }
      if (!nameVal) {
        if (errSemesterName) errSemesterName.textContent = 'Semester name is required.';
        valid = false;
      }
      if (!currentBatchId) {
        showMessage('Please select a batch first.', 'error');
        valid = false;
      }
      if (!valid) return;

      const payload = {
        batch_id: parseInt(currentBatchId, 10),
        semester_number: numVal,
        semester_name: nameVal,
        status: statusVal
      };

      saveSemesterBtn.disabled = true;
      saveSemesterBtn.textContent = 'Saving...';
      try {
        const isEdit = !!editId;
        const url = isEdit ? `/api/semesters/${editId}` : '/api/semesters';
        const method = isEdit ? 'PUT' : 'POST';

        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'include'
        });
        if (res.status === 401) { window.location.href = '/login'; return; }
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Operation failed.');

        showMessage(data.message || (isEdit ? 'Semester updated.' : 'Semester created.'), 'success');
        hideForm();
        loadSemesters(currentBatchId);
      } catch (err) {
        showMessage(err.message, 'error');
      } finally {
        saveSemesterBtn.disabled = false;
        saveSemesterBtn.textContent = editId ? 'Update Semester' : 'Save Semester';
      }
    });
  }

  loadBatches();
});

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
