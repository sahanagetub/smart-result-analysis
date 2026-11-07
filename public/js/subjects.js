document.addEventListener('DOMContentLoaded', () => {
  const dbDisabled = (document.body.dataset.dbDisabled === 'true');
  const dbStatusBanner = document.getElementById('dbStatusBanner');
  const pageMessage = document.getElementById('pageMessage');
  const subjectForm = document.getElementById('subjectForm');
  const semesterSelect = document.getElementById('semesterSelect');
  const subjectCodeInput = document.getElementById('subjectCode');
  const subjectNameInput = document.getElementById('subjectName');
  const creditsInput = document.getElementById('credits');
  const maxInternalInput = document.getElementById('maxInternal');
  const maxExternalInput = document.getElementById('maxExternal');
  const totalMaximumInput = document.getElementById('totalMaximum');
  const saveBtn = document.getElementById('saveSubjectBtn');
  const subjectsTableBody = document.getElementById('subjectsTableBody');

  const errEls = {
    subjectCode: document.getElementById('errSubjectCode'),
    subjectName: document.getElementById('errSubjectName'),
    credits: document.getElementById('errCredits'),
    maxInternal: document.getElementById('errMaxInternal'),
    maxExternal: document.getElementById('errMaxExternal'),
    totalMaximum: document.getElementById('errTotalMaximum')
  };

  let subjects = [];

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
      btn.textContent = loading ? 'Saving...' : 'Add Subject';
    }
  }
subjectForm.addEventListener('submit', handleSubmit);
  cancelFormBtn.addEventListener('click', resetForm);
  semesterSelect.addEventListener('change', () => {
    loadSubjects(semesterSelect.value);
  });

  // Search handler
  const subjectSearch = document.getElementById('subjectSearch');
  const clearSearch = document.getElementById('clearSearch');
  let currentSearch = '';

  subjectSearch.addEventListener('input', (e) => {
    clearTimeout(window._subjectSearchTimer);
    window._subjectSearchTimer = setTimeout(() => {
      currentSearch = e.target.value.trim();
      clearSearch.style.display = currentSearch ? 'inline-block' : 'none';
      loadSubjects(semesterSelect.value, currentSearch);
    }, 300);
  });

  clearSearch.addEventListener('click', () => {
    subjectSearch.value = '';
    currentSearch = '';
    clearSearch.style.display = 'none';
    loadSubjects(semesterSelect.value);
  });

  // Delete subject handler
  subjectsTableBody.addEventListener('click', async (e) => {
    const target = e.target.closest('.delete-subject');
    if (target) {
      const id = target.dataset.id;
      if (confirm('Are you sure you want to delete this subject?')) {
        setLoading(saveBtn, true);
        try {
          const res = await fetch('/api/subjects/' + id, { method: 'DELETE', credentials: 'include' });
          if (res.status === 401) { window.location.href = '/login.html'; return; }
          if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.message || 'Delete failed.');
          }
          const data = await res.json();
          showMessage(data.message || 'Subject deleted successfully.', 'success');
          loadSubjects();
        } catch (err) {
          showMessage(err.message, 'error');
          console.error(err);
        } finally {
          setLoading(saveBtn, false);
        }
      }
    }

    // Edit subject handler
    const editBtn = e.target.closest('.edit-subject');
    if (editBtn) {
      const id = editBtn.dataset.id;
      const subject = subjects.find(s => s.id == id);
      if (subject) {
        currentEditId = id;
        semesterSelect.value = subject.semester_id;
        subjectCodeInput.value = subject.subject_code;
        subjectNameInput.value = subject.subject_name;
        creditsInput.value = subject.credits;
        maxInternalInput.value = subject.max_internal_marks;
        maxExternalInput.value = subject.max_external_marks;
        totalMaximumInput.value = subject.total_maximum_marks;
        saveBtn.textContent = 'Update Subject';
        semesterSelect.dispatchEvent(new Event('change'));
      }
    }
  });
  
  if (dbDisabled && dbStatusBanner) {
    dbStatusBanner.style.display = 'block';
  }
  loadSemesters();
  loadSubjects();
});
function validateForm() {
    clearErrors();
    let valid = true;
    
    if (!subjectCodeInput.value.trim()) {
      errEls.subjectCode.textContent = 'Subject code is required.';
      valid = false;
    }
    
    if (!subjectNameInput.value.trim()) {
      errEls.subjectName.textContent = 'Subject name is required.';
      valid = false;
    }
    
    if (!semesterSelect.value) {
      errEls.subjectCode.textContent = 'Semester is required.';
      valid = false;
    }
    
    if (!creditsInput.value || isNaN(creditsInput.value) || creditsInput.value < 1 || creditsInput.value > 10) {
      errEls.credits.textContent = 'Valid credits is required (1-10).';
      valid = false;
    }
    
    if (!maxInternalInput.value || isNaN(maxInternalInput.value) || maxInternalInput.value < 0 || maxInternalInput.value > 100) {
      errEls.maxInternal.textContent = 'Valid max internal marks is required (0-100).';
      valid = false;
    }
    
    if (!maxExternalInput.value || isNaN(maxExternalInput.value) || maxExternalInput.value < 0 || maxExternalInput.value > 100) {
      errEls.maxExternal.textContent = 'Valid max external marks is required (0-100).';
      valid = false;
    }
    
    if (!totalMaximumInput.value || isNaN(totalMaximumInput.value) || totalMaximumInput.value < 0 || totalMaximumInput.value > 200) {
      errEls.totalMaximum.textContent = 'Valid total maximum marks is required (0-200).';
      valid = false;
    }
    
    return valid;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    clearErrors();
    
    if (!validateForm()) return;
    
    setLoading(saveBtn, true);
    
    const payload = {
      semester_id: parseInt(semesterSelect.value),
      subject_code: subjectCodeInput.value.trim(),
      subject_name: subjectNameInput.value.trim(),
      credits: parseInt(creditsInput.value),
      max_internal_marks: parseInt(maxInternalInput.value),
      max_external_marks: parseInt(maxExternalInput.value),
      total_maximum_marks: parseInt(totalMaximumInput.value)
    };
    
    try {
      const res = await fetch('/api/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include'
      });
      
      if (res.status === 401) { window.location.href = '/login.html'; return; }
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Failed to create subject.');
      }
      
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Operation failed.');
      
      showMessage(data.message || 'Subject created successfully.', 'success');
      resetForm();
      loadSubjects();
    } catch (err) {
      showMessage(err.message, 'error');
      console.error(err);
    } finally {
      setLoading(saveBtn, false);
    }
  }

  function resetForm() {
    subjectForm.reset();
    saveBtn.textContent = 'Add Subject';
    clearErrors();
  }
async function loadSemesters() {
    clearErrors();
    try {
      const res = await fetch('/api/semesters', { credentials: 'include' });
      if (res.status === 401) { window.location.href = '/login.html'; return; }
      if (!res.ok) throw new Error('Failed to load semesters.');
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to load semesters.');
      
      semesterSelect.innerHTML = '<option value="">Select a semester...</option>';
      data.data.forEach(sem => {
        const option = document.createElement('option');
        option.value = sem.id;
        option.textContent = sem.semester_number + ' - ' + sem.semester_name;
        semesterSelect.appendChild(option);
      });
    } catch (err) {
      showMessage(err.message, 'error');
      console.error(err);
    }
  }

  async function loadSubjects(semesterId = '', search = '') {
    clearErrors();
    try {
      const params = new URLSearchParams();
      if (semesterId) params.set('semester_id', semesterId);
      if (search) params.set('search', search);
      const res = await fetch('/api/subjects?' + params.toString(), { credentials: 'include' });
      if (res.status === 401) { window.location.href = '/login.html'; return; }
      if (!res.ok) throw new Error('Failed to load subjects.');
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to load subjects.');
      subjects = data.data || [];
      renderTable(subjects, data.counts);
    } catch (err) {
      subjectsTableBody.innerHTML = '<tr><td colspan="8" class="empty-row">Error loading subjects.</td></tr>';
      showMessage(err.message, 'error');
      console.error(err);
    }
  }

  function renderTable(list) {
    subjectsTableBody.innerHTML = '';
    if (!list || list.length === 0) {
      subjectsTableBody.innerHTML = '<tr><td colspan="8" class="empty-row">No subjects found.</td></tr>';
      return;
    }
    list.forEach(s => {
      const tr = document.createElement('tr');
      const statusClass = (s.status === 'Active') ? 'active' : 'inactive';
      const statusText = s.status || '-';
      const cells = [
        s.subject_code || '-',
        s.subject_name || '-',
        s.semester_number || '-',
        s.max_internal_marks || '-',
        s.max_external_marks || '-',
        s.total_maximum_marks || '-',
        s.credits || '-',
        '<span class="status ' + statusClass + '">' + statusText + '</span>'
      ];
      const actions = [
        '<button class="btn btn-link text-primary btn-sm edit-subject" data-id="' + s.id + '">Edit</button>',
        '<button class="btn btn-link text-danger btn-sm delete-subject" data-id="' + s.id + '">Delete</button>'
      ];
      tr.innerHTML = '<td>' + cells.join('</td><td>') + '</td><td>' + actions.join('</td></tr><tr>') + '</td>';
      subjectsTableBody.appendChild(tr);
    });
  }

  function validateForm() {
    clearErrors();
    let valid = true;
    
    if (!subjectCodeInput.value.trim()) {
      errEls.subjectCode.textContent = 'Subject code is required.';
      valid = false;
    }
    
    if (!subjectNameInput.value.trim()) {
      errEls.subjectName.textContent = 'Subject name is required.';
      valid = false;
    }
    
    if (!semesterSelect.value) {
      errEls.subjectCode.textContent = 'Semester is required.';
      valid = false;
    }
    
    if (!creditsInput.value || isNaN(creditsInput.value) || creditsInput.value < 1 || creditsInput.value > 10) {
      errEls.credits.textContent = 'Valid credits is required (1-10).';
      valid = false;
    }
    
    if (!maxInternalInput.value || isNaN(maxInternalInput.value) || maxInternalInput.value < 0 || maxInternalInput.value > 100) {
      errEls.maxInternal.textContent = 'Valid max internal marks is required (0-100).';
      valid = false;
    }
    
    if (!maxExternalInput.value || isNaN(maxExternalInput.value) || maxExternalInput.value < 0 || maxExternalInput.value > 100) {
      errEls.maxExternal.textContent = 'Valid max external marks is required (0-100).';
      valid = false;
    }
    
    if (!totalMaximumInput.value || isNaN(totalMaximumInput.value) || totalMaximumInput.value < 0 || totalMaximumInput.value > 200) {
      errEls.totalMaximum.textContent = 'Valid total maximum marks is required (0-200).';
      valid = false;
    }
    
    return valid;
  }