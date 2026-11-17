'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const studentService = require('../services/studentService');
const { importStudents } = require('../controllers/studentController');

function workbookBuffer(rows) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Sheet1');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

async function invokeImport(fileName, buffer) {
  const result = { status: 200, body: null };
  const response = {
    status(code) { result.status = code; return this; },
    json(body) { result.body = body; return this; }
  };
  await importStudents({ file: { originalname: fileName, buffer }, body: { batch_id: '25' } }, response, (error) => { throw error; });
  return result;
}

test('student workbook import maps Student Name and ignores unrelated columns', async (t) => {
  const originalUsns = studentService.getExistingUsnsService;
  const originalEmails = studentService.getExistingEmailsService;
  studentService.getExistingUsnsService = async () => [];
  studentService.getExistingEmailsService = async () => [];
  t.after(() => {
    studentService.getExistingUsnsService = originalUsns;
    studentService.getExistingEmailsService = originalEmails;
  });

  const result = await invokeImport('Batch2025.xlsx', workbookBuffer([
    { Sr: 1, USN: '1MV25MC001', 'Student Name': 'ABHISHEK S N', Email: 'abhishek@example.com', Category: 'MGMT' }
  ]));

  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.data.valid, 1);
  assert.deepEqual(
    { usn: result.body.data.validRows[0].usn, name: result.body.data.validRows[0].name, email: result.body.data.validRows[0].email, batch_id: result.body.data.validRows[0].batch_id },
    { usn: '1MV25MC001', name: 'ABHISHEK S N', email: 'abhishek@example.com', batch_id: 25 }
  );
});

test('student import rejects workbooks missing a required column', async () => {
  const result = await invokeImport('students.xlsx', workbookBuffer([
    { USN: '1MV25MC001', 'Student Name': 'ABHISHEK S N' }
  ]));

  assert.equal(result.status, 400);
  assert.match(result.body.message, /USN, Student Name, and Email/);
});
