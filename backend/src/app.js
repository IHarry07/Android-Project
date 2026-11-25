const express = require('express');
const helmet = require('helmet');
const env = require('./config/env');
const { pool } = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { asyncHandler } = require('./utils/errors');

const app = express();

app.disable('x-powered-by');
// HTTPS 프록시 뒤에서 돌 때 실제 사용자 IP(X-Forwarded-For)를 쓴다. (.env 의 TRUST_PROXY)
if (env.trustProxy) app.set('trust proxy', env.trustProxy);
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
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/inquiries', require('./routes/inquiries'));
app.use('/api/notices', require('./routes/notices'));
app.use('/api/devices', require('./routes/devices'));
app.use('/api/products', require('./routes/products'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
