const express = require('express');
const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const schemas = require('../utils/schemas');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler } = require('../utils/errors');
const c = require('../controllers/roomController');

const router = express.Router();

router.use(requireAuth);

// 초대 코드를 무작위로 대입하는 공격을 늦춘다.
const joinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' } },
  skip: () => env.isTest,
});

router.post('/', validate(schemas.createRoom), asyncHandler(c.createRoom));
router.get('/me', asyncHandler(c.getMyRoom));
router.post('/join', joinLimiter, validate(schemas.joinRoom), asyncHandler(c.joinRoom));

router.get('/:roomId', validate(schemas.idParam, 'params'), asyncHandler(c.getRoom));
router.patch('/:roomId', validate(schemas.idParam, 'params'), validate(schemas.updateRoom), asyncHandler(c.updateRoom));
router.get('/:roomId/members', validate(schemas.idParam, 'params'), asyncHandler(c.listMembers));
router.post('/:roomId/invitations', validate(schemas.idParam, 'params'), validate(schemas.newInvite), asyncHandler(c.newInvitation));
router.post('/:roomId/transfer-owner', validate(schemas.idParam, 'params'), validate(schemas.transferOwner), asyncHandler(c.transferOwner));
router.delete('/:roomId/members/me', validate(schemas.idParam, 'params'), validate(schemas.leaveQuery, 'query'), asyncHandler(c.leaveRoom));
router.delete('/:roomId/members/:userId', validate(schemas.idParam, 'params'), asyncHandler(c.removeMember));

// 창고·일정·청소·지출: /api/rooms/:roomId/items, /schedules, /cleaning-tasks, /expenses
// 고정 경로(/me, /join)가 먼저 처리되도록 맨 아래에 둔다.
router.use('/:roomId', require('./roomResources'));

module.exports = router;
