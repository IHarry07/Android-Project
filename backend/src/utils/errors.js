/** 클라이언트에 그대로 보여줘도 되는 오류. status, code, message를 응답에 담는다. */
class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** async 라우트 핸들러의 오류를 오류 처리기로 넘긴다. */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/** MySQL 중복 키 오류에서 어떤 UNIQUE 키인지 알아낸다. */
function duplicateKey(err) {
  if (err && err.code === 'ER_DUP_ENTRY') {
    return err.sqlMessage || err.message || '';
  }
  return null;
}

module.exports = { AppError, asyncHandler, duplicateKey };
