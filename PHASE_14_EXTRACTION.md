# Phase 14: Result Extraction

Staff can open `/results/extract`, select a batch, semester, and matching exam
session, then upload one text-based PDF (up to 15 MB). The preview extracts
USNs, student names, semester information, and subject-wise marks across up to
100 PDF pages. It supports multiple students and wrapped subject names. Staff
can edit preview values, run validation, and explicitly confirm valid records;
confirmation uses the existing Phase 13 atomic result transaction service.

## APIs

- `GET /api/result-extractions/batches`
- `GET /api/result-extractions/batches/:batchId/semesters`
- `GET /api/result-extractions/semesters/:semesterId/exam-sessions`
- `POST /api/result-extractions/preview`
- `POST /api/result-extractions/validate`
- `POST /api/result-extractions/confirm`

All endpoints require staff authentication; state-changing requests require
CSRF validation. Confirmation revalidates records and references on the server
and does not trust client totals or pass/fail values. Extraction and validation
do not save results; save occurs only after an explicit staff confirmation.

## Boundary

This service extracts selectable text only. OCR for scanned PDFs remains
unsupported. Actual VTU document layout compatibility still requires an
owner-provided real PDF; automated synthetic PDF fixtures are test data only.

Scanned or encrypted PDFs are reported as unsupported. Extraction errors remain
visible in the preview instead of being guessed or silently discarded.
