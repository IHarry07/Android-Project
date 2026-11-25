const items = require('../services/itemService');

const ids = (req) => [req.auth.userId, req.params.roomId];

module.exports = {
  async create(req, res) { res.status(201).json({ item: await items.createItem(...ids(req), req.body) }); },
  async list(req, res) { res.json({ items: await items.listItems(...ids(req), req.query) }); },
  async get(req, res) { res.json({ item: await items.getItem(...ids(req), req.params.itemId) }); },
  async update(req, res) { res.json({ item: await items.updateItem(...ids(req), req.params.itemId, req.body) }); },
  async adjust(req, res) { res.json({ item: await items.adjustQuantity(...ids(req), req.params.itemId, req.body.delta) }); },
  async remove(req, res) { await items.deleteItem(...ids(req), req.params.itemId); res.status(204).end(); },
};
