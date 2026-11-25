// 마이그레이션(.sql) 적용 (관리자용). 표를 만들고 바꾸는 일이라 서버 계정(roomade_app)이 아니라 관리자 계정으로 한다.
//   사용: node scripts/migrate.js ../database/migrations/<파일>.sql [DB이름 ...]
//   DB이름을 안 쓰면 .env 의 DB_NAME(보통 roomade)에만 적용한다. 테스트 DB도 함께: ... roomade roomade_test
// 관리자 계정은 backend/.env.admin 의 DB_ADMIN_USER / DB_ADMIN_PASSWORD 를 쓴다. (없으면 .env 의 DB_USER / DB_PASSWORD)
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
const { adminDb } = require('./adminDb');

(async () => {
  const [file, ...names] = process.argv.slice(2);
  if (!file) throw new Error('사용법: node scripts/migrate.js <sql 파일> [DB이름 ...]');
  const sql = fs.readFileSync(path.resolve(file), 'utf8');
  const admin = adminDb();
  const dbs = names.length > 0 ? names : [admin.database];
  for (const database of dbs) {
    const c = await mysql.createConnection({ ...admin, database, multipleStatements: true });
    try {
      await c.query(sql);
      console.log(`${database}: ${path.basename(file)} 적용 완료`);
    } finally {
      await c.end();
    }
  }
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
