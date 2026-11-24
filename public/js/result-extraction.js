(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const state = { preview: null, validation: null, editedStudents: null, extracting: false, validating: false, saving: false, saved: false };
  const maxPdfBytes = 15 * 1024 * 1024;

  function message(text, kind = '') {
    const box = $('extractionMessage');
    box.textContent = text;
    box.className = `extraction-message ${kind}`;
    box.hidden = !text;
  }

  function updateConfirmationAvailability() {
    const validSubjects = state.validation?.validRecords?.reduce((sum, record) => sum + record.subjects.filter((subject) => subject.valid).length, 0) || 0;
    $('phase16ConfirmButton').disabled = state.saving || state.saved || !state.preview || !state.validation || validSubjects < 1;
  }

  function invalidateValidation(text) {
    if (!state.preview || state.saved || state.saving) return;
    state.validation = null;
    $('validationResults').hidden = true;
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
    (payload.data || []).forEach((item) => select.add(new Option(label(item), item.id)));
    select.disabled = false;
  }

  async function loadBatches() {
    await loadOptions('/api/result-extractions/batches', $('batchSelect'), 'Select a batch…', (row) => row.batch_name || row.batchName);
  }

  $('batchSelect').addEventListener('change', async () => {
    invalidateValidation('Batch changed. Select the semester and session, then validate again.');
    $('semesterSelect').replaceChildren(new Option('Select a batch first', ''));
    $('sessionSelect').replaceChildren(new Option('Select a semester first', ''));
    $('semesterSelect').disabled = true; $('sessionSelect').disabled = true;
    try {
      if ($('batchSelect').value) await loadOptions(`/api/result-extractions/batches/${encodeURIComponent($('batchSelect').value)}/semesters`, $('semesterSelect'), 'Select a semester…', (row) => `${row.semester_name || row.semesterName} (${row.semester_number || row.semesterNumber})`);
    } catch (error) { message(error.message, 'error'); }
  });

  $('semesterSelect').addEventListener('change', async () => {
    invalidateValidation('Semester changed. Select an exam session and validate again.');
    $('sessionSelect').replaceChildren(new Option('Select a semester first', ''));
    $('sessionSelect').disabled = true;
    try {
      if ($('semesterSelect').value) await loadOptions(`/api/result-extractions/semesters/${encodeURIComponent($('semesterSelect').value)}/exam-sessions`, $('sessionSelect'), 'Select an exam session…', (row) => row.session_name || row.sessionName);
    } catch (error) { message(error.message, 'error'); }
  });

  $('sessionSelect').addEventListener('change', () => invalidateValidation('Exam session changed. Validate the preview again before saving.'));

  function makeField(labelText, value, field, type = 'text') {
    const label = document.createElement('label'); label.className = 'review-field';
    label.appendChild(document.createTextNode(labelText));
    const input = document.createElement('input');
    input.type = type; input.value = value ?? ''; input.dataset.field = field;
    if (type === 'number') { input.min = '0'; input.step = '0.01'; }
    if (field === 'extractedSemester') { input.min = '1'; input.max = '12'; input.step = '1'; }
    label.appendChild(input);
    return label;
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
      const heading = document.createElement('div'); heading.className = 'student-card-heading';
      const title = document.createElement('h3'); title.textContent = student.student?.name || student.student?.usn || `Student ${studentIndex + 1}`;
      const status = document.createElement('span'); status.className = 'student-validation-status';
      status.textContent = validation ? (validation.valid ? 'Valid' : 'Invalid') : 'Needs validation';
      heading.append(title, status); card.appendChild(heading);

      const meta = document.createElement('div'); meta.className = 'student-meta';
      meta.append(
        makeField('Student name', student.student?.name, 'name'),
        makeField('USN', student.student?.usn, 'usn'),
        makeField('Batch', state.preview?.selection?.batch?.name || '', 'batchLabel'),
        makeField('Semester number', student.extractedSemester, 'extractedSemester', 'number')
      );
      const batchField = meta.querySelector('[data-field="batchLabel"]'); batchField.readOnly = true;
      card.appendChild(meta);

      if (validation?.errors?.length) card.appendChild(errorList(validation.errors, 'student-errors'));
      if (validation?.warnings?.length) card.appendChild(errorList(validation.warnings, 'student-warnings'));

      const tableWrap = document.createElement('div'); tableWrap.className = 'subject-table-wrap';
      const table = document.createElement('table'); table.className = 'data-table subject-table';
      const head = document.createElement('thead');
      const headerRow = document.createElement('tr');
      ['Subject code', 'Subject name', 'Internal (IA)', 'External (EX)', 'Total', 'Result', 'Validation'].forEach((text) => {
        const th = document.createElement('th'); th.textContent = text; headerRow.appendChild(th);
      });
      head.appendChild(headerRow); table.appendChild(head);
      const body = document.createElement('tbody');
      student.subjects.forEach((subject, subjectIndex) => {
        const subjectValidation = validation?.subjects?.[subjectIndex];
        const row = document.createElement('tr');
        row.dataset.subjectIndex = String(subjectIndex);
        if (subjectValidation && !subjectValidation.valid) row.classList.add('needs-review');
        [
          makeField('Code', subject.subjectCode, 'subjectCode'),
          makeField('Name', subject.subjectName, 'subjectName'),
          makeField('Internal (IA)', subject.internalMarks, 'internalMarks', 'number'),
          makeField('External (EX)', subject.externalMarks, 'externalMarks', 'number'),
          makeField('Total', subject.totalMarks, 'totalMarks', 'number'),
          makeStatusSelect(subject.result)
        ].forEach((field) => { const cell = document.createElement('td'); cell.appendChild(field); row.appendChild(cell); });
        const errorCell = document.createElement('td'); errorCell.className = 'row-errors';
        const rowErrors = subjectValidation?.errors || subject.errors || [];
        if (rowErrors.length) errorCell.appendChild(errorList(rowErrors));
        else errorCell.textContent = subjectValidation ? 'Valid' : 'Not validated';
        row.appendChild(errorCell); body.appendChild(row);
      });
      table.appendChild(body); tableWrap.appendChild(table); card.appendChild(tableWrap);
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
      const value = (field) => card.querySelector(`[data-field="${field}"]`)?.value ?? '';
      return {
        ...student,
        student: { ...student.student, name: value('name').trim(), usn: value('usn').trim() },
        extractedSemester: value('extractedSemester'),
        subjects: student.subjects.map((subject, subjectIndex) => {
          const row = card.querySelector(`[data-subject-index="${subjectIndex}"]`);
          const fieldValue = (field) => row.querySelector(`[data-field="${field}"]`)?.value ?? '';
          return {
            ...subject,
            subjectCode: fieldValue('subjectCode').trim(), subjectName: fieldValue('subjectName').trim(),
            internalMarks: fieldValue('internalMarks'), externalMarks: fieldValue('externalMarks'),
            totalMarks: fieldValue('totalMarks'), result: fieldValue('result')
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
    const valid = pairs.filter(({ record }) => record.valid);
    const invalid = pairs.filter(({ record }) => !record.valid);
    renderStudents($('validStudentPreviews'), valid.map((pair) => pair.student), valid.map((pair) => pair.record), true);
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
          semesterId: $('semesterSelect').value,
          examSessionId: $('sessionSelect').value
        },
        students: readEditedStudents()
      };
      const selectedText = (id) => $(id).selectedOptions[0]?.textContent || '';
      $('previewContext').textContent = `${selectedText('batchSelect')} · ${selectedText('semesterSelect')} · ${selectedText('sessionSelect')}`;
      const response = await window.apiFetch('/api/result-extractions/validate', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payloadBody)
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || 'Unable to validate these extracted results.');
      const selectionChanged = payloadBody.selection.batchId !== $('batchSelect').value ||
        payloadBody.selection.semesterId !== $('semesterSelect').value || payloadBody.selection.examSessionId !== $('sessionSelect').value;
      if (selectionChanged || JSON.stringify(readEditedStudents()) !== JSON.stringify(payloadBody.students)) {
        throw new Error('The preview changed while validation was running. Validate the latest values again.');
      }
      state.validation = payload.data;
      state.editedStudents = payloadBody.students;
      renderValidation(payload.data, payloadBody.students);
      updateConfirmationAvailability();
      message(payload.message || 'Validation complete. No results were saved.', payload.data.invalidCount ? 'error' : 'success');
    } catch (error) {
      message(error.message || 'Validation failed. No results were saved.', 'error');
    } finally {
      state.validating = false; $('validateButton').disabled = state.saved; $('validateButton').textContent = 'Validate extracted results';
    }
  }

  $('studentPreviews').addEventListener('input', () => {
    if (!state.preview) return;
    state.validation = null; $('validationResults').hidden = true;
    $('extractionErrors').hidden = true;
    updateConfirmationAvailability();
    message('Preview edited. Validate the updated values before review.', '');
  });
  $('studentPreviews').addEventListener('change', () => {
    if (!state.preview) return;
    state.validation = null; $('validationResults').hidden = true;
    $('extractionErrors').hidden = true;
    updateConfirmationAvailability();
    message('Preview edited. Validate the updated values before review.', '');
  });

  $('extractionForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (state.extracting) return;
    const file = $('resultPdf').files[0];
    if (!$('batchSelect').value || !$('semesterSelect').value || !$('sessionSelect').value) return message('Select a batch, semester and exam session first.', 'error');
    if (!file || !file.name.toLowerCase().endsWith('.pdf') || file.size <= 0 || file.size > maxPdfBytes) return message('Choose a valid, non-empty PDF no larger than 15 MB.', 'error');
    state.extracting = true; $('extractButton').disabled = true; $('clearButton').disabled = true;
    $('extractionPreview').hidden = true; message('Uploading PDF and extracting student and subject rows…');
    const formData = new FormData();
    formData.append('resultPdf', file, file.name);
    formData.append('batchId', $('batchSelect').value);
    formData.append('semesterId', $('semesterSelect').value);
    formData.append('examSessionId', $('sessionSelect').value);
    try {
      const response = await window.apiFetch('/api/result-extractions/preview', { method: 'POST', body: formData, headers: { Accept: 'application/json' } });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || 'The PDF could not be extracted.');
      state.preview = payload.data; state.validation = null; state.editedStudents = null; state.saved = false;
      $('saveSuccessSummary').hidden = true;
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
  $('phase16ConfirmButton').addEventListener('click', () => {
    if ($('phase16ConfirmButton').disabled || !state.validation) return;
    const validSubjects = state.validation.validRecords.reduce((sum, record) => sum + record.subjects.filter((subject) => subject.valid).length, 0);
    $('confirmTotalStudents').textContent = state.preview.students.length;
    $('confirmValidStudents').textContent = state.validation.validCount;
    $('confirmInvalidStudents').textContent = state.validation.invalidCount;
    $('confirmSubjectRecords').textContent = validSubjects;
    $('confirmDialog').showModal();
  });
  $('cancelConfirmationButton').addEventListener('click', () => $('confirmDialog').close());
  $('confirmSaveButton').addEventListener('click', async () => {
    if (state.saving || state.saved || !state.validation?.validRecords?.length) return;
    state.saving = true; $('confirmDialog').close(); updateConfirmationAvailability();
    $('confirmSaveButton').disabled = true; $('extractButton').disabled = true; $('clearButton').disabled = true;
    $('validateButton').disabled = true; message('Saving the validated results in one database transaction…');
    $('batchSelect').disabled = true; $('semesterSelect').disabled = true; $('sessionSelect').disabled = true;
    try {
      const response = await window.apiFetch('/api/result-extractions/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ selection: state.validation.selection, students: state.validation.validRecords })
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || 'The result batch was not saved.');
      state.saved = true;
      $('savedStudentCount').textContent = payload.data.processedStudentCount;
      $('savedRecordCount').textContent = payload.data.savedCount;
      $('savedFailedCount').textContent = payload.data.failedRecordCount;
      $('saveSuccessSummary').hidden = false;
      $('phase16ConfirmButton').disabled = true;
      $('studentPreviews').querySelectorAll('input, select').forEach((field) => { field.disabled = true; });
      message(payload.message || 'Results saved successfully.', 'success');
    } catch (error) {
      message(error.message || 'The result batch was not saved. You can review validation and retry.', 'error');
    } finally {
      state.saving = false; $('confirmSaveButton').disabled = false;
      $('extractButton').disabled = false; $('clearButton').disabled = false; $('validateButton').disabled = state.saved;
      $('batchSelect').disabled = false; $('semesterSelect').disabled = !$('batchSelect').value; $('sessionSelect').disabled = !$('semesterSelect').value;
      updateConfirmationAvailability();
    }
  });

  $('uploadAnotherButton').addEventListener('click', () => {
    state.preview = null; state.validation = null; state.editedStudents = null; state.saved = false;
    $('extractionForm').reset(); $('resultPdf').value = '';
    $('extractionPreview').hidden = true; $('saveSuccessSummary').hidden = true;
    $('studentPreviews').replaceChildren(); $('validStudentPreviews').replaceChildren(); $('invalidStudentPreviews').replaceChildren();
    updateConfirmationAvailability(); message('Choose another PDF to preview.', 'success');
  });
  $('clearButton').addEventListener('click', () => {
    state.preview = null; state.validation = null; state.editedStudents = null; state.saved = false;
    $('extractionForm').reset(); $('resultPdf').value = '';
    $('extractionPreview').hidden = true; $('validationResults').hidden = true;
    $('saveSuccessSummary').hidden = true;
    $('studentPreviews').replaceChildren(); message('Preview cleared. No results were saved.', 'success');
    updateConfirmationAvailability();
  });

  loadBatches().catch((error) => message(error.message, 'error'));
})();
