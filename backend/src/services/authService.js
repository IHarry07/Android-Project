const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { AppError } = require('../utils/errors');
const { encryptAccount } = require('../utils/crypto');
const { signToken, expiresAtOf } = require('./tokenService');
const { mapUserDuplicate } = require('./userService');

// 존재하지 않는 아이디로 로그인해도 같은 시간이 걸리도록 비교용으로 쓰는 해시
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer-password-1', 10);

async function signup(data) {
  const passwordHash = await bcrypt.hash(data.password, 10);
  try {
    const [result] = await pool.query(
      `INSERT INTO users
         (login_id, password_hash, name, nickname, phone, account_encrypted, birth_date, gender)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.loginId,
        passwordHash,
        data.name,
        data.nickname,
        data.phone,
        encryptAccount(data.accountInfo),
        data.birthDate,
        data.gender,
      ],
    );
    return { userId: result.insertId, loginId: data.loginId, nickname: data.nickname };
  } catch (err) {
    throw mapUserDuplicate(err);
  }
}

async function login({ loginId, password, keepLogin }) {
  const [rows] = await pool.query(
    'SELECT user_id, login_id, nickname, password_hash FROM users WHERE login_id = ?',
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

module.exports = { signup, login };
