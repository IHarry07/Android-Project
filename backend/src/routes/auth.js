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

router.post('/signup', signupLimiter, validate(schemas.signup), asyncHandler(c.signup));
router.post('/login', loginLimiter, validate(schemas.login), asyncHandler(c.login));
router.post('/logout', c.logout);
router.get('/check-login-id', validate(schemas.checkLoginId, 'query'), asyncHandler(c.checkLoginId));
router.get('/check-nickname', validate(schemas.checkNickname, 'query'), asyncHandler(c.checkNickname));

module.exports = router;
