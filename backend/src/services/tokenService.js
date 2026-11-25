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

/**
 * 비밀번호 찾기에서 가입 정보 확인을 통과한 사람에게 주는 짧은 확인 토큰.
 *  - 로그인 토큰과 다른 비밀키로 서명해서, 이 토큰으로는 로그인 API를 쓸 수 없다.
 *  - 10분 안에 새 비밀번호를 정해야 한다.
 *  - 비밀번호 해시의 지문(pv)이 들어 있어서, 비밀번호가 바뀌면(한 번 쓰면) 같은 토큰은 쓸 수 없다.
 */
const RESET_TTL_SECONDS = 10 * 60;
const resetSecret = () => `${env.jwtSecret}:password-reset`;

function signResetToken({ userId, passwordHash }) {
  return jwt.sign({ pv: passwordVersion(passwordHash) }, resetSecret(), {
    algorithm: 'HS256',
    subject: String(userId),
    expiresIn: RESET_TTL_SECONDS,
  });
}

/** 올바르면 { userId, pv }, 아니면(위조·만료) null */
function verifyResetToken(token) {
  try {
    const payload = jwt.verify(token, resetSecret(), { algorithms: ['HS256'] });
    return { userId: Number(payload.sub), pv: payload.pv };
  } catch {
    return null;
  }
}

module.exports = {
  signToken, verifyToken, passwordVersion, expiresAtOf,
  signResetToken, verifyResetToken, RESET_TTL_SECONDS,
};
