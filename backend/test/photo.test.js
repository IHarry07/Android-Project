// 프로필 사진 업로드·공개 범위
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { api, apiBinary, makeUser, makeRoom, startServer, stopServer } = require('./helpers');

before(startServer);
after(stopServer);

// JPEG 시작 표시(FF D8 FF)로 시작하는 작은 데이터
const jpeg = (tag = 1) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, tag, 0xff, 0xd9]);

describe('프로필 사진', () => {
  let room;
  let a;
  let b;
  let outsider;
  const me = async (u) => (await api('GET', '/api/users/me', { token: u.token })).body.user;
  const photoOf = (viewer, target) => apiBinary('GET', `/api/users/${target.userId}/photo`, { token: viewer.token });

  before(async () => {
    room = await makeRoom(2);
    a = room.owner;
    [b] = room.members;
    outsider = await makeUser();
  });

  it('처음에는 사진이 없다', async () => {
    const u = await me(a);
    assert.equal(u.photoVersion, null);
    assert.equal(u.photoPublic, true, '기본은 같은 방 구성원에게 보임');
    assert.equal((await photoOf(a, a)).status, 404);
  });

  it('JPEG만 올릴 수 있다', async () => {
    const png = await apiBinary('PUT', '/api/users/me/photo', { token: a.token, data: Buffer.from('not an image'), contentType: 'image/png' });
    assert.equal(png.status, 400);
    const fake = await apiBinary('PUT', '/api/users/me/photo', { token: a.token, data: Buffer.from('plain text here') });
    assert.equal(fake.status, 400, 'JPEG 표시가 없으면 거절');
    const big = await apiBinary('PUT', '/api/users/me/photo', { token: a.token, data: Buffer.concat([jpeg(), Buffer.alloc(1100 * 1024)]) });
    assert.ok(big.status === 413 || big.status === 400, `크기 제한 ${big.status}`);
    const noAuth = await apiBinary('PUT', '/api/users/me/photo', { data: jpeg() });
    assert.equal(noAuth.status, 401);
  });

  it('올리면 본인이 볼 수 있고 내 정보에 버전이 생긴다', async () => {
    const r = await apiBinary('PUT', '/api/users/me/photo', { token: a.token, data: jpeg(1) });
    assert.equal(r.status, 200);
    const u = await me(a);
    assert.ok(u.photoVersion > 0);
    const got = await photoOf(a, a);
    assert.equal(got.status, 200);
    assert.equal(got.headers.get('content-type'), 'image/jpeg');
    assert.deepEqual(got.buffer, jpeg(1));
  });

  it('같은 방 구성원에게 보이고, 구성원 목록에도 버전이 나온다', async () => {
    const got = await photoOf(b, a);
    assert.equal(got.status, 200);
    const members = (await api('GET', `${room.base}/members`, { token: b.token })).body.members;
    assert.ok(members.find((m) => m.userId === a.userId).photoVersion > 0);
    assert.equal(members.find((m) => m.userId === b.userId).photoVersion, null);
  });

  it('다른 방 사람과 로그인 안 한 사람에게는 보이지 않는다', async () => {
    assert.equal((await photoOf(outsider, a)).status, 404);
    assert.equal((await apiBinary('GET', `/api/users/${a.userId}/photo`)).status, 401);
  });

  it('공개를 끄면 본인에게만 보이고 구성원 목록에서도 빠진다', async () => {
    const off = await api('PATCH', '/api/users/me/photo-visibility', { token: a.token, body: { photoPublic: false } });
    assert.equal(off.status, 200);
    assert.equal(off.body.user.photoPublic, false);
    assert.equal((await photoOf(b, a)).status, 404);
    assert.equal((await photoOf(a, a)).status, 200, '본인은 계속 볼 수 있다');
    const members = (await api('GET', `${room.base}/members`, { token: b.token })).body.members;
    assert.equal(members.find((m) => m.userId === a.userId).photoVersion, null);
    await api('PATCH', '/api/users/me/photo-visibility', { token: a.token, body: { photoPublic: true } });
    assert.equal((await photoOf(b, a)).status, 200);
  });

  it('다시 올리면 바뀌고, 삭제하면 사라진다', async () => {
    await apiBinary('PUT', '/api/users/me/photo', { token: a.token, data: jpeg(2) });
    assert.deepEqual((await photoOf(b, a)).buffer, jpeg(2));
    const del = await api('DELETE', '/api/users/me/photo', { token: a.token });
    assert.equal(del.status, 200);
    assert.equal(del.body.user.photoVersion, null);
    assert.equal((await photoOf(b, a)).status, 404);
  });

  it('잘못된 공개 설정 값은 거절한다', async () => {
    assert.equal((await api('PATCH', '/api/users/me/photo-visibility', { token: a.token, body: { photoPublic: 'yes' } })).status, 400);
  });
});