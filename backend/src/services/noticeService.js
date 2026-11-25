const { pool } = require('../config/db');
const { AppError } = require('../utils/errors');

/**
 * 서비스 공지사항. 운영자가 scripts/notice.js 로 등록하고, 앱에서는 읽기만 한다.
 * 고정(is_pinned)한 공지는 목록 맨 위에 나온다.
 */

const format = (r, withBody) => ({
  noticeId: r.notice_id,
  title: r.title,
  isPinned: Boolean(r.is_pinned),
  createdAt: r.created_at,
  ...(withBody ? { body: r.body } : {}),
});

async function list({ limit, beforeId }) {
  const params = [];
  let where = '';
  if (beforeId) { where = 'WHERE notice_id < ?'; params.push(beforeId); }
  const [rows] = await pool.query(
    `SELECT notice_id, title, is_pinned, created_at FROM notices ${where}
      ORDER BY is_pinned DESC, notice_id DESC LIMIT ?`,
    [...params, limit],
  );
  return rows.map((r) => format(r, false));
}

async function get(noticeId) {
  const [rows] = await pool.query('SELECT * FROM notices WHERE notice_id = ?', [noticeId]);
  if (!rows[0]) throw new AppError(404, 'NOTICE_NOT_FOUND', '공지사항을 찾을 수 없습니다.');
  return format(rows[0], true);
}

module.exports = { list, get };