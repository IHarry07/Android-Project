/**
 * 전화번호에서 숫자만 뽑아 010-1234-5678 형태로 맞춘다.
 * 형식이 맞지 않으면 null을 돌려준다.
 */
function normalizePhone(input) {
  const digits = String(input).replace(/\D/g, '');
  if (!/^01[016789]\d{7,8}$/.test(digits)) return null;
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

module.exports = { normalizePhone };
