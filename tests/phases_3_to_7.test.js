const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');

// Set environment for test
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test_secret_for_suite_12345';
process.env.DB_DISABLED = 'false';

// 1. In-memory Mock Database Engine
class MockDatabase {
  constructor() {
    this.reset();
  }

  reset() {
    this.batches = [];
    this.students = [];
    this.semesters = [];
    this.exam_sessions = [];
    this.subjects = [];
    this.results = [];
    this.nextId = {
      batches: 1,
      students: 1,
      semesters: 1,
      exam_sessions: 1,
      subjects: 1,
      results: 1
    };
  }

  async getConnection() {
    return {
      execute: (sql, params) => this.execute(sql, params),
      release: () => {}
    };
  }

  async execute(sql, params = []) {
    const cleanSql = sql.trim().replace(/\s+/g, ' ');
    const deleteTables = {
      'DELETE FROM students WHERE id = ?': this.students,
      'DELETE FROM semesters WHERE id = ?': this.semesters
    };
    if (Object.prototype.hasOwnProperty.call(deleteTables, cleanSql)) {
      const id = Number(params[0]);
      if (!Number.isSafeInteger(id) || id <= 0 || params.length !== 1) return [{ affectedRows: 0 }];
      const rows = deleteTables[cleanSql];
      const index = rows.findIndex(row => Number(row.id) === id);
      if (index < 0) return [{ affectedRows: 0 }];
      rows.splice(index, 1);
      return [{ affectedRows: 1 }];
    }

    // CREATE TABLE queries
    if (/^CREATE TABLE/i.test(cleanSql)) {
      return [{ affectedRows: 0 }];
    }

    // --- BATCHES ---
    if (/^INSERT INTO batches/i.test(cleanSql)) {
      const [batch_name, start_year, end_year, status] = params;
      const id = this.nextId.batches++;
      const item = {
        id,
        batch_name,
        start_year: Number(start_year),
        end_year: Number(end_year),
        status: status || 'Active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      this.batches.push(item);
      return [{ insertId: id, affectedRows: 1 }];
    }

    if (/^SELECT id FROM batches WHERE batch_name = \?/i.test(cleanSql)) {
      const [name, excludeId] = params;
      let matched = this.batches.filter(b => b.batch_name.toLowerCase() === String(name).toLowerCase());
      if (excludeId !== undefined) {
        matched = matched.filter(b => b.id != excludeId);
      }
      return [matched];
    }

    if (/FROM batches WHERE id = \?/i.test(cleanSql)) {
      const [id] = params;
      const matched = this.batches.filter(b => b.id == id);
      return [matched];
    }

    if (/^SELECT COUNT\(\*\) AS cnt FROM students WHERE batch_id = \?/i.test(cleanSql)) {
      const [batchId] = params;
      const count = this.students.filter(s => s.batch_id == batchId).length;
      return [[{ cnt: count }]];
    }

    if (/^SELECT COUNT\(\*\) AS cnt FROM semesters WHERE batch_id = \?/i.test(cleanSql)) {
      const [batchId] = params;
      const count = this.semesters.filter(s => s.batch_id == batchId).length;
      return [[{ cnt: count }]];
    }

    if (/^SELECT b\.id.*FROM batches b/i.test(cleanSql)) {
      const rows = this.batches.map(b => ({
        ...b,
        student_count: this.students.filter(s => s.batch_id == b.id).length
      }));
      return [rows];
    }

    if (/^UPDATE batches SET batch_name = \?/i.test(cleanSql)) {
      const [batch_name, start_year, end_year, status, id] = params;
      const b = this.batches.find(x => x.id == id);
      if (b) {
        b.batch_name = batch_name;
        b.start_year = Number(start_year);
        b.end_year = Number(end_year);
        b.status = status;
        b.updated_at = new Date().toISOString();
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 0 }];
    }

    if (/^UPDATE batches SET status = \?/i.test(cleanSql)) {
      const [status, id] = params;
      const b = this.batches.find(x => x.id == id);
      if (b) {
        b.status = status;
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 0 }];
    }

    if (/^DELETE FROM batches WHERE id = \?/i.test(cleanSql)) {
      const [id] = params;
      const idx = this.batches.findIndex(x => x.id == id);
      if (idx !== -1) {
        this.batches.splice(idx, 1);
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 0 }];
    }

    if (/^SELECT status, COUNT\(\*\) AS cnt FROM batches GROUP BY status/i.test(cleanSql)) {
      const counts = {};
      this.batches.forEach(b => {
        counts[b.status] = (counts[b.status] || 0) + 1;
      });
      const rows = Object.entries(counts).map(([status, cnt]) => ({ status, cnt }));
      return [rows];
    }

    // --- STUDENTS ---
    if (/^INSERT INTO students/i.test(cleanSql)) {
      const [usn, name, email, batch_id] = params;
      const id = this.nextId.students++;
      const item = {
        id,
        usn,
        name,
        email,
        batch_id: Number(batch_id),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      this.students.push(item);
      return [{ insertId: id, affectedRows: 1 }];
    }

    if (/^SELECT id FROM students WHERE usn = \?/i.test(cleanSql)) {
      const [usn, excludeId] = params;
      let matched = this.students.filter(s => s.usn.toLowerCase() === String(usn).toLowerCase());
      if (excludeId !== undefined) matched = matched.filter(s => s.id != excludeId);
      return [matched];
    }

    if (/^SELECT id FROM students WHERE email = \?/i.test(cleanSql)) {
      const [email, excludeId] = params;
      let matched = this.students.filter(s => s.email.toLowerCase() === String(email).toLowerCase());
      if (excludeId !== undefined) matched = matched.filter(s => s.id != excludeId);
      return [matched];
    }

    if (/FROM students WHERE id = \?/i.test(cleanSql)) {
      const [id] = params;
      const matched = this.students.filter(s => s.id == id);
      return [matched];
    }

    if (/^SELECT COUNT\(\*\) AS cnt FROM results WHERE usn = \?/i.test(cleanSql)) {
      const [usn] = params;
      const count = this.results.filter(r => r.usn.toLowerCase() === String(usn).toLowerCase()).length;
      return [[{ cnt: count }]];
    }

    if (/^SELECT s\.id, s\.usn, s\.name.*FROM students s/i.test(cleanSql)) {
      let rows = this.students.map(s => {
        const b = this.batches.find(x => x.id == s.batch_id);
        return { ...s, batch_name: b ? b.batch_name : '' };
      });
      if (cleanSql.includes('s.batch_id = ?')) {
        rows = rows.filter(s => s.batch_id == params[0]);
      }
      return [rows];
    }

    if (/^UPDATE students SET/i.test(cleanSql)) {
      const id = params[params.length - 1];
      const s = this.students.find(x => x.id == id);
      if (s) {
        let pIdx = 0;
        if (cleanSql.includes('usn = ?')) s.usn = params[pIdx++];
        if (cleanSql.includes('name = ?')) s.name = params[pIdx++];
        if (cleanSql.includes('email = ?')) s.email = params[pIdx++];
        if (cleanSql.includes('batch_id = ?')) s.batch_id = Number(params[pIdx++]);
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 0 }];
    }

    if (/^SELECT batch_id, COUNT\(\*\) AS count FROM students GROUP BY batch_id/i.test(cleanSql)) {
      const counts = {};
      this.students.forEach(s => {
        counts[s.batch_id] = (counts[s.batch_id] || 0) + 1;
      });
      const rows = Object.entries(counts).map(([batch_id, count]) => ({ batch_id, count }));
      return [rows];
    }

    // --- SEMESTERS ---
    if (/^INSERT INTO semesters/i.test(cleanSql)) {
      const [batch_id, semester_number, semester_name, status] = params;
      const id = this.nextId.semesters++;
      const item = {
        id,
        batch_id: Number(batch_id),
        semester_number: Number(semester_number),
        semester_name,
        status: status || 'Active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      this.semesters.push(item);
      return [{ insertId: id, affectedRows: 1 }];
    }

    if (/^SELECT id FROM semesters WHERE batch_id = \? AND semester_number = \?/i.test(cleanSql)) {
      const [batchId, semNum, excludeId] = params;
      let matched = this.semesters.filter(s => s.batch_id == batchId && s.semester_number == semNum);
      if (excludeId !== undefined) matched = matched.filter(s => s.id != excludeId);
      return [matched];
    }

    if (/FROM semesters s.*WHERE s\.id = \?/i.test(cleanSql) || /FROM semesters WHERE id = \?/i.test(cleanSql)) {
      const [id] = params;
      const matched = this.semesters.filter(s => s.id == id).map(s => {
        const b = this.batches.find(x => x.id == s.batch_id);
        return { ...s, batch_name: b ? b.batch_name : '' };
      });
      return [matched];
    }

    if (/^SELECT COUNT\(\*\) AS cnt FROM subjects WHERE semester_id = \?/i.test(cleanSql)) {
      const [semId] = params;
      const count = this.subjects.filter(s => s.semester_id == semId).length;
      return [[{ cnt: count }]];
    }

    if (/^SELECT COUNT\(\*\) AS cnt FROM exam_sessions WHERE semester_id = \?/i.test(cleanSql)) {
      const [semId] = params;
      const count = this.exam_sessions.filter(s => s.semester_id == semId).length;
      return [[{ cnt: count }]];
    }

    if (/^SELECT s\.id, s\.batch_id.*FROM semesters s/i.test(cleanSql)) {
      let rows = this.semesters.map(s => {
        const b = this.batches.find(x => x.id == s.batch_id);
        const exam_session_count = this.exam_sessions.filter(es => es.semester_id == s.id).length;
        const subject_count = this.subjects.filter(sub => sub.semester_id == s.id).length;
        return {
          ...s,
          batch_name: b ? b.batch_name : '',
          exam_session_count,
          subject_count
        };
      });
      if (cleanSql.includes('s.batch_id = ?')) {
        rows = rows.filter(s => s.batch_id == params[0]);
      }
      return [rows];
    }

    if (/^UPDATE semesters SET/i.test(cleanSql)) {
      const id = params[params.length - 1];
      const sem = this.semesters.find(x => x.id == id);
      if (sem) {
        if (cleanSql.includes('semester_number = ?')) sem.semester_number = Number(params[0]);
        if (cleanSql.includes('semester_name = ?')) sem.semester_name = params[cleanSql.includes('semester_number = ?') ? 1 : 0];
        if (cleanSql.includes('status = ?')) sem.status = params[params.length - 2];
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 0 }];
    }

    // --- EXAM SESSIONS ---
    if (/^INSERT INTO exam_sessions/i.test(cleanSql)) {
      const [semester_id, session_name, start_date, end_date, status] = params;
      const id = this.nextId.exam_sessions++;
      const item = {
        id,
        semester_id: Number(semester_id),
        session_name,
        start_date,
        end_date,
        status: status || 'Active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      this.exam_sessions.push(item);
      return [{ insertId: id, affectedRows: 1 }];
    }

    if (/^SELECT id FROM exam_sessions WHERE semester_id = \? AND session_name = \?/i.test(cleanSql)) {
      const [semId, name, excludeId] = params;
      let matched = this.exam_sessions.filter(es => es.semester_id == semId && es.session_name.toLowerCase() === String(name).toLowerCase());
      if (excludeId !== undefined) matched = matched.filter(es => es.id != excludeId);
      return [matched];
    }

    if (/FROM exam_sessions es.*WHERE es\.id = \?/i.test(cleanSql)) {
      const [id] = params;
      const matched = this.exam_sessions.filter(es => es.id == id).map(es => {
        const sem = this.semesters.find(s => s.id == es.semester_id);
        const b = sem ? this.batches.find(x => x.id == sem.batch_id) : null;
        return {
          ...es,
          semester_name: sem ? sem.semester_name : '',
          semester_number: sem ? sem.semester_number : 1,
          batch_name: b ? b.batch_name : ''
        };
      });
      return [matched];
    }

    if (/^SELECT COUNT\(\*\) AS cnt FROM results WHERE exam_session_id = \?/i.test(cleanSql)) {
      const [sessionId] = params;
      const count = this.results.filter(r => r.exam_session_id == sessionId).length;
      return [[{ cnt: count }]];
    }

    if (/^SELECT es\.id, es\.semester_id.*FROM exam_sessions es/i.test(cleanSql)) {
      let rows = this.exam_sessions.map(es => {
        const sem = this.semesters.find(s => s.id == es.semester_id);
        const b = sem ? this.batches.find(x => x.id == sem.batch_id) : null;
        return {
          ...es,
          semester_name: sem ? sem.semester_name : '',
          semester_number: sem ? sem.semester_number : 1,
          batch_name: b ? b.batch_name : ''
        };
      });
      if (cleanSql.includes('es.semester_id = ?')) {
        rows = rows.filter(es => es.semester_id == params[0]);
      }
      return [rows];
    }

    if (/^UPDATE exam_sessions SET status = \? WHERE id = \?/i.test(cleanSql)) {
      const [status, id] = params;
      const es = this.exam_sessions.find(x => x.id == id);
      if (es) {
        es.status = status;
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 0 }];
    }

    if (/^UPDATE exam_sessions SET/i.test(cleanSql)) {
      const id = params[params.length - 1];
      const es = this.exam_sessions.find(x => x.id == id);
      if (es) {
        if (cleanSql.includes('session_name = ?')) es.session_name = params[0];
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 0 }];
    }

    if (/^DELETE FROM exam_sessions WHERE id = \?/i.test(cleanSql)) {
      const [id] = params;
      const idx = this.exam_sessions.findIndex(x => x.id == id);
      if (idx !== -1) {
        this.exam_sessions.splice(idx, 1);
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 0 }];
    }

    if (/^SELECT status, COUNT\(\*\) AS cnt FROM exam_sessions GROUP BY status/i.test(cleanSql)) {
      const counts = {};
      this.exam_sessions.forEach(es => {
        counts[es.status] = (counts[es.status] || 0) + 1;
      });
      const rows = Object.entries(counts).map(([status, cnt]) => ({ status, cnt }));
      return [rows];
    }

    // --- SUBJECTS ---
    if (/^INSERT INTO subjects/i.test(cleanSql)) {
      const [semester_id, subject_code, subject_name, max_internal, max_external, total_max, credits, status] = params;
      const id = this.nextId.subjects++;
      const item = {
        id,
        semester_id: Number(semester_id),
        subject_code,
        subject_name,
        max_internal_marks: Number(max_internal),
        max_external_marks: Number(max_external),
        total_maximum_marks: Number(total_max),
        credits: Number(credits),
        status: status || 'Active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      this.subjects.push(item);
      return [{ insertId: id, affectedRows: 1 }];
    }

    if (/^SELECT id FROM subjects WHERE semester_id = \? AND subject_code = \?/i.test(cleanSql)) {
      const [semId, code, excludeId] = params;
      let matched = this.subjects.filter(s => s.semester_id == semId && s.subject_code.toUpperCase() === String(code).toUpperCase());
      if (excludeId !== undefined) matched = matched.filter(s => s.id != excludeId);
      return [matched];
    }

    if (/FROM subjects s.*WHERE s\.id = \?/i.test(cleanSql)) {
      const [id] = params;
      const matched = this.subjects.filter(s => s.id == id).map(s => {
        const sem = this.semesters.find(x => x.id == s.semester_id);
        const b = sem ? this.batches.find(x => x.id == sem.batch_id) : null;
        return {
          ...s,
          semester_name: sem ? sem.semester_name : '',
          semester_number: sem ? sem.semester_number : 1,
          batch_name: b ? b.batch_name : ''
        };
      });
      return [matched];
    }

    if (/^SELECT COUNT\(\*\) AS cnt FROM results WHERE subject_code = \?/i.test(cleanSql)) {
      const [code] = params;
      const count = this.results.filter(r => r.subject_code.toUpperCase() === String(code).toUpperCase()).length;
      return [[{ cnt: count }]];
    }

    if (/^SELECT s\.id, s\.semester_id.*FROM subjects s/i.test(cleanSql)) {
      let rows = this.subjects.map(s => {
        const sem = this.semesters.find(x => x.id == s.semester_id);
        const b = sem ? this.batches.find(x => x.id == sem.batch_id) : null;
        return {
          ...s,
          semester_name: sem ? sem.semester_name : '',
          semester_number: sem ? sem.semester_number : 1,
          batch_name: b ? b.batch_name : ''
        };
      });
      if (cleanSql.includes('s.semester_id = ?')) {
        rows = rows.filter(s => s.semester_id == params[0]);
      }
      return [rows];
    }

    if (/^UPDATE subjects SET/i.test(cleanSql)) {
      const id = params[params.length - 1];
      const sub = this.subjects.find(x => x.id == id);
      if (sub) {
        if (cleanSql.includes('subject_name = ?')) sub.subject_name = params[0];
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 0 }];
    }

    if (/^DELETE FROM subjects WHERE id = \?/i.test(cleanSql)) {
      const [id] = params;
      const idx = this.subjects.findIndex(x => x.id == id);
      if (idx !== -1) {
        this.subjects.splice(idx, 1);
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 0 }];
    }

    if (/^SELECT COUNT\(\*\) AS total.*FROM subjects/i.test(cleanSql)) {
      const total = this.subjects.length;
      const active = this.subjects.filter(s => s.status === 'Active').length;
      const inactive = this.subjects.filter(s => s.status === 'Inactive').length;
      return [[{ total, active, inactive }]];
    }

    return [[]];
  }
}

// 2. Wire Mock DB into config/db BEFORE loading app
const dbConfig = require('../config/db');
const mockDb = new MockDatabase();
dbConfig.getPool = () => mockDb;
dbConfig.isDbDisabled = () => false;

// 3. Load Express App
const app = require('../app');

const { PassThrough } = require('node:stream');

// 4. In-process HTTP dispatcher for Express without network sockets
function dispatch(app, { method = 'GET', url = '/', headers = {}, body = null, authenticated = true }) {
  return new Promise((resolve, reject) => {
    const csrfToken = crypto.randomBytes(32).toString('base64');
    const socket = new PassThrough();
    socket.remoteAddress = '127.0.0.1';

    const req = new http.IncomingMessage(socket);
    req.method = method.toUpperCase();
    req.url = url;
    req.originalUrl = url;
    req.socket = socket;
    req.connection = socket;
    req.headers = {
      'host': 'localhost',
      'content-type': 'application/json',
      ...headers
    };
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) req.headers['x-csrf-token'] = csrfToken;

    if (authenticated) {
      req.session = {
        user: { username: 'admin@example.com', role: 'Admin' },
        _csrf: csrfToken,
        save: (cb) => { if (cb) cb(); },
        destroy: (cb) => { if (cb) cb(); },
        regenerate: (cb) => { if (cb) cb(); }
      };
    } else {
      req.session = {
        save: (cb) => { if (cb) cb(); },
        destroy: (cb) => { if (cb) cb(); },
        regenerate: (cb) => { if (cb) cb(); }
      };
    }

    if (body) {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      req.headers['content-length'] = Buffer.byteLength(bodyStr);
      req.body = typeof body === 'object' ? body : JSON.parse(body);
      req.push(bodyStr);
    }
    req.push(null);

    const res = new http.ServerResponse(req);
    res.socket = socket;
    let output = '';

    res.write = (chunk) => {
      if (chunk) output += chunk;
      return true;
    };

    res.end = (chunk) => {
      if (chunk) output += chunk;
      let json = null;
      try {
        json = JSON.parse(output);
      } catch (e) {
        json = output;
      }
      resolve({
        status: res.statusCode,
        headers: res.getHeaders ? res.getHeaders() : {},
        body: json
      });
    };

    app.handle(req, res);
  });
}

test.describe('Phases 3 to 7 Suite', { concurrency: 1 }, () => {
  test.beforeEach(() => {
    mockDb.reset();
  });

// ============================================================================
// PHASE 3: BATCH MANAGEMENT TESTS
// ============================================================================
test('Phase 3 - Batch Management: Unauthorized access returns 401', async () => {
  const res = await dispatch(app, { method: 'GET', url: '/api/batches', authenticated: false });
  assert.equal(res.status, 401, 'Unauthenticated request should return 401');
});

test('Phase 3 - Batch Management: Valid batch creation, listing, editing, status change', async () => {
  // Create Batch
  const createRes = await dispatch(app, {
    method: 'POST',
    url: '/api/batches',
    body: {
      batch_name: 'MCA 2024-2026',
      start_year: 2024,
      end_year: 2026,
      status: 'Active'
    }
  });
  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.success, true);
  assert.equal(createRes.body.data.batch_name, 'MCA 2024-2026');
  const batchId = createRes.body.data.id;

  // List Batches
  const listRes = await dispatch(app, { method: 'GET', url: '/api/batches' });
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.success, true);
  assert.equal(listRes.body.data.length, 1);

  // Edit Batch
  const editRes = await dispatch(app, {
    method: 'PUT',
    url: `/api/batches/${batchId}`,
    body: {
      batch_name: 'MCA 2024-2026 Updated',
      start_year: 2024,
      end_year: 2026,
      status: 'Active'
    }
  });
  assert.equal(editRes.status, 200);
  assert.equal(editRes.body.data.batch_name, 'MCA 2024-2026 Updated');

  // Toggle status
  const statusRes = await dispatch(app, {
    method: 'PATCH',
    url: `/api/batches/${batchId}/status`,
    body: { status: 'Inactive' }
  });
  assert.equal(statusRes.status, 200);
  assert.equal(statusRes.body.data.status, 'Inactive');
});

test('Phase 3 - Batch Management: Validation rejects invalid input & duplicates', async () => {
  // Invalid years
  const badRes = await dispatch(app, {
    method: 'POST',
    url: '/api/batches',
    body: {
      batch_name: 'Invalid Batch',
      start_year: 2026,
      end_year: 1800,
      status: 'Active'
    }
  });
  assert.equal(badRes.status, 400);

  // Create valid batch
  await dispatch(app, {
    method: 'POST',
    url: '/api/batches',
    body: { batch_name: 'Unique Batch', start_year: 2023, end_year: 2025, status: 'Active' }
  });

  // Duplicate batch name
  const dupRes = await dispatch(app, {
    method: 'POST',
    url: '/api/batches',
    body: { batch_name: 'Unique Batch', start_year: 2024, end_year: 2026, status: 'Active' }
  });
  assert.equal(dupRes.status, 409);
});

test('Phase 3 - Batch Management: Safe deletion blocks deletion if related records exist', async () => {
  const createBatch = await dispatch(app, {
    method: 'POST',
    url: '/api/batches',
    body: { batch_name: 'Batch With Students', start_year: 2024, end_year: 2026, status: 'Active' }
  });
  const batchId = createBatch.body.data.id;

  // Add a student in this batch
  mockDb.students.push({
    id: 1,
    usn: '1RV24MCA01',
    name: 'Test Student',
    email: 'test@student.com',
    batch_id: batchId
  });

  // Attempt to delete batch -> Must be rejected with 400
  const delRes = await dispatch(app, { method: 'DELETE', url: `/api/batches/${batchId}` });
  assert.equal(delRes.status, 400);
  assert.match(delRes.body.message, /Cannot delete batch/i);

  // Remove the student, then deletion should succeed
  mockDb.students = [];
  const delRes2 = await dispatch(app, { method: 'DELETE', url: `/api/batches/${batchId}` });
  assert.equal(delRes2.status, 200);
});

// ============================================================================
// PHASE 4: STUDENT MANAGEMENT TESTS
// ============================================================================
test('Phase 4 - Student Management: Valid student creation, listing, editing', async () => {
  mockDb.batches.push({ id: 1, batch_name: 'MCA 2024-2026', start_year: 2024, end_year: 2026, status: 'Active' });

  // Create Student
  const addRes = await dispatch(app, {
    method: 'POST',
    url: '/api/students',
    body: {
      usn: '1RV24MCA01',
      name: 'Ravi Kumar',
      email: 'ravi.kumar@example.com',
      batch_id: 1
    }
  });
  assert.equal(addRes.status, 201);
  assert.equal(addRes.body.success, true);
  assert.equal(addRes.body.data.usn, '1RV24MCA01');
  const studentId = addRes.body.data.id;

  // List students by batch
  const listRes = await dispatch(app, { method: 'GET', url: '/api/students/batch/1' });
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.data.length, 1);

  // Edit Student
  const editRes = await dispatch(app, {
    method: 'PUT',
    url: `/api/students/${studentId}`,
    body: {
      usn: '1RV24MCA01',
      name: 'Ravi Kumar Updated',
      email: 'ravi.updated@example.com',
      batch_id: 1
    }
  });
  assert.equal(editRes.status, 200);
  assert.equal(editRes.body.data.name, 'Ravi Kumar Updated');
});

test('Phase 4 - Student Management: Rejects invalid email, non-existent batch & duplicate USN', async () => {
  mockDb.batches.push({ id: 1, batch_name: 'MCA 2024-2026', start_year: 2024, end_year: 2026, status: 'Active' });

  // Invalid email
  const badEmailRes = await dispatch(app, {
    method: 'POST',
    url: '/api/students',
    body: { usn: '1RV24MCA02', name: 'Student 2', email: 'invalid-email', batch_id: 1 }
  });
  assert.equal(badEmailRes.status, 400);

  // Non-existent batch
  const badBatchRes = await dispatch(app, {
    method: 'POST',
    url: '/api/students',
    body: { usn: '1RV24MCA02', name: 'Student 2', email: 'student2@example.com', batch_id: 999 }
  });
  assert.equal(badBatchRes.status, 400);

  // Valid create
  await dispatch(app, {
    method: 'POST',
    url: '/api/students',
    body: { usn: '1RV24MCA02', name: 'Student 2', email: 'student2@example.com', batch_id: 1 }
  });

  // Duplicate USN
  const dupUsnRes = await dispatch(app, {
    method: 'POST',
    url: '/api/students',
    body: { usn: '1RV24MCA02', name: 'Student 2 Clone', email: 'student2clone@example.com', batch_id: 1 }
  });
  assert.equal(dupUsnRes.status, 409);
});

test('Phase 4 - Student Management: Safe deletion blocks deletion if results exist', async () => {
  mockDb.batches.push({ id: 1, batch_name: 'MCA 2024-2026' });
  mockDb.students.push({ id: 1, usn: '1RV24MCA01', name: 'John Doe', email: 'john@example.com', batch_id: 1 });
  mockDb.results.push({ id: 1, usn: '1RV24MCA01', subject_code: 'MCA101', marks_obtained: 85, exam_session_id: 1 });

  // Delete student with results -> Must be rejected with 400
  const delRes = await dispatch(app, { method: 'DELETE', url: '/api/students/1' });
  assert.equal(delRes.status, 400);
  assert.match(delRes.body.message, /recorded/i);

  // Clear results, delete succeeds
  mockDb.results = [];
  const delRes2 = await dispatch(app, { method: 'DELETE', url: '/api/students/1' });
  if (delRes2.status !== 200) console.log('DEL RES 2 ERROR:', delRes2.status, delRes2.body);
  assert.equal(delRes2.status, 200);
});

// ============================================================================
// PHASE 5: SEMESTER MANAGEMENT TESTS
// ============================================================================
test('Phase 5 - Semester Management: Create, list, edit, and duplicate check', async () => {
  mockDb.batches.push({ id: 1, batch_name: 'MCA 2024-2026' });

  // Create semester
  const createRes = await dispatch(app, {
    method: 'POST',
    url: '/api/semesters',
    body: {
      batch_id: 1,
      semester_number: 1,
      semester_name: 'First Semester',
      status: 'Active'
    }
  });
  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.data.semester_number, 1);
  const semId = createRes.body.data.id;

  // Duplicate semester number in same batch -> 409
  const dupRes = await dispatch(app, {
    method: 'POST',
    url: '/api/semesters',
    body: {
      batch_id: 1,
      semester_number: 1,
      semester_name: 'Duplicate First Sem',
      status: 'Active'
    }
  });
  assert.equal(dupRes.status, 409);

  // Edit semester
  const editRes = await dispatch(app, {
    method: 'PUT',
    url: `/api/semesters/${semId}`,
    body: {
      semester_name: 'First Semester (Fall)',
      status: 'Active'
    }
  });
  assert.equal(editRes.status, 200);
});

test('Phase 5 - Semester Management: Safe deletion blocks deletion if subjects or sessions exist', async () => {
  mockDb.batches.push({ id: 1, batch_name: 'MCA 2024-2026' });
  mockDb.semesters.push({ id: 1, batch_id: 1, semester_number: 1, semester_name: 'Sem 1', status: 'Active' });
  mockDb.subjects.push({ id: 1, semester_id: 1, subject_code: 'MCA101', subject_name: 'Data Structures' });

  // Try to delete semester -> Rejected with 400
  const delRes = await dispatch(app, { method: 'DELETE', url: '/api/semesters/1' });
  assert.equal(delRes.status, 400);
  assert.match(delRes.body.message, /related records/i);

  // Clear subjects, delete succeeds
  mockDb.subjects = [];
  const delRes2 = await dispatch(app, { method: 'DELETE', url: '/api/semesters/1' });
  if (delRes2.status !== 200) console.log('SEMESTER DEL RES 2 ERROR:', delRes2.status, delRes2.body);
  assert.equal(delRes2.status, 200);
});

// ============================================================================
// PHASE 6: EXAM SESSION MANAGEMENT TESTS
// ============================================================================
test('Phase 6 - Exam Session Management: Create, list, edit, stats route order', async () => {
  mockDb.batches.push({ id: 1, batch_name: 'MCA 2024-2026' });
  mockDb.semesters.push({ id: 1, batch_id: 1, semester_number: 1, semester_name: 'Sem 1' });

  // Test /api/exam-sessions/stats route does not get captured by /:id
  const statsRes = await dispatch(app, { method: 'GET', url: '/api/exam-sessions/stats' });
  assert.equal(statsRes.status, 200);
  assert.equal(statsRes.body.success, true);
  assert.ok(statsRes.body.data.total !== undefined);

  // Create Exam Session
  const createRes = await dispatch(app, {
    method: 'POST',
    url: '/api/exam-sessions',
    body: {
      semester_id: 1,
      session_name: 'Dec 2024 / Jan 2025',
      start_date: '2024-12-15',
      end_date: '2025-01-10',
      status: 'Active'
    }
  });
  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.data.session_name, 'Dec 2024 / Jan 2025');
  const sessionId = createRes.body.data.id;

  // Invalid dates (end < start)
  const badDateRes = await dispatch(app, {
    method: 'POST',
    url: '/api/exam-sessions',
    body: {
      semester_id: 1,
      session_name: 'Invalid Date Session',
      start_date: '2025-01-10',
      end_date: '2024-12-15',
      status: 'Active'
    }
  });
  assert.equal(badDateRes.status, 400);

  // Duplicate session name in same semester -> 409
  const dupRes = await dispatch(app, {
    method: 'POST',
    url: '/api/exam-sessions',
    body: {
      semester_id: 1,
      session_name: 'Dec 2024 / Jan 2025',
      status: 'Active'
    }
  });
  assert.equal(dupRes.status, 409);

  // Safe delete check: attach result
  mockDb.results.push({ id: 1, exam_session_id: sessionId, usn: '1RV24MCA01', subject_code: 'MCA101' });
  const delBlockedRes = await dispatch(app, { method: 'DELETE', url: `/api/exam-sessions/${sessionId}` });
  assert.equal(delBlockedRes.status, 400);

  // Clear result, delete succeeds
  mockDb.results = [];
  const delRes = await dispatch(app, { method: 'DELETE', url: `/api/exam-sessions/${sessionId}` });
  assert.equal(delRes.status, 200);
});

// ============================================================================
// PHASE 7: SUBJECT MANAGEMENT TESTS
// ============================================================================
test('Phase 7 - Subject Management: Create, list, edit, duplicate check, marks validation', async () => {
  mockDb.batches.push({ id: 1, batch_name: 'MCA 2024-2026' });
  mockDb.semesters.push({ id: 1, batch_id: 1, semester_number: 1, semester_name: 'Sem 1' });

  // Create Subject
  const createRes = await dispatch(app, {
    method: 'POST',
    url: '/api/subjects',
    body: {
      semester_id: 1,
      subject_code: 'MCA101',
      subject_name: 'Advanced Data Structures',
      credits: 4,
      max_internal_marks: 40,
      max_external_marks: 60,
      status: 'Active'
    }
  });
  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.data.subject_code, 'MCA101');
  assert.equal(createRes.body.data.total_maximum_marks, 100);
  const subjectId = createRes.body.data.id;

  // Duplicate subject code in same semester -> 409
  const dupRes = await dispatch(app, {
    method: 'POST',
    url: '/api/subjects',
    body: {
      semester_id: 1,
      subject_code: 'MCA101',
      subject_name: 'Another DS subject',
      credits: 4
    }
  });
  assert.equal(dupRes.status, 409);

  // Non-existent semester -> 400
  const badSemRes = await dispatch(app, {
    method: 'POST',
    url: '/api/subjects',
    body: {
      semester_id: 999,
      subject_code: 'MCA102',
      subject_name: 'Operating Systems',
      credits: 4
    }
  });
  assert.equal(badSemRes.status, 400);

  // Safe delete check: attach result
  mockDb.results.push({ id: 1, subject_code: 'MCA101', usn: '1RV24MCA01', exam_session_id: 1 });
  const delBlockedRes = await dispatch(app, { method: 'DELETE', url: `/api/subjects/${subjectId}` });
  assert.equal(delBlockedRes.status, 400);
  assert.match(delBlockedRes.body.message, /recorded/i);

  // Clear result, delete succeeds
  mockDb.results = [];
  const delRes = await dispatch(app, { method: 'DELETE', url: `/api/subjects/${subjectId}` });
  assert.equal(delRes.status, 200);
});
});
