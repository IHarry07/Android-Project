const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { api, makeUser, startServer, stopServer } = require('./helpers');
const { parseAllowedUrl, extractProductName } = require('../src/services/productLookup');

before(startServer);
after(stopServer);

describe('상품명 조회(QR) 주소 검사', () => {
  it('허용한 https 주소만 통과한다', () => {
    assert.ok(parseAllowedUrl('https://hpimg.gsretail.com/abc?x=1'));
    assert.equal(parseAllowedUrl('http://hpimg.gsretail.com/abc'), null); // http
    assert.equal(parseAllowedUrl('https://hpimg.gsretail.com.evil.com/abc'), null); // 비슷한 호스트
    assert.equal(parseAllowedUrl('https://evil.com/hpimg.gsretail.com'), null);
    assert.equal(parseAllowedUrl('https://user:pw@hpimg.gsretail.com/abc'), null); // 계정 정보
    assert.equal(parseAllowedUrl('https://hpimg.gsretail.com:8443/abc'), null); // 다른 포트
    assert.equal(parseAllowedUrl('https://127.0.0.1/abc'), null);
    assert.equal(parseAllowedUrl('https://169.254.169.254/latest/meta-data'), null);
    assert.equal(parseAllowedUrl('not a url'), null);
  });

  it('상품명 추출: og:title 우선, 사이트 이름만 있는 제목은 무시', () => {
    assert.equal(
      extractProductName('<meta property="og:title" content="신선 우유 &amp; 900ml"><title>다른 제목</title>'),
      '신선 우유 & 900ml',
    );
    assert.equal(extractProductName('<title>GS리테일</title>'), null);
    assert.equal(extractProductName('<title> 두부 </title>'), '두부');
    assert.equal(extractProductName('<html></html>'), null);
  });
});

describe('GET /api/products/lookup', () => {
  it('로그인 없이는 거절한다', async () => {
    const r = await api('GET', '/api/products/lookup?url=https://hpimg.gsretail.com/abc');
    assert.equal(r.status, 401);
  });

  it('주소가 없거나 허용되지 않으면 외부에 접속하지 않고 400', async () => {
    const u = await makeUser();
    const none = await api('GET', '/api/products/lookup', { token: u.token });
    assert.equal(none.status, 400);

    for (const bad of ['http://hpimg.gsretail.com/a', 'https://evil.example/a', 'https://127.0.0.1/a', 'zzz']) {
      const r = await api('GET', `/api/products/lookup?url=${encodeURIComponent(bad)}`, { token: u.token });
      assert.equal(r.status, 400, bad);
      assert.equal(r.body.error.code, 'UNSUPPORTED_QR', bad);
    }
  });
});
