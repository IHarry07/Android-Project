// 지출·정산 기능 테스트
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { api, makeUser, makeRoom, startServer, stopServer, pool } = require('./helpers');

before(startServer);
after(stopServer);

const shareOf = (expense, userId) => expense.shares.find((s) => s.user.userId === userId);

describe('지출', () => {
  let room;
  let a;
  let b;
  let c;
  let outsider;

  const create = (token, body) => api('POST', `${room.base}/expenses`, { token, body: { title: '장보기', expenseDate: '2026-11-05', ...body } });

  before(async () => {
    room = await makeRoom(3);
    a = room.owner;
    [b, c] = room.members;
    outsider = await makeUser();
  });

  it('균등 분담: 나누어떨어지지 않는 금액은 앞사람이 1원씩 더 낸다', async () => {
    const r = await create(a.token, { amount: 10000, participantUserIds: [a.userId, b.userId, c.userId] });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const e = r.body.expense;
    assert.equal(e.payer.userId, a.userId);
    assert.deepEqual(e.shares.map((s) => s.amount), [3334, 3333, 3333]);
    assert.equal(e.shares.reduce((x, s) => x + s.amount, 0), 10000);
    assert.equal(shareOf(e, a.userId).isSettled, true, '결제자 본인의 몫은 처음부터 정산 완료');
    assert.equal(shareOf(e, a.userId).isPayer, true);
    assert.equal(shareOf(e, b.userId).isSettled, false);
    assert.equal(e.allSettled, false);
  });

  it('금액 직접 지정과 결제자가 분담에 빠지는 경우', async () => {
    const r = await create(a.token, { title: '선물', amount: 9000, shares: [{ userId: b.userId, amount: 6000 }, { userId: c.userId, amount: 3000 }] });
    assert.equal(r.status, 201);
    assert.equal(r.body.expense.shares.length, 2);
    assert.equal(r.body.expense.allSettled, false);
    const alone = await create(a.token, { title: '혼자 쓴 돈', amount: 500, participantUserIds: [a.userId] });
    assert.equal(alone.body.expense.allSettled, true, '혼자 쓴 지출은 바로 정산 완료');
  });

  it('입력 검증: 합계 불일치, 방 밖 사람, 중복, 형식 오류', async () => {
    const mismatch = await create(a.token, { amount: 10000, shares: [{ userId: a.userId, amount: 4000 }, { userId: b.userId, amount: 5000 }] });
    assert.equal(mismatch.status, 400);
    assert.equal(mismatch.body.error.code, 'SHARE_SUM_MISMATCH');
    assert.deepEqual(mismatch.body.error.details, { amount: 10000, shareSum: 9000 });

    const out = await create(a.token, { amount: 1000, participantUserIds: [a.userId, outsider.userId] });
    assert.equal(out.body.error.code, 'PARTICIPANT_NOT_MEMBER');
    const dup = await create(a.token, { amount: 1000, shares: [{ userId: b.userId, amount: 500 }, { userId: b.userId, amount: 500 }] });
    assert.equal(dup.body.error.code, 'DUPLICATE_PARTICIPANT');

    const both = await create(a.token, { amount: 1000, participantUserIds: [b.userId], shares: [{ userId: b.userId, amount: 1000 }] });
    assert.equal(both.status, 400);
    const neither = await create(a.token, { amount: 1000 });
    assert.equal(neither.status, 400);
    for (const bad of [{ amount: 0 }, { amount: -5 }, { amount: 10.5 }, { amount: '1000' }]) {
      const r = await create(a.token, { participantUserIds: [b.userId], ...bad });
      assert.equal(r.status, 400, JSON.stringify(bad));
    }
    const noTitle = await create(a.token, { title: '', amount: 1000, participantUserIds: [b.userId] });
    assert.equal(noTitle.status, 400);
    const badDate = await create(a.token, { expenseDate: '2026-02-30', amount: 1000, participantUserIds: [b.userId] });
    assert.equal(badDate.status, 400);
  });

  it('구성원이 아니면 404', async () => {
    for (const [method, path, body] of [
      ['GET', `${room.base}/expenses`], ['GET', `${room.base}/expenses/balances`],
      ['POST', `${room.base}/expenses`, { title: 'x', amount: 1000, expenseDate: '2026-11-05', participantUserIds: [outsider.userId] }],
    ]) {
      const r = await api(method, path, { token: outsider.token, body });
      assert.equal(r.status, 404, `${method} ${path}`);
    }
  });

  it('정산 완료 표시는 결제자만 할 수 있고, 취소도 된다', async () => {
    const made = await create(a.token, { title: '정산용', amount: 6000, participantUserIds: [a.userId, b.userId, c.userId] });
    const id = made.body.expense.expenseId;
    const url = (userId) => `${room.base}/expenses/${id}/shares/${userId}`;

    const byDebtor = await api('PATCH', url(b.userId), { token: b.token, body: { isSettled: true } });
    assert.equal(byDebtor.status, 403, '낼 사람이 스스로 완료 처리할 수 없다');
    assert.equal(byDebtor.body.error.code, 'NOT_EXPENSE_PAYER');
    const own = await api('PATCH', url(a.userId), { token: a.token, body: { isSettled: false } });
    assert.equal(own.status, 400);
    const unknown = await api('PATCH', url(outsider.userId), { token: a.token, body: { isSettled: true } });
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.error.code, 'SHARE_NOT_FOUND');
    const badBody = await api('PATCH', url(b.userId), { token: a.token, body: { isSettled: 'yes' } });
    assert.equal(badBody.status, 400);

    const ok = await api('PATCH', url(b.userId), { token: a.token, body: { isSettled: true } });
    assert.equal(ok.status, 200);
    assert.equal(shareOf(ok.body.expense, b.userId).isSettled, true);
    assert.ok(shareOf(ok.body.expense, b.userId).settledAt);
    assert.equal(ok.body.expense.allSettled, false);
    const all = await api('PATCH', url(c.userId), { token: a.token, body: { isSettled: true } });
    assert.equal(all.body.expense.allSettled, true);
    const undo = await api('PATCH', url(c.userId), { token: a.token, body: { isSettled: false } });
    assert.equal(shareOf(undo.body.expense, c.userId).isSettled, false);
    assert.equal(shareOf(undo.body.expense, c.userId).settledAt, null);
  });

  it('수정: 정산된 분담이 없을 때만 금액·분담을 바꿀 수 있다', async () => {
    const made = await create(a.token, { title: '수정용', amount: 9000, participantUserIds: [a.userId, b.userId, c.userId] });
    const id = made.body.expense.expenseId;
    const url = `${room.base}/expenses/${id}`;

    const byOther = await api('PATCH', url, { token: b.token, body: { title: '해킹' } });
    assert.equal(byOther.status, 403);
    const titleOnly = await api('PATCH', url, { token: a.token, body: { title: '수정됨', expenseDate: '2026-11-06' } });
    assert.equal(titleOnly.body.expense.title, '수정됨');
    assert.equal(titleOnly.body.expense.expenseDate, '2026-11-06');
    assert.deepEqual(titleOnly.body.expense.shares.map((s) => s.amount), [3000, 3000, 3000]);

    const amountOnly = await api('PATCH', url, { token: a.token, body: { amount: 6000 } });
    assert.deepEqual(amountOnly.body.expense.shares.map((s) => s.amount), [2000, 2000, 2000], '기존 분담자끼리 다시 균등 분담');
    const reshare = await api('PATCH', url, { token: a.token, body: { shares: [{ userId: b.userId, amount: 1000 }, { userId: c.userId, amount: 5000 }] } });
    assert.equal(reshare.status, 200, JSON.stringify(reshare.body));
    assert.equal(reshare.body.expense.shares.length, 2);
    const mismatch = await api('PATCH', url, { token: a.token, body: { amount: 7000 } });
    assert.equal(mismatch.status, 200, '금액만 바꾸면 현재 분담자에게 균등 재분배');
    const sumBad = await api('PATCH', url, { token: a.token, body: { amount: 8000, shares: [{ userId: b.userId, amount: 1 }] } });
    assert.equal(sumBad.body.error.code, 'SHARE_SUM_MISMATCH');

    await api('PATCH', `${url}/shares/${b.userId}`, { token: a.token, body: { isSettled: true } });
    const blocked = await api('PATCH', url, { token: a.token, body: { amount: 1000 } });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.error.code, 'EXPENSE_HAS_SETTLEMENTS');
    const stillTitle = await api('PATCH', url, { token: a.token, body: { title: '정산 후에도 제목은 수정' } });
    assert.equal(stillTitle.status, 200);
    const empty = await api('PATCH', url, { token: a.token, body: {} });
    assert.equal(empty.status, 400);
  });

  it('삭제: 결제자만, 정산된 분담이 없을 때만', async () => {
    const made = await create(a.token, { title: '삭제용', amount: 4000, participantUserIds: [a.userId, b.userId] });
    const id = made.body.expense.expenseId;
    const url = `${room.base}/expenses/${id}`;
    assert.equal((await api('DELETE', url, { token: b.token })).status, 403);
    await api('PATCH', `${url}/shares/${b.userId}`, { token: a.token, body: { isSettled: true } });
    const blocked = await api('DELETE', url, { token: a.token });
    assert.equal(blocked.status, 409);
    await api('PATCH', `${url}/shares/${b.userId}`, { token: a.token, body: { isSettled: false } });
    assert.equal((await api('DELETE', url, { token: a.token })).status, 204);
    assert.equal((await api('GET', url, { token: a.token })).status, 404);
    const [rows] = await pool.query('SELECT COUNT(*) AS n FROM expense_shares WHERE expense_id = ?', [id]);
    assert.equal(rows[0].n, 0, '분담도 함께 삭제된다');
  });

  it('목록: 날짜 필터와 최신순', async () => {
    const r2 = await create(b.token, { title: '12월', amount: 1000, expenseDate: '2026-12-15', participantUserIds: [b.userId, c.userId] });
    assert.equal(r2.status, 201);
    const dec = await api('GET', `${room.base}/expenses?from=2026-12-01&to=2026-12-31`, { token: c.token });
    assert.deepEqual(dec.body.expenses.map((e) => e.title), ['12월']);
    const all = await api('GET', `${room.base}/expenses`, { token: c.token });
    assert.equal(all.body.expenses[0].title, '12월', '최신 날짜가 먼저');
    const reversed = await api('GET', `${room.base}/expenses?from=2026-12-31&to=2026-12-01`, { token: c.token });
    assert.equal(reversed.status, 400);
  });
});

describe('정산 요약', () => {
  it('사람별로 받을 돈과 줄 돈을 합산한다', async () => {
    const room = await makeRoom(3);
    const [a, b, c] = [room.owner, ...room.members];
    const mk = (u, body) => api('POST', `${room.base}/expenses`, { token: u.token, body: { title: 't', expenseDate: '2026-11-05', ...body } });
    const e1 = await mk(a, { amount: 9000, participantUserIds: [a.userId, b.userId, c.userId] }); // b, c가 a에게 3000씩
    await mk(b, { amount: 6000, participantUserIds: [b.userId, c.userId] }); // c가 b에게 3000
    await mk(c, { amount: 2000, participantUserIds: [a.userId, c.userId] }); // a가 c에게 1000

    const bal = async (u) => (await api('GET', `${room.base}/expenses/balances`, { token: u.token })).body;
    const find = (res, u) => res.balances.find((x) => x.user.userId === u.userId)?.amount;

    const forA = await bal(a);
    assert.equal(find(forA, b), 3000);
    assert.equal(find(forA, c), 2000, '받을 3000에서 줄 1000을 뺀 값');
    assert.equal(forA.totalToReceive, 5000);
    assert.equal(forA.totalToPay, 0);

    const forB = await bal(b);
    assert.equal(find(forB, a), -3000);
    assert.equal(find(forB, c), 3000);
    assert.equal(forB.totalToReceive, 3000);
    assert.equal(forB.totalToPay, 3000);

    const forC = await bal(c);
    assert.equal(find(forC, a), -2000);
    assert.equal(find(forC, b), -3000);

    await api('PATCH', `${room.base}/expenses/${e1.body.expense.expenseId}/shares/${c.userId}`, { token: a.token, body: { isSettled: true } });
    const afterSettle = await bal(a);
    assert.equal(find(afterSettle, c), -1000, 'c가 낸 3000이 빠지고 a가 줄 1000만 남는다');
    assert.equal(afterSettle.totalToPay, 1000);

    const clean = await makeRoom(2);
    const none = await api('GET', `${clean.base}/expenses/balances`, { token: clean.owner.token });
    assert.deepEqual(none.body, { balances: [], totalToReceive: 0, totalToPay: 0 });
  });
});
