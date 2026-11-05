const express = require('express');
const helmet = require('helmet');
const { pool } = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { asyncHandler } = require('./utils/errors');

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '100kb' }));

// 서버와 DB가 살아 있는지 확인한다. (인증 불필요)
app.get('/api/health', asyncHandler(async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok' });
}));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/rooms', require('./routes/rooms'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
