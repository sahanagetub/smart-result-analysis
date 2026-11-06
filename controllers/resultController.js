const resultService = require('../services/resultService');

async function createResult(req, res, next) {
  try {
    const id = await resultService.createResultService(req.body);
    res.status(201).json({ success: true, data: { id }, message: 'Result created successfully.' });
  } catch (err) {
    next(err);
  }
}

async function getAllResults(req, res, next) {
  try {
    const search = req.query.search || '';
    const results = await resultService.listResultsService(search);
    res.json({ success: true, data: results });
  } catch (err) {
    next(err);
  }
}

async function getResultsByExamSession(req, res, next) {
  try {
    const results = await resultService.getResultsByExamSessionService(req.params.examSessionId);
    res.json({ success: true, data: results });
  } catch (err) {
    next(err);
  }
}

async function getResultStats(req, res, next) {
  try {
    const stats = await resultService.getResultStatsService();
    res.json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
}

async function deleteResult(req, res, next) {
  try {
    await resultService.deleteResultService(req.params.id);
    res.json({ success: true, message: 'Result deleted.' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createResult,
  getAllResults,
  getResultsByExamSession,
  getResultStats,
  deleteResult
};