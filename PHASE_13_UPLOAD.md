# Phase 13: Original VTU Result Upload

The upload is available to signed-in Admin and Staff users at `/results/upload`.
It accepts text-based PDF, XLS, and XLSX files, shows valid and invalid rows in
separate tables, checks each row against the selected student's batch,
semester, subject code and subject name, and requires an existing exam session
for each semester before confirmation. Invalid rows block the whole upload.
Marks are never corrected by the importer. A confirmed upload writes the
combined marks to the existing `results` table in one MySQL transaction and
uses the Phase 9 result calculation rules. Existing rows are not overwritten.

## Database migration

The results table previously had no unique key for a student, subject, and exam
session. `database/migrations/20261121_add_result_upload_unique_key.js` adds
that key after checking for existing duplicates. It is repeatable and read-only
unless explicitly enabled. To apply it to a verified non-production database,
set `ALLOW_RESULT_UPLOAD_SCHEMA_MIGRATION=true` and
`EXPECTED_SCHEMA_DATABASE_NAME` to the exact `DB_NAME`, then run:

```sh
node database/migrations/20261121_add_result_upload_unique_key.js --apply
```

The migration was applied to the workspace's `smart_result_analysis` database
after its precheck found no duplicate result keys. Do not resolve any future
duplicate groups by deleting results automatically; inspect and reconcile them
manually before applying the migration elsewhere.

## Operational limits

- Uploads are buffered in memory, limited to 15 MB, one file at a time, and at
  most three concurrent previews per application process.
- Excel previews are limited to 10 sheets, 20,000 processed rows, and 10,000
  result rows, with a 64 MB expanded ZIP limit. PDFs are limited to 100 pages
  and 10,000 result rows.
- Scanned PDFs are unsupported; no OCR is enabled. Actual VTU PDF layout
  compatibility still requires verification against a real VTU source file.
- Preview tokens and duplicate-upload throttling are process-local and expire.
  A server restart discards pending previews; the database unique key and
  transactional existing-result check still protect saved results.

## Dependency audit

The Phase 13 Part 1 audit identified a high-severity advisory affecting the
npm-registry `xlsx` build and moderate advisories in `nodemon`/`minimatch`. The
spreadsheet parser now resolves to SheetJS's official 0.20.3 CDN release; the
development dependency uses nodemon 3.1.14 with minimatch 11.0.9. `npm audit`
reported zero vulnerabilities after these changes. The project should continue
to monitor SheetJS releases because the patched package is distributed through
the official SheetJS CDN rather than npm's registry.
