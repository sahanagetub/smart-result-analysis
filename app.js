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

const app = express();

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

// Protect HTML module pages before static serving
const protectedPages = [
  '/dashboard.html', '/batches.html', '/students.html', '/sessions.html',
  '/semesters.html', '/subjects.html', '/results.html', '/analytics.html', '/reports.html'
];
app.use((req, res, next) => {
  if (protectedPages.includes(req.path)) {
    return requireAuth(req, res, next);
  }
  next();
});

// Static assets
app.use(express.static(path.join(__dirname, 'public')));

// Serve Chart.js from npm package (only the dist folder)
app.use('/vendor/chart.js', express.static(path.join(__dirname, 'node_modules', 'chart.js', 'dist')));

// Routes (API + root redirect)
app.use('/', routes);

// 404 + error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Test DB connection (non-blocking)
testConnection().catch((err) => console.error('DB test error:', err));

module.exports = app;
