const express = require('express');
const schemas = require('../utils/schemas');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler: h } = require('../utils/errors');
const c = require('../controllers/notificationController');

const router = express.Router();
const params = validate(schemas.idParam, 'params');

router.use(requireAuth);

router.get('/', validate(schemas.listNotifications, 'query'), h(c.list));
router.get('/unread-count', h(c.unreadCount));
router.post('/read-all', h(c.markAllRead));
router.delete('/read', h(c.removeAllRead));
router.patch('/:notificationId/read', params, h(c.markRead));
router.delete('/:notificationId', params, h(c.remove));

module.exports = router;
