document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);
  const batchSelect = $('filterBatch');
  const semesterSelect = $('filterSemester');
  const sessionSelect = $('filterSession');
  const subjectSelect = $('filterSubject');
  const filterSelects = [batchSelect, semesterSelect, sessionSelect, subjectSelect];
  const chartInstances = new Map();
  let options = { batches: [], semesters: [], sessions: [], subjects: [] };
  let latestData = null;

  function addOption(select, label, value = '') {
    const option = document.createElement('option');
    option.value = String(value);
    option.textContent = label;
    select.appendChild(option);
  }

  function fillOptions(select, rows, placeholder, getValue, getLabel, oldValue = '') {
    select.replaceChildren();
    addOption(select, placeholder);
    for (const row of rows) addOption(select, getLabel(row), getValue(row));
    select.value = rows.some((row) => String(getValue(row)) === String(oldValue)) ? String(oldValue) : '';
    select.disabled = rows.length === 0;
  }

  function refreshDependentOptions() {
    const oldSemester = semesterSelect.value;
    const semesters = options.semesters.filter((row) => !batchSelect.value || String(row.batchId) === batchSelect.value);
    fillOptions(semesterSelect, semesters, 'All semesters', (row) => row.id,
      (row) => `${row.name} (${row.semesterNumber})`, oldSemester);

    const applicableSemesterIds = new Set(semesters.map((row) => String(row.id)));
    const oldSession = sessionSelect.value;
    const sessions = options.sessions.filter((row) => {
      if (semesterSelect.value) return String(row.semesterId) === semesterSelect.value;
      return applicableSemesterIds.has(String(row.semesterId));
    });
    fillOptions(sessionSelect, sessions, 'All sessions', (row) => row.id, (row) => row.name, oldSession);

    const oldSubject = subjectSelect.value;
    const subjects = options.subjects.filter((row) => {
      if (semesterSelect.value) return String(row.semesterId) === semesterSelect.value;
      return applicableSemesterIds.has(String(row.semesterId));
    });
    fillOptions(subjectSelect, subjects, 'All subjects', (row) => row.code,
      (row) => `${row.code} — ${row.name}`, oldSubject);
  }

  function currentFilters() {
    const filters = {};
    if (batchSelect.value) filters.batchId = batchSelect.value;
    if (semesterSelect.value) filters.semesterId = semesterSelect.value;
    if (sessionSelect.value) filters.sessionId = sessionSelect.value;
    if (subjectSelect.value) filters.subjectCode = subjectSelect.value;
    return filters;
  }

  function setNotice(id, message, visible) {
    const element = $(id);
    element.textContent = message || '';
    element.hidden = !visible;
  }

  async function fetchJson(path) {
    const response = await fetch(path, { headers: { Accept: 'application/json' } });
    let body;
    try { body = await response.json(); }
    catch (_) { throw new Error(`The dashboard returned an invalid response (${response.status}).`); }
    if (!response.ok || !body.success) throw new Error(body.error || `Dashboard request failed (${response.status}).`);
    return body.data;
  }

  function themeColors() {
    const bodyStyle = getComputedStyle(document.body);
    return {
      text: bodyStyle.color || '#1f2937',
      grid: bodyStyle.getPropertyValue('--border').trim() || 'rgba(128,128,128,.2)',
      palette: ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#64748b']
    };
  }

  const emptyMessagePlugin = {
    id: 'dashboardEmptyMessage',
    afterDraw(chart) {
      const values = chart.data.datasets.flatMap((dataset) => dataset.data || []);
      if (values.some((value) => Number(value) > 0)) return;
      const { ctx, chartArea } = chart;
      if (!chartArea) return;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = themeColors().text;
      ctx.globalAlpha = 0.65;
      ctx.font = '14px sans-serif';
      ctx.fillText('No data for these filters', (chartArea.left + chartArea.right) / 2, (chartArea.top + chartArea.bottom) / 2);
      ctx.restore();
    }
  };

  function renderChart(canvasId, config) {
    const canvas = $(canvasId);
    if (!canvas || !window.Chart) return;
    const previous = chartInstances.get(canvasId);
    if (previous) previous.destroy();
    const theme = themeColors();
    const horizontal = config.indexAxis === 'y';
    const categoryTicks = { color: theme.text, autoSkip: true, maxRotation: horizontal ? 0 : 45 };
    const valueTicks = { color: theme.text, callback: config.percentage ? (value) => `${value}%` : undefined };
    const options = {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: config.indexAxis || 'x',
      color: theme.text,
      plugins: {
        legend: { display: config.type === 'doughnut', labels: { color: theme.text } },
        tooltip: { enabled: true }
      },
      scales: config.type === 'doughnut' ? {} : {
        x: horizontal
          ? { beginAtZero: true, max: config.percentage ? 100 : undefined, ticks: valueTicks, grid: { color: theme.grid } }
          : { ticks: categoryTicks, grid: { color: theme.grid } },
        y: {
          beginAtZero: !horizontal,
          suggestedMax: !horizontal && config.percentage ? 100 : undefined,
          max: !horizontal && config.percentage ? 100 : undefined,
          ticks: horizontal ? categoryTicks : valueTicks,
          grid: { color: theme.grid }
        }
      }
    };
    chartInstances.set(canvasId, new Chart(canvas, {
      type: config.type,
      data: {
        labels: config.labels,
        datasets: [{
          label: config.label,
          data: config.values,
          backgroundColor: config.type === 'line' ? 'rgba(37,99,235,.2)' : config.type === 'doughnut' ? ['#16a34a', '#dc2626'] : theme.palette,
          borderColor: config.type === 'line' ? '#2563eb' : theme.palette,
          borderWidth: config.type === 'line' ? 2 : 1,
          tension: 0.25,
          fill: config.type === 'line'
        }]
      },
      options,
      plugins: [emptyMessagePlugin]
    }));
  }

  function renderCharts(charts) {
    const grades = charts.gradeDistribution || [];
    const semesters = charts.semesterPerformance || [];
    const exams = charts.examWisePerformance || [];
    const subjects = charts.subjectPerformance || [];
    renderChart('passFailChart', { type: 'doughnut', labels: ['Pass', 'Fail'], values: [charts.passFail?.passed || 0, charts.passFail?.failed || 0], label: 'Result records' });
    renderChart('gradeDistributionChart', { type: 'bar', labels: grades.map((row) => row.grade), values: grades.map((row) => row.count), label: 'Result records' });
    renderChart('semesterChart', { type: 'line', labels: semesters.map((row) => row.semesterName), values: semesters.map((row) => row.passPercentage), label: 'Pass rate', percentage: true });
    renderChart('examWiseChart', { type: 'bar', labels: exams.map((row) => row.sessionName), values: exams.map((row) => row.passPercentage), label: 'Pass rate', percentage: true });
    renderChart('subjectChart', { type: 'bar', indexAxis: 'y', labels: subjects.map((row) => `${row.subjectCode} — ${row.subjectName}`), values: subjects.map((row) => row.averagePercentage), label: 'Average percentage', percentage: true });
  }

  function setTableMessage(message) {
    const body = document.querySelector('#topperTable tbody');
    body.replaceChildren();
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.textContent = message;
    row.appendChild(cell);
    body.appendChild(row);
  }

  function renderToppers(rows) {
    const body = document.querySelector('#topperTable tbody');
    const limit = Number($('topperLimit').value || 5);
    const allRows = rows || [];
    let visibleRows = allRows.slice(0, limit);
    if (visibleRows.length && allRows.length > limit) {
      const cutoffRank = visibleRows[visibleRows.length - 1].rank;
      for (let index = limit; index < allRows.length && allRows[index].rank === cutoffRank; index += 1) visibleRows.push(allRows[index]);
    }
    body.replaceChildren();
    if (!visibleRows.length) return setTableMessage('No top-performing students for these filters.');
    for (const person of visibleRows) {
      const row = document.createElement('tr');
      for (const value of [person.rank, person.studentName, person.batchName, `${Number(person.averagePercentage || 0).toFixed(2)}%`, person.resultCount]) {
        const cell = document.createElement('td');
        cell.textContent = String(value ?? '—');
        row.appendChild(cell);
      }
      body.appendChild(row);
    }
  }

  function renderRecentExams(exams) {
    const container = $('recentExamsList');
    container.replaceChildren();
    if (!exams || exams.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = 'No recent examination data available.';
      container.appendChild(empty);
      return;
    }
    for (const exam of exams) {
      const card = document.createElement('article');
      card.className = 'recent-exam-card';
      const heading = document.createElement('h3');
      heading.textContent = exam.sessionName;
      const students = document.createElement('p');
      students.textContent = `Students appeared: ${Number(exam.studentCount || 0)}`;
      const results = document.createElement('p');
      results.textContent = `Result records: ${Number(exam.totalResults || 0)}`;
      const passRate = document.createElement('p');
      passRate.textContent = `Pass rate: ${Number(exam.passPercentage || 0).toFixed(2)}%`;
      card.append(heading, students, results, passRate);
      container.appendChild(card);
    }
  }

  function renderSummary(summary) {
    const fields = {
      totalStudents: summary.totalStudents,
      totalBatches: summary.totalBatches,
      totalSemesters: summary.totalSemesters,
      totalSubjects: summary.totalSubjects,
      totalExamSessions: summary.totalExamSessions,
      totalResults: summary.totalResults,
      passPercentage: `${Number(summary.overallPassPercentage || 0).toFixed(2)}%`,
      failurePercentage: `${Number(summary.overallFailurePercentage || 0).toFixed(2)}%`,
      averageMarks: Number(summary.averageMarks || 0).toFixed(2)
    };
    for (const [id, value] of Object.entries(fields)) $(id).textContent = typeof value === 'number' ? value.toLocaleString() : value;
  }

  async function loadDashboard() {
    const applyButton = $('applyFilters');
    applyButton.disabled = true;
    setNotice('dashboardError', '', false);
    setNotice('dashboardEmpty', '', false);
    setNotice('dashboardLoading', 'Loading dashboard data…', true);
    try {
      const query = new URLSearchParams(currentFilters());
      const data = await fetchJson(`/api/dashboard/data${query.size ? `?${query}` : ''}`);
      latestData = data;
      renderSummary(data.summary);
      renderToppers(data.topPerformers);
      renderRecentExams(data.recentExams);
      renderCharts(data.charts);
      setNotice('dashboardEmpty', 'No results match the selected filters. Summary counts may still show the selected academic population.', !data.summary.hasData);
    } catch (error) {
      setNotice('dashboardError', error.message, true);
    } finally {
      setNotice('dashboardLoading', '', false);
      applyButton.disabled = false;
    }
  }

  async function loadFilterOptions() {
    setNotice('dashboardLoading', 'Loading dashboard filters…', true);
    try {
      options = await fetchJson('/api/dashboard/filter-options');
      fillOptions(batchSelect, options.batches || [], 'All batches', (row) => row.id,
        (row) => `${row.name} (${row.startYear})`);
      refreshDependentOptions();
      await loadDashboard();
    } catch (error) {
      setNotice('dashboardLoading', '', false);
      setNotice('dashboardError', error.message, true);
    }
  }

  batchSelect.addEventListener('change', () => { semesterSelect.value = ''; refreshDependentOptions(); });
  semesterSelect.addEventListener('change', () => { sessionSelect.value = ''; subjectSelect.value = ''; refreshDependentOptions(); });
  $('applyFilters').addEventListener('click', loadDashboard);
  $('resetFilters').addEventListener('click', () => {
    for (const select of filterSelects) select.value = '';
    refreshDependentOptions();
    loadDashboard();
  });
  $('topperLimit').addEventListener('change', () => { if (latestData) renderToppers(latestData.topPerformers); });
  loadFilterOptions();
});
