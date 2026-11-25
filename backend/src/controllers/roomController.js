const roomService = require('../services/roomService');

async function createRoom(req, res) {
  const { room, invite } = await roomService.createRoom(req.auth.userId, req.body);
  res.status(201).json({ room, invite });
}

async function getMyRoom(req, res) {
  res.json({ room: await roomService.getMyRoom(req.auth.userId) });
}

async function getRoom(req, res) {
  res.json({ room: await roomService.getRoom(req.auth.userId, req.params.roomId) });
}

async function listMembers(req, res) {
  res.json({ members: await roomService.listMembers(req.auth.userId, req.params.roomId) });
}

async function joinRoom(req, res) {
  res.json({ room: await roomService.joinRoom(req.auth.userId, req.body.code) });
}

async function updateRoom(req, res) {
  res.json({ room: await roomService.updateRoom(req.auth.userId, req.params.roomId, req.body) });
}

async function newInvitation(req, res) {
  const invite = await roomService.newInvitation(req.auth.userId, req.params.roomId, req.body.expiresInDays);
  res.status(201).json({ invite });
}

async function leaveRoom(req, res) {
  res.json(await roomService.leaveRoom(req.auth.userId, req.params.roomId, req.query.sharedItems));
}

async function transferOwner(req, res) {
  res.json({ room: await roomService.transferOwner(req.auth.userId, req.params.roomId, req.body.userId) });
}

async function removeMember(req, res) {
  await roomService.removeMember(req.auth.userId, req.params.roomId, req.params.userId);
  res.status(204).end();
}

module.exports = {
  createRoom,
  getMyRoom,
  getRoom,
  listMembers,
  joinRoom,
  updateRoom,
  newInvitation,
  leaveRoom,
  transferOwner,
  removeMember,
};
