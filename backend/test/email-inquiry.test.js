// 고객센터 문의 (이메일 관련 테스트는 security.test.js)
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { api, makeUser, newUserBody, startServer, stopServer, pool } = require('./helpers');

before(startServer);
after(stopServer);

describe('고객센터 문의', () => {
  it('문의를 남기고 내 문의 목록과 상세를 본다 (처음엔 답변 대기)', async () => {
    const u = await makeUser();
    const r = await api('POST', '/api/inquiries', { token: u.token, body: { title: '질문 있어요', content: '방을 어떻게 나가나요?' } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.inquiry.status, 'WAITING');
    assert.equal(r.body.inquiry.answer, null);
    const list = (await api('GET', '/api/inquiries', { token: u.token })).body.inquiries;
    assert.equal(list.length, 1);
    const one = await api('GET', `/api/inquiries/${r.body.inquiry.inquiryId}`, { token: u.token });
    assert.equal(one.body.inquiry.title, '질문 있어요');
  });

  it('운영자가 답변하면(DB) 답변 완료로 보인다', async () => {
    const u = await makeUser();
    const r = await api('POST', '/api/inquiries', { token: u.token, body: { title: '문의', content: '내용' } });
    const id = r.body.inquiry.inquiryId;
    await pool.query("UPDATE inquiries SET answer = ?, status = 'ANSWERED', answered_at = NOW() WHERE inquiry_id = ?", ['답변드립니다', id]);
    const one = (await api('GET', `/api/inquiries/${id}`, { token: u.token })).body.inquiry;
    assert.equal(one.status, 'ANSWERED');
    assert.equal(one.answer, '답변드립니다');
    assert.ok(one.answeredAt);
  });

  it('다른 회원의 문의는 볼 수 없다', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const r = await api('POST', '/api/inquiries', { token: a.token, body: { title: '비밀', content: '내용' } });
    assert.equal((await api('GET', `/api/inquiries/${r.body.inquiry.inquiryId}`, { token: b.token })).status, 404);
    assert.equal((await api('GET', '/api/inquiries', { token: b.token })).body.inquiries.length, 0);
  });

  it('입력 검증, 로그인 필요, 하루 10건 제한', async () => {
    const u = await makeUser();
    assert.equal((await api('POST', '/api/inquiries', { token: u.token, body: { title: '', content: 'x' } })).status, 400);
    assert.equal((await api('POST', '/api/inquiries', { token: u.token, body: { title: 'x', content: '' } })).status, 400);
    assert.equal((await api('POST', '/api/inquiries', { body: { title: 'x', content: 'y' } })).status, 401);
    for (let i = 0; i < 10; i += 1) {
      assert.equal((await api('POST', '/api/inquiries', { token: u.token, body: { title: `문의 ${i}`, content: '내용' } })).status, 201);
    }
    const over = await api('POST', '/api/inquiries', { token: u.token, body: { title: '열한 번째', content: '내용' } });
    assert.equal(over.status, 429);
    assert.equal(over.body.error.code, 'TOO_MANY_INQUIRIES');
  });

  it('탈퇴하면 내 문의가 삭제된다', async () => {
    const u = await makeUser();
    await api('POST', '/api/inquiries', { token: u.token, body: { title: '곧 탈퇴', content: '내용' } });
    assert.equal((await api('DELETE', '/api/users/me', { token: u.token, body: { password: 'password1' } })).status, 200);
    const [rows] = await pool.query('SELECT 1 FROM inquiries WHERE user_id = ?', [u.userId]);
    assert.equal(rows.length, 0);
  });
});