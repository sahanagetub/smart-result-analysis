(() => {
  const form = document.getElementById('generatorForm');
  if (!form) return;

  const batch = document.getElementById('batchId');
  const semester = document.getElementById('semesterId');
  const session = document.getElementById('examSessionId');
  const subjects = document.getElementById('subjectIds');
  const quantity = document.getElementById('quantity');
  const includeGeneratedAcademicItems = document.getElementById('includeGeneratedAcademicItems');
  const generatedSubjectCount = document.getElementById('generatedSubjectCount');
  const generatedSubjectCountGroup = document.getElementById('generatedSubjectCountGroup');
  const button = document.getElementById('generateBtn');
  const notice = document.getElementById('generatorNotice');
  const success = document.getElementById('generationStatus');
  const error = document.getElementById('errorStatus');
  const preview = document.getElementById('generationPreview');
  const csrf = document.getElementById('generatorCsrf').value;
  let options = { batches: [], semesters: [], examSessions: [], subjects: [] };
  let writeEnabled = false;

  const option = (label, value = '') => {
    const node = document.createElement('option');
    node.value = value;
    node.textContent = label;
    return node;
  };

  function fillSelect(element, items, getValue, getLabel, placeholder) {
    element.replaceChildren(option(placeholder));
    for (const item of items) element.appendChild(option(getLabel(item), String(getValue(item))));
    element.disabled = items.length === 0;
  }

  function refreshSemesters() {
    const rows = options.semesters.filter((row) => String(row.batch_id) === batch.value);
    fillSelect(semester, rows, (row) => row.id, (row) => `${row.semester_name} (Semester ${row.semester_number})`, 'Select semester');
    refreshSessionAndSubjects();
  }

  function refreshSessionAndSubjects() {
    const semesterId = semester.value;
    const sessionRows = options.examSessions.filter((row) => String(row.semester_id) === semesterId);
    const subjectRows = options.subjects.filter((row) => String(row.semester_id) === semesterId);
    fillSelect(session, sessionRows, (row) => row.id, (row) => row.session_name, 'Select exam session');
    subjects.replaceChildren();
    for (const row of subjectRows) subjects.appendChild(option(`${row.subject_code} — ${row.subject_name}`, String(row.id)));
    subjects.disabled = subjectRows.length === 0;
  }

  function renderPreview(data) {
    preview.replaceChildren();
    const summary = document.createElement('p');
    summary.textContent = `${data.students.length} synthetic students and ${data.resultCount} result records committed for ${data.batch.batch_name}, ${data.semester.semester_name}, ${data.examSession.session_name}.`;
    preview.appendChild(summary);
    if (data.generatedExamSession) {
      const sessionSummary = document.createElement('p');
      sessionSummary.textContent = `Created synthetic exam session: ${data.generatedExamSession.session_name}.`;
      preview.appendChild(sessionSummary);
      const subjectSummary = document.createElement('p');
      subjectSummary.textContent = `Created subjects: ${data.generatedSubjects.map((subject) => `${subject.subject_code} (${subject.subject_name})`).join(', ')}.`;
      preview.appendChild(subjectSummary);
    }
    const list = document.createElement('ul');
    for (const student of data.students) {
      const item = document.createElement('li');
      item.textContent = `${student.name} (${student.usn})`;
      list.appendChild(item);
    }
    preview.appendChild(list);
    preview.style.display = 'block';
  }

  batch.addEventListener('change', refreshSemesters);
  semester.addEventListener('change', refreshSessionAndSubjects);
  includeGeneratedAcademicItems.addEventListener('change', () => {
    generatedSubjectCountGroup.style.display = includeGeneratedAcademicItems.checked ? 'block' : 'none';
  });

  (async () => {
    notice.textContent = 'Loading available academic records…';
    try {
      const response = await fetch('/api/generator/options', { headers: { Accept: 'application/json' } });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.message || 'Unable to load generator options.');
      options = body.data;
      writeEnabled = body.generationEnabled === true;
      fillSelect(batch, options.batches, (row) => row.id, (row) => row.batch_name, 'Select batch');
      notice.textContent = writeEnabled
        ? 'Generation is enabled for the explicitly configured test database.'
        : 'Generation is disabled until a non-production test database is explicitly configured.';
      notice.setAttribute('role', writeEnabled ? 'status' : 'alert');
      button.disabled = !writeEnabled;
    } catch (loadError) {
      notice.textContent = loadError.message;
      notice.setAttribute('role', 'alert');
      button.disabled = true;
    }
  })();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.style.display = 'none';
    success.style.display = 'none';
    preview.style.display = 'none';
    if (!writeEnabled) {
      error.textContent = 'Generation is disabled for this database.';
      error.style.display = 'block';
      return;
    }
    button.disabled = true;
    button.textContent = 'Generating…';
    try {
      const payload = {
        batchId: batch.value,
        semesterId: semester.value,
        examSessionId: session.value,
        subjectIds: Array.from(subjects.selectedOptions, (item) => item.value),
        quantity: quantity.value,
        includeGeneratedAcademicItems: includeGeneratedAcademicItems.checked,
        generatedSubjectCount: generatedSubjectCount.value
      };
      const response = await fetch('/api/generator/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.message || 'Test data generation failed.');
      success.textContent = body.message;
      success.style.display = 'block';
      renderPreview(body.data);
    } catch (generationError) {
      error.textContent = generationError.message;
      error.style.display = 'block';
    } finally {
      button.disabled = !writeEnabled;
      button.textContent = 'Generate Test Data';
    }
  });
})();
