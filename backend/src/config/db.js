const mysql = require('mysql2/promise');
const env = require('./env');

const pool = mysql.createPool({
  ...env.db,
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  // DATETIME/DATE를 JS Date가 아닌 문자열로 받아 시간대 변환 오류를 막는다.
  dateStrings: true,
});

/**
 * 트랜잭션 안에서 fn(conn)을 실행한다.
 * fn이 오류를 던지면 롤백하고, 끝나면 커밋한다.
 */
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch (rollbackErr) {
      console.error('롤백 실패:', rollbackErr.message);
    }
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, withTransaction };
