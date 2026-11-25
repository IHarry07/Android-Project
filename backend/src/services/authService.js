const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../config/env');
const mail = require('./mailService');
const securityMail = require('./securityMail');
const { pool } = require('../config/db');
const { AppError } = require('../utils/errors');
const { encryptAccount, sha256Hex } = require('../utils/crypto');
const {
  signToken, expiresAtOf, passwordVersion, newSessionId,
  signResetToken, verifyResetToken, RESET_TTL_SECONDS, verifyEmailToken,
} = require('./tokenService');
const { mapUserDuplicate } = require('./userService');
const attempts = require('./attemptLimiter');

// 가입할 때 동의받은 이용약관 버전. 약관을 바꾸면 올린다.
const TERMS_VERSION = '1.1'; // 1.1: 만 14세 미만 가입 불가, 이메일 등록·인증 조항 추가

// 존재하지 않는 아이디로 로그인해도 같은 시간이 걸리도록 비교용으로 쓰는 해시
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer-password-1', 10);

// 로그아웃한 세션 기록은 토큰이 가장 오래 사는 기간(로그인 유지 30일)만큼 둔다.
const REVOKE_KEEP_DAYS = 31;

/**
 * 회원가입. 이메일은 필수이고, 미리 인증번호로 확인한 이메일 확인 토큰(emailToken)이 있어야 한다.
 * 만 14세 미만 여부와 형식은 입력 검증(schemas.signup)에서 막는다.
 */
async function signup(data) {
  if (verifyEmailToken(data.emailToken) !== data.email) {
    throw new AppError(400, 'EMAIL_NOT_VERIFIED', '이메일 인증을 먼저 해 주세요. (인증은 30분 동안 유효해요)');
  }
  const passwordHash = await bcrypt.hash(data.password, 10);
  try {
    const [result] = await pool.query(
      `INSERT INTO users
         (login_id, password_hash, name, nickname, phone, email, account_encrypted, birth_date, gender,
          terms_version, terms_agreed_at, privacy_agreed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        data.loginId,
        passwordHash,
        data.name,
        data.nickname,
        data.phone,
        data.email,
        encryptAccount(data.accountInfo),
        data.birthDate,
        data.gender,
        TERMS_VERSION,
      ],
    );
    return { userId: result.insertId, loginId: data.loginId, nickname: data.nickname };
  } catch (err) {
    throw mapUserDuplicate(err);
  }
}

/**
 * 로그인.
 *  - 같은 아이디로 비밀번호를 5번 틀리면 15분 동안 잠근다. 잠길 때 등록된 이메일로 알린다.
 *  - 없는 아이디도 똑같이 세고 똑같이 잠가서, 잠겼는지로 아이디가 있는지 알 수 없다.
 *  - 잠금 기록은 DB에 있어서 서버를 다시 켜도 풀리지 않는다.
 */
async function login({ loginId, password, keepLogin }) {
  const lockKey = `login:${loginId}`;
  if (await attempts.isLocked(lockKey)) {
    throw new AppError(429, 'ACCOUNT_LOCKED', '비밀번호를 여러 번 틀려서 15분 동안 로그인할 수 없어요. 잠시 후 다시 시도해 주세요.');
  }

  const [rows] = await pool.query(
    'SELECT user_id, login_id, nickname, email, password_hash FROM users WHERE login_id = ? AND withdrawn_at IS NULL',
    [loginId],
  );
  const user = rows[0];
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) {
    const count = await attempts.recordFailure(lockKey);
    if (count === attempts.MAX_FAILURES && user) securityMail.loginLocked(user.email);
    // 아이디가 없는지 비밀번호가 틀렸는지 알려주지 않는다.
    throw new AppError(401, 'INVALID_CREDENTIALS', '아이디 또는 비밀번호가 올바르지 않습니다.');
  }

  await attempts.clear(lockKey);
  const token = signToken({
    userId: user.user_id, keep: keepLogin, passwordHash: user.password_hash, sid: newSessionId(),
  });
  return {
    token,
    keepLogin,
    expiresAt: expiresAtOf(token),
    user: { userId: user.user_id, loginId: user.login_id, nickname: user.nickname },
  };
}

/** 로그아웃: 이 로그인(세션)의 토큰을 만료 전이라도 쓸 수 없게 한다. */
async function logout(sid) {
  await pool.query(
    `INSERT INTO revoked_sessions (sid, expires_at) VALUES (?, DATE_ADD(NOW(), INTERVAL ? DAY))
     ON DUPLICATE KEY UPDATE expires_at = VALUES(expires_at)`,
    [sid, REVOKE_KEEP_DAYS],
  );
}

/**
 * 비밀번호 찾기 마지막 단계: 확인 토큰으로 새 비밀번호를 정한다.
 *  - 토큰이 위조되었거나 10분이 지났으면 거절한다. (처음부터 다시)
 *  - 한 번 쓰면 비밀번호가 바뀌어서 같은 토큰으로는 다시 바꿀 수 없다.
 *  - 비밀번호가 바뀌면 이전에 발급된 로그인 토큰은 모두 무효가 되고, 등록된 이메일로 알린다.
 */
async function resetPassword({ resetToken, newPassword }) {
  const invalid = () => new AppError(400, 'RESET_TOKEN_INVALID', '확인 시간이 지났어요. 이메일 인증부터 다시 해 주세요.');

  const payload = verifyResetToken(resetToken);
  if (!payload) throw invalid();

  const [rows] = await pool.query('SELECT user_id, login_id, email, password_hash FROM users WHERE user_id = ?', [payload.userId]);
  const user = rows[0];
  if (!user || passwordVersion(user.password_hash) !== payload.pv) throw invalid();

  // 지금 비밀번호와 같으면 바꾸지 않는다. (확인 토큰은 그대로 유효해서 다른 비밀번호로 다시 시도할 수 있다.)
  if (await bcrypt.compare(newPassword, user.password_hash)) {
    throw new AppError(400, 'SAME_PASSWORD', '이전과 같은 비밀번호예요. 다른 비밀번호를 입력해 주세요.');
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  // 같은 토큰을 동시에 두 번 써도 한쪽만 성공한다. (비밀번호가 이미 바뀌었으면 조건이 맞지 않는다.)
  const [result] = await pool.query(
    'UPDATE users SET password_hash = ? WHERE user_id = ? AND password_hash = ?',
    [passwordHash, user.user_id, user.password_hash],
  );
  if (result.affectedRows === 0) throw invalid();

  await attempts.clear(`login:${user.login_id}`);
  securityMail.passwordChanged(user.email);
  return { message: '비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요. 다른 기기의 로그인은 모두 해제됩니다.' };
}

const CODE_TTL_MINUTES = 10;
const CODE_COOLDOWN_SECONDS = 60;
const CODE_MAX_ATTEMPTS = 5;

const hashCode = (userId, code) => sha256Hex(`${userId}:${code}:${config.jwtSecret}`);

/**
 * 비밀번호 찾기 1단계: 아이디와 이메일이 가입 정보와 같으면 이메일로 6자리 인증번호를 보낸다.
 *  - 아이디나 이메일이 맞는지는 응답으로 알려주지 않는다. (맞든 틀리든 같은 안내를 준다.)
 *  - 인증번호는 10분 동안 유효하고, 같은 회원에게는 60초에 한 번만 보낸다.
 *  - 같은 아이디로 15분에 5번까지만 요청할 수 있다.
 *  - 메일 설정(SMTP)이 없으면 503 EMAIL_NOT_AVAILABLE.
 */
async function sendResetCode({ loginId, email }) {
  if (!mail.isConfigured()) {
    throw new AppError(503, 'EMAIL_NOT_AVAILABLE', '이메일 인증을 할 수 없어요. 서버의 메일 설정을 확인해 주세요.');
  }
  const limitKey = `send:${loginId}`;
  if (await attempts.isLocked(limitKey)) {
    throw new AppError(429, 'TOO_MANY_ATTEMPTS', '인증번호를 너무 많이 요청했어요. 15분 뒤에 다시 시도해 주세요.');
  }
  await attempts.recordFailure(limitKey);

  const generic = {
    message: '입력한 정보가 가입 정보와 같다면 이메일로 인증번호를 보냈어요. 메일이 오지 않으면 스팸함도 확인해 주세요.',
    expiresInSeconds: CODE_TTL_MINUTES * 60,
  };

  const [rows] = await pool.query(
    'SELECT user_id, email FROM users WHERE login_id = ? AND withdrawn_at IS NULL',
    [loginId],
  );
  const user = rows[0];
  if (!user || !user.email || user.email !== email) return generic;

  const [codes] = await pool.query(
    'SELECT sent_at > DATE_SUB(NOW(), INTERVAL ? SECOND) AS recent FROM password_reset_codes WHERE user_id = ?',
    [CODE_COOLDOWN_SECONDS, user.user_id],
  );
  if (codes[0] && codes[0].recent) return generic;

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await pool.query(
    `INSERT INTO password_reset_codes (user_id, code_hash, attempts, expires_at, sent_at)
     VALUES (?, ?, 0, DATE_ADD(NOW(), INTERVAL ? MINUTE), NOW())
     ON DUPLICATE KEY UPDATE code_hash = VALUES(code_hash), attempts = 0,
       expires_at = VALUES(expires_at), sent_at = VALUES(sent_at)`,
    [user.user_id, hashCode(user.user_id, code), CODE_TTL_MINUTES],
  );
  try {
    await mail.send({
      to: user.email,
      subject: '[룸메이드] 비밀번호 찾기 인증번호',
      text: `룸메이드 비밀번호 찾기 인증번호는 ${code} 입니다.\n${CODE_TTL_MINUTES}분 안에 앱에 입력해 주세요.\n\n본인이 요청하지 않았다면 이 메일은 무시해 주세요.`,
    });
  } catch (err) {
    // 메일을 보내지 못해도 응답은 같게 준다. (서버 로그에만 남긴다.)
    console.error('인증 메일 발송 실패:', err.message);
  }
  return generic;
}

/**
 * 비밀번호 찾기 2단계: 인증번호를 확인하고, 맞으면 확인 토큰을 준다.
 * 틀리면 횟수를 세고, 5번 틀리면 그 인증번호는 쓸 수 없다. 맞춘 인증번호는 한 번만 쓸 수 있다.
 */
async function verifyResetCode({ loginId, code }) {
  const limitKey = `verify:${loginId}`;
  if (await attempts.isLocked(limitKey)) {
    throw new AppError(429, 'TOO_MANY_ATTEMPTS', '인증번호를 여러 번 틀렸어요. 15분 뒤에 다시 시도해 주세요.');
  }
  const invalid = () => new AppError(400, 'INVALID_CODE', '인증번호가 올바르지 않거나 시간이 지났어요.');

  const [rows] = await pool.query(
    `SELECT u.user_id, u.password_hash, c.code_hash, c.attempts, c.expires_at > NOW() AS alive
       FROM users u JOIN password_reset_codes c ON c.user_id = u.user_id
      WHERE u.login_id = ? AND u.withdrawn_at IS NULL`,
    [loginId],
  );
  const row = rows[0];
  if (!row || !row.alive || row.attempts >= CODE_MAX_ATTEMPTS) {
    await attempts.recordFailure(limitKey);
    throw invalid();
  }

  const given = Buffer.from(hashCode(row.user_id, code));
  const stored = Buffer.from(row.code_hash);
  if (given.length !== stored.length || !crypto.timingSafeEqual(given, stored)) {
    await pool.query('UPDATE password_reset_codes SET attempts = attempts + 1 WHERE user_id = ?', [row.user_id]);
    await attempts.recordFailure(limitKey);
    throw invalid();
  }

  await pool.query('DELETE FROM password_reset_codes WHERE user_id = ?', [row.user_id]);
  await attempts.clear(limitKey);
  return {
    resetToken: signResetToken({ userId: row.user_id, passwordHash: row.password_hash }),
    expiresInSeconds: RESET_TTL_SECONDS,
  };
}

module.exports = {
  signup, login, logout, resetPassword, sendResetCode, verifyResetCode, TERMS_VERSION,
};