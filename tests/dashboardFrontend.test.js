'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Element {
  constructor(id = '') {
    this.id = id;
    this.children = [];
    this.listeners = {};
    this.value = '';
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.colSpan = 1;
    this.className = '';
  }
  get options() { return this.children; }
  addEventListener(type, callback) { this.listeners[type] = callback; }
  replaceChildren(...children) { this.children = [...children]; }
  appendChild(child) { this.children.push(child); return child; }
  append(...children) { this.children.push(...children); }
}

test('dashboard frontend applies dependent filters and destroys old charts before rerendering', async () => {
  const source = fs.readFileSync(require.resolve('../public/js/dashboard.js'), 'utf8');
  const ids = [
    'filterBatch', 'filterSemester', 'filterSession', 'filterSubject', 'applyFilters', 'resetFilters',
    'topperLimit', 'dashboardLoading', 'dashboardError', 'dashboardEmpty', 'totalStudents', 'totalBatches',
    'totalSemesters', 'totalSubjects', 'totalExamSessions', 'totalResults', 'passPercentage', 'failurePercentage',
    'averageMarks', 'recentExamsList', 'passFailChart', 'gradeDistributionChart', 'semesterChart', 'examWiseChart', 'subjectChart'
  ];
  const elements = new Map(ids.map((id) => [id, new Element(id)]));
  elements.get('topperLimit').value = '5';
  const tableBody = new Element('topperTableBody');
  const document = {
    addEventListener(type, callback) { if (type === 'DOMContentLoaded') this.ready = callback; },
    getElementById(id) { return elements.get(id) || null; },
    querySelector(selector) { return selector === '#topperTable tbody' ? tableBody : null; },
    createElement() { return new Element(); }
  };
  const calls = [];
  const dashboardData = {
    summary: { totalStudents: 4, totalBatches: 1, totalSemesters: 1, totalSubjects: 1, totalExamSessions: 1, totalResults: 4, overallPassPercentage: 75, overallFailurePercentage: 25, averageMarks: 70, hasData: true },
    charts: {
      passFail: { passed: 3, failed: 1 },
      gradeDistribution: [{ grade: 'A', count: 3 }, { grade: 'F', count: 1 }],
      semesterPerformance: [{ semesterName: 'Semester 1', passPercentage: 75 }],
      examWisePerformance: [{ sessionName: 'End Term', passPercentage: 75 }],
      subjectPerformance: [{ subjectCode: 'CS1', subjectName: 'Algorithms', averagePercentage: 70 }]
    },
    topPerformers: [{ rank: 1, studentName: '<unsafe>', batchName: 'Batch', averagePercentage: 90, resultCount: 2 }],
    recentExams: []
  };
  const options = { batches: [{ id: 1, name: 'Batch A', startYear: 2025 }], semesters: [{ id: 2, batchId: 1, semesterNumber: 1, name: 'Semester 1' }], sessions: [{ id: 3, semesterId: 2, name: 'End Term' }], subjects: [{ id: 4, semesterId: 2, code: 'MCA101', name: 'Algorithms' }] };
  const fetch = async (url) => {
    calls.push(url);
    const data = url === '/api/dashboard/filter-options' ? options : dashboardData;
    return { ok: true, status: 200, json: async () => ({ success: true, data }) };
  };
  const chartInstances = [];
  class Chart {
    constructor(canvas, config) { this.canvas = canvas; this.config = config; this.destroyed = false; chartInstances.push(this); }
    destroy() { this.destroyed = true; }
  }
  const context = {
    document,
    window: { Chart },
    Chart,
    fetch,
    URLSearchParams,
    Map,
    Set,
    Number,
    String,
    Object,
    Array,
    Promise,
    getComputedStyle: () => ({ color: '#111', getPropertyValue: () => '#ddd' }),
    console
  };
  vm.runInNewContext(source, context);
  document.ready();
  for (let count = 0; count < 20 && chartInstances.length < 5; count += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(chartInstances.length, 5);
  assert.equal(elements.get('filterSemester').options.length, 2);
  assert.equal(elements.get('filterSession').options.length, 2);
  assert.equal(elements.get('filterSubject').options.length, 2);
  assert.equal(elements.get('dashboardEmpty').hidden, true);
  assert.equal(tableBody.children[0].children[1].textContent, '<unsafe>');

  elements.get('filterBatch').value = '1';
  elements.get('filterBatch').listeners.change();
  elements.get('filterSemester').value = '2';
  elements.get('filterSemester').listeners.change();
  elements.get('filterSession').value = '3';
  elements.get('filterSubject').value = 'MCA101';
  await elements.get('applyFilters').listeners.click();

  assert.ok(calls.includes('/api/dashboard/data?batchId=1&semesterId=2&sessionId=3&subjectCode=MCA101'));
  assert.equal(chartInstances.length, 10);
  assert.equal(chartInstances.slice(0, 5).every((chart) => chart.destroyed), true);
});

test('dashboard stylesheet defines desktop, tablet and mobile layouts', () => {
  const css = fs.readFileSync(require.resolve('../public/css/dashboard.css'), 'utf8');
  assert.match(css, /\.dashboard-charts\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(css, /@media\s*\(max-width:\s*1050px\)/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
  assert.match(css, /\.dashboard-table-wrap\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(css, /\.chart-wrap\s*\{[^}]*height:/s);
});
