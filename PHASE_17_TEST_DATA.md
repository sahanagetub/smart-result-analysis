# Phase 17 — Test Data and Verification Guide

All records created by the demo and random-data tools are synthetic. They must
not be described, uploaded, or analyzed as actual academic results. The PDF
fixture under `tests/fixtures/syntheticResultPdf.js` and the five synthetic
calculation students exist only for automated tests.

## Random data management

Normal application startup initializes tables but does not seed demo data.
The existing demo seeder is preserved and is available only through the
explicit `npm run seed:demo` command. It requires `NODE_ENV=development` or
`test` and a database name containing `dev`, `test`, or `sandbox`.

The interactive test-data generator remains disabled unless its explicit
development/test database safeguards are configured. Do not use it with
academic production data.

## Result cleanup review and approval

Run a read-only preview:

```powershell
npm run cleanup:dev-results
```

The preview displays each result ID, USN, subject, marks, grade/status, batch,
semester, exam session, and its classification. Synthetic rows are marked only
when they match generator markers or exactly match the deterministic demo
manifest in `services/seedService.js`. Legacy/unmarked rows are review-only and
cannot be deleted by the utility.

To apply a reviewed set, use a local development database with a marked name,
set the opt-in, and provide only reviewed candidate result IDs:

```powershell
$env:NODE_ENV='development'
$env:DB_HOST='localhost'
$env:DB_NAME='smart_result_dev'
$env:ALLOW_DEVELOPMENT_RESULT_CLEANUP='DELETE_SYNTHETIC_RESULTS'
npm run cleanup:dev-results -- --apply --approve-ids=1,2,3
```

For a local development database whose name is unmarked, explicitly bind the
override to that exact database name after verifying the target:

```powershell
$env:ALLOW_UNMARKED_LOCAL_DEVELOPMENT_DATABASE=$env:DB_NAME
```

The apply operation re-reads and locks result candidates, rejects ambiguous
IDs, deletes only rows in `results`, commits transactionally, and compares
student/batch/semester/subject/exam-session counts before and after. It never
deletes reference rows. Keep backups and review the candidate preview before
any apply operation. Never point the command at production.

## PDF upload and extraction verification

Staff can use `/results/extract` to select batch, semester, and exam session,
upload a text-based PDF, inspect student/subject rows, edit extracted values,
validate, then explicitly confirm and save. PDF extraction supports up to
15 MB and 100 pages; scanned PDFs are unsupported because OCR is not configured.
No sample academic PDF is included in this repository. Actual-data verification
requires a real PDF from the project owner and must be reported separately from
the synthetic PDF fixture tests.

## Analytics verification

Use the Dashboard and Analytics pages with a selected batch, semester, exam
session, or subject. Check result-level pass/fail counts and percentages,
student roster counts, subject/semester summaries, grade distribution, student
ranking, and topper ties. `tests/phase17SyntheticAnalyticsVerification.test.js`
uses a controlled synthetic fixture with known expected metrics. It is not a
substitute for verifying analytics against actual uploaded results.

## Reports and exports

The supported reports are Consolidated/Summary, Class, Topper, Failed,
Subject-wise, and Student. Each supports existing session/batch/semester
filters where applicable; Failed supports search, Topper supports a rank limit,
and Subject-wise supports a subject filter. CSV and XLSX export tests validate
headers, summaries, workbook bytes, and sheet contents. A revaluation-specific
report is not present: the current schema has no revaluation fields or history.

## Manual calculation verification

Run the deterministic five-student comparison with:

```powershell
node --test tests/phase17SyntheticCalculationVerification.test.js
```

The test independently records subject marks, total, percentage, pass/fail,
failed-subject count, ranking, SGPA, and CGPA expectations, then compares them
with the existing calculation and report services. Its synthetic identifiers
must never be presented as actual student verification.

## Automated test commands

```powershell
node --test tests/phase17Preparation.test.js tests/phase17SyntheticPdfVerification.test.js tests/phase17SyntheticAnalyticsVerification.test.js tests/phase17SyntheticCalculationVerification.test.js
node --test tests
```

Transaction and rollback tests use simulated MySQL connections. The cleanup
preview reads the configured local database; the apply flow requires reviewed
IDs and explicit opt-in. No production database test is allowed.
