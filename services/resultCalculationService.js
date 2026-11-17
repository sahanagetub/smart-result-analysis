'use strict';

const MIN_CIE = 25;
const MIN_SEE = 20;
const MIN_TOTAL = 50;
const GRADE_POINTS = Object.freeze({ O: 10, 'A+': 9, A: 8, 'B+': 7, B: 6, C: 5, F: 0 });

function isValidMark(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function calculateTotalMarks(cie, see) {
  if (!isValidMark(cie) || !isValidMark(see)) return null;
  return Math.round((cie + see) * 100) / 100;
}

function calculateGrade(percentage) {
  if (typeof percentage !== 'number' || !Number.isFinite(percentage) || percentage < 0 || percentage > 100) return null;
  if (percentage >= 90) return 'O';
  if (percentage >= 80) return 'A+';
  if (percentage >= 70) return 'A';
  if (percentage >= 60) return 'B+';
  if (percentage >= 55) return 'B';
  if (percentage >= 50) return 'C';
  return 'F';
}

function determineSubjectResult(cie, see, total) {
  const calculatedTotal = calculateTotalMarks(cie, see);
  if (calculatedTotal === null || !isValidMark(total) || Math.abs(calculatedTotal - total) > 0.01) {
    return { status: 'Fail', grade: null };
  }
  return {
    status: cie >= MIN_CIE && see >= MIN_SEE && total >= MIN_TOTAL ? 'Pass' : 'Fail',
    grade: calculateGrade(total)
  };
}

function calculateGradePoint(grade) {
  if (typeof grade !== 'string') return null;
  const normalized = grade.trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(GRADE_POINTS, normalized) ? GRADE_POINTS[normalized] : null;
}

function normalizeCredits(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const credits = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(credits) && credits > 0 ? credits : null;
}

function roundGpa(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calculateSGPA(subjects) {
  if (!Array.isArray(subjects) || subjects.length === 0) return null;
  let totalCredits = 0;
  let weightedPoints = 0;

  for (const subject of subjects) {
    if (!subject || (subject.status !== 'Pass' && subject.status !== 'Fail')) continue;
    const credit = normalizeCredits(subject.credit);
    if (credit === null) continue;

    if (subject.status === 'Fail') {
      totalCredits += credit;
      continue;
    }
    const gradePoint = calculateGradePoint(subject.grade);
    if (gradePoint === null) continue;
    totalCredits += credit;
    weightedPoints += gradePoint * credit;
  }

  return totalCredits > 0 ? roundGpa(weightedPoints / totalCredits) : null;
}

function calculateCGPA(allResults, options = {}) {
  if (!Array.isArray(allResults) || allResults.length === 0) return null;
  const excludeFailed = options.excludeFailed !== false;
  let totalCredits = 0;
  let weightedPoints = 0;
  let passedSubjects = 0;

  for (const result of allResults) {
    if (!result || (result.status !== 'Pass' && result.status !== 'Fail')) continue;
    const credit = normalizeCredits(result.credit);
    if (credit === null) continue;
    if (excludeFailed && result.status === 'Fail') continue;

    if (result.status === 'Fail') {
      totalCredits += credit;
      continue;
    }
    const gradePoint = calculateGradePoint(result.grade);
    if (gradePoint === null) continue;
    totalCredits += credit;
    weightedPoints += gradePoint * credit;
    passedSubjects += 1;
  }

  if (totalCredits === 0 || (excludeFailed && passedSubjects === 0)) return null;
  return roundGpa(weightedPoints / totalCredits);
}

function calculateOverallResult(subjects) {
  if (!Array.isArray(subjects) || subjects.length === 0) {
    return { subjects: [], overallPercentage: 0, overallGrade: 'F', overallStatus: 'Fail' };
  }

  let totalMarks = 0;
  let totalPossible = 0;
  const subjectResults = [];
  for (const subject of subjects) {
    const row = subject || {};
    const cie = row.cie;
    const see = row.see;
    const total = calculateTotalMarks(cie, see);
    const outcome = determineSubjectResult(cie, see, total);
    const safeTotal = total === null ? 0 : total;
    totalMarks += safeTotal;
    totalPossible += 100;
    subjectResults.push({
      subject_code: row.subject_code || 'Unknown',
      subject_name: row.subject_name || 'Unknown',
      cie: isValidMark(cie) ? cie : 0,
      see: isValidMark(see) ? see : 0,
      total: safeTotal,
      status: outcome.status,
      grade: outcome.grade
    });
  }

  const overallPercentage = totalPossible > 0 ? roundGpa((totalMarks / totalPossible) * 100) : 0;
  return {
    subjects: subjectResults,
    overallPercentage,
    overallGrade: calculateGrade(overallPercentage) || 'F',
    overallStatus: overallPercentage >= MIN_TOTAL ? 'Pass' : 'Fail'
  };
}

function getMinimumComponent(cie, see) {
  const validCie = isValidMark(cie);
  const validSee = isValidMark(see);
  return {
    minCiE: MIN_CIE,
    minSEE: MIN_SEE,
    minTotal: MIN_TOTAL,
    shortfall: {
      cie: validCie ? Math.max(0, MIN_CIE - cie) : MIN_CIE,
      see: validSee ? Math.max(0, MIN_SEE - see) : MIN_SEE,
      total: validCie && validSee ? Math.max(0, MIN_TOTAL - (cie + see)) : null
    }
  };
}

function getGradeSummary(subjects) {
  if (!Array.isArray(subjects) || subjects.length === 0) {
    return { subjects: [], gradeDistribution: {}, passCount: 0, failCount: 0 };
  }
  const subjectsData = [];
  const gradeDistribution = {};
  let passCount = 0;
  let failCount = 0;
  for (const subject of subjects) {
    const row = subject || {};
    const total = calculateTotalMarks(row.cie, row.see);
    const outcome = determineSubjectResult(row.cie, row.see, total);
    const safeTotal = total === null ? 0 : total;
    subjectsData.push({
      subject_code: row.subject_code || 'Unknown',
      subject_name: row.subject_name || 'Unknown',
      cie: isValidMark(row.cie) ? row.cie : 0,
      see: isValidMark(row.see) ? row.see : 0,
      total: safeTotal,
      status: outcome.status,
      grade: outcome.grade
    });
    if (outcome.status === 'Pass') passCount += 1;
    else failCount += 1;
    if (outcome.grade) gradeDistribution[outcome.grade] = (gradeDistribution[outcome.grade] || 0) + 1;
  }
  return { subjects: subjectsData, gradeDistribution, passCount, failCount };
}

module.exports = {
  calculateTotalMarks,
  determineSubjectResult,
  calculateGrade,
  calculateGradePoint,
  calculateSGPA,
  calculateCGPA,
  calculateOverallResult,
  getMinimumComponent,
  getGradeSummary
};
