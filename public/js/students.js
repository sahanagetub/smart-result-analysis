document.addEventListener('DOMContentLoaded', () => {
  const dbStatusBanner = document.getElementById('dbStatusBanner');
  const pageMessage = document.getElementById('pageMessage');
  const batchDisplayName = document.getElementById('batchDisplayName');
  const batchAcademicYear = document.getElementById('batchAcademicYear');
  const addStudentBtn = document.getElementById('addStudentBtn');
  const importStudentsBtn = document.getElementById('importStudentsBtn');
  const cancelImportBtn = document.getElementById('cancelImportBtn');
  const backToBatchesLink = document.getElementById('backToBatchesLink');
  const studentForm = document.getElementById('studentForm');
  const addStudentForm = document.getElementById('addStudentForm');
  const cancelFormBtn = document.getElementById('cancelFormBtn');
  const saveStudentBtn = document.getElementById('saveStudentBtn');
  const usnInput = document.getElementById('usn');
  const nameInput = document.getElementById('name');
  const emailInput = document.getElementById('email');
  const errUsn = document.getElementById('errUsn');
  const errName = document.getElementById('errName');
  const errEmail = document.getElementById('errEmail');
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
  let currentBatchId = batchIdInput ? batchIdInput.value : '';
  let editId = null;
  let importValidRows = [];

  function showMessage(text, type = 'info') {
    pageMessage.className = 'status-banner status-' + type;
    pageMessage.textContent = text;
    pageMessage.style.display = 'block';
  }

  function clearErrors() {
    errUsn.textContent = '';
    errName.textContent = '';
    errEmail.textContent = '';
  }

  function renderStudents(studentList) {
    if (!studentList || studentList.length === 0) {
      studentsTableBody.innerHTML = '<tr><td colspan="6" class="empty-row">No students found.</td></tr>';
      return;
    }
    studentsTableBody.innerHTML = '';
    studentList.forEach((student) => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + student.usn + '</td>' +
        '<td>' + student.name + '</td>' +
        '<td>' + student.email + '</td>' +
        '<td>Active</td>' +
        '<td>' + (student.created_at ? new Date(student.created_at).toLocaleDateString() : '-') + '</td>' +
        '<td>' +
        '<button class="btn btn-link text-danger btn-sm delete-student" data-id="' + student.id + '">Delete</button>' +
        '<button class="btn btn-link text-primary btn-sm edit-student" data-id="' + student.id + '">Edit</button>' +
        '</td>';
      studentsTableBody.appendChild(tr);
    });
    document.querySelectorAll('.delete-student').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (confirm('Are you sure you want to delete this student?')) {
          deleteStudent(btn.dataset.id);
        }
      });
    });
    document.querySelectorAll('.edit-student').forEach((btn) => {
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
      if (res.status === 401) { window.location.href = '/login.html'; return; }
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to delete student.');
      showMessage(data.message || 'Student deleted successfully.', 'success');
      loadStudents(currentBatchId, studentSearch.value.trim());
    } catch (err) {
      showMessage(err.message, 'error');
      console.error(err);
    }
  }

  const studentIdInput = document.createElement('input');
  studentIdInput.type = 'hidden';
  studentIdInput.id = 'studentIdInput';
  studentForm.appendChild(studentIdInput);

  function openEditStudentForm(id) {
    const student = students.find((s) => s.id == id);
    if (!student) {
      showMessage('Student not found.', 'error');
      return;
    }
    usnInput.value = student.usn || '';
    nameInput.value = student.name || '';
    emailInput.value = student.email || '';
    studentIdInput.value = student.id;
    editId = student.id;
    saveStudentBtn.textContent = 'Update Student';
    showAddStudentForm();
  }

  function hideAddStudentForm() {
    addStudentForm.style.display = 'none';
    saveStudentBtn.textContent = 'Save Student';
    editId = null;
    studentForm.reset();
    clearErrors();
  }

  function showAddStudentForm() {
    addStudentForm.style.display = 'block';
  }
  studentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();
    const payload = {
      usn: usnInput.value.trim(),
      name: nameInput.value.trim(),
      email: emailInput.value.trim(),
      batch_id: batchIdInput ? batchIdInput.value : currentBatchId
    };
    let valid = true;
    if (!payload.usn) { errUsn.textContent = 'USN is required.'; valid = false; }
    if (!payload.name) { errName.textContent = 'Student name is required.'; valid = false; }
    if (!payload.email) { errEmail.textContent = 'Email is required.'; valid = false; }
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) { errEmail.textContent = 'Invalid email format.'; valid = false; }
    if (!payload.batch_id) { showMessage('Batch is required.', 'error'); valid = false; }
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
      if (res.status === 401) { window.location.href = '/login.html'; return; }
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Operation failed.');
      showMessage(data.message || (isEdit ? 'Student updated.' : 'Student added.'), 'success');
      hideAddStudentForm();
      loadStudents(currentBatchId, studentSearch.value.trim());
    } catch (err) {
      showMessage(err.message, 'error');
    } finally {
      saveStudentBtn.disabled = false;
      saveStudentBtn.textContent = 'Save Student';
    }
  });

  cancelFormBtn.addEventListener('click', hideAddStudentForm);
  addStudentBtn.addEventListener('click', showAddStudentForm);

  studentSearch.addEventListener('input', () => {
    clearTimeout(window._studentSearchTimer);
    window._studentSearchTimer = setTimeout(() => {
      loadStudents(currentBatchId, studentSearch.value.trim());
    }, 300);
  });

  if (currentBatchId) {
    loadStudents(currentBatchId);
  }
  if (dbStatusBanner) {
    dbStatusBanner.style.display = 'block';
  }
});
  confirmImportBtn.addEventListener('click', async () => {
    if (!importValidRows.length) return;
    try {
      const res = await fetch('/api/students/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students: importValidRows, batch_id: importBatchId.value }),
        credentials: 'include'
      });
      if (res.status === 401) { window.location.href = '/login.html'; return; }
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Confirm import failed.');
      showMessage(data.message, 'success');
      importFile.value = '';
      importPreview.style.display = 'none';
      confirmImportBtn.style.display = 'none';
      importValidRows = [];
      loadStudents(currentBatchId, studentSearch.value.trim());
    } catch (err) {
      showMessage(err.message, 'error');
      console.error(err);
    }
  });

  cancelImportBtn.addEventListener('click', () => {
    importFile.value = '';
    importPreview.style.display = 'none';
    importStatus.style.display = 'none';
    confirmImportBtn.style.display = 'none';
    importValidRows = [];
  });
  importFile.addEventListener('change', async () => {
    if (!importFile.files.length) return;
    if (!importBatchId.value) {
      importStatus.textContent = 'No batch context. Please open this page from a batch.';
      importStatus.style.display = 'block';
      return;
    }
    const formData = new FormData();
    formData.append('importFile', importFile.files[0]);
    formData.append('batch_id', importBatchId.value);
    importStatus.style.display = 'none';
    importPreview.style.display = 'none';
    confirmImportBtn.style.display = 'none';
    importValidRows = [];
    try {
      const res = await fetch('/api/students/import', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      if (res.status === 401) { window.location.href = '/login.html'; return; }
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Import failed.');
      importValidRows = data.data.validRows || [];
      const invalidRows = data.data.invalidRows || [];
      let html = '<h4>Import Preview</h4>';
      html += '<p><strong>Total:</strong> ' + data.data.total + ' | <strong>Valid:</strong> ' + data.data.valid + ' | <strong>Invalid:</strong> ' + data.data.invalid + '</p>';
      if (importValidRows.length > 0) {
        html += '<table><thead><tr><th>USN</th><th>Name</th><th>Email</th><th>Status</th></tr></thead><tbody>';
        importValidRows.forEach((r) => {
          html += '<tr><td>' + r.usn + '</td><td>' + r.name + '</td><td>' + r.email + '</td><td style="color:green;">Valid</td></tr>';
        });
        html += '</tbody></table>';
      }
      if (invalidRows.length > 0) {
        html += '<h5>Invalid Rows</h5><table><thead><tr><th>Row</th><th>USN</th><th>Name</th><th>Email</th><th>Errors</th></tr></thead><tbody>';
        invalidRows.forEach((r) => {
          html += '<tr><td>' + r.row + '</td><td>' + (r.data.usn || '-') + '</td><td>' + (r.data.name || '-') + '</td><td>' + (r.data.email || '-') + '</td><td style="color:red; font-size:0.85rem;">' + r.errors.join(', ') + '</td></tr>';
        });
        html += '</tbody></table>';
      }
      importPreview.innerHTML = html;
      importPreview.style.display = 'block';
      confirmImportBtn.style.display = importValidRows.length > 0 ? 'inline-block' : 'none';
    } catch (err) {
      importStatus.textContent = err.message;
      importStatus.style.display = 'block';
      console.error(err);
    }
  });