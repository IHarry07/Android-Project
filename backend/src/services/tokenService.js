const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { sha256Hex } = require('../utils/crypto');

/**
 * 비밀번호가 바뀌면 이전 토큰이 모두 무효가 되도록,
 * 토큰에 비밀번호 해시의 지문(pv)을 넣는다.
 */
function passwordVersion(passwordHash) {
  return sha256Hex(passwordHash).slice(0, 16);
}

/**
 * keep=true : 로그인한 날부터 30일 뒤 만료 (사용해도 늘어나지 않음)
 * keep=false: 1시간 뒤 만료, 요청할 때마다 새 토큰으로 갱신 (마지막 요청 후 1시간)
 */
function signToken({ userId, keep, passwordHash }) {
  return jwt.sign({ keep: Boolean(keep), pv: passwordVersion(passwordHash) }, env.jwtSecret, {
    algorithm: 'HS256',
    subject: String(userId),
    expiresIn: keep ? env.keepTokenTtl : env.idleTokenTtl,
  });
}

function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
}

function expiresAtOf(token) {
  const { exp } = jwt.decode(token);
  return new Date(exp * 1000).toISOString();
}

module.exports = { signToken, verifyToken, passwordVersion, expiresAtOf };
