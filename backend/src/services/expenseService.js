const { pool } = require('../config/db');
const { AppError } = require('../utils/errors');
const { loadRoom, withRoomMember, currentMemberIds, memberLabels } = require('./roomAccess');
const notifications = require('./notificationService');

/**
 * 지출 규칙
 *  - 결제자는 항상 기록하는 본인이다.
 *  - 분담은 금액을 직접 정하거나(shares), 사람만 정해 균등하게 나눈다(participantUserIds).
 *    분담 금액의 합은 지출 금액과 같아야 한다.
 *  - 분담자는 모두 현재 방 구성원이어야 한다.
 *  - 결제자 본인의 몫은 낼 필요가 없으므로 처음부터 정산 완료로 저장한다.
 *  - 정산 완료 표시는 돈을 받은 결제자만 할 수 있다.
 *  - 이미 정산된 분담이 있으면 금액·분담 변경과 삭제는 막는다.
 *  - 나간 사람이 결제하거나 분담한 지출은 기록으로 남고, 목록에서 LEFT 또는 KICKED로 표시된다.
 */

function splitEqually(amount, participantUserIds) {
  const unique = [...new Set(participantUserIds)];
  const base = Math.floor(amount / unique.length);
  const remainder = amount - base * unique.length;
  // 나누어떨어지지 않는 1원 단위는 앞에서부터 한 명씩 더 낸다.
  return unique.map((userId, i) => ({ userId, amount: base + (i < remainder ? 1 : 0) }));
}

async function resolveShares(conn, roomId, amount, { shares, participantUserIds }) {
  const list = shares !== undefined ? shares : splitEqually(amount, participantUserIds);
  const ids = list.map((s) => s.userId);
  if (new Set(ids).size !== ids.length) {
    throw new AppError(400, 'DUPLICATE_PARTICIPANT', '같은 사람이 분담 목록에 두 번 들어갈 수 없습니다.');
  }
  const sum = list.reduce((acc, s) => acc + s.amount, 0);
  if (sum !== amount) {
    throw new AppError(400, 'SHARE_SUM_MISMATCH', `분담 금액의 합(${sum}원)이 지출 금액(${amount}원)과 같아야 합니다.`,
      { amount, shareSum: sum });
  }
  const members = await currentMemberIds(conn, roomId);
  const outsiders = ids.filter((id) => !members.has(id));
  if (outsiders.length > 0) {
    throw new AppError(400, 'PARTICIPANT_NOT_MEMBER', '분담자는 모두 방 구성원이어야 합니다.', { userIds: outsiders });
  }
  return list;
}

async function insertShares(conn, expenseId, payerId, list) {
  for (const s of list) {
    const own = s.userId === payerId;
    await conn.query(
      `INSERT INTO expense_shares (expense_id, user_id, share_amount, is_settled, settled_at)
       VALUES (?, ?, ?, ?, ${own ? 'NOW()' : 'NULL'})`,
      [expenseId, s.userId, s.amount, own ? 1 : 0],
    );
  }
}

const EXPENSE_NOT_FOUND = () => new AppError(404, 'EXPENSE_NOT_FOUND', '지출 내역을 찾을 수 없습니다.');

async function findExpense(db, roomId, expenseId, { lock = false } = {}) {
  const [rows] = await db.query(
    `SELECT expense_id, room_id, paid_by, title, amount, expense_date, created_at, updated_at
       FROM expenses WHERE expense_id = ? AND room_id = ?${lock ? ' FOR UPDATE' : ''}`,
    [expenseId, roomId],
  );
  if (!rows[0]) throw EXPENSE_NOT_FOUND();
  return rows[0];
}

/** 지출 행들에 분담과 표시 정보를 붙여 응답 형태로 만든다. */
async function formatExpenses(db, roomId, expenses) {
  if (expenses.length === 0) return [];
  const [shareRows] = await db.query(
    `SELECT share_id, expense_id, user_id, share_amount, is_settled, settled_at
       FROM expense_shares WHERE expense_id IN (?) ORDER BY share_id`,
    [expenses.map((e) => e.expense_id)],
  );
  const labels = await memberLabels(db, roomId, [
    ...expenses.map((e) => e.paid_by),
    ...shareRows.map((s) => s.user_id),
  ]);
  const byExpense = new Map();
  for (const s of shareRows) {
    if (!byExpense.has(s.expense_id)) byExpense.set(s.expense_id, []);
    byExpense.get(s.expense_id).push(s);
  }
  return expenses.map((e) => {
    const shares = (byExpense.get(e.expense_id) || []).map((s) => ({
      user: labels.get(s.user_id),
      amount: Number(s.share_amount),
      isSettled: Boolean(s.is_settled),
      settledAt: s.settled_at,
      isPayer: s.user_id === e.paid_by,
    }));
    return {
      expenseId: e.expense_id,
      roomId: e.room_id,
      title: e.title,
      amount: Number(e.amount),
      expenseDate: e.expense_date,
      payer: labels.get(e.paid_by),
      shares,
      allSettled: shares.every((s) => s.isSettled),
      createdAt: e.created_at,
      updatedAt: e.updated_at,
    };
  });
}

async function loadOne(db, roomId, expenseId) {
  const expense = await findExpense(db, roomId, expenseId);
  return (await formatExpenses(db, roomId, [expense]))[0];
}

async function createExpense(userId, roomId, body) {
  return withRoomMember(userId, roomId, async (conn) => {
    const list = await resolveShares(conn, roomId, body.amount, body);
    const [result] = await conn.query(
      'INSERT INTO expenses (room_id, paid_by, title, amount, expense_date) VALUES (?, ?, ?, ?, ?)',
      [roomId, userId, body.title, body.amount, body.expenseDate],
    );
    await insertShares(conn, result.insertId, userId, list);
    await notifications.notifyExpenseShares(conn, {
      roomId, expenseId: result.insertId, title: body.title, payerId: userId, shares: list,
    });
    return loadOne(conn, roomId, result.insertId);
  });
}

async function listExpenses(userId, roomId, q) {
  await loadRoom(pool, userId, roomId);
  const where = ['room_id = ?'];
  const params = [roomId];
  if (q.from) { where.push('expense_date >= ?'); params.push(q.from); }
  if (q.to) { where.push('expense_date <= ?'); params.push(q.to); }
  const [rows] = await pool.query(
    `SELECT expense_id, room_id, paid_by, title, amount, expense_date, created_at, updated_at
       FROM expenses WHERE ${where.join(' AND ')} ORDER BY expense_date DESC, expense_id DESC LIMIT ?`,
    [...params, q.limit],
  );
  return formatExpenses(pool, roomId, rows);
}

async function getExpense(userId, roomId, expenseId) {
  await loadRoom(pool, userId, roomId);
  return loadOne(pool, roomId, expenseId);
}

function assertPayer(expense, userId) {
  if (expense.paid_by !== userId) {
    throw new AppError(403, 'NOT_EXPENSE_PAYER', '결제한 사람만 할 수 있는 작업입니다.');
  }
}

async function assertNothingSettled(conn, expenseId) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS n FROM expense_shares s JOIN expenses e ON e.expense_id = s.expense_id
      WHERE s.expense_id = ? AND s.user_id <> e.paid_by AND s.is_settled = 1`,
    [expenseId],
  );
  if (rows[0].n > 0) {
    throw new AppError(409, 'EXPENSE_HAS_SETTLEMENTS',
      '이미 정산된 분담이 있어서 금액·분담을 바꾸거나 삭제할 수 없습니다. 정산 완료를 먼저 취소해 주세요.');
  }
}

async function updateExpense(userId, roomId, expenseId, body) {
  return withRoomMember(userId, roomId, async (conn) => {
    const expense = await findExpense(conn, roomId, expenseId, { lock: true });
    assertPayer(expense, userId);

    const changesMoney = body.amount !== undefined || body.shares !== undefined || body.participantUserIds !== undefined;
    if (changesMoney) {
      await assertNothingSettled(conn, expenseId);
      const amount = body.amount ?? Number(expense.amount);
      let list;
      if (body.shares !== undefined || body.participantUserIds !== undefined) {
        list = await resolveShares(conn, roomId, amount, body);
      } else {
        // 금액만 바꿨다면 기존 분담자들로 다시 균등하게 나눈다.
        const [current] = await conn.query('SELECT user_id FROM expense_shares WHERE expense_id = ? ORDER BY share_id', [expenseId]);
        list = await resolveShares(conn, roomId, amount, { participantUserIds: current.map((r) => r.user_id) });
      }
      await conn.query('DELETE FROM expense_shares WHERE expense_id = ?', [expenseId]);
      await insertShares(conn, expenseId, userId, list);
      await conn.query('UPDATE expenses SET amount = ? WHERE expense_id = ?', [amount, expenseId]);
      await notifications.notifyExpenseShares(conn, {
        roomId, expenseId, title: body.title ?? expense.title, payerId: userId, shares: list,
      });
    }
    if (body.title !== undefined) await conn.query('UPDATE expenses SET title = ? WHERE expense_id = ?', [body.title, expenseId]);
    if (body.expenseDate !== undefined) await conn.query('UPDATE expenses SET expense_date = ? WHERE expense_id = ?', [body.expenseDate, expenseId]);
    return loadOne(conn, roomId, expenseId);
  });
}

async function deleteExpense(userId, roomId, expenseId) {
  await withRoomMember(userId, roomId, async (conn) => {
    const expense = await findExpense(conn, roomId, expenseId, { lock: true });
    assertPayer(expense, userId);
    await assertNothingSettled(conn, expenseId);
    await notifications.deleteByTarget(conn, 'EXPENSE', expenseId);
    await conn.query('DELETE FROM expenses WHERE expense_id = ?', [expenseId]);
  });
}

/** 돈을 받은 결제자가 특정 사람의 분담을 정산 완료(또는 취소)로 표시한다. 이미 나간 사람의 분담도 처리할 수 있다. */
async function settleShare(userId, roomId, expenseId, targetUserId, isSettled) {
  return withRoomMember(userId, roomId, async (conn) => {
    const expense = await findExpense(conn, roomId, expenseId, { lock: true });
    assertPayer(expense, userId);
    if (targetUserId === expense.paid_by) {
      throw new AppError(400, 'INVALID_TARGET', '결제자 본인의 몫은 정산 대상이 아닙니다.');
    }
    const [result] = await conn.query(
      `UPDATE expense_shares SET is_settled = ?, settled_at = ${isSettled ? 'NOW()' : 'NULL'}
        WHERE expense_id = ? AND user_id = ?`,
      [isSettled ? 1 : 0, expenseId, targetUserId],
    );
    if (result.affectedRows === 0) throw new AppError(404, 'SHARE_NOT_FOUND', '해당 분담 내역을 찾을 수 없습니다.');

    // 아직 방에 있는 사람에게만 알린다.
    const members = await currentMemberIds(conn, roomId);
    if (members.has(targetUserId)) {
      const [share] = await conn.query('SELECT share_amount FROM expense_shares WHERE expense_id = ? AND user_id = ?', [expenseId, targetUserId]);
      await notifications.notifySettlement(conn, {
        roomId, expenseId, title: expense.title, amount: share[0].share_amount, debtorId: targetUserId, isSettled,
      });
    }
    return loadOne(conn, roomId, expenseId);
  });
}

/**
 * 나와 다른 사람 사이의 미정산 금액을 사람별로 합산한다.
 * amount > 0 이면 상대가 나에게 줄 돈, amount < 0 이면 내가 상대에게 줄 돈이다.
 * 이미 나간 사람과의 금액도 보여준다. 나간 사람에게 받을 돈은 결제자가 정산 완료로 정리할 수 있다.
 */
async function getBalances(userId, roomId) {
  await loadRoom(pool, userId, roomId);
  const [rows] = await pool.query(
    `SELECT IF(e.paid_by = ?, s.user_id, e.paid_by) AS other_id,
            SUM(IF(e.paid_by = ?, s.share_amount, -s.share_amount)) AS net
       FROM expense_shares s JOIN expenses e ON e.expense_id = s.expense_id
      WHERE e.room_id = ? AND s.is_settled = 0 AND s.user_id <> e.paid_by
        AND (e.paid_by = ? OR s.user_id = ?)
      GROUP BY other_id`,
    [userId, userId, roomId, userId, userId],
  );
  const labels = await memberLabels(pool, roomId, rows.map((r) => r.other_id));
  const balances = rows
    .map((r) => ({ user: labels.get(r.other_id), amount: Number(r.net) }))
    .filter((b) => b.amount !== 0)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  return {
    balances,
    totalToReceive: balances.filter((b) => b.amount > 0).reduce((a, b) => a + b.amount, 0),
    totalToPay: balances.filter((b) => b.amount < 0).reduce((a, b) => a - b.amount, 0),
  };
}

module.exports = {
  createExpense, listExpenses, getExpense, updateExpense, deleteExpense, settleShare, getBalances,
};
