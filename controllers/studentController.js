const studentService = require('../services/studentService');

async function addStudent(req, res, next) {
  try {
    const payload = {
      usn: req.body.usn.trim(),
      name: req.body.name.trim(),
      email: req.body.email.trim(),
      batch_id: req.body.batch_id
    };

    // Validate required fields
    if (!payload.usn) {
      return res.status(400).json({ success: false, message: 'USN is required.' });
    }
    if (!payload.name) {
      return res.status(400).json({ success: false, message: 'Student name is required.' });
    }
    if (!payload.email) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }
    if (!payload.batch_id) {
      return res.status(400).json({ success: false, message: 'Batch is required.' });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(payload.email)) {
      return res.status(400).json({ success: false, message: 'Invalid email format.' });
    }

    const student = await studentService.addStudentService(payload);
    res.status(201).json({ success: true, data: student, message: 'Student added successfully.' });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    console.error('Add student error:', err);
    return res.status(500).json({ success: false, message: 'Failed to add student.' });
  }
}

async function listStudents(req, res, next) {
  try {
    const batchId = req.params.batchId || '';
    const search = req.query.search || '';
    const students = await studentService.listStudentsService(batchId, search);
    const counts = await studentService.getCountsByBatchService();
    res.json({ success: true, data: students, counts });
  } catch (err) {
    next(err);
  }
}

async function getStudent(req, res, next) {
  try {
    const student = await studentService.getStudentService(req.params.id);
    res.json({ success: true, data: student });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  addStudent,
  listStudents,
  getStudent
};