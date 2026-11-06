const subjectService = require('../services/subjectService');

async function createSubject(req, res, next) {
  try {
    const id = await subjectService.createSubjectService(req.body);
    const subject = await subjectService.getSubjectService(id);
    res.status(201).json({ success: true, data: subject, message: 'Subject created successfully.' });
  } catch (err) {
    next(err);
  }
}

async function getAllSubjects(req, res, next) {
  try {
    const search = req.query.search || '';
    const subjects = await subjectService.listSubjectsService(search);
    res.json({ success: true, data: subjects });
  } catch (err) {
    next(err);
  }
}

async function getSubjectById(req, res, next) {
  try {
    const subject = await subjectService.getSubjectService(req.params.id);
    res.json({ success: true, data: subject });
  } catch (err) {
    next(err);
  }
}

async function updateSubject(req, res, next) {
  try {
    const subject = await subjectService.updateSubjectService(req.params.id, req.body);
    res.json({ success: true, data: subject, message: 'Subject updated successfully.' });
  } catch (err) {
    next(err);
  }
}

async function deleteSubject(req, res, next) {
  try {
    await subjectService.deleteSubjectService(req.params.id);
    res.json({ success: true, message: 'Subject deleted.' });
  } catch (err) {
    next(err);
  }
}

async function getSubjectsBySemester(req, res, next) {
  try {
    const subjects = await subjectService.getSubjectsBySemesterService(req.params.semesterId);
    res.json({ success: true, data: subjects });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createSubject,
  getAllSubjects,
  getSubjectById,
  updateSubject,
  deleteSubject,
  getSubjectsBySemester
};