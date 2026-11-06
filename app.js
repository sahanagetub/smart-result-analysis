require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const morgan = require('morgan');
const session = require('express-session');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { requireAuth } = require('./middleware/authMiddleware');
const routes = require('./routes');
const { testConnection } = require('./config/db');
const { initBatchesTable } = require('./services/batchService');
const { initUsersTable } = require('./services/userService');
const { initStudentsTable } = require('./services/studentService');
const { initSemestersTable } = require('./services/semesterService');
const { initExamSessionsTable } = require('./services/examSessionService');
const { initSubjectsTable } = require('./services/subjectService');
const { initResultsTable } = require('./services/resultService');

const app = express();

// View engine (EJS)
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Security headers
app.use(helmet());

// HTTP request logging
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined'));
} else {
  app.use(morgan('dev'));
}

// Body parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session management
app.use(session({
  name: 'sra.sid',
  secret: process.env.SESSION_SECRET || 'change_me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 2 // 2 hours
  }
}));

// Expose current user to all views
app.use((req, res, next) => {
  res.locals.user = (req.session && req.session.user) || null;
  res.locals.isAuthenticated = !!res.locals.user;
  next();
});

// Static assets (CSS, JS, images)
app.use(express.static(path.join(__dirname, 'public')));

// Serve Chart.js from npm package (only the dist folder)
app.use('/vendor/chart.js', express.static(path.join(__dirname, 'node_modules', 'chart.js', 'dist')));

// Page routes (server-rendered EJS) — must come before API routes
const pageRoutes = require('./routes/pageRoutes');
app.use('/', pageRoutes);

// Routes (API + root redirect)
app.use('/', routes);

// 404 + error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Initialize database tables (non-blocking, auto-run on startup)
async function initializeDatabase() {
  try {
    await initBatchesTable().catch((err) => console.error('Batches table init error:', err));
    await initUsersTable().catch((err) => console.error('Users table init error:', err));
    await initStudentsTable().catch((err) => console.error('Students table init error:', err));
    await initSemestersTable().catch((err) => console.error('Semesters table init error:', err));
    await initExamSessionsTable().catch((err) => console.error('Exam sessions table init error:', err));
    await initSubjectsTable().catch((err) => console.error('Subjects table init error:', err));
    await initResultsTable().catch((err) => console.error('Results table init error:', err));
    console.log('Database tables initialization complete.');
  } catch (err) {
    console.error('Database initialization error:', err.message);
  }
}

initializeDatabase();

module.exports = app;
