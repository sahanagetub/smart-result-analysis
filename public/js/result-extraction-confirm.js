(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const storageKey = 'sra.result-extraction-confirmation';
  let review = null;
  let saving = false;
  let saved = false;

  function message(text, kind = '') {
    const box = $('confirmationMessage');
    box.textContent = text;
    box.className = `extraction-message ${kind}`;
    box.hidden = !text;
  }

  function textCell(value, className = '') {
    const cell = document.createElement('td');
    if (className) cell.className = className;
    cell.textContent = value ?? '';
    return cell;
  }

  function renderStudent(record, index) {
    const card = document.createElement('article');
    card.className = 'student-preview-card record-valid-card';
    const meta = document.createElement('div');
    meta.className = 'confirm-student-meta';
    const usn = document.createElement('strong'); usn.textContent = `USN: ${record.student?.usn || '—'}`;
    const name = document.createElement('span'); name.textContent = record.student?.name || '—';
    meta.append(usn, name); card.appendChild(meta);

    const title = document.createElement('h3');
    title.className = 'confirm-student-title';
    title.textContent = `Student ${index + 1} · ${record.subjects?.length || 0} subjects`;
    card.appendChild(title);

    const wrap = document.createElement('div'); wrap.className = 'subject-table-wrap';
    const table = document.createElement('table'); table.className = 'data-table subject-table';
    const head = document.createElement('thead');
    const header = document.createElement('tr');
    ['Code', 'Subject', 'Internal', 'External', 'Total', 'Status'].forEach((label) => {
      const th = document.createElement('th'); th.textContent = label; header.appendChild(th);
    });
    head.appendChild(header); table.appendChild(head);
    const body = document.createElement('tbody');
    (record.subjects || []).forEach((subject) => {
      const row = document.createElement('tr');
      const passed = String(subject.result || '').toUpperCase() === 'P';
      const statusCell = document.createElement('td');
      const statusBadge = document.createElement('span');
      statusBadge.className = `result-status-badge ${passed ? 'is-pass' : 'is-fail'}`;
      statusBadge.textContent = passed ? 'PASS' : 'FAIL';
      statusCell.appendChild(statusBadge);
      row.append(
        textCell(subject.subjectCode, 'subject-code-value'),
        textCell(subject.subjectName),
        textCell(`${subject.internalMarks} / ${subject.maxInternalMarks}`),
        textCell(`${subject.externalMarks} / ${subject.maxExternalMarks}`),
        textCell(subject.totalMarks, 'result-total'),
        statusCell
      );
      body.appendChild(row);
    });
    table.appendChild(body); wrap.appendChild(table); card.appendChild(wrap);
    return card;
  }

  function renderReview(data) {
    const records = data.validRecords || [];
    const excluded = data.invalidRecords || [];
    const context = data.context || {};
    $('confirmContext').textContent = [context.batchName, context.semesterName, context.examSessionName].filter(Boolean).join(' · ') || 'Validated results';
    $('confirmCounts').textContent = `${data.totalCount} students reviewed · ${records.length} valid · ${excluded.length} excluded`;
    const subjectCount = records.reduce((count, record) => count + (record.subjects || []).length, 0);
    $('confirmSubjectCount').textContent = `${subjectCount} subject results`;
    $('confirmStudentPreviews').replaceChildren(...records.map(renderStudent));
    if (excluded.length) {
      $('excludedRecords').hidden = false;
      const list = $('excludedRecordList');
      list.replaceChildren(...excluded.map((record) => {
        const item = document.createElement('li');
        const issues = [...(record.errors || []), ...(record.subjects || []).flatMap((subject) => subject.errors || [])];
        item.textContent = `${record.student?.usn || 'Unknown USN'}: ${issues.join(' ') || 'Validation failed.'}`;
        return item;
      }));
    }
    $('confirmationContent').hidden = false;
    $('confirmAndSaveButton').disabled = records.length === 0;
    if (!records.length) message('There are no valid records to save. Return to extraction and correct the marks.', 'error');
  }

  async function confirmAndSave() {
    if (saving || saved || !review?.validRecords?.length) return;
    saving = true;
    $('confirmAndSaveButton').disabled = true;
    $('backToEditButton').setAttribute('aria-disabled', 'true');
    message('Saving the validated results in one database transaction…');
    try {
      const response = await window.apiFetch('/api/result-extractions/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ selection: review.selection, students: review.validRecords })
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || 'The result batch was not saved.');
      saved = true;
      sessionStorage.removeItem(storageKey);
      $('savedStudentCount').textContent = payload.data.processedStudentCount;
      $('savedRecordCount').textContent = payload.data.savedCount;
      $('confirmationContent').hidden = true;
      $('savedSummary').hidden = false;
      message(payload.message || 'Results saved successfully.', 'success');
    } catch (error) {
      message(error.message || 'The results were not saved. Review and retry.', 'error');
      $('confirmAndSaveButton').disabled = false;
      $('backToEditButton').removeAttribute('aria-disabled');
    } finally {
      saving = false;
    }
  }

  try {
    const stored = sessionStorage.getItem(storageKey);
    if (stored) review = JSON.parse(stored);
  } catch (_) { review = null; }

  if (!review || !Array.isArray(review.validRecords) || !review.selection) {
    message('No validated extraction is waiting for confirmation. Return to the upload page and validate the marks card first.', 'error');
  } else {
    renderReview(review);
  }

  $('backToEditButton').addEventListener('click', (event) => {
    if (saving) { event.preventDefault(); return; }
    const previous = new URL(document.referrer || '/', window.location.origin);
    if (previous.origin === window.location.origin && previous.pathname === '/results/extract') {
      event.preventDefault();
      window.history.back();
    }
  });

  $('confirmAndSaveButton').addEventListener('click', confirmAndSave);
})();
