const express = require('express');
const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const schemas = require('../utils/schemas');
const { validate } = require('../middleware/validate');
const { asyncHandler } = require('../utils/errors');
const c = require('../controllers/authController');

const router = express.Router();

const tooMany = {
  error: { code: 'TOO_MANY_REQUESTS', message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
};

// 비밀번호 대입 공격을 늦추기 위해 같은 IP의 로그인 시도를 제한한다.
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, message: tooMany, skip: () => env.isTest });
const signupLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, message: tooMany, skip: () => env.isTest });

// 가입 정보를 대입해 보는 공격을 늦추기 위해 같은 IP의 비밀번호 찾기 시도를 제한한다. (아이디별 제한은 서비스에서 따로 한다.)
const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, message: tooMany, skip: () => env.isTest });

router.post('/signup', signupLimiter, validate(schemas.signup), asyncHandler(c.signup));
router.post('/login', loginLimiter, validate(schemas.login), asyncHandler(c.login));
// 비밀번호 찾기: 1단계 가입 정보 확인 → 확인 토큰, 2단계 확인 토큰으로 새 비밀번호
router.post('/reset-password/verify', resetLimiter, validate(schemas.verifyIdentity), asyncHandler(c.verifyIdentity));
router.post('/reset-password/email/send', resetLimiter, validate(schemas.sendResetCode), asyncHandler(c.sendResetCode));
router.post('/reset-password/email/verify', resetLimiter, validate(schemas.verifyResetCode), asyncHandler(c.verifyResetCode));
router.post('/reset-password', resetLimiter, validate(schemas.resetPassword), asyncHandler(c.resetPassword));
router.post('/logout', c.logout);
router.get('/check-login-id', validate(schemas.checkLoginId, 'query'), asyncHandler(c.checkLoginId));
router.get('/check-nickname', validate(schemas.checkNickname, 'query'), asyncHandler(c.checkNickname));

module.exports = router;
