const crypto = require('crypto');
const config = require('../config/env');
const { pool } = require('../config/db');
const { AppError } = require('../utils/errors');
const { sha256Hex } = require('../utils/crypto');
const { signEmailToken, EMAIL_TOKEN_TTL_SECONDS } = require('./tokenService');
const mail = require('./mailService');

/**
 * 이메일 인증 (가입할 때, 이메일을 바꿀 때)
 *  1. sendCode: 그 이메일로 6자리 인증번호를 보낸다. (10분 유효, 같은 이메일에는 60초에 한 번)
 *  2. verifyCode: 인증번호가 맞으면 30분짜리 이메일 확인 토큰(emailToken)을 준다.
 *     가입·이메일 변경 요청에 이 토큰을 같이 보내야 한다.
 *  - 이미 다른 회원이 쓰는 이메일이면 인증번호를 보내지 않는다. (409 EMAIL_TAKEN)
 *  - 5번 틀리면 그 인증번호는 무효다.
 */

const CODE_TTL_MINUTES = 10;
const COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

const hashCode = (email, code) => sha256Hex(`${email}:${code}:${config.jwtSecret}:email`);

async function assertEmailFree(email, exceptUserId = null) {
  const [rows] = await pool.query(
    'SELECT user_id FROM users WHERE email = ? AND withdrawn_at IS NULL',
    [email],
  );
  if (rows[0] && rows[0].user_id !== exceptUserId) {
    throw new AppError(409, 'EMAIL_TAKEN', '이미 가입된 이메일입니다.');
  }
}

async function sendCode(email, exceptUserId = null) {
  if (!mail.isConfigured()) {
    throw new AppError(503, 'EMAIL_NOT_AVAILABLE', '이메일 인증을 할 수 없어요. 서버의 메일 설정을 확인해 주세요.');
  }
  await assertEmailFree(email, exceptUserId);

  const [prev] = await pool.query(
    'SELECT TIMESTAMPDIFF(SECOND, sent_at, NOW()) AS ago FROM email_verifications WHERE email = ?',
    [email],
  );
  if (prev[0] && prev[0].ago < COOLDOWN_SECONDS) {
    const wait = COOLDOWN_SECONDS - prev[0].ago;
    throw new AppError(429, 'EMAIL_COOLDOWN', `인증번호는 ${wait}초 뒤에 다시 받을 수 있어요.`, { retryAfterSeconds: wait });
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await pool.query(
    `INSERT INTO email_verifications (email, code_hash, attempts, expires_at, sent_at)
     VALUES (?, ?, 0, DATE_ADD(NOW(), INTERVAL ? MINUTE), NOW())
     ON DUPLICATE KEY UPDATE code_hash = VALUES(code_hash), attempts = 0,
       expires_at = VALUES(expires_at), sent_at = VALUES(sent_at)`,
    [email, hashCode(email, code), CODE_TTL_MINUTES],
  );
  try {
    await mail.send({
      to: email,
      subject: '[룸메이드] 이메일 인증번호',
      text: `룸메이드 이메일 인증번호는 ${code} 입니다.\n${CODE_TTL_MINUTES}분 안에 앱에 입력해 주세요.\n\n본인이 요청하지 않았다면 이 메일은 무시해 주세요.`,
    });
  } catch (err) {
    console.error('이메일 인증 메일 발송 실패:', err.message);
    await pool.query('DELETE FROM email_verifications WHERE email = ?', [email]);
    throw new AppError(502, 'EMAIL_SEND_FAILED', '인증 메일을 보내지 못했어요. 이메일 주소를 확인하고 잠시 후 다시 시도해 주세요.');
  }
  return { message: `${email} 로 인증번호를 보냈어요.`, expiresInSeconds: CODE_TTL_MINUTES * 60 };
}

async function verifyCode(email, code) {
  const invalid = () => new AppError(400, 'INVALID_CODE', '인증번호가 올바르지 않거나 시간이 지났어요.');
  const [rows] = await pool.query(
    'SELECT code_hash, attempts, expires_at > NOW() AS alive FROM email_verifications WHERE email = ?',
    [email],
  );
  const row = rows[0];
  if (!row || !row.alive || row.attempts >= MAX_ATTEMPTS) throw invalid();

  const given = Buffer.from(hashCode(email, code));
  const stored = Buffer.from(row.code_hash);
  if (given.length !== stored.length || !crypto.timingSafeEqual(given, stored)) {
    await pool.query('UPDATE email_verifications SET attempts = attempts + 1 WHERE email = ?', [email]);
    throw invalid();
  }
  await pool.query('DELETE FROM email_verifications WHERE email = ?', [email]);
  return { emailToken: signEmailToken(email), expiresInSeconds: EMAIL_TOKEN_TTL_SECONDS };
}

module.exports = { sendCode, verifyCode, assertEmailFree };