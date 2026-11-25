const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const env = require('../config/env');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler } = require('../utils/errors');
const { lookupProductName } = require('../services/productLookup');

const router = express.Router();

router.use(requireAuth);

// 서버가 외부 사이트에 접속하는 기능이라 호출 횟수를 제한한다.
const lookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' } },
  skip: () => env.isTest,
});

const lookupQuery = z.object({
  url: z.string({ error: 'QR 주소가 필요합니다.' }).trim().min(1, 'QR 주소가 필요합니다.').max(500, 'QR 주소가 너무 깁니다.'),
});

// GET /api/products/lookup?url=<QR 주소>  →  { productName }
router.get('/lookup', lookupLimiter, validate(lookupQuery, 'query'), asyncHandler(async (req, res) => {
  res.json({ productName: await lookupProductName(req.query.url) });
}));

module.exports = router;
