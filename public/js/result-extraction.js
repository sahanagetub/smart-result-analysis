(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const state = { preview: null, validation: null, editedStudents: null, pdfUrl: null, extracting: false, validating: false, saving: false, saved: false };
  const maxPdfBytes = 15 * 1024 * 1024;

  function message(text, kind = '') {
    const box = $('extractionMessage');
    box.textContent = text;
    box.className = `extraction-message ${kind}`;
    box.hidden = !text;
  }

  function showSourcePdf(file) {
    if (state.pdfUrl) URL.revokeObjectURL(state.pdfUrl);
    state.pdfUrl = URL.createObjectURL(file);
    $('pdfPreviewFrame').src = state.pdfUrl;
    $('openPdfLink').href = state.pdfUrl;
    $('openPdfLink').hidden = false;
  }

  function clearSourcePdf() {
    if (state.pdfUrl) URL.revokeObjectURL(state.pdfUrl);
    state.pdfUrl = null;
    $('pdfPreviewFrame').src = 'about:blank';
    $('openPdfLink').removeAttribute('href');
    $('openPdfLink').hidden = true;
  }

  function selectedSemesterId() {
    const option = $('sessionSelect').selectedOptions[0];
    return String(option?.dataset.semesterId || option?.dataset.semester_id || '');
  }

  function clearStoredReview() {
    try { sessionStorage.removeItem('sra.result-extraction-confirmation'); } catch (_) { /* storage may be disabled */ }
  }

  function updateConfirmationAvailability() {
    const button = $('phase16ConfirmButton');
    if (!button) return;
    const validSubjects = state.validation?.validRecords?.reduce((sum, record) => sum + record.subjects.filter((subject) => subject.valid).length, 0) || 0;
    button.disabled = state.saving || state.saved || !state.preview || !state.validation || validSubjects < 1;
  }

  function invalidateValidation(text) {
    if (!state.preview || state.saved || state.saving) return;
    state.preview = null;
    state.validation = null;
    state.editedStudents = null;
    clearStoredReview();
    $('extractionPreview').hidden = true;
    $('validationResults').hidden = true;
    $('studentPreviews').replaceChildren();
    $('invalidStudentPreviews').replaceChildren();
    clearSourcePdf();
    updateConfirmationAvailability();
    message(text || 'The selection changed. Validate the preview again before saving.', '');
  }

  async function loadOptions(url, select, placeholder, label) {
    select.replaceChildren(new Option(placeholder, ''));
    select.disabled = true;
    if (!url) return;
    const response = await window.apiFetch(url);
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.message || `Unable to load ${label}.`);
    (payload.data || []).forEach((item) => {
      const option = new Option(label(item), item.id);
      const semesterId = item.semesterId ?? item.semester_id;
      if (semesterId) option.dataset.semesterId = String(semesterId);
      select.add(option);
    });
    select.disabled = false;
  }

  async function loadBatches() {
    await loadOptions('/api/result-extractions/batches', $('batchSelect'), 'Select a batch…', (row) => row.batch_name || row.batchName);
  }

  $('batchSelect').addEventListener('change', async () => {
    invalidateValidation('Batch changed. Select an exam session, then upload the marks card again.');
    $('semesterSelect').replaceChildren(new Option('', ''));
    $('sessionSelect').replaceChildren(new Option('Select a batch first', ''));
    $('semesterSelect').disabled = true; $('sessionSelect').disabled = true;
    try {
      if ($('batchSelect').value) await loadOptions(`/api/result-extractions/batches/${encodeURIComponent($('batchSelect').value)}/exam-sessions`, $('sessionSelect'), 'Select an exam session…', (row) => `Semester ${row.semesterNumber} · ${row.sessionName}`);
    } catch (error) { message(error.message, 'error'); }
  });

  $('sessionSelect').addEventListener('change', () => {
    const semesterId = selectedSemesterId();
    $('semesterSelect').replaceChildren(new Option('', ''), new Option('', semesterId));
    $('semesterSelect').value = semesterId;
    $('semesterSelect').disabled = !semesterId;
    invalidateValidation('Exam session changed. Upload the marks card again to create a new preview.');
  });

  function makeField(labelText, value, field, type = 'text') {
    const label = document.createElement('label'); label.className = 'review-field';
    label.appendChild(document.createTextNode(labelText));
    const input = document.createElement('input');
    input.type = type; input.value = value ?? ''; input.dataset.field = field;
    if (type === 'number') { input.min = '0'; input.step = '0.01'; }
    if (field === 'extractedSemester') { input.min = '1'; input.max = '12'; input.step = '1'; }
    input.readOnly = !['internalMarks', 'externalMarks', 'usn', 'name'].includes(field);
    label.appendChild(input);
    return label;
  }

  function makeStaticField(value, field, className = '') {
    const element = document.createElement('span');
    element.dataset.field = field;
    element.dataset.value = value ?? '';
    element.textContent = value ?? '';
    if (className) element.className = className;
    return element;
  }

  function fieldValue(element) {
    if (!element) return '';
    return 'value' in element ? element.value : (element.dataset.value ?? element.textContent ?? '');
  }

  function setFieldValue(element, value) {
    if (!element) return;
    if ('value' in element) element.value = value;
    else { element.dataset.value = value; element.textContent = value; }
  }

  function makeMarkField(labelText, value, field, maximum) {
    const label = makeField(labelText, value, field, 'number');
    const maxText = document.createElement('small');
    maxText.className = 'mark-maximum';
    maxText.textContent = `max ${maximum ?? '—'}`;
    label.appendChild(maxText);
    return label;
  }

  function updateSubjectTotals(row) {
    const get = (field) => row.querySelector(`[data-field="${field}"]`);
    const internalText = fieldValue(get('internalMarks'));
    const externalText = fieldValue(get('externalMarks'));
    const internal = Number(internalText); const external = Number(externalText);
    const total = get('totalMarks'); const status = get('result');
    if (!internalText.trim() || !externalText.trim() || !Number.isFinite(internal) || !Number.isFinite(external) || internal < 0 || external < 0) {
      setFieldValue(total, ''); setFieldValue(status, '');
      if (status) status.className = 'result-status-badge';
      return;
    }
    const combined = Math.round((internal + external) * 100) / 100;
    setFieldValue(total, String(combined));
    if (status) {
      const passed = internal >= 25 && external >= 20 && combined >= 50;
      setFieldValue(status, passed ? 'P' : 'F');
      status.textContent = passed ? 'PASS' : 'FAIL';
      status.className = `result-status-badge ${passed ? 'is-pass' : 'is-fail'}`;
    }
  }

  function makeStatusBadge(value) {
    const normalized = String(value || '').toUpperCase();
    const badge = makeStaticField(normalized, 'result', `result-status-badge ${normalized === 'P' ? 'is-pass' : normalized === 'F' ? 'is-fail' : ''}`);
    badge.textContent = normalized === 'P' ? 'PASS' : normalized === 'F' ? 'FAIL' : '—';
    return badge;
  }

  function makeStatusSelect(value) {
    const label = document.createElement('label'); label.className = 'review-field';
    label.appendChild(document.createTextNode('Result status'));
    const select = document.createElement('select'); select.dataset.field = 'result';
    [['', 'Select'], ['P', 'Pass (P)'], ['F', 'Fail (F)']].forEach(([optionValue, text]) => {
      const option = new Option(text, optionValue); select.add(option);
    });
    select.value = value || '';
    label.appendChild(select);
    return label;
  }

  function renderStudents(target, students, validationRecords = null, readOnly = false) {
    target.replaceChildren();
    students.forEach((student, studentIndex) => {
      const validation = validationRecords?.[studentIndex] || null;
      const card = document.createElement('article');
      card.className = `student-preview-card ${validation ? (validation.valid ? 'record-valid-card' : 'record-invalid-card') : 'record-pending-card'}`;
      card.dataset.studentIndex = String(studentIndex);
      card.dataset.extractedSemester = student.extractedSemester ?? '';

      const meta = document.createElement('div'); meta.className = 'student-meta';
      meta.append(
        makeField('USN *', student.student?.usn, 'usn'),
        makeField('Student Name *', student.student?.name, 'name'),
        makeField('Attempt No *', student.attemptNo || 1, 'attemptNo', 'number')
      );
      card.appendChild(meta);
      const attemptHint = document.createElement('p'); attemptHint.className = 'attempt-hint';
      attemptHint.textContent = 'For this student and semester: Regular 1, Backlog 2, 3 and onward across exam sessions.';
      card.appendChild(attemptHint);
      if (validation?.errors?.length) card.appendChild(errorList(validation.errors, 'student-errors'));
      if (validation?.warnings?.length) card.appendChild(errorList(validation.warnings, 'student-warnings'));

      const resultsTitle = document.createElement('h4'); resultsTitle.className = 'review-section-title subject-results-title';
      const resultsLabel = document.createElement('span'); resultsLabel.textContent = 'Subject Results';
      const resultsCount = document.createElement('span'); resultsCount.textContent = `${student.subjects.length} subjects`;
      resultsTitle.append(resultsLabel, resultsCount); card.appendChild(resultsTitle);
      const tableWrap = document.createElement('div'); tableWrap.className = 'subject-table-wrap';
      const table = document.createElement('table'); table.className = 'data-table subject-table';
      const head = document.createElement('thead'); const headerRow = document.createElement('tr');
      ['Code', 'Subject', 'Internal', 'External', 'Total', 'Status'].forEach((label) => {
        const th = document.createElement('th'); th.textContent = label; headerRow.appendChild(th);
      });
      head.appendChild(headerRow); table.appendChild(head);
      const body = document.createElement('tbody');
      student.subjects.forEach((subject, subjectIndex) => {
        const subjectValidation = validation?.subjects?.[subjectIndex];
        const row = document.createElement('tr'); row.dataset.subjectIndex = String(subjectIndex);
        if (subjectValidation && !subjectValidation.valid) row.classList.add('needs-review');
        [
          makeStaticField(subject.subjectCode, 'subjectCode', 'subject-code-value'),
          makeStaticField(subject.subjectName, 'subjectName', 'subject-name-value'),
          makeMarkField('Internal', subject.internalMarks, 'internalMarks', subject.maxInternalMarks),
          makeMarkField('External', subject.externalMarks, 'externalMarks', subject.maxExternalMarks),
          makeStaticField(subject.totalMarks, 'totalMarks', 'result-total'),
          makeStatusBadge(subject.result)
        ].forEach((field) => { const cell = document.createElement('td'); cell.appendChild(field); row.appendChild(cell); });
        row.querySelector('[data-field="internalMarks"]').max = Number(subject.maxInternalMarks) > 0 ? String(subject.maxInternalMarks) : '';
        row.querySelector('[data-field="externalMarks"]').max = Number(subject.maxExternalMarks) > 0 ? String(subject.maxExternalMarks) : '';
        updateSubjectTotals(row); body.appendChild(row);
      });
      table.appendChild(body); tableWrap.appendChild(table); card.appendChild(tableWrap);
      const subjectIssues = student.subjects.flatMap((subject, subjectIndex) => {
        const issues = validation?.subjects?.[subjectIndex]?.errors || subject.errors || [];
        return issues.map((issue) => `${subject.subjectCode}: ${issue}`);
      });
      if (subjectIssues.length) card.appendChild(errorList(subjectIssues, 'subject-row-issues'));
      if (!validation && student.errors?.length) card.appendChild(errorList(student.errors, 'student-errors'));
      if (readOnly) card.querySelectorAll('input, select').forEach((field) => { field.disabled = true; });
      target.appendChild(card);
    });
  }
  function errorList(errors, className = '') {
    const list = document.createElement('ul'); if (className) list.className = className;
    errors.forEach((text) => { const item = document.createElement('li'); item.textContent = text; list.appendChild(item); });
    return list;
  }

  function readEditedStudents() {
    return state.preview.students.map((student, studentIndex) => {
      const card = $('studentPreviews').querySelector(`[data-student-index="${studentIndex}"]`);
      const value = (field) => fieldValue(card.querySelector(`[data-field="${field}"]`));
      return {
        ...student,
        student: { ...student.student, name: value('name').trim(), usn: value('usn').trim() },
        extractedSemester: card.dataset.extractedSemester,
        subjects: student.subjects.map((subject, subjectIndex) => {
          const row = card.querySelector(`[data-subject-index="${subjectIndex}"]`);
          const rowValue = (field) => fieldValue(row.querySelector(`[data-field="${field}"]`));
          return {
            ...subject,
            subjectCode: rowValue('subjectCode').trim(), subjectName: rowValue('subjectName').trim(),
            internalMarks: rowValue('internalMarks'), externalMarks: rowValue('externalMarks'),
            totalMarks: rowValue('totalMarks'), result: rowValue('result')
          };
        })
      };
    });
  }

  function renderValidation(data, editedStudents) {
    const records = data.records || [];
    $('validationSummary').replaceChildren();
    const summary = document.createElement('p');
    summary.textContent = `${data.totalCount} student record(s): ${data.validCount} valid, ${data.invalidCount} invalid. No results were saved.`;
    summary.className = data.invalidCount ? 'validation-error' : 'validation-ok';
    $('validationSummary').appendChild(summary);
    const pairs = records.map((record, index) => {
      const source = editedStudents[index] || { student: record.student, extractedSemester: record.extractedSemester, subjects: record.subjects };
      return {
        record,
        student: { ...source, student: record.student, extractedSemester: record.extractedSemester,
          subjects: source.subjects.map((subject, subjectIndex) => ({ ...subject, ...record.subjects[subjectIndex] })) }
      };
    });
    const invalid = pairs.filter(({ record }) => !record.valid);
    renderStudents($('invalidStudentPreviews'), invalid.map((pair) => pair.student), invalid.map((pair) => pair.record), true);
    $('validationResults').hidden = false;
  }

  async function runValidation() {
    if (!state.preview || state.validating || state.saving || state.saved) return;
    state.validating = true; $('validateButton').disabled = true; $('validateButton').textContent = 'Validating…';
    $('validationResults').hidden = true;
    message('Checking student, batch, semester, exam session, subject codes and marks…');
    try {
      const payloadBody = {
        selection: {
          batchId: $('batchSelect').value,
          semesterId: selectedSemesterId(),
          examSessionId: $('sessionSelect').value
        },
        students: readEditedStudents()
      };
      const selectedText = (id) => $(id).selectedOptions[0]?.textContent || '';
      $('previewContext').textContent = `${selectedText('batchSelect')} · ${selectedText('sessionSelect')}`;
      const response = await window.apiFetch('/api/result-extractions/validate', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payloadBody)
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || 'Unable to validate these extracted results.');
      const selectionChanged = payloadBody.selection.batchId !== $('batchSelect').value ||
        payloadBody.selection.semesterId !== selectedSemesterId() || payloadBody.selection.examSessionId !== $('sessionSelect').value;
      if (selectionChanged || JSON.stringify(readEditedStudents()) !== JSON.stringify(payloadBody.students)) {
        throw new Error('The preview changed while validation was running. Validate the latest values again.');
      }
      state.validation = payload.data;
      state.editedStudents = payloadBody.students;
      if (payload.data.validCount > 0) {
        try {
          const reviewPageData = {
            selection: payload.data.selection,
            context: payload.data.context,
            totalCount: payload.data.totalCount,
            validCount: payload.data.validCount,
            invalidCount: payload.data.invalidCount,
            validRecords: payload.data.validRecords,
            invalidRecords: payload.data.invalidRecords
          };
          sessionStorage.setItem('sra.result-extraction-confirmation', JSON.stringify(reviewPageData));
          window.location.assign('/results/extract/confirm');
          return;
        } catch (_) {
          message('Could not open the confirmation page in this browser tab. Try a smaller upload.', 'error');
        }
      }
      renderValidation(payload.data, payloadBody.students);
      updateConfirmationAvailability();
      message(payload.message || 'Validation complete. No results were saved.', payload.data.invalidCount ? 'error' : 'success');
    } catch (error) {
      message(error.message || 'Validation failed. No results were saved.', 'error');
    } finally {
      state.validating = false; $('validateButton').disabled = state.saved; $('validateButton').textContent = 'Validate extracted results';
    }
  }

  $('studentPreviews').addEventListener('input', (event) => {
    if (!state.preview) return;
    clearStoredReview();
    if (['internalMarks', 'externalMarks'].includes(event.target.dataset.field)) updateSubjectTotals(event.target.closest('tr'));
    state.validation = null; $('validationResults').hidden = true;
    $('extractionErrors').hidden = true;
    updateConfirmationAvailability();
    message('Preview edited. Validate the updated values before review.', '');
  });
  $('studentPreviews').addEventListener('change', (event) => {
    if (!state.preview) return;
    clearStoredReview();
    if (['internalMarks', 'externalMarks'].includes(event.target.dataset.field)) updateSubjectTotals(event.target.closest('tr'));
    state.validation = null; $('validationResults').hidden = true;
    $('extractionErrors').hidden = true;
    updateConfirmationAvailability();
    message('Preview edited. Validate the updated values before review.', '');
  });

  $('extractionForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (state.extracting) return;
    const file = $('resultPdf').files[0];
    clearStoredReview();
    const semesterId = selectedSemesterId();
    if (!$('batchSelect').value || !semesterId || !$('sessionSelect').value) return message('Select a batch and exam session first.', 'error');
    if (!file || !file.name.toLowerCase().endsWith('.pdf') || file.size <= 0 || file.size > maxPdfBytes) return message('Choose a valid, non-empty PDF no larger than 15 MB.', 'error');
    state.extracting = true; $('extractButton').disabled = true; $('clearButton').disabled = true;
    $('extractionPreview').hidden = true; message('Uploading PDF and extracting student and subject rows…');
    showSourcePdf(file);
    const formData = new FormData();
    formData.append('resultPdf', file, file.name);
    formData.append('batchId', $('batchSelect').value);
    formData.append('semesterId', semesterId);
    formData.append('examSessionId', $('sessionSelect').value);
    try {
      const response = await window.apiFetch('/api/result-extractions/preview', { method: 'POST', body: formData, headers: { Accept: 'application/json' } });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || 'The PDF could not be extracted.');
      state.preview = payload.data; state.validation = null; state.editedStudents = null; state.saved = false;
      $('previewContext').textContent = `${payload.data.selection.batch.name} · Semester ${payload.data.selection.semester.number} · ${payload.data.selection.examSession.name}`;
      $('previewFileName').textContent = payload.data.fileName;
      $('subjectCount').textContent = `${payload.data.totalSubjectsExtracted} subject row(s) · ${payload.data.students.length} student(s)`;
      $('extractionErrors').replaceChildren();
      if (payload.data.extractionErrors?.length) {
        $('extractionErrors').appendChild(errorList(payload.data.extractionErrors)); $('extractionErrors').hidden = false;
      } else $('extractionErrors').hidden = true;
      $('validationResults').hidden = true;
      renderStudents($('studentPreviews'), payload.data.students);
      $('extractionPreview').hidden = false;
      updateConfirmationAvailability();
      message(`Extracted ${payload.data.totalSubjectsExtracted} subject row(s) for ${payload.data.students.length} student(s). Review or edit, then validate. Nothing was saved.`, 'success');
    } catch (error) { message(error.message || 'The PDF could not be extracted.', 'error'); }
    finally { state.extracting = false; $('extractButton').disabled = false; $('clearButton').disabled = false; }
  });

  $('validateButton').addEventListener('click', runValidation);
  $('clearButton').addEventListener('click', () => {
    state.preview = null; state.validation = null; state.editedStudents = null; state.saved = false;
    clearSourcePdf();
    $('extractionForm').reset(); $('resultPdf').value = '';
    $('extractionPreview').hidden = true; $('validationResults').hidden = true;
    $('studentPreviews').replaceChildren(); $('invalidStudentPreviews').replaceChildren();
    message('Preview cleared. No results were saved.', 'success');
    updateConfirmationAvailability();
  });

  loadBatches().catch((error) => message(error.message, 'error'));
})();
