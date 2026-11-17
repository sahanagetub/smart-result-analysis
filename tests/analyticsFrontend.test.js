const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Element {
  constructor(id = '') { this.id = id; this.value = ''; this.hidden = false; this.options = []; this.children = []; this.listeners = {}; this.textContent = ''; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  add(option) { this.options.push(option); }
  replaceChildren(...children) { this.children = children; this.options = []; }
  appendChild(child) { this.children.push(child); }
  setAttribute() {}
}
class Option { constructor(text, value) { this.text = text; this.value = value; } }

test('analytics frontend requests filtered modules and destroys chart instances before refresh', async () => {
  const source = fs.readFileSync(require.resolve('../public/js/analytics.js'), 'utf8');
  const ids = ['analyticsFilters','resetAnalytics','filterBatch','filterYear','filterSemester','filterSession','filterSubject','studentSearch','comparisonDimension','analyticsLoading','analyticsError','analyticsEmpty','totalStudents','totalResults','passPercent','failurePercent','averageMarks','averagePercentage','passFailChart','gradeChart','gradeSemesterChart','gradeExaminationChart','semesterChart','examinationChart','comparisonChart','subjectChart','studentRows','subjectRows'];
  const elements = new Map(ids.map((id) => [id, new Element(id)]));
  const requests = [];
  const result = {
    overview: { totalStudents: 1, totalResults: 1, passedResults: 1, failedResults: 0, passPercentage: 100, failurePercentage: 0, averageMarks: 90, averagePercentage: 90, gradeSummary: [{ grade: 'O', count: 1, percentage: 100 }] },
    semesters: [{ semesterName: 'Semester 1', passPercentage: 100, averagePercentage: 90 }],
    subjects: [{ subjectCode: 'CS1', subjectName: 'Algorithms', passPercentage: 100, averagePercentage: 90 }],
    students: [{ usn: 'U1', studentName: '<img>', batchName: 'Batch', totalResults: 1, passPercentage: 100, cgpa: 10, semesters: [] }],
    examinations: [{ sessionName: 'Final', passPercentage: 100 }],
    grades: { overall: [], bySemester: [], byExamination: [] },
    comparison: [{ label: 'Batch A', averagePercentage: 90, passPercentage: 100 }]
  };
  const filterOptions = { batches: [{ id: 1, batchName: 'Batch A' }], academicYears: [{ academicYear: 2025 }], semesters: [{ id: 2, batchId: 1, semesterName: 'Semester 1' }], sessions: [{ id: 3, semesterId: 2, sessionName: 'Final' }], subjects: [{ semesterId: 2, subjectCode: 'CS1', subjectName: 'Algorithms' }] };
  const fetch = async (url) => {
    requests.push(url);
    const data = url === '/api/analytics/filters' ? filterOptions : result[url.split('?')[0].split('/').at(-1) === 'grade-distribution' ? 'grades' : url.split('?')[0].split('/').at(-1) === 'comparison' ? 'comparison' : url.split('?')[0].split('/').at(-1) === 'overview' ? 'overview' : url.split('?')[0].split('/').at(-1) === 'semester' ? 'semesters' : url.split('?')[0].split('/').at(-1) === 'subject' ? 'subjects' : url.split('?')[0].split('/').at(-1) === 'student' ? 'students' : 'examinations'];
    return { ok: true, status: 200, json: async () => ({ success: true, data }) };
  };
  const chartInstances = [];
  class Chart { constructor(canvas, config) { this.canvas = canvas; this.config = config; this.destroyed = false; chartInstances.push(this); } destroy() { this.destroyed = true; } }
  const document = {
    documentElement: {},
    addEventListener(type, callback) { if (type === 'DOMContentLoaded') this.ready = callback; },
    dispatchEvent() {},
    getElementById(id) { return elements.get(id) || null; },
    createElement() { return new Element(); }
  };
  const context = { document, window: { Chart }, fetch, URLSearchParams, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } }, Option, Promise, Map, Number, String, Object, Array, console, getComputedStyle: () => ({ getPropertyValue: () => '#ddd', color: '#111' }) };
  vm.runInNewContext(source, context);
  document.ready();
  for (let i = 0; i < 30 && chartInstances.length < 8; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(chartInstances.length, 8);
  assert.ok(requests.includes('/api/analytics/overview'));
  assert.equal(elements.get('studentRows').children[0].children[1].textContent, '<img>');
  elements.get('filterBatch').value = '1';
  elements.get('filterYear').value = '2025';
  elements.get('filterSemester').value = '2';
  elements.get('filterSession').value = '3';
  elements.get('filterSubject').value = 'CS1';
  elements.get('studentSearch').value = 'U1';
  elements.get('comparisonDimension').value = 'subject';
  await elements.get('analyticsFilters').listeners.submit({ preventDefault() {} });
  assert.ok(chartInstances.slice(0, 8).every((chart) => chart.destroyed));
  assert.equal(chartInstances.length, 16);
  assert.ok(requests.some((url) => url.includes('batchId=1') && url.includes('academicYear=2025') && url.includes('subjectCode=CS1')));
  assert.ok(requests.some((url) => url.startsWith('/api/analytics/student?') && url.includes('search=U1')));
  assert.ok(requests.some((url) => url.includes('dimension=subject')));
  const stylesheet = fs.readFileSync(require.resolve('../public/css/analytics.css'), 'utf8');
  assert.match(stylesheet, /max-width:\s*800px/);
  assert.match(stylesheet, /max-width:\s*480px/);
});
