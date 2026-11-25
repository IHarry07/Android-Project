const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { pool } = require('../config/db');
const { AppError, asyncHandler } = require('../utils/errors');
const { signToken, verifyToken, passwordVersion } = require('../services/tokenService');
const { createCounter } = require('../services/userRateLimit');

const EXPIRED_MESSAGE = '보안상의 이유로 로그인이 해제되었습니다. 다시 로그인해 주세요.';
const userHit = createCounter(env.userRateLimitPerMinute);

/**
 * 토큰을 확인해서 { userId, keep, sid, passwordHash } 를 돌려준다. 올바르지 않으면 AppError.
 * 로그아웃 처리에서도 쓰려고 미들웨어와 따로 둔다.
 */
async function authenticate(token) {
  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError(401, 'TOKEN_EXPIRED', EXPIRED_MESSAGE);
    }
    throw new AppError(401, 'TOKEN_INVALID', '인증 정보가 올바르지 않습니다.');
  }

  const invalid = () => new AppError(401, 'TOKEN_INVALID', '인증 정보가 올바르지 않습니다.');
  // 세션 번호가 없는 예전 토큰은 받지 않는다. (보안 작업 이전에 발급된 토큰은 한 번 다시 로그인해야 한다.)
  if (typeof payload.sid !== 'string' || payload.sid.length === 0) throw invalid();

  const userId = Number(payload.sub);
  const [rows] = await pool.query(
    `SELECT u.user_id, u.password_hash,
            EXISTS(SELECT 1 FROM revoked_sessions r WHERE r.sid = ?) AS revoked
       FROM users u WHERE u.user_id = ?`,
    [payload.sid, userId],
  );
  const user = rows[0];
  if (!user || user.revoked || passwordVersion(user.password_hash) !== payload.pv) throw invalid();

  return { userId, keep: Boolean(payload.keep), sid: payload.sid, passwordHash: user.password_hash };
}

function bearer(req) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

/**
 * Authorization: Bearer <토큰> 을 검사하고 req.auth 를 채운다.
 *
 * 오류 코드
 *  - AUTH_REQUIRED     : 토큰 없음 (앱은 로그인 화면으로)
 *  - TOKEN_EXPIRED     : 만료 (앱은 "보안상의 이유로 로그인이 해제되었습니다" 팝업 후 로그인 화면으로)
 *  - TOKEN_INVALID     : 위조·손상·비밀번호 변경·탈퇴·로그아웃한 세션 등 (팝업 없이 로그인 화면으로)
 *  - TOO_MANY_REQUESTS : 1분에 너무 많은 요청 (회원별)
 *
 * 로그인 유지를 체크하지 않은 토큰이면, 응답 헤더 X-Refreshed-Token 으로
 * 새 토큰(다시 1시간, 같은 세션 번호)을 내려준다. 앱은 이 값을 받으면 저장된 토큰을 교체해야 한다.
 */
const requireAuth = asyncHandler(async (req, res, next) => {
  const token = bearer(req);
  if (!token) throw new AppError(401, 'AUTH_REQUIRED', '로그인이 필요합니다.');

  req.auth = await authenticate(token);

  if (!env.isTest && !userHit(req.auth.userId)) {
    throw new AppError(429, 'TOO_MANY_REQUESTS', '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.');
  }

  if (!req.auth.keep) {
    res.setHeader(
      'X-Refreshed-Token',
      signToken({ userId: req.auth.userId, keep: false, passwordHash: req.auth.passwordHash, sid: req.auth.sid }),
    );
  }
  next();
});

module.exports = { requireAuth, authenticate, bearer };