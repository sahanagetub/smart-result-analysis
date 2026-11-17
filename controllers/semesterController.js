const semesterService = require('../services/semesterService');

async function getSemestersByBatch(req, res, next) {
  try {
    const batchId = req.params.batchId || req.query.batchId || req.query.batch_id || '';
    const search = req.query.search || '';
    const status = req.query.status || '';
    const semesters = await semesterService.listSemestersService(batchId, search, status);
    res.json({ success: true, data: semesters });
  } catch (err) {
    next ? next(err) : res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function getAllSemesters(req, res, next) {
  try {
    const batchId = req.query.batchId || req.query.batch_id || '';
    const search = req.query.search || '';
    const status = req.query.status || '';
    const semesters = await semesterService.listSemestersService(batchId, search, status);
    res.json({ success: true, data: semesters });
  } catch (err) {
    next ? next(err) : res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function getSemesterById(req, res, next) {
  try {
    const semester = await semesterService.getSemesterByIdService(req.params.id);
    res.json({ success: true, data: semester });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    next ? next(err) : res.status(500).json({ success: false, message: err.message });
  }
}

async function createSemester(req, res, next) {
  try {
    const semester = await semesterService.createSemesterService(req.body);
    res.status(201).json({ success: true, data: semester, message: 'Semester created successfully.' });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    next ? next(err) : res.status(500).json({ success: false, message: err.message });
  }
}

async function updateSemester(req, res, next) {
  try {
    const semester = await semesterService.updateSemesterService(req.params.id, req.body);
    res.json({ success: true, data: semester, message: 'Semester updated successfully.' });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    next ? next(err) : res.status(500).json({ success: false, message: err.message });
  }
}

async function deleteSemester(req, res, next) {
  try {
    const result = await semesterService.deleteSemesterService(req.params.id);
    res.json({ success: true, message: result.message || 'Semester deleted successfully.' });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    next ? next(err) : res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  getSemestersByBatch,
  getAllSemesters,
  getSemesterById,
  createSemester,
  updateSemester,
  deleteSemester
};
