const { withTransaction } = require('../config/db');
const { AppError } = require('../utils/errors');

const ROOM_NOT_FOUND = () => new AppError(404, 'ROOM_NOT_FOUND', '방을 찾을 수 없습니다.');
const NOT_ROOM_OWNER = () => new AppError(403, 'NOT_ROOM_OWNER', '방장만 할 수 있는 작업입니다.');

const LOCKS = { update: ' FOR UPDATE', share: ' FOR SHARE' };

/**
 * 방을 읽어 온다. 요청한 회원이 구성원이 아니면 방이 있는지 알려주지 않도록 똑같이 404를 준다.
 *
 * lock
 *  - 'update': 방 행을 쓰기 잠금. 방 설정을 바꾸거나 구성원이 나가고 들어올 때 쓴다.
 *  - 'share' : 방 행을 읽기 잠금. 물품·일정 등을 만들 때 쓴다. 누군가 나가는 중이면
 *              그 처리가 끝날 때까지 기다리므로, 나간 사람의 데이터가 새로 생기지 않는다.
 */
async function loadRoom(db, userId, roomId, { lock = null, ownerOnly = false } = {}) {
  const lockSql = lock === true ? LOCKS.update : LOCKS[lock] || '';
  const [rooms] = await db.query(
    `SELECT room_id, room_name, owner_user_id, capacity, created_at FROM rooms WHERE room_id = ?${lockSql}`,
    [roomId],
  );
  const room = rooms[0];
  let isMember = false;
  if (room) {
    const [m] = await db.query('SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?', [roomId, userId]);
    isMember = m.length > 0;
  }
  if (!room || !isMember) throw ROOM_NOT_FOUND();
  if (ownerOnly && room.owner_user_id !== userId) throw NOT_ROOM_OWNER();
  return room;
}

/** 방 구성원으로서 트랜잭션 안에서 fn(conn, room)을 실행한다. */
function withRoomMember(userId, roomId, fn) {
  return withTransaction(async (conn) => {
    const room = await loadRoom(conn, userId, roomId, { lock: 'share' });
    return fn(conn, room);
  });
}

async function currentMemberIds(db, roomId) {
  const [rows] = await db.query('SELECT user_id FROM room_members WHERE room_id = ?', [roomId]);
  return new Set(rows.map((r) => r.user_id));
}

/**
 * 회원번호들의 표시 정보를 돌려준다.
 * status: MEMBER 현재 구성원 / LEFT 스스로 나감 / KICKED 방장이 내보냄
 * 나간 사람이 결제하거나 분담한 지출 기록에서 누구인지 보여주는 데 쓴다.
 */
async function memberLabels(db, roomId, userIds) {
  const ids = [...new Set(userIds.filter((id) => id !== null && id !== undefined))];
  const labels = new Map();
  if (ids.length === 0) return labels;
  const [rows] = await db.query(
    `SELECT u.user_id, u.nickname,
            EXISTS (SELECT 1 FROM room_members m WHERE m.room_id = ? AND m.user_id = u.user_id) AS is_member,
            (SELECT d.reason FROM room_departures d
              WHERE d.room_id = ? AND d.user_id = u.user_id
              ORDER BY d.departure_id DESC LIMIT 1) AS reason
       FROM users u WHERE u.user_id IN (?)`,
    [roomId, roomId, ids],
  );
  for (const r of rows) {
    let status = 'MEMBER';
    if (!r.is_member) status = r.reason === 'KICKED' ? 'KICKED' : 'LEFT';
    labels.set(r.user_id, { userId: r.user_id, nickname: r.nickname, status });
  }
  return labels;
}

module.exports = { ROOM_NOT_FOUND, NOT_ROOM_OWNER, loadRoom, withRoomMember, currentMemberIds, memberLabels };
