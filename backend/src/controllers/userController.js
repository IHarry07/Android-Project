const userService = require('../services/userService');
const { signToken, expiresAtOf } = require('../services/tokenService');

async function getMe(req, res) {
  res.json({ user: await userService.getMe(req.auth.userId) });
}

async function updateMe(req, res) {
  res.json({ user: await userService.updateMe(req.auth.userId, req.body) });
}

/** 비밀번호가 바뀌면 이전 토큰이 모두 무효가 되므로, 지금 쓰던 기기를 위해 새 토큰을 내려준다. */
async function changePassword(req, res) {
  const { userId, keep } = req.auth;
  const passwordHash = await userService.changePassword(userId, req.body.currentPassword, req.body.newPassword);
  const token = signToken({ userId, keep, passwordHash });
  res.json({
    message: '비밀번호가 변경되었습니다. 다른 기기의 로그인은 모두 해제됩니다.',
    token,
    expiresAt: expiresAtOf(token),
  });
}

async function changeAccount(req, res) {
  await userService.changeAccount(req.auth.userId, req.body.currentPassword, req.body.accountInfo);
  res.json({ message: '계좌 정보가 변경되었습니다.' });
}

module.exports = { getMe, updateMe, changePassword, changeAccount };
