// 서버가 쓰는 DB 계정(.env 의 DB_USER)으로 접속해서 권한을 확인한다. (비밀번호는 출력하지 않는다)
//   사용: node scripts/check-db-user.js
// 읽기·쓰기(SELECT/INSERT/UPDATE/DELETE)만 있고, 표 삭제(DROP) 같은 관리자 권한이 없으면 정상이다.
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  try {
    const [[me]] = await c.query('SELECT CURRENT_USER() AS who');
    const [grants] = await c.query('SHOW GRANTS');
    const [[users]] = await c.query('SELECT COUNT(*) AS n FROM users');
    console.log(`접속 계정: ${me.who}`);
    grants.forEach((g) => console.log(`  ${Object.values(g)[0]}`));
    console.log(`users 표 읽기: ${users.n}명`);
    let canDrop = true;
    try { await c.query('CREATE TABLE __perm_check (id INT)'); await c.query('DROP TABLE __perm_check'); } catch { canDrop = false; }
    console.log(canDrop ? '주의: 표를 만들고 지울 수 있는 관리자 계정이에요.' : '표 만들기·삭제: 불가 (정상)');
  } finally {
    await c.end();
  }
})().catch((e) => { console.error(`접속 실패: ${e.message}`); process.exitCode = 1; });
