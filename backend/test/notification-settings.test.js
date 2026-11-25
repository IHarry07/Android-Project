// 알림 종류별 푸시 설정
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { api, makeUser, startServer, stopServer } = require('./helpers');

before(startServer);
after(stopServer);

describe('알림 설정', () => {
  it('처음에는 모두 켜져 있다', async () => {
    const u = await makeUser();
    const r = await api('GET', '/api/users/me/notification-settings', { token: u.token });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.settings, { itemExpiry: true, cleaning: true, schedule: true, expense: true });
  });

  it('일부만 바꾸면 나머지는 그대로이고, 다시 읽어도 유지된다', async () => {
    const u = await makeUser();
    const r = await api('PATCH', '/api/users/me/notification-settings', { token: u.token, body: { cleaning: false } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.settings, { itemExpiry: true, cleaning: false, schedule: true, expense: true });
    await api('PATCH', '/api/users/me/notification-settings', { token: u.token, body: { expense: false } });
    const again = await api('GET', '/api/users/me/notification-settings', { token: u.token });
    assert.deepEqual(again.body.settings, { itemExpiry: true, cleaning: false, schedule: true, expense: false });
  });

  it('다른 회원 설정에는 영향이 없다', async () => {
    const a = await makeUser();
    const b = await makeUser();
    await api('PATCH', '/api/users/me/notification-settings', { token: a.token, body: { schedule: false } });
    const r = await api('GET', '/api/users/me/notification-settings', { token: b.token });
    assert.equal(r.body.settings.schedule, true);
  });

  it('잘못된 값은 거절하고 로그인이 필요하다', async () => {
    const u = await makeUser();
    assert.equal((await api('PATCH', '/api/users/me/notification-settings', { token: u.token, body: { cleaning: 'no' } })).status, 400);
    assert.equal((await api('PATCH', '/api/users/me/notification-settings', { token: u.token, body: { unknown: true } })).status, 400);
    assert.equal((await api('GET', '/api/users/me/notification-settings')).status, 401);
  });
});