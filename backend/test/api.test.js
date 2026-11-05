// 인증·내 정보·방 기능 통합 테스트
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const { api, makeUser, newUserBody, startServer, stopServer, pool, env } = require('./helpers');
const { passwordVersion } = require('../src/services/tokenService');

before(startServer);
after(stopServer);
describe('기본', () => {
  it('health: 서버와 DB가 살아 있다', async () => {
    const r = await api('GET', '/api/health');
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'ok');
  });

  it('없는 경로는 404, 잘못된 JSON은 400', async () => {
    const r = await api('GET', '/api/nothing');
    assert.equal(r.status, 404);
    assert.equal(r.body.error.code, 'NOT_FOUND');
    const bad = await api('POST', '/api/auth/login', { raw: '{broken' });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.code, 'INVALID_JSON');
  });
});

describe('회원가입', () => {
  it('입력 검증: 약한 비밀번호, 잘못된 아이디·전화번호·생년월일·성별', async () => {
    const cases = [
      [{ password: 'short1' }, '비밀번호'],
      [{ password: 'onlyletters' }, '비밀번호'],
      [{ loginId: 'AB' }, '아이디'],
      [{ phone: '123' }, '전화번호'],
      [{ birthDate: '2000-02-31' }, '날짜'],
      [{ birthDate: '2999-01-01' }, '생년월일'],
      [{ gender: 'X' }, '성별'],
      [{ nickname: 'a' }, '닉네임'],
      [{ accountInfo: '없음' }, '계좌'],
    ];
    for (const [override, word] of cases) {
      const r = await api('POST', '/api/auth/signup', { body: newUserBody(override) });
      assert.equal(r.status, 400, JSON.stringify(override));
      assert.equal(r.body.error.code, 'VALIDATION_ERROR');
      assert.ok(r.body.error.message.includes(word), `${JSON.stringify(override)} -> ${r.body.error.message}`);
    }
  });

  it('성공하면 비밀번호·계좌가 응답에 없고, DB에는 해시와 암호문만 저장된다', async () => {
    const body = newUserBody({ phone: '01012345678' });
    const r = await api('POST', '/api/auth/signup', { body });
    assert.equal(r.status, 201);
    assert.deepEqual(Object.keys(r.body.user).sort(), ['loginId', 'nickname', 'userId']);

    const [rows] = await pool.query('SELECT * FROM users WHERE login_id = ?', [body.loginId]);
    const row = rows[0];
    assert.equal(row.phone, '010-1234-5678', '전화번호는 하이픈 형식으로 정리된다');
    assert.match(row.password_hash, /^\$2[aby]\$10\$/);
    assert.ok(!row.password_hash.includes(body.password));
    assert.ok(row.account_encrypted.startsWith('v1:'));
    assert.ok(!row.account_encrypted.includes('123456'));
  });

  it('아이디·닉네임·전화번호가 중복되면 409', async () => {
    const first = newUserBody();
    assert.equal((await api('POST', '/api/auth/signup', { body: first })).status, 201);
    const dupLogin = await api('POST', '/api/auth/signup', { body: newUserBody({ loginId: first.loginId }) });
    assert.equal(dupLogin.body.error.code, 'LOGIN_ID_TAKEN');
    const dupNick = await api('POST', '/api/auth/signup', { body: newUserBody({ nickname: first.nickname }) });
    assert.equal(dupNick.body.error.code, 'NICKNAME_TAKEN');
    const dupPhone = await api('POST', '/api/auth/signup', { body: newUserBody({ phone: first.phone.replaceAll('-', '') }) });
    assert.equal(dupPhone.body.error.code, 'PHONE_TAKEN');
    assert.equal(dupPhone.status, 409);
  });

  it('아이디·닉네임 중복 확인 API', async () => {
    const u = await makeUser();
    const taken = await api('GET', `/api/auth/check-login-id?loginId=${u.body.loginId}`);
    assert.equal(taken.body.available, false);
    const free = await api('GET', '/api/auth/check-login-id?loginId=never_used_id');
    assert.equal(free.body.available, true);
    const nickTaken = await api('GET', `/api/auth/check-nickname?nickname=${encodeURIComponent(u.body.nickname)}`);
    assert.equal(nickTaken.body.available, false);
    const nickFree = await api('GET', `/api/auth/check-nickname?nickname=${encodeURIComponent('없는닉네임')}`);
    assert.equal(nickFree.body.available, true);
    const badNick = await api('GET', '/api/auth/check-nickname?nickname=a');
    assert.equal(badNick.status, 400);
  });
});

describe('로그인과 토큰', () => {
  it('틀린 비밀번호와 없는 아이디는 같은 오류', async () => {
    const u = await makeUser();
    const wrong = await api('POST', '/api/auth/login', { body: { loginId: u.body.loginId, password: 'wrongpass1' } });
    const none = await api('POST', '/api/auth/login', { body: { loginId: 'no_such_user', password: 'wrongpass1' } });
    assert.equal(wrong.status, 401);
    assert.equal(none.status, 401);
    assert.equal(wrong.body.error.code, 'INVALID_CREDENTIALS');
    assert.deepEqual(wrong.body, none.body);
  });

  it('로그인 유지: 체크하면 30일 고정, 체크하지 않으면 1시간', async () => {
    const keep = await makeUser({}, true);
    const idle = await makeUser({}, false);
    const day = 24 * 3600 * 1000;
    const keepLeft = new Date(keep.login.expiresAt) - Date.now();
    const idleLeft = new Date(idle.login.expiresAt) - Date.now();
    assert.ok(keepLeft > 29.9 * day && keepLeft <= 30 * day, `keep: ${keepLeft}`);
    assert.ok(idleLeft > 3590 * 1000 && idleLeft <= 3600 * 1000, `idle: ${idleLeft}`);
    assert.equal(keep.login.keepLogin, true);
    assert.equal(idle.login.keepLogin, false);
  });

  it('토큰이 없거나 잘못되면 401, 만료되면 안내 메시지와 함께 TOKEN_EXPIRED', async () => {
    const none = await api('GET', '/api/users/me');
    assert.equal(none.body.error.code, 'AUTH_REQUIRED');
    const garbage = await api('GET', '/api/users/me', { token: 'abc.def.ghi' });
    assert.equal(garbage.body.error.code, 'TOKEN_INVALID');

    const u = await makeUser();
    const [rows] = await pool.query('SELECT password_hash FROM users WHERE user_id = ?', [u.userId]);
    const expired = jwt.sign({ keep: false, pv: passwordVersion(rows[0].password_hash) }, env.jwtSecret, {
      algorithm: 'HS256', subject: String(u.userId), expiresIn: -10,
    });
    const r = await api('GET', '/api/users/me', { token: expired });
    assert.equal(r.status, 401);
    assert.equal(r.body.error.code, 'TOKEN_EXPIRED');
    assert.equal(r.body.error.message, '보안상의 이유로 로그인이 해제되었습니다. 다시 로그인해 주세요.');

    const forged = jwt.sign({ keep: true, pv: 'x' }, 'another-secret-that-is-long-enough-123456', { subject: String(u.userId), expiresIn: '1h' });
    assert.equal((await api('GET', '/api/users/me', { token: forged })).body.error.code, 'TOKEN_INVALID');
    const none2 = jwt.sign({ keep: true }, env.jwtSecret, { algorithm: 'HS256', subject: String(u.userId), expiresIn: '1h' });
    assert.equal((await api('GET', '/api/users/me', { token: none2 })).body.error.code, 'TOKEN_INVALID', '비밀번호 지문이 없는 토큰은 거부');
  });

  it('로그인 유지를 체크하지 않은 토큰만 요청마다 새 토큰을 받는다', async () => {
    const idle = await makeUser({}, false);
    const keep = await makeUser({}, true);
    const r1 = await api('GET', '/api/users/me', { token: idle.token });
    const refreshed = r1.headers.get('x-refreshed-token');
    assert.ok(refreshed, '새 토큰 헤더가 있어야 한다');
    assert.equal(jwt.verify(refreshed, env.jwtSecret).keep, false);
    const r2 = await api('GET', '/api/users/me', { token: refreshed });
    assert.equal(r2.status, 200, '갱신된 토큰으로도 요청할 수 있다');
    const r3 = await api('GET', '/api/users/me', { token: keep.token });
    assert.equal(r3.headers.get('x-refreshed-token'), null);
  });

  it('로그아웃은 안내만 한다', async () => {
    const r = await api('POST', '/api/auth/logout');
    assert.equal(r.status, 200);
  });
});

describe('내 정보', () => {
  it('내 정보 조회: 계좌는 가려서, 비밀번호는 없이', async () => {
    const u = await makeUser({ accountInfo: '국민 123456-78-901234' });
    const r = await api('GET', '/api/users/me', { token: u.token });
    assert.equal(r.status, 200);
    const me = r.body.user;
    assert.equal(me.accountMasked, '국민 ******-**-**1234');
    assert.equal(me.room, null);
    assert.equal(me.password, undefined);
    assert.equal(me.passwordHash, undefined);
    assert.ok(!JSON.stringify(r.body).includes('password'));
    assert.equal(me.birthDate, '2000-01-01');
  });

  it('닉네임·전화번호 수정과 중복 거절', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const ok = await api('PATCH', '/api/users/me', { token: a.token, body: { nickname: '새닉네임' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.user.nickname, '새닉네임');
    const dup = await api('PATCH', '/api/users/me', { token: b.token, body: { nickname: '새닉네임' } });
    assert.equal(dup.body.error.code, 'NICKNAME_TAKEN');
    const empty = await api('PATCH', '/api/users/me', { token: a.token, body: {} });
    assert.equal(empty.status, 400);
  });

  it('비밀번호 변경: 현재 비밀번호 확인, 이전 토큰은 모두 무효, 새 토큰은 유효', async () => {
    const u = await makeUser();
    const otherDevice = await api('POST', '/api/auth/login', { body: { loginId: u.body.loginId, password: u.body.password, keepLogin: true } });

    const wrong = await api('PATCH', '/api/users/me/password', { token: u.token, body: { currentPassword: 'nope12345', newPassword: 'newpass123' } });
    assert.equal(wrong.status, 403);
    assert.equal(wrong.body.error.code, 'WRONG_PASSWORD');
    const weak = await api('PATCH', '/api/users/me/password', { token: u.token, body: { currentPassword: u.body.password, newPassword: 'abc' } });
    assert.equal(weak.status, 400);

    const ok = await api('PATCH', '/api/users/me/password', { token: u.token, body: { currentPassword: u.body.password, newPassword: 'newpass123' } });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.token);

    assert.equal((await api('GET', '/api/users/me', { token: u.token })).body.error.code, 'TOKEN_INVALID');
    assert.equal((await api('GET', '/api/users/me', { token: otherDevice.body.token })).body.error.code, 'TOKEN_INVALID');
    assert.equal((await api('GET', '/api/users/me', { token: ok.body.token })).status, 200);

    const oldLogin = await api('POST', '/api/auth/login', { body: { loginId: u.body.loginId, password: u.body.password } });
    assert.equal(oldLogin.status, 401);
    const newLogin = await api('POST', '/api/auth/login', { body: { loginId: u.body.loginId, password: 'newpass123' } });
    assert.equal(newLogin.status, 200);
  });

  it('계좌 변경: 비밀번호 확인 후 새 값이 암호화되어 저장된다', async () => {
    const u = await makeUser();
    const wrong = await api('PATCH', '/api/users/me/account', { token: u.token, body: { currentPassword: 'nope12345', accountInfo: '신한 110-123-456789' } });
    assert.equal(wrong.status, 403);
    const ok = await api('PATCH', '/api/users/me/account', { token: u.token, body: { currentPassword: u.body.password, accountInfo: '신한 110-123-456789' } });
    assert.equal(ok.status, 200);
    const me = await api('GET', '/api/users/me', { token: u.token });
    assert.equal(me.body.user.accountMasked, '신한 ***-***-**6789');
    const [rows] = await pool.query('SELECT account_encrypted FROM users WHERE user_id = ?', [u.userId]);
    assert.ok(!rows[0].account_encrypted.includes('110'));
  });
});

describe('방', () => {
  let owner;
  let b;
  let c;
  let d;
  let roomId;
  let code;

  before(async () => {
    owner = await makeUser();
    b = await makeUser();
    c = await makeUser();
    d = await makeUser();
  });

  it('방 만들기: 방장은 구성원이 되고 초대 코드는 한 번만 평문으로 나온다', async () => {
    const bad = await api('POST', '/api/rooms', { token: owner.token, body: { roomName: '', capacity: 3 } });
    assert.equal(bad.status, 400);
    const tooBig = await api('POST', '/api/rooms', { token: owner.token, body: { roomName: '301호', capacity: 11 } });
    assert.equal(tooBig.status, 400);

    const r = await api('POST', '/api/rooms', { token: owner.token, body: { roomName: '301호', capacity: 3 } });
    assert.equal(r.status, 201);
    assert.equal(r.body.room.memberCount, 1);
    assert.equal(r.body.room.isOwner, true);
    assert.equal(r.body.room.capacity, 3);
    assert.match(r.body.invite.code, /^[A-Z2-9]{8}$/);
    roomId = r.body.room.roomId;
    code = r.body.invite.code;

    const [inv] = await pool.query('SELECT code_hash FROM room_invitations WHERE room_id = ?', [roomId]);
    assert.equal(inv.length, 1);
    assert.notEqual(inv[0].code_hash, code, '코드는 해시로만 저장된다');
    assert.equal(inv[0].code_hash.length, 64);

    const again = await api('POST', '/api/rooms', { token: owner.token, body: { roomName: '또 만들기' } });
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'ALREADY_IN_ROOM');
  });

  it('내 방 조회: 방이 없으면 null, 있으면 정보', async () => {
    const mine = await api('GET', '/api/rooms/me', { token: owner.token });
    assert.equal(mine.body.room.roomId, roomId);
    const none = await api('GET', '/api/rooms/me', { token: b.token });
    assert.equal(none.body.room, null);
    const me = await api('GET', '/api/users/me', { token: owner.token });
    assert.deepEqual(me.body.user.room, { roomId, roomName: '301호', isOwner: true });
  });

  it('틀린 코드는 거절, 소문자·공백이 섞여도 올바른 코드는 가입된다', async () => {
    const wrong = await api('POST', '/api/rooms/join', { token: b.token, body: { code: 'ZZZZZZZZ' } });
    assert.equal(wrong.status, 404);
    assert.equal(wrong.body.error.code, 'INVALID_INVITE_CODE');
    const ok = await api('POST', '/api/rooms/join', { token: b.token, body: { code: `  ${code.toLowerCase()} ` } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.room.memberCount, 2);
    assert.equal(ok.body.room.isOwner, false);
  });

  it('같은 계정은 다시 가입할 수 없다 (다른 기기로 로그인해도 동일)', async () => {
    const again = await api('POST', '/api/rooms/join', { token: b.token, body: { code } });
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'ALREADY_IN_ROOM');
    const otherDevice = await api('POST', '/api/auth/login', { body: { loginId: b.body.loginId, password: b.body.password, keepLogin: true } });
    const again2 = await api('POST', '/api/rooms/join', { token: otherDevice.body.token, body: { code } });
    assert.equal(again2.body.error.code, 'ALREADY_IN_ROOM');
    const [rows] = await pool.query('SELECT COUNT(*) AS n FROM room_members WHERE room_id = ?', [roomId]);
    assert.equal(rows[0].n, 2);
  });

  it('정원이 차면 ROOM_FULL', async () => {
    assert.equal((await api('POST', '/api/rooms/join', { token: c.token, body: { code } })).status, 200);
    const full = await api('POST', '/api/rooms/join', { token: d.token, body: { code } });
    assert.equal(full.status, 409);
    assert.equal(full.body.error.code, 'ROOM_FULL');
  });

  it('구성원 목록은 닉네임만 보여준다', async () => {
    const r = await api('GET', `/api/rooms/${roomId}/members`, { token: b.token });
    assert.equal(r.status, 200);
    assert.equal(r.body.members.length, 3);
    assert.equal(r.body.members.filter((m) => m.isOwner).length, 1);
    const text = JSON.stringify(r.body);
    assert.ok(!text.includes('phone') && !text.includes('010-') && !text.includes('account'));
    assert.deepEqual(Object.keys(r.body.members[0]).sort(), ['isOwner', 'joinedAt', 'nickname', 'userId']);
  });

  it('구성원이 아니면 방이 있는지도 알 수 없다 (404)', async () => {
    for (const [method, path, body] of [
      ['GET', `/api/rooms/${roomId}`],
      ['GET', `/api/rooms/${roomId}/members`],
      ['PATCH', `/api/rooms/${roomId}`, { roomName: '해킹' }],
      ['POST', `/api/rooms/${roomId}/invitations`, {}],
      ['POST', `/api/rooms/${roomId}/transfer-owner`, { userId: d.userId }],
      ['DELETE', `/api/rooms/${roomId}/members/${c.userId}`],
      ['DELETE', `/api/rooms/${roomId}/members/me`],
    ]) {
      const r = await api(method, path, { token: d.token, body });
      assert.equal(r.status, 404, `${method} ${path}`);
      assert.equal(r.body.error.code, 'ROOM_NOT_FOUND');
    }
    const absent = await api('GET', '/api/rooms/999999', { token: d.token });
    assert.equal(absent.status, 404);
    const badId = await api('GET', '/api/rooms/abc', { token: d.token });
    assert.equal(badId.status, 400);
  });

  it('방장 전용 기능은 일반 구성원에게 403', async () => {
    for (const [method, path, body] of [
      ['PATCH', `/api/rooms/${roomId}`, { roomName: '바꾸기' }],
      ['POST', `/api/rooms/${roomId}/invitations`, {}],
      ['POST', `/api/rooms/${roomId}/transfer-owner`, { userId: b.userId }],
      ['DELETE', `/api/rooms/${roomId}/members/${c.userId}`],
    ]) {
      const r = await api(method, path, { token: b.token, body });
      assert.equal(r.status, 403, `${method} ${path}`);
      assert.equal(r.body.error.code, 'NOT_ROOM_OWNER');
    }
  });

  it('방 이름·정원 수정', async () => {
    const r = await api('PATCH', `/api/rooms/${roomId}`, { token: owner.token, body: { roomName: '301호 (수정)', capacity: 4 } });
    assert.equal(r.status, 200);
    assert.equal(r.body.room.roomName, '301호 (수정)');
    assert.equal(r.body.room.capacity, 4);
    const joinD = await api('POST', '/api/rooms/join', { token: d.token, body: { code } });
    assert.equal(joinD.status, 200, '정원을 늘리면 다시 가입할 수 있다');
    assert.equal(joinD.body.room.memberCount, 4);
    await api('DELETE', `/api/rooms/${roomId}/members/me`, { token: d.token });
  });

  it('초대 코드 재발급: 이전 코드는 즉시 무효, 만료된 코드도 무효', async () => {
    const r = await api('POST', `/api/rooms/${roomId}/invitations`, { token: owner.token, body: { expiresInDays: 3 } });
    assert.equal(r.status, 201);
    const newCode = r.body.invite.code;
    assert.notEqual(newCode, code);
    const e = await makeUser();
    assert.equal((await api('POST', '/api/rooms/join', { token: e.token, body: { code } })).body.error.code, 'INVALID_INVITE_CODE');

    await pool.query('UPDATE room_invitations SET expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE is_active = 1 AND room_id = ?', [roomId]);
    assert.equal((await api('POST', '/api/rooms/join', { token: e.token, body: { code: newCode } })).body.error.code, 'INVALID_INVITE_CODE');

    const fresh = await api('POST', `/api/rooms/${roomId}/invitations`, { token: owner.token, body: {} });
    code = fresh.body.invite.code;
    assert.equal((await api('POST', '/api/rooms/join', { token: e.token, body: { code } })).status, 200);
    await api('DELETE', `/api/rooms/${roomId}/members/me`, { token: e.token });
  });

  it('방장은 위임 전에는 나갈 수 없고, 위임하면 새 방장이 권한을 갖는다', async () => {
    const blocked = await api('DELETE', `/api/rooms/${roomId}/members/me`, { token: owner.token });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.error.code, 'OWNER_MUST_TRANSFER');

    const self = await api('POST', `/api/rooms/${roomId}/transfer-owner`, { token: owner.token, body: { userId: owner.userId } });
    assert.equal(self.status, 400);
    const stranger = await api('POST', `/api/rooms/${roomId}/transfer-owner`, { token: owner.token, body: { userId: d.userId } });
    assert.equal(stranger.status, 404);
    assert.equal(stranger.body.error.code, 'MEMBER_NOT_FOUND');

    const ok = await api('POST', `/api/rooms/${roomId}/transfer-owner`, { token: owner.token, body: { userId: b.userId } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.room.isOwner, false);
    const [rows] = await pool.query('SELECT owner_user_id FROM rooms WHERE room_id = ?', [roomId]);
    assert.equal(rows[0].owner_user_id, b.userId);

    const oldOwnerEdit = await api('PATCH', `/api/rooms/${roomId}`, { token: owner.token, body: { roomName: 'x' } });
    assert.equal(oldOwnerEdit.status, 403);
    const newOwnerEdit = await api('PATCH', `/api/rooms/${roomId}`, { token: b.token, body: { roomName: '새 방장의 방' } });
    assert.equal(newOwnerEdit.status, 200);
  });

  it('구성원 내보내기와 방 나가기 뒤에는 다른 방에 가입할 수 있다', async () => {
    const self = await api('DELETE', `/api/rooms/${roomId}/members/${b.userId}`, { token: b.token });
    assert.equal(self.status, 400);
    const kick = await api('DELETE', `/api/rooms/${roomId}/members/${c.userId}`, { token: b.token });
    assert.equal(kick.status, 204);
    const again = await api('DELETE', `/api/rooms/${roomId}/members/${c.userId}`, { token: b.token });
    assert.equal(again.status, 404);

    const left = await api('DELETE', `/api/rooms/${roomId}/members/me`, { token: owner.token });
    assert.equal(left.status, 200);
    assert.equal(left.body.roomDeleted, false);

    const newRoom = await api('POST', '/api/rooms', { token: owner.token, body: { roomName: '새 방' } });
    assert.equal(newRoom.status, 201, '나간 뒤에는 새 방을 만들 수 있다');
    const joinOld = await api('POST', '/api/rooms/join', { token: c.token, body: { code } });
    assert.equal(joinOld.status, 200, '내보낸 사람도 코드가 유효하면 다시 가입할 수 있다');
  });

  it('방장이 혼자 남아 나가면 방이 삭제된다', async () => {
    const solo = await makeUser();
    const created = await api('POST', '/api/rooms', { token: solo.token, body: { roomName: '혼자 방' } });
    const id = created.body.room.roomId;
    const r = await api('DELETE', `/api/rooms/${id}/members/me`, { token: solo.token });
    assert.equal(r.status, 200);
    assert.equal(r.body.roomDeleted, true);
    const [rooms] = await pool.query('SELECT 1 FROM rooms WHERE room_id = ?', [id]);
    const [invs] = await pool.query('SELECT 1 FROM room_invitations WHERE room_id = ?', [id]);
    assert.equal(rooms.length + invs.length, 0);
  });

  it('동시에 여러 명이 가입해도 정원을 넘지 않는다', async () => {
    const host = await makeUser();
    const room = await api('POST', '/api/rooms', { token: host.token, body: { roomName: '동시 가입', capacity: 3 } });
    const joinCode = room.body.invite.code;
    const guests = [];
    for (let i = 0; i < 8; i += 1) guests.push(await makeUser());

    const results = await Promise.all(
      guests.map((g) => api('POST', '/api/rooms/join', { token: g.token, body: { code: joinCode } })),
    );
    const ok = results.filter((r) => r.status === 200).length;
    const full = results.filter((r) => r.status === 409 && r.body.error.code === 'ROOM_FULL').length;
    assert.equal(ok, 2, '남은 자리 2개만 성공');
    assert.equal(full, 6);
    const [rows] = await pool.query('SELECT COUNT(*) AS n FROM room_members WHERE room_id = ?', [room.body.room.roomId]);
    assert.equal(rows[0].n, 3);
  });

  it('같은 계정이 동시에 여러 번 가입을 요청해도 한 번만 처리된다', async () => {
    const host = await makeUser();
    const room = await api('POST', '/api/rooms', { token: host.token, body: { roomName: '중복 요청', capacity: 5 } });
    const guest = await makeUser();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => api('POST', '/api/rooms/join', { token: guest.token, body: { code: room.body.invite.code } })),
    );
    assert.equal(results.filter((r) => r.status === 200).length, 1);
    assert.equal(results.filter((r) => r.status === 409 && r.body.error.code === 'ALREADY_IN_ROOM').length, 4);
    const [rows] = await pool.query('SELECT COUNT(*) AS n FROM room_members WHERE room_id = ?', [room.body.room.roomId]);
    assert.equal(rows[0].n, 2);
  });
});
