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
  const importStatus = document.getElementById('importStatus');
  const studentsTableBody = document.getElementById('studentsTableBody');
  const batchIdInput = document.getElementById('batchId');
  const studentSearch = document.getElementById('studentSearch');
  // Show message function
  function showMessage(text, type = 'info') {
    pageMessage.className = 'status-banner status-' + type;
    pageMessage.textContent = text;
    pageMessage.style.display = 'block';
  }

  // Clear errors function
  function clearErrors() {
    errUsn.textContent = '';
    errName.textContent = '';
    errEmail.textContent = '';
  }
function renderStudents(studentList) {
async function deleteStudent(id) {
function openEditStudentForm(id) {
const studentIdInput = document.createElement('input');
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
  studentIdInput.type = 'hidden';
  studentIdInput.id = 'studentIdInput';
  studentForm.appendChild(studentIdInput);
    const student = students.find(s => s.id == id);
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
    try {
      const res = await fetch('/api/students/' + id, {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await res.json();
      if (res.status === 401) { window.location.href = '/login.html'; return; }
      if (!data.success) throw new Error(data.message || 'Failed to delete student.');
      showMessage(data.message || 'Student deleted successfully.', 'success');
      loadStudents(currentBatchId, studentSearch.value.trim());
    } catch (err) {
      showMessage(err.message, 'error');
      console.error(err);
    }
  }
    if (!studentList || studentList.length === 0) {
      studentsTableBody.innerHTML = '<tr><td colspan=\"6\" class=\"empty-row\">No students found.</td></tr>';
      return;
    }
    studentsTableBody.innerHTML = '';
    studentList.forEach(student => {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + student.usn + '</td>' +
                     '<td>' + student.name + '</td>' +
                     '<td>' + student.email + '</td>' +
                     '<td>' +
                       '<button class="btn btn-link text-danger btn-sm delete-student" data-id="' + student.id + '">Delete</button>' +
                       '<button class="btn btn-link text-primary btn-sm edit-student" data-id="' + student.id + '">Edit</button>' +
                     '</td>';
      studentsTableBody.appendChild(tr);
    });
    // Add event handlers for delete and edit
    document.querySelectorAll('.delete-student').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('Are you sure you want to delete this student?')) {
          deleteStudent(btn.dataset.id);
        }
      });
    });
    document.querySelectorAll('.edit-student').forEach(btn => {
      btn.addEventListener('click', () => {
        openEditStudentForm(btn.dataset.id);
      });
    });
  }
function loadStudents(batchIdVal, search = '') {
    studentsTableBody.innerHTML = '<tr><td colspan=\"6\" class=\"empty-row\">Loading students...</td></tr>';
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const res = await fetch('/api/students/batch/' + batchIdVal + '?' + params.toString(), { credentials: 'include' });
      if (res.status === 401) { window.location.href = '/login.html'; return; }
      if (!res.ok) throw new Error('Failed to load students.');
      const data = await res.json();
      if (data.success && data.data) {
        students = data.data;
        currentBatchId = batchIdVal;
        renderStudents(data.data);
      }
      if (data.counts) {
        document.getElementById('cardTotal').textContent = data.counts.total || 0;
      }
    } catch (err) {
      showMessage(err.message, 'error');
      console.error(err);
    }
  }
