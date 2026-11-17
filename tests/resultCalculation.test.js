'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const calculation = require('../services/resultCalculationService');

test('total marks require finite nonnegative numeric CIE and SEE', () => {
  assert.equal(calculation.calculateTotalMarks(25, 20), 45);
  assert.equal(calculation.calculateTotalMarks(25.126, 20.125), 45.25);
  assert.equal(calculation.calculateTotalMarks(null, 20), null);
  assert.equal(calculation.calculateTotalMarks(-1, 20), null);
  assert.equal(calculation.calculateTotalMarks('25', 20), null);
  assert.equal(calculation.calculateTotalMarks(10, Infinity), null);
});

test('subject pass requires each CIE, SEE and total minimum', () => {
  assert.deepEqual(calculation.determineSubjectResult(25, 25, 50), { status: 'Pass', grade: 'C' });
  assert.equal(calculation.determineSubjectResult(24.99, 30, 54.99).status, 'Fail');
  assert.equal(calculation.determineSubjectResult(30, 19.99, 49.99).status, 'Fail');
  assert.equal(calculation.determineSubjectResult(25, 20, 49).status, 'Fail');
  assert.equal(calculation.determineSubjectResult(25, 20, 51).status, 'Fail', 'total must match CIE + SEE');
  assert.deepEqual(calculation.determineSubjectResult(-1, 20, 19), { status: 'Fail', grade: null });
});

test('grade boundaries map to the specified grades', () => {
  const boundaries = [[100, 'O'], [90, 'O'], [89.99, 'A+'], [80, 'A+'], [79.99, 'A'], [70, 'A'], [69.99, 'B+'], [60, 'B+'], [59.99, 'B'], [55, 'B'], [54.99, 'C'], [50, 'C'], [49.99, 'F'], [0, 'F']];
  for (const [percentage, grade] of boundaries) assert.equal(calculation.calculateGrade(percentage), grade, `${percentage}%`);
  assert.equal(calculation.calculateGrade(-0.01), null);
  assert.equal(calculation.calculateGrade(100.01), null);
  assert.equal(calculation.calculateGrade('90'), null);
});

test('grade points map each grade and reject unknown values', () => {
  const expected = { O: 10, 'A+': 9, A: 8, 'B+': 7, B: 6, C: 5, F: 0 };
  for (const [grade, points] of Object.entries(expected)) assert.equal(calculation.calculateGradePoint(grade), points);
  assert.equal(calculation.calculateGradePoint('unknown'), null);
  assert.equal(calculation.calculateGradePoint(null), null);
});

test('SGPA is credit-weighted and rounds to two decimals', () => {
  assert.equal(calculation.calculateSGPA([
    { credit: 3, grade: 'O', status: 'Pass' },
    { credit: 4, grade: 'A', status: 'Pass' },
    { credit: 2, grade: 'B+', status: 'Pass' }
  ]), 8.44);
});

test('failed SGPA subjects contribute zero points but stay in the denominator', () => {
  assert.equal(calculation.calculateSGPA([
    { credit: 3, grade: 'A', status: 'Pass' },
    { credit: 1, grade: 'F', status: 'Fail' }
  ]), 6);
});

test('CGPA excludes failures by default and can include them when requested', () => {
  const data = [
    { credit: 3, grade: 'O', status: 'Pass' },
    { credit: 3, grade: 'A', status: 'Fail' }
  ];
  assert.equal(calculation.calculateCGPA(data), 10);
  assert.equal(calculation.calculateCGPA(data, { excludeFailed: false }), 5);
});

test('CGPA returns null without valid passed subjects by default', () => {
  assert.equal(calculation.calculateCGPA([{ credit: 3, grade: 'F', status: 'Fail' }]), null);
  assert.equal(calculation.calculateCGPA([{ credit: 3, grade: 'unknown', status: 'Pass' }]), null);
  assert.equal(calculation.calculateCGPA([{ credit: 0, grade: 'O', status: 'Pass' }]), null);
});

test('invalid credits do not corrupt GPA and failed rows remain safely handled', () => {
  assert.equal(calculation.calculateSGPA([
    { credit: 0, grade: 'O', status: 'Pass' },
    { credit: -2, grade: 'O', status: 'Pass' },
    { credit: 'bad', grade: 'O', status: 'Pass' },
    { credit: NaN, grade: 'O', status: 'Pass' },
    { credit: 2, grade: 'O', status: 'Pass' }
  ]), 10);
  assert.equal(calculation.calculateSGPA([{ credit: 2, grade: 'F', status: 'Fail' }]), 0);
});

test('empty and malformed collections are safe', () => {
  assert.equal(calculation.calculateSGPA([]), null);
  assert.equal(calculation.calculateSGPA(null), null);
  assert.equal(calculation.calculateCGPA([]), null);
  assert.equal(calculation.calculateCGPA(undefined), null);
  assert.deepEqual(calculation.calculateOverallResult([]), { subjects: [], overallPercentage: 0, overallGrade: 'F', overallStatus: 'Fail' });
  assert.deepEqual(calculation.getGradeSummary([]), { subjects: [], gradeDistribution: {}, passCount: 0, failCount: 0 });
});

test('component shortfalls avoid NaN for missing or invalid input', () => {
  assert.deepEqual(calculation.getMinimumComponent(null, 20).shortfall, { cie: 25, see: 0, total: null });
  assert.deepEqual(calculation.getMinimumComponent(24, 19).shortfall, { cie: 1, see: 1, total: 7 });
});
