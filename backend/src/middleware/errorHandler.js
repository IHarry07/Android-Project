const { AppError } = require('../utils/errors');

function notFound(req, res, next) {
  next(new AppError(404, 'NOT_FOUND', '요청한 경로를 찾을 수 없습니다.'));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    const body = { code: err.code, message: err.message };
    if (err.details) body.details = err.details;
    return res.status(err.status).json({ error: body });
  }

  // 잘못된 JSON 본문
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: '요청 본문이 올바른 JSON이 아닙니다.' } });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: '요청이 너무 큽니다.' } });
  }

  // 그 밖의 오류는 내용을 클라이언트에 노출하지 않는다.
  console.error('[서버 오류]', err);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: '서버에 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.' } });
}

module.exports = { notFound, errorHandler };
