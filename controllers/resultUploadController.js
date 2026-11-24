'use strict';

const resultUploadService = require('../services/resultUploadService');

exports.preview = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Choose a PDF, XLS or XLSX VTU result file.' });
    const batchId = Number(req.body?.batchId);
    const semesterId = Number(req.body?.semesterId);
    if (!Number.isSafeInteger(batchId) || batchId < 1 || !Number.isSafeInteger(semesterId) || semesterId < 1) {
      return res.status(400).json({ success: false, message: 'Select a valid batch and semester before validating this file.' });
    }
    const data = await resultUploadService.previewUploadedFile(req.file, {
      ownerId: req.sessionID || null,
      selection: { batchId, semesterId }
    });
    return res.json({ success: true, data, message: 'Preview generated. No result records were saved.' });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Unable to extract or validate this result file.' });
  }
};

exports.sessions = async (req, res) => {
  try {
    const data = await resultUploadService.getSessions(req.query.uploadToken, { ownerId: req.sessionID || null });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Unable to load existing exam sessions.' });
  }
};

exports.validateSession = async (req, res) => {
  try {
    const data = await resultUploadService.validatePreviewSession(req.body || {}, { ownerId: req.sessionID || null });
    return res.json({ success: true, data, message: 'Session-specific duplicate validation completed.' });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Unable to validate original results for this exam session.' });
  }
};

exports.revalidateSelection = async (req, res) => {
  try {
    const data = await resultUploadService.revalidatePreviewSelection(req.body || {}, { ownerId: req.sessionID || null });
    return res.json({ success: true, data, message: 'Validation refreshed for the selected batch and semester.' });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Unable to refresh validation for this selection.' });
  }
};

exports.confirm = async (req, res) => {
  try {
    const data = await resultUploadService.confirmUpload(req.body || {}, { ownerId: req.sessionID || null });
    return res.status(201).json({ success: true, data, message: `${data.savedCount} results saved successfully. Existing results were preserved.` });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'The result upload could not be saved. No records were changed.' });
  }
};

exports.cancel = (req, res) => {
  let cancelled;
  try { cancelled = resultUploadService.cancelPreview(req.body?.uploadToken, req.sessionID || null); }
  catch (error) { return res.status(error.status || 500).json({ success: false, message: error.message }); }
  return res.json({ success: true, data: { cancelled }, message: 'Preview cancelled. No results were saved.' });
};

exports.handleUploadError = (error, res) => {
  if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ success: false, message: 'File exceeds the 15 MB upload limit.' });
  if (error.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ success: false, message: 'Upload exactly one file in the resultFile field.' });
  return res.status(400).json({ success: false, message: 'The upload could not be read. Check the selected file and try again.' });
};
