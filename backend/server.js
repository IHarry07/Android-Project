const env = require('./src/config/env');
const { pool } = require('./src/config/db');
const app = require('./src/app');

async function main() {
  // 시작할 때 DB에 연결되는지 먼저 확인한다.
  await pool.query('SELECT 1');
  const server = app.listen(env.port, () => {
    console.log(`룸메이드 서버 시작: http://localhost:${env.port} (DB: ${env.db.database})`);
  });

  const shutdown = () => {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('서버를 시작하지 못했습니다:', err.message);
  process.exit(1);
});
