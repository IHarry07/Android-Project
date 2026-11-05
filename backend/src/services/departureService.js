const { AppError } = require('../utils/errors');

/**
 * 방을 나가거나 내보내질 때의 데이터 정리.
 * 반드시 호출하는 쪽의 트랜잭션 안에서 실행하고, 방 행을 FOR UPDATE로 잠근 뒤에 호출한다.
 *
 * 정리 규칙
 *  - 개인 물품            : 삭제
 *  - 공용 물품            : 방장에게 넘기기(TRANSFER) 또는 삭제(DELETE)
 *  - 일정                 : 삭제
 *  - 청소 항목 담당자     : 비움. 항목은 방 전체의 규칙이라 남긴다.
 *  - 예정된 청소 회차     : 담당자를 비움. 완료·미룸·건너뜀 이력은 그대로 둔다.
 *  - 지출·분담 기록       : 그대로 둔다. 방의 정산 기록이기 때문이다.
 *  - 퇴장 기록            : room_departures에 LEFT 또는 KICKED로 남긴다.
 */

/** 정산이 안 끝났고 상대가 아직 방에 있는 건수. 나가려는 사람에게 해당하는 것만 센다. */
async function countUnsettled(conn, roomId, userId) {
  const [owes] = await conn.query(
    `SELECT COUNT(*) AS n
       FROM expense_shares s
       JOIN expenses e ON e.expense_id = s.expense_id
       JOIN room_members payer ON payer.room_id = e.room_id AND payer.user_id = e.paid_by
      WHERE e.room_id = ? AND s.user_id = ? AND s.is_settled = 0 AND e.paid_by <> s.user_id`,
    [roomId, userId],
  );
  const [owed] = await conn.query(
    `SELECT COUNT(*) AS n
       FROM expense_shares s
       JOIN expenses e ON e.expense_id = s.expense_id
       JOIN room_members debtor ON debtor.room_id = e.room_id AND debtor.user_id = s.user_id
      WHERE e.room_id = ? AND e.paid_by = ? AND s.is_settled = 0 AND s.user_id <> e.paid_by`,
    [roomId, userId],
  );
  return { owes: owes[0].n, owed: owed[0].n };
}

async function countSharedItems(conn, roomId, userId) {
  const [rows] = await conn.query(
    "SELECT COUNT(*) AS n FROM items WHERE room_id = ? AND created_by = ? AND ownership_type = 'SHARED'",
    [roomId, userId],
  );
  return rows[0].n;
}

/**
 * 스스로 나갈 때: 미정산이 있으면 막고, 공용 물품이 있으면 처리 방법을 고르게 한다.
 * 선택값이 없으면 SHARED_ITEMS_CHOICE_REQUIRED로 되묻는다.
 */
async function assertCanLeave(conn, roomId, userId, sharedItemsChoice) {
  const unsettled = await countUnsettled(conn, roomId, userId);
  if (unsettled.owes + unsettled.owed > 0) {
    throw new AppError(409, 'UNSETTLED_EXPENSES',
      '정산이 끝나지 않은 지출이 있어서 나갈 수 없습니다. 정산을 마친 뒤에 다시 시도해 주세요.',
      unsettled);
  }
  const sharedCount = await countSharedItems(conn, roomId, userId);
  if (sharedCount > 0 && !sharedItemsChoice) {
    throw new AppError(409, 'SHARED_ITEMS_CHOICE_REQUIRED',
      '내가 등록한 공용 물품을 방장에게 넘길지 삭제할지 선택해 주세요.',
      { sharedItemCount: sharedCount, choices: ['TRANSFER', 'DELETE'] });
  }
}

async function purgeMemberData(conn, { roomId, userId, ownerUserId, sharedItems, reason }) {
  await conn.query("DELETE FROM items WHERE room_id = ? AND created_by = ? AND ownership_type = 'PERSONAL'", [roomId, userId]);
  if (sharedItems === 'DELETE') {
    await conn.query("DELETE FROM items WHERE room_id = ? AND created_by = ? AND ownership_type = 'SHARED'", [roomId, userId]);
  } else {
    await conn.query(
      "UPDATE items SET created_by = ? WHERE room_id = ? AND created_by = ? AND ownership_type = 'SHARED'",
      [ownerUserId, roomId, userId],
    );
  }

  await conn.query('DELETE FROM schedules WHERE room_id = ? AND user_id = ?', [roomId, userId]);

  await conn.query('UPDATE cleaning_tasks SET assignee_user_id = NULL WHERE room_id = ? AND assignee_user_id = ?', [roomId, userId]);
  await conn.query(
    `UPDATE cleaning_records r JOIN cleaning_tasks t ON t.task_id = r.task_id
        SET r.assignee_user_id = NULL
      WHERE t.room_id = ? AND r.assignee_user_id = ? AND r.status = 'SCHEDULED'`,
    [roomId, userId],
  );

  await conn.query('INSERT INTO room_departures (room_id, user_id, reason) VALUES (?, ?, ?)', [roomId, userId, reason]);
  await conn.query('DELETE FROM room_members WHERE room_id = ? AND user_id = ?', [roomId, userId]);
}

module.exports = { countUnsettled, countSharedItems, assertCanLeave, purgeMemberData };
