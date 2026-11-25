const search = require('../services/searchService');

module.exports = {
  async search(req, res) { res.json(await search.search(req.auth.userId, req.params.roomId, req.query.q)); },
};