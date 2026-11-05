const { pool, withTransaction } = require('../config/db');
const env = require('../config/env');
const { AppError, duplicateKey } = require('../utils/errors');
const { generateInviteCode, hashInviteCode } = require('../utils/crypto');
const { loadRoom } = require('./roomAccess');
const { assertCanLeave, purgeMemberData } = require('./departureService');

const ALREADY_IN_ROOM = () => new AppError(409, 'ALREADY_IN_ROOM', '이미 다른 방에 가입되어 있습니다. 먼저 방을 나가 주세요.');

async function countMembers(db, roomId) {
  const [rows] = await db.query('SELECT COUNT(*) AS cnt FROM room_members WHERE room_id = ?', [roomId]);
  return rows[0].cnt;
}

function formatRoom(room, userId, memberCount) {
  return {
    roomId: room.room_id,
    roomName: room.room_name,
    capacity: room.capacity,
    memberCount,
    isOwner: room.owner_user_id === userId,
    createdAt: room.created_at,
  };
}

async function assertNotInRoom(db, userId) {
  const [rows] = await db.query('SELECT 1 FROM room_members WHERE user_id = ?', [userId]);
  if (rows.length > 0) throw ALREADY_IN_ROOM();
}

/** 이전 초대 코드를 모두 끄고 새 코드를 만든다. 평문 코드는 이 응답에서만 볼 수 있다. */
async function issueInvitation(conn, roomId, userId, days) {
  await conn.query('UPDATE room_invitations SET is_active = 0 WHERE room_id = ? AND is_active = 1', [roomId]);
  const validDays = days || env.inviteDefaultDays;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateInviteCode();
    try {
      const [result] = await conn.query(
        `INSERT INTO room_invitations (room_id, code_hash, created_by, expires_at)
         VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))`,
        [roomId, hashInviteCode(code), userId, validDays],
      );
      const [rows] = await conn.query('SELECT expires_at FROM room_invitations WHERE invitation_id = ?', [result.insertId]);
      return { code, expiresAt: rows[0].expires_at };
    } catch (err) {
      if (duplicateKey(err) === null) throw err;
      // 코드가 우연히 겹친 경우에만 다시 만든다.
    }
  }
  throw new Error('초대 코드를 만들지 못했습니다.');
}

async function createRoom(userId, { roomName, capacity, inviteExpiresInDays }) {
  await assertNotInRoom(pool, userId);
  try {
    return await withTransaction(async (conn) => {
      const [result] = await conn.query(
        'INSERT INTO rooms (room_name, owner_user_id, capacity) VALUES (?, ?, ?)',
        [roomName, userId, capacity],
      );
      const roomId = result.insertId;
      await conn.query('INSERT INTO room_members (room_id, user_id) VALUES (?, ?)', [roomId, userId]);
      const invite = await issueInvitation(conn, roomId, userId, inviteExpiresInDays);
      const room = await loadRoom(conn, userId, roomId);
      return { room: formatRoom(room, userId, 1), invite };
    });
  } catch (err) {
    // 동시에 두 번 요청해 이미 가입된 경우
    if (duplicateKey(err) !== null && String(duplicateKey(err)).includes('uq_room_members_user')) throw ALREADY_IN_ROOM();
    throw err;
  }
}

async function getMyRoom(userId) {
  const [rows] = await pool.query('SELECT room_id FROM room_members WHERE user_id = ?', [userId]);
  if (rows.length === 0) return null;
  return getRoom(userId, rows[0].room_id);
}

async function getRoom(userId, roomId) {
  const room = await loadRoom(pool, userId, roomId);
  return formatRoom(room, userId, await countMembers(pool, roomId));
}

async function listMembers(userId, roomId) {
  const room = await loadRoom(pool, userId, roomId);
  // 이름·전화번호 같은 개인정보는 내려주지 않고 닉네임만 보여준다.
  const [rows] = await pool.query(
    `SELECT u.user_id, u.nickname, m.joined_at
       FROM room_members m JOIN users u ON u.user_id = m.user_id
      WHERE m.room_id = ?
      ORDER BY m.joined_at, m.room_member_id`,
    [roomId],
  );
  return rows.map((r) => ({
    userId: r.user_id,
    nickname: r.nickname,
    isOwner: r.user_id === room.owner_user_id,
    joinedAt: r.joined_at,
  }));
}

async function joinRoom(userId, code) {
  await assertNotInRoom(pool, userId);
  const [invites] = await pool.query(
    `SELECT room_id FROM room_invitations
      WHERE code_hash = ? AND is_active = 1 AND (expires_at IS NULL OR expires_at > NOW())`,
    [hashInviteCode(code)],
  );
  if (invites.length === 0) {
    throw new AppError(404, 'INVALID_INVITE_CODE', '유효하지 않거나 만료된 초대 코드입니다.');
  }
  const roomId = invites[0].room_id;

  try {
    // 정원 검사는 DB 트리거가 방 행을 잠그고 처리한다. 정원이 차면 ROOM_FULL 오류가 난다.
    await pool.query('INSERT INTO room_members (room_id, user_id) VALUES (?, ?)', [roomId, userId]);
  } catch (err) {
    if (err.errno === 1644 && err.sqlMessage === 'ROOM_FULL') {
      throw new AppError(409, 'ROOM_FULL', '방 정원이 가득 찼습니다.');
    }
    if (duplicateKey(err) !== null) throw ALREADY_IN_ROOM();
    throw err;
  }
  return getRoom(userId, roomId);
}

async function updateRoom(userId, roomId, fields) {
  await withTransaction(async (conn) => {
    await loadRoom(conn, userId, roomId, { lock: 'update', ownerOnly: true });
    const columns = [];
    const values = [];
    if (fields.roomName !== undefined) { columns.push('room_name = ?'); values.push(fields.roomName); }
    if (fields.capacity !== undefined) { columns.push('capacity = ?'); values.push(fields.capacity); }
    await conn.query(`UPDATE rooms SET ${columns.join(', ')} WHERE room_id = ?`, [...values, roomId]);
  });
  return getRoom(userId, roomId);
}

async function newInvitation(userId, roomId, days) {
  return withTransaction(async (conn) => {
    await loadRoom(conn, userId, roomId, { lock: 'update', ownerOnly: true });
    return issueInvitation(conn, roomId, userId, days);
  });
}

/**
 * 방 나가기.
 *  - 방장이 혼자 남았다면 방이 삭제된다. 방의 모든 데이터가 함께 삭제된다.
 *  - 방장이 다른 구성원이 있는데 나가려 하면 먼저 위임해야 한다.
 *  - 일반 구성원은 정산이 모두 끝났을 때만 나갈 수 있다.
 *    내가 등록한 공용 물품이 있으면 sharedItems(TRANSFER 방장에게 넘김 / DELETE 삭제)를 골라야 한다.
 *  - 나간 사람의 물품·일정·청소 담당은 정리되고, 지출 기록은 방에 남는다.
 */
async function leaveRoom(userId, roomId, sharedItems) {
  return withTransaction(async (conn) => {
    const room = await loadRoom(conn, userId, roomId, { lock: 'update' });
    if (room.owner_user_id === userId) {
      if ((await countMembers(conn, roomId)) > 1) {
        throw new AppError(409, 'OWNER_MUST_TRANSFER', '방장을 다른 구성원에게 위임한 뒤에 나갈 수 있습니다.');
      }
      await conn.query('DELETE FROM rooms WHERE room_id = ?', [roomId]);
      return { roomDeleted: true };
    }

    await assertCanLeave(conn, roomId, userId, sharedItems);
    await purgeMemberData(conn, {
      roomId, userId, ownerUserId: room.owner_user_id, sharedItems: sharedItems || 'TRANSFER', reason: 'LEFT',
    });
    return { roomDeleted: false };
  });
}

async function transferOwner(userId, roomId, targetUserId) {
  await withTransaction(async (conn) => {
    await loadRoom(conn, userId, roomId, { lock: 'update', ownerOnly: true });
    if (targetUserId === userId) {
      throw new AppError(400, 'INVALID_TARGET', '이미 방장입니다.');
    }
    const [m] = await conn.query('SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?', [roomId, targetUserId]);
    if (m.length === 0) throw new AppError(404, 'MEMBER_NOT_FOUND', '방 구성원을 찾을 수 없습니다.');
    await conn.query('UPDATE rooms SET owner_user_id = ? WHERE room_id = ?', [targetUserId, roomId]);
  });
  return getRoom(userId, roomId);
}

/**
 * 방장이 구성원을 내보낸다.
 * 정산이 안 끝났어도 내보낼 수 있고, 지출·분담 기록은 KICKED(추방됨)로 표시되어 방에 남는다.
 * 내보내는 경우 공용 물품은 항상 방장에게 넘어간다.
 */
async function removeMember(userId, roomId, targetUserId) {
  await withTransaction(async (conn) => {
    const room = await loadRoom(conn, userId, roomId, { lock: 'update', ownerOnly: true });
    if (targetUserId === userId) {
      throw new AppError(400, 'INVALID_TARGET', '본인은 내보낼 수 없습니다. 방 나가기를 이용해 주세요.');
    }
    const [m] = await conn.query('SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?', [roomId, targetUserId]);
    if (m.length === 0) throw new AppError(404, 'MEMBER_NOT_FOUND', '방 구성원을 찾을 수 없습니다.');
    await purgeMemberData(conn, {
      roomId, userId: targetUserId, ownerUserId: room.owner_user_id, sharedItems: 'TRANSFER', reason: 'KICKED',
    });
  });
}

module.exports = {
  createRoom,
  getMyRoom,
  getRoom,
  listMembers,
  joinRoom,
  updateRoom,
  newInvitation,
  leaveRoom,
  transferOwner,
  removeMember,
};
