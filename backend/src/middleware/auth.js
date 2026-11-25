const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { AppError, asyncHandler } = require('../utils/errors');
const { signToken, verifyToken, passwordVersion } = require('../services/tokenService');

const EXPIRED_MESSAGE = '보안상의 이유로 로그인이 해제되었습니다. 다시 로그인해 주세요.';

/**
 * Authorization: Bearer <토큰> 을 검사하고 req.auth = { userId, keep } 를 채운다.
 *
 * 오류 코드
 *  - AUTH_REQUIRED : 토큰 없음 (앱은 로그인 화면으로)
 *  - TOKEN_EXPIRED : 만료 (앱은 "보안상의 이유로 로그인이 해제되었습니다" 팝업 후 로그인 화면으로)
 *  - TOKEN_INVALID : 위조·손상·비밀번호 변경·탈퇴 등 (팝업 없이 로그인 화면으로)
 *
 * 로그인 유지를 체크하지 않은 토큰이면, 응답 헤더 X-Refreshed-Token 으로
 * 새 토큰(다시 1시간)을 내려준다. 앱은 이 값을 받으면 저장된 토큰을 교체해야 한다.
 */
const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new AppError(401, 'AUTH_REQUIRED', '로그인이 필요합니다.');
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError(401, 'TOKEN_EXPIRED', EXPIRED_MESSAGE);
    }
    throw new AppError(401, 'TOKEN_INVALID', '인증 정보가 올바르지 않습니다.');
  }

  const userId = Number(payload.sub);
  const [rows] = await pool.query('SELECT user_id, password_hash FROM users WHERE user_id = ?', [userId]);
  const user = rows[0];
  if (!user || passwordVersion(user.password_hash) !== payload.pv) {
    throw new AppError(401, 'TOKEN_INVALID', '인증 정보가 올바르지 않습니다.');
  }

  req.auth = { userId, keep: Boolean(payload.keep), passwordHash: user.password_hash };

  if (!req.auth.keep) {
    res.setHeader(
      'X-Refreshed-Token',
      signToken({ userId, keep: false, passwordHash: user.password_hash }),
    );
  }
  next();
});

module.exports = { requireAuth };
