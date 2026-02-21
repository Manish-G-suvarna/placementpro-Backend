const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const feedRoutes = require('./routes/feed');
const postRoutes = require('./routes/posts');
const userRoutes = require('./routes/users');
const uploadRoutes = require('./routes/upload');
const studentsRoutes = require('./routes/students');
const drivesRoutes = require('./routes/drives');
const schedulerRoutes = require('./routes/scheduler');
const notificationsRoutes = require('./routes/notifications');
const dashboardRoutes = require('./routes/dashboard');

const app = express();

// ── Middleware ──────────────────────────────────────────
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Routes ─────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/users', userRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/students', studentsRoutes);
app.use('/api/drives', drivesRoutes);
app.use('/api/scheduler', schedulerRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/dashboard', dashboardRoutes);

// ── Health check ───────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Global error handler ───────────────────────────────
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
});

// ── Start ──────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 PlacementPro API running on http://localhost:${PORT}`);
});
