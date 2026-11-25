// schema.sql 만으로 빈 DB가 제대로 만들어지는지 확인한다. (관리자용)
//   사용: node scripts/check-schema.js
// 임시 DB(roomade_schema_check)에 schema.sql 을 적용해 운영 DB(roomade)와 표·칸 목록을 비교하고, 임시 DB는 지운다.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { adminDb } = require('./adminDb');

const TEMP = 'roomade_schema_check';

async function columns(c, db) {
  const [rows] = await c.query(
    `SELECT TABLE_NAME AS t, COLUMN_NAME AS col, COLUMN_TYPE AS type
       FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION`, [db]);
  return new Map(rows.map((r) => [`${r.t}.${r.col}`, r.type]));
}

(async () => {
  const admin = adminDb();
  const c = await mysql.createConnection({ host: admin.host, port: admin.port, user: admin.user, password: admin.password, multipleStatements: true });
  try {
    const [[v]] = await c.query('SELECT VERSION() AS v');
    console.log(`MySQL ${v.v}`);
    await c.query(`DROP DATABASE IF EXISTS \`${TEMP}\``);
    await c.query(`CREATE DATABASE \`${TEMP}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await c.query(`USE \`${TEMP}\``);
    // schema.sql 안의 CREATE DATABASE / USE 는 건너뛰고 임시 DB에 적용한다.
    const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'database', 'schema.sql'), 'utf8')
      .replace(/^\s*CREATE DATABASE[^;]*;/gim, '').replace(/^\s*USE\s+[^;]*;/gim, '')
      // DELIMITER 는 mysql 명령줄 전용 문법이라 지운다. (서버는 BEGIN...END 를 그대로 이해한다)
      .replace(/^\s*DELIMITER\s+\S+\s*$/gim, '').replace(/END\$\$/g, 'END;');
    await c.query(sql);

    const fresh = await columns(c, TEMP);
    const live = await columns(c, admin.database);
    const onlyLive = [...live.keys()].filter((k) => !fresh.has(k));
    const onlyFresh = [...fresh.keys()].filter((k) => !live.has(k));
    const typeDiff = [...fresh.keys()].filter((k) => live.has(k) && live.get(k) !== fresh.get(k));
    const tables = new Set([...fresh.keys()].map((k) => k.split('.')[0]));
    console.log(`schema.sql 적용 성공: 표 ${tables.size}개, 칸 ${fresh.size}개`);
    console.log(onlyLive.length ? `운영 DB에만 있는 칸: ${onlyLive.join(', ')}` : '운영 DB에만 있는 칸: 없음');
    console.log(onlyFresh.length ? `schema.sql 에만 있는 칸: ${onlyFresh.join(', ')}` : 'schema.sql 에만 있는 칸: 없음');
    console.log(typeDiff.length ? `형식이 다른 칸: ${typeDiff.map((k) => `${k}(${live.get(k)} / ${fresh.get(k)})`).join(', ')}` : '형식이 다른 칸: 없음');
    const [trg] = await c.query('SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ?', [TEMP]);
    console.log(`트리거: ${trg.map((t) => t.TRIGGER_NAME).join(', ') || '없음'}`);
  } finally {
    await c.query(`DROP DATABASE IF EXISTS \`${TEMP}\``);
    await c.end();
  }
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
