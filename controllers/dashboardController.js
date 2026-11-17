'use strict';

const dashboardService = require('../services/dashboardService');

function validateFilters(req, res, next) {
  const query = req.query || {};
  const positiveId = (value) => value === undefined || value === '' || /^\d+$/.test(String(value)) && Number(value) > 0;
  const valid =
    (query.academicYear === undefined || /^\d{4}$/.test(String(query.academicYear))) &&
    positiveId(query.batchId) &&
    positiveId(query.semesterId) &&
    (query.semester === undefined || /^\d{1,2}$/.test(String(query.semester))) &&
    positiveId(query.sessionId) &&
    (query.examType === undefined || /^[a-zA-Z0-9 _-]{1,60}$/.test(String(query.examType))) &&
    (query.subjectCode === undefined || /^[a-zA-Z0-9_-]{1,20}$/.test(String(query.subjectCode)));
  if (!valid) return res.status(400).json({ success: false, error: 'One or more dashboard filters are invalid.' });
  return next();
}

async function sendDashboardData(req, res) {
  try {
    return res.json({ success: true, data: await dashboardService.getDashboardData(req.query) });
  } catch (error) {
    console.error('Dashboard data error:', error.message);
    return res.status(500).json({ success: false, error: 'Unable to load dashboard data.' });
  }
}

async function getFilterOptions(req, res) {
  try {
    return res.json({ success: true, data: await dashboardService.getFilterOptions() });
  } catch (error) {
    console.error('Dashboard filter options error:', error.message);
    return res.status(500).json({ success: false, error: 'Unable to load dashboard filters.' });
  }
}

async function getSummary(req, res) {
  try {
    const dashboard = await dashboardService.getDashboardData(req.query);
    const { summary } = dashboard;
    return res.json({
      success: true,
      data: {
        ...summary,
        gradeDistribution: Object.fromEntries(dashboard.charts.gradeDistribution.map((row) => [row.grade, row.count])),
        semesterPassRates: Object.fromEntries(dashboard.charts.semesterPerformance.map((row) => [row.semesterName, row.passPercentage])),
        examPassRates: Object.fromEntries(dashboard.charts.examWisePerformance.map((row) => [row.sessionName, row.passPercentage])),
        hasData: summary.hasData
      }
    });
  } catch (error) {
    console.error('Dashboard summary error:', error.message);
    return res.status(500).json({ success: false, error: 'Unable to load dashboard summary.' });
  }
}

async function getTopPerformers(req, res) {
  try {
    const data = await dashboardService.getDashboardData(req.query);
    return res.json({ success: true, data: data.topPerformers, methodology: 'Average percentage across the filtered result records; equal averages share rank.' });
  } catch (error) {
    console.error('Dashboard top performers error:', error.message);
    return res.status(500).json({ success: false, error: 'Unable to load top-performing students.' });
  }
}

async function getRecentExams(req, res) {
  try {
    const data = await dashboardService.getDashboardData(req.query);
    return res.json({ success: true, data: data.recentExams });
  } catch (error) {
    console.error('Dashboard recent examinations error:', error.message);
    return res.status(500).json({ success: false, error: 'Unable to load recent examinations.' });
  }
}

async function getSubjectPerformance(req, res) {
  try {
    const data = await dashboardService.getDashboardData(req.query);
    return res.json({ success: true, data: data.charts.subjectPerformance });
  } catch (error) {
    console.error('Dashboard subject performance error:', error.message);
    return res.status(500).json({ success: false, error: 'Unable to load subject performance.' });
  }
}

async function getSubjectAverages(req, res) {
  return getSubjectPerformance(req, res);
}

async function getResultDistribution(req, res) {
  try {
    const data = await dashboardService.getDashboardData(req.query);
    return res.json({ success: true, data: Object.fromEntries(data.charts.gradeDistribution.map((row) => [row.grade, row.count])) });
  } catch (error) {
    console.error('Dashboard result distribution error:', error.message);
    return res.status(500).json({ success: false, error: 'Unable to load grade distribution.' });
  }
}

async function getSubjectPassFail(req, res) {
  try {
    const data = await dashboardService.getDashboardData(req.query);
    return res.json({ success: true, data: data.charts.subjectPerformance.map((row) => ({
      subjectCode: row.subjectCode,
      subjectName: row.subjectName,
      passed: row.passedResults,
      failed: row.failedResults,
      totalAppeared: row.totalResults
    })) });
  } catch (error) {
    console.error('Dashboard subject pass/fail error:', error.message);
    return res.status(500).json({ success: false, error: 'Unable to load subject pass/fail data.' });
  }
}

async function getOverallPerformance(req, res) {
  try {
    const { summary } = await dashboardService.getDashboardData(req.query);
    return res.json({ success: true, data: {
      totalAppeared: summary.resultsAvailable,
      overallAverage: summary.averageMarks,
      highestPercentage: summary.highestPercentage,
      lowestPercentage: summary.lowestPercentage
    } });
  } catch (error) {
    console.error('Dashboard overall performance error:', error.message);
    return res.status(500).json({ success: false, error: 'Unable to load overall performance.' });
  }
}

module.exports = {
  getStats: getSummary,
  validateFilters,
  getFilterOptions,
  getDashboardData: sendDashboardData,
  getRecentExams,
  getSummary,
  getSubjectPerformance,
  getTopPerformers,
  getSubjectAverages,
  getResultDistribution,
  getSubjectPassFail,
  getOverallPerformance
};
