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

// 같은 IP의 시도 횟수 제한. (아이디별 제한은 서비스에서 따로 한다.)
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, message: tooMany, skip: () => env.isTest });
const signupLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, message: tooMany, skip: () => env.isTest });
const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, message: tooMany, skip: () => env.isTest });
// 이메일 인증번호는 아무 주소로나 메일을 보내게 할 수 있어서 따로 제한한다.
const emailLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, message: tooMany, skip: () => env.isTest });
// 아이디·닉네임 중복확인으로 가입자 목록을 대량으로 알아내지 못하게 한다.
const checkLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, message: tooMany, skip: () => env.isTest });

router.post('/signup', signupLimiter, validate(schemas.signup), asyncHandler(c.signup));
router.post('/login', loginLimiter, validate(schemas.login), asyncHandler(c.login));
router.post('/logout', asyncHandler(c.logout));

// 이메일 인증 (가입할 때, 이메일을 바꿀 때)
router.post('/email/send', emailLimiter, validate(schemas.sendEmailCode), asyncHandler(c.sendEmailCode));
router.post('/email/verify', emailLimiter, validate(schemas.verifyEmailCode), asyncHandler(c.verifyEmailCode));

// 비밀번호 찾기: 아이디·이메일로 인증번호 → 확인 토큰 → 새 비밀번호 (이메일로만 찾을 수 있다)
router.post('/reset-password/email/send', resetLimiter, validate(schemas.sendResetCode), asyncHandler(c.sendResetCode));
router.post('/reset-password/email/verify', resetLimiter, validate(schemas.verifyResetCode), asyncHandler(c.verifyResetCode));
router.post('/reset-password', resetLimiter, validate(schemas.resetPassword), asyncHandler(c.resetPassword));

router.get('/check-login-id', checkLimiter, validate(schemas.checkLoginId, 'query'), asyncHandler(c.checkLoginId));
router.get('/check-nickname', checkLimiter, validate(schemas.checkNickname, 'query'), asyncHandler(c.checkNickname));

module.exports = router;