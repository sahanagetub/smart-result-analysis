'use strict';

const reportModel = require('../models/reportModel');
const calculations = require('./resultCalculationService');

function reportError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function parseId(value, name, optional = false) {
  if ((value === undefined || value === '') && optional) return null;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw reportError(`${name} must be a positive integer.`);
  return id;
}

function normalizeFilters(input = {}) {
  const search = String(input.search || '').trim();
  if (search.length > 80) throw reportError('Search must be 80 characters or fewer.');
  const usn = String(input.usn || '').trim().toUpperCase();
  if (usn.length > 20) throw reportError('USN must be 20 characters or fewer.');
  const subjectCode = String(input.subjectCode || '').trim().toUpperCase();
  if (subjectCode.length > 20) throw reportError('Subject code must be 20 characters or fewer.');
  return {
    batchId: parseId(input.batchId, 'Batch', true),
    semesterId: parseId(input.semesterId, 'Semester', true),
    examSessionId: parseId(input.examSessionId, 'Exam session', true),
    subjectCode, search, usn
  };
}

function summarize(rows) {
  const students = new Map();
  for (const row of rows) {
    if (!students.has(row.usn)) {
      students.set(row.usn, {
        usn: row.usn, studentName: row.studentName, batchId: Number(row.batchId), batchName: row.batchName,
        semesterId: Number(row.semesterId), semesterNumber: Number(row.semesterNumber), semesterName: row.semesterName,
        examSessionId: Number(row.examSessionId), examSessionName: row.examSessionName,
        subjects: [], totalMarks: 0, maxMarks: 0, percentage: null, status: 'Incomplete'
      });
    }
    const student = students.get(row.usn);
    if (row.subjectCode && !student.subjects.some((subject) => subject.subjectCode === row.subjectCode)) {
      if (row.resultId !== null) {
        const marks = Number(row.marksObtained);
        const maxMarks = Number(row.maxMarks);
        student.subjects.push({ subjectCode: row.subjectCode, subjectName: row.subjectName, marksObtained: marks, maxMarks, status: row.status, resultId: row.resultId });
        student.totalMarks += marks;
        student.maxMarks += maxMarks;
      } else {
        student.subjects.push({ subjectCode: row.subjectCode, subjectName: row.subjectName, marksObtained: null, maxMarks: null, status: 'Missing', resultId: null });
      }
    }
  }
  return [...students.values()].map((student) => {
    student.subjects.sort((a, b) => a.subjectCode.localeCompare(b.subjectCode));
    const missing = student.subjects.some((subject) => subject.status === 'Missing');
    student.status = student.subjects.length && !missing
      ? (student.subjects.every((subject) => subject.status === 'Pass') ? 'Pass' : 'Fail')
      : 'Incomplete';
    student.percentage = !missing && student.maxMarks
      ? Number((100 * student.totalMarks / student.maxMarks).toFixed(2)) : null;
    return student;
  });
}

async function resolveSession(filters, options) {
  if (!filters.examSessionId) throw reportError('Select an exam session to generate this report.');
  const session = options.examSessions.find((item) => Number(item.id) === filters.examSessionId);
  if (!session) throw reportError('Exam session was not found.', 404);
  if (filters.semesterId && Number(session.semesterId) !== filters.semesterId) throw reportError('Exam session does not belong to the selected semester.');
  if (filters.batchId && Number(session.batchId) !== filters.batchId) throw reportError('Exam session does not belong to the selected batch.');
  return { ...filters, semesterId: Number(session.semesterId), batchId: Number(session.batchId) };
}

function percentage(numerator, denominator) {
  return denominator ? Number((100 * numerator / denominator).toFixed(2)) : 0;
}

function buildFailedReport(students, filters) {
  const results = students.map((student) => ({
    ...student,
    failedSubjects: student.subjects.filter((subject) => subject.status === 'Fail'),
    failedSubjectCount: student.subjects.filter((subject) => subject.status === 'Fail').length,
    overallStatus: student.status
  })).filter((student) => student.failedSubjectCount > 0);
  return {
    type: 'failed', filters, results,
    summary: {
      failedStudents: results.length,
      incompleteStudents: students.filter((student) => student.status === 'Incomplete').length,
      studentsWithFailuresAndIncompleteRecords: results.filter((student) => student.status === 'Incomplete').length
    }
  };
}

function buildSubjectReport(rows, filters) {
  const subjects = new Map();
  for (const row of rows) {
    if (!row.subjectCode) continue;
    if (filters.subjectCode && row.subjectCode.toUpperCase() !== filters.subjectCode) continue;
    if (!subjects.has(row.subjectCode)) subjects.set(row.subjectCode, {
      subjectCode: row.subjectCode, subjectName: row.subjectName, semesterId: Number(row.semesterId),
      semesterNumber: Number(row.semesterNumber), semesterName: row.semesterName, records: new Map()
    });
    const subject = subjects.get(row.subjectCode);
    if (row.resultId !== null && !subject.records.has(row.usn)) {
      subject.records.set(row.usn, {
        usn: row.usn, studentName: row.studentName, marksObtained: Number(row.marksObtained),
        maxMarks: Number(row.maxMarks), status: row.status
      });
    }
  }
  const result = [...subjects.values()].map((subject) => {
    const rankings = [...subject.records.values()].sort((a, b) => b.marksObtained - a.marksObtained || a.usn.localeCompare(b.usn));
    let rank = 0;
    let lastMark = null;
    rankings.forEach((student, index) => {
      if (student.marksObtained !== lastMark) rank = index + 1;
      lastMark = student.marksObtained;
      student.rank = rank;
    });
    const passed = rankings.filter((student) => student.status === 'Pass').length;
    const failed = rankings.filter((student) => student.status === 'Fail').length;
    const marks = rankings.map((student) => student.marksObtained);
    const totalStudents = rankings.length;
    return {
      subjectCode: subject.subjectCode, subjectName: subject.subjectName,
      semesterId: subject.semesterId, semesterNumber: subject.semesterNumber, semesterName: subject.semesterName,
      totalStudents, passedStudents: passed, failedStudents: failed,
      passPercentage: percentage(passed, totalStudents), failPercentage: percentage(failed, totalStudents),
      averageMarks: totalStudents ? Number((marks.reduce((sum, mark) => sum + mark, 0) / totalStudents).toFixed(2)) : null,
      highestMarks: totalStudents ? Math.max(...marks) : null, lowestMarks: totalStudents ? Math.min(...marks) : null,
      topper: rankings.length ? rankings.filter((student) => student.marksObtained === rankings[0].marksObtained) : [],
      rankings
    };
  }).sort((a, b) => a.subjectCode.localeCompare(b.subjectCode));
  const withData = result.filter((subject) => subject.totalStudents > 0);
  const highest = withData.length ? Math.max(...withData.map((subject) => subject.passPercentage)) : null;
  const lowest = withData.length ? Math.min(...withData.map((subject) => subject.passPercentage)) : null;
  return {
    type: 'subject-wise', filters, subjects: result,
    comparison: {
      highestPassPercentage: highest,
      highestPassSubjects: highest === null ? [] : withData.filter((subject) => subject.passPercentage === highest).map((subject) => subject.subjectCode),
      lowestPassPercentage: lowest,
      lowestPassSubjects: lowest === null ? [] : withData.filter((subject) => subject.passPercentage === lowest).map((subject) => subject.subjectCode)
    }
  };
}

function validGpaInputs(subjects) {
  return subjects.length > 0 && subjects.every((subject) => Number(subject.credit) > 0 &&
    (subject.status === 'Fail' || calculations.calculateGradePoint(subject.grade) !== null));
}

function buildIndividualReport(rows, filters) {
  if (!rows.length) throw reportError('No student was found for this USN.', 404);
  const first = rows[0];
  const student = {
    usn: first.usn, studentName: first.studentName, batchName: first.batchName,
    academicSession: `${first.academicStartYear}–${first.academicEndYear}`,
    batchId: Number(first.batchId)
  };
  const groups = new Map();
  for (const row of rows) {
    if (row.examSessionId === null) continue;
    const key = `${row.semesterId}:${row.examSessionId}`;
    if (!groups.has(key)) groups.set(key, {
      semesterId: Number(row.semesterId), semesterNumber: Number(row.semesterNumber), semesterName: row.semesterName,
      examSessionId: Number(row.examSessionId), examSessionName: row.examSessionName, subjects: [], totalMarks: 0, maxMarks: 0
    });
    const group = groups.get(key);
    if (row.subjectCode && !group.subjects.some((subject) => subject.subjectCode === row.subjectCode)) {
      const found = row.resultId !== null;
      const subject = {
        subjectCode: row.subjectCode, subjectName: row.subjectName,
        marksObtained: found ? Number(row.marksObtained) : null,
        maxMarks: found ? Number(row.maxMarks) : null,
        grade: found ? row.grade : null, status: found ? row.status : 'Missing',
        credit: Number(row.credits) || null, resultId: found ? row.resultId : null
      };
      group.subjects.push(subject);
      if (found) { group.totalMarks += subject.marksObtained; group.maxMarks += subject.maxMarks; }
    }
  }
  const semesters = new Map();
  const attempts = [];
  const groupsList = [...groups.values()].sort((a, b) => a.semesterNumber - b.semesterNumber || a.examSessionId - b.examSessionId);
  for (const group of groupsList) {
    group.subjects.sort((a, b) => a.subjectCode.localeCompare(b.subjectCode));
    const missing = group.subjects.some((subject) => subject.status === 'Missing');
    group.status = group.subjects.length && !missing
      ? (group.subjects.every((subject) => subject.status === 'Pass') ? 'Pass' : 'Fail') : 'Incomplete';
    group.percentage = !missing && group.maxMarks ? Number((100 * group.totalMarks / group.maxMarks).toFixed(2)) : null;
    const gpaSubjects = group.subjects.map((subject) => ({ grade: subject.grade, status: subject.status, credit: subject.credit }));
    group.sgpa = group.status !== 'Incomplete' && validGpaInputs(gpaSubjects) ? calculations.calculateSGPA(gpaSubjects) : null;
    group.passedSubjects = group.subjects.filter((subject) => subject.status === 'Pass').length;
    group.failedSubjects = group.subjects.filter((subject) => subject.status === 'Fail').length;
    group.subjects.forEach(({ resultId, ...subject }) => attempts.push({ ...subject, semesterId: group.semesterId, semesterName: group.semesterName, semesterNumber: group.semesterNumber, examSessionId: group.examSessionId, examSessionName: group.examSessionName }));
    const semesterKey = String(group.semesterId);
    if (!semesters.has(semesterKey)) semesters.set(semesterKey, { semesterId: group.semesterId, semesterNumber: group.semesterNumber, semesterName: group.semesterName, examinations: [] });
    semesters.get(semesterKey).examinations.push(group);
  }
  const actualRecords = groupsList.filter((group) => group.subjects.some((subject) => subject.resultId !== null));
  const repeatedAttempt = new Set();
  let hasRepeat = false;
  for (const group of actualRecords) for (const subject of group.subjects.filter((item) => item.resultId !== null)) {
    const key = `${group.semesterId}:${subject.subjectCode}`;
    if (repeatedAttempt.has(key)) hasRepeat = true;
    repeatedAttempt.add(key);
  }
  const historyComplete = actualRecords.length > 0 && actualRecords.every((group) => group.status !== 'Incomplete');
  const allGpaInputs = actualRecords.flatMap((group) => group.subjects.filter((subject) => subject.resultId !== null).map((subject) => ({ grade: subject.grade, status: subject.status, credit: subject.credit })));
  const cgpa = !filters.semesterId && !filters.examSessionId && historyComplete && !hasRepeat && validGpaInputs(allGpaInputs)
    ? calculations.calculateCGPA(allGpaInputs) : null;
  const single = groupsList.length === 1 ? groupsList[0] : null;
  const passed = attempts.filter((subject) => subject.status === 'Pass').length;
  const failed = attempts.filter((subject) => subject.status === 'Fail').length;
  const overallStatus = !groupsList.length || groupsList.some((group) => group.status === 'Incomplete')
    ? 'Incomplete' : (groupsList.some((group) => group.status === 'Fail') ? 'Fail' : 'Pass');
  return {
    type: 'student', filters, student,
    summary: {
      totalMarks: single && single.status !== 'Incomplete' ? Number(single.totalMarks.toFixed(2)) : null,
      maxMarks: single && single.status !== 'Incomplete' ? Number(single.maxMarks.toFixed(2)) : null,
      percentage: single ? single.percentage : null,
      sgpa: single ? single.sgpa : null, cgpa,
      subjectsPassed: passed, subjectsFailed: failed, overallStatus
    },
    semesters: [...semesters.values()], results: attempts
  };
}

async function buildReport(type, input = {}) {
  const supported = ['consolidated', 'class', 'topper', 'failed', 'subject-wise', 'student'];
  if (!supported.includes(type)) throw reportError('Unknown report type.', 404);
  const filters = normalizeFilters(input);
  const options = await reportModel.getFilterOptions();
  if (type === 'student') {
    if (!filters.usn) throw reportError('Enter a student USN.');
    if (filters.semesterId && !options.semesters.some((semester) => Number(semester.id) === filters.semesterId)) throw reportError('Semester was not found.', 404);
    if (filters.examSessionId && !options.examSessions.some((session) => Number(session.id) === filters.examSessionId)) throw reportError('Exam session was not found.', 404);
    if (filters.semesterId && filters.examSessionId) {
      const session = options.examSessions.find((item) => Number(item.id) === filters.examSessionId);
      if (Number(session.semesterId) !== filters.semesterId) throw reportError('Exam session does not belong to the selected semester.');
    }
    const rows = await reportModel.getStudentRows(filters.usn, filters);
    if (rows.length && filters.semesterId && Number(rows[0].semesterId) !== filters.semesterId) throw reportError('Semester does not belong to this student.');
    if (rows.length && filters.examSessionId) {
      const session = options.examSessions.find((item) => Number(item.id) === filters.examSessionId);
      if (Number(rows[0].batchId) !== Number(session.batchId)) throw reportError('Exam session does not belong to this student.');
    }
    return buildIndividualReport(rows, filters);
  }

  const scopedFilters = await resolveSession(filters, options);
  if (type === 'failed' && filters.search.length > 80) throw reportError('Search must be 80 characters or fewer.');
  if (type === 'subject-wise' && filters.subjectCode && !options.subjects.some((subject) => Number(subject.semesterId) === scopedFilters.semesterId && subject.subjectCode.toUpperCase() === filters.subjectCode)) {
    throw reportError('Subject does not belong to the selected semester.');
  }
  const rows = await reportModel.getReportRows({ ...scopedFilters, search: type === 'failed' ? filters.search : '' });
  const results = summarize(rows).map((student) => ({ ...student, totalMarks: Number(student.totalMarks.toFixed(2)) }));
  if (type === 'consolidated') return { type, filters: scopedFilters, results };
  if (type === 'failed') return buildFailedReport(results, scopedFilters);
  if (type === 'subject-wise') return buildSubjectReport(rows, scopedFilters);

  if (type === 'class') {
    const passed = results.filter((student) => student.status === 'Pass').length;
    const failed = results.filter((student) => student.status === 'Fail').length;
    const percentages = results.filter((student) => student.status !== 'Incomplete').map((student) => student.percentage);
    return { type, filters: scopedFilters, statistics: {
      totalStudents: results.length, passedStudents: passed, failedStudents: failed,
      incompleteStudents: results.length - passed - failed,
      passPercentage: percentage(passed, results.length),
      classAveragePercentage: percentages.length ? Number((percentages.reduce((sum, value) => sum + value, 0) / percentages.length).toFixed(2)) : 0,
      highestPercentage: percentages.length ? Math.max(...percentages) : null,
      lowestPercentage: percentages.length ? Math.min(...percentages) : null
    }, results };
  }

  const limit = input.limit === undefined || input.limit === '' ? 5 : Number(input.limit);
  if (![3, 5, 10].includes(limit)) throw reportError('Topper limit must be 3, 5 or 10.');
  const eligible = results.filter((student) => student.status === 'Pass')
    .sort((a, b) => b.totalMarks - a.totalMarks || b.percentage - a.percentage || a.usn.localeCompare(b.usn));
  const ranked = [];
  let rank = 0;
  let lastMarks = null;
  eligible.forEach((student, index) => {
    if (student.totalMarks !== lastMarks) rank = index + 1;
    lastMarks = student.totalMarks;
    if (rank <= limit) ranked.push({ ...student, rank });
  });
  return { type, filters: scopedFilters, limit, results: ranked };
}

async function getFilterOptions() { return reportModel.getFilterOptions(); }

module.exports = { buildReport, getFilterOptions, reportError, summarize };
