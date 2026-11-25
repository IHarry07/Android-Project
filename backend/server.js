const env = require('./src/config/env');
const { pool } = require('./src/config/db');
const app = require('./src/app');
const { startScheduler, stopScheduler } = require('./src/services/notificationJobs');

async function main() {
  // 시작할 때 DB에 연결되는지 먼저 확인한다.
  await pool.query('SELECT 1');
  const server = app.listen(env.port, () => {
    console.log(`룸메이드 서버 시작: http://localhost:${env.port} (DB: ${env.db.database})`);
  });
  // 쉬고 있는 연결을 Node 기본값(5초)보다 오래 열어 둔다. 앱(OkHttp)은 30초 안에 쓰지 않은 연결을 먼저 버린다.
  // 기본값이면 앱이 이미 닫힌 연결로 요청을 보내 첫 요청이 가끔 실패한다. (예: 이메일 입력 후 인증번호 받기)
  server.keepAliveTimeout = 65 * 1000;
  server.headersTimeout = 66 * 1000;
  if (env.schedulerEnabled) startScheduler();

  const shutdown = () => {
    stopScheduler();
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
