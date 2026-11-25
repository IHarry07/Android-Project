const express = require('express');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler: h } = require('../utils/errors');
const c = require('../controllers/inquiryController');

const router = express.Router();

router.use(requireAuth);

const createInquiry = z.object({
  title: z.string({ error: '제목을 입력해 주세요.' }).trim().min(1, '제목을 입력해 주세요.').max(100, '제목은 100자 이하여야 합니다.'),
  content: z.string({ error: '내용을 입력해 주세요.' }).trim().min(1, '내용을 입력해 주세요.').max(2000, '내용은 2000자 이하여야 합니다.'),
});

router.post('/', validate(createInquiry), h(c.create));
router.get('/', h(c.list));
router.get('/:inquiryId', validate(z.object({ inquiryId: z.coerce.number().int().positive() }), 'params'), h(c.get));

module.exports = router;