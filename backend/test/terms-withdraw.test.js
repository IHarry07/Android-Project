// 약관 동의(가입)와 회원 탈퇴, 공지사항, 공동 메모
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { api, makeUser, makeRoom, newUserBody, startServer, stopServer, pool } = require('./helpers');

before(startServer);
after(stopServer);

describe('가입 약관 동의', () => {
  it('두 동의가 모두 있어야 가입할 수 있다', async () => {
    const base = newUserBody();
    for (const [label, patch] of [
      ['이용약관 동의 없음', { agreeTerms: undefined }],
      ['이용약관 거부', { agreeTerms: false }],
      ['개인정보 동의 없음', { agreePrivacy: undefined }],
      ['개인정보 거부', { agreePrivacy: false }],
    ]) {
      const r = await api('POST', '/api/auth/signup', { body: { ...base, ...patch } });
      assert.equal(r.status, 400, label);
    }
    const ok = await api('POST', '/api/auth/signup', { body: base });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
  });

  it('동의한 약관 버전과 시각이 기록된다', async () => {
    const u = await makeUser();
    const [[row]] = await pool.query('SELECT terms_version, terms_agreed_at, privacy_agreed_at FROM users WHERE user_id = ?', [u.userId]);
    assert.equal(row.terms_version, '1.0');
    assert.ok(row.terms_agreed_at && row.privacy_agreed_at);
  });
});

describe('회원 탈퇴', () => {
  const del = (u, body) => api('DELETE', '/api/users/me', { token: u.token, body });

  it('비밀번호가 틀리면 거절하고 계정은 그대로다', async () => {
    const u = await makeUser();
    const r = await del(u, { password: 'wrong-password' });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, 'INVALID_PASSWORD');
    assert.equal((await api('GET', '/api/users/me', { token: u.token })).status, 200);
  });

  it('방이 없는 회원은 바로 탈퇴되고, 이전 토큰·로그인·비밀번호 찾기가 모두 막힌다', async () => {
    const u = await makeUser();
    const r = await del(u, { password: 'password1' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal((await api('GET', '/api/users/me', { token: u.token })).status, 401, '이전 토큰은 무효');
    const login = await api('POST', '/api/auth/login', { body: { loginId: u.body.loginId, password: 'password1', keepLogin: false } });
    assert.equal(login.status, 401);
  });

  it('탈퇴하면 개인정보와 사진, 기기 토큰이 지워지고 행은 비식별 값으로 남는다', async () => {
    const u = await makeUser();
    await pool.query('INSERT INTO user_photos (user_id, image) VALUES (?, ?)', [u.userId, Buffer.from([0xff, 0xd8, 0xff])]);
    await pool.query('INSERT INTO device_tokens (token, user_id) VALUES (?, ?)', ['t'.repeat(30), u.userId]);
    assert.equal((await del(u, { password: 'password1' })).status, 200);
    const [[row]] = await pool.query('SELECT * FROM users WHERE user_id = ?', [u.userId]);
    assert.equal(row.name, '탈퇴한 회원');
    assert.ok(row.nickname.startsWith('탈퇴한 회원'));
    assert.notEqual(row.login_id, u.body.loginId);
    assert.notEqual(row.phone, u.body.phone);
    assert.equal(String(row.birth_date).slice(0, 4) === '1900' || row.birth_date.getFullYear?.() === 1900, true);
    assert.ok(row.withdrawn_at);
    assert.equal((await pool.query('SELECT 1 FROM user_photos WHERE user_id = ?', [u.userId]))[0].length, 0);
    assert.equal((await pool.query('SELECT 1 FROM device_tokens WHERE user_id = ?', [u.userId]))[0].length, 0);
  });

  it('탈퇴한 뒤에 같은 아이디·전화번호·닉네임으로 다시 가입할 수 있다', async () => {
    const u = await makeUser();
    const original = { loginId: u.body.loginId, nickname: u.nickname, phone: u.body.phone };
    assert.equal((await del(u, { password: 'password1' })).status, 200);
    const again = await api('POST', '/api/auth/signup', { body: { ...newUserBody(), ...original } });
    assert.equal(again.status, 201, JSON.stringify(again.body));
  });

  it('방장이 다른 구성원과 함께 있으면 먼저 위임해야 한다', async () => {
    const room = await makeRoom(2);
    const r = await del(room.owner, { password: 'password1' });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'OWNER_MUST_TRANSFER');
  });

  it('정산이 안 끝났으면 탈퇴할 수 없고, 정산을 끝내면 탈퇴된다', async () => {
    const room = await makeRoom(2);
    const [b] = room.members;
    const exp = await api('POST', `${room.base}/expenses`, { token: room.owner.token, body: {
      title: '장보기', amount: 10000, expenseDate: '2026-11-05', participantUserIds: [room.owner.userId, b.userId],
    } });
    assert.equal(exp.status, 201);
    const blocked = await del(b, { password: 'password1' });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.error.code, 'UNSETTLED_EXPENSES');
    // 받을 돈이 남은 결제자도 마찬가지다. (방장이 위임한 뒤라고 가정하고 구성원으로 확인)
    await api('POST', `${room.base}/transfer-owner`, { token: room.owner.token, body: { userId: b.userId } });
    const owed = await del(room.owner, { password: 'password1' });
    assert.equal(owed.status, 409);
    assert.equal(owed.body.error.code, 'UNSETTLED_EXPENSES');

    await api('PATCH', `${room.base}/expenses/${exp.body.expense.expenseId}/shares/${b.userId}`, { token: room.owner.token, body: { isSettled: true } });
    const ok = await del(room.owner, { password: 'password1' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
  });

  it('공용 물품이 있으면 처리 방법을 고르고, 탈퇴한 사람의 지출 기록은 방에 남는다', async () => {
    const room = await makeRoom(2);
    const [b] = room.members;
    await api('POST', `${room.base}/items`, { token: b.token, body: { name: '공용 휴지', category: 'SUPPLY', ownershipType: 'SHARED', quantity: 3 } });
    await api('POST', `${room.base}/items`, { token: b.token, body: { name: '내 간식', category: 'FOOD', ownershipType: 'PERSONAL', quantity: 1 } });
    const exp = await api('POST', `${room.base}/expenses`, { token: b.token, body: {
      title: '배달', amount: 4000, expenseDate: '2026-11-05', participantUserIds: [b.userId, room.owner.userId],
    } });
    await api('PATCH', `${room.base}/expenses/${exp.body.expense.expenseId}/shares/${room.owner.userId}`, { token: b.token, body: { isSettled: true } });

    const ask = await del(b, { password: 'password1' });
    assert.equal(ask.status, 409);
    assert.equal(ask.body.error.code, 'SHARED_ITEMS_CHOICE_REQUIRED');

    const ok = await del(b, { password: 'password1', sharedItems: 'TRANSFER' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));

    const items = (await api('GET', `${room.base}/items`, { token: room.owner.token })).body.items;
    assert.ok(items.find((i) => i.name === '공용 휴지' && i.ownerUserId === room.owner.userId), '공용 물품은 방장에게 넘어간다');
    assert.equal(items.find((i) => i.name === '내 간식'), undefined, '개인 물품은 삭제된다');

    const list = (await api('GET', `${room.base}/expenses`, { token: room.owner.token })).body.expenses;
    const kept = list.find((e) => e.title === '배달');
    assert.ok(kept, '지출 기록은 남는다');
    assert.equal(kept.payer.status, 'LEFT');
    assert.ok(kept.payer.nickname.startsWith('탈퇴한 회원'));
    const members = (await api('GET', `${room.base}/members`, { token: room.owner.token })).body.members;
    assert.equal(members.length, 1);
  });

  it('혼자 남은 방장이 탈퇴하면 방이 삭제된다', async () => {
    const room = await makeRoom(1);
    const r = await del(room.owner, { password: 'password1' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const [rows] = await pool.query('SELECT 1 FROM rooms WHERE owner_user_id = ?', [room.owner.userId]);
    assert.equal(rows.length, 0);
  });
});

describe('공지사항', () => {
  it('로그인한 회원이 목록과 상세를 읽고, 고정 공지가 맨 위에 온다', async () => {
    const u = await makeUser();
    await pool.query('INSERT INTO notices (title, body, is_pinned) VALUES (?, ?, 0), (?, ?, 1), (?, ?, 0)',
      ['첫 공지', '내용 1', '중요 공지', '내용 2', '최신 공지', '내용 3']);
    const list = await api('GET', '/api/notices', { token: u.token });
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.notices.map((n) => n.title), ['중요 공지', '최신 공지', '첫 공지']);
    assert.equal(list.body.notices[0].isPinned, true);
    assert.equal(list.body.notices[0].body, undefined, '목록에는 본문이 없다');
    const detail = await api('GET', `/api/notices/${list.body.notices[0].noticeId}`, { token: u.token });
    assert.equal(detail.body.notice.body, '내용 2');
    assert.equal((await api('GET', '/api/notices/999999', { token: u.token })).status, 404);
    assert.equal((await api('GET', '/api/notices')).status, 401);
  });
});

describe('공동 메모', () => {
  let room;
  let a;
  let b;
  let outsider;
  const memo = (token, body) => api('POST', `${room.base}/memos`, { token, body });

  before(async () => {
    room = await makeRoom(2);
    a = room.owner;
    [b] = room.members;
    outsider = await makeUser();
  });

  it('구성원 누구나 쓰고 모두 볼 수 있다', async () => {
    const r = await memo(b.token, { title: '공지', content: '쓰레기 분리배출은 화요일' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.memo.author.nickname, b.nickname);
    assert.equal(r.body.memo.canEdit, true);
    const forA = (await api('GET', `${room.base}/memos`, { token: a.token })).body.memos;
    assert.equal(forA.length >= 1, true);
    assert.equal(forA.find((m) => m.title === '공지').canEdit, true, '방장은 모든 메모를 고칠 수 있다');
  });

  it('작성자와 방장만 수정·삭제할 수 있다', async () => {
    const mine = (await memo(a.token, { title: '방장 메모' })).body.memo;
    const denied = await api('PATCH', `${room.base}/memos/${mine.memoId}`, { token: b.token, body: { title: '남의 메모' } });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error.code, 'NOT_MEMO_AUTHOR');
    assert.equal((await api('DELETE', `${room.base}/memos/${mine.memoId}`, { token: b.token })).status, 403);
    const asB = (await api('GET', `${room.base}/memos/${mine.memoId}`, { token: b.token })).body.memo;
    assert.equal(asB.canEdit, false);

    const theirs = (await memo(b.token, { title: '구성원 메모' })).body.memo;
    const edited = await api('PATCH', `${room.base}/memos/${theirs.memoId}`, { token: a.token, body: { content: '방장이 고침' } });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.memo.content, '방장이 고침');
    assert.equal((await api('DELETE', `${room.base}/memos/${theirs.memoId}`, { token: a.token })).status, 204);
    assert.equal((await api('GET', `${room.base}/memos/${theirs.memoId}`, { token: a.token })).status, 404);
  });

  it('입력 검증과 접근 제한', async () => {
    assert.equal((await memo(a.token, { title: '' })).status, 400);
    assert.equal((await memo(a.token, { title: 'x'.repeat(101) })).status, 400);
    assert.equal((await api('PATCH', `${room.base}/memos/1`, { token: a.token, body: {} })).status, 400);
    assert.equal((await api('GET', `${room.base}/memos`, { token: outsider.token })).status, 404);
    assert.equal((await api('GET', `${room.base}/memos`)).status, 401);
  });

  it('작성자가 방을 나가도 메모는 남고 나간 사람으로 표시된다', async () => {
    const r2 = await makeRoom(2);
    const [c] = r2.members;
    await api('POST', `${r2.base}/memos`, { token: c.token, body: { title: '남길 메모' } });
    assert.equal((await api('DELETE', `${r2.base}/members/me?sharedItems=TRANSFER`, { token: c.token })).status, 200);
    const list = (await api('GET', `${r2.base}/memos`, { token: r2.owner.token })).body.memos;
    assert.equal(list.length, 1);
    assert.equal(list[0].author.status, 'LEFT');
  });
});