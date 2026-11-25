const { pool } = require('../config/db');
const { AppError } = require('../utils/errors');
const { addDays, nextDueDate, nextWeekday, weekdayOf } = require('../utils/dates');
const { loadRoom, withRoomMember, currentMemberIds, memberLabels } = require('./roomAccess');
const notifications = require('./notificationService');

/**
 * 청소 규칙
 *  - 청소 항목 하나(cleaning_tasks)에는 항상 "다음 예정일"이 있고, 그 날짜의 SCHEDULED 기록이 하나 있다.
 *  - 완료·건너뜀: 그 기록을 마감하고 다음 예정일의 SCHEDULED 기록을 만든다.
 *    반복이 없으면(NONE) 항목이 비활성이 된다.
 *  - 미루기: 그 기록을 POSTPONED로 마감하고 미룬 날짜의 SCHEDULED 기록을 만든다.
 *    한 회차는 최대 1번만 미룰 수 있고(미룬 날짜로 옮겨진 회차는 다시 미룰 수 없다), 현재 예정일에서 최대 7일까지만 미룰 수 있다.
 *    완료·건너뛰어서 다음 회차로 넘어가면 그 회차는 다시 1번 미룰 수 있다.
 *  - 완료와 건너뜀은 그 회차의 담당자만 할 수 있다. (방장도 마찬가지. 담당자가 없는 청소는 누구나 가능)
 *    미루기는 담당자·방장(담당자가 없으면 누구나)이 할 수 있다.
 *  - 완료·건너뜀·미루기는 모두 항목 행을 잠근 상태에서 처리한다. 요청에 dueDate를 같이 보내면,
 *    화면에 보이던 예정일이 이미 바뀐 경우 STALE_DUE_DATE로 거절해서 같은 청소가 두 번 처리되지 않는다.
 *  - 항목을 만들고 고치는 것은 방 구성원 누구나 할 수 있다. 완전히 삭제하는 것은 방장만 할 수 있다.
 *  - 순번 순환: rotation_enabled인 항목은 완료·건너뜀 뒤 다음 회차의 담당자가 cleaning_rotation 순번대로
 *    다음 사람으로 넘어간다. (미루기는 담당자를 바꾸지 않는다.) 순번에는 현재 구성원만 쓴다.
 *  - 담당자 바꾸기(reassignTask): 방 구성원 누구나 할 수 있고 바꿀 때마다 이력(cleaning_assignee_changes)이 남는다.
 *    이번 회차만 대신(ONCE)하면 회차가 끝날 때 원래 담당자(순환이면 그 다음 사람)로 돌아가고, 앞으로 계속(ALWAYS)이면 그대로다.
 *    청소 항목 수정(PATCH)이나 청소당번 설정에서 담당자를 바꿔도 같은 이력이 남는다.
 *  - 청소당번 설정(saveSettings): 반복 주기, 순환 여부, 구성원별 담당 구역·요일을 한 번에 저장한다.
 *    설정에서 빠진 항목은 삭제하지 않고 비활성으로 둔다. (청소 이력을 남기기 위해)
 */

const TASK_NOT_FOUND = () => new AppError(404, 'TASK_NOT_FOUND', '청소 항목을 찾을 수 없습니다.');

// 한 번에 미룰 수 있는 최대 기간(일). 현재 예정일부터 센다.
const MAX_POSTPONE_DAYS = 7;

async function today(db) {
  const [rows] = await db.query('SELECT CURDATE() AS d');
  return rows[0].d;
}

async function findTask(db, roomId, taskId, { lock = false } = {}) {
  const [rows] = await db.query(
    `SELECT task_id, room_id, assignee_user_id, base_assignee_user_id, area_name, next_due_date, repeat_type, repeat_interval,
            rotation_enabled, is_active, created_at, updated_at
       FROM cleaning_tasks WHERE task_id = ? AND room_id = ?${lock ? ' FOR UPDATE' : ''}`,
    [taskId, roomId],
  );
  if (!rows[0]) throw TASK_NOT_FOUND();
  return rows[0];
}

async function formatTasks(db, roomId, tasks, todayStr) {
  const labels = await memberLabels(
    db, roomId, tasks.flatMap((t) => [t.assignee_user_id, t.base_assignee_user_id]),
  );

  // 이미 미뤄서 지금 예정일이 된 항목은 다시 미룰 수 없다. (미룬 기록의 postponed_to가 지금 예정일과 같은 항목)
  let postponed = new Set();
  if (tasks.length > 0) {
    const [rows] = await db.query(
      "SELECT task_id, postponed_to FROM cleaning_records WHERE task_id IN (?) AND status = 'POSTPONED'",
      [tasks.map((t) => t.task_id)],
    );
    postponed = new Set(rows.map((r) => `${r.task_id}:${r.postponed_to}`));
  }

  return tasks.map((t) => ({
    taskId: t.task_id,
    roomId: t.room_id,
    areaName: t.area_name,
    assignee: t.assignee_user_id ? labels.get(t.assignee_user_id) || null : null,
    // 이번 회차만 다른 사람이 대신하는 경우: 원래 담당자. 다음 회차에는 원래 담당자(순환이면 그 다음 사람)로 돌아간다.
    isSubstitute: t.base_assignee_user_id !== null && t.base_assignee_user_id !== t.assignee_user_id,
    baseAssignee: t.base_assignee_user_id ? labels.get(t.base_assignee_user_id) || null : null,
    nextDueDate: t.next_due_date,
    repeatType: t.repeat_type,
    repeatInterval: t.repeat_interval,
    rotationEnabled: Boolean(t.rotation_enabled),
    isActive: Boolean(t.is_active),
    // 이번 회차를 이미 한 번 미뤘는지, 미룰 수 있다면 언제까지 미룰 수 있는지
    isPostponed: postponed.has(`${t.task_id}:${t.next_due_date}`),
    postponeUntil: addDays(t.next_due_date, MAX_POSTPONE_DAYS),
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
    `SELECT task_id, room_id, assignee_user_id, base_assignee_user_id, area_name, next_due_date, repeat_type, repeat_interval,
            rotation_enabled, is_active, created_at, updated_at
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
    // 담당자를 바꾸면 이력을 남기고, 이번 회차만 대신하던 상태는 풀린다. (앞으로 계속 바뀐 것으로 본다.)
    const assigneeChanged = body.assigneeUserId !== undefined && body.assigneeUserId !== task.assignee_user_id;
    if (body.assigneeUserId !== undefined) set('assignee_user_id', body.assigneeUserId);
    if (assigneeChanged) set('base_assignee_user_id', null);
    if (body.nextDueDate !== undefined) set('next_due_date', body.nextDueDate);
    if (body.repeatType !== undefined) set('repeat_type', body.repeatType);
    if (body.repeatInterval !== undefined) set('repeat_interval', body.repeatInterval);
    if (body.isActive !== undefined) set('is_active', body.isActive ? 1 : 0);
    await conn.query(`UPDATE cleaning_tasks SET ${columns.join(', ')} WHERE task_id = ?`, [...values, taskId]);
    if (assigneeChanged) {
      await recordAssigneeChange(conn, {
        roomId, areaName: body.areaName ?? task.area_name, taskId, dueDate: task.next_due_date,
        from: task.assignee_user_id, to: body.assigneeUserId, by: userId, scope: 'ALWAYS',
      });
    }

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

/**
 * 순번에서 current 다음 사람을 돌려준다. 맨 끝이면 처음으로 돌아간다.
 * 순번에는 현재 구성원만 쓴다. current가 순번에 없으면(나갔거나 담당자가 없으면) 첫 번째 사람.
 * 순번에 사람이 둘보다 적으면 담당자를 바꾸지 않는다.
 */
async function rotateAssignee(conn, roomId, current) {
  const [rows] = await conn.query(
    `SELECT c.user_id
       FROM cleaning_rotation c JOIN room_members m ON m.room_id = c.room_id AND m.user_id = c.user_id
      WHERE c.room_id = ? ORDER BY c.position`,
    [roomId],
  );
  const order = rows.map((r) => r.user_id);
  if (order.length < 2) return current;
  const index = order.indexOf(current);
  return index === -1 ? order[0] : order[(index + 1) % order.length];
}

/**
 * 담당자를 바꾼 기록을 남기고, 관련된 사람에게 알린다. scope: ONCE(이번 회차만) / ALWAYS(앞으로 계속)
 * 알림은 새 담당자와 원래 담당자에게 간다. 바꾼 본인은 이미 알고 있으므로 받지 않는다.
 */
async function recordAssigneeChange(conn, { roomId, areaName, taskId, dueDate, from, to, by, scope, reason, restored = false }) {
  const [result] = await conn.query(
    `INSERT INTO cleaning_assignee_changes (task_id, due_date, from_user_id, to_user_id, changed_by, scope, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [taskId, dueDate, from ?? null, to ?? null, by, scope, reason ?? null],
  );
  const changeId = result.insertId;

  const labels = await memberLabels(conn, roomId, [by, from, to]);
  const nick = (id) => (id ? labels.get(id)?.nickname ?? '구성원' : '구성원');
  const isMember = (id) => id && labels.get(id)?.status === 'MEMBER';
  const when = scope === 'ONCE' ? '이번 회차만' : '앞으로';

  const rows = [];
  const add = (userId, title, body) => rows.push({
    userId, roomId, type: 'CLEANING_REASSIGNED', title, body,
    targetType: 'CLEANING_TASK', targetId: taskId,
    dedupeKey: `CLEANING_REASSIGNED:${changeId}:${userId}`,
  });

  if (restored) {
    // 이번 회차만 대신하던 것을 원래 담당자에게 되돌린 경우. "대신하게 됐어요"가 아니라 "다시 맡아요"로 알린다.
    if (isMember(to) && to !== by) {
      add(to, '청소 담당으로 돌아왔어요',
        `'${areaName}' 청소를 이번 회차에 다시 맡게 됐어요 (${nick(by)}님이 바꿨어요)`);
    }
    if (isMember(from) && from !== by && from !== to) {
      add(from, '청소 담당에서 빠졌어요',
        `'${areaName}' 청소는 이번 회차에 원래 담당자 ${nick(to)}님이 다시 맡아요 (${nick(by)}님이 바꿨어요)`);
    }
  } else {
    if (isMember(to) && to !== by) {
      add(to, '청소 담당이 되었어요',
        `'${areaName}' 청소를 ${when} ${scope === 'ONCE' ? '대신하게' : '맡게'} 됐어요 (${nick(by)}님이 바꿨어요)`);
    }
    if (isMember(from) && from !== by && from !== to) {
      add(from, '청소 담당에서 빠졌어요',
        `'${areaName}' 청소는 ${when} ${nick(to)}님이 ${scope === 'ONCE' ? '대신해요' : '맡아요'} (${nick(by)}님이 바꿨어요)`);
    }
  }
  await notifications.createNotifications(conn, rows);
  return changeId;
}

/**
 * 담당자 바꾸기. 방 구성원 누구나 할 수 있고, 바꿀 때마다 이력이 남는다.
 *  - scope ONCE  : 이번 회차만 다른 사람이 대신한다. 회차가 끝나면 원래 담당자(순환이면 그 다음 사람)로 돌아간다.
 *  - scope ALWAYS: 앞으로 계속 새 담당자다. (순환이면 새 담당자부터 순번이 이어진다.)
 * dueDate를 같이 보내면, 화면에 보이던 예정일이 이미 바뀐 경우 STALE_DUE_DATE로 거절한다.
 */
async function reassignTask(userId, roomId, taskId, { assigneeUserId, scope, reason, dueDate }) {
  return withRoomMember(userId, roomId, async (conn) => {
    const task = await findTask(conn, roomId, taskId, { lock: true });
    assertActive(task);
    assertFresh(task, dueDate);
    await assertAssigneeIsMember(conn, roomId, assigneeUserId);
    if (assigneeUserId === task.assignee_user_id) {
      throw new AppError(400, 'SAME_ASSIGNEE', '이미 그 사람이 담당자예요.');
    }

    // 이번만 대신하는 경우에 되돌아갈 원래 담당자. 이미 누가 대신하고 있었다면 그 원래 담당자를 그대로 쓴다.
    const original = task.base_assignee_user_id ?? task.assignee_user_id;
    const base = scope === 'ONCE' && assigneeUserId !== original ? original : null;

    await conn.query(
      'UPDATE cleaning_tasks SET assignee_user_id = ?, base_assignee_user_id = ? WHERE task_id = ?',
      [assigneeUserId, base, taskId],
    );
    const recordId = await ensureCurrentRecord(conn, task);
    await conn.query('UPDATE cleaning_records SET assignee_user_id = ? WHERE record_id = ?', [assigneeUserId, recordId]);

    await recordAssigneeChange(conn, {
      roomId, areaName: task.area_name, taskId, dueDate: task.next_due_date,
      from: task.assignee_user_id, to: assigneeUserId, by: userId, scope, reason,
      // 누가 이번만 대신하던 중에 원래 담당자에게 "이번만" 되돌리면 대신하기가 풀린 것이다.
      restored: scope === 'ONCE' && task.base_assignee_user_id != null && assigneeUserId === original,
    });
    return loadOne(conn, roomId, taskId);
  });
}

/** 완료 또는 건너뜀. 현재 회차를 마감하고 다음 회차를 만든다. */
async function closeOccurrence(userId, roomId, taskId, { dueDate, memo }, outcome) {
  return withRoomMember(userId, roomId, async (conn) => {
    const task = await findTask(conn, roomId, taskId, { lock: true });
    assertActive(task);

    // 완료와 건너뛰기는 그 회차의 담당자만 할 수 있다. (방장이어도 담당자가 아니면 할 수 없다. 담당자가 없는 청소는 누구나 가능.)
    // 다른 사람이 대신 청소하려면 먼저 "담당자 바꾸기(이번 회차만)"로 담당자를 바꿔야 한다.
    if (task.assignee_user_id !== null && task.assignee_user_id !== userId) {
      throw new AppError(
        403, 'NOT_TASK_ASSIGNEE',
        outcome === 'DONE'
          ? '담당자만 청소를 완료할 수 있습니다. 다른 사람이 대신하려면 담당자를 바꿔 주세요.'
          : '담당자만 청소를 건너뛸 수 있습니다. 다른 사람이 대신하려면 담당자를 바꿔 주세요.',
      );
    }
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
      // 이번 회차만 대신하던 사람이 있었다면, 다음 회차는 원래 담당자를 기준으로 한다.
      // (원래 담당자가 방을 나갔다면 지금 담당자를 기준으로 한다.)
      const members = await currentMemberIds(conn, roomId);
      const origin = task.base_assignee_user_id !== null && members.has(task.base_assignee_user_id)
        ? task.base_assignee_user_id
        : task.assignee_user_id;
      // 순환하는 항목은 다음 회차의 담당자가 순번대로 다음 사람으로 넘어간다.
      const nextAssignee = task.rotation_enabled ? await rotateAssignee(conn, roomId, origin) : origin;
      await conn.query(
        'UPDATE cleaning_tasks SET next_due_date = ?, assignee_user_id = ?, base_assignee_user_id = NULL WHERE task_id = ?',
        [next, nextAssignee, taskId],
      );
      await conn.query(
        "INSERT INTO cleaning_records (task_id, assignee_user_id, due_date, status) VALUES (?, ?, ?, 'SCHEDULED')",
        [taskId, nextAssignee, next],
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
    // 이미 한 번 미룬 회차는 다시 미룰 수 없다.
    const [already] = await conn.query(
      "SELECT 1 FROM cleaning_records WHERE task_id = ? AND status = 'POSTPONED' AND postponed_to = ? LIMIT 1",
      [task.task_id, task.next_due_date],
    );
    if (already.length > 0) {
      throw new AppError(409, 'ALREADY_POSTPONED', '이미 한 번 미룬 청소는 다시 미룰 수 없습니다.');
    }
    if (postponedTo <= task.next_due_date) {
      throw new AppError(400, 'INVALID_POSTPONE_DATE', '미룰 날짜는 현재 예정일보다 뒤여야 합니다.');
    }
    if (postponedTo > addDays(task.next_due_date, MAX_POSTPONE_DAYS)) {
      throw new AppError(400, 'POSTPONE_TOO_LONG', `청소는 예정일에서 최대 ${MAX_POSTPONE_DAYS}일(${addDays(task.next_due_date, MAX_POSTPONE_DAYS)}까지)만 미룰 수 있습니다.`, {
        latestDate: addDays(task.next_due_date, MAX_POSTPONE_DAYS),
      });
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

/**
 * 방 전체(또는 한 청소)의 이력. 완료·건너뜀·미룸 기록과 담당자 변경 기록을 한 목록으로 돌려준다.
 * 정렬은 예정일(어느 회차인지)이 최근인 것부터이고, 같은 회차 안에서는 나중에 일어난 일이 먼저 나온다.
 * (건너뜀·미룸 기록에는 처리한 시각이 따로 없어서 시각이 아닌 회차 기준으로 정렬한다.)
 *  type: DONE / SKIPPED / POSTPONED / REASSIGNED
 */
async function listHistory(userId, roomId, q) {
  await loadRoom(pool, userId, roomId);
  const taskFilter = q.taskId ? ' AND t.task_id = ?' : '';
  const params = q.taskId ? [roomId, q.taskId, q.limit] : [roomId, q.limit];

  const [records] = await pool.query(
    `SELECT r.record_id, r.task_id, t.area_name, r.due_date, r.status, r.assignee_user_id, r.completed_by,
            r.postponed_to, r.memo
       FROM cleaning_records r JOIN cleaning_tasks t ON t.task_id = r.task_id
      WHERE t.room_id = ? AND r.status <> 'SCHEDULED'${taskFilter}
      ORDER BY r.due_date DESC, r.record_id DESC LIMIT ?`,
    params,
  );
  const [changes] = await pool.query(
    `SELECT c.change_id, c.task_id, t.area_name, c.due_date, c.from_user_id, c.to_user_id, c.changed_by,
            c.scope, c.reason
       FROM cleaning_assignee_changes c JOIN cleaning_tasks t ON t.task_id = c.task_id
      WHERE t.room_id = ?${taskFilter}
      ORDER BY c.change_id DESC LIMIT ?`,
    params,
  );

  const labels = await memberLabels(pool, roomId, [
    ...records.flatMap((r) => [r.assignee_user_id, r.completed_by]),
    ...changes.flatMap((c) => [c.from_user_id, c.to_user_id, c.changed_by]),
  ]);
  const who = (id) => (id ? labels.get(id) || null : null);

  const events = [
    ...records.map((r) => ({
      type: r.status,
      taskId: r.task_id,
      areaName: r.area_name,
      dueDate: r.due_date,
      assignee: who(r.assignee_user_id),
      completedBy: who(r.completed_by),
      postponedTo: r.postponed_to,
      memo: r.memo,
      order: 1,
      id: r.record_id,
    })),
    ...changes.map((c) => ({
      type: 'REASSIGNED',
      taskId: c.task_id,
      areaName: c.area_name,
      dueDate: c.due_date,
      fromAssignee: who(c.from_user_id),
      toAssignee: who(c.to_user_id),
      changedBy: who(c.changed_by),
      scope: c.scope,
      memo: c.reason,
      order: 0,
      id: c.change_id,
    })),
  ];

  // 예정일 최근순 → 같은 회차에서는 처리 기록(1)이 담당자 변경(0)보다 나중 일이라 먼저 → 번호 큰 것 먼저
  events.sort((a, b) => (a.dueDate < b.dueDate ? 1 : a.dueDate > b.dueDate ? -1 : 0) || b.order - a.order || b.id - a.id);
  return events.slice(0, q.limit).map(({ order, id, ...event }) => event);
}

// ---------------------------------------------------------------------
// 청소당번 설정 (구성원별 담당 구역·요일, 반복 주기, 순번 순환)
// ---------------------------------------------------------------------

// 화면의 반복 주기 → 저장 값. (격주 = 2주마다)
// DAILY(매일)는 요일과 상관없이 오늘부터, NONE(한 번만)은 반복 없이 그 요일 한 번만 하고 끝난다.
const REPEATS = {
  DAILY: { type: 'DAILY', interval: 1 },
  WEEKLY: { type: 'WEEKLY', interval: 1 },
  BIWEEKLY: { type: 'WEEKLY', interval: 2 },
  MONTHLY: { type: 'MONTHLY', interval: 1 },
  NONE: { type: 'NONE', interval: 1 },
};

function repeatOf(task) {
  if (task.repeat_type === 'DAILY') return 'DAILY';
  if (task.repeat_type === 'NONE') return 'NONE';
  if (task.repeat_type === 'MONTHLY') return 'MONTHLY';
  if (task.repeat_type === 'WEEKLY' && task.repeat_interval === 2) return 'BIWEEKLY';
  return 'WEEKLY';
}

async function loadSettings(db, roomId) {
  const [tasks] = await db.query(
    `SELECT task_id, assignee_user_id, area_name, next_due_date, repeat_type, repeat_interval, rotation_enabled
       FROM cleaning_tasks WHERE room_id = ? AND is_active = 1 ORDER BY task_id`,
    [roomId],
  );
  const [order] = await db.query(
    `SELECT c.user_id FROM cleaning_rotation c
       JOIN room_members m ON m.room_id = c.room_id AND m.user_id = c.user_id
      WHERE c.room_id = ? ORDER BY c.position`,
    [roomId],
  );
  const position = new Map(order.map((r, i) => [r.user_id, i]));
  // 순번에 없는 담당자(또는 담당자 없음)는 뒤로 보낸다. 같은 사람 안에서는 만든 순서.
  const rank = (t) => (position.has(t.assignee_user_id) ? position.get(t.assignee_user_id) : Number.MAX_SAFE_INTEGER);
  const sorted = [...tasks].sort((a, b) => rank(a) - rank(b) || a.task_id - b.task_id);

  const labels = await memberLabels(db, roomId, [...sorted.map((t) => t.assignee_user_id), ...order.map((r) => r.user_id)]);
  const who = (id) => (id ? labels.get(id) || null : null);

  return {
    repeat: tasks.length ? repeatOf(tasks[0]) : 'WEEKLY',
    rotation: tasks.some((t) => t.rotation_enabled),
    rows: sorted.map((t) => ({
      taskId: t.task_id,
      userId: t.assignee_user_id,
      nickname: who(t.assignee_user_id)?.nickname ?? null,
      areaName: t.area_name,
      weekday: weekdayOf(t.next_due_date),
      nextDueDate: t.next_due_date,
    })),
  };
}

async function getSettings(userId, roomId) {
  await loadRoom(pool, userId, roomId);
  return loadSettings(pool, roomId);
}

/**
 * 설정을 한 번에 저장한다. rows 순서가 순번이다. (같은 사람이 여러 줄이면 처음 나온 자리가 그 사람의 순번)
 *  - taskId가 있는 줄: 그 항목을 고친다. 요일이 바뀌었을 때만 다음 예정일을 다시 정한다.
 *  - taskId가 없는 줄: 새 항목을 만든다. 다음 예정일은 오늘을 포함해 가장 가까운 그 요일.
 *  - 줄에 없는 기존 항목은 비활성으로 바꾼다.
 */
async function saveSettings(userId, roomId, { repeat, rotation, rows }) {
  return withRoomMember(userId, roomId, async (conn) => {
    const members = await currentMemberIds(conn, roomId);
    for (const row of rows) {
      if (!members.has(row.userId)) {
        throw new AppError(400, 'ASSIGNEE_NOT_MEMBER', '담당자는 방 구성원이어야 합니다.');
      }
    }

    const [existing] = await conn.query(
      'SELECT task_id FROM cleaning_tasks WHERE room_id = ? FOR UPDATE',
      [roomId],
    );
    const known = new Set(existing.map((t) => t.task_id));
    const kept = new Set();
    for (const row of rows) {
      if (row.taskId === undefined) continue;
      if (!known.has(row.taskId)) throw TASK_NOT_FOUND();
      if (kept.has(row.taskId)) {
        throw new AppError(400, 'VALIDATION_ERROR', '같은 청소 항목이 두 번 들어 있습니다.');
      }
      kept.add(row.taskId);
    }

    const todayStr = await today(conn);
    const { type, interval } = REPEATS[repeat];
    const rotationFlag = rotation ? 1 : 0;
    const daily = repeat === 'DAILY';

    for (const row of rows) {
      if (row.taskId === undefined) {
        const [result] = await conn.query(
          `INSERT INTO cleaning_tasks
             (room_id, assignee_user_id, area_name, next_due_date, repeat_type, repeat_interval, rotation_enabled)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [roomId, row.userId, row.areaName, daily ? todayStr : nextWeekday(todayStr, row.weekday), type, interval, rotationFlag],
        );
        await ensureCurrentRecord(conn, await findTask(conn, roomId, result.insertId));
        continue;
      }

      const before = await findTask(conn, roomId, row.taskId, { lock: true });
      // 요일이 그대로이고 아직 지나지 않은 예정일은 유지한다. (진행 중인 주기를 흐트러뜨리지 않는다.)
      // 매일 반복은 요일이 의미 없으므로 지나지 않은 예정일이면 그대로 둔다.
      const keepDue = before.next_due_date >= todayStr && (daily || weekdayOf(before.next_due_date) === row.weekday);
      const dueDate = keepDue ? before.next_due_date : (daily ? todayStr : nextWeekday(todayStr, row.weekday));

      // 담당자가 바뀌었다면 이력을 남기고, 이번 회차만 대신하던 상태는 풀린다. (앞으로 계속 바뀐 것으로 본다.)
      const assigneeChanged = before.assignee_user_id !== row.userId;

      await conn.query(
        `UPDATE cleaning_tasks
            SET assignee_user_id = ?, area_name = ?, next_due_date = ?, repeat_type = ?, repeat_interval = ?,
                rotation_enabled = ?, is_active = 1${assigneeChanged ? ', base_assignee_user_id = NULL' : ''}
          WHERE task_id = ?`,
        [row.userId, row.areaName, dueDate, type, interval, rotationFlag, row.taskId],
      );
      if (assigneeChanged) {
        await recordAssigneeChange(conn, {
          roomId, areaName: row.areaName, taskId: row.taskId, dueDate: before.next_due_date,
          from: before.assignee_user_id, to: row.userId, by: userId, scope: 'ALWAYS', reason: '청소당번 설정에서 변경',
        });
      }

      // 예정된 회차가 항목의 날짜·담당자와 어긋나지 않도록 맞춘다. (updateTask와 같은 방식)
      const recordId = await ensureCurrentRecord(conn, before);
      await conn.query(
        'UPDATE cleaning_records SET due_date = ?, assignee_user_id = ? WHERE record_id = ?',
        [dueDate, row.userId, recordId],
      );
    }

    // 줄에 없는 항목은 비활성으로. 이력(cleaning_records)은 그대로 남는다.
    const removed = existing.map((t) => t.task_id).filter((id) => !kept.has(id));
    if (removed.length > 0) {
      await conn.query('UPDATE cleaning_tasks SET is_active = 0 WHERE task_id IN (?)', [removed]);
    }

    // 순번: rows에 처음 나온 순서대로
    const order = [...new Set(rows.map((r) => r.userId))];
    await conn.query('DELETE FROM cleaning_rotation WHERE room_id = ?', [roomId]);
    for (let i = 0; i < order.length; i += 1) {
      await conn.query(
        'INSERT INTO cleaning_rotation (room_id, user_id, position) VALUES (?, ?, ?)',
        [roomId, order[i], i + 1],
      );
    }

    return loadSettings(conn, roomId);
  });
}

module.exports = {
  createTask, listTasks, getTask, updateTask, deleteTask,
  completeTask, skipTask, postponeTask, reassignTask, listRecords, listHistory,
  getSettings, saveSettings,
};
