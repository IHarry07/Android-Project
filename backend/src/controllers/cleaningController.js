const cleaning = require('../services/cleaningService');

const ids = (req) => [req.auth.userId, req.params.roomId];

module.exports = {
  async create(req, res) { res.status(201).json({ task: await cleaning.createTask(...ids(req), req.body) }); },
  async getSettings(req, res) { res.json({ settings: await cleaning.getSettings(...ids(req)) }); },
  async saveSettings(req, res) { res.json({ settings: await cleaning.saveSettings(...ids(req), req.body) }); },
  async list(req, res) { res.json({ tasks: await cleaning.listTasks(...ids(req), req.query) }); },
  async get(req, res) { res.json({ task: await cleaning.getTask(...ids(req), req.params.taskId) }); },
  async update(req, res) { res.json({ task: await cleaning.updateTask(...ids(req), req.params.taskId, req.body) }); },
  async remove(req, res) { await cleaning.deleteTask(...ids(req), req.params.taskId); res.status(204).end(); },
  async complete(req, res) { res.json({ task: await cleaning.completeTask(...ids(req), req.params.taskId, req.body) }); },
  async skip(req, res) { res.json({ task: await cleaning.skipTask(...ids(req), req.params.taskId, req.body) }); },
  async postpone(req, res) { res.json({ task: await cleaning.postponeTask(...ids(req), req.params.taskId, req.body) }); },
  async reassign(req, res) { res.json({ task: await cleaning.reassignTask(...ids(req), req.params.taskId, req.body) }); },
  async history(req, res) { res.json({ events: await cleaning.listHistory(...ids(req), req.query) }); },
  async records(req, res) { res.json({ records: await cleaning.listRecords(...ids(req), req.params.taskId, req.query) }); },
};
