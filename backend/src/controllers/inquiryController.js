const inquiries = require('../services/inquiryService');

module.exports = {
  async create(req, res) { res.status(201).json({ inquiry: await inquiries.create(req.auth.userId, req.body) }); },
  async list(req, res) { res.json({ inquiries: await inquiries.list(req.auth.userId) }); },
  async get(req, res) { res.json({ inquiry: await inquiries.get(req.auth.userId, req.params.inquiryId) }); },
};