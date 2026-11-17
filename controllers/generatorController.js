'use strict';

const generatorService = require('../services/generatorService');

async function getOptions(req, res) {
  try {
    const data = await generatorService.getOptions();
    return res.json({ success: true, data, generationEnabled: generatorService.isGenerationEnabled() });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Unable to load generator options.' });
  }
}

async function generate(req, res) {
  try {
    const data = await generatorService.generateTestData(req.body || {});
    return res.status(201).json({
      success: true,
      message: `Generated ${data.students.length} students and ${data.resultCount} results.`,
      data: {
        batch: data.batch,
        semester: data.semester,
        examSession: data.examSession,
        generatedExamSession: data.generatedExamSession,
        students: data.students,
        generatedSubjects: data.generatedSubjects,
        subjectCount: data.subjectCount,
        resultCount: data.resultCount
      }
    });
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500;
    return res.status(status).json({ success: false, message: status === 500 ? 'Test data generation failed. No records were committed.' : error.message });
  }
}

module.exports = { getOptions, generate };
