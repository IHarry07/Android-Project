const authService = require('../services/authService');
const userService = require('../services/userService');
const emailVerify = require('../services/emailVerifyService');
const { authenticate, bearer } = require('../middleware/auth');

async function signup(req, res) {
  const user = await authService.signup(req.body);
  res.status(201).json({ user });
}

async function login(req, res) {
  res.json(await authService.login(req.body));
}

/**
 * 로그아웃: 보낸 토큰이 올바르면 그 로그인(세션)을 서버에서 무효화한다.
 * 토큰이 없거나 이미 무효여도 성공으로 답한다. (앱은 저장된 토큰을 지우면 된다.)
 */
async function logout(req, res) {
  const token = bearer(req);
  if (token) {
    try {
      const auth = await authenticate(token);
      await authService.logout(auth.sid);
    } catch {
      // 이미 만료되었거나 무효인 토큰이면 할 일이 없다.
    }
  }
  res.json({ message: '로그아웃되었습니다.' });
}

async function resetPassword(req, res) {
  res.json(await authService.resetPassword(req.body));
}

async function sendResetCode(req, res) {
  res.json(await authService.sendResetCode(req.body));
}

async function verifyResetCode(req, res) {
  res.json(await authService.verifyResetCode(req.body));
}

// 가입·이메일 변경용 이메일 인증. 로그인한 회원이 자기 이메일로 다시 인증하는 경우도 막지 않는다.
async function sendEmailCode(req, res) {
  let exceptUserId = null;
  const token = bearer(req);
  if (token) {
    try { exceptUserId = (await authenticate(token)).userId; } catch { /* 로그인 없이도 쓸 수 있다 */ }
  }
  res.json(await emailVerify.sendCode(req.body.email, exceptUserId));
}

async function verifyEmailCode(req, res) {
  res.json(await emailVerify.verifyCode(req.body.email, req.body.code));
}

async function checkLoginId(req, res) {
  res.json({ available: await userService.isLoginIdAvailable(req.query.loginId) });
}

async function checkNickname(req, res) {
  res.json({ available: await userService.isNicknameAvailable(req.query.nickname) });
}

module.exports = {
  signup, login, logout, resetPassword, sendResetCode, verifyResetCode,
  sendEmailCode, verifyEmailCode, checkLoginId, checkNickname,
};