const examSessionService = require('../services/examSessionService');

async function createExamSession(req, res, next) {
  try {
    const result = await examSessionService.createExamSessionService(req.body);
    res.status(201).json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    next ? next(err) : res.status(500).json({ success: false, message: err.message });
  }
}

async function getAllExamSessions(req, res, next) {
  try {
    const search = req.query.search || '';
    const semesterId = req.query.semesterId || req.query.semester_id || '';
    const result = await examSessionService.getAllExamSessionsService(search, semesterId);
    res.json(result);
  } catch (err) {
    next ? next(err) : res.status(500).json({ success: false, message: err.message });
  }
}

async function getExamSessionsBySemester(req, res, next) {
  try {
    const semesterId = req.params.semesterId;
    const search = req.query.search || '';
    const result = await examSessionService.getExamSessionsBySemesterService(semesterId, search);
    res.json(result);
  } catch (err) {
    next ? next(err) : res.status(500).json({ success: false, message: err.message });
  }
}

async function getExamSessionById(req, res, next) {
  try {
    const result = await examSessionService.getExamSessionByIdService(req.params.id);
    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    next ? next(err) : res.status(500).json({ success: false, message: err.message });
  }
}

async function updateExamSession(req, res, next) {
  try {
    const result = await examSessionService.updateExamSessionService(req.params.id, req.body);
    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    next ? next(err) : res.status(500).json({ success: false, message: err.message });
  }
}

async function deleteExamSession(req, res, next) {
  try {
    const result = await examSessionService.deleteExamSessionService(req.params.id);
    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    next ? next(err) : res.status(500).json({ success: false, message: err.message });
  }
}

async function getExamSessionStats(req, res, next) {
  try {
    const result = await examSessionService.getExamSessionStatsService();
    res.json(result);
  } catch (err) {
    next ? next(err) : res.status(500).json({ success: false, message: err.message });
  }
}

async function updateExamSessionStatus(req, res, next) {
  try {
    const { status } = req.body;
    const result = await examSessionService.updateExamSessionStatusService(req.params.id, status);
    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    next ? next(err) : res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  createExamSession,
  getAllExamSessions,
  getExamSessionsBySemester,
  getExamSessionById,
  updateExamSession,
  deleteExamSession,
  getExamSessionStats,
  updateExamSessionStatus
};
