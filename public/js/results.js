document.addEventListener('DOMContentLoaded', () => {
  const body = document.getElementById('resultsTableBody');
  const searchInput = document.getElementById('resultSearch');
  const message = document.getElementById('pageMessage');
  if (!body) return;

  let requestNumber = 0;
  let debounceTimer;

  const setMessage = (text, type = 'info') => {
    if (!message) return;
    message.textContent = text;
    message.className = `status-banner status-${type}`;
    message.style.display = text ? '' : 'none';
  };

  const addCell = (row, text, className = '') => {
    const cell = document.createElement('td');
    cell.textContent = text == null || text === '' ? '—' : String(text);
    if (className) cell.className = className;
    row.appendChild(cell);
    return cell;
  };

  const showPlaceholder = (text) => {
    body.replaceChildren();
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 8;
    cell.className = 'empty-row';
    cell.textContent = text;
    row.appendChild(cell);
    body.appendChild(row);
  };

  const renderResults = (results) => {
    body.replaceChildren();
    if (!results.length) {
      showPlaceholder('No result records found.');
      return;
    }

    results.forEach((result) => {
      const row = document.createElement('tr');
      addCell(row, result.usn);
      addCell(row, result.student_name || result.studentName);

      const subject = document.createElement('td');
      const code = document.createElement('span');
      code.className = 'result-subject-code';
      code.textContent = result.subject_code || '—';
      const name = document.createElement('span');
      name.className = 'result-subject-name';
      name.textContent = result.subject_name || '';
      subject.append(code, name);
      row.appendChild(subject);

      addCell(row, result.marks_obtained);
      addCell(row, result.max_marks);
      addCell(row, result.grade);

      const statusCell = document.createElement('td');
      const badge = document.createElement('span');
      const passed = String(result.status || '').toLowerCase() === 'pass';
      badge.className = `result-status-badge ${passed ? 'is-pass' : 'is-fail'}`;
      badge.textContent = result.status || '—';
      statusCell.appendChild(badge);
      row.appendChild(statusCell);

      const semester = result.semester_name || (result.semester_number ? `Semester ${result.semester_number}` : '');
      addCell(row, [result.session_name, semester].filter(Boolean).join(' · '));
      body.appendChild(row);
    });
  };

  const loadResults = async () => {
    const currentRequest = ++requestNumber;
    showPlaceholder('Loading result records…');
    setMessage('');
    const search = searchInput ? searchInput.value.trim() : '';
    const query = search ? `?search=${encodeURIComponent(search)}` : '';

    try {
      const response = await fetch(`/api/results${query}`, { credentials: 'include' });
      if (response.status === 401 || response.status === 403) {
        window.location.href = '/login.html';
        return;
      }
      const payload = await response.json();
      if (currentRequest !== requestNumber) return;
      if (!response.ok || payload.success === false) {
        throw new Error(payload.message || 'Could not load result records.');
      }
      const results = Array.isArray(payload.data) ? payload.data : (Array.isArray(payload) ? payload : []);
      renderResults(results);
    } catch (error) {
      if (currentRequest !== requestNumber) return;
      showPlaceholder('Result records could not be loaded.');
      setMessage(error.message || 'Could not load result records. Please try again.', 'error');
    }
  };

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(loadResults, 250);
    });
  }

  loadResults();
});
