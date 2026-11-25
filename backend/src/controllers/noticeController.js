const notices = require('../services/noticeService');

module.exports = {
  async list(req, res) { res.json({ notices: await notices.list(req.query) }); },
  async get(req, res) { res.json({ notice: await notices.get(req.params.noticeId) }); },
};