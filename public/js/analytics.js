(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const charts = new Map();
  let options = { batches: [], semesters: [], sessions: [], subjects: [], academicYears: [] };
  const chartColors = ['#0f766e', '#38a89d', '#d6a84f', '#52736e', '#5d9ca7', '#9a7bb5', '#b96755'];

  async function fetchJson(url) {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    let body;
    try { body = await response.json(); } catch { throw new Error(`Invalid response from ${url}`); }
    if (!response.ok || body.success === false) throw new Error(body.error || `Request failed (${response.status})`);
    return body.data;
  }

  function filterParams(includeSearch = false) {
    const params = new URLSearchParams();
    const values = { batchId: $('filterBatch').value, academicYear: $('filterYear').value, semesterId: $('filterSemester').value, sessionId: $('filterSession').value, subjectCode: $('filterSubject').value };
    if (includeSearch) values.search = $('studentSearch').value.trim();
    for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
    return params;
  }

  function replaceOptions(select, rows, valueKey, labelKey, placeholder) {
    const selected = select.value;
    select.replaceChildren(new Option(placeholder, ''));
    for (const row of rows) select.add(new Option(String(row[labelKey]), String(row[valueKey])));
    if ([...select.options].some((option) => option.value === selected)) select.value = selected;
  }

  function refreshDependentOptions() {
    const batchId = $('filterBatch').value;
    const batchSemesters = options.semesters.filter((row) => !batchId || String(row.batchId) === batchId);
    replaceOptions($('filterSemester'), batchSemesters, 'id', 'semesterName', 'All semesters');
    const semesterId = $('filterSemester').value;
    replaceOptions($('filterSession'), options.sessions.filter((row) => !semesterId || String(row.semesterId) === semesterId), 'id', 'sessionName', 'All examinations');
    replaceOptions($('filterSubject'), options.subjects.filter((row) => !semesterId || String(row.semesterId) === semesterId), 'subjectCode', 'subjectName', 'All subjects');
  }

  function colors() {
    const style = getComputedStyle(document.body);
    return { text: style.color || '#1f2937', grid: style.getPropertyValue('--border').trim() || 'rgba(128,128,128,.2)' };
  }

  function renderChart(id, type, labels, datasets, horizontal = false) {
    const canvas = $(id);
    if (!canvas || !window.Chart) return;
    charts.get(id)?.destroy();
    const theme = colors();
    const dataSets = datasets.map((set, index) => ({
      ...set,
      backgroundColor: set.backgroundColor || (type === 'line' ? `${chartColors[index]}33` : chartColors[index]),
      borderColor: set.borderColor || chartColors[index],
      borderWidth: 1,
      tension: type === 'line' ? .25 : undefined,
      fill: type === 'line' ? false : undefined
    }));
    charts.set(id, new window.Chart(canvas, {
      type,
      data: { labels, datasets: dataSets },
      plugins: [{
        id: `analyticsEmpty-${id}`,
        afterDraw(chart) {
          const hasValue = chart.data.datasets.some((dataset) => (dataset.data || []).some((value) => Number(value) > 0));
          if (hasValue || !chart.chartArea) return;
          const { ctx, chartArea } = chart;
          ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = theme.text; ctx.globalAlpha = .65;
          ctx.fillText('No data for these filters', (chartArea.left + chartArea.right) / 2, (chartArea.top + chartArea.bottom) / 2); ctx.restore();
        }
      }],
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: horizontal ? 'y' : 'x',
        color: theme.text,
        plugins: { legend: { display: dataSets.length > 1 || type === 'doughnut', labels: { color: theme.text } } },
        scales: type === 'doughnut' ? {} : {
          x: { beginAtZero: true, ticks: { color: theme.text }, grid: { color: theme.grid } },
          y: { beginAtZero: !horizontal, max: !horizontal && datasets.some((d) => d.percentage) ? 100 : undefined, ticks: { color: theme.text, callback: (value) => datasets.some((d) => d.percentage) ? `${value}%` : value }, grid: { color: theme.grid } }
        }
      }
    }));
  }

  function renderStudents(rows) {
    const tbody = $('studentRows');
    tbody.replaceChildren();
    if (!rows.length) {
      const tr = document.createElement('tr'); const td = document.createElement('td');
      td.colSpan = 7; td.textContent = 'No matching student results.'; tr.appendChild(td); tbody.appendChild(tr); return;
    }
    for (const student of rows) {
      const tr = document.createElement('tr');
      const semesters = (student.semesters || []).map((sem) => `${sem.semesterName} / ${sem.sessionName}: SGPA ${sem.sgpa ?? '—'}`).join('; ') || '—';
      for (const value of [student.usn, student.studentName, student.batchName, student.totalResults, `${Number(student.passPercentage || 0).toFixed(2)}%`, student.cgpa ?? '—', semesters]) {
        const td = document.createElement('td'); td.textContent = String(value ?? '—'); tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }

  function renderSubjects(rows) {
    const tbody = $('subjectRows');
    tbody.replaceChildren();
    if (!rows.length) {
      const tr = document.createElement('tr'); const td = document.createElement('td');
      td.colSpan = 8; td.textContent = 'No subject results match these filters.'; tr.appendChild(td); tbody.appendChild(tr); return;
    }
    for (const subject of rows) {
      const tr = document.createElement('tr');
      const distribution = (subject.gradeDistribution || []).map((grade) => `${grade.grade}: ${grade.count} (${Number(grade.percentage).toFixed(1)}%)`).join(', ');
      for (const value of [`${subject.subjectCode} - ${subject.subjectName}`, subject.semesterName, subject.totalResults, subject.passed, subject.failed, `${Number(subject.passPercentage || 0).toFixed(2)}%`, Number(subject.averageMarks || 0).toFixed(2), distribution || '—']) {
        const td = document.createElement('td'); td.textContent = String(value ?? '—'); tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }

  function groupedGradeSets(rows) {
    const grades = [...new Set(rows.map((row) => row.grade))];
    const groups = [...new Set(rows.map((row) => row.groupName))];
    return { grades, datasets: groups.map((group) => ({ label: group, data: grades.map((grade) => Number(rows.find((row) => row.groupName === group && row.grade === grade)?.count || 0)) })) };
  }

  function render(data) {
    const overview = data.overview;
    $('totalStudents').textContent = overview.totalStudents;
    $('totalResults').textContent = overview.totalResults;
    $('passPercent').textContent = `${Number(overview.passPercentage || 0).toFixed(2)}%`;
    $('failurePercent').textContent = `${Number(overview.failurePercentage || 0).toFixed(2)}%`;
    $('averageMarks').textContent = Number(overview.averageMarks || 0).toFixed(2);
    $('averagePercentage').textContent = `${Number(overview.averagePercentage || 0).toFixed(2)}%`;

    renderChart('passFailChart', 'doughnut', ['Passed result records', 'Failed result records'], [{ label: 'Results', data: [overview.passedResults, overview.failedResults], backgroundColor: ['#2d9b73', '#d76b5d'] }]);
    const grades = overview.gradeSummary || [];
    renderChart('gradeChart', 'bar', grades.map((x) => x.grade), [{ label: 'Stored result records', data: grades.map((x) => x.count) }]);
    const semesterGrades = groupedGradeSets(data.grades.bySemester || []);
    renderChart('gradeSemesterChart', 'bar', semesterGrades.grades, semesterGrades.datasets);
    const examGrades = groupedGradeSets(data.grades.byExamination || []);
    renderChart('gradeExaminationChart', 'bar', examGrades.grades, examGrades.datasets);
    renderChart('semesterChart', 'line', data.semesters.map((x) => x.semesterName), [
      { label: 'Pass rate', data: data.semesters.map((x) => x.passPercentage), percentage: true },
      { label: 'Average percentage', data: data.semesters.map((x) => x.averagePercentage), percentage: true }
    ]);
    renderChart('examinationChart', 'bar', data.examinations.map((x) => x.sessionName), [{ label: 'Pass rate', data: data.examinations.map((x) => x.passPercentage), percentage: true }]);
    renderChart('comparisonChart', 'bar', data.comparison.map((x) => String(x.label)), [
      { label: 'Average percentage', data: data.comparison.map((x) => x.averagePercentage), percentage: true },
      { label: 'Pass percentage', data: data.comparison.map((x) => x.passPercentage), percentage: true }
    ]);
    renderChart('subjectChart', 'bar', data.subjects.map((x) => `${x.subjectCode} · ${x.subjectName}`), [
      { label: 'Average percentage', data: data.subjects.map((x) => x.averagePercentage), percentage: true },
      { label: 'Pass percentage', data: data.subjects.map((x) => x.passPercentage), percentage: true }
    ], true);
    renderStudents(data.students);
    renderSubjects(data.subjects);
    const empty = Number(overview.totalResults) === 0;
    $('analyticsEmpty').hidden = !empty;
  }

  async function loadAnalytics() {
    $('analyticsLoading').hidden = false;
    $('analyticsError').hidden = true;
    $('analyticsEmpty').hidden = true;
    const params = filterParams();
    const studentParams = filterParams(true);
    const comparisonParams = new URLSearchParams(params);
    comparisonParams.set('dimension', $('comparisonDimension').value);
    try {
      const paths = [
        ['overview', '/overview', params], ['semesters', '/semester', params], ['subjects', '/subject', params],
        ['students', '/student', studentParams], ['examinations', '/examination', params],
        ['grades', '/grade-distribution', params], ['comparison', '/comparison', comparisonParams]
      ];
      const pairs = await Promise.all(paths.map(async ([key, path, query]) => [key, await fetchJson(`/api/analytics${path}${query.size ? `?${query}` : ''}`)]));
      const data = Object.fromEntries(pairs);
      // Expose comparison response for accessible data inspection; charts already show the core comparisons.
      document.dispatchEvent(new CustomEvent('analytics:loaded', { detail: data }));
      render(data);
    } catch (error) {
      $('analyticsError').textContent = error.message || 'Analytics could not be loaded.';
      $('analyticsError').hidden = false;
    } finally { $('analyticsLoading').hidden = true; }
  }

  async function init() {
    try {
      options = await fetchJson('/api/analytics/filters');
      replaceOptions($('filterBatch'), options.batches || [], 'id', 'batchName', 'All batches');
      replaceOptions($('filterYear'), options.academicYears || [], 'academicYear', 'academicYear', 'All years');
      refreshDependentOptions();
    } catch (error) {
      $('analyticsError').textContent = error.message || 'Analytics filters could not be loaded.';
      $('analyticsError').hidden = false;
    }
    $('filterBatch').addEventListener('change', () => { $('filterSemester').value = ''; refreshDependentOptions(); });
    $('filterSemester').addEventListener('change', () => { $('filterSession').value = ''; $('filterSubject').value = ''; refreshDependentOptions(); });
    $('analyticsFilters').addEventListener('submit', (event) => { event.preventDefault(); return loadAnalytics(); });
    $('resetAnalytics').addEventListener('click', () => {
      $('analyticsFilters').reset(); $('filterBatch').value = ''; $('filterYear').value = ''; $('studentSearch').value = '';
      $('comparisonDimension').value = 'semester'; $('filterSemester').value = ''; refreshDependentOptions(); return loadAnalytics();
    });
    loadAnalytics();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
