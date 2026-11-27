document.addEventListener('DOMContentLoaded', () => {
  const dbStatusBanner = document.getElementById('dbStatusBanner');
  const pageMessage = document.getElementById('pageMessage');
  const addSubjectBtn = document.getElementById('addSubjectBtn');
  const cancelSubjectBtn = document.getElementById('cancelSubjectBtn');
  const addSubjectForm = document.getElementById('addSubjectForm');
  const subjectForm = document.getElementById('subjectForm');
  const subjectsTableBody = document.getElementById('subjectsTableBody');
  const subjectSearch = document.getElementById('subjectSearch');
  const subjectSemesterFilter = document.getElementById('subjectSemesterFilter');

  const subjectId = document.getElementById('subjectId');
  const subjectCode = document.getElementById('subjectCode');
  const subjectName = document.getElementById('subjectName');
  const subjectSemester = document.getElementById('subjectSemester');
  const subjectCredits = document.getElementById('subjectCredits');
  const subjectMaxInternal = document.getElementById('subjectMaxInternal');
  const subjectMaxExternal = document.getElementById('subjectMaxExternal');
  const subjectStatus = document.getElementById('subjectStatus');
  const saveSubjectBtn = document.getElementById('saveSubjectBtn');

  const errSubjectCode = document.getElementById('errSubjectCode');
  const errSubjectName = document.getElementById('errSubjectName');
  const errSubjectSemester = document.getElementById('errSubjectSemester');
  const errSubjectCredits = document.getElementById('errSubjectCredits');
  const errSubjectMaxInternal = document.getElementById('errSubjectMaxInternal');
  const errSubjectMaxExternal = document.getElementById('errSubjectMaxExternal');
  const errSubjectStatus = document.getElementById('errSubjectStatus');

  let subjects = [];
  let semesters = [];
  let editId = null;

  function showMessage(text, type = 'info') {
    if (!pageMessage) return;
    pageMessage.className = 'status-banner status-' + type;
    pageMessage.textContent = text;
    pageMessage.style.display = 'block';
  }

  function clearErrors() {
    if (errSubjectCode) errSubjectCode.textContent = '';
    if (errSubjectName) errSubjectName.textContent = '';
    if (errSubjectSemester) errSubjectSemester.textContent = '';
    if (errSubjectCredits) errSubjectCredits.textContent = '';
    if (errSubjectMaxInternal) errSubjectMaxInternal.textContent = '';
    if (errSubjectMaxExternal) errSubjectMaxExternal.textContent = '';
    if (errSubjectStatus) errSubjectStatus.textContent = '';
    if (pageMessage) pageMessage.style.display = 'none';
  }

  async function loadSemesters() {
    try {
      const res = await fetch('/api/semesters', { credentials: 'include' });
      if (res.status === 401) { window.location.href = '/login'; return; }
      if (!res.ok) throw new Error('Failed to load semesters.');
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to load semesters.');

      semesters = data.data || [];
      if (subjectSemesterFilter) {
        subjectSemesterFilter.innerHTML = '<option value="">All semesters</option>';
        semesters.forEach((semester) => {
          const option = document.createElement('option');
          option.value = semester.id;
          option.textContent = `${semester.semester_name} · ${semester.batch_name || 'Batch'}`;
          subjectSemesterFilter.appendChild(option);
        });
      }
      if (subjectSemester) {
        subjectSemester.innerHTML = '<option value="">Select a semester...</option>';
        semesters.forEach((s) => {
          const opt = document.createElement('option');
          opt.value = s.id;
          const bLabel = s.batch_name ? ` (${s.batch_name})` : '';
          opt.textContent = `${s.semester_name} - Sem ${s.semester_number}${bLabel}`;
          subjectSemester.appendChild(opt);
        });
      }
    } catch (err) {
      console.error(err);
      showMessage('Could not load semesters.', 'error');
    }
  }

  async function loadSubjects(search = '', semesterId = subjectSemesterFilter ? subjectSemesterFilter.value : '') {
    if (!subjectsTableBody) return;
    subjectsTableBody.innerHTML = '<tr><td colspan="6" class="empty-row">Loading subjects...</td></tr>';
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (semesterId) params.set('semesterId', semesterId);

      const res = await fetch(`/api/subjects?${params.toString()}`, { credentials: 'include' });
      if (res.status === 401) { window.location.href = '/login'; return; }
      if (!res.ok) throw new Error('Failed to load subjects.');
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to load subjects.');

      subjects = data.data || [];
      renderSubjects(subjects);
    } catch (err) {
      subjectsTableBody.innerHTML = '<tr><td colspan="6" class="empty-row">Error loading subjects.</td></tr>';
      showMessage(err.message, 'error');
      console.error(err);
    }
  }

  function renderSubjects(list) {
    if (!subjectsTableBody) return;
    if (!list || list.length === 0) {
      subjectsTableBody.innerHTML = '<tr><td colspan="6" class="empty-row">No subjects found.</td></tr>';
      return;
    }
    subjectsTableBody.innerHTML = '';
    list.forEach((sub) => {
      const tr = document.createElement('tr');
      const statusClass = (sub.status === 'Active') ? 'active' : 'inactive';
      const semLabel = sub.semester_name ? `${sub.semester_name} (Sem ${sub.semester_number})` : (sub.semester_id || '—');
      const bLabel = sub.batch_name ? ` - ${sub.batch_name}` : '';
      tr.innerHTML = `
        <td><strong>${escapeHtml(sub.subject_code)}</strong></td>
        <td>${escapeHtml(sub.subject_name)}</td>
        <td>${escapeHtml(semLabel + bLabel)}</td>
        <td>${sub.credits || 4}</td>
        <td><span class="status-badge ${statusClass}">${sub.status}</span></td>
        <td>
          <button class="btn btn-link text-primary btn-sm edit-subject" data-id="${sub.id}">Edit</button>
          <button class="btn btn-link text-danger btn-sm delete-subject" data-id="${sub.id}" style="color:#dc2626; margin-left:8px;">Delete</button>
        </td>
      `;
      subjectsTableBody.appendChild(tr);
    });

    subjectsTableBody.querySelectorAll('.edit-subject').forEach((btn) => {
      btn.addEventListener('click', () => openEditForm(btn.dataset.id));
    });
    subjectsTableBody.querySelectorAll('.delete-subject').forEach((btn) => {
      btn.addEventListener('click', () => deleteSubject(btn.dataset.id));
    });
  }

  function showAddForm() {
    clearErrors();
    editId = null;
    subjectForm.reset();
    subjectId.value = '';
    subjectStatus.value = 'Active';
    subjectCredits.value = '4';
    subjectMaxInternal.value = '40';
    subjectMaxExternal.value = '60';
    const formHeader = addSubjectForm.querySelector('.card-header h3');
    if (formHeader) formHeader.textContent = 'Add Subject';
    if (saveSubjectBtn) saveSubjectBtn.textContent = 'Save Subject';
    addSubjectForm.style.display = 'block';
    addSubjectForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function openEditForm(id) {
    const sub = subjects.find((x) => x.id == id);
    if (!sub) return;
    clearErrors();
    editId = sub.id;
    subjectId.value = sub.id;
    subjectCode.value = sub.subject_code || '';
    subjectName.value = sub.subject_name || '';
    subjectSemester.value = sub.semester_id || '';
    subjectCredits.value = sub.credits || '4';
    subjectMaxInternal.value = sub.max_internal_marks ?? 40;
    subjectMaxExternal.value = sub.max_external_marks ?? 60;
    subjectStatus.value = sub.status || 'Active';
    const formHeader = addSubjectForm.querySelector('.card-header h3');
    if (formHeader) formHeader.textContent = 'Edit Subject';
    if (saveSubjectBtn) saveSubjectBtn.textContent = 'Update Subject';
    addSubjectForm.style.display = 'block';
    addSubjectForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function hideForm() {
    if (addSubjectForm) addSubjectForm.style.display = 'none';
    editId = null;
    if (subjectForm) subjectForm.reset();
    clearErrors();
  }

  async function deleteSubject(id) {
    if (!confirm('Are you sure you want to delete this subject?')) return;
    try {
      const res = await apiFetch(`/api/subjects/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.status === 401) { window.location.href = '/login'; return; }
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to delete subject.');
      showMessage(data.message || 'Subject deleted.', 'success');
      loadSubjects(subjectSearch ? subjectSearch.value.trim() : '', subjectSemesterFilter ? subjectSemesterFilter.value : '');
    } catch (err) {
      showMessage(err.message, 'error');
    }
  }

  if (addSubjectBtn) addSubjectBtn.addEventListener('click', showAddForm);
  if (cancelSubjectBtn) cancelSubjectBtn.addEventListener('click', hideForm);

  if (subjectSearch) {
    subjectSearch.addEventListener('input', () => {
      clearTimeout(window._subjectSearchTimer);
      window._subjectSearchTimer = setTimeout(() => {
        loadSubjects(subjectSearch.value.trim(), subjectSemesterFilter ? subjectSemesterFilter.value : '');
      }, 300);
    });
  }

  if (subjectSemesterFilter) {
    subjectSemesterFilter.addEventListener('change', () => {
      loadSubjects(subjectSearch ? subjectSearch.value.trim() : '', subjectSemesterFilter.value);
    });
  }

  if (subjectForm) {
    subjectForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors();

      const codeVal = subjectCode.value.trim().toUpperCase();
      const nameVal = subjectName.value.trim();
      const semVal = parseInt(subjectSemester.value, 10);
      const creditsVal = parseInt(subjectCredits.value, 10) || 4;
      const maxInternalVal = Number(subjectMaxInternal.value);
      const maxExternalVal = Number(subjectMaxExternal.value);
      const statusVal = subjectStatus.value;

      let valid = true;
      if (!codeVal) {
        if (errSubjectCode) errSubjectCode.textContent = 'Subject code is required.';
        valid = false;
      }
      if (!nameVal) {
        if (errSubjectName) errSubjectName.textContent = 'Subject name is required.';
        valid = false;
      }
      if (!semVal || isNaN(semVal)) {
        if (errSubjectSemester) errSubjectSemester.textContent = 'Semester is required.';
        valid = false;
      }
      if (creditsVal < 1 || creditsVal > 10) {
        if (errSubjectCredits) errSubjectCredits.textContent = 'Credits must be between 1 and 10.';
        valid = false;
      }
      if (subjectMaxInternal.value.trim() === '' || !Number.isInteger(maxInternalVal) || maxInternalVal < 0 || maxInternalVal > 100) {
        if (errSubjectMaxInternal) errSubjectMaxInternal.textContent = 'Enter a whole number from 0 to 100.';
        valid = false;
      }
      if (subjectMaxExternal.value.trim() === '' || !Number.isInteger(maxExternalVal) || maxExternalVal < 0 || maxExternalVal > 100) {
        if (errSubjectMaxExternal) errSubjectMaxExternal.textContent = 'Enter a whole number from 0 to 100.';
        valid = false;
      }
      if (!valid) return;

      const payload = {
        subject_code: codeVal,
        subject_name: nameVal,
        semester_id: semVal,
        credits: creditsVal,
        max_internal_marks: maxInternalVal,
        max_external_marks: maxExternalVal,
        total_maximum_marks: maxInternalVal + maxExternalVal,
        status: statusVal
      };

      saveSubjectBtn.disabled = true;
      saveSubjectBtn.textContent = 'Saving...';
      try {
        const isEdit = !!editId;
        const url = isEdit ? `/api/subjects/${editId}` : '/api/subjects';
        const method = isEdit ? 'PUT' : 'POST';

        const res = await apiFetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'include'
        });
        if (res.status === 401) { window.location.href = '/login'; return; }
        const data = await res.json();
        if (!data.success) {
          if (data.errors && data.errors.length) {
            throw new Error(data.errors.map(err => err.msg).join(', '));
          }
          throw new Error(data.message || 'Operation failed.');
        }

        showMessage(data.message || (isEdit ? 'Subject updated.' : 'Subject created.'), 'success');
        hideForm();
        loadSubjects(subjectSearch ? subjectSearch.value.trim() : '', subjectSemesterFilter ? subjectSemesterFilter.value : '');
      } catch (err) {
        showMessage(err.message, 'error');
      } finally {
        saveSubjectBtn.disabled = false;
        saveSubjectBtn.textContent = editId ? 'Update Subject' : 'Save Subject';
      }
    });
  }

  loadSemesters();
  loadSubjects();
});

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
