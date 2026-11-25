const userService = require('../services/userService');
const push = require('../services/pushService');
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

async function getNotificationSettings(req, res) {
  res.json({ settings: await push.getSettings(req.auth.userId) });
}

async function updateNotificationSettings(req, res) {
  res.json({ settings: await push.updateSettings(req.auth.userId, req.body) });
}

const { AppError } = require('../utils/errors');

const isJpeg = (b) => Buffer.isBuffer(b) && b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

async function setPhoto(req, res) {
  if (!isJpeg(req.body)) {
    throw new AppError(400, 'INVALID_PHOTO', '사진은 JPEG 형식으로 올려 주세요. (1MB 이하)');
  }
  await userService.setPhoto(req.auth.userId, req.body);
  res.json({ user: await userService.getMe(req.auth.userId) });
}

async function removePhoto(req, res) {
  await userService.removePhoto(req.auth.userId);
  res.json({ user: await userService.getMe(req.auth.userId) });
}

async function setPhotoVisibility(req, res) {
  await userService.setPhotoPublic(req.auth.userId, req.body.photoPublic);
  res.json({ user: await userService.getMe(req.auth.userId) });
}

async function getPhoto(req, res) {
  const { image, updatedAt } = await userService.getPhoto(req.auth.userId, Number(req.params.userId));
  res.set('Content-Type', 'image/jpeg');
  res.set('Cache-Control', 'private, max-age=0, must-revalidate');
  res.set('ETag', `"${new Date(updatedAt).getTime()}"`);
  res.send(image);
}

async function withdraw(req, res) {
  await userService.withdraw(req.auth.userId, req.body.password, req.body.sharedItems);
  res.json({ message: '회원 탈퇴가 완료되었습니다.' });
}

module.exports = { withdraw, setPhoto, removePhoto, setPhotoVisibility, getPhoto, getMe, updateMe, changePassword, changeAccount, getNotificationSettings, updateNotificationSettings };
