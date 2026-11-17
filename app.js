require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const path = require('path');
const ejs = require('ejs');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { protectStaticPage, requireAuth } = require('./middleware/authMiddleware');
const routes = require('./routes');
const { testConnection } = require('./config/db');
const { initBatchesTable } = require('./services/batchService');
const { initUsersTable } = require('./services/userService');
const { initStudentsTable } = require('./services/studentService');
const { initSemestersTable } = require('./services/semesterService');
const { initExamSessionsTable } = require('./services/examSessionService');
const { initSubjectsTable } = require('./services/subjectService');
const { initResultsTable } = require('./services/resultService');
const { seedDemoData } = require('./services/seedService');

const sessionSecret = String(process.env.SESSION_SECRET || '').trim();
function hasStrongSessionSecret(value) {
  const lower = value.toLowerCase();
  const classes = [/[a-z]/.test(value), /[A-Z]/.test(value), /\d/.test(value), /[^A-Za-z0-9]/.test(value)].filter(Boolean).length;
  const repeatsShortPattern = Array.from({ length: Math.min(8, value.length - 1) }, (_, index) => index + 1)
    .some((size) => value.length % size === 0 && value === value.slice(0, size).repeat(value.length / size));
  const uniqueCharacters = new Set(value).size;
  return Buffer.byteLength(value, 'utf8') >= 32 && uniqueCharacters >= 12 && classes >= 2 &&
    !repeatsShortPattern && !/(change|secret|password|placeholder|example|default|your[_ -]?session)/i.test(lower);
}
if (process.env.NODE_ENV === 'production' && !hasStrongSessionSecret(sessionSecret)) {
  throw new Error('Production startup requires a unique SESSION_SECRET of at least 32 characters.');
}

const app = express();

// View engine (EJS)
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
const viewsRoot = path.resolve(__dirname, 'views');
app.engine('ejs', (filePath, options, callback) => {
  let layoutName = null;
  ejs.renderFile(filePath, {
    ...options,
    layout(name) { layoutName = name; return ''; }
  }, (renderError, body) => {
    if (renderError || !layoutName) return callback(renderError, body);
    const layoutFile = path.resolve(path.dirname(filePath), `${layoutName}.ejs`);
    const relativeLayout = path.relative(viewsRoot, layoutFile);
    if (relativeLayout.startsWith('..') || path.isAbsolute(relativeLayout)) {
      return callback(new Error('EJS layout must resolve inside the views directory.'));
    }
    ejs.renderFile(layoutFile, { ...options, body }, callback);
  });
});

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

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { success: false, message: 'Too many requests, please try again later.' }
});
app.use('/api', limiter);

// Session management
app.use(session({
  name: 'sra.sid',
  secret: sessionSecret || 'local-development-only-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 2 // 2 hours
  }
}));

// Initialize CSRF token after session is set up
app.use((req, res, next) => {
  if (!req.session._csrf) {
    req.session._csrf = crypto.randomBytes(32).toString('base64');
  }
  next();
});

// Keep the legacy navigation URL on the current server-rendered dashboard so
// its DOM stays aligned with the interactive dashboard client.
app.get('/dashboard.html', requireAuth, (_req, res) => res.redirect('/dashboard'));

// Expose current user to all views
app.use((req, res, next) => {
  res.locals.user = (req.session && req.session.user) || null;
  res.locals.isAuthenticated = !!res.locals.user;
  next();
});

// Static assets (CSS, JS, images)
app.use(protectStaticPage);
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
    await seedDemoData().catch((err) => console.error('Seed demo data error:', err.message));
  } catch (err) {
    console.error('Database initialization error:', err.message);
  }
}

initializeDatabase();

module.exports = app;
