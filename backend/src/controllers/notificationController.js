const notifications = require('../services/notificationService');

module.exports = {
  async list(req, res) { res.json(await notifications.list(req.auth.userId, req.query)); },
  async unreadCount(req, res) { res.json({ unreadCount: await notifications.countUnread(req.auth.userId) }); },
  async markRead(req, res) { res.json(await notifications.markRead(req.auth.userId, req.params.notificationId)); },
  async markAllRead(req, res) { res.json(await notifications.markAllRead(req.auth.userId)); },
  async remove(req, res) { await notifications.remove(req.auth.userId, req.params.notificationId); res.status(204).end(); },
  async removeAllRead(req, res) { res.json(await notifications.removeAllRead(req.auth.userId)); },
};
