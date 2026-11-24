# Phase 18 — Main Flow Testing

Run the complete suite with:

```sh
npm test
```

The test suite is automated and uses mocked database connections or clearly
labeled synthetic fixtures. It does not claim to upload real academic records.
Phase 17 documents the remaining actual-PDF and actual-data verification needs.

## Flow coverage

| Main flow | Automated coverage |
| --- | --- |
| Valid student | `tests/resultValidationPhase15.test.js`; `tests/resultUploadPhase13.test.js` |
| Unknown student | `tests/resultValidationPhase15.test.js`; `tests/resultExtractionConfirmationPhase16.test.js` |
| Student belongs to another batch | `tests/resultValidationPhase15.test.js` |
| Duplicate student / USN | `tests/phases_3_to_7.test.js`; `tests/studentImport.test.js` |
| Duplicate result | `tests/resultService.test.js`; `tests/resultUploadPhase13.test.js`; `tests/resultExtractionConfirmationPhase16.test.js` |
| Wrong semester or session mapping | `tests/resultValidationPhase15.test.js`; `tests/resultUploadPhase13.test.js`; `tests/phase17SyntheticPdfVerification.test.js` |
| Unknown subject | `tests/resultValidationPhase15.test.js`; `tests/resultPreviewPhase16.test.js`; `tests/phase17SyntheticPdfVerification.test.js` |
| Marks exceed configured maximum | `tests/resultValidationPhase15.test.js`; `tests/resultPreviewPhase16.test.js` |
| Missing required subject | `tests/resultValidationPhase15.test.js`; `tests/resultPreviewPhase16.test.js`; `tests/phase17SyntheticPdfVerification.test.js` |
| Invalid PDF | `tests/resultExtractionPhase14.test.js`; `tests/resultUploadPhase13.test.js` |
| Successful import and confirmation | `tests/resultUploadPhase13.test.js`; `tests/resultExtractionConfirmationPhase16.test.js`; `tests/phase17SyntheticPdfVerification.test.js` |
| Pass and fail outcomes | `tests/resultService.test.js`; `tests/phase17SyntheticCalculationVerification.test.js` |
| Topper ranking and ties | `tests/dashboardService.test.js`; `tests/reportsPhase12.test.js`; `tests/phase17SyntheticAnalyticsVerification.test.js` |
| Consolidated report | `tests/reportsPhase12.test.js`; `tests/phase17SyntheticCalculationVerification.test.js` |

## Test data boundary

Synthetic PDF data and the five-student calculation fixture are invented test
values. They verify extraction, validation, analytics, reports, ranks, totals,
and GPA calculations without being represented as actual academic results.
Confirmation and transaction tests use test doubles; use a separately
approved non-production database for any live persistence test.

## Product scope

The intended workflow is Clerk → original result → analysis → reports. Existing
tests retain authentication, authorization, CSRF, duplicate protection, and
transaction rollback coverage. Revaluation, backlog, multiple-attempt
resolution, and advanced academic management are not included in this scope.
