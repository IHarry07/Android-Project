const { pool } = require('../config/db');
const { AppError } = require('../utils/errors');
const { loadRoom, withRoomMember } = require('./roomAccess');
const notifications = require('./notificationService');

/**
 * 일정 규칙
 *  - 공개 범위(visibility)가 SHARED(기본)인 일정은 방 구성원 모두에게 공유된다.
 *  - PERSONAL(개인) 일정은 작성자에게만 보인다. 다른 구성원에게는 목록에도 없고, 주소로 직접 조회·수정해도 SCHEDULE_NOT_FOUND(404)다.
 *    개인 일정은 방장도 볼 수 없다.
 *  - 고치거나 지우는 것은 작성자와 방장만 할 수 있다. (방장은 공유 일정만 볼 수 있으므로 사실상 공유 일정만)
 *  - 공개 범위는 작성자만 바꿀 수 있다.
 *  - 시각은 시간대 정보 없이 "YYYY-MM-DD HH:mm:ss" 그대로 저장하고 돌려준다.
 */

const SELECT_SCHEDULE = `
  SELECT s.schedule_id, s.room_id, s.user_id, s.title, s.description, s.visibility,
         s.start_at, s.end_at, s.reminder_minutes, s.created_at, s.updated_at,
         u.nickname AS author_nickname
    FROM schedules s JOIN users u ON u.user_id = s.user_id`;

function formatSchedule(r) {
  return {
    scheduleId: r.schedule_id,
    roomId: r.room_id,
    title: r.title,
    description: r.description,
    visibility: r.visibility,
    startAt: r.start_at,
    endAt: r.end_at,
    reminderMinutes: r.reminder_minutes,
    authorUserId: r.user_id,
    authorNickname: r.author_nickname,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** viewerId에게 보이는 일정만 찾는다. 다른 구성원의 개인 일정은 없는 것과 같다. */
async function findSchedule(db, roomId, scheduleId, viewerId, { lock = false } = {}) {
  const [rows] = await db.query(
    `${SELECT_SCHEDULE} WHERE s.schedule_id = ? AND s.room_id = ?
       AND (s.visibility = 'SHARED' OR s.user_id = ?)${lock ? ' FOR UPDATE' : ''}`,
    [scheduleId, roomId, viewerId],
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
      'INSERT INTO schedules (room_id, user_id, title, description, visibility, start_at, end_at, reminder_minutes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [roomId, userId, body.title, body.description ?? null, body.visibility ?? 'SHARED', body.startAt, body.endAt, body.reminderMinutes === undefined ? 60 : body.reminderMinutes],
    );
    return formatSchedule(await findSchedule(conn, roomId, result.insertId, userId));
  });
}

/** from, to는 날짜. 그 기간과 조금이라도 겹치는 일정을 돌려준다. 다른 구성원의 개인 일정은 넣지 않는다. */
async function listSchedules(userId, roomId, q) {
  await loadRoom(pool, userId, roomId);
  const where = ['s.room_id = ?', "(s.visibility = 'SHARED' OR s.user_id = ?)"];
  const params = [roomId, userId];
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
  return formatSchedule(await findSchedule(pool, roomId, scheduleId, userId));
}

async function updateSchedule(userId, roomId, scheduleId, body) {
  return withRoomMember(userId, roomId, async (conn, room) => {
    const current = await findSchedule(conn, roomId, scheduleId, userId, { lock: true });
    assertCanModify(current, room, userId);
    if (body.visibility !== undefined && current.user_id !== userId) {
      throw new AppError(403, 'NOT_SCHEDULE_AUTHOR', '공개 범위는 작성자만 바꿀 수 있습니다.');
    }

    const title = body.title ?? current.title;
    const description = body.description !== undefined ? body.description : current.description;
    const visibility = body.visibility ?? current.visibility;
    const startAt = body.startAt ?? current.start_at;
    const endAt = body.endAt ?? current.end_at;
    const reminder = body.reminderMinutes !== undefined ? body.reminderMinutes : current.reminder_minutes;
    if (endAt < startAt) {
      throw new AppError(400, 'VALIDATION_ERROR', '종료 시각은 시작 시각 이후여야 합니다.', [
        { field: 'endAt', message: '종료 시각은 시작 시각 이후여야 합니다.' },
      ]);
    }
    await conn.query(
      'UPDATE schedules SET title = ?, description = ?, visibility = ?, start_at = ?, end_at = ?, reminder_minutes = ? WHERE schedule_id = ?',
      [title, description, visibility, startAt, endAt, reminder, scheduleId],
    );
    return formatSchedule(await findSchedule(conn, roomId, scheduleId, userId));
  });
}

async function deleteSchedule(userId, roomId, scheduleId) {
  await withRoomMember(userId, roomId, async (conn, room) => {
    const current = await findSchedule(conn, roomId, scheduleId, userId, { lock: true });
    assertCanModify(current, room, userId);
    await notifications.deleteByTarget(conn, 'SCHEDULE', scheduleId);
    await conn.query('DELETE FROM schedules WHERE schedule_id = ?', [scheduleId]);
  });
}

module.exports = { createSchedule, listSchedules, getSchedule, updateSchedule, deleteSchedule };
