'use strict';

const XLSX = require('xlsx');
const reportService = require('../services/reportService');

function sendError(res, error) {
  return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Unable to generate report.' });
}

function reportRows(report) {
  if (report.type === 'subject-wise') return report.subjects.map((subject) => ({
    'Subject code': subject.subjectCode, 'Subject name': subject.subjectName, Semester: subject.semesterName,
    'Valid results': subject.totalStudents, Passed: subject.passedStudents, Failed: subject.failedStudents,
    'Pass percentage': subject.passPercentage, 'Fail percentage': subject.failPercentage,
    'Average marks': subject.averageMarks, 'Highest marks': subject.highestMarks, 'Lowest marks': subject.lowestMarks,
    'Subject topper(s)': subject.topper.map((student) => `${student.usn} ${student.studentName} (${student.marksObtained})`).join('; '),
    Rankings: subject.rankings.map((student) => `${student.rank}. ${student.usn} ${student.studentName} (${student.marksObtained})`).join('; ')
  }));
  if (report.type === 'student') return report.results.map((result) => ({
    USN: report.student.usn, Student: report.student.studentName, Batch: report.student.batchName,
    'Academic session': report.student.academicSession, Semester: result.semesterName, 'Semester number': result.semesterNumber,
    'Exam session': result.examSessionName, 'Subject code': result.subjectCode, 'Subject name': result.subjectName,
    'Marks obtained': result.marksObtained ?? '', 'Maximum marks': result.maxMarks ?? '', Grade: result.grade || '', Status: result.status,
    SGPA: report.semesters.find((semester) => semester.semesterId === result.semesterId)?.examinations.find((exam) => exam.examSessionId === result.examSessionId)?.sgpa ?? '',
    CGPA: report.summary.cgpa ?? ''
  }));
  if (report.type === 'failed') return report.results.map((student) => ({
    USN: student.usn, Student: student.studentName, Batch: student.batchName,
    Semester: student.semesterName, 'Exam session': student.examSessionName,
    'Failed subject count': student.failedSubjectCount, 'Failed subjects': student.failedSubjects.map((subject) => `${subject.subjectCode} ${subject.subjectName}: ${subject.marksObtained}/${subject.maxMarks}`).join('; '),
    'All subject results': student.subjects.map((subject) => `${subject.subjectCode}: ${subject.marksObtained === null ? 'Missing' : `${subject.marksObtained}/${subject.maxMarks}`} (${subject.status})`).join('; '),
    'Overall status': student.overallStatus
  }));
  return report.results.map((student) => ({
    ...(report.type === 'topper' ? { Rank: student.rank } : {}),
    USN: student.usn, Student: student.studentName,
    Batch: student.batchName, Semester: student.semesterName, 'Exam session': student.examSessionName,
    'Subject marks': student.subjects.map((subject) => `${subject.subjectCode}: ${subject.marksObtained === null ? 'Missing' : `${subject.marksObtained}/${subject.maxMarks}`} (${subject.status})`).join('; '),
    'Total marks': student.totalMarks, 'Maximum marks': student.maxMarks, Percentage: student.percentage, Status: student.status
  }));
}

function reportHeaders(type) {
  if (type === 'subject-wise') return ['Subject code', 'Subject name', 'Semester', 'Valid results', 'Passed', 'Failed', 'Pass percentage', 'Fail percentage', 'Average marks', 'Highest marks', 'Lowest marks', 'Subject topper(s)', 'Rankings'];
  if (type === 'student') return ['USN', 'Student', 'Batch', 'Academic session', 'Semester', 'Semester number', 'Exam session', 'Subject code', 'Subject name', 'Marks obtained', 'Maximum marks', 'Grade', 'Status', 'SGPA', 'CGPA'];
  if (type === 'failed') return ['USN', 'Student', 'Batch', 'Semester', 'Exam session', 'Failed subject count', 'Failed subjects', 'All subject results', 'Overall status'];
  return [...(type === 'topper' ? ['Rank'] : []), 'USN', 'Student', 'Batch', 'Semester', 'Exam session', 'Subject marks', 'Total marks', 'Maximum marks', 'Percentage', 'Status'];
}

exports.filters = async (_req, res) => {
  try { return res.json({ success: true, data: await reportService.getFilterOptions() }); }
  catch (error) { return sendError(res, error); }
};

exports.generate = (type) => async (req, res) => {
  try { return res.json({ success: true, data: await reportService.buildReport(type, req.query) }); }
  catch (error) { return sendError(res, error); }
};

exports.export = async (req, res) => {
  try {
    const { type } = req.params;
    const report = await reportService.buildReport(type, req.query);
    const rows = reportRows(report);
    const format = String(req.query.format || 'csv').toLowerCase();
    const reportId = report.filters.examSessionId || report.student?.usn || 'all-records';
    const base = `${type}-report-${String(reportId).replace(/[^A-Za-z0-9_-]/g, '-')}`;
    if (format === 'csv') {
      const worksheet = XLSX.utils.json_to_sheet(rows, { header: reportHeaders(type) });
      let csv = XLSX.utils.sheet_to_csv(worksheet);
      if (['class', 'failed', 'subject-wise', 'student'].includes(type)) {
        const summaryRows = type === 'class' ? [
          ['Class result summary'], ['Total students', report.statistics.totalStudents], ['Passed', report.statistics.passedStudents],
          ['Failed', report.statistics.failedStudents], ['Incomplete', report.statistics.incompleteStudents],
          ['Pass percentage', report.statistics.passPercentage], ['Class average percentage', report.statistics.classAveragePercentage],
          ['Highest percentage', report.statistics.highestPercentage ?? ''], ['Lowest percentage', report.statistics.lowestPercentage ?? '']
        ] : type === 'failed' ? [
          ['Failed students summary'], ['Students with failed subjects', report.summary.failedStudents],
          ['Incomplete students in selected scope', report.summary.incompleteStudents],
          ['Incomplete records with explicit failed subjects', report.summary.studentsWithFailuresAndIncompleteRecords]
        ] : type === 'subject-wise' ? [
          ['Subject performance comparison'], ['Highest pass percentage', report.comparison.highestPassPercentage ?? ''],
          ['Highest pass subjects', report.comparison.highestPassSubjects.join('; ')],
          ['Lowest pass percentage', report.comparison.lowestPassPercentage ?? ''],
          ['Lowest pass subjects', report.comparison.lowestPassSubjects.join('; ')]
        ] : [
          ['Student performance summary'], ['USN', report.student.usn], ['Student name', report.student.studentName],
          ['Batch', report.student.batchName], ['Academic session', report.student.academicSession],
          ['Total marks', report.summary.totalMarks ?? ''], ['Maximum marks', report.summary.maxMarks ?? ''],
          ['Percentage', report.summary.percentage ?? ''], ['SGPA', report.summary.sgpa ?? ''],
          ['CGPA', report.summary.cgpa ?? ''], ['Subjects passed', report.summary.subjectsPassed],
          ['Subjects failed', report.summary.subjectsFailed], ['Overall status', report.summary.overallStatus]
        ];
        const summary = [
          ...summaryRows, []
        ].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
        csv = `${summary}\r\n${csv}`;
      }
      res.type('text/csv; charset=utf-8');
      res.set('Content-Disposition', `attachment; filename="${base}.csv"`);
      return res.send(`\uFEFF${csv}`);
    }
    if (format === 'xlsx' || format === 'excel') {
      const workbook = XLSX.utils.book_new();
      if (type === 'class') XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
        'Total students': report.statistics.totalStudents, Passed: report.statistics.passedStudents,
        Failed: report.statistics.failedStudents, Incomplete: report.statistics.incompleteStudents,
        'Pass percentage': report.statistics.passPercentage, 'Class average percentage': report.statistics.classAveragePercentage,
        'Highest percentage': report.statistics.highestPercentage, 'Lowest percentage': report.statistics.lowestPercentage
      }]), 'Summary');
      if (type === 'failed') XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
        'Students with failed subjects': report.summary.failedStudents,
        'Incomplete students in selected scope': report.summary.incompleteStudents,
        'Incomplete records with explicit failures': report.summary.studentsWithFailuresAndIncompleteRecords
      }]), 'Summary');
      if (type === 'subject-wise') XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
        'Highest pass percentage': report.comparison.highestPassPercentage,
        'Highest pass subjects': report.comparison.highestPassSubjects.join('; '),
        'Lowest pass percentage': report.comparison.lowestPassPercentage,
        'Lowest pass subjects': report.comparison.lowestPassSubjects.join('; ')
      }]), 'Comparison');
      if (type === 'student') XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
        USN: report.student.usn, Student: report.student.studentName, Batch: report.student.batchName,
        'Academic session': report.student.academicSession, 'Total marks': report.summary.totalMarks,
        'Maximum marks': report.summary.maxMarks, Percentage: report.summary.percentage,
        SGPA: report.summary.sgpa, CGPA: report.summary.cgpa, 'Subjects passed': report.summary.subjectsPassed,
        'Subjects failed': report.summary.subjectsFailed, 'Overall status': report.summary.overallStatus
      }]), 'Summary');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows, { header: reportHeaders(type) }), type === 'student' ? 'Results' : 'Report');
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.set('Content-Disposition', `attachment; filename="${base}.xlsx"`);
      return res.send(buffer);
    }
    return res.status(400).json({ success: false, message: 'Format must be csv or xlsx.' });
  } catch (error) { return sendError(res, error); }
};
