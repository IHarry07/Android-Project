const express = require('express');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler: h } = require('../utils/errors');
const push = require('../services/pushService');

const router = express.Router();
const body = validate(z.object({ token: z.string().min(20).max(512) }), 'body');

// 로그인한 기기의 푸시 토큰을 등록한다. 같은 토큰이 다른 회원으로 등록돼 있으면 지금 회원으로 옮긴다.
router.post('/', requireAuth, body, h(async (req, res) => {
  await push.registerDevice(req.auth.userId, req.body.token);
  res.status(204).end();
}));

// 로그아웃·세션 만료 때 호출한다. 로그인이 풀린 뒤에도 쓸 수 있어 인증을 요구하지 않는다.
router.delete('/', body, h(async (req, res) => {
  await push.unregisterDevice(req.body.token);
  res.status(204).end();
}));

module.exports = router;