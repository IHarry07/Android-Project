const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { AppError, duplicateKey } = require('../utils/errors');
const { encryptAccount, decryptAccount, maskAccount } = require('../utils/crypto');

/** users 테이블의 UNIQUE 위반을 알아보기 쉬운 오류로 바꾼다. */
function mapUserDuplicate(err) {
  const msg = duplicateKey(err);
  if (msg === null) return err;
  if (msg.includes('uq_users_login_id')) return new AppError(409, 'LOGIN_ID_TAKEN', '이미 사용 중인 아이디입니다.');
  if (msg.includes('uq_users_nickname')) return new AppError(409, 'NICKNAME_TAKEN', '이미 사용 중인 닉네임입니다.');
  if (msg.includes('uq_users_phone')) return new AppError(409, 'PHONE_TAKEN', '이미 가입된 전화번호입니다.');
  return err;
}

async function getMe(userId) {
  const [rows] = await pool.query(
    `SELECT u.user_id, u.login_id, u.name, u.nickname, u.phone, u.account_encrypted,
            u.birth_date, u.gender, u.created_at,
            r.room_id, r.room_name, r.owner_user_id
       FROM users u
       LEFT JOIN room_members m ON m.user_id = u.user_id
       LEFT JOIN rooms r ON r.room_id = m.room_id
      WHERE u.user_id = ?`,
    [userId],
  );
  const u = rows[0];
  if (!u) throw new AppError(404, 'USER_NOT_FOUND', '회원 정보를 찾을 수 없습니다.');
  return {
    userId: u.user_id,
    loginId: u.login_id,
    name: u.name,
    nickname: u.nickname,
    phone: u.phone,
    // 전체 계좌 정보는 응답에 담지 않고 마지막 4자리만 보여준다.
    accountMasked: maskAccount(decryptAccount(u.account_encrypted)),
    birthDate: u.birth_date,
    gender: u.gender,
    createdAt: u.created_at,
    room: u.room_id
      ? { roomId: u.room_id, roomName: u.room_name, isOwner: u.owner_user_id === u.user_id }
      : null,
  };
}

async function updateMe(userId, fields) {
  const columns = [];
  const values = [];
  if (fields.name !== undefined) { columns.push('name = ?'); values.push(fields.name); }
  if (fields.nickname !== undefined) { columns.push('nickname = ?'); values.push(fields.nickname); }
  if (fields.phone !== undefined) { columns.push('phone = ?'); values.push(fields.phone); }
  try {
    await pool.query(`UPDATE users SET ${columns.join(', ')} WHERE user_id = ?`, [...values, userId]);
  } catch (err) {
    throw mapUserDuplicate(err);
  }
  return getMe(userId);
}

async function verifyCurrentPassword(userId, currentPassword) {
  const [rows] = await pool.query('SELECT password_hash FROM users WHERE user_id = ?', [userId]);
  const ok = rows[0] && (await bcrypt.compare(currentPassword, rows[0].password_hash));
  if (!ok) throw new AppError(403, 'WRONG_PASSWORD', '현재 비밀번호가 올바르지 않습니다.');
}

/** 비밀번호를 바꾼다. 이전에 발급된 토큰은 모두 무효가 되므로 새 password_hash를 돌려준다. */
async function changePassword(userId, currentPassword, newPassword) {
  await verifyCurrentPassword(userId, currentPassword);
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [passwordHash, userId]);
  return passwordHash;
}

async function changeAccount(userId, currentPassword, accountInfo) {
  await verifyCurrentPassword(userId, currentPassword);
  await pool.query('UPDATE users SET account_encrypted = ? WHERE user_id = ?', [encryptAccount(accountInfo), userId]);
}

async function isLoginIdAvailable(loginId) {
  const [rows] = await pool.query('SELECT 1 FROM users WHERE login_id = ?', [loginId]);
  return rows.length === 0;
}

async function isNicknameAvailable(nickname) {
  const [rows] = await pool.query('SELECT 1 FROM users WHERE nickname = ?', [nickname]);
  return rows.length === 0;
}

module.exports = {
  mapUserDuplicate,
  getMe,
  updateMe,
  changePassword,
  changeAccount,
  isLoginIdAvailable,
  isNicknameAvailable,
};
