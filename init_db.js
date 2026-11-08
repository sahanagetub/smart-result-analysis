const mysql = require('mysql2/promise');

async function setupDatabase() {
  console.log('Initializing database...');
  
  // Create a pool without database to initialize the database
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
    
    // Create database if not exists
    await conn.execute('CREATE DATABASE IF NOT EXISTS smart_result_analysis DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci');
    console.log('Database smart_result_analysis created/verified');
    
    // Change database
    conn.changeUser({ database: 'smart_result_analysis' });
    
    // Show tables
    const [tables] = await conn.execute('SHOW TABLES');
    console.log('Existing tables:', tables);
    
    // Create batches table
    await conn.execute(`CREATE TABLE IF NOT EXISTS batches (
      id INT AUTO_INCREMENT PRIMARY KEY,
      batch_name VARCHAR(100) NOT NULL UNIQUE,
      start_year YEAR NOT NULL,
      end_year YEAR NOT NULL,
      status ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_batch_name (batch_name),
      INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    console.log('Batches table ensured');
    
    // Create students table
    await conn.execute(`CREATE TABLE IF NOT EXISTS students (
      id INT AUTO_INCREMENT PRIMARY KEY,
      usn VARCHAR(20) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) NOT NULL UNIQUE,
      batch_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_usn (usn),
      INDEX idx_email (email),
      INDEX idx_batch_id (batch_id),
      CONSTRAINT fk_students_batch FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    console.log('Students table ensured');
    
    // Create semesters table
    await conn.execute(`CREATE TABLE IF NOT EXISTS semesters (
      id INT AUTO_INCREMENT PRIMARY KEY,
      batch_id INT NOT NULL,
      semester_number INT NOT NULL,
      semester_name VARCHAR(50) NOT NULL,
      status ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_batch_id (batch_id),
      INDEX idx_semester (batch_id, semester_number),
      CONSTRAINT fk_semesters_batches FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    console.log('Semesters table ensured');
    
    // Create subjects table
    await conn.execute(`CREATE TABLE IF NOT EXISTS subjects (
      id INT AUTO_INCREMENT PRIMARY KEY,
      semester_id INT NOT NULL,
      subject_code VARCHAR(20) NOT NULL,
      subject_name VARCHAR(100) NOT NULL,
      max_internal_marks INT NOT NULL DEFAULT 40,
      max_external_marks INT NOT NULL DEFAULT 60,
      total_maximum_marks INT NOT NULL DEFAULT 100,
      credits INT NOT NULL DEFAULT 4,
      status ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_subject_code (subject_code),
      INDEX idx_semester_id (semester_id),
      UNIQUE KEY uk_subject_semester (subject_code, semester_id),
      CONSTRAINT fk_subjects_semesters FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    console.log('Subjects table ensured');
    
    // Create exam_sessions table
    await conn.execute(`CREATE TABLE IF NOT EXISTS exam_sessions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      semester_id INT NOT NULL,
      session_name VARCHAR(100) NOT NULL,
      start_date DATE,
      end_date DATE,
      status ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_semester_id (semester_id),
      INDEX idx_session_name (semester_id, session_name),
      CONSTRAINT fk_exam_sessions_semesters FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    console.log('Exam sessions table ensured');
    
    // Create results table
    await conn.execute(`CREATE TABLE IF NOT EXISTS results (
      id INT AUTO_INCREMENT PRIMARY KEY,
      usn VARCHAR(20) NOT NULL,
      subject_code VARCHAR(20) NOT NULL,
      subject_name VARCHAR(100) NOT NULL,
      marks_obtained DECIMAL(5,2) NOT NULL,
      max_marks DECIMAL(5,2) NOT NULL,
      grade VARCHAR(5) NULL,
      status ENUM('Pass','Fail') NOT NULL,
      exam_session_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_usn (usn),
      INDEX idx_exam_session (exam_session_id),
      INDEX idx_subject (subject_code),
      CONSTRAINT fk_results_exam_session FOREIGN KEY (exam_session_id) REFERENCES exam_sessions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    console.log('Results table ensured');
    
    conn.release();
    pool.end();
    console.log('Database setup completed successfully');
    
  } catch (err) {
    console.error('Database setup error:', err.message);
    process.exit(1);
  }
}

setupDatabase();