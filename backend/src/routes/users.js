const express = require('express');
const { z } = require('zod');
const schemas = require('../utils/schemas');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler } = require('../utils/errors');
const c = require('../controllers/userController');

const router = express.Router();

router.use(requireAuth);

router.get('/me', asyncHandler(c.getMe));
router.patch('/me', validate(schemas.updateMe), asyncHandler(c.updateMe));
router.patch('/me/password', validate(schemas.changePassword), asyncHandler(c.changePassword));
const notificationSettings = z.object({
  itemExpiry: z.boolean().optional(),
  cleaning: z.boolean().optional(),
  schedule: z.boolean().optional(),
  expense: z.boolean().optional(),
}).strict();

// 알림 종류별 푸시 설정 (끄면 폰 푸시만 오지 않고, 앱 안 알림 목록에는 계속 쌓인다.)
router.get('/me/notification-settings', asyncHandler(c.getNotificationSettings));
router.patch('/me/notification-settings', validate(notificationSettings), asyncHandler(c.updateNotificationSettings));
// 프로필 사진: 앱이 정사각형 JPEG로 줄여서 본문에 그대로 올린다. (1MB 이하)
router.put('/me/photo', express.raw({ type: 'image/jpeg', limit: '1mb' }), asyncHandler(c.setPhoto));
router.delete('/me/photo', asyncHandler(c.removePhoto));
router.patch('/me/photo-visibility', validate(z.object({ photoPublic: z.boolean() }).strict()), asyncHandler(c.setPhotoVisibility));
router.get('/:userId/photo', validate(schemas.userIdParam, 'params'), asyncHandler(c.getPhoto));
// 회원 탈퇴: 비밀번호 확인 + 방에 속해 있다면 공용 물품 처리 방법(sharedItems)
router.delete('/me', validate(z.object({
  password: z.string().min(1, '비밀번호를 입력해 주세요.'),
  sharedItems: z.enum(['TRANSFER', 'DELETE']).optional(),
}).strict()), asyncHandler(c.withdraw));
router.patch('/me/account', validate(schemas.changeAccount), asyncHandler(c.changeAccount));

module.exports = router;
