const { pool } = require('../config/db');
const { AppError } = require('../utils/errors');
const { loadRoom, withRoomMember } = require('./roomAccess');

/**
 * 물품 규칙
 *  - 방 구성원은 개인 물품도 포함해 모든 물품을 볼 수 있다. (누구 것인지 알려는 것이 목적)
 *  - 개인 물품은 등록한 사람만 고치거나 지울 수 있다.
 *  - 공용 물품은 방 구성원 누구나 고치거나 지울 수 있다. 소유 구분 변경은 등록한 사람만 할 수 있다.
 */

const SELECT_ITEM = `
  SELECT i.item_id, i.room_id, i.name, i.category, i.ownership_type, i.quantity, i.unit,
         i.expiry_date, i.barcode, i.storage_location, i.status, i.created_at, i.updated_at,
         i.created_by, u.nickname AS owner_nickname,
         DATEDIFF(i.expiry_date, CURDATE()) AS days_until_expiry
    FROM items i JOIN users u ON u.user_id = i.created_by`;

function formatItem(r) {
  return {
    itemId: r.item_id,
    roomId: r.room_id,
    name: r.name,
    category: r.category,
    ownershipType: r.ownership_type,
    ownerUserId: r.created_by,
    ownerNickname: r.owner_nickname,
    quantity: Number(r.quantity),
    unit: r.unit,
    expiryDate: r.expiry_date,
    daysUntilExpiry: r.days_until_expiry,
    barcode: r.barcode,
    storageLocation: r.storage_location,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const ITEM_NOT_FOUND = () => new AppError(404, 'ITEM_NOT_FOUND', '물품을 찾을 수 없습니다.');

async function findItem(db, roomId, itemId, { lock = false } = {}) {
  const [rows] = await db.query(`${SELECT_ITEM} WHERE i.item_id = ? AND i.room_id = ?${lock ? ' FOR UPDATE' : ''}`, [itemId, roomId]);
  if (!rows[0]) throw ITEM_NOT_FOUND();
  return rows[0];
}

function assertCanModify(item, userId) {
  if (item.ownership_type === 'PERSONAL' && item.created_by !== userId) {
    throw new AppError(403, 'NOT_ITEM_OWNER', '개인 물품은 등록한 사람만 수정하거나 삭제할 수 있습니다.');
  }
}

async function createItem(userId, roomId, body) {
  return withRoomMember(userId, roomId, async (conn) => {
    const [result] = await conn.query(
      `INSERT INTO items
         (room_id, created_by, name, category, ownership_type, quantity, unit, expiry_date, barcode, storage_location)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        roomId, userId, body.name, body.category, body.ownershipType, body.quantity,
        body.unit ?? null, body.expiryDate ?? null, body.barcode ?? null, body.storageLocation ?? null,
      ],
    );
    return formatItem(await findItem(conn, roomId, result.insertId));
  });
}

async function listItems(userId, roomId, q) {
  await loadRoom(pool, userId, roomId);
  const where = ['i.room_id = ?'];
  const params = [roomId];
  if (q.scope === 'mine') { where.push('i.created_by = ?'); params.push(userId); }
  if (q.scope === 'shared') where.push("i.ownership_type = 'SHARED'");
  if (q.status !== 'ALL') { where.push('i.status = ?'); params.push(q.status); }
  if (q.category) { where.push('i.category = ?'); params.push(q.category); }
  if (q.expiringWithinDays !== undefined) {
    // 이미 지난 물품도 포함한다. 유통기한이 없는 물품은 제외한다.
    where.push('i.expiry_date IS NOT NULL AND i.expiry_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)');
    params.push(q.expiringWithinDays);
  }
  if (q.search) {
    where.push('i.name LIKE ?');
    params.push(`%${q.search.replace(/[\\%_]/g, '\\$&')}%`);
  }
  const [rows] = await pool.query(
    `${SELECT_ITEM} WHERE ${where.join(' AND ')}
      ORDER BY i.expiry_date IS NULL, i.expiry_date, i.item_id LIMIT ?`,
    [...params, q.limit],
  );
  return rows.map(formatItem);
}

async function getItem(userId, roomId, itemId) {
  await loadRoom(pool, userId, roomId);
  return formatItem(await findItem(pool, roomId, itemId));
}

async function updateItem(userId, roomId, itemId, body) {
  return withRoomMember(userId, roomId, async (conn) => {
    const item = await findItem(conn, roomId, itemId, { lock: true });
    assertCanModify(item, userId);
    if (body.ownershipType !== undefined && item.created_by !== userId) {
      throw new AppError(403, 'NOT_ITEM_OWNER', '소유 구분은 등록한 사람만 바꿀 수 있습니다.');
    }

    const columns = [];
    const values = [];
    const set = (col, val) => { columns.push(`${col} = ?`); values.push(val); };
    if (body.name !== undefined) set('name', body.name);
    if (body.category !== undefined) set('category', body.category);
    if (body.ownershipType !== undefined) set('ownership_type', body.ownershipType);
    if (body.quantity !== undefined) set('quantity', body.quantity);
    if (body.unit !== undefined) set('unit', body.unit);
    if (body.expiryDate !== undefined) set('expiry_date', body.expiryDate);
    if (body.barcode !== undefined) set('barcode', body.barcode);
    if (body.storageLocation !== undefined) set('storage_location', body.storageLocation);
    if (body.status !== undefined) set('status', body.status);
    await conn.query(`UPDATE items SET ${columns.join(', ')} WHERE item_id = ?`, [...values, itemId]);
    return formatItem(await findItem(conn, roomId, itemId));
  });
}

/**
 * 수량을 늘리거나 줄인다. 여러 명이 동시에 호출해도 값이 틀어지지 않도록
 * 읽고 쓰는 대신 한 번의 UPDATE로 계산한다. 0 미만이 되는 요청은 거절한다.
 * 수량이 0이 되면 USED_UP, 0에서 다시 늘면 STORED로 바뀐다. 폐기된 물품은 상태를 유지한다.
 */
async function adjustQuantity(userId, roomId, itemId, delta) {
  return withRoomMember(userId, roomId, async (conn) => {
    const item = await findItem(conn, roomId, itemId, { lock: true });
    assertCanModify(item, userId);
    const [result] = await conn.query(
      `UPDATE items
          SET quantity = quantity + ?,
              status = CASE
                         WHEN quantity <= 0 THEN 'USED_UP'
                         WHEN status = 'USED_UP' THEN 'STORED'
                         ELSE status
                       END
        WHERE item_id = ? AND quantity + ? >= 0`,
      [delta, itemId, delta],
    );
    if (result.affectedRows === 0) {
      throw new AppError(409, 'INSUFFICIENT_QUANTITY', '남은 수량보다 많이 줄일 수 없습니다.');
    }
    return formatItem(await findItem(conn, roomId, itemId));
  });
}

async function deleteItem(userId, roomId, itemId) {
  await withRoomMember(userId, roomId, async (conn) => {
    const item = await findItem(conn, roomId, itemId, { lock: true });
    assertCanModify(item, userId);
    await conn.query('DELETE FROM items WHERE item_id = ?', [itemId]);
  });
}

module.exports = { createItem, listItems, getItem, updateItem, adjustQuantity, deleteItem };
