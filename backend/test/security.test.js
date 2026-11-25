// 보안 작업: 이메일 필수·인증, 만 14세 미만 가입 불가, 로그아웃 무효화, 로그인 잠금, 보안 알림 메일, 요청 수 제한
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { api, makeUser, newUserBody, emailTokenFor, startServer, stopServer, env, pool } = require('./helpers');
const mail = require('../src/services/mailService');
const { createCounter } = require('../src/services/userRateLimit');

before(startServer);
after(stopServer);
beforeEach(() => { mail.outbox.length = 0; });

const signup = (body) => api('POST', '/api/auth/signup', { body });
const sendCode = (email, token) => api('POST', '/api/auth/email/send', { body: { email }, token });
const verifyCode = (email, code) => api('POST', '/api/auth/email/verify', { body: { email, code } });
const lastCode = () => /(\d{6})/.exec(mail.outbox[mail.outbox.length - 1].text)[1];
const login = (loginId, password, keepLogin = false) => api('POST', '/api/auth/login', { body: { loginId, password, keepLogin } });

/** 오늘 기준 만 N세가 되는 생일(오늘이 생일) */
function birthForAge(age, dayShift = 0) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  d.setDate(d.getDate() + dayShift);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

describe('이메일 인증과 필수 이메일', () => {
  it('인증번호를 받아 확인하면 이메일 확인 토큰이 나오고, 그 토큰으로 가입된다', async () => {
    const r = await sendCode('New.Person@Example.com');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(mail.outbox[0].to, 'new.person@example.com', '소문자로 맞춰 보낸다');
    const v = await verifyCode('new.person@example.com', lastCode());
    assert.equal(v.status, 200, JSON.stringify(v.body));
    const body = newUserBody({ email: 'new.person@example.com', emailToken: v.body.emailToken });
    assert.equal((await signup(body)).status, 201);
  });

  it('이메일이 없거나 인증하지 않았거나 다른 이메일의 토큰이면 가입할 수 없다', async () => {
    const noMail = newUserBody();
    delete noMail.email;
    assert.equal((await signup(noMail)).status, 400, '이메일 없음');
    const noToken = newUserBody({ emailToken: undefined });
    delete noToken.emailToken;
    assert.equal((await signup(noToken)).status, 400, '인증 토큰 없음');
    const other = newUserBody({ email: 'mine@example.com', emailToken: emailTokenFor('someone@example.com') });
    const r = await signup(other);
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, 'EMAIL_NOT_VERIFIED');
    const forged = newUserBody({ email: 'forge@example.com', emailToken: jwt.sign({ email: 'forge@example.com' }, 'wrong-secret') });
    assert.equal((await signup(forged)).body.error.code, 'EMAIL_NOT_VERIFIED');
  });

  it('이미 가입된 이메일로는 인증번호를 보내지 않는다 (409)', async () => {
    const u = await makeUser({ email: 'taken@example.com' });
    assert.ok(u);
    const r = await sendCode('TAKEN@example.com');
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'EMAIL_TAKEN');
    assert.equal(mail.outbox.length, 0);
  });

  it('60초 안에 다시 받을 수 없고, 5번 틀리면 그 인증번호는 쓸 수 없다', async () => {
    await sendCode('retry@example.com');
    const again = await sendCode('retry@example.com');
    assert.equal(again.status, 429);
    assert.equal(again.body.error.code, 'EMAIL_COOLDOWN');
    const code = lastCode();
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i += 1) assert.equal((await verifyCode('retry@example.com', wrong)).status, 400);
    assert.equal((await verifyCode('retry@example.com', code)).status, 400, '맞는 번호도 무효');
  });

  it('인증번호는 한 번만 쓸 수 있고, 만료되면 쓸 수 없다', async () => {
    await sendCode('once@example.com');
    const code = lastCode();
    assert.equal((await verifyCode('once@example.com', code)).status, 200);
    assert.equal((await verifyCode('once@example.com', code)).status, 400);
    await pool.query("UPDATE email_verifications SET sent_at = DATE_SUB(NOW(), INTERVAL 2 MINUTE) WHERE email = 'once@example.com'");
    await sendCode('once@example.com');
    const fresh = lastCode();
    await pool.query("UPDATE email_verifications SET expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE email = 'once@example.com'");
    assert.equal((await verifyCode('once@example.com', fresh)).status, 400);
  });

  it('내 정보에서 이메일을 바꾸려면 새 이메일 인증이 필요하고, 이전 주소로 알림이 간다', async () => {
    const u = await makeUser({ email: 'before@example.com' });
    const noToken = await api('PATCH', '/api/users/me', { token: u.token, body: { email: 'after@example.com' } });
    assert.equal(noToken.status, 400);
    assert.equal(noToken.body.error.code, 'EMAIL_NOT_VERIFIED');

    mail.outbox.length = 0;
    const ok = await api('PATCH', '/api/users/me', { token: u.token, body: { email: 'after@example.com', emailToken: emailTokenFor('after@example.com') } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.user.email, 'after@example.com');
    const notice = mail.outbox.find((m) => m.to === 'before@example.com');
    assert.ok(notice && notice.subject.includes('이메일이 변경'), '이전 주소로 변경 알림');
    assert.ok(!notice.text.includes('after@example.com'), '새 주소는 가려서 보낸다');

    const clear = await api('PATCH', '/api/users/me', { token: u.token, body: { email: '' } });
    assert.equal(clear.status, 400, '이메일은 지울 수 없다(필수)');
  });

  it('로그인한 회원은 자기 이메일로 다시 인증번호를 받을 수 있다', async () => {
    const u = await makeUser({ email: 'self@example.com' });
    assert.equal((await sendCode('self@example.com', u.token)).status, 200);
  });
});

describe('만 14세 미만 가입 불가', () => {
  it('만 14세가 안 되면 거절하고, 만 14세가 되는 날부터 가입할 수 있다', async () => {
    const young = await signup(newUserBody({ birthDate: birthForAge(14, 1) }));
    assert.equal(young.status, 400);
    assert.ok(JSON.stringify(young.body).includes('만 14세 미만'));
    assert.equal((await signup(newUserBody({ birthDate: birthForAge(14) }))).status, 201);
  });
});

describe('로그아웃하면 그 로그인은 바로 무효', () => {
  it('로그아웃한 토큰과 그 로그인에서 갱신된 토큰은 모두 쓸 수 없고, 다른 로그인은 그대로다', async () => {
    const u = await makeUser();
    const other = await login(u.body.loginId, 'password1');
    const me = await api('GET', '/api/users/me', { token: u.token });
    const refreshed = me.headers.get('x-refreshed-token');
    assert.ok(refreshed, '로그인 유지가 아니면 갱신 토큰이 온다');

    const out = await api('POST', '/api/auth/logout', { token: u.token });
    assert.equal(out.status, 200);
    assert.equal((await api('GET', '/api/users/me', { token: u.token })).status, 401);
    assert.equal((await api('GET', '/api/users/me', { token: refreshed })).status, 401, '갱신된 토큰도 같은 로그인이라 무효');
    assert.equal((await api('GET', '/api/users/me', { token: other.body.token })).status, 200, '다른 기기의 로그인은 그대로');
  });

  it('세션 번호가 없는 예전 토큰은 받지 않고, 토큰 없이 로그아웃해도 성공으로 답한다', async () => {
    const u = await makeUser();
    const payload = jwt.decode(u.token);
    const legacy = jwt.sign({ keep: false, pv: payload.pv }, env.jwtSecret, { algorithm: 'HS256', subject: payload.sub, expiresIn: 3600 });
    assert.equal((await api('GET', '/api/users/me', { token: legacy })).status, 401);
    assert.equal((await api('POST', '/api/auth/logout')).status, 200);
  });
});

describe('로그인 5번 실패하면 15분 잠금', () => {
  it('5번 틀리면 맞는 비밀번호로도 막히고, 등록된 이메일로 한 번 알린다', async () => {
    const u = await makeUser({ email: 'lock@example.com' });
    mail.outbox.length = 0;
    for (let i = 0; i < 5; i += 1) assert.equal((await login(u.body.loginId, 'wrongpass99')).status, 401);
    const locked = await login(u.body.loginId, 'password1');
    assert.equal(locked.status, 429);
    assert.equal(locked.body.error.code, 'ACCOUNT_LOCKED');
    const notices = mail.outbox.filter((m) => m.to === 'lock@example.com');
    assert.equal(notices.length, 1, '잠길 때 한 번만 메일');
    assert.ok(notices[0].subject.includes('잠겼'));
  });

  it('없는 아이디도 똑같이 잠겨서 아이디가 있는지 알 수 없다', async () => {
    for (let i = 0; i < 5; i += 1) assert.equal((await login('nobody-lock', 'wrongpass99')).status, 401);
    assert.equal((await login('nobody-lock', 'wrongpass99')).status, 429);
  });

  it('5번이 되기 전에 성공하면 실패 횟수가 초기화된다', async () => {
    const u = await makeUser();
    for (let i = 0; i < 4; i += 1) await login(u.body.loginId, 'wrongpass99');
    assert.equal((await login(u.body.loginId, 'password1')).status, 200);
    for (let i = 0; i < 4; i += 1) assert.equal((await login(u.body.loginId, 'wrongpass99')).status, 401);
    assert.equal((await login(u.body.loginId, 'password1')).status, 200, '다시 4번 틀려도 잠기지 않는다');
  });

  it('잠금 기록은 DB에 있어서 서버를 다시 켜도 유지되고, 아이디는 그대로 저장하지 않는다', async () => {
    const u = await makeUser();
    for (let i = 0; i < 5; i += 1) await login(u.body.loginId, 'wrongpass99');
    const [rows] = await pool.query('SELECT attempt_key, fail_count FROM login_attempts');
    assert.ok(rows.some((r) => r.fail_count === 5), '실패 5번이 DB에 남는다');
    assert.ok(rows.every((r) => /^[0-9a-f]{64}$/.test(r.attempt_key) && !r.attempt_key.includes(u.body.loginId)), '해시로만 저장');

    // 서버 메모리와 상관없이 DB 기록만으로 막힌다: 모듈을 새로 불러와도(=서버 재시작) 잠겨 있다.
    delete require.cache[require.resolve('../src/services/attemptLimiter')];
    const fresh = require('../src/services/attemptLimiter');
    assert.equal(await fresh.isLocked(`login:${u.body.loginId}`), true);
    assert.equal((await login(u.body.loginId, 'password1')).status, 429);
  });

  it('15분이 지난 기록은 1부터 다시 센다', async () => {
    const u = await makeUser();
    for (let i = 0; i < 5; i += 1) await login(u.body.loginId, 'wrongpass99');
    // 첫 실패를 16분 전으로 옮긴다.
    await pool.query('UPDATE login_attempts SET first_failed_at = DATE_SUB(NOW(), INTERVAL 16 MINUTE)');
    assert.equal((await login(u.body.loginId, 'password1')).status, 200, '15분이 지나면 풀린다');
    for (let i = 0; i < 5; i += 1) await login(u.body.loginId, 'wrongpass99');
    await pool.query('UPDATE login_attempts SET first_failed_at = DATE_SUB(NOW(), INTERVAL 16 MINUTE)');
    assert.equal((await login(u.body.loginId, 'wrongpass99')).status, 401);
    const [rows] = await pool.query('SELECT fail_count FROM login_attempts WHERE first_failed_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE)');
    assert.deepEqual(rows.map((r) => r.fail_count), [1], '오래된 기록 위에서 1부터 다시 센다');
  });
});

describe('보안 알림 메일', () => {
  it('비밀번호를 바꾸면 알림 메일이 간다', async () => {
    const u = await makeUser({ email: 'pw@example.com' });
    mail.outbox.length = 0;
    const r = await api('PATCH', '/api/users/me/password', { token: u.token, body: { currentPassword: 'password1', newPassword: 'newpass123' } });
    assert.equal(r.status, 200);
    assert.ok(mail.outbox.some((m) => m.to === 'pw@example.com' && m.subject.includes('비밀번호가 변경')));
    assert.equal((await api('GET', '/api/users/me', { token: r.body.token })).status, 200, '지금 기기는 새 토큰으로 계속 쓴다');
  });

  it('탈퇴하면 지우기 전 이메일로 완료 알림이 간다', async () => {
    const u = await makeUser({ email: 'bye@example.com' });
    mail.outbox.length = 0;
    assert.equal((await api('DELETE', '/api/users/me', { token: u.token, body: { password: 'password1' } })).status, 200);
    assert.ok(mail.outbox.some((m) => m.to === 'bye@example.com' && m.subject.includes('탈퇴')));
  });
});

describe('요청 수 제한 (회원별 1분)', () => {
  it('정한 횟수까지는 통과하고 넘으면 막히며, 1분이 지나면 다시 된다', () => {
    const hit = createCounter(3, 60000);
    const t0 = 1000000;
    assert.deepEqual([hit(1, t0), hit(1, t0 + 1), hit(1, t0 + 2), hit(1, t0 + 3)], [true, true, true, false]);
    assert.equal(hit(2, t0 + 3), true, '다른 회원은 따로 센다');
    assert.equal(hit(1, t0 + 60001), true, '1분이 지나면 다시');
  });
});