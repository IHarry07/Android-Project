const express = require('express');
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
router.patch('/me/account', validate(schemas.changeAccount), asyncHandler(c.changeAccount));

module.exports = router;
