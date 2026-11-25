/**
 * 같은 대상(예: 아이디)에 대한 실패 횟수를 세어 일정 시간 막는다.
 *  - 기록은 DB(login_attempts)에 있어서 서버를 다시 켜도, 서버가 여러 대여도 그대로 유지된다.
 *  - 첫 실패부터 15분 안에 5번 실패하면 그 15분이 끝날 때까지 막는다. 시각은 DB 시계 기준이다.
 *  - 존재하지 않는 대상도 똑같이 세기 때문에, 막혔는지로 그 아이디가 있는지 알아낼 수 없다.
 *  - 대상은 SHA-256으로 바꿔 저장한다. (잘못 입력한 아이디가 그대로 남지 않게)
 */
const crypto = require('crypto');
const { pool } = require('../config/db');

const WINDOW_MINUTES = 15;
const WINDOW_MS = WINDOW_MINUTES * 60 * 1000;
const MAX_FAILURES = 5;

const keyOf = (key) => crypto.createHash('sha256').update(String(key)).digest('hex');

async function isLocked(key) {
  const [rows] = await pool.query(
    `SELECT fail_count FROM login_attempts
      WHERE attempt_key = ? AND first_failed_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
    [keyOf(key), WINDOW_MINUTES],
  );
  return Boolean(rows[0]) && rows[0].fail_count >= MAX_FAILURES;
}

/** 실패를 하나 기록하고, 지금 15분 안의 실패 횟수를 돌려준다. */
async function recordFailure(key) {
  const k = keyOf(key);
  // 15분이 지난 기록이면 1부터 다시 센다. (fail_count를 먼저 계산할 때 first_failed_at은 아직 이전 값이다)
  await pool.query(
    `INSERT INTO login_attempts (attempt_key, fail_count, first_failed_at) VALUES (?, 1, NOW())
     ON DUPLICATE KEY UPDATE
       fail_count = IF(first_failed_at < DATE_SUB(NOW(), INTERVAL ? MINUTE), 1, fail_count + 1),
       first_failed_at = IF(first_failed_at < DATE_SUB(NOW(), INTERVAL ? MINUTE), NOW(), first_failed_at)`,
    [k, WINDOW_MINUTES, WINDOW_MINUTES],
  );
  const [rows] = await pool.query('SELECT fail_count FROM login_attempts WHERE attempt_key = ?', [k]);
  return rows[0] ? rows[0].fail_count : 1;
}

async function clear(key) {
  await pool.query('DELETE FROM login_attempts WHERE attempt_key = ?', [keyOf(key)]);
}

/** 하루 지난 기록을 지운다. (정리 작업용) */
async function purgeOld(db = pool) {
  await db.query('DELETE FROM login_attempts WHERE first_failed_at < DATE_SUB(NOW(), INTERVAL 1 DAY)');
}

module.exports = { isLocked, recordFailure, clear, purgeOld, WINDOW_MS, MAX_FAILURES };
