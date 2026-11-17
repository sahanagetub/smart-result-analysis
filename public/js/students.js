document.addEventListener('DOMContentLoaded', () => {
  const dbStatusBanner = document.getElementById('dbStatusBanner');
  const pageMessage = document.getElementById('pageMessage');
  const batchNameEl = document.getElementById('batchName');
  const batchAcademicYearEl = document.getElementById('batchAcademicYear');
  const addStudentBtn = document.getElementById('addStudentBtn');
  const importStudentsBtn = document.getElementById('importStudentsBtn');
  const cancelImportBtn = document.getElementById('cancelImportBtn');
  const backToBatchesLink = document.getElementById('backToBatchesLink');
  const studentForm = document.getElementById('studentForm');
  const addStudentForm = document.getElementById('addStudentForm');
  const cancelFormBtn = document.getElementById('cancelFormBtn');
  const saveStudentBtn = document.getElementById('saveStudentBtn');
  const formTitle = document.getElementById('formTitle');
  const usnInput = document.getElementById('usn');
  const nameInput = document.getElementById('name');
  const emailInput = document.getElementById('email');
  const errUsn = document.getElementById('errUsn');
  const errName = document.getElementById('errName');
  const errEmail = document.getElementById('errEmail');
  const importStudentsForm = document.getElementById('importStudentsForm');
  const importStudentForm = document.getElementById('importStudentForm');
  const importFile = document.getElementById('importFile');
  const importBatchId = document.getElementById('importBatchId');
  const importPreview = document.getElementById('importPreview');
  const importStatus = document.getElementById('importStatus');
  const confirmImportBtn = document.getElementById('confirmImportBtn');
  const studentsTableBody = document.getElementById('studentsTableBody');
  const batchIdInput = document.getElementById('batchId');
  const studentSearch = document.getElementById('studentSearch');

  let students = [];
  const urlParams = new URLSearchParams(window.location.search);
  let currentBatchId = (importBatchId && importBatchId.value) || urlParams.get('batchId') || '';
  if (batchIdInput) batchIdInput.value = currentBatchId;
  let editId = null;
  let importValidRows = [];

  function showMessage(text, type = 'info') {
    if (!pageMessage) return;
    pageMessage.className = 'status-banner status-' + type;
    pageMessage.textContent = text;
    pageMessage.style.display = 'block';
  }

  function clearErrors() {
    if (errUsn) errUsn.textContent = '';
    if (errName) errName.textContent = '';
    if (errEmail) errEmail.textContent = '';
  }

  async function loadBatchInfo() {
    if (!currentBatchId) {
      if (batchNameEl) batchNameEl.textContent = 'All Students';
      if (batchAcademicYearEl) batchAcademicYearEl.textContent = 'Viewing students across all batches';
      if (backToBatchesLink) backToBatchesLink.style.display = 'inline-block';
      return;
    }
    try {
      const res = await fetch('/api/batches/' + currentBatchId, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          if (batchNameEl) batchNameEl.textContent = data.data.batch_name;
          if (batchAcademicYearEl) batchAcademicYearEl.textContent = `Academic Period: ${data.data.start_year} - ${data.data.end_year}`;
        }
      }
    } catch (err) {
      console.error('Failed to load batch info:', err);
    }
    if (backToBatchesLink) backToBatchesLink.style.display = 'inline-block';
  }

  async function loadStudents(batchId = currentBatchId, search = '') {
    if (!studentsTableBody) return;
    studentsTableBody.innerHTML = '<tr><td colspan="6" class="empty-row">Loading students...</td></tr>';
    try {
      const params = new URLSearchParams();
      if (batchId) params.set('batchId', batchId);
      if (search) params.set('search', search);

      const url = batchId ? `/api/students/batch/${batchId}?${params.toString()}` : `/api/students?${params.toString()}`;
      const res = await fetch(url, { credentials: 'include' });
      if (res.status === 401) { window.location.href = '/login'; return; }
      if (!res.ok) throw new Error('Failed to load students.');
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to load students.');
      students = data.data || [];
      renderStudents(students);
    } catch (err) {
      studentsTableBody.innerHTML = '<tr><td colspan="6" class="empty-row">Error loading students.</td></tr>';
      showMessage(err.message, 'error');
    }
  }

  function renderStudents(studentList) {
    if (!studentsTableBody) return;
    if (!studentList || studentList.length === 0) {
      studentsTableBody.innerHTML = '<tr><td colspan="6" class="empty-row">No students found.</td></tr>';
      return;
    }
    studentsTableBody.innerHTML = '';
    studentList.forEach((student) => {
      const tr = document.createElement('tr');
      const created = student.created_at ? new Date(student.created_at).toLocaleDateString() : '-';
      tr.innerHTML = `
        <td><strong>${escapeHtml(student.usn)}</strong></td>
        <td>${escapeHtml(student.name)}</td>
        <td>${escapeHtml(student.email)}</td>
        <td><span class="status-badge active">Active</span></td>
        <td>${created}</td>
        <td>
          <button class="btn btn-link text-primary btn-sm edit-student" data-id="${student.id}">Edit</button>
          <button class="btn btn-link text-danger btn-sm delete-student" data-id="${student.id}" style="color:#dc2626; margin-left:8px;">Delete</button>
        </td>
      `;
      studentsTableBody.appendChild(tr);
    });

    studentsTableBody.querySelectorAll('.delete-student').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (confirm('Are you sure you want to delete this student?')) {
          deleteStudent(btn.dataset.id);
        }
      });
    });
    studentsTableBody.querySelectorAll('.edit-student').forEach((btn) => {
      btn.addEventListener('click', () => {
        openEditStudentForm(btn.dataset.id);
      });
    });
  }

  async function deleteStudent(id) {
    try {
      const res = await fetch('/api/students/' + id, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.status === 401) { window.location.href = '/login'; return; }
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to delete student.');
      showMessage(data.message || 'Student deleted successfully.', 'success');
      loadStudents(currentBatchId, studentSearch ? studentSearch.value.trim() : '');
    } catch (err) {
      showMessage(err.message, 'error');
      console.error(err);
    }
  }

  function openEditStudentForm(id) {
    const student = students.find((s) => s.id == id);
    if (!student) {
      showMessage('Student not found.', 'error');
      return;
    }
    usnInput.value = student.usn || '';
    nameInput.value = student.name || '';
    emailInput.value = student.email || '';
    editId = student.id;
    if (formTitle) formTitle.textContent = 'Edit Student';
    if (saveStudentBtn) saveStudentBtn.textContent = 'Update Student';
    showAddStudentForm();
  }

  function hideAddStudentForm() {
    if (addStudentForm) addStudentForm.style.display = 'none';
    if (saveStudentBtn) saveStudentBtn.textContent = 'Save Student';
    if (formTitle) formTitle.textContent = 'Add Student';
    editId = null;
    if (studentForm) studentForm.reset();
    clearErrors();
  }

  function showAddStudentForm() {
    if (importStudentsForm) importStudentsForm.style.display = 'none';
    if (addStudentForm) addStudentForm.style.display = 'block';
    addStudentForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (studentForm) {
    studentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors();
      const payload = {
        usn: usnInput.value.trim(),
        name: nameInput.value.trim(),
        email: emailInput.value.trim(),
        batch_id: parseInt(currentBatchId || (batchIdInput ? batchIdInput.value : 0), 10)
      };
      let valid = true;
      if (!payload.usn) { errUsn.textContent = 'USN is required.'; valid = false; }
      if (!payload.name) { errName.textContent = 'Student name is required.'; valid = false; }
      if (!payload.email) {
        errEmail.textContent = 'Email is required.';
        valid = false;
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
        errEmail.textContent = 'Invalid email format.';
        valid = false;
      }
      if (!payload.batch_id) {
        showMessage('A valid batch is required to add students. Please open from a specific batch.', 'error');
        valid = false;
      }
      if (!valid) return;

      saveStudentBtn.disabled = true;
      saveStudentBtn.textContent = 'Saving...';
      try {
        const isEdit = !!editId;
        const url = isEdit ? '/api/students/' + editId : '/api/students';
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
        showMessage(data.message || (isEdit ? 'Student updated.' : 'Student added.'), 'success');
        hideAddStudentForm();
        loadStudents(currentBatchId, studentSearch ? studentSearch.value.trim() : '');
      } catch (err) {
        showMessage(err.message, 'error');
      } finally {
        saveStudentBtn.disabled = false;
        saveStudentBtn.textContent = editId ? 'Update Student' : 'Save Student';
      }
    });
  }

  if (cancelFormBtn) cancelFormBtn.addEventListener('click', hideAddStudentForm);
  if (addStudentBtn) addStudentBtn.addEventListener('click', () => {
    editId = null;
    if (studentForm) studentForm.reset();
    clearErrors();
    showAddStudentForm();
  });

  if (importStudentsBtn) {
    importStudentsBtn.addEventListener('click', () => {
      hideAddStudentForm();
      if (importStudentsForm) {
        importStudentsForm.style.display = 'block';
        importStudentsForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  if (cancelImportBtn) {
    cancelImportBtn.addEventListener('click', () => {
      if (importFile) importFile.value = '';
      if (importPreview) importPreview.style.display = 'none';
      if (importStatus) importStatus.style.display = 'none';
      if (confirmImportBtn) confirmImportBtn.style.display = 'none';
      if (importStudentsForm) importStudentsForm.style.display = 'none';
      importValidRows = [];
    });
  }

  if (importFile) {
    importFile.addEventListener('change', async () => {
      if (!importFile.files.length) return;
      if (!currentBatchId) {
        if (importStatus) {
          importStatus.textContent = 'No batch context. Please open this page with a specific batch.';
          importStatus.style.display = 'block';
        }
        return;
      }
      const formData = new FormData();
      formData.append('importFile', importFile.files[0]);
      formData.append('batch_id', currentBatchId);
      if (importStatus) importStatus.style.display = 'none';
      if (importPreview) importPreview.style.display = 'none';
      if (confirmImportBtn) confirmImportBtn.style.display = 'none';
      importValidRows = [];

      try {
        const res = await fetch('/api/students/import', {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });
        if (res.status === 401) { window.location.href = '/login'; return; }
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Import failed.');
        importValidRows = data.data.validRows || [];
        const invalidRows = data.data.invalidRows || [];
        let html = '<h4>Import Preview</h4>';
        html += `<p><strong>Total:</strong> ${data.data.total} | <strong>Valid:</strong> ${data.data.valid} | <strong>Invalid:</strong> ${data.data.invalid}</p>`;
        if (importValidRows.length > 0) {
          html += '<table class="table"><thead><tr><th>USN</th><th>Name</th><th>Email</th><th>Status</th></tr></thead><tbody>';
          importValidRows.forEach((r) => {
            html += `<tr><td>${escapeHtml(r.usn)}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.email)}</td><td style="color:green;">Valid</td></tr>`;
          });
          html += '</tbody></table>';
        }
        if (invalidRows.length > 0) {
          html += '<h5 style="color:#dc2626; margin-top:12px;">Invalid Rows</h5><table class="table"><thead><tr><th>Row</th><th>USN</th><th>Name</th><th>Email</th><th>Errors</th></tr></thead><tbody>';
          invalidRows.forEach((r) => {
            html += `<tr><td>${r.row}</td><td>${escapeHtml(r.data.usn || '-')}</td><td>${escapeHtml(r.data.name || '-')}</td><td>${escapeHtml(r.data.email || '-')}</td><td style="color:red;">${escapeHtml(r.errors.join(', '))}</td></tr>`;
          });
          html += '</tbody></table>';
        }
        if (importPreview) {
          importPreview.innerHTML = html;
          importPreview.style.display = 'block';
        }
        if (confirmImportBtn) {
          confirmImportBtn.style.display = importValidRows.length > 0 ? 'inline-block' : 'none';
        }
      } catch (err) {
        if (importStatus) {
          importStatus.textContent = err.message;
          importStatus.style.display = 'block';
        }
        console.error(err);
      }
    });
  }

  if (confirmImportBtn) {
    confirmImportBtn.addEventListener('click', async () => {
      if (!importValidRows.length) return;
      try {
        const res = await fetch('/api/students/import/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ students: importValidRows, batch_id: currentBatchId }),
          credentials: 'include'
        });
        if (res.status === 401) { window.location.href = '/login'; return; }
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Confirm import failed.');
        showMessage(data.message || 'Students imported successfully.', 'success');
        if (importFile) importFile.value = '';
        if (importPreview) importPreview.style.display = 'none';
        if (confirmImportBtn) confirmImportBtn.style.display = 'none';
        if (importStudentsForm) importStudentsForm.style.display = 'none';
        importValidRows = [];
        loadStudents(currentBatchId, studentSearch ? studentSearch.value.trim() : '');
      } catch (err) {
        showMessage(err.message, 'error');
        console.error(err);
      }
    });
  }

  if (studentSearch) {
    studentSearch.addEventListener('input', () => {
      clearTimeout(window._studentSearchTimer);
      window._studentSearchTimer = setTimeout(() => {
        loadStudents(currentBatchId, studentSearch.value.trim());
      }, 300);
    });
  }

  loadBatchInfo();
  loadStudents(currentBatchId);
});

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
