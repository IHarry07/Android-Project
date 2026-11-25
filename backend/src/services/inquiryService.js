const { pool } = require('../config/db');
const { AppError } = require('../utils/errors');

/**
 * 고객센터 문의: 회원이 제목과 내용을 남기면 운영자가 서버 PC의 scripts/inquiry.js 로 답변한다.
 *  - 회원은 자기 문의와 답변만 볼 수 있다.
 *  - 도배를 막으려고 하루(24시간)에 10건까지만 남길 수 있다.
 *  - 회원이 탈퇴하면 그 회원의 문의는 삭제된다.
 */

const DAILY_LIMIT = 10;

const format = (r) => ({
  inquiryId: r.inquiry_id,
  title: r.title,
  content: r.content,
  status: r.status,
  answer: r.answer,
  answeredAt: r.answered_at,
  createdAt: r.created_at,
});

async function create(userId, { title, content }) {
  const [[{ n }]] = await pool.query(
    'SELECT COUNT(*) AS n FROM inquiries WHERE user_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)',
    [userId],
  );
  if (n >= DAILY_LIMIT) {
    throw new AppError(429, 'TOO_MANY_INQUIRIES', `문의는 하루에 ${DAILY_LIMIT}건까지 남길 수 있어요. 내일 다시 남겨 주세요.`);
  }
  const [result] = await pool.query('INSERT INTO inquiries (user_id, title, content) VALUES (?, ?, ?)', [userId, title, content]);
  return get(userId, result.insertId);
}

async function list(userId) {
  const [rows] = await pool.query('SELECT * FROM inquiries WHERE user_id = ? ORDER BY inquiry_id DESC LIMIT 100', [userId]);
  return rows.map(format);
}

async function get(userId, inquiryId) {
  const [rows] = await pool.query('SELECT * FROM inquiries WHERE inquiry_id = ? AND user_id = ?', [inquiryId, userId]);
  if (!rows[0]) throw new AppError(404, 'INQUIRY_NOT_FOUND', '문의를 찾을 수 없습니다.');
  return format(rows[0]);
}

module.exports = { create, list, get };