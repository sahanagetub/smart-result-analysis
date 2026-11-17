document.addEventListener('DOMContentLoaded', () => {
  const dbStatusBanner = document.getElementById('dbStatusBanner');
  const pageMessage = document.getElementById('pageMessage');
  const semesterSelect = document.getElementById('semesterSelect');
  const addExamSessionBtn = document.getElementById('addExamSessionBtn');
  const cancelExamSessionBtn = document.getElementById('cancelExamSessionBtn');
  const addExamSessionForm = document.getElementById('addExamSessionForm');
  const examSessionForm = document.getElementById('examSessionForm');
  const examSessionsTableBody = document.getElementById('examSessionsTableBody');

  const examSessionSemesterId = document.getElementById('examSessionSemesterId');
  const examSessionId = document.getElementById('examSessionId');
  const sessionName = document.getElementById('sessionName');
  const startDate = document.getElementById('startDate');
  const endDate = document.getElementById('endDate');
  const sessionStatus = document.getElementById('sessionStatus');
  const saveExamSessionBtn = document.getElementById('saveExamSessionBtn');

  const errSessionName = document.getElementById('errSessionName');
  const errStartDate = document.getElementById('errStartDate');
  const errEndDate = document.getElementById('errEndDate');
  const errSessionStatus = document.getElementById('errSessionStatus');

  let currentSemesterId = '';
  let examSessions = [];
  let editId = null;

  function showMessage(text, type = 'info') {
    if (!pageMessage) return;
    pageMessage.className = 'status-banner status-' + type;
    pageMessage.textContent = text;
    pageMessage.style.display = 'block';
  }

  function clearErrors() {
    if (errSessionName) errSessionName.textContent = '';
    if (errStartDate) errStartDate.textContent = '';
    if (errEndDate) errEndDate.textContent = '';
    if (errSessionStatus) errSessionStatus.textContent = '';
    if (pageMessage) pageMessage.style.display = 'none';
  }

  async function loadSemesters() {
    try {
      const res = await fetch('/api/semesters', { credentials: 'include' });
      if (res.status === 401) { window.location.href = '/login'; return; }
      if (!res.ok) throw new Error('Failed to load semesters.');
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to load semesters.');

      const sems = data.data || [];
      semesterSelect.innerHTML = '<option value="">Select a semester...</option>';
      sems.forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s.id;
        const bName = s.batch_name ? ` (${s.batch_name})` : '';
        opt.textContent = `${s.semester_name} - Sem ${s.semester_number}${bName}`;
        semesterSelect.appendChild(opt);
      });

      const urlParams = new URLSearchParams(window.location.search);
      const querySem = urlParams.get('semesterId');
      if (querySem && sems.some((s) => s.id == querySem)) {
        semesterSelect.value = querySem;
        handleSemesterChange(querySem);
      }
    } catch (err) {
      console.error(err);
      showMessage('Could not load semesters.', 'error');
    }
  }

  async function handleSemesterChange(semId) {
    currentSemesterId = semId;
    hideForm();
    if (!semId) {
      if (addExamSessionBtn) addExamSessionBtn.style.display = 'none';
      examSessionsTableBody.innerHTML = '<tr><td colspan="6" class="empty-row">Select a semester to view exam sessions.</td></tr>';
      return;
    }
    if (addExamSessionBtn) addExamSessionBtn.style.display = 'inline-block';
    await loadExamSessions(semId);
  }

  async function loadExamSessions(semId) {
    if (!examSessionsTableBody) return;
    examSessionsTableBody.innerHTML = '<tr><td colspan="6" class="empty-row">Loading exam sessions...</td></tr>';
    try {
      const res = await fetch(`/api/exam-sessions/semester/${semId}`, { credentials: 'include' });
      if (res.status === 401) { window.location.href = '/login'; return; }
      if (!res.ok) throw new Error('Failed to load exam sessions.');
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to load exam sessions.');

      examSessions = data.data || [];
      renderExamSessions(examSessions);
    } catch (err) {
      examSessionsTableBody.innerHTML = '<tr><td colspan="6" class="empty-row">Error loading exam sessions.</td></tr>';
      showMessage(err.message, 'error');
      console.error(err);
    }
  }

  function renderExamSessions(list) {
    if (!examSessionsTableBody) return;
    if (!list || list.length === 0) {
      examSessionsTableBody.innerHTML = '<tr><td colspan="6" class="empty-row">No exam sessions found for this semester.</td></tr>';
      return;
    }
    examSessionsTableBody.innerHTML = '';
    list.forEach((s) => {
      const tr = document.createElement('tr');
      const statusClass = (s.status === 'Active') ? 'active' : 'inactive';
      const sDate = s.start_date ? new Date(s.start_date).toLocaleDateString() : '—';
      const eDate = s.end_date ? new Date(s.end_date).toLocaleDateString() : '—';
      const semLabel = s.semester_name ? `${s.semester_name} (Sem ${s.semester_number})` : '—';
      tr.innerHTML = `
        <td><strong>${escapeHtml(s.session_name)}</strong></td>
        <td>${escapeHtml(semLabel)}</td>
        <td>${sDate}</td>
        <td>${eDate}</td>
        <td><span class="status-badge ${statusClass}">${s.status}</span></td>
        <td>
          <button class="btn btn-link text-primary btn-sm edit-session" data-id="${s.id}">Edit</button>
          <button class="btn btn-link text-danger btn-sm delete-session" data-id="${s.id}" style="color:#dc2626; margin-left:8px;">Delete</button>
        </td>
      `;
      examSessionsTableBody.appendChild(tr);
    });

    examSessionsTableBody.querySelectorAll('.edit-session').forEach((btn) => {
      btn.addEventListener('click', () => openEditForm(btn.dataset.id));
    });
    examSessionsTableBody.querySelectorAll('.delete-session').forEach((btn) => {
      btn.addEventListener('click', () => deleteExamSession(btn.dataset.id));
    });
  }

  function showAddForm() {
    clearErrors();
    editId = null;
    examSessionForm.reset();
    examSessionSemesterId.value = currentSemesterId;
    examSessionId.value = '';
    sessionStatus.value = 'Active';
    const formHeader = addExamSessionForm.querySelector('.card-header h3');
    if (formHeader) formHeader.textContent = 'Add Exam Session';
    if (saveExamSessionBtn) saveExamSessionBtn.textContent = 'Save Exam Session';
    addExamSessionForm.style.display = 'block';
    addExamSessionForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function openEditForm(id) {
    const s = examSessions.find((x) => x.id == id);
    if (!s) return;
    clearErrors();
    editId = s.id;
    examSessionSemesterId.value = s.semester_id;
    examSessionId.value = s.id;
    sessionName.value = s.session_name || '';
    startDate.value = s.start_date ? s.start_date.substring(0, 10) : '';
    endDate.value = s.end_date ? s.end_date.substring(0, 10) : '';
    sessionStatus.value = s.status || 'Active';
    const formHeader = addExamSessionForm.querySelector('.card-header h3');
    if (formHeader) formHeader.textContent = 'Edit Exam Session';
    if (saveExamSessionBtn) saveExamSessionBtn.textContent = 'Update Exam Session';
    addExamSessionForm.style.display = 'block';
    addExamSessionForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function hideForm() {
    if (addExamSessionForm) addExamSessionForm.style.display = 'none';
    editId = null;
    if (examSessionForm) examSessionForm.reset();
    clearErrors();
  }

  async function deleteExamSession(id) {
    if (!confirm('Are you sure you want to delete this exam session?')) return;
    try {
      const res = await fetch(`/api/exam-sessions/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.status === 401) { window.location.href = '/login'; return; }
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to delete exam session.');
      showMessage(data.message || 'Exam session deleted.', 'success');
      loadExamSessions(currentSemesterId);
    } catch (err) {
      showMessage(err.message, 'error');
    }
  }

  if (semesterSelect) {
    semesterSelect.addEventListener('change', (e) => {
      handleSemesterChange(e.target.value);
    });
  }

  if (addExamSessionBtn) {
    addExamSessionBtn.addEventListener('click', showAddForm);
  }

  if (cancelExamSessionBtn) {
    cancelExamSessionBtn.addEventListener('click', hideForm);
  }

  if (examSessionForm) {
    examSessionForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors();

      const nameVal = sessionName.value.trim();
      const sDateVal = startDate.value || null;
      const eDateVal = endDate.value || null;
      const statusVal = sessionStatus.value;

      let valid = true;
      if (!nameVal) {
        if (errSessionName) errSessionName.textContent = 'Session name is required.';
        valid = false;
      }
      if (sDateVal && eDateVal && new Date(eDateVal) < new Date(sDateVal)) {
        if (errEndDate) errEndDate.textContent = 'End date cannot be earlier than start date.';
        valid = false;
      }
      if (!currentSemesterId) {
        showMessage('Please select a semester first.', 'error');
        valid = false;
      }
      if (!valid) return;

      const payload = {
        semester_id: parseInt(currentSemesterId, 10),
        session_name: nameVal,
        start_date: sDateVal,
        end_date: eDateVal,
        status: statusVal
      };

      saveExamSessionBtn.disabled = true;
      saveExamSessionBtn.textContent = 'Saving...';
      try {
        const isEdit = !!editId;
        const url = isEdit ? `/api/exam-sessions/${editId}` : '/api/exam-sessions';
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

        showMessage(data.message || (isEdit ? 'Exam session updated.' : 'Exam session created.'), 'success');
        hideForm();
        loadExamSessions(currentSemesterId);
      } catch (err) {
        showMessage(err.message, 'error');
      } finally {
        saveExamSessionBtn.disabled = false;
        saveExamSessionBtn.textContent = editId ? 'Update Exam Session' : 'Save Exam Session';
      }
    });
  }

  loadSemesters();
});

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
