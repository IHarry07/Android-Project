const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../config/env');
const mail = require('./mailService');
const { pool } = require('../config/db');
const { AppError } = require('../utils/errors');
const { encryptAccount, sha256Hex } = require('../utils/crypto');
const {
  signToken, expiresAtOf, passwordVersion, signResetToken, verifyResetToken, RESET_TTL_SECONDS,
} = require('./tokenService');
const { mapUserDuplicate } = require('./userService');
const attempts = require('./attemptLimiter');

// 존재하지 않는 아이디로 로그인해도 같은 시간이 걸리도록 비교용으로 쓰는 해시
// 가입할 때 동의받은 이용약관 버전. 약관을 바꾸면 올린다.
const TERMS_VERSION = '1.0';

const DUMMY_HASH = bcrypt.hashSync('timing-equalizer-password-1', 10);

async function signup(data) {
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
        data.email ?? null,
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

async function login({ loginId, password, keepLogin }) {
  const [rows] = await pool.query(
    'SELECT user_id, login_id, nickname, password_hash FROM users WHERE login_id = ? AND withdrawn_at IS NULL',
    [loginId],
  );
  const user = rows[0];
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) {
    // 아이디가 없는지 비밀번호가 틀렸는지 알려주지 않는다.
    throw new AppError(401, 'INVALID_CREDENTIALS', '아이디 또는 비밀번호가 올바르지 않습니다.');
  }

  const token = signToken({ userId: user.user_id, keep: keepLogin, passwordHash: user.password_hash });
  return {
    token,
    keepLogin,
    expiresAt: expiresAtOf(token),
    user: { userId: user.user_id, loginId: user.login_id, nickname: user.nickname },
  };
}

/**
 * 비밀번호 찾기 1단계: 가입 정보 확인. 로그인하지 않은 상태에서 쓴다.
 * 메일·문자 발송이 없어서 가입 정보(아이디, 이름, 전화번호, 생년월일)가 모두 같을 때만 통과한다.
 * 통과하면 10분 동안 쓸 수 있는 확인 토큰을 주고, 그 토큰으로 2단계(resetPassword)에서 새 비밀번호를 정한다.
 *  - 어느 항목이 틀렸는지, 그 아이디가 있는지는 알려주지 않는다. (모두 같은 오류)
 *  - 같은 아이디로 5번 틀리면 15분 동안 막는다. (그 뒤에는 맞는 정보로도 거절)
 */
async function verifyIdentity({ loginId, name, phone, birthDate }) {
  if (attempts.isLocked(loginId)) {
    throw new AppError(429, 'TOO_MANY_ATTEMPTS', '정보 확인에 여러 번 실패했어요. 15분 뒤에 다시 시도해 주세요.');
  }

  const [rows] = await pool.query(
    'SELECT user_id, password_hash, name, phone, birth_date FROM users WHERE login_id = ? AND withdrawn_at IS NULL',
    [loginId],
  );
  const user = rows[0];
  const matches = Boolean(user)
    && user.name === name
    && user.phone === phone
    && String(user.birth_date).slice(0, 10) === birthDate;

  if (!matches) {
    attempts.recordFailure(loginId);
    throw new AppError(400, 'IDENTITY_MISMATCH', '입력한 정보가 가입 정보와 일치하지 않습니다.');
  }

  attempts.clear(loginId);
  return {
    resetToken: signResetToken({ userId: user.user_id, passwordHash: user.password_hash }),
    expiresInSeconds: RESET_TTL_SECONDS,
  };
}

/**
 * 비밀번호 찾기 2단계: 확인 토큰으로 새 비밀번호를 정한다.
 *  - 토큰이 위조되었거나 10분이 지났으면 거절한다. (1단계부터 다시)
 *  - 한 번 쓰면 비밀번호가 바뀌어서 같은 토큰으로는 다시 바꿀 수 없다.
 *  - 비밀번호가 바뀌면 이전에 발급된 로그인 토큰은 모두 무효가 된다.
 */
async function resetPassword({ resetToken, newPassword }) {
  const invalid = () => new AppError(400, 'RESET_TOKEN_INVALID', '확인 시간이 지났어요. 가입 정보를 다시 확인해 주세요.');

  const payload = verifyResetToken(resetToken);
  if (!payload) throw invalid();

  const [rows] = await pool.query('SELECT user_id, password_hash FROM users WHERE user_id = ?', [payload.userId]);
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

  return { message: '비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요. 다른 기기의 로그인은 모두 해제됩니다.' };
}

const CODE_TTL_MINUTES = 10;
const CODE_COOLDOWN_SECONDS = 60;
const CODE_MAX_ATTEMPTS = 5;

const hashCode = (userId, code) => sha256Hex(`${userId}:${code}:${config.jwtSecret}`);

/**
 * 비밀번호 찾기(이메일) 1단계: 아이디와 이메일이 가입 정보와 같으면 이메일로 6자리 인증번호를 보낸다.
 *  - 아이디나 이메일이 맞는지는 응답으로 알려주지 않는다. (맞든 틀리든 같은 안내를 준다.)
 *  - 인증번호는 10분 동안 유효하고, 같은 회원에게는 60초에 한 번만 보낸다.
 *  - 같은 아이디로 15분에 5번까지만 요청할 수 있다.
 *  - 메일 설정(SMTP)이 없으면 503 EMAIL_NOT_AVAILABLE 로 준비 중임을 알린다.
 */
async function sendResetCode({ loginId, email }) {
  if (!mail.isConfigured()) {
    throw new AppError(503, 'EMAIL_NOT_AVAILABLE', '이메일 인증은 아직 준비 중이에요. 가입 정보로 찾기를 이용해 주세요.');
  }
  const limitKey = `send:${loginId}`;
  if (attempts.isLocked(limitKey)) {
    throw new AppError(429, 'TOO_MANY_ATTEMPTS', '인증번호를 너무 많이 요청했어요. 15분 뒤에 다시 시도해 주세요.');
  }
  attempts.recordFailure(limitKey);

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
 * 비밀번호 찾기(이메일) 2단계: 인증번호를 확인하고, 맞으면 가입 정보 확인과 같은 확인 토큰을 준다.
 * 틀리면 횟수를 세고, 5번 틀리면 그 인증번호는 쓸 수 없다. 맞춘 인증번호는 한 번만 쓸 수 있다.
 */
async function verifyResetCode({ loginId, code }) {
  const limitKey = `verify:${loginId}`;
  if (attempts.isLocked(limitKey)) {
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
    attempts.recordFailure(limitKey);
    throw invalid();
  }

  const given = Buffer.from(hashCode(row.user_id, code));
  const stored = Buffer.from(row.code_hash);
  if (given.length !== stored.length || !crypto.timingSafeEqual(given, stored)) {
    await pool.query('UPDATE password_reset_codes SET attempts = attempts + 1 WHERE user_id = ?', [row.user_id]);
    attempts.recordFailure(limitKey);
    throw invalid();
  }

  await pool.query('DELETE FROM password_reset_codes WHERE user_id = ?', [row.user_id]);
  attempts.clear(limitKey);
  return {
    resetToken: signResetToken({ userId: row.user_id, passwordHash: row.password_hash }),
    expiresInSeconds: RESET_TTL_SECONDS,
  };
}

module.exports = { signup, login, verifyIdentity, resetPassword, sendResetCode, verifyResetCode };
