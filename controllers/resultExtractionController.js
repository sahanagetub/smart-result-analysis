'use strict';

const extractionService = require('../services/resultPdfExtractionService');
const validationService = require('../services/resultValidationService');
const confirmationService = require('../services/resultExtractionConfirmationService');

exports.batches = async (_req, res) => {
  try { return res.json({ success: true, data: await extractionService.listBatches() }); }
  catch (_) { return res.status(500).json({ success: false, message: 'Unable to load batches from the database.' }); }
};

exports.semesters = async (req, res) => {
  try { return res.json({ success: true, data: await extractionService.listSemesters(req.params.batchId) }); }
  catch (error) { return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Unable to load semesters for this batch.' }); }
};

exports.examSessions = async (req, res) => {
  try { return res.json({ success: true, data: await extractionService.listExamSessions(req.params.semesterId) }); }
  catch (error) { return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Unable to load exam sessions for this semester.' }); }
};

exports.preview = async (req, res) => {
  try {
    const file = req.files?.resultPdf?.[0];
    if (!file) return res.status(400).json({ success: false, message: 'Choose a PDF file in the resultPdf field.' });
    const data = await extractionService.extractPdf(file, req.body || {});
    return res.json({ success: true, data, message: 'Extraction preview is ready. No records have been saved.' });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message : 'The PDF could not be extracted. Check that it is a readable text-based PDF.'
    });
  }
};

exports.validate = async (req, res) => {
  try {
    const data = await validationService.validateExtraction(req.body?.selection, req.body?.students);
    return res.json({ success: true, data, message: `${data.validCount} valid and ${data.invalidCount} invalid extracted student record(s). No records have been saved.` });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Unable to validate extracted results.' });
  }
};

exports.confirm = async (req, res) => {
  try {
    const data = await confirmationService.confirmExtractedResults(req.body || {});
    return res.status(201).json({
      success: true,
      data,
      message: `${data.savedCount} subject result record(s) saved successfully.`
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message : 'The results could not be saved. No records were changed.'
    });
  }
};

exports.handleUploadError = (error, res) => {
  if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ success: false, message: 'PDF exceeds the 15 MB upload limit.' });
  if (error.code === 'LIMIT_UNEXPECTED_FILE' || error.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ success: false, message: 'Upload exactly one PDF in the resultPdf field.' });
  if (error.code === 'LIMIT_FIELD_COUNT') return res.status(400).json({ success: false, message: 'Provide batch, semester and exam session selections.' });
  return res.status(400).json({ success: false, message: 'The PDF upload could not be read.' });
};
