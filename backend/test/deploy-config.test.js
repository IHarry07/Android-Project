// 배포 설정: HTTPS 프록시 뒤 실제 IP 사용(TRUST_PROXY), 배포에서 개발용 메일 콘솔 금지
process.env.TRUST_PROXY = 'loopback';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');
const { api, startServer, stopServer } = require('./helpers');
const app = require('../src/app');

before(startServer);
after(stopServer);

describe('HTTPS 프록시 뒤에서', () => {
  it('TRUST_PROXY=loopback 이면 같은 서버의 프록시만 믿는다', () => {
    assert.equal(app.get('trust proxy'), 'loopback');
    const trust = app.get('trust proxy fn');
    assert.equal(trust('127.0.0.1', 0), true, '같은 서버의 Caddy');
    assert.equal(trust('203.0.113.7', 0), false, '바깥 주소가 보낸 X-Forwarded-For 는 믿지 않는다');
  });

  it('프록시 설정이 있어도 API는 그대로 동작한다', async () => {
    const r = await api('GET', '/api/health');
    assert.equal(r.status, 200);
  });
});

describe('배포 안전장치', () => {
  const runEnv = (extra) => spawnSync(process.execPath, ['-e', "require('./src/config/env')"], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, ...extra },
    encoding: 'utf8',
  });

  it('NODE_ENV=production 에서 MAIL_DEV_CONSOLE=true 면 서버가 시작하지 않는다', () => {
    const r = runEnv({ NODE_ENV: 'production', MAIL_DEV_CONSOLE: 'true' });
    assert.notEqual(r.status, 0);
    assert.ok(r.stderr.includes('MAIL_DEV_CONSOLE'), r.stderr);
  });

  it('NODE_ENV=production 이고 MAIL_DEV_CONSOLE 이 꺼져 있으면 시작한다', () => {
    const r = runEnv({ NODE_ENV: 'production', MAIL_DEV_CONSOLE: 'false' });
    assert.equal(r.status, 0, r.stderr);
  });
});
