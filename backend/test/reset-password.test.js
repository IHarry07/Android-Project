// 비밀번호 찾기 테스트: 이메일 인증번호 → 확인 토큰 → 새 비밀번호
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { api, makeUser, startServer, stopServer, env } = require('./helpers');
const mail = require('../src/services/mailService');

before(startServer);
after(stopServer);

const reset = (body) => api('POST', '/api/auth/reset-password', { body });
/** 이메일 인증번호로 확인 토큰을 받는다. (메일은 테스트 발송함에서 꺼낸다) */
async function tokenFor(u) {
  await api('POST', '/api/auth/reset-password/email/send', { body: { loginId: u.body.loginId, email: u.body.email } });
  const last = [...mail.outbox].reverse().find((m) => m.to === u.body.email && m.subject.includes('비밀번호 찾기'));
  const code = /(\d{6})/.exec(last.text)[1];
  const r = await api('POST', '/api/auth/reset-password/email/verify', { body: { loginId: u.body.loginId, code } });
  return r.body;
}
const login = (u, password) =>
  api('POST', '/api/auth/login', { body: { loginId: u.body.loginId, password, keepLogin: false } });

describe('가입 정보로 비밀번호 찾기는 없어졌다', () => {
  it('이름·전화번호·생년월일로 확인하던 API는 더 이상 없다 (이메일로만 찾는다)', async () => {
    const u = await makeUser();
    const r = await api('POST', '/api/auth/reset-password/verify', {
      body: { loginId: u.body.loginId, name: u.body.name, phone: u.body.phone, birthDate: u.body.birthDate },
    });
    assert.equal(r.status, 404);
  });
});
describe('비밀번호 찾기 2단계: 새 비밀번호', () => {
  it('확인 토큰으로 새 비밀번호를 정하면 바뀌고, 이전 비밀번호·이전 로그인 토큰은 쓸 수 없다', async () => {
    const u = await makeUser();
    const { resetToken } = await tokenFor(u);

    const r = await reset({ resetToken, newPassword: 'NewPass123' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.message);
    assert.equal(r.body.token, undefined, '재설정만으로 로그인되지는 않는다');

    assert.equal((await login(u, u.body.password)).status, 401, '이전 비밀번호는 거절');
    assert.equal((await login(u, 'NewPass123')).status, 200, '새 비밀번호로 로그인');
    assert.equal((await api('GET', '/api/users/me', { token: u.token })).status, 401, '이전에 발급된 로그인 토큰은 무효');
  });

  it('지금 비밀번호와 같은 비밀번호로는 바꿀 수 없고, 같은 확인 토큰으로 다른 비밀번호는 다시 시도할 수 있다', async () => {
    const u = await makeUser();
    const { resetToken } = await tokenFor(u);

    const same = await reset({ resetToken, newPassword: u.body.password });
    assert.equal(same.status, 400);
    assert.equal(same.body.error.code, 'SAME_PASSWORD');
    assert.ok(same.body.error.message.includes('이전과 같은'));
    assert.equal((await login(u, u.body.password)).status, 200, '비밀번호는 그대로이고 로그인된다');

    const other = await reset({ resetToken, newPassword: 'DifferentPass1' });
    assert.equal(other.status, 200, '확인 토큰은 그대로 유효하다');
    assert.equal((await login(u, 'DifferentPass1')).status, 200);
  });

  it('내 정보에서 비밀번호를 바꿀 때도 현재와 같은 비밀번호는 거절한다', async () => {
    const u = await makeUser();
    const r = await api('PATCH', '/api/users/me/password', { token: u.token, body: { currentPassword: u.body.password, newPassword: u.body.password } });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, 'SAME_PASSWORD');
  });
  it('확인 토큰은 한 번만 쓸 수 있다', async () => {
    const u = await makeUser();
    const { resetToken } = await tokenFor(u);
    assert.equal((await reset({ resetToken, newPassword: 'NewPass123' })).status, 200);

    const again = await reset({ resetToken, newPassword: 'Another456' });
    assert.equal(again.status, 400);
    assert.equal(again.body.error.code, 'RESET_TOKEN_INVALID');
    assert.equal((await login(u, 'NewPass123')).status, 200, '두 번째 요청은 비밀번호를 바꾸지 못한다');
  });

  it('같은 확인 토큰을 동시에 써도 한쪽만 성공한다', async () => {
    const u = await makeUser();
    const { resetToken } = await tokenFor(u);
    const results = await Promise.all([
      reset({ resetToken, newPassword: 'ParallelA123' }),
      reset({ resetToken, newPassword: 'ParallelB123' }),
    ]);
    assert.equal(results.filter((r) => r.status === 200).length, 1);
    assert.equal(results.filter((r) => r.status === 400).length, 1);
  });

  it('위조하거나 만료된 확인 토큰, 로그인 토큰은 거절한다', async () => {
    const u = await makeUser();
    const { resetToken } = await tokenFor(u);

    // 만료된 토큰 (같은 키로 서명했지만 이미 지남)
    const expired = jwt.sign({ pv: jwt.decode(resetToken).pv }, `${env.jwtSecret}:password-reset`, {
      algorithm: 'HS256', subject: String(u.userId), expiresIn: -10,
    });
    const cases = [
      ['이상한 문자열', 'abc'],
      ['글자 하나를 바꿈', `${resetToken.slice(0, -2)}xx`],
      ['만료', expired],
      ['로그인 토큰(다른 비밀키)', u.token],
    ];
    for (const [label, token] of cases) {
      const r = await reset({ resetToken: token, newPassword: 'NewPass123' });
      assert.equal(r.status, 400, label);
      assert.equal(r.body.error.code, 'RESET_TOKEN_INVALID', label);
    }
    assert.equal((await login(u, u.body.password)).status, 200, '거절된 요청은 비밀번호를 바꾸지 않는다');
  });

  it('확인 토큰으로는 로그인이 필요한 API를 쓸 수 없다', async () => {
    const u = await makeUser();
    const { resetToken } = await tokenFor(u);
    const r = await api('GET', '/api/users/me', { token: resetToken });
    assert.equal(r.status, 401);
  });

  it('입력 검증: 새 비밀번호 규칙, 토큰 없음', async () => {
    const u = await makeUser();
    const { resetToken } = await tokenFor(u);
    for (const [body, word] of [
      [{ resetToken, newPassword: 'short1' }, '8자'],
      [{ resetToken, newPassword: 'onlyletters' }, '영문자와 숫자'],
      [{ newPassword: 'NewPass123' }, '확인 정보'],
    ]) {
      const r = await reset(body);
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.ok(JSON.stringify(r.body).includes(word), `${JSON.stringify(body)} -> ${r.body.error.message}`);
    }
    // 규칙에 맞지 않아 거절된 뒤에도 같은 확인 토큰으로 다시 시도할 수 있다.
    assert.equal((await reset({ resetToken, newPassword: 'NewPass123' })).status, 200);
  });
});
