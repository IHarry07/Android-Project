const authService = require('../services/authService');
const userService = require('../services/userService');

async function signup(req, res) {
  const user = await authService.signup(req.body);
  res.status(201).json({ user });
}

async function login(req, res) {
  const result = await authService.login(req.body);
  res.json(result);
}

// 토큰은 서버에 저장하지 않으므로, 로그아웃은 앱이 저장된 토큰을 지우면 끝난다.
function logout(req, res) {
  res.json({ message: '로그아웃되었습니다. 앱에 저장된 토큰을 삭제해 주세요.' });
}

async function checkLoginId(req, res) {
  res.json({ available: await userService.isLoginIdAvailable(req.query.loginId) });
}

async function checkNickname(req, res) {
  res.json({ available: await userService.isNicknameAvailable(req.query.nickname) });
}

module.exports = { signup, login, logout, checkLoginId, checkNickname };
