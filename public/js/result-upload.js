(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const maxBytes = 15 * 1024 * 1024;
  let activePreview = null;
  let isSaving = false;
  let isUploading = false;
  let isValidating = false;
  let validationSequence = 0;
  const mimeByExtension = {
    '.pdf': ['application/pdf', 'application/octet-stream'],
    '.xls': ['application/vnd.ms-excel', 'application/octet-stream'],
    '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream']
  };

  async function loadBatches() {
    const response = await window.apiFetch('/api/batches');
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.message || 'Could not load batches.');
    const select = $('batchSelect'); select.replaceChildren(new Option('Select a batch…', ''));
    (payload.data || []).forEach((batch) => select.add(new Option(batch.batch_name || batch.batchName, batch.id)));
  }
  async function loadSemesters(batchId) {
    const select = $('semesterSelect'); select.replaceChildren(new Option(batchId ? 'Loading semesters…' : 'Select a batch first', ''));
    select.disabled = !batchId;
    if (!batchId) return;
    const response = await window.apiFetch(`/api/semesters/batch/${encodeURIComponent(batchId)}`);
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.message || 'Could not load semesters.');
    select.replaceChildren(new Option('Select a semester…', ''));
    (payload.data || []).forEach((semester) => select.add(new Option(`${semester.semester_name || semester.semesterName} (${semester.semester_number || semester.semesterNumber})`, semester.id)));
    select.disabled = false;
  }
  loadBatches().catch((error) => displayMessage(error.message, 'error'));
  $('batchSelect').addEventListener('change', () => {
    if (activePreview) { isValidating = true; $('sessionMapping').hidden = true; updateConfirmAvailability(); }
    loadSemesters($('batchSelect').value).catch((error) => {
      isValidating = false; updateConfirmAvailability(); displayMessage(error.message, 'error');
    });
  });
  $('semesterSelect').addEventListener('change', () => {
    if (activePreview) refreshSelectionValidation().catch((error) => { isValidating = false; updateConfirmAvailability(); displayMessage(error.message, 'error'); });
  });

  function displayMessage(message, kind = '') {
    const box = $('uploadMessage'); box.textContent = message; box.className = `upload-message ${kind}`; box.hidden = !message;
  }
  function addCell(row, value, className = '') {
    const cell = document.createElement('td'); cell.textContent = String(value ?? '—');
    if (className) cell.className = className;
    row.appendChild(cell); return cell;
  }
  function renderPreview(data) {
    $('previewFileName').textContent = `${data.fileName} · ${data.format.toUpperCase()}`;
    activePreview = data;
    renderValidation(data);
    $('previewPanel').hidden = false;
    $('sessionMapping').hidden = true;
    $('sessionChoices').replaceChildren();
    $('confirmUploadBtn').disabled = true;
    $('previewSaveStatus').textContent = 'Awaiting review';
    loadSessions(data).catch((error) => displayMessage(error.message, 'error'));
  }

  function renderValidation(data) {
    $('totalRecordCount').textContent = data.totalExtractedRecords;
    $('validRecordCount').textContent = data.validCount;
    $('invalidRecordCount').textContent = data.invalidCount;
    $('duplicateRecordCount').textContent = data.duplicateCount || data.records.filter((record) => record.duplicateOriginal).length || 0;
    const errors = $('documentErrors'); errors.replaceChildren();
    if (data.validationErrors?.length) {
      const list = document.createElement('ul');
      data.validationErrors.forEach((message) => { const item = document.createElement('li'); item.textContent = message; list.appendChild(item); });
      errors.appendChild(list); errors.hidden = false;
    } else errors.hidden = true;
    const validBody = $('previewRowsValid'); validBody.replaceChildren();
    const invalidBody = $('previewRowsInvalid'); invalidBody.replaceChildren();
    const appendRecord = (record, body) => {
      const row = document.createElement('tr'); row.className = `${record.valid ? 'preview-valid' : 'preview-invalid'}${record.duplicateOriginal ? ' duplicate-result' : ''}`;
      addCell(row, record.usn); addCell(row, record.studentName); addCell(row, record.semesterName ? `${record.semesterNumber} · ${record.semesterName}` : record.semesterNumber);
      addCell(row, record.subjectCode); addCell(row, record.subjectName); addCell(row, record.internalMarks);
      addCell(row, record.externalMarks); addCell(row, record.total); addCell(row, record.resultStatus);
      addCell(row, record.examSessionName || '—');
      const validationCell = addCell(row, '', 'validation-cell');
      if (record.valid) { validationCell.textContent = record.validationWarnings?.length ? 'Valid with warnings' : 'Valid'; validationCell.classList.add(record.validationWarnings?.length ? 'validation-warning' : 'record-valid'); }
      else {
        const list = document.createElement('ul'); list.className = 'validation-list';
        record.validationErrors.forEach((message) => { const item = document.createElement('li'); item.textContent = message; list.appendChild(item); });
        validationCell.appendChild(list);
      }
      if (record.validationWarnings?.length) {
        const list = document.createElement('ul'); list.className = 'validation-list warning-list';
        record.validationWarnings.forEach((message) => { const item = document.createElement('li'); item.textContent = message; list.appendChild(item); });
        validationCell.appendChild(list);
      }
      body.appendChild(row);
    };
    for (const record of data.validRecords) appendRecord(record, validBody);
    for (const record of data.invalidRecords) appendRecord(record, invalidBody);
    if (!data.validRecords.length) { const row = document.createElement('tr'); const cell = addCell(row, 'No valid records.'); cell.colSpan = 11; validBody.appendChild(row); }
    if (!data.invalidRecords.length) { const row = document.createElement('tr'); const cell = addCell(row, 'No invalid records.'); cell.colSpan = 11; invalidBody.appendChild(row); }
  }

  async function loadSessions(data) {
    if (!data.records?.length) return;
    const response = await window.apiFetch(`/api/result-uploads/sessions?uploadToken=${encodeURIComponent(data.uploadToken)}`);
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.message || 'Could not load exam sessions.');
    if (activePreview?.uploadToken !== data.uploadToken) return;
    const sessions = payload.data.sessions || [];
    const choices = $('sessionChoices'); choices.replaceChildren();
    const semesters = new Map();
    data.records.forEach((record) => { if (record.semesterId) semesters.set(Number(record.semesterId), record); });
    for (const [semesterId, record] of semesters) {
      const group = document.createElement('label'); group.className = 'session-choice';
      const title = document.createElement('span'); title.textContent = `${record.semesterNumber} · ${record.semesterName || `Semester ${record.semesterNumber}`}`;
      const select = document.createElement('select'); select.dataset.semesterId = String(semesterId); select.required = true;
      const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Choose an existing exam session'; select.appendChild(placeholder);
      sessions.filter((session) => session.semesterId === semesterId).forEach((session) => {
        const option = document.createElement('option'); option.value = String(session.id);
        option.textContent = `${session.sessionName}${session.status === 'Inactive' ? ' (inactive)' : ''}`;
        select.appendChild(option);
      });
      select.addEventListener('change', () => {
        updateConfirmAvailability();
        validateSelectedSessions().catch((error) => displayMessage(error.message, 'error'));
      });
      group.append(title, select); choices.appendChild(group);
    }
    $('sessionMapping').hidden = false;
    updateConfirmAvailability();
    if (!sessions.length) displayMessage('No existing exam sessions are available for the validated semester(s). Create an exam session first.', 'error');
  }

  function updateConfirmAvailability() {
    const selects = [...$('sessionChoices').querySelectorAll('select')];
    $('confirmUploadBtn').disabled = isSaving || isValidating || !activePreview || !activePreview.validCount || activePreview.invalidCount > 0 ||
      !selects.length || selects.some((select) => !select.value);
  }

  async function validateSelectedSessions() {
    if (!activePreview) return;
    const selects = [...$('sessionChoices').querySelectorAll('select')];
    if (!selects.length || selects.some((select) => !select.value)) return;
    const requestId = ++validationSequence;
    const sessionMappings = Object.fromEntries(selects.map((select) => [select.dataset.semesterId, select.value]));
    isValidating = true; updateConfirmAvailability();
    $('previewSaveStatus').textContent = 'Checking original results…';
    try {
      const response = await window.apiFetch('/api/result-uploads/validate-session', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ uploadToken: activePreview.uploadToken, sessionMappings })
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || 'Could not validate the selected exam session.');
      if (requestId !== validationSequence || !activePreview) return;
      activePreview = { ...activePreview, ...payload.data };
      renderValidation(activePreview);
      $('previewSaveStatus').textContent = activePreview.duplicateCount ? `${activePreview.duplicateCount} duplicate result row(s) found` : 'Validation complete';
    } finally {
      if (requestId === validationSequence) { isValidating = false; updateConfirmAvailability(); }
    }
  }

  async function refreshSelectionValidation() {
    if (!activePreview || !$('batchSelect').value || !$('semesterSelect').value) return;
    const requestId = ++validationSequence;
    isValidating = true; updateConfirmAvailability();
    try {
      const response = await window.apiFetch('/api/result-uploads/revalidate-selection', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ uploadToken: activePreview.uploadToken, batchId: $('batchSelect').value, semesterId: $('semesterSelect').value })
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || 'Could not refresh validation.');
      if (requestId !== validationSequence || !activePreview) return;
      activePreview = payload.data;
      renderValidation(activePreview);
      $('sessionChoices').replaceChildren(); $('sessionMapping').hidden = true;
      await loadSessions(activePreview);
    } finally {
      if (requestId === validationSequence) { isValidating = false; updateConfirmAvailability(); }
    }
  }

  async function cancelCurrentPreview() {
    const token = activePreview?.uploadToken;
    activePreview = null;
    $('sessionMapping').hidden = true;
    $('previewPanel').hidden = true;
    $('previewRowsValid').replaceChildren(); $('previewRowsInvalid').replaceChildren();
    $('sessionChoices').replaceChildren();
    $('resultFile').value = '';
    displayMessage('');
    if (token) {
      try { await window.apiFetch('/api/result-uploads/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uploadToken: token }) }); }
      catch (_) { /* local cancellation still discards the preview */ }
    }
    displayMessage('Upload cancelled. No results were saved.', 'success');
  }

  function validateSelection(file) {
    if (!$('batchSelect').value || !$('semesterSelect').value) return 'Select both a batch and semester before uploading.';
    if (!file) return 'Choose a VTU result file first.';
    const extension = `.${file.name.split('.').pop().toLowerCase()}`;
    if (!Object.prototype.hasOwnProperty.call(mimeByExtension, extension)) return 'Use a PDF, XLS or XLSX file.';
    if (!mimeByExtension[extension].includes(file.type.toLowerCase())) return 'The selected file type does not match its extension.';
    if (file.size <= 0 || file.size > maxBytes) return 'Choose a non-empty file no larger than 15 MB.';
    return '';
  }

  $('resultPreviewForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isSaving || isUploading) return;
    const file = $('resultFile').files[0];
    const problem = validateSelection(file);
    if (problem) { displayMessage(problem, 'error'); return; }
    isUploading = true;
    $('previewResultBtn').disabled = true; $('clearResultBtn').disabled = true; $('resultFile').disabled = true;
    if (activePreview?.uploadToken) await cancelCurrentPreview();
    displayMessage(''); $('previewPanel').hidden = true;
    const formData = new FormData(); formData.append('resultFile', file, file.name);
    formData.append('batchId', $('batchSelect').value); formData.append('semesterId', $('semesterSelect').value);
    $('uploadLoading').hidden = false;
    try {
      const response = await window.apiFetch('/api/result-uploads/preview', { method: 'POST', body: formData, headers: { Accept: 'application/json' } });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || `Upload failed (${response.status}).`);
      renderPreview(payload.data);
      displayMessage(`Preview ready: ${payload.data.validCount} valid and ${payload.data.invalidCount} invalid records. Nothing was saved.`, 'success');
    } catch (error) { displayMessage(error.message || 'The result file could not be processed.', 'error'); }
    finally {
      isUploading = false; $('uploadLoading').hidden = true; $('previewResultBtn').disabled = false;
      $('clearResultBtn').disabled = false; $('resultFile').disabled = false;
    }
  });

  $('clearResultBtn').addEventListener('click', (event) => { event.preventDefault(); cancelCurrentPreview(); });
  $('cancelUploadBtn').addEventListener('click', cancelCurrentPreview);
  $('confirmUploadBtn').addEventListener('click', async () => {
    if (!activePreview || isSaving) return;
    const sessionMappings = Object.fromEntries([...$('sessionChoices').querySelectorAll('select')].map((select) => [select.dataset.semesterId, select.value]));
    if (!activePreview.validCount || activePreview.invalidCount || Object.values(sessionMappings).some((value) => !value)) return;
    isSaving = true; $('confirmUploadBtn').disabled = true; $('cancelUploadBtn').disabled = true;
    $('previewResultBtn').disabled = true; $('clearResultBtn').disabled = true; $('resultFile').disabled = true;
    displayMessage('Saving the complete upload in one transaction…');
    try {
      const response = await window.apiFetch('/api/result-uploads/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ uploadToken: activePreview.uploadToken, sessionMappings })
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || `Save failed (${response.status}).`);
      $('previewSaveStatus').textContent = `${payload.data.savedCount} results saved`;
      $('sessionMapping').hidden = true;
      activePreview = null;
      displayMessage(payload.message, 'success');
    } catch (error) {
      displayMessage(error.message || 'The upload was not saved.', 'error');
    } finally {
      isSaving = false; $('cancelUploadBtn').disabled = false; $('previewResultBtn').disabled = false;
      $('clearResultBtn').disabled = false; $('resultFile').disabled = false; updateConfirmAvailability();
    }
  });
})();
