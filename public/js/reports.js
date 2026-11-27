(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  let options = { batches: [], semesters: [], examSessions: [], subjects: [] };
  let currentReport = null;
  let reportRequestId = 0;
  const charts = new Map();
  const labels = {
    consolidated: 'Consolidated result', class: 'Class result', topper: 'Topper report',
    failed: 'Failed students', 'subject-wise': 'Subject-wise performance', student: 'Individual student report'
  };

  function optionList(select, rows, value, label, placeholder) {
    const old = select.value;
    select.replaceChildren(new Option(placeholder, ''));
    for (const row of rows) select.add(new Option(String(row[label]), String(row[value])));
    if ([...select.options].some((item) => item.value === old)) select.value = old;
  }

  function selectedSemesterId() {
    if ($('reportSemester').value) return $('reportSemester').value;
    const session = options.examSessions.find((row) => String(row.id) === $('reportSession').value);
    return session ? String(session.semesterId) : '';
  }

  function refreshFilters() {
    const batchId = $('reportBatch').value;
    optionList($('reportSemester'), options.semesters.filter((row) => !batchId || String(row.batchId) === batchId), 'id', 'semesterName', 'All semesters');
    const semesterId = $('reportSemester').value;
    const sessionPlaceholder = $('reportType').value === 'student' ? 'All exam sessions' : 'Select exam session';
    optionList($('reportSession'), options.examSessions.filter((row) => (!batchId || String(row.batchId) === batchId) && (!semesterId || String(row.semesterId) === semesterId)), 'id', 'sessionName', sessionPlaceholder);
    const subjectSemester = selectedSemesterId();
    const subjectOptions = options.subjects.filter((row) => !subjectSemester || String(row.semesterId) === subjectSemester);
    const distinctSubjects = [...new Map(subjectOptions.map((row) => [row.subjectCode, row])).values()];
    optionList($('reportSubject'), distinctSubjects, 'subjectCode', 'subjectName', 'All subjects');
  }

  function updateReportControls() {
    clearGeneratedReport();
    const type = $('reportType').value;
    $('topperLimitWrap').hidden = type !== 'topper';
    $('failedSearchWrap').hidden = type !== 'failed';
    $('subjectFilterWrap').hidden = type !== 'subject-wise';
    $('studentUsnWrap').hidden = type !== 'student';
    document.querySelectorAll('[data-report-tab]').forEach((button) => {
      const active = button.dataset.reportTab === type;
      button.setAttribute('aria-selected', String(active));
      button.classList.toggle('active', active);
    });
    refreshFilters();
  }

  function clearGeneratedReport() {
    reportRequestId += 1;
    currentReport = null;
    show('reportLoading', false);
    $('generateReport').disabled = false;
    $('reportResults').hidden = true;
    $('reportScope').textContent = '';
    for (const id of ['classStats', 'classChartPanel', 'failedStats', 'subjectComparison', 'subjectCharts', 'studentStats', 'reportEmpty']) show(id, false);
    charts.forEach((chart) => chart.destroy());
    charts.clear();
  }

  function params() {
    const query = new URLSearchParams();
    for (const [key, id] of [['batchId', 'reportBatch'], ['semesterId', 'reportSemester'], ['examSessionId', 'reportSession']]) {
      if ($(id).value) query.set(key, $(id).value);
    }
    const type = $('reportType').value;
    if (type === 'topper') query.set('limit', $('topperLimit').value);
    if (type === 'failed' && $('failedSearch').value.trim()) query.set('search', $('failedSearch').value.trim());
    if (type === 'subject-wise' && $('reportSubject').value) query.set('subjectCode', $('reportSubject').value);
    if (type === 'student' && $('studentUsn').value.trim()) query.set('usn', $('studentUsn').value.trim());
    return query;
  }

  function show(id, visible) { $(id).hidden = !visible; }
  function cell(row, value, status = false) {
    const td = document.createElement('td');
    td.textContent = String(value ?? '—');
    if (status) { td.className = 'report-status'; td.dataset.status = String(value); }
    row.appendChild(td);
    return td;
  }
  function buildTable(columns, rows, statusColumn = -1) {
    const head = $('reportHead'); head.replaceChildren();
    const heading = document.createElement('tr');
    columns.forEach((title) => { const th = document.createElement('th'); th.textContent = title; heading.appendChild(th); });
    head.appendChild(heading);
    const body = $('reportBody'); body.replaceChildren();
    rows.forEach((values) => {
      const row = document.createElement('tr');
      values.forEach((value, index) => {
        const td = cell(row, value);
        if (index === statusColumn) {
          td.className = 'report-status'; td.dataset.status = String(value);
          if (value === 'Fail') row.classList.add('report-row-fail');
          if (value === 'Missing' || value === 'Incomplete') row.classList.add('report-row-incomplete');
        }
      });
      body.appendChild(row);
    });
  }
  function renderChart(id, type, chartLabels, datasets, extra = {}) {
    charts.get(id)?.destroy();
    const canvas = $(id);
    if (!canvas || !window.Chart) return;
    charts.set(id, new window.Chart(canvas, {
      type, data: { labels: chartLabels, datasets },
      options: { responsive: true, maintainAspectRatio: false, ...extra }
    }));
  }
  function destroySubjectCharts() {
    for (const id of ['subjectAverageChart', 'subjectPassFailChart', 'subjectComparisonChart']) {
      charts.get(id)?.destroy(); charts.delete(id);
    }
  }
  function selectedCriteria(filters) {
    const batch = options.batches.find((row) => Number(row.id) === Number(filters.batchId));
    const semester = options.semesters.find((row) => Number(row.id) === Number(filters.semesterId));
    const session = options.examSessions.find((row) => Number(row.id) === Number(filters.examSessionId));
    return [batch?.batchName, semester?.semesterName, session?.sessionName].filter(Boolean).join(' · ') || 'All available academic records';
  }

  function renderCore(report) {
    const rows = report.results || [];
    const isClass = report.type === 'class';
    const isTopper = report.type === 'topper';
    const columns = [...(isTopper ? ['Rank'] : []), 'USN', 'Student', 'Batch', 'Semester', 'Subject marks', 'Total marks', 'Max marks', 'Percentage', 'Status'];
    const tableRows = rows.map((student) => [
      ...(isTopper ? [student.rank] : []), student.usn, student.studentName, student.batchName, student.semesterName,
      (student.subjects || []).map((subject) => `${subject.subjectCode}: ${subject.marksObtained === null ? 'Missing' : `${subject.marksObtained}/${subject.maxMarks}`} (${subject.status})`).join('; ') || 'No subject records',
      student.totalMarks, student.maxMarks, student.percentage === null ? '—' : `${student.percentage}%`, student.status
    ]);
    buildTable(columns, tableRows, columns.length - 1);
    if (isClass) {
      const stat = report.statistics;
      $('statTotal').textContent = stat.totalStudents; $('statPassed').textContent = stat.passedStudents;
      $('statFailed').textContent = stat.failedStudents; $('statIncomplete').textContent = stat.incompleteStudents;
      $('statPassRate').textContent = `${stat.passPercentage}%`; $('statAverage').textContent = `${stat.classAveragePercentage}%`;
      $('statRange').textContent = stat.highestPercentage === null ? '—' : `${stat.highestPercentage}% / ${stat.lowestPercentage}%`;
      show('classStats', true); show('classChartPanel', true);
      renderChart('classResultChart', 'doughnut', ['Passed', 'Failed', 'Incomplete'], [{
        data: [stat.passedStudents, stat.failedStudents, stat.incompleteStudents], backgroundColor: ['#16835d', '#c2413b', '#d6a84f']
      }]);
    }
    return rows.length;
  }

  function renderFailed(report) {
    const summary = report.summary;
    $('failedCount').textContent = summary.failedStudents;
    $('failedIncompleteCount').textContent = summary.incompleteStudents;
    $('failedIncompleteFailures').textContent = summary.studentsWithFailuresAndIncompleteRecords;
    show('failedStats', true);
    buildTable(['USN', 'Student', 'Batch', 'Semester', 'Exam session', 'Failed subject count', 'Failed subjects', 'All subject results', 'Overall status'],
      report.results.map((student) => [student.usn, student.studentName, student.batchName, student.semesterName, student.examSessionName,
        student.failedSubjectCount,
        student.failedSubjects.map((subject) => `${subject.subjectCode} ${subject.subjectName}: ${subject.marksObtained}/${subject.maxMarks}`).join('; '),
        student.subjects.map((subject) => `${subject.subjectCode}: ${subject.marksObtained === null ? 'Missing' : `${subject.marksObtained}/${subject.maxMarks}`} (${subject.status})`).join('; '),
        student.overallStatus]));
    return report.results.length;
  }

  function renderSubjects(report) {
    const subjects = report.subjects || [];
    const comparison = report.comparison;
    $('highestSubjectPass').textContent = comparison.highestPassPercentage === null ? '—' : `${comparison.highestPassPercentage}% (${comparison.highestPassSubjects.join(', ')})`;
    $('lowestSubjectPass').textContent = comparison.lowestPassPercentage === null ? '—' : `${comparison.lowestPassPercentage}% (${comparison.lowestPassSubjects.join(', ')})`;
    show('subjectComparison', true); show('subjectCharts', true);
    destroySubjectCharts();
    const names = subjects.map((subject) => `${subject.subjectCode} · ${subject.subjectName}`);
    renderChart('subjectAverageChart', 'bar', names, [{ label: 'Average marks', data: subjects.map((subject) => subject.averageMarks ?? 0), backgroundColor: '#159487' }], { scales: { y: { beginAtZero: true, max: 100 } } });
    renderChart('subjectPassFailChart', 'bar', names, [
      { label: 'Passed', data: subjects.map((subject) => subject.passedStudents), backgroundColor: '#16835d' },
      { label: 'Failed', data: subjects.map((subject) => subject.failedStudents), backgroundColor: '#c2413b' }
    ], { scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } });
    renderChart('subjectComparisonChart', 'bar', names, [
      { label: 'Average marks', data: subjects.map((subject) => subject.averageMarks ?? 0), backgroundColor: '#159487' },
      { label: 'Pass percentage', data: subjects.map((subject) => subject.passPercentage), backgroundColor: '#d6a84f' }
    ], { scales: { y: { beginAtZero: true, max: 100 } } });
    buildTable(['Subject code', 'Subject name', 'Semester', 'Valid results', 'Passed', 'Failed', 'Pass %', 'Fail %', 'Average', 'Highest', 'Lowest', 'Topper(s)', 'Rankings'],
      subjects.map((subject) => [subject.subjectCode, subject.subjectName, subject.semesterName, subject.totalStudents,
        subject.passedStudents, subject.failedStudents, `${subject.passPercentage}%`, `${subject.failPercentage}%`,
        subject.averageMarks ?? '—', subject.highestMarks ?? '—', subject.lowestMarks ?? '—',
        subject.topper.map((student) => `${student.usn} ${student.studentName} (${student.marksObtained})`).join('; ') || '—',
        subject.rankings.map((student) => `${student.rank}. ${student.usn} ${student.studentName} (${student.marksObtained})`).join('; ') || '—']));
    return subjects.length > 0 && subjects.some((subject) => subject.totalStudents > 0) ? subjects.length : 0;
  }

  function renderStudent(report) {
    const summary = report.summary;
    $('studentSummaryName').textContent = `${report.student.studentName} (${report.student.usn})`;
    $('studentSummaryMarks').textContent = summary.totalMarks === null ? '—' : `${summary.totalMarks} / ${summary.maxMarks}`;
    $('studentSummaryPercentage').textContent = summary.percentage === null ? '—' : `${summary.percentage}%`;
    $('studentSummarySgpa').textContent = summary.sgpa ?? '—'; $('studentSummaryCgpa').textContent = summary.cgpa ?? '—';
    $('studentSummaryPassFail').textContent = `${summary.subjectsPassed} / ${summary.subjectsFailed}`;
    $('studentSummaryStatus').textContent = summary.overallStatus;
    show('studentStats', true);
    buildTable(['Semester', 'Exam session', 'Subject code', 'Subject name', 'Marks', 'Maximum', 'Grade', 'Status', 'SGPA'],
      report.results.map((result) => {
        const examination = report.semesters.find((semester) => semester.semesterId === result.semesterId)?.examinations.find((exam) => exam.examSessionId === result.examSessionId);
        return [result.semesterName, result.examSessionName, result.subjectCode, result.subjectName,
          result.marksObtained ?? '—', result.maxMarks ?? '—', result.grade || '—', result.status, examination?.sgpa ?? '—'];
      }), 7);
    return report.results.length;
  }

  function render(report) {
    currentReport = report;
    for (const id of ['classStats', 'classChartPanel', 'failedStats', 'subjectComparison', 'subjectCharts', 'studentStats']) show(id, false);
    charts.get('classResultChart')?.destroy(); charts.delete('classResultChart'); destroySubjectCharts();
    $('resultHeading').textContent = labels[report.type];
    const criteria = selectedCriteria(report.filters);
    let count = 0;
    if (['consolidated', 'class', 'topper'].includes(report.type)) count = renderCore(report);
    else if (report.type === 'failed') count = renderFailed(report);
    else if (report.type === 'subject-wise') count = renderSubjects(report);
    else count = renderStudent(report);
    const entityCount = report.type === 'subject-wise' ? `${report.subjects.length} subject${report.subjects.length === 1 ? '' : 's'}`
      : report.type === 'student' ? `${report.results.length} subject result${report.results.length === 1 ? '' : 's'}`
        : `${count} student${count === 1 ? '' : 's'}`;
    const extra = report.type === 'failed' && report.filters.search ? ` · Search: ${report.filters.search}`
      : report.type === 'student' ? ` · ${report.student.batchName} · ${report.student.academicSession}`
        : report.type === 'subject-wise' && report.filters.subjectCode ? ` · ${report.filters.subjectCode}` : '';
    $('reportScope').textContent = `${entityCount} · ${criteria}${extra}`;
    const empty = report.type === 'student' ? report.results.length === 0 : count === 0;
    show('reportEmpty', empty);
    if (report.type === 'student' && empty) $('reportEmpty').textContent = 'Student found, but there are no academic result records for the selected filters.';
    else if (report.type === 'subject-wise' && empty) $('reportEmpty').textContent = 'No valid result data is available for the selected subjects and exam session.';
    else $('reportEmpty').textContent = 'No records match the selected report criteria.';
    $('reportResults').hidden = report.type === 'subject-wise' ? report.subjects.length === 0 : (report.type === 'student' ? report.results.length === 0 : count === 0);
  }

  async function generate() {
    show('reportError', false); show('reportEmpty', false);
    const type = $('reportType').value;
    if (type !== 'student' && !$('reportSession').value) {
      $('reportError').textContent = 'Select an exam session to generate this report.'; show('reportError', true); return;
    }
    if (type === 'student' && !$('studentUsn').value.trim()) {
      $('reportError').textContent = 'Enter a student USN to generate the individual report.'; show('reportError', true); return;
    }
    currentReport = null; $('reportResults').hidden = true;
    for (const id of ['classStats', 'classChartPanel', 'failedStats', 'subjectComparison', 'subjectCharts', 'studentStats']) show(id, false);
    const requestId = ++reportRequestId;
    show('reportLoading', true); $('generateReport').disabled = true;
    try {
      const response = await fetch(`/api/reports/${type}?${params()}`, { credentials: 'include', headers: { Accept: 'application/json' } });
      const body = await response.json();
      if (requestId !== reportRequestId) return;
      if (!response.ok || !body.success) throw new Error(body.message || `Request failed (${response.status})`);
      render(body.data);
    } catch (error) {
      if (requestId !== reportRequestId) return;
      $('reportError').textContent = error.message || 'Unable to generate report.'; show('reportError', true);
    } finally {
      if (requestId === reportRequestId) { show('reportLoading', false); $('generateReport').disabled = false; }
    }
  }

  function resetFilters() {
    $('reportBatch').value = ''; $('reportSemester').value = ''; $('reportSession').value = '';
    $('reportSubject').value = ''; $('failedSearch').value = ''; $('studentUsn').value = '';
    refreshFilters(); show('reportError', false); clearGeneratedReport();
  }

  async function init() {
    $('reportType').addEventListener('change', updateReportControls);
    document.querySelectorAll('[data-report-tab]').forEach((button) => button.addEventListener('click', () => {
      $('reportType').value = button.dataset.reportTab; updateReportControls();
    }));
    $('reportBatch').addEventListener('change', () => { refreshFilters(); clearGeneratedReport(); });
    $('reportSemester').addEventListener('change', () => { refreshFilters(); clearGeneratedReport(); });
    $('reportSession').addEventListener('change', clearGeneratedReport);
    ['topperLimit', 'reportSubject', 'failedSearch', 'studentUsn'].forEach((id) => {
      $(id).addEventListener($(id).tagName === 'INPUT' ? 'input' : 'change', clearGeneratedReport);
    });
    $('generateReport').addEventListener('click', generate);
    $('resetReportFilters').addEventListener('click', resetFilters);
    document.querySelectorAll('[data-export]').forEach((button) => button.addEventListener('click', () => {
      if (!currentReport) return;
      const query = new URLSearchParams();
      for (const key of ['batchId', 'semesterId', 'examSessionId', 'subjectCode', 'usn', 'search']) {
        if (currentReport.filters[key]) query.set(key, String(currentReport.filters[key]));
      }
      if (currentReport.type === 'topper') query.set('limit', String(currentReport.limit));
      query.set('format', button.dataset.export);
      window.location.assign(`/api/reports/export/${currentReport.type}?${query}`);
    }));
    $('printReport').addEventListener('click', () => {
      if (!currentReport) return;
      document.body.classList.add('print-report-mode');
      window.addEventListener('afterprint', () => document.body.classList.remove('print-report-mode'), { once: true });
      window.print();
    });
    try {
      const response = await fetch('/api/reports/filters', { credentials: 'include', headers: { Accept: 'application/json' } });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.message || 'Could not load report filters.');
      options = { ...options, ...body.data };
      optionList($('reportBatch'), options.batches, 'id', 'batchName', 'All batches');
      updateReportControls();
    } catch (error) { $('reportError').textContent = error.message; show('reportError', true); }
  }
  init();
})();
