const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { AppError, duplicateKey } = require('../utils/errors');
const departure = require('./departureService');
const securityMail = require('./securityMail');
const { verifyEmailToken } = require('./tokenService');
const { encryptAccount, decryptAccount, maskAccount } = require('../utils/crypto');

/** users 테이블의 UNIQUE 위반을 알아보기 쉬운 오류로 바꾼다. */
function mapUserDuplicate(err) {
  const msg = duplicateKey(err);
  if (msg === null) return err;
  if (msg.includes('uq_users_login_id')) return new AppError(409, 'LOGIN_ID_TAKEN', '이미 사용 중인 아이디입니다.');
  if (msg.includes('uq_users_nickname')) return new AppError(409, 'NICKNAME_TAKEN', '이미 사용 중인 닉네임입니다.');
  if (msg.includes('uq_users_email')) return new AppError(409, 'EMAIL_TAKEN', '이미 가입된 이메일입니다.');
  if (msg.includes('uq_users_phone')) return new AppError(409, 'PHONE_TAKEN', '이미 가입된 전화번호입니다.');
  return err;
}

/** 프로필 사진. 본인은 항상 볼 수 있고, 다른 사람은 상대가 공개했고 같은 방일 때만 볼 수 있다. */
async function getPhoto(viewerId, targetId) {
  const [rows] = await pool.query(
    `SELECT p.image, p.updated_at, u.photo_public,
            EXISTS(SELECT 1 FROM room_members a JOIN room_members b ON a.room_id = b.room_id
                    WHERE a.user_id = ? AND b.user_id = ?) AS same_room
       FROM user_photos p JOIN users u ON u.user_id = p.user_id
      WHERE p.user_id = ?`,
    [viewerId, targetId, targetId],
  );
  const r = rows[0];
  const visible = r && (viewerId === targetId || (r.photo_public === 1 && r.same_room === 1));
  if (!visible) throw new AppError(404, 'PHOTO_NOT_FOUND', '프로필 사진이 없습니다.');
  return { image: r.image, updatedAt: r.updated_at };
}

async function setPhoto(userId, image) {
  await pool.query(
    `INSERT INTO user_photos (user_id, image) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE image = VALUES(image), updated_at = CURRENT_TIMESTAMP`,
    [userId, image],
  );
}

async function removePhoto(userId) {
  await pool.query('DELETE FROM user_photos WHERE user_id = ?', [userId]);
}

async function setPhotoPublic(userId, isPublic) {
  await pool.query('UPDATE users SET photo_public = ? WHERE user_id = ?', [isPublic ? 1 : 0, userId]);
}

/**
 * 회원 탈퇴 (약관 제13·14조).
 *  - 비밀번호를 다시 확인한다.
 *  - 방에 속해 있으면 방 나가기와 같은 규칙이 적용된다: 방장이 다른 구성원과 함께 있으면 먼저 위임해야 하고,
 *    정산이 끝나지 않았으면(받을 돈·보낼 돈 모두) 탈퇴할 수 없고, 내가 등록한 공용 물품은 방장에게 넘기거나 삭제한다.
 *    혼자 남은 방장이 탈퇴하면 방이 삭제된다.
 *  - 탈퇴하면 개인정보(아이디, 이름, 닉네임, 전화번호, 계좌, 생년월일, 성별), 프로필 사진, 알림, 기기 토큰을 지우고
 *    행은 기록용으로만 남긴다. 다른 회원과 함께 쓰던 지출·청소 이력에는 "탈퇴한 회원"으로 보인다.
 */
async function withdraw(userId, password, sharedItems) {
  const [rows] = await pool.query('SELECT password_hash, email FROM users WHERE user_id = ? AND withdrawn_at IS NULL', [userId]);
  const ok = rows[0] && (await bcrypt.compare(password, rows[0].password_hash));
  if (!ok) throw new AppError(403, 'INVALID_PASSWORD', '비밀번호가 올바르지 않습니다.');
  const emailBefore = rows[0].email;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [memberships] = await conn.query('SELECT room_id FROM room_members WHERE user_id = ? FOR UPDATE', [userId]);
    if (memberships[0]) {
      const roomId = memberships[0].room_id;
      const [[room]] = await conn.query('SELECT owner_user_id FROM rooms WHERE room_id = ? FOR UPDATE', [roomId]);
      const [[{ n: memberCount }]] = await conn.query('SELECT COUNT(*) AS n FROM room_members WHERE room_id = ?', [roomId]);
      if (room.owner_user_id === userId) {
        if (memberCount > 1) {
          throw new AppError(409, 'OWNER_MUST_TRANSFER', '방장을 다른 구성원에게 위임한 뒤에 탈퇴할 수 있습니다.');
        }
        await conn.query('DELETE FROM rooms WHERE room_id = ?', [roomId]);
      } else {
        await departure.assertCanLeave(conn, roomId, userId, sharedItems);
        await departure.purgeMemberData(conn, {
          roomId, userId, ownerUserId: room.owner_user_id, sharedItems: sharedItems || 'TRANSFER', reason: 'LEFT',
        });
      }
    }

    // 개인정보 제거. 다른 사람의 기록이 가리키는 행은 남겨야 해서 지우지 않고 비식별 값으로 바꾼다.
    await conn.query(
      `UPDATE users
          SET login_id = CONCAT('withdrawn_', user_id),
              password_hash = '!withdrawn',
              name = '탈퇴한 회원',
              nickname = CONCAT('탈퇴한 회원 ', user_id),
              phone = CONCAT('W', user_id),
              email = NULL,
              account_encrypted = ?,
              birth_date = '1900-01-01',
              gender = 'OTHER',
              photo_public = 0,
              withdrawn_at = NOW()
        WHERE user_id = ?`,
      [encryptAccount('withdrawn'), userId],
    );
    await conn.query('DELETE FROM user_photos WHERE user_id = ?', [userId]);
    await conn.query('DELETE FROM device_tokens WHERE user_id = ?', [userId]);
    await conn.query('DELETE FROM user_notification_settings WHERE user_id = ?', [userId]);
    await conn.query('DELETE FROM notifications WHERE user_id = ?', [userId]);
    await conn.query('DELETE FROM inquiries WHERE user_id = ?', [userId]);
    if (emailBefore) await conn.query('DELETE FROM email_verifications WHERE email = ?', [emailBefore]);

    await conn.commit();
    // 탈퇴가 끝나면 지우기 전 이메일로 완료를 알린다.
    securityMail.withdrawn(emailBefore);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function getMe(userId) {
  const [rows] = await pool.query(
    `SELECT u.user_id, u.login_id, u.name, u.nickname, u.phone, u.email, u.account_encrypted,
            u.birth_date, u.gender, u.created_at, u.photo_public,
            (SELECT UNIX_TIMESTAMP(updated_at) FROM user_photos WHERE user_id = u.user_id) AS photo_version,
            r.room_id, r.room_name, r.owner_user_id
       FROM users u
       LEFT JOIN room_members m ON m.user_id = u.user_id
       LEFT JOIN rooms r ON r.room_id = m.room_id
      WHERE u.user_id = ?`,
    [userId],
  );
  const u = rows[0];
  if (!u) throw new AppError(404, 'USER_NOT_FOUND', '회원 정보를 찾을 수 없습니다.');

  // 내가 실제로 완료한 청소 횟수 (담당자가 아니어도 대신 완료했다면 센다.)
  const [[done]] = await pool.query(
    "SELECT COUNT(*) AS n FROM cleaning_records WHERE completed_by = ? AND status = 'DONE'",
    [userId],
  );

  // 내 청소를 다른 사람이 대신 끝내 준 횟수: 내가 '이번 회차만' 넘긴 회차 중, 다른 사람이 실제로 완료한 것
  const [[helped]] = await pool.query(`
    SELECT COUNT(DISTINCT c.task_id, c.due_date) AS n
      FROM cleaning_assignee_changes c
      JOIN cleaning_records r ON r.task_id = c.task_id AND r.due_date = c.due_date AND r.status = 'DONE'
     WHERE c.scope = 'ONCE' AND c.from_user_id = ? AND r.completed_by <> ?`,
    [userId, userId],
  );

  return {
    userId: u.user_id,
    loginId: u.login_id,
    name: u.name,
    nickname: u.nickname,
    phone: u.phone,
    email: u.email,
    // 전체 계좌 정보는 응답에 담지 않고 마지막 4자리만 보여준다.
    accountMasked: maskAccount(decryptAccount(u.account_encrypted)),
    birthDate: u.birth_date,
    gender: u.gender,
    createdAt: u.created_at,
    // 프로필 사진: 없으면 photoVersion이 null. photoPublic은 같은 방 구성원에게 보일지.
    photoVersion: u.photo_version === null ? null : Number(u.photo_version),
    photoPublic: u.photo_public === 1,
    stats: { completedCleanings: Number(done.n), helpedCleanings: Number(helped.n) },
    room: u.room_id
      ? { roomId: u.room_id, roomName: u.room_name, isOwner: u.owner_user_id === u.user_id }
      : null,
  };
}

async function updateMe(userId, fields) {
  const columns = [];
  const values = [];
  let oldEmail = null;
  if (fields.email !== undefined) {
    // 이메일을 바꾸려면 새 이메일로 인증을 마친 확인 토큰이 있어야 한다. (지우는 것은 안 된다: 필수 항목)
    if (verifyEmailToken(fields.emailToken) !== fields.email) {
      throw new AppError(400, 'EMAIL_NOT_VERIFIED', '새 이메일로 인증을 먼저 해 주세요. (인증은 30분 동안 유효해요)');
    }
    const [[me]] = await pool.query('SELECT email FROM users WHERE user_id = ?', [userId]);
    oldEmail = me ? me.email : null;
  }
  if (fields.name !== undefined) { columns.push('name = ?'); values.push(fields.name); }
  if (fields.nickname !== undefined) { columns.push('nickname = ?'); values.push(fields.nickname); }
  if (fields.phone !== undefined) { columns.push('phone = ?'); values.push(fields.phone); }
  if (fields.email !== undefined) { columns.push('email = ?'); values.push(fields.email); }
  if (columns.length === 0) throw new AppError(400, 'VALIDATION_ERROR', '수정할 항목이 없습니다.');
  try {
    await pool.query(`UPDATE users SET ${columns.join(', ')} WHERE user_id = ?`, [...values, userId]);
  } catch (err) {
    throw mapUserDuplicate(err);
  }
  // 이메일이 바뀌면 이전 주소로 알린다. (계정을 빼앗기는 것을 알아챌 수 있게)
  if (oldEmail && fields.email !== undefined && oldEmail !== fields.email) {
    securityMail.emailChanged(oldEmail, fields.email);
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
  if (currentPassword === newPassword) {
    throw new AppError(400, 'SAME_PASSWORD', '이전과 같은 비밀번호예요. 다른 비밀번호를 입력해 주세요.');
  }
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [passwordHash, userId]);
  const [[me]] = await pool.query('SELECT email FROM users WHERE user_id = ?', [userId]);
  securityMail.passwordChanged(me && me.email);
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
  withdraw,
  getPhoto,
  setPhoto,
  removePhoto,
  setPhotoPublic,
  changePassword,
  changeAccount,
  isLoginIdAvailable,
  isNicknameAvailable,
};
