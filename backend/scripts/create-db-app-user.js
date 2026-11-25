// 서버 전용 DB 계정 만들기 (roomade DB 읽기·쓰기만 가능, 표 삭제·다른 DB 접근 불가)
//   사용법: node scripts/create-db-app-user.js <새 계정 비밀번호>
// .env 의 DB_USER(관리자 계정, 예: root)로 접속해서 만든다. 만든 뒤 .env 의 DB_USER/DB_PASSWORD 를 바꾸면 된다.
// 테이블 만들기·마이그레이션은 계속 관리자 계정으로 한다.
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');

(async () => {
  const password = process.argv[2];
  if (!password || password.length < 16) throw new Error('사용법: node scripts/create-db-app-user.js <16자 이상 비밀번호>');
  const db = process.env.DB_NAME || 'roomade';
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  });
  for (const host of ['localhost', '127.0.0.1']) {
    await c.query('CREATE USER IF NOT EXISTS ?@? IDENTIFIED BY ?', ['roomade_app', host, password]);
    await c.query('ALTER USER ?@? IDENTIFIED BY ?', ['roomade_app', host, password]);
    await c.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON \`${db}\`.* TO ?@?`, ['roomade_app', host]);
  }
  await c.query('FLUSH PRIVILEGES');
  await c.end();
  console.log(`roomade_app 계정을 만들었어요. (${db} DB 읽기·쓰기만 가능) .env 의 DB_USER=roomade_app, DB_PASSWORD=<방금 비밀번호> 로 바꾸면 됩니다.`);
})().catch((e) => { console.error(e.message); process.exitCode = 1; });