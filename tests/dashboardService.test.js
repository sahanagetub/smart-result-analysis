'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDashboardService, buildFilters, rankToppers } = require('../services/dashboardService');

test('dashboard filters are parameterized and shared without value interpolation', () => {
  const query = { batchId: '4', semesterId: '2', sessionId: '8', subjectCode: "MCA101' OR 1=1" };
  const { where, params } = buildFilters(query);
  assert.match(where, /b\.id = \?/);
  assert.match(where, /s\.id = \?/);
  assert.match(where, /es\.id = \?/);
  assert.match(where, /su\.subject_code = \?/);
  assert.deepEqual(params, [4, 2, 8, "MCA101' OR 1=1"]);
  assert.equal(where.includes("MCA101' OR 1=1"), false);
});

test('distinct topper averages receive competition ranks for ties', () => {
  const rows = rankToppers([
    { studentId: 1, usn: 'A', studentName: 'A', batchName: 'B', averagePercentage: '92.50', resultCount: 2 },
    { studentId: 2, usn: 'B', studentName: 'B', batchName: 'B', averagePercentage: 92.5, resultCount: 3 },
    { studentId: 3, usn: 'C', studentName: 'C', batchName: 'B', averagePercentage: 88, resultCount: 2 }
  ]);
  assert.deepEqual(rows.map((row) => row.rank), [1, 1, 3]);
});

test('filtered dashboard aggregates use distinct inventory counts and result-record percentages', async () => {
  const calls = [];
  const responses = [
    [[{ totalResults: 4, resultsAvailable: 3, passedResults: 3, failedResults: 1, passedStudents: 2, failedStudents: 2, averageMarks: 61.5, highestPercentage: 95, lowestPercentage: 18 }]],
    [[{ totalStudents: 12, totalBatches: 1, totalSemesters: 1, totalSubjects: 2, totalExamSessions: 1 }]],
    [[{ grade: 'A', resultCount: 2 }, { grade: 'F', resultCount: 2 }]],
    [[{ semesterId: 2, semesterName: 'Semester 2', resultCount: 4, passedResults: 3, averagePercentage: 61.5 }]],
    [[{ sessionId: 8, sessionName: 'End Term', studentCount: 3, totalResults: 4, passedResults: 3, averagePercentage: 61.5 }]],
    [[{ subjectId: 6, subjectCode: 'MCA101', subjectName: 'Algorithms', totalResults: 4, passedResults: 3, failedResults: 1, averageMarks: 61.5, averagePercentage: 61.5 }]],
    [[
      { studentId: 1, usn: 'A', studentName: 'Top One', batchName: 'Batch A', resultCount: 2, averagePercentage: 92.5 },
      { studentId: 2, usn: 'B', studentName: 'Top Two', batchName: 'Batch A', resultCount: 2, averagePercentage: 92.5 },
      { studentId: 3, usn: 'C', studentName: 'Third', batchName: 'Batch A', resultCount: 1, averagePercentage: 80 }
    ]]
  ];
  const service = createDashboardService({
    isDbDisabled: () => false,
    getPool: () => ({ async execute(sql, params) { calls.push({ sql, params }); return responses[calls.length - 1]; } })
  });
  const data = await service.getDashboardData({ batchId: '4', semesterId: '2', sessionId: '8', subjectCode: 'MCA101' });

  assert.deepEqual(data.summary, {
    totalStudents: 12, totalBatches: 1, totalSemesters: 1, totalSubjects: 2, totalExamSessions: 1,
    totalResults: 4, resultsAvailable: 3, passedResults: 3, failedResults: 1,
    passedStudents: 2, failedStudents: 2, overallPassPercentage: 75, overallFailurePercentage: 25,
    averageMarks: 61.5, highestPercentage: 95, lowestPercentage: 18, hasData: true
  });
  assert.equal(data.charts.gradeDistribution[0].count, 2);
  assert.equal(data.charts.semesterPerformance[0].passPercentage, 75);
  assert.equal(data.charts.examWisePerformance[0].passPercentage, 75);
  assert.equal(data.charts.subjectPerformance[0].averagePercentage, 61.5);
  assert.deepEqual(data.topPerformers.map((row) => row.rank), [1, 1, 3]);
  assert.equal(data.recentExams[0].studentCount, 3);
  assert.equal(calls.length, 7);
  for (const call of calls) assert.deepEqual(call.params, [4, 2, 8, 'MCA101']);
  assert.match(calls[0].sql, /COUNT\(\*\) AS totalResults/);
  assert.match(calls[1].sql, /COUNT\(DISTINCT st\.id\)/);
  assert.match(calls[5].sql, /su\.semester_id = s\.id AND su\.subject_code = r\.subject_code/);
  assert.match(calls[6].sql, /st\.usn = r\.usn AND st\.batch_id = b\.id/);
});

test('empty database shape contains zero metrics and empty chart series', async () => {
  const service = createDashboardService({ isDbDisabled: () => true });
  const data = await service.getDashboardData();
  assert.equal(data.summary.totalResults, 0);
  assert.equal(data.summary.overallPassPercentage, 0);
  assert.equal(data.summary.overallFailurePercentage, 0);
  assert.equal(data.summary.hasData, false);
  assert.deepEqual(data.charts.subjectPerformance, []);
  assert.deepEqual(data.topPerformers, []);
  assert.deepEqual(data.recentExams, []);
});

test('database query errors propagate for the controller error response', async () => {
  const service = createDashboardService({
    isDbDisabled: () => false,
    getPool: () => ({ execute: async () => { throw new Error('database unavailable'); } })
  });
  await assert.rejects(service.getDashboardData(), /database unavailable/);
});
