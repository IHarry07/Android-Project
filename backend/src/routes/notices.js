const express = require('express');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler: h } = require('../utils/errors');
const c = require('../controllers/noticeController');

const router = express.Router();

router.use(requireAuth);

router.get('/', validate(z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  beforeId: z.coerce.number().int().positive().optional(),
}), 'query'), h(c.list));
router.get('/:noticeId', validate(z.object({ noticeId: z.coerce.number().int().positive() }), 'params'), h(c.get));

module.exports = router;