'use strict';

// Override at the PDF extractor boundary when a department has a documented
// layout variation. Regex values are server configuration, never user input.
const DEFAULT_RESULT_PDF_RULES = Object.freeze({
  usnPattern: '\\b[1-4][A-Z]{2}\\d{2}[A-Z]{2,4}\\d{2,4}\\b',
  subjectCodePattern: '\\b(?=[A-Z0-9]{4,16}\\b)(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\\d)[A-Z0-9]+\\b',
  markPattern: '(?:\\b(?:AB|NE|NA)\\b|--|-|\\b\\d+(?:\\.\\d+)?\\b)',
  statusPattern: '\\b(PASS|FAIL|P|F)\\s*$'
});

module.exports = { DEFAULT_RESULT_PDF_RULES };
