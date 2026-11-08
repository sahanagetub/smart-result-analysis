// Phase 8: Random Result Test Data Seeder
const mysql = require('mysql2/promise');

async function getRandomMarks(maxMarks) {
  const r = Math.random();
  let m;
  if (r < 0.3) m = Math.random() * (maxMarks * 0.3 + 1) + maxMarks * 0.7;
  else if (r < 0.7) m = Math.random() * (maxMarks * 0.3 + 1) + maxMarks * 0.4;
  else m = Math.random() * (maxMarks * 0.4 + 1);
  return Math.max(0, Math.min(maxMarks, Math.round(m * 100) / 100));
}

async function status(m, M) { return (m / M * 100) >= 40 ? 'Pass' : 'Fail'; }

async function grade(m, M) {
  const p = (m / M) * 100;
  if (p >= 80) return 'A+';
  if (p >= 70) return 'A';
  if (p >= 60) return 'B';
  if (p >= 50) return 'C';
  if (p >= 40) return 'D';
  return 'F';
}

async function main() {
  console.log('Phase 8: Random Result Test Data (First 50%)');

  const pool = require('../../config/db').getPool();
  if (!pool) { console.log('DB unavailable'); return; }

  const conn = await pool.getConnection();
  const [e] = await conn.execute('SELECT COUNT(*) as cnt FROM students');
  if (e[0].cnt === 0) {
    const [b] = await conn.execute('SELECT id FROM batches LIMIT 1');
    const bid = b.length > 0 ? b[0].id : await conn.execute('INSERT INTO batches (batch_name,start_year,end_year,status) VALUES (?,?,?,?)', ['BCA 2024', 2024, 2027, 'Active']);
    const iid = batchId ? batchId : (await conn.execute('INSERT INTO batches (batch_name,start_year,end_year,status) VALUES (?,?,?,?)', ['BCA 2024', 2024, 2027, 'Active'])).insertId;
    const names = ['Ajay','Bindu','Chandra','David','Emily','Frank','Grace','Hari','Ila','Jay'];
    const realEmails = ['ajay@test.com','bindu@test.com','chandra@test.com','david@test.com','emily@test.com','frank@test.com','grace@test.com','hari@test.com','ila@test.com','jay@test.com'];
    for (let i = 0; i < 10; i++) {
      await conn.execute('INSERT INTO students (usn,name,email,batch_id) VALUES (?,?,?,?)', ['USN202400' + (i+1), names[i], realEmails[i], iid]);
    }
    console.log('Created 10 dummy students');
  }

  const [students] = await conn.execute('SELECT id, usn FROM students');
  console.log(students.length + ' students found');

  const [semesters] = await conn.execute('SELECT * FROM semesters');
  if (semesters.length === 0) { console.error('No semesters'); conn.release(); return; }
  const semId = semesters[0].id;
  console.log('Using semester ID ' + semId);

  const [subj] = await conn.execute('SELECT * FROM subjects WHERE semester_id = ?', [semId]);
  if (subj.length < 6) { console.error('Need 6+ subjects'); conn.release(); return; }
  const subjects = subj.slice(0, 6);
  console.log(subjects.length + ' subjects selected');

  const [sessions] = await conn.execute('SELECT * FROM exam_sessions WHERE semester_id = ?', [semId]);
  if (sessions.length === 0) { console.error('No exam sessions'); conn.release(); return; }
  const session = sessions[0];
  console.log('Using session: ' + session.session_name);

  const [existing] = await conn.execute('SELECT usn FROM results WHERE exam_session_id = ?', [session.id]);
  const usedUsns = new Set(existing.map(r => r.usn));
  console.log(usedUsns.size + ' existing results for this session');

  const available = students.filter(s => !usedUsns.has(s.usn));
  let useStudents = available;
  while (useStudents.length < 60) useStudents = useStudents.concat(available);
  useStudents = useStudents.slice(0, 60);
  console.log(useStudents.length + ' students to process');

  const records = [];
  for (let i = 0; i < 60; i++) {
    const usn = useStudents[i].usn;
    let passed = 0, failed = 0, total = 0;
    for (let j = 0; j < 6; j++) {
      const subj = subjects[j];
      const marks = await getRandomMarks(subj.total_maximum_marks);
      const s = await status(marks, subj.total_maximum_marks);
      const g = await grade(marks, subj.total_maximum_marks);
      if (s === 'Pass') passed++;
      else failed++;
      total += marks;
      records.push({ usn, subject_code: subj.subject_code, subject_name: subj.subject_name, marks_obtained: Math.max(0, Math.min(subj.total_maximum_marks, marks)), max_marks: subj.total_maximum_marks, grade: g, status: s, exam_session_id: session.id });
    }
    const oStatus = failed === 0 ? 'Pass' : failed === 1 ? 'Fail' : 'Fail';
    const avg = Math.round((total / 6) * 100) / 100;
    const oGrade = await grade(avg, 100);
    records.push({ usn, subject_code: subjects[0].subject_code, subject_name: '', marks_obtained: avg, max_marks: 600, grade: oGrade, status: oStatus, exam_session_id: session.id });
  }

  const outcomes = {};
  records.forEach(r => { if (!outcomes[r.usn]) outcomes[r.usn] = { p: 0, f: 0 }; outcomes[r.usn][r.status]++; });
  let pa = 0, fo = 0, mu = 0;
  Object.values(outcomes).forEach(o => { if (o.f === 0) pa++; else if (o.f === 1) fo++; else mu++; });

  console.log('=== Results Summary ===');
  console.log('Student records: ' + 60);
  console.log('Subject-wise records: ' + records.length);
  console.log('Pass all: ' + pa + ', Fail one: ' + fo + ', Fail multiple: ' + mu);
  console.log('Outcome distribution:');
  console.log('- Pass all 6 subjects: ' + pa);
  console.log('- Fail exactly 1 subject: ' + fo);
  console.log('- Fail multiple subjects: ' + mu);
  const sr = { h: 0, a: 0, l: 0 };
  records.forEach(r => { const pct = (r.marks_obtained / r.max_marks) * 100; if (pct >= 70) sr.h++; else if (pct >= 50) sr.a++; else sr.l++; });
  console.log('High (70%+): ' + sr.h);
  console.log('Average (50-69%): ' + sr.a);
  console.log('Low (<50%): ' + sr.l);
  console.log('Sample records (first 12):');
  console.log('USN\tSubj\tMarks\tMax\tStatus\tGrade');
  records.slice(0, 12).forEach(r => { console.log(r.usn + '\t' + r.subject_code + '\t' + r.marks_obtained + '\t' + r.max_marks + '\t' + r.status + '\t' + r.grade); });

  conn.release();
  require('../config/db').getPool().end();
  console.log('\nSeed script complete.');
}

main().catch(e => console.error('Error:', e.message));