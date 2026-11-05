const { pool } = require('../config/db');
const { AppError } = require('../utils/errors');
const { loadRoom, withRoomMember } = require('./roomAccess');

/**
 * 일정 규칙
 *  - 일정은 모두 방 구성원에게 공유된다.
 *  - 고치거나 지우는 것은 작성자와 방장만 할 수 있다.
 *  - 시각은 시간대 정보 없이 "YYYY-MM-DD HH:mm:ss" 그대로 저장하고 돌려준다.
 */

const SELECT_SCHEDULE = `
  SELECT s.schedule_id, s.room_id, s.user_id, s.title, s.start_at, s.end_at, s.created_at, s.updated_at,
         u.nickname AS author_nickname
    FROM schedules s JOIN users u ON u.user_id = s.user_id`;

function formatSchedule(r) {
  return {
    scheduleId: r.schedule_id,
    roomId: r.room_id,
    title: r.title,
    startAt: r.start_at,
    endAt: r.end_at,
    authorUserId: r.user_id,
    authorNickname: r.author_nickname,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

async function findSchedule(db, roomId, scheduleId, { lock = false } = {}) {
  const [rows] = await db.query(
    `${SELECT_SCHEDULE} WHERE s.schedule_id = ? AND s.room_id = ?${lock ? ' FOR UPDATE' : ''}`,
    [scheduleId, roomId],
  );
  if (!rows[0]) throw new AppError(404, 'SCHEDULE_NOT_FOUND', '일정을 찾을 수 없습니다.');
  return rows[0];
}

function assertCanModify(schedule, room, userId) {
  if (schedule.user_id !== userId && room.owner_user_id !== userId) {
    throw new AppError(403, 'NOT_SCHEDULE_AUTHOR', '일정은 작성자나 방장만 수정하거나 삭제할 수 있습니다.');
  }
}

async function createSchedule(userId, roomId, body) {
  return withRoomMember(userId, roomId, async (conn) => {
    const [result] = await conn.query(
      'INSERT INTO schedules (room_id, user_id, title, start_at, end_at) VALUES (?, ?, ?, ?, ?)',
      [roomId, userId, body.title, body.startAt, body.endAt],
    );
    return formatSchedule(await findSchedule(conn, roomId, result.insertId));
  });
}

/** from, to는 날짜. 그 기간과 조금이라도 겹치는 일정을 돌려준다. */
async function listSchedules(userId, roomId, q) {
  await loadRoom(pool, userId, roomId);
  const where = ['s.room_id = ?'];
  const params = [roomId];
  if (q.to) { where.push('s.start_at < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(q.to); }
  if (q.from) { where.push('s.end_at >= ?'); params.push(q.from); }
  const [rows] = await pool.query(
    `${SELECT_SCHEDULE} WHERE ${where.join(' AND ')} ORDER BY s.start_at, s.schedule_id LIMIT ?`,
    [...params, q.limit],
  );
  return rows.map(formatSchedule);
}

async function getSchedule(userId, roomId, scheduleId) {
  await loadRoom(pool, userId, roomId);
  return formatSchedule(await findSchedule(pool, roomId, scheduleId));
}

async function updateSchedule(userId, roomId, scheduleId, body) {
  return withRoomMember(userId, roomId, async (conn, room) => {
    const current = await findSchedule(conn, roomId, scheduleId, { lock: true });
    assertCanModify(current, room, userId);

    const title = body.title ?? current.title;
    const startAt = body.startAt ?? current.start_at;
    const endAt = body.endAt ?? current.end_at;
    if (endAt < startAt) {
      throw new AppError(400, 'VALIDATION_ERROR', '종료 시각은 시작 시각 이후여야 합니다.', [
        { field: 'endAt', message: '종료 시각은 시작 시각 이후여야 합니다.' },
      ]);
    }
    await conn.query('UPDATE schedules SET title = ?, start_at = ?, end_at = ? WHERE schedule_id = ?',
      [title, startAt, endAt, scheduleId]);
    return formatSchedule(await findSchedule(conn, roomId, scheduleId));
  });
}

async function deleteSchedule(userId, roomId, scheduleId) {
  await withRoomMember(userId, roomId, async (conn, room) => {
    const current = await findSchedule(conn, roomId, scheduleId, { lock: true });
    assertCanModify(current, room, userId);
    await conn.query('DELETE FROM schedules WHERE schedule_id = ?', [scheduleId]);
  });
}

module.exports = { createSchedule, listSchedules, getSchedule, updateSchedule, deleteSchedule };
