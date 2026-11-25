const crypto = require('crypto');
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
// 로그인할 때마다 새 세션 번호(sid)를 만든다. 갱신된 토큰도 같은 sid를 이어 쓰고, 로그아웃하면 sid를 무효화한다.
function newSessionId() {
  return crypto.randomBytes(16).toString('hex');
}

function signToken({ userId, keep, passwordHash, sid }) {
  return jwt.sign({ keep: Boolean(keep), pv: passwordVersion(passwordHash), sid }, env.jwtSecret, {
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

/**
 * 이메일 인증을 마친 사람에게 주는 짧은 확인 토큰 (30분).
 * 가입하거나 이메일을 바꿀 때 이 토큰이 있어야 그 이메일을 쓸 수 있다.
 * 로그인 토큰·비밀번호 재설정 토큰과 다른 비밀키로 서명해서 서로 바꿔 쓸 수 없다.
 */
const EMAIL_TOKEN_TTL_SECONDS = 30 * 60;
const emailSecret = () => `${env.jwtSecret}:email-verify`;

function signEmailToken(email) {
  return jwt.sign({ email }, emailSecret(), { algorithm: 'HS256', expiresIn: EMAIL_TOKEN_TTL_SECONDS });
}

/** 올바르면 인증된 이메일, 아니면(위조·만료) null */
function verifyEmailToken(token) {
  try {
    return jwt.verify(token, emailSecret(), { algorithms: ['HS256'] }).email || null;
  } catch {
    return null;
  }
}

module.exports = {
  signToken, verifyToken, passwordVersion, expiresAtOf, newSessionId,
  signResetToken, verifyResetToken, RESET_TTL_SECONDS,
  signEmailToken, verifyEmailToken, EMAIL_TOKEN_TTL_SECONDS,
};
