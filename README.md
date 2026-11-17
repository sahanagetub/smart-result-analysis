# Smart Student Result Analysis and Academic Performance Prediction System

## Overview
A comprehensive Node.js Express application for academic administration and performance prediction.

## Phase Status

### Phase 1 (Project Foundation) - 100% complete
- Project structure setup
- EJS view engine configured
- All 7 DB tables initialized: batches, users, students, semesters, exam_sessions, subjects, results
- multer and xlsx installed for CSV/XLSX import

### Phase 2 — Clerk Login + Main Layout - 100% complete
- Clerk login / logout / session auth
- Shared navbar and sidebar in shared EJS partials
- Dashboard shell with stats and charts
- "Upload Result 🔒" visible but disabled (as required at this stage)

### Phase 3 — Batch Management - 100% complete
- Full CRUD for batches (create, read, edit, delete)
- Student count per batch displayed
- View detail page with student count and student list

### Phase 4 — Student Management - 100% complete
- Full CRUD for students (add, read, update, delete)
- CSV/XLSX import with full workflow: Upload → Read Students → Preview → Validate → Confirm → Save
- Validation: missing USN, missing name, invalid email, duplicate USN, duplicate email, duplicate rows, existing student

### Phase 5 (Semester Management) - 100% complete
- Semester creation within batches
- Listing by batch association
- CRUD operations
- Database table initialization on startup

### Phase 6 (Exam Session Management) - 100% complete
- Exam session creation within semesters
- Semester association and semester number tracking
- Session start/end dates and status management
- Session statistics and status tracking

### Additional Modules
- **Subjects**: Full backend + UI (subject_code, subject_name, semester_id, credits, status fields)
- **Results**: Full CRUD with database storage
- **Analytics**: Real statistics from database (replace hardcoded demo values)
- **Reports**: 6 report types navigation (Comprehensive, Class, Topper, Failed, Subject-wise, Student)

## Database Configuration
- MySQL: Configured, optional in Phase 1
- DB_ENABLED: `false` in .env (demo mode), `true` for full database
- 7 DB tables initialized: batches, users, students, semesters, exam_sessions, subjects, results

## Running the Application
```bash
npm install
copy .env.example .env   # or create .env manually
npm start                # or npm run dev

Open http://localhost:3000 (redirects to login/dashboard).

### Initial administrator and production sessions

There are no default administrator credentials. For first-time bootstrap, create a unique administrator username and password in a controlled environment. Set `ADMIN_USERNAME`, `ADMIN_DISPLAY_NAME`, and `ADMIN_PASSWORD_HASH` in the environment; generate the hash locally with `node -e "require('bcrypt').hash(process.argv[1], 12).then(console.log)" "your-new-password"`. Keep the plaintext password out of source control and logs. Remove the bootstrap credentials after creating a database-backed administrator.

Production requires a unique random `SESSION_SECRET` of at least 32 characters. The built-in Express MemoryStore is for development only. Configure a persistent, production-appropriate session store before deploying multiple workers or restarting production instances; this repository does not currently configure one, so it is not deployment-ready.

### Subject marks schema compatibility

Some existing databases predate the subject maximum-mark columns. A safe, additive migration is available at `database/migrations/20261117_add_subject_mark_columns.js`. Review the script and confirm the target schema before applying it. In PowerShell, first set `$env:NODE_ENV='development'; $env:DB_DISABLED='false'; $env:DB_NAME='<verified-safe-database>'; $env:EXPECTED_SCHEMA_DATABASE_NAME='<verified-safe-database>'`. Preview the current schema without writes using `node database/migrations/20261117_add_subject_mark_columns.js` (no `--apply`). After verifying that the connected database is the intended non-production database, set `$env:ALLOW_SUBJECT_SCHEMA_MIGRATION='true'` and run `node database/migrations/20261117_add_subject_mark_columns.js --apply`. The script refuses production, requires exact environment/connected database-name confirmation, and adds only missing columns with application defaults. It has not been run against this workspace database.

## Features Complete
✅ Login/logout/session authentication
✅ Shared navbar and sidebar
✅ Dashboard with stats and charts
✅ Batch CRUD + student count + view detail
✅ Student CRUD + CSV/XLSX import with preview/validate/confirm
✅ Semester management
✅ Exam session management
✅ Subject management
✅ Results/import functionality
✅ Analytics and reports
✅ "Upload Result 🔒" visible but disabled

## Tech Stack
- Node.js, Express.js
- HTML5, CSS3, Vanilla JavaScript, EJS templating
- Chart.js

## Project Structure
```
project/
├── config/           ✅ config.js, db.js
├── controllers/      ✅ 12 controller files
├── models/           ✅ 7 model files
├── routes/           ✅ 15 route files
├── services/         ✅ 7 service files
├── middleware/       ✅ authMiddleware, errorHandler
├── views/            ✅ 25+ EJS templates (layouts, partials, auth, dashboard, batches, students, semesters, sessions, subjects, results, reports, analytics)
├── public/           ✅ css, js, images, HTML pages
├── uploads/          ✅ (empty, for file uploads)
├── app.js            ✅ Fixed app.js with EJS, session, DB init, routes
└── server.js         ✅ Entry point
```

EOF
