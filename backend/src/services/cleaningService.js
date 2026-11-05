const { pool } = require('../config/db');
const { AppError } = require('../utils/errors');
const { nextDueDate } = require('../utils/dates');
const { loadRoom, withRoomMember, currentMemberIds, memberLabels } = require('./roomAccess');
const notifications = require('./notificationService');

/**
 * 청소 규칙
 *  - 청소 항목 하나(cleaning_tasks)에는 항상 "다음 예정일"이 있고, 그 날짜의 SCHEDULED 기록이 하나 있다.
 *  - 완료·건너뜀: 그 기록을 마감하고 다음 예정일의 SCHEDULED 기록을 만든다.
 *    반복이 없으면(NONE) 항목이 비활성이 된다.
 *  - 미루기: 그 기록을 POSTPONED로 마감하고 미룬 날짜의 SCHEDULED 기록을 만든다.
 *  - 완료·건너뜀·미루기는 모두 항목 행을 잠근 상태에서 처리한다. 요청에 dueDate를 같이 보내면,
 *    화면에 보이던 예정일이 이미 바뀐 경우 STALE_DUE_DATE로 거절해서 같은 청소가 두 번 처리되지 않는다.
 *  - 항목을 만들고 고치는 것은 방 구성원 누구나 할 수 있다. 완전히 삭제하는 것은 방장만 할 수 있다.
 */

const TASK_NOT_FOUND = () => new AppError(404, 'TASK_NOT_FOUND', '청소 항목을 찾을 수 없습니다.');

async function today(db) {
  const [rows] = await db.query('SELECT CURDATE() AS d');
  return rows[0].d;
}

async function findTask(db, roomId, taskId, { lock = false } = {}) {
  const [rows] = await db.query(
    `SELECT task_id, room_id, assignee_user_id, area_name, next_due_date, repeat_type, repeat_interval,
            is_active, created_at, updated_at
       FROM cleaning_tasks WHERE task_id = ? AND room_id = ?${lock ? ' FOR UPDATE' : ''}`,
    [taskId, roomId],
  );
  if (!rows[0]) throw TASK_NOT_FOUND();
  return rows[0];
}

async function formatTasks(db, roomId, tasks, todayStr) {
  const labels = await memberLabels(db, roomId, tasks.map((t) => t.assignee_user_id));
  return tasks.map((t) => ({
    taskId: t.task_id,
    roomId: t.room_id,
    areaName: t.area_name,
    assignee: t.assignee_user_id ? labels.get(t.assignee_user_id) || null : null,
    nextDueDate: t.next_due_date,
    repeatType: t.repeat_type,
    repeatInterval: t.repeat_interval,
    isActive: Boolean(t.is_active),
    isOverdue: Boolean(t.is_active) && t.next_due_date < todayStr,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  }));
}

async function loadOne(db, roomId, taskId) {
  const task = await findTask(db, roomId, taskId);
  const [formatted] = await formatTasks(db, roomId, [task], await today(db));
  return formatted;
}

/** 현재 예정일의 SCHEDULED 기록을 돌려준다. 없으면 만든다. */
async function ensureCurrentRecord(conn, task) {
  const [rows] = await conn.query(
    "SELECT record_id FROM cleaning_records WHERE task_id = ? AND due_date = ? AND status = 'SCHEDULED' LIMIT 1",
    [task.task_id, task.next_due_date],
  );
  if (rows[0]) return rows[0].record_id;
  const [result] = await conn.query(
    "INSERT INTO cleaning_records (task_id, assignee_user_id, due_date, status) VALUES (?, ?, ?, 'SCHEDULED')",
    [task.task_id, task.assignee_user_id, task.next_due_date],
  );
  return result.insertId;
}

async function assertAssigneeIsMember(conn, roomId, assigneeUserId) {
  if (assigneeUserId === null || assigneeUserId === undefined) return;
  const members = await currentMemberIds(conn, roomId);
  if (!members.has(assigneeUserId)) {
    throw new AppError(400, 'ASSIGNEE_NOT_MEMBER', '담당자는 방 구성원이어야 합니다.');
  }
}

function assertFresh(task, dueDate) {
  if (dueDate !== undefined && dueDate !== task.next_due_date) {
    throw new AppError(409, 'STALE_DUE_DATE',
      '다른 사람이 이미 처리했거나 예정일이 바뀌었습니다. 새로고침 후 다시 시도해 주세요.',
      { currentDueDate: task.next_due_date });
  }
}

function assertActive(task) {
  if (!task.is_active) throw new AppError(409, 'TASK_INACTIVE', '비활성 상태의 청소 항목입니다.');
}

async function createTask(userId, roomId, body) {
  return withRoomMember(userId, roomId, async (conn) => {
    await assertAssigneeIsMember(conn, roomId, body.assigneeUserId);
    const todayStr = await today(conn);
    if (body.nextDueDate < todayStr) {
      throw new AppError(400, 'DUE_DATE_IN_PAST', '청소 날짜는 오늘이나 그 이후여야 합니다.');
    }
    const assignee = body.assigneeUserId ?? null;
    const [result] = await conn.query(
      `INSERT INTO cleaning_tasks (room_id, assignee_user_id, area_name, next_due_date, repeat_type, repeat_interval)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [roomId, assignee, body.areaName, body.nextDueDate, body.repeatType, body.repeatInterval],
    );
    const task = await findTask(conn, roomId, result.insertId);
    await ensureCurrentRecord(conn, task);
    return loadOne(conn, roomId, result.insertId);
  });
}

async function listTasks(userId, roomId, q) {
  await loadRoom(pool, userId, roomId);
  const where = ['room_id = ?'];
  const params = [roomId];
  if (q.active !== 'all') { where.push('is_active = ?'); params.push(q.active === 'true' ? 1 : 0); }
  if (q.dueBy) { where.push('next_due_date <= ?'); params.push(q.dueBy); }
  const [rows] = await pool.query(
    `SELECT task_id, room_id, assignee_user_id, area_name, next_due_date, repeat_type, repeat_interval,
            is_active, created_at, updated_at
       FROM cleaning_tasks WHERE ${where.join(' AND ')} ORDER BY next_due_date, task_id`,
    params,
  );
  return formatTasks(pool, roomId, rows, await today(pool));
}

async function getTask(userId, roomId, taskId) {
  await loadRoom(pool, userId, roomId);
  return loadOne(pool, roomId, taskId);
}

async function updateTask(userId, roomId, taskId, body) {
  return withRoomMember(userId, roomId, async (conn) => {
    const task = await findTask(conn, roomId, taskId, { lock: true });
    if (body.assigneeUserId !== undefined) await assertAssigneeIsMember(conn, roomId, body.assigneeUserId);
    if (body.nextDueDate !== undefined && body.nextDueDate < (await today(conn))) {
      throw new AppError(400, 'DUE_DATE_IN_PAST', '청소 날짜는 오늘이나 그 이후여야 합니다.');
    }

    const columns = [];
    const values = [];
    const set = (col, val) => { columns.push(`${col} = ?`); values.push(val); };
    if (body.areaName !== undefined) set('area_name', body.areaName);
    if (body.assigneeUserId !== undefined) set('assignee_user_id', body.assigneeUserId);
    if (body.nextDueDate !== undefined) set('next_due_date', body.nextDueDate);
    if (body.repeatType !== undefined) set('repeat_type', body.repeatType);
    if (body.repeatInterval !== undefined) set('repeat_interval', body.repeatInterval);
    if (body.isActive !== undefined) set('is_active', body.isActive ? 1 : 0);
    await conn.query(`UPDATE cleaning_tasks SET ${columns.join(', ')} WHERE task_id = ?`, [...values, taskId]);

    // 활성 항목은 예정된 회차가 항목의 날짜·담당자와 어긋나지 않도록 함께 맞춘다.
    const updated = await findTask(conn, roomId, taskId);
    if (updated.is_active) {
      const recordId = await ensureCurrentRecord(conn, {
        ...updated, next_due_date: task.next_due_date, assignee_user_id: task.assignee_user_id,
      });
      await conn.query(
        'UPDATE cleaning_records SET due_date = ?, assignee_user_id = ? WHERE record_id = ?',
        [updated.next_due_date, updated.assignee_user_id, recordId],
      );
    }
    return loadOne(conn, roomId, taskId);
  });
}

async function deleteTask(userId, roomId, taskId) {
  await withRoomMember(userId, roomId, async (conn, room) => {
    if (room.owner_user_id !== userId) {
      throw new AppError(403, 'NOT_ROOM_OWNER', '방장만 할 수 있는 작업입니다.');
    }
    await findTask(conn, roomId, taskId, { lock: true });
    await notifications.deleteByTarget(conn, 'CLEANING_TASK', taskId);
    await conn.query('DELETE FROM cleaning_tasks WHERE task_id = ?', [taskId]);
  });
}

/** 완료 또는 건너뜀. 현재 회차를 마감하고 다음 회차를 만든다. */
async function closeOccurrence(userId, roomId, taskId, { dueDate, memo }, outcome) {
  return withRoomMember(userId, roomId, async (conn) => {
    const task = await findTask(conn, roomId, taskId, { lock: true });
    assertActive(task);
    assertFresh(task, dueDate);

    const recordId = await ensureCurrentRecord(conn, task);
    if (outcome === 'DONE') {
      await conn.query(
        "UPDATE cleaning_records SET status = 'DONE', completed_at = NOW(), completed_by = ?, memo = ? WHERE record_id = ?",
        [userId, memo ?? null, recordId],
      );
    } else {
      await conn.query(
        "UPDATE cleaning_records SET status = 'SKIPPED', memo = ? WHERE record_id = ?",
        [memo ?? null, recordId],
      );
    }

    const next = nextDueDate(task.next_due_date, task.repeat_type, task.repeat_interval, await today(conn));
    if (next === null) {
      await conn.query('UPDATE cleaning_tasks SET is_active = 0 WHERE task_id = ?', [taskId]);
    } else {
      await conn.query('UPDATE cleaning_tasks SET next_due_date = ? WHERE task_id = ?', [next, taskId]);
      await conn.query(
        "INSERT INTO cleaning_records (task_id, assignee_user_id, due_date, status) VALUES (?, ?, ?, 'SCHEDULED')",
        [taskId, task.assignee_user_id, next],
      );
    }
    return loadOne(conn, roomId, taskId);
  });
}

const completeTask = (userId, roomId, taskId, body) => closeOccurrence(userId, roomId, taskId, body, 'DONE');
const skipTask = (userId, roomId, taskId, body) => closeOccurrence(userId, roomId, taskId, body, 'SKIPPED');

/** 미루기: 담당자, 방장, 또는 담당자가 없을 때 구성원 누구나 할 수 있다. */
async function postponeTask(userId, roomId, taskId, { dueDate, postponedTo, memo }) {
  return withRoomMember(userId, roomId, async (conn, room) => {
    const task = await findTask(conn, roomId, taskId, { lock: true });
    assertActive(task);
    assertFresh(task, dueDate);
    const allowed = task.assignee_user_id === null || task.assignee_user_id === userId || room.owner_user_id === userId;
    if (!allowed) {
      throw new AppError(403, 'NOT_TASK_ASSIGNEE', '담당자나 방장만 청소를 미룰 수 있습니다.');
    }
    if (postponedTo <= task.next_due_date) {
      throw new AppError(400, 'INVALID_POSTPONE_DATE', '미룰 날짜는 현재 예정일보다 뒤여야 합니다.');
    }
    if (postponedTo < (await today(conn))) {
      throw new AppError(400, 'INVALID_POSTPONE_DATE', '미룰 날짜는 오늘이나 그 이후여야 합니다.');
    }

    const recordId = await ensureCurrentRecord(conn, task);
    await conn.query(
      "UPDATE cleaning_records SET status = 'POSTPONED', postponed_to = ?, memo = ? WHERE record_id = ?",
      [postponedTo, memo ?? null, recordId],
    );
    await conn.query('UPDATE cleaning_tasks SET next_due_date = ? WHERE task_id = ?', [postponedTo, taskId]);
    await conn.query(
      "INSERT INTO cleaning_records (task_id, assignee_user_id, due_date, status) VALUES (?, ?, ?, 'SCHEDULED')",
      [taskId, task.assignee_user_id, postponedTo],
    );
    return loadOne(conn, roomId, taskId);
  });
}

async function listRecords(userId, roomId, taskId, q) {
  await loadRoom(pool, userId, roomId);
  await findTask(pool, roomId, taskId);
  const [rows] = await pool.query(
    `SELECT record_id, assignee_user_id, completed_by, due_date, status, completed_at, postponed_to, memo, created_at
       FROM cleaning_records WHERE task_id = ? ORDER BY due_date DESC, record_id DESC LIMIT ?`,
    [taskId, q.limit],
  );
  const labels = await memberLabels(pool, roomId, rows.flatMap((r) => [r.assignee_user_id, r.completed_by]));
  return rows.map((r) => ({
    recordId: r.record_id,
    dueDate: r.due_date,
    status: r.status,
    assignee: r.assignee_user_id ? labels.get(r.assignee_user_id) || null : null,
    completedBy: r.completed_by ? labels.get(r.completed_by) || null : null,
    completedAt: r.completed_at,
    postponedTo: r.postponed_to,
    memo: r.memo,
    createdAt: r.created_at,
  }));
}

module.exports = {
  createTask, listTasks, getTask, updateTask, deleteTask,
  completeTask, skipTask, postponeTask, listRecords,
};
