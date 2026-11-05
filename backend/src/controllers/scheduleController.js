const schedules = require('../services/scheduleService');

const ids = (req) => [req.auth.userId, req.params.roomId];

module.exports = {
  async create(req, res) { res.status(201).json({ schedule: await schedules.createSchedule(...ids(req), req.body) }); },
  async list(req, res) { res.json({ schedules: await schedules.listSchedules(...ids(req), req.query) }); },
  async get(req, res) { res.json({ schedule: await schedules.getSchedule(...ids(req), req.params.scheduleId) }); },
  async update(req, res) { res.json({ schedule: await schedules.updateSchedule(...ids(req), req.params.scheduleId, req.body) }); },
  async remove(req, res) { await schedules.deleteSchedule(...ids(req), req.params.scheduleId); res.status(204).end(); },
};
