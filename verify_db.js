const mysql = require('mysql2/promise');

async function verifyDatabase() {
  const pool = mysql.createPool({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'Sahana@2004',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
  
  try {
    const conn = await pool.getConnection();
    conn.changeUser({ database: 'smart_result_analysis' });
    
    console.log('=== Database Verification ===\n');
    
    const [tables] = await conn.execute('SHOW TABLES');
    console.log('Tables:', tables.map(t => Object.keys(t[0])));
    
    console.log('\n--- Batches ---');
    const [batches] = await conn.execute('SELECT * FROM batches');
    console.log(batches);
    
    console.log('\n--- Students ---');
    const [students] = await conn.execute('SELECT * FROM students');
    console.log('Count:', students.length);
    console.log(students.slice(0, 3));
    
    console.log('\n--- Semesters ---');
    const [semesters] = await conn.execute('SELECT * FROM semesters');
    console.log(semesters);
    
    console.log('\n--- Subjects ---');
    const [subjects] = await conn.execute('SELECT * FROM subjects');
    console.log('Count:', subjects.length);
    console.log(subjects.slice(0, 5));
    
    console.log('\n--- Exam Sessions ---');
    const [sessions] = await conn.execute('SELECT * FROM exam_sessions');
    console.log(sessions);
    
    console.log('\n--- Results ---');
    const [results] = await conn.execute('SELECT * FROM results');
    console.log('Count:', results.length);
    console.log(results.slice(0, 5));
    
    conn.release();
    pool.end();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

verifyDatabase();