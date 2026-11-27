'use strict';

const { getPool, isDbDisabled } = require('../config/db');
const { calculateGrade } = require('./resultCalculationService');

/**
 * Inserts comprehensive academic demo data into the database if not already present.
 * User accounts are provisioned separately by the administrator.
 */
async function seedDemoData() {
  if (isDbDisabled()) {
    console.log('Database disabled: skipping demo seed data.');
    return { seeded: false, reason: 'Database disabled' };
  }

  const pool = getPool();
  if (!pool) {
    console.log('Database pool unavailable: skipping demo seed data.');
    return { seeded: false, reason: 'No pool' };
  }

  const connection = await pool.getConnection();
  try {
    // 1. Seed Batches
    async function getOrCreateBatch(batchName, startYear, endYear) {
      const [rows] = await connection.execute('SELECT id FROM batches WHERE batch_name = ?', [batchName]);
      if (rows.length > 0) return rows[0].id;
      const [result] = await connection.execute(
        'INSERT INTO batches (batch_name, start_year, end_year, status) VALUES (?, ?, ?, ?)',
        [batchName, startYear, endYear, 'Active']
      );
      return result.insertId;
    }

    const batchId2025 = await getOrCreateBatch('2025-2027', 2025, 2027);
    const batchId2024 = await getOrCreateBatch('2024-2026', 2024, 2026);

    // 2. Seed Semesters for Batch 2025-2027
    async function getOrCreateSemester(batchId, semNum, semName) {
      const [rows] = await connection.execute(
        'SELECT id FROM semesters WHERE batch_id = ? AND semester_number = ?',
        [batchId, semNum]
      );
      if (rows.length > 0) return rows[0].id;
      const [result] = await connection.execute(
        'INSERT INTO semesters (batch_id, semester_number, semester_name, status) VALUES (?, ?, ?, ?)',
        [batchId, semNum, semName, 'Active']
      );
      return result.insertId;
    }

    const sem1Id = await getOrCreateSemester(batchId2025, 1, 'Semester 1');
    const sem2Id = await getOrCreateSemester(batchId2025, 2, 'Semester 2');
    await getOrCreateSemester(batchId2024, 1, 'Semester 1');

    // 3. Seed Exam Sessions
    async function getOrCreateSession(semesterId, sessionName, startDate, endDate) {
      const [rows] = await connection.execute(
        'SELECT id FROM exam_sessions WHERE semester_id = ? AND session_name = ?',
        [semesterId, sessionName]
      );
      if (rows.length > 0) return rows[0].id;
      const [result] = await connection.execute(
        'INSERT INTO exam_sessions (semester_id, session_name, start_date, end_date, status) VALUES (?, ?, ?, ?, ?)',
        [semesterId, sessionName, startDate, endDate, 'Active']
      );
      return result.insertId;
    }

    const session1Id = await getOrCreateSession(
      sem1Id,
      'Jan-Feb 2025 Regular Examination',
      '2025-01-06',
      '2025-01-24'
    );
    await getOrCreateSession(
      sem2Id,
      'June-July 2025 Regular Examination',
      '2025-06-09',
      '2025-06-27'
    );

    // 4. Seed Subjects for Semester 1
    const sem1Subjects = [
      { code: 'MCA101', name: 'Advanced Data Structures', credits: 4, internal: 40, external: 60, total: 100 },
      { code: 'MCA102', name: 'Advanced Database Systems', credits: 4, internal: 40, external: 60, total: 100 },
      { code: 'MCA103', name: 'Web Technologies', credits: 4, internal: 40, external: 60, total: 100 },
      { code: 'MCA104', name: 'Software Engineering & Design Patterns', credits: 4, internal: 40, external: 60, total: 100 },
      { code: 'MCA105', name: 'Cloud Computing & DevOps', credits: 3, internal: 40, external: 60, total: 100 },
      { code: 'MCA106', name: 'Machine Learning Fundamentals', credits: 3, internal: 40, external: 60, total: 100 }
    ];

    for (const sub of sem1Subjects) {
      const [rows] = await connection.execute(
        'SELECT id FROM subjects WHERE semester_id = ? AND subject_code = ?',
        [sem1Id, sub.code]
      );
      if (rows.length === 0) {
        await connection.execute(
          `INSERT INTO subjects (semester_id, subject_code, subject_name, max_internal_marks, max_external_marks, total_maximum_marks, credits, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'Active')`,
          [sem1Id, sub.code, sub.name, sub.internal, sub.external, sub.total, sub.credits]
        );
      }
    }

    // Also seed Semester 2 Subjects
    const sem2Subjects = [
      { code: 'MCA201', name: 'Artificial Intelligence', credits: 4, internal: 40, external: 60, total: 100 },
      { code: 'MCA202', name: 'Full Stack Development', credits: 4, internal: 40, external: 60, total: 100 },
      { code: 'MCA203', name: 'Cyber Security & Cryptography', credits: 4, internal: 40, external: 60, total: 100 },
      { code: 'MCA204', name: 'Big Data Analytics', credits: 3, internal: 40, external: 60, total: 100 }
    ];

    for (const sub of sem2Subjects) {
      const [rows] = await connection.execute(
        'SELECT id FROM subjects WHERE semester_id = ? AND subject_code = ?',
        [sem2Id, sub.code]
      );
      if (rows.length === 0) {
        await connection.execute(
          `INSERT INTO subjects (semester_id, subject_code, subject_name, max_internal_marks, max_external_marks, total_maximum_marks, credits, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'Active')`,
          [sem2Id, sub.code, sub.name, sub.internal, sub.external, sub.total, sub.credits]
        );
      }
    }

    // 5. Seed Students in Batch 2025-2027
    const demoStudents = [
      { usn: '1RV25MC001', name: 'Ravi Kumar', email: 'ravi.kumar@example.com' },
      { usn: '1RV25MC002', name: 'Priya Singh', email: 'priya.singh@example.com' },
      { usn: '1RV25MC003', name: 'Amit Patel', email: 'amit.patel@example.com' },
      { usn: '1RV25MC004', name: 'Sneha Roy', email: 'sneha.roy@example.com' },
      { usn: '1RV25MC005', name: 'Rohit Jain', email: 'rohit.jain@example.com' },
      { usn: '1RV25MC006', name: 'Kavita Verma', email: 'kavita.verma@example.com' },
      { usn: '1RV25MC007', name: 'Deepak Choudhary', email: 'deepak.c@example.com' },
      { usn: '1RV25MC008', name: 'Anil Sharma', email: 'anil.sharma@example.com' },
      { usn: '1RV25MC009', name: 'Vikram Malhotra', email: 'vikram.m@example.com' },
      { usn: '1RV25MC010', name: 'Pooja Sharma', email: 'pooja.s@example.com' },
      { usn: '1RV25MC011', name: 'Neha Gupta', email: 'neha.gupta@example.com' },
      { usn: '1RV25MC012', name: 'Sameer Khan', email: 'sameer.khan@example.com' },
      { usn: '1RV25MC013', name: 'Anita Desai', email: 'anita.desai@example.com' },
      { usn: '1RV25MC014', name: 'Gaurav Agarwal', email: 'gaurav.a@example.com' },
      { usn: '1RV25MC015', name: 'Kriti Sen', email: 'kriti.sen@example.com' }
    ];

    for (const student of demoStudents) {
      const [rows] = await connection.execute('SELECT id FROM students WHERE usn = ?', [student.usn]);
      if (rows.length === 0) {
        await connection.execute(
          'INSERT INTO students (usn, name, email, batch_id) VALUES (?, ?, ?, ?)',
          [student.usn, student.name, student.email, batchId2025]
        );
      }
    }

    // 6. Seed Results for Semester 1 Exam Session
    // Curated marks for each student across the 6 subjects
    const studentMarksMap = {
      '1RV25MC001': [86, 88, 84, 89, 87, 85], // Ravi Kumar (~86.5% - A+)
      '1RV25MC002': [92, 95, 88, 91, 94, 90], // Priya Singh (~91.7% - O topper)
      '1RV25MC003': [80, 82, 79, 85, 81, 78], // Amit Patel (~80.8% - A+)
      '1RV25MC004': [70, 68, 73, 71, 69, 72], // Sneha Roy (~70.5% - A)
      '1RV25MC005': [74, 76, 72, 75, 78, 71], // Rohit Jain (~74.3% - A)
      '1RV25MC006': [65, 62, 67, 64, 66, 63], // Kavita Verma (~64.5% - B+)
      '1RV25MC007': [60, 64, 61, 63, 62, 59], // Deepak Choudhary (~61.5% - B+)
      '1RV25MC008': [58, 56, 59, 57, 55, 60], // Anil Sharma (~57.5% - B)
      '1RV25MC009': [56, 55, 57, 58, 54, 56], // Vikram Malhotra (~56.0% - B)
      '1RV25MC010': [52, 54, 51, 50, 53, 52], // Pooja Sharma (~52.0% - C)
      '1RV25MC011': [51, 53, 50, 52, 51, 50], // Neha Gupta (~51.2% - C)
      '1RV25MC012': [52, 50, 48, 54, 51, 53], // Sameer Khan (1 fail)
      '1RV25MC013': [48, 52, 50, 51, 49, 53], // Anita Desai (2 fails)
      '1RV25MC014': [42, 45, 39, 44, 40, 46], // Gaurav Agarwal (all fail)
      '1RV25MC015': [45, 48, 42, 46, 44, 43]  // Kriti Sen (all fail)
    };

    let insertedResultsCount = 0;
    for (const [usn, marksArr] of Object.entries(studentMarksMap)) {
      for (let i = 0; i < sem1Subjects.length; i++) {
        const sub = sem1Subjects[i];
        const marks = marksArr[i];
        const maxMarks = sub.total;
        const percentage = (marks / maxMarks) * 100;
        const grade = calculateGrade(percentage);
        const status = marks >= 50 ? 'Pass' : 'Fail';

        const [existing] = await connection.execute(
          'SELECT id FROM results WHERE usn = ? AND subject_code = ? AND exam_session_id = ?',
          [usn, sub.code, session1Id]
        );

        if (existing.length === 0) {
          await connection.execute(
            `INSERT INTO results (usn, subject_code, subject_name, marks_obtained, max_marks, grade, status, exam_session_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [usn, sub.code, sub.name, marks, maxMarks, grade, status, session1Id]
          );
          insertedResultsCount++;
        }
      }
    }

    console.log(`Demo seed completed successfully. Inserted ${insertedResultsCount} new result records.`);
    return { seeded: true, resultsCount: insertedResultsCount };
  } catch (error) {
    console.error('Error during demo seeding:', error.message);
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { seedDemoData };
