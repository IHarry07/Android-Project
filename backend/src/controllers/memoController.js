const memos = require('../services/memoService');

const ids = (req) => [req.auth.userId, req.params.roomId];

module.exports = {
  async list(req, res) { res.json({ memos: await memos.listMemos(...ids(req), req.query) }); },
  async get(req, res) { res.json({ memo: await memos.getMemo(...ids(req), req.params.memoId) }); },
  async create(req, res) { res.status(201).json({ memo: await memos.createMemo(...ids(req), req.body) }); },
  async update(req, res) { res.json({ memo: await memos.updateMemo(...ids(req), req.params.memoId, req.body) }); },
  async remove(req, res) { await memos.deleteMemo(...ids(req), req.params.memoId); res.status(204).end(); },
};