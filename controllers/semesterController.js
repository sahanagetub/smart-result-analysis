const semesterService = require('../services/semesterService');

async function getSemestersByBatch(req, res) {
  try {
    const batchId = req.params.batchId;
    const search = req.query.search || '';
    const semesters = await semesterService.listSemestersService(batchId, search);
    res.json({ success: true, data: semesters });
  } catch (err) {
    console.error('Get semesters error:', err);
    res.status(500).json({ success: false, message: 'Failed to get semesters.' });
  }
}

async function getSemesterById(req, res) {
  try {
    const semesterId = req.params.id;
    const semester = await semesterService.getSemesterByIdService(semesterId);
    res.json({ success: true, data: semester });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    console.error('Get semester error:', err);
    res.status(500).json({ success: false, message: 'Failed to get semester.' });
  }
}

async function createSemester(req, res) {
  try {
    const { batch_id, semester_number, semester_name, status } = req.body;
    
    if (!batch_id || !semester_number || !semester_name) {
      return res.status(400).json({ success: false, message: 'Batch ID, semester number, and semester name are required.' });
    }
    
    const semester = await semesterService.createSemesterService({
      batch_id: batch_id,
      semester_number: semester_number,
      semester_name: semester_name,
      status: status || 'Active'
    });
    
    res.json({ success: true, data: semester, message: 'Semester created successfully.' });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    console.error('Create semester error:', err);
    res.status(500).json({ success: false, message: 'Failed to create semester.' });
  }
}

async function updateSemester(req, res) {
  try {
    const semesterId = req.params.id;
    const { semester_name, status } = req.body;
    
    if (!semester_name) {
      return res.status(400).json({ success: false, message: 'Semester name is required.' });
    }
    
    // Get existing semester to check batch_id
    const existing = await semesterService.getSemesterByIdService(semesterId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Semester not found.' });
    }
    
    // Update the semester
    const pool = require('../config/db').getPool();
    if (!pool) {
      return res.status(500).json({ success: false, message: 'Database pool unavailable.' });
    }
    
    const [result] = await pool.execute(
      'UPDATE semesters SET semester_name = ?, status = ? WHERE id = ?',
      [semester_name, status || existing.status, semesterId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Semester not found.' });
    }
    
    const updatedSemester = await semesterService.getSemesterByIdService(semesterId);
    res.json({ success: true, data: updatedSemester, message: 'Semester updated successfully.' });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    console.error('Update semester error:', err);
    res.status(500).json({ success: false, message: 'Failed to update semester.' });
  }
}

async function deleteSemester(req, res) {
  try {
    const semesterId = req.params.id;
    
    // Check if semester exists
    const existing = await semesterService.getSemesterByIdService(semesterId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Semester not found.' });
    }
    
    const pool = require('../config/db').getPool();
    if (!pool) {
      return res.status(500).json({ success: false, message: 'Database pool unavailable.' });
    }
    
    const [result] = await pool.execute(
      'DELETE FROM semesters WHERE id = ?',
      [semesterId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Semester not found.' });
    }
    
    res.json({ success: true, message: 'Semester deleted successfully.' });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    console.error('Delete semester error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete semester.' });
  }
}

module.exports = {
  getSemestersByBatch,
  getSemesterById,
  createSemester,
  updateSemester,
  deleteSemester
};