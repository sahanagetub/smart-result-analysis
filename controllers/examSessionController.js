const examSessionService = require('../services/examSessionService');

async function createExamSession(req, res) {
  try {
    const { semester_id, session_name, start_date, end_date, status } = req.body;

    if (!semester_id || !session_name) {
      return res.status(400).json({ success: false, message: 'Semester ID and session name are required.' });
    }

    const result = await examSessionService.createExamSessionService({
      semester_id,
      session_name,
      start_date: start_date || null,
      end_date: end_date || null,
      status: status || 'Active'
    });

    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    console.error('Create exam session error:', err);
    res.status(500).json({ success: false, message: 'Failed to create exam session.' });
  }
}

async function getAllExamSessions(req, res) {
  try {
    const result = await examSessionService.getAllExamSessionsService();
    res.json(result);
  } catch (err) {
    console.error('Get all exam sessions error:', err);
    res.status(500).json({ success: false, message: 'Failed to get exam sessions.' });
  }
}

async function getExamSessionsBySemester(req, res) {
  try {
    const semesterId = req.params.semesterId;
    const search = req.query.search || '';
    const result = await examSessionService.getExamSessionsBySemesterService(semesterId, search);
    res.json(result);
  } catch (err) {
    console.error('Get exam sessions by semester error:', err);
    res.status(500).json({ success: false, message: 'Failed to get exam sessions.' });
  }
}

async function getExamSessionById(req, res) {
  try {
    const examSessionId = req.params.id;
    const result = await examSessionService.getExamSessionByIdService(examSessionId);
    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    console.error('Get exam session error:', err);
    res.status(500).json({ success: false, message: 'Failed to get exam session.' });
  }
}

async function updateExamSession(req, res) {
  try {
    const examSessionId = req.params.id;
    const { session_name, start_date, end_date, status } = req.body;

    const result = await examSessionService.updateExamSessionService(examSessionId, {
      session_name,
      start_date,
      end_date,
      status
    });

    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    console.error('Update exam session error:', err);
    res.status(500).json({ success: false, message: 'Failed to update exam session.' });
  }
}

async function deleteExamSession(req, res) {
  try {
    const examSessionId = req.params.id;

    const result = await examSessionService.deleteExamSessionService(examSessionId);

    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    console.error('Delete exam session error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete exam session.' });
  }
}

async function getExamSessionStats(req, res) {
  try {
    const pool = require('../config/db').getPool();
    if (!pool) {
      return res.json({ success: false, message: 'Database pool unavailable.' });
    }

    const [active] = await pool.execute(
      'SELECT COUNT(*) AS count FROM exam_sessions WHERE status = ?', ['Active']
    );
    const [inactive] = await pool.execute(
      'SELECT COUNT(*) AS count FROM exam_sessions WHERE status = ?', ['Inactive']
    );
    const [total] = await pool.execute('SELECT COUNT(*) AS count FROM exam_sessions');

    res.json({
      success: true,
      data: {
        total: total[0].count,
        active: active[0].count,
        inactive: inactive[0].count
      }
    });
  } catch (err) {
    console.error('Get exam session stats error:', err);
    res.status(500).json({ success: false, message: 'Failed to get exam session statistics.' });
  }
}

async function updateExamSessionStatus(req, res) {
  try {
    const examSessionId = req.params.id;
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required.' });
    }
    const pool = require('../config/db').getPool();
    if (!pool) {
      return res.status(500).json({ success: false, message: 'Database pool unavailable.' });
    }
    const [result] = await pool.execute(
      'UPDATE exam_sessions SET status = ? WHERE id = ?',
      [status, examSessionId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Exam session not found.' });
    }
    const [updated] = await pool.execute(
      'SELECT id, session_name, status FROM exam_sessions WHERE id = ?', [examSessionId]
    );
    res.json({
      success: true,
      data: updated[0],
      message: 'Exam session status updated successfully.'
    });
  } catch (err) {
    console.error('Update exam session status error:', err);
    res.status(500).json({ success: false, message: 'Failed to update exam session status.' });
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