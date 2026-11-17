const studentService = require('../services/studentService');
const XLSX = require('xlsx');

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
    const batchId = req.params.batchId || req.query.batchId || req.query.batch_id || '';
    const search = req.query.search || '';
    const students = await studentService.listStudentsService(batchId, search);
    const counts = await studentService.getCountsByBatchService();
    res.json({ success: true, data: students, counts });
  } catch (err) {
    next(err);
  }
}

async function updateStudent(req, res, next) {
  try {
    const { id } = req.params;
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

    const student = await studentService.updateStudentService(id, payload);
    res.json({ success: true, data: student, message: 'Student updated successfully.' });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    console.error('Update student error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update student.' });
  }
}

async function deleteStudent(req, res, next) {
  try {
    const { id } = req.params;
    const student = await studentService.deleteStudentService(id);
    res.json({ success: true, data: student, message: 'Student deleted successfully.' });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    console.error('Delete student error:', err);
    return res.status(500).json({ success: false, message: 'Failed to delete student.' });
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

/**
 * POST /api/students/import
 * Upload file (CSV/XLSX), parse rows, validate, return preview.
 */
async function importStudents(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }
    if (!req.body.batch_id) {
      return res.status(400).json({ success: false, message: 'Batch ID is required.' });
    }

    const batchId = parseInt(req.body.batch_id, 10);
    const fileBuffer = req.file.buffer;
    const fileName = (req.file.originalname || '').toLowerCase();

    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls') && !fileName.endsWith('.csv')) {
      return res.status(400).json({ success: false, message: 'Unsupported file type. Use .csv or .xlsx.' });
    }

    const workbook = XLSX.read(fileBuffer, { type: 'buffer', raw: false });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = firstSheet ? XLSX.utils.sheet_to_json(firstSheet, { defval: '', raw: false }) : [];

    if (!rows || rows.length === 0) {
      return res.status(400).json({ success: false, message: 'No data rows found in file.' });
    }

    // Normalize column names (trim, lowercase)
    const normalized = rows.map((r) => {
      const out = {};
      Object.keys(r).forEach((k) => {
        const key = String(k).replace(/^\uFEFF/, '').trim().toLowerCase();
        out[key] = r[k] == null ? '' : String(r[k]).trim();
      });
      return out;
    });

    const headers = new Set(Object.keys(normalized[0] || {}));
    if (!headers.has('usn') || !(headers.has('student name') || headers.has('name')) || !headers.has('email')) {
      return res.status(400).json({
        success: false,
        message: 'The file must include USN, Student Name, and Email columns.'
      });
    }

    // Validate each row
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const valid = [];
    const invalid = [];
    const seenUsn = new Set();
    const seenEmail = new Set();

    // Fetch existing USNs and emails from DB for this batch (and globally for uniqueness)
    const existingUsns = await studentService.getExistingUsnsService();
    const existingEmails = await studentService.getExistingEmailsService();
    existingUsns.forEach((u) => seenUsn.add(u));
    existingEmails.forEach((e) => seenEmail.add(e));

    normalized.forEach((row, index) => {
      const rowNum = index + 2; // header is row 1
      const errors = [];
      const usn = row.usn || row['usn'] || '';
      const name = row['student name'] || row.name || '';
      const email = row.email || row['email'] || '';

      if (!usn) errors.push('Missing USN');
      if (!name) errors.push('Missing name');
      if (!email) errors.push('Missing email');
      else if (!emailRegex.test(email)) errors.push('Invalid email');

      // Duplicate within file
      if (usn) {
        if (seenUsn.has(usn)) errors.push('Duplicate USN');
        else seenUsn.add(usn);
      }
      if (email) {
        if (seenEmail.has(email)) errors.push('Duplicate email');
        else seenEmail.add(email);
      }

      // Duplicate row (same usn+name+email)
      const rowKey = usn + '|' + name + '|' + email;
      if (seenUsn.has(usn) && errors.includes('Duplicate USN')) {
        // already captured
      }

      if (errors.length > 0) {
        invalid.push({ row: rowNum, data: row, errors });
      } else {
        valid.push({ row: rowNum, usn, name, email, batch_id: batchId });
      }
    });

    return res.json({
      success: true,
      data: {
        total: normalized.length,
        valid: valid.length,
        invalid: invalid.length,
        validRows: valid,
        invalidRows: invalid,
        batch_id: batchId
      }
    });
  } catch (err) {
    console.error('Import students error:', err);
    return res.status(500).json({ success: false, message: 'Failed to process import file.' });
  }
}

/**
 * POST /api/students/import/confirm
 * Save validated students to the database.
 */
async function confirmImportStudents(req, res, next) {
  try {
    const { students, batch_id } = req.body;
    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ success: false, message: 'No students to import.' });
    }
    if (!batch_id) {
      return res.status(400).json({ success: false, message: 'Batch ID is required.' });
    }

    const saved = [];
    const errors = [];

    for (const s of students) {
      try {
        const id = await studentService.addStudentService({
          usn: s.usn,
          name: s.name,
          email: s.email,
          batch_id: batch_id
        });
        saved.push({ ...s, id });
      } catch (err) {
        errors.push({ usn: s.usn, name: s.name, email: s.email, error: err.message });
      }
    }

    return res.json({
      success: true,
      message: `Imported ${saved.length} student(s).`,
      data: { saved, errors }
    });
  } catch (err) {
    console.error('Confirm import error:', err);
    return res.status(500).json({ success: false, message: 'Failed to confirm import.' });
  }
}

module.exports = {
  addStudent,
  listStudents,
  updateStudent,
  deleteStudent,
  getStudent,
  importStudents,
  confirmImportStudents
};
