// 비밀번호 찾기 테스트: 1단계 가입 정보 확인 → 확인 토큰 → 2단계 새 비밀번호
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { api, makeUser, startServer, stopServer, env } = require('./helpers');

before(startServer);
after(stopServer);

const verify = (body) => api('POST', '/api/auth/reset-password/verify', { body });
const reset = (body) => api('POST', '/api/auth/reset-password', { body });
const infoOf = (u) => ({ loginId: u.body.loginId, name: u.body.name, phone: u.body.phone, birthDate: u.body.birthDate });
const login = (u, password) =>
  api('POST', '/api/auth/login', { body: { loginId: u.body.loginId, password, keepLogin: false } });

describe('비밀번호 찾기 1단계: 가입 정보 확인', () => {
  it('가입 정보가 모두 맞으면 확인 토큰을 준다 (아직 비밀번호는 바뀌지 않는다)', async () => {
    const u = await makeUser();
    const r = await verify(infoOf(u));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.resetToken);
    assert.equal(r.body.expiresInSeconds, 600);
    assert.equal(r.body.token, undefined, '로그인 토큰은 주지 않는다');
    assert.equal((await login(u, u.body.password)).status, 200, '확인만으로는 비밀번호가 그대로');
  });

  it('전화번호는 하이픈이 있어도 같은 번호로 본다', async () => {
    const u = await makeUser();
    const digits = u.body.phone.replace(/\D/g, '');
    const dashed = `${digits.slice(0, 3)}-${digits.slice(3, digits.length - 4)}-${digits.slice(-4)}`;
    const r = await verify({ ...infoOf(u), phone: dashed });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  });

  it('하나라도 틀리면 거절하고, 어느 항목이 틀렸는지·아이디가 있는지는 알려주지 않는다', async () => {
    const u = await makeUser();
    const other = await makeUser();
    const wrong = [
      { name: '다른이름' },
      { phone: other.body.phone },
      { birthDate: '1999-12-31' },
      { loginId: 'no_such_user_zz' },
    ];
    const messages = new Set();
    for (const change of wrong) {
      const r = await verify({ ...infoOf(u), ...change });
      assert.equal(r.status, 400, JSON.stringify(change));
      assert.equal(r.body.error.code, 'IDENTITY_MISMATCH');
      assert.equal(r.body.resetToken, undefined);
      messages.add(r.body.error.message);
    }
    assert.equal(messages.size, 1, '모든 경우에 같은 메시지');
  });

  it('입력 검증: 빈 값과 잘못된 형식', async () => {
    const u = await makeUser();
    const cases = [
      [{ name: '' }, '이름'],
      [{ phone: '123' }, '전화번호'],
      [{ birthDate: '2000/01/01' }, '생년월일'],
      [{ loginId: '' }, '아이디'],
    ];
    for (const [change, word] of cases) {
      const r = await verify({ ...infoOf(u), ...change });
      assert.equal(r.status, 400, JSON.stringify(change));
      assert.ok(JSON.stringify(r.body).includes(word), `${JSON.stringify(change)} -> ${r.body.error.message}`);
    }
  });

  it('같은 아이디로 5번 틀리면 막고, 그 뒤에는 맞는 정보로도 거절한다', async () => {
    const u = await makeUser();
    for (let i = 0; i < 5; i += 1) {
      const r = await verify({ ...infoOf(u), name: '틀린이름' });
      assert.equal(r.body.error.code, 'IDENTITY_MISMATCH');
    }
    const locked = await verify(infoOf(u));
    assert.equal(locked.status, 429);
    assert.equal(locked.body.error.code, 'TOO_MANY_ATTEMPTS');
  });

  it('없는 아이디도 똑같이 막혀서, 막혔는지로 아이디가 있는지 알 수 없다', async () => {
    const body = { loginId: 'ghost_user_lock', name: '홍길동', phone: '010-1234-5678', birthDate: '2000-01-01' };
    for (let i = 0; i < 5; i += 1) {
      assert.equal((await verify(body)).body.error.code, 'IDENTITY_MISMATCH');
    }
    assert.equal((await verify(body)).status, 429);
  });

  it('성공하면 실패 횟수가 초기화된다', async () => {
    const u = await makeUser();
    for (let i = 0; i < 4; i += 1) await verify({ ...infoOf(u), name: '틀린이름' });
    assert.equal((await verify(infoOf(u))).status, 200);
    for (let i = 0; i < 4; i += 1) {
      assert.equal((await verify({ ...infoOf(u), name: '틀린이름' })).status, 400, '다시 4번까지는 막히지 않는다');
    }
  });
});

describe('비밀번호 찾기 2단계: 새 비밀번호', () => {
  it('확인 토큰으로 새 비밀번호를 정하면 바뀌고, 이전 비밀번호·이전 로그인 토큰은 쓸 수 없다', async () => {
    const u = await makeUser();
    const { resetToken } = (await verify(infoOf(u))).body;

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
    const { resetToken } = (await verify(infoOf(u))).body;

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
    const { resetToken } = (await verify(infoOf(u))).body;
    assert.equal((await reset({ resetToken, newPassword: 'NewPass123' })).status, 200);

    const again = await reset({ resetToken, newPassword: 'Another456' });
    assert.equal(again.status, 400);
    assert.equal(again.body.error.code, 'RESET_TOKEN_INVALID');
    assert.equal((await login(u, 'NewPass123')).status, 200, '두 번째 요청은 비밀번호를 바꾸지 못한다');
  });

  it('같은 확인 토큰을 동시에 써도 한쪽만 성공한다', async () => {
    const u = await makeUser();
    const { resetToken } = (await verify(infoOf(u))).body;
    const results = await Promise.all([
      reset({ resetToken, newPassword: 'ParallelA123' }),
      reset({ resetToken, newPassword: 'ParallelB123' }),
    ]);
    assert.equal(results.filter((r) => r.status === 200).length, 1);
    assert.equal(results.filter((r) => r.status === 400).length, 1);
  });

  it('위조하거나 만료된 확인 토큰, 로그인 토큰은 거절한다', async () => {
    const u = await makeUser();
    const { resetToken } = (await verify(infoOf(u))).body;

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
    const { resetToken } = (await verify(infoOf(u))).body;
    const r = await api('GET', '/api/users/me', { token: resetToken });
    assert.equal(r.status, 401);
  });

  it('입력 검증: 새 비밀번호 규칙, 토큰 없음', async () => {
    const u = await makeUser();
    const { resetToken } = (await verify(infoOf(u))).body;
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
