async function loadSemestersForBatch(batchId) {
        try {
            const response = await fetch('/api/semesters?batchId=' + batchId, {
                headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') }
            });
            const data = await response.json();
            if (response.ok && data.data) {
                const semesterSelect = document.getElementById('semester_id');
                if (semesterSelect) {
                    semesterSelect.innerHTML = '<option value="">Select Semester</option>';
                    data.data.forEach(s => {
                        const opt = document.createElement('option');
                        opt.value = s.id;
                        opt.textContent = s.semester_name + ' (Sem ' + s.semester_number + ')';
                        semesterSelect.appendChild(opt);
                    });
                }
                const editSemester = document.getElementById('editSemesterId');
                if (editSemester) {
                    editSemester.innerHTML = '<option value="">Select Semester</option>';
                    data.data.forEach(s => {
                        const opt = document.createElement('option');
                        opt.value = s.id;
                        opt.textContent = s.semester_name + ' (Sem ' + s.semester_number + ')';
                        editSemester.appendChild(opt);
                    });
                }
            }
        } catch (err) { console.error('Load semesters error:', err); }
    }
//
// Exam Session Management JavaScript
// Phase 6 — Complete CRUD, Search/Filters, Batch/Semester Integration, Dashboard Stats
//
document.addEventListener('DOMContentLoaded', function() {
    // UI elements
    const userRoleEl = document.getElementById('userInfo');
    const userRole = userRoleEl ? userRoleEl.getAttribute('data-role') || 'Staff' : 'Staff';
    const canEditDelete = ['Admin', 'Staff'].includes(userRole);
    
    // Filter state
    const filters = {
        search: '',
        batchId: '',
        semesterId: '',
        year: '',
        status: ''
    };
    
    // DOM elements
    const tableBody = document.querySelector('#examSessionTable tbody');
    const searchInput = document.getElementById('examSessionSearch');
    const filterBatch = document.getElementById('filterBatch');
    const filterSemester = document.getElementById('filterSemester');
    const filterYear = document.getElementById('filterYear');
    const filterStatus = document.getElementById('filterStatus');
    const clearFiltersBtn = document.getElementById('clearFilters');
    const addBtn = document.getElementById('addExamSessionBtn');
    const form = document.getElementById('examSessionForm');
    const formId = document.getElementById('examSessionId');
    const notification = document.getElementById('notification');
    const loadingSpinner = document.querySelector('.loading-spinner');
    const statsContainer = document.querySelector('.exam-session-stats');
    
    // Load exam sessions with current filters
    async function loadExamSessions() {
        if (!tableBody) return;
        showLoading(true);
        const params = new URLSearchParams(filters);
        if (params.toString()) params.append('timestamp', Date.now());
        try {
            const response = await fetch('/api/exam-sessions?' + params.toString(), {
                headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') }
            });
            const data = await response.json();
            if (response.ok) { renderTable(data.data || []); }
            else { showNotification('error', data.message || 'Failed to load exam sessions'); }
        } catch (err) {
            console.error('Load error:', err);
            showNotification('error', 'Network error - please try again');
        } finally { showLoading(false); }
    }
    
    // Render table rows
    function renderTable(sessions) {
        if (!tableBody) return;
        if (sessions.length === 0) { tableBody.innerHTML = '<tr><td colspan="8" class="empty-state">No exam sessions found.</td></tr>'; return; }
        tableBody.innerHTML = sessions.map((s, i) => {
            const statusClass = s.status === 'Active' ? 'status-ok' : 'status-warning';
            return `<tr><td>${i + 1}</td><td><strong>${s.session_name}</strong></td><td>${s.batch_name || '—'}</td><td>${s.semester_name || '—'}</td><td>${s.start_date ? new Date(s.start_date).toLocaleDateString() : '—'} ${s.end_date ? ' - ' + new Date(s.end_date).toLocaleDateString() : ''}</td><td>${s.exam_year || '—'}</td><td><span class="status-badge ${statusClass}">${s.status}</span></td><td>${new Date(s.created_at).toLocaleDateString()}</td><td>${canEditDelete ? `<button class="action edit" data-id="${s.id}" title="Edit">✎</button><button class="action delete" data-id="${s.id}" title="Delete">🗑</button>` : ''}</td></tr>`;
        }).join('');
        if (canEditDelete) {
            tableBody.querySelectorAll('.edit').forEach(btn => { btn.addEventListener('click', () => loadForm(btn.dataset.id)); });
            tableBody.querySelectorAll('.delete').forEach(btn => { btn.addEventListener('click', () => confirmDelete(btn.dataset.id)); });
        }
    }
    
    function showForm(isAdd) {
        if (!form) return;
        formId.value = '';
        form.reset();
        if (isAdd) { form.classList.add('active'); const ss = form.querySelector('select[name="status"]'); if (ss) ss.value = 'Active'; }
        else { const modal = form.closest('.modal'); if (modal) modal.classList.add('active'); }
    }
    
    function hideForm() {
        const modal = form?.closest('.modal');
        if (modal) modal.classList.remove('active');
        else form.classList.remove('active');
        form.reset();
        formId.value = '';
    }
