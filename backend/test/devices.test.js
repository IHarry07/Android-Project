// 푸시 알림용 기기 토큰 등록/해제 테스트
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { api, makeUser, startServer, stopServer, pool } = require('./helpers');

before(startServer);
after(stopServer);

const TOKEN = 'fcm-token-'.padEnd(40, 'x');
const owner = async (token) => (await pool.query('SELECT user_id FROM device_tokens WHERE token = ?', [token]))[0][0]?.user_id;

describe('기기 토큰', () => {
  it('로그인이 필요하다', async () => {
    const r = await api('POST', '/api/devices', { body: { token: TOKEN } });
    assert.equal(r.status, 401);
  });

  it('등록하고, 다른 회원이 같은 기기로 로그인하면 옮겨진다', async () => {
    const a = await makeUser();
    const b = await makeUser();
    assert.equal((await api('POST', '/api/devices', { token: a.token, body: { token: TOKEN } })).status, 204);
    assert.equal(Number(await owner(TOKEN)), Number(a.userId));
    assert.equal((await api('POST', '/api/devices', { token: b.token, body: { token: TOKEN } })).status, 204);
    assert.equal(Number(await owner(TOKEN)), Number(b.userId));
  });

  it('토큰만으로 해제할 수 있다 (로그인이 풀린 뒤에도)', async () => {
    assert.equal((await api('DELETE', '/api/devices', { body: { token: TOKEN } })).status, 204);
    assert.equal(await owner(TOKEN), undefined);
  });

  it('너무 짧은 토큰은 거절한다', async () => {
    const a = await makeUser();
    assert.equal((await api('POST', '/api/devices', { token: a.token, body: { token: 'short' } })).status, 400);
  });
});