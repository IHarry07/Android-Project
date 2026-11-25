const { pool } = require('../config/db');
const { AppError } = require('../utils/errors');
const { loadRoom, withRoomMember, memberLabels } = require('./roomAccess');

/**
 * 공동 메모 (약관 제5조): 방 구성원 모두가 보고 쓴다.
 *  - 수정·삭제는 작성자만 할 수 있고, 방장은 모든 메모를 수정·삭제할 수 있다.
 *  - 작성자가 방을 나가도 메모는 남고, 작성자는 나간 사람(LEFT/KICKED)으로 표시된다.
 */

const MEMO_NOT_FOUND = () => new AppError(404, 'MEMO_NOT_FOUND', '메모를 찾을 수 없습니다.');

async function format(db, roomId, memos, viewerId, ownerId) {
  const labels = await memberLabels(db, roomId, memos.map((m) => m.user_id));
  return memos.map((m) => ({
    memoId: m.memo_id,
    roomId: m.room_id,
    title: m.title,
    content: m.content,
    author: labels.get(m.user_id) || null,
    canEdit: m.user_id === viewerId || ownerId === viewerId,
    createdAt: m.created_at,
    updatedAt: m.updated_at,
  }));
}

async function find(db, roomId, memoId, { lock = false } = {}) {
  const [rows] = await db.query(
    `SELECT * FROM room_memos WHERE memo_id = ? AND room_id = ?${lock ? ' FOR UPDATE' : ''}`,
    [memoId, roomId],
  );
  if (!rows[0]) throw MEMO_NOT_FOUND();
  return rows[0];
}

function assertCanModify(memo, room, userId) {
  if (memo.user_id !== userId && room.owner_user_id !== userId) {
    throw new AppError(403, 'NOT_MEMO_AUTHOR', '메모는 작성자나 방장만 수정하거나 삭제할 수 있습니다.');
  }
}

async function listMemos(userId, roomId, q) {
  const room = await loadRoom(pool, userId, roomId);
  const [rows] = await pool.query(
    'SELECT * FROM room_memos WHERE room_id = ? ORDER BY updated_at DESC, memo_id DESC LIMIT ?',
    [roomId, q.limit],
  );
  return format(pool, roomId, rows, userId, room.owner_user_id);
}

async function getMemo(userId, roomId, memoId) {
  const room = await loadRoom(pool, userId, roomId);
  const memo = await find(pool, roomId, memoId);
  return (await format(pool, roomId, [memo], userId, room.owner_user_id))[0];
}

async function createMemo(userId, roomId, body) {
  return withRoomMember(userId, roomId, async (conn, room) => {
    const [result] = await conn.query(
      'INSERT INTO room_memos (room_id, user_id, title, content) VALUES (?, ?, ?, ?)',
      [roomId, userId, body.title, body.content || null],
    );
    const memo = await find(conn, roomId, result.insertId);
    return (await format(conn, roomId, [memo], userId, room.owner_user_id))[0];
  });
}

async function updateMemo(userId, roomId, memoId, body) {
  return withRoomMember(userId, roomId, async (conn, room) => {
    const memo = await find(conn, roomId, memoId, { lock: true });
    assertCanModify(memo, room, userId);
    const title = body.title ?? memo.title;
    const content = body.content !== undefined ? (body.content || null) : memo.content;
    await conn.query('UPDATE room_memos SET title = ?, content = ? WHERE memo_id = ?', [title, content, memoId]);
    const updated = await find(conn, roomId, memoId);
    return (await format(conn, roomId, [updated], userId, room.owner_user_id))[0];
  });
}

async function deleteMemo(userId, roomId, memoId) {
  await withRoomMember(userId, roomId, async (conn, room) => {
    const memo = await find(conn, roomId, memoId, { lock: true });
    assertCanModify(memo, room, userId);
    await conn.query('DELETE FROM room_memos WHERE memo_id = ?', [memoId]);
  });
}

module.exports = { listMemos, getMemo, createMemo, updateMemo, deleteMemo };