// 비밀번호 찾기: 아이디 + 이메일 인증번호
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { api, makeUser, startServer, stopServer, pool } = require('./helpers');
const mail = require('../src/services/mailService');

before(startServer);
after(stopServer);
beforeEach(() => { mail.outbox.length = 0; });

const send = (loginId, email) => api('POST', '/api/auth/reset-password/email/send', { body: { loginId, email } });
const verify = (loginId, code) => api('POST', '/api/auth/reset-password/email/verify', { body: { loginId, code } });
const codeFromMail = () => /(\d{6})/.exec(mail.outbox[mail.outbox.length - 1].text)[1];

describe('이메일로 비밀번호 찾기', () => {
  it('아이디와 이메일이 맞으면 인증번호가 메일로 가고, 인증번호를 확인하면 새 비밀번호를 정할 수 있다', async () => {
    const u = await makeUser({ email: 'find@example.com' });
    const r = await send(u.body.loginId, 'FIND@example.com');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(mail.outbox.length, 1);
    assert.equal(mail.outbox[0].to, 'find@example.com');
    const code = codeFromMail();

    const v = await verify(u.body.loginId, code);
    assert.equal(v.status, 200, JSON.stringify(v.body));
    assert.ok(v.body.resetToken);

    const reset = await api('POST', '/api/auth/reset-password', { body: { resetToken: v.body.resetToken, newPassword: 'newpass1234' } });
    assert.equal(reset.status, 200, JSON.stringify(reset.body));
    const login = await api('POST', '/api/auth/login', { body: { loginId: u.body.loginId, password: 'newpass1234', keepLogin: false } });
    assert.equal(login.status, 200);
  });

  it('맞든 틀리든 같은 응답이고, 틀리면 메일이 가지 않는다', async () => {
    const u = await makeUser({ email: 'real@example.com' });
    const ok = await send(u.body.loginId, 'real@example.com');
    mail.outbox.length = 0;
    const wrongMail = await send(u.body.loginId, 'other@example.com');
    const noUser = await send('nobody-here', 'real@example.com');
    assert.equal(wrongMail.status, 200);
    assert.equal(noUser.status, 200);
    assert.deepEqual(wrongMail.body, ok.body);
    assert.deepEqual(noUser.body, ok.body);
    assert.equal(mail.outbox.length, 0, '가입 정보가 틀리면 메일은 가지 않는다');
  });

  it('이메일을 등록하지 않은 회원은 메일을 받을 수 없다', async () => {
    const u = await makeUser();
    await send(u.body.loginId, 'any@example.com');
    assert.equal(mail.outbox.length, 0);
  });

  it('60초 안에 다시 요청해도 새 메일이 가지 않는다', async () => {
    const u = await makeUser({ email: 'cool@example.com' });
    await send(u.body.loginId, 'cool@example.com');
    await send(u.body.loginId, 'cool@example.com');
    assert.equal(mail.outbox.length, 1);
    await pool.query("UPDATE password_reset_codes SET sent_at = DATE_SUB(NOW(), INTERVAL 61 SECOND) WHERE user_id = ?", [u.userId]);
    await send(u.body.loginId, 'cool@example.com');
    assert.equal(mail.outbox.length, 2, '60초가 지나면 다시 보낸다');
  });

  it('인증번호를 5번 틀리면 맞는 번호로도 쓸 수 없다', async () => {
    const u = await makeUser({ email: 'five@example.com' });
    await send(u.body.loginId, 'five@example.com');
    const code = codeFromMail();
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i += 1) {
      const r = await verify(u.body.loginId, wrong);
      assert.equal(r.status, 400);
      assert.equal(r.body.error.code, 'INVALID_CODE');
    }
    // 다섯 번째로 틀리면 이 인증번호는 무효가 된다.
    await verify(u.body.loginId, wrong);
    const late = await verify(u.body.loginId, code);
    assert.ok(late.status === 400 || late.status === 429, `맞는 번호도 거절: ${late.status}`);
  });

  it('만료된 인증번호는 쓸 수 없고, 한 번 쓴 인증번호는 다시 쓸 수 없다', async () => {
    const u = await makeUser({ email: 'old@example.com' });
    await send(u.body.loginId, 'old@example.com');
    const code = codeFromMail();
    await pool.query('UPDATE password_reset_codes SET expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE user_id = ?', [u.userId]);
    assert.equal((await verify(u.body.loginId, code)).status, 400);

    await pool.query('UPDATE password_reset_codes SET sent_at = DATE_SUB(NOW(), INTERVAL 2 MINUTE) WHERE user_id = ?', [u.userId]);
    await send(u.body.loginId, 'old@example.com');
    const fresh = codeFromMail();
    assert.equal((await verify(u.body.loginId, fresh)).status, 200);
    assert.equal((await verify(u.body.loginId, fresh)).status, 400, '한 번 쓴 번호는 다시 쓸 수 없다');
  });

  it('입력 형식 검증', async () => {
    assert.equal((await send('', 'a@example.com')).status, 400);
    assert.equal((await send('someone', 'not-an-email')).status, 400);
    assert.equal((await verify('someone', '12345')).status, 400);
    assert.equal((await verify('someone', 'abcdef')).status, 400);
  });

  it('탈퇴한 회원은 인증번호를 받을 수 없다', async () => {
    const u = await makeUser({ email: 'gone@example.com' });
    await api('DELETE', '/api/users/me', { token: u.token, body: { password: 'password1' } });
    await send(u.body.loginId, 'gone@example.com');
    assert.equal(mail.outbox.length, 0);
  });
});