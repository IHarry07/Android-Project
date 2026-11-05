const { pool } = require('../config/db');
const { AppError } = require('../utils/errors');

/**
 * 앱 내부 알림
 *  - 알림은 서버가 만들어 notifications 테이블에 저장하고, 앱이 조회해서 보여준다.
 *  - 같은 회원에게 같은 dedupe_key는 한 번만 들어간다. 스케줄러가 여러 번 돌거나 서버가 여러 대여도 중복되지 않는다.
 *  - 알림 대상(물품, 일정 등)이 삭제되면 그 알림도 함께 지운다.
 */

/** rows: { userId, roomId, type, title, body, targetType, targetId, dedupeKey }[] */
async function createNotifications(db, rows) {
  if (rows.length === 0) return 0;
  // 이미 있는 알림을 먼저 걸러낸다. 이렇게 해야 새로 만든 개수를 정확히 알 수 있다.
  const [existing] = await db.query(
    'SELECT user_id, dedupe_key FROM notifications WHERE (user_id, dedupe_key) IN (?)',
    [rows.map((r) => [r.userId, r.dedupeKey])],
  );
  const seen = new Set(existing.map((e) => `${e.user_id}|${e.dedupe_key}`));
  const fresh = rows.filter((r) => !seen.has(`${r.userId}|${r.dedupeKey}`));
  if (fresh.length === 0) return 0;

  const values = fresh.map((r) => [
    r.userId, r.roomId, r.type, r.title, r.body, r.targetType ?? null, r.targetId ?? null, r.dedupeKey,
  ]);
  // 걸러낸 뒤 다른 곳에서 먼저 만들었다면 중복 키일 때만 건너뛴다. (INSERT IGNORE는 다른 오류까지 숨기므로 쓰지 않는다.)
  await db.query(
    `INSERT INTO notifications (user_id, room_id, type, title, body, target_type, target_id, dedupe_key)
     VALUES ?
     ON DUPLICATE KEY UPDATE notification_id = notification_id`,
    [values],
  );
  return fresh.length;
}

/** 대상이 삭제될 때 그 대상을 가리키는 알림을 지운다. */
async function deleteByTarget(db, targetType, targetId) {
  await db.query('DELETE FROM notifications WHERE target_type = ? AND target_id = ?', [targetType, targetId]);
}

const won = (n) => `${Number(n).toLocaleString('ko-KR')}원`;

/** 지출에서 내가 낼 분담금이 생겼을 때, 결제자를 뺀 분담자에게 알린다. */
async function notifyExpenseShares(conn, { roomId, expenseId, title, payerId, shares }) {
  // 분담을 다시 정한 경우를 위해 이전 분담 알림은 지우고 새로 만든다.
  await conn.query("DELETE FROM notifications WHERE type = 'EXPENSE_SHARE' AND target_type = 'EXPENSE' AND target_id = ?", [expenseId]);
  const [payer] = await conn.query('SELECT nickname FROM users WHERE user_id = ?', [payerId]);
  const rows = shares
    .filter((s) => s.userId !== payerId && s.amount > 0)
    .map((s) => ({
      userId: s.userId,
      roomId,
      type: 'EXPENSE_SHARE',
      title: '새 분담금이 생겼어요',
      body: `${payer[0].nickname}님이 '${title}' 지출에서 ${won(s.amount)}을 분담하도록 지정했어요`,
      targetType: 'EXPENSE',
      targetId: expenseId,
      dedupeKey: `EXPENSE_SHARE:${expenseId}:${s.userId}`,
    }));
  return createNotifications(conn, rows);
}

/** 결제자가 정산 완료를 표시하거나 취소하면 분담한 사람에게 알린다. */
async function notifySettlement(conn, { roomId, expenseId, title, amount, debtorId, isSettled }) {
  return createNotifications(conn, [{
    userId: debtorId,
    roomId,
    type: 'EXPENSE_SETTLED',
    title: isSettled ? '정산이 완료로 표시됐어요' : '정산 완료가 취소됐어요',
    body: `'${title}' ${won(amount)}`,
    targetType: 'EXPENSE',
    targetId: expenseId,
    // 표시와 취소를 여러 번 해도 그때마다 알림이 가도록 시각을 키에 넣는다.
    dedupeKey: `EXPENSE_SETTLED:${expenseId}:${debtorId}:${Date.now()}`,
  }]);
}

function format(r) {
  return {
    notificationId: r.notification_id,
    roomId: r.room_id,
    type: r.type,
    title: r.title,
    body: r.body,
    target: r.target_type ? { type: r.target_type, id: r.target_id } : null,
    isRead: Boolean(r.is_read),
    readAt: r.read_at,
    createdAt: r.created_at,
  };
}

async function countUnread(userId) {
  const [rows] = await pool.query('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0', [userId]);
  return rows[0].n;
}

/** 최신순 목록. beforeId를 주면 그 번호보다 오래된 것부터 limit개를 돌려준다. */
async function list(userId, { filter, limit, beforeId }) {
  const where = ['user_id = ?'];
  const params = [userId];
  if (filter === 'unread') where.push('is_read = 0');
  if (filter === 'read') where.push('is_read = 1');
  if (beforeId) { where.push('notification_id < ?'); params.push(beforeId); }
  const [rows] = await pool.query(
    `SELECT notification_id, room_id, type, title, body, target_type, target_id, is_read, read_at, created_at
       FROM notifications WHERE ${where.join(' AND ')} ORDER BY notification_id DESC LIMIT ?`,
    [...params, limit + 1],
  );
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).map(format);
  return {
    notifications: page,
    unreadCount: await countUnread(userId),
    nextBeforeId: hasMore ? page[page.length - 1].notificationId : null,
  };
}

async function ensureMine(userId, notificationId) {
  const [rows] = await pool.query('SELECT 1 FROM notifications WHERE notification_id = ? AND user_id = ?', [notificationId, userId]);
  if (rows.length === 0) throw new AppError(404, 'NOTIFICATION_NOT_FOUND', '알림을 찾을 수 없습니다.');
}

async function markRead(userId, notificationId) {
  await ensureMine(userId, notificationId);
  await pool.query(
    'UPDATE notifications SET is_read = 1, read_at = COALESCE(read_at, NOW()) WHERE notification_id = ? AND user_id = ?',
    [notificationId, userId],
  );
  return { unreadCount: await countUnread(userId) };
}

async function markAllRead(userId) {
  const [result] = await pool.query(
    'UPDATE notifications SET is_read = 1, read_at = NOW() WHERE user_id = ? AND is_read = 0',
    [userId],
  );
  return { updated: result.affectedRows, unreadCount: 0 };
}

async function remove(userId, notificationId) {
  await ensureMine(userId, notificationId);
  await pool.query('DELETE FROM notifications WHERE notification_id = ? AND user_id = ?', [notificationId, userId]);
}

async function removeAllRead(userId) {
  const [result] = await pool.query('DELETE FROM notifications WHERE user_id = ? AND is_read = 1', [userId]);
  return { deleted: result.affectedRows };
}

module.exports = {
  createNotifications,
  deleteByTarget,
  notifyExpenseShares,
  notifySettlement,
  list,
  countUnread,
  markRead,
  markAllRead,
  remove,
  removeAllRead,
};
