// 방을 나가거나 내보내질 때의 데이터 정리 테스트
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { api, makeRoom, startServer, stopServer, pool, dbToday } = require('./helpers');

before(startServer);
after(stopServer);

const count = async (sql, params) => (await pool.query(sql, params))[0][0].n;

/** 사람 하나가 방에 남기는 데이터를 한 번에 만든다. */
async function seedMemberData(room, u) {
  const item = (body) => api('POST', `${room.base}/items`, { token: u.token, body: { category: 'FOOD', quantity: 1, ...body } });
  const personal = (await item({ name: `${u.nickname}의 개인 물품`, ownershipType: 'PERSONAL' })).body.item;
  const shared = (await item({ name: `${u.nickname}의 공용 물품`, ownershipType: 'SHARED' })).body.item;
  const schedule = (await api('POST', `${room.base}/schedules`, { token: u.token, body: { title: `${u.nickname} 일정`, startAt: '2026-12-05T18:00', endAt: '2026-12-05T19:00' } })).body.schedule;
  const today = await dbToday();
  const task = (await api('POST', `${room.base}/cleaning-tasks`, { token: u.token, body: { areaName: `${u.nickname} 담당`, assigneeUserId: u.userId, nextDueDate: today, repeatType: 'WEEKLY' } })).body.task;
  return { personal, shared, schedule, task };
}

describe('나가기: 데이터 정리', () => {
  let room;
  let owner;
  let b;
  let c;
  let d;
  let bData;

  before(async () => {
    room = await makeRoom(4);
    owner = room.owner;
    [b, c, d] = room.members;
    bData = await seedMemberData(room, b);
  });

  it('공용 물품이 있으면 처리 방법을 고르게 한다', async () => {
    const noChoice = await api('DELETE', `${room.base}/members/me`, { token: b.token });
    assert.equal(noChoice.status, 409);
    assert.equal(noChoice.body.error.code, 'SHARED_ITEMS_CHOICE_REQUIRED');
    assert.equal(noChoice.body.error.details.sharedItemCount, 1);
    const invalid = await api('DELETE', `${room.base}/members/me?sharedItems=KEEP`, { token: b.token });
    assert.equal(invalid.status, 400);
    assert.equal(await count('SELECT COUNT(*) AS n FROM room_members WHERE user_id = ?', [b.userId]), 1, '아직 나가지 않았다');
  });

  it('TRANSFER를 고르고 나가면: 개인 물품·일정 삭제, 공용 물품은 방장 소유, 청소 담당 비움', async () => {
    const r = await api('DELETE', `${room.base}/members/me?sharedItems=TRANSFER`, { token: b.token });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.roomDeleted, false);

    assert.equal(await count('SELECT COUNT(*) AS n FROM items WHERE item_id = ?', [bData.personal.itemId]), 0, '개인 물품 삭제');
    assert.equal(await count('SELECT COUNT(*) AS n FROM schedules WHERE schedule_id = ?', [bData.schedule.scheduleId]), 0, '일정 삭제');
    const shared = await api('GET', `${room.base}/items/${bData.shared.itemId}`, { token: owner.token });
    assert.equal(shared.status, 200, '공용 물품은 남는다');
    assert.equal(shared.body.item.ownerUserId, owner.userId, '방장 소유로 넘어간다');

    const task = await api('GET', `${room.base}/cleaning-tasks/${bData.task.taskId}`, { token: owner.token });
    assert.equal(task.status, 200, '청소 항목은 남는다');
    assert.equal(task.body.task.assignee, null, '담당자만 비워진다');
    const recs = await api('GET', `${room.base}/cleaning-tasks/${bData.task.taskId}/records`, { token: owner.token });
    assert.equal(recs.body.records[0].assignee, null, '예정된 회차의 담당자도 비워진다');

    assert.equal(await count('SELECT COUNT(*) AS n FROM room_members WHERE user_id = ?', [b.userId]), 0);
    assert.equal(await count("SELECT COUNT(*) AS n FROM room_departures WHERE room_id = ? AND user_id = ? AND reason = 'LEFT'", [room.roomId, b.userId]), 1);
    assert.equal((await api('GET', `${room.base}/items`, { token: b.token })).status, 404, '나간 뒤에는 접근할 수 없다');
  });

  it('DELETE를 고르면 공용 물품도 함께 삭제된다', async () => {
    const cData = await seedMemberData(room, c);
    const r = await api('DELETE', `${room.base}/members/me?sharedItems=DELETE`, { token: c.token });
    assert.equal(r.status, 200);
    assert.equal(await count('SELECT COUNT(*) AS n FROM items WHERE item_id IN (?)', [[cData.personal.itemId, cData.shared.itemId]]), 0);
  });

  it('공용 물품이 없으면 선택 없이 나갈 수 있다', async () => {
    const x = await makeRoom(2);
    const [m] = x.members;
    const r = await api('DELETE', `${x.base}/members/me`, { token: m.token });
    assert.equal(r.status, 200);
  });

  it('나간 사람이 다른 방에 가입하면 이전 방에는 영향이 없다', async () => {
    const other = await makeRoom(2);
    const join = await api('POST', '/api/rooms/join', { token: b.token, body: { code: other.code } });
    assert.equal(join.status, 200);
    assert.equal(await count('SELECT COUNT(*) AS n FROM items WHERE room_id = ? AND created_by = ?', [room.roomId, b.userId]), 0);
  });

  it('나가는 중에 물품을 계속 등록해도 나간 사람의 데이터가 남지 않는다', async () => {
    const x = await makeRoom(3);
    const [m] = x.members;
    const creates = Array.from({ length: 12 }, (_, i) =>
      api('POST', `${x.base}/items`, { token: m.token, body: { name: `동시 ${i}`, category: 'FOOD', ownershipType: i % 2 ? 'PERSONAL' : 'SHARED' } }));
    const leave = api('DELETE', `${x.base}/members/me?sharedItems=DELETE`, { token: m.token });
    const results = await Promise.all([...creates, leave]);
    const leaveResult = results[results.length - 1];
    assert.equal(leaveResult.status, 200, JSON.stringify(leaveResult.body));
    for (const r of results.slice(0, -1)) assert.ok([201, 404].includes(r.status), `등록은 성공하거나 구성원이 아니라 거절: ${r.status}`);
    assert.equal(await count('SELECT COUNT(*) AS n FROM items WHERE room_id = ? AND created_by = ?', [x.roomId, m.userId]), 0, '남은 데이터 없음');
  });
});

describe('나가기: 정산', () => {
  let room;
  let a;
  let b;
  let c;
  let d;

  before(async () => {
    room = await makeRoom(4);
    a = room.owner;
    [b, c, d] = room.members;
  });

  it('정산이 안 끝났으면 낼 사람도 받을 사람도 나갈 수 없다', async () => {
    const made = await api('POST', `${room.base}/expenses`, { token: b.token, body: { title: '치킨', amount: 20000, expenseDate: '2026-11-05', participantUserIds: [b.userId, c.userId] } });
    const expenseId = made.body.expense.expenseId;

    const debtor = await api('DELETE', `${room.base}/members/me`, { token: c.token });
    assert.equal(debtor.status, 409);
    assert.equal(debtor.body.error.code, 'UNSETTLED_EXPENSES');
    assert.deepEqual(debtor.body.error.details, { owes: 1, owed: 0 });
    const creditor = await api('DELETE', `${room.base}/members/me`, { token: b.token });
    assert.equal(creditor.body.error.code, 'UNSETTLED_EXPENSES');
    assert.deepEqual(creditor.body.error.details, { owes: 0, owed: 1 });

    const free = await api('DELETE', `${room.base}/members/me`, { token: d.token });
    assert.equal(free.status, 200, '관계없는 사람은 나갈 수 있다');

    await api('PATCH', `${room.base}/expenses/${expenseId}/shares/${c.userId}`, { token: b.token, body: { isSettled: true } });
    const afterC = await api('DELETE', `${room.base}/members/me`, { token: c.token });
    assert.equal(afterC.status, 200, '정산이 끝나면 나갈 수 있다');
    const afterB = await api('DELETE', `${room.base}/members/me`, { token: b.token });
    assert.equal(afterB.status, 200);
  });

  it('나간 뒤에도 지출 기록은 방에 남고, 나간 구성원으로 표시된다', async () => {
    const list = await api('GET', `${room.base}/expenses`, { token: a.token });
    assert.equal(list.body.expenses.length, 1);
    const e = list.body.expenses[0];
    assert.equal(e.title, '치킨');
    assert.equal(e.payer.userId, b.userId);
    assert.equal(e.payer.status, 'LEFT');
    assert.deepEqual(e.shares.map((s) => s.user.status), ['LEFT', 'LEFT']);
    assert.equal(e.allSettled, true);
    assert.equal(e.shares.reduce((x, s) => x + s.amount, 0), 20000, '합계는 그대로');
  });
});

describe('내보내기', () => {
  let room;
  let a;
  let b;
  let c;
  let e;

  before(async () => {
    room = await makeRoom(4);
    a = room.owner;
    [b, c, e] = room.members;
  });

  it('정산이 안 끝났어도 방장은 내보낼 수 있고, 기록에는 추방됨으로 남는다', async () => {
    const eData = await seedMemberData(room, e);
    // e가 결제하고 a와 c가 분담 (둘 다 e에게 줄 돈이 남아 있음)
    const made = await api('POST', `${room.base}/expenses`, { token: e.token, body: { title: '쌀', amount: 9000, expenseDate: '2026-11-05', participantUserIds: [e.userId, a.userId, c.userId] } });
    // c가 결제하고 e가 분담 (e가 c에게 줄 돈이 남아 있음)
    await api('POST', `${room.base}/expenses`, { token: c.token, body: { title: '라면', amount: 4000, expenseDate: '2026-11-05', participantUserIds: [c.userId, e.userId] } });

    const selfLeave = await api('DELETE', `${room.base}/members/me`, { token: e.token });
    assert.equal(selfLeave.body.error.code, 'UNSETTLED_EXPENSES', '스스로 나가는 것은 막힌다');

    const notOwner = await api('DELETE', `${room.base}/members/${e.userId}`, { token: b.token });
    assert.equal(notOwner.status, 403);

    const kick = await api('DELETE', `${room.base}/members/${e.userId}`, { token: a.token });
    assert.equal(kick.status, 204, JSON.stringify(kick.body));

    assert.equal(await count("SELECT COUNT(*) AS n FROM room_departures WHERE room_id = ? AND user_id = ? AND reason = 'KICKED'", [room.roomId, e.userId]), 1);
    assert.equal(await count('SELECT COUNT(*) AS n FROM room_members WHERE user_id = ?', [e.userId]), 0);
    assert.equal(await count('SELECT COUNT(*) AS n FROM items WHERE item_id = ?', [eData.personal.itemId]), 0, '개인 물품 삭제');
    assert.equal(await count('SELECT COUNT(*) AS n FROM schedules WHERE schedule_id = ?', [eData.schedule.scheduleId]), 0, '일정 삭제');
    const shared = await api('GET', `${room.base}/items/${eData.shared.itemId}`, { token: a.token });
    assert.equal(shared.body.item.ownerUserId, a.userId, '공용 물품은 항상 방장에게 넘어간다');
    const task = await api('GET', `${room.base}/cleaning-tasks/${eData.task.taskId}`, { token: a.token });
    assert.equal(task.body.task.assignee, null);

    const list = await api('GET', `${room.base}/expenses`, { token: a.token });
    const rice = list.body.expenses.find((x) => x.title === '쌀');
    assert.equal(rice.payer.status, 'KICKED');
    assert.equal(rice.shares.find((s) => s.user.userId === a.userId).isSettled, false, '미정산 분담이 그대로 남는다');
    assert.equal(list.body.expenses.length, 2);
    assert.equal(rice.expenseId, made.body.expense.expenseId);
  });

  it('추방된 사람과의 금액도 요약에 보이고, 결제자가 정산 완료로 정리할 수 있다', async () => {
    const bal = await api('GET', `${room.base}/expenses/balances`, { token: c.token });
    const withE = bal.body.balances.find((x) => x.user.userId === e.userId);
    assert.equal(withE.user.status, 'KICKED');
    assert.equal(withE.amount, -3000 + 2000, 'e에게 줄 3000 - e에게 받을 2000');

    const ricePaid = (await api('GET', `${room.base}/expenses`, { token: a.token })).body.expenses.find((x) => x.title === '라면');
    const settle = await api('PATCH', `${room.base}/expenses/${ricePaid.expenseId}/shares/${e.userId}`, { token: c.token, body: { isSettled: true } });
    assert.equal(settle.status, 200, '나간 사람의 분담도 결제자가 정리할 수 있다');
  });

  it('추방된 사람에게 받을 돈이 남은 사람이 나갈 때는 막히지 않는다', async () => {
    // a는 e에게 3000을 줘야 하지만 e는 이미 방에 없으므로 a의 나가기를 막지 않는다.
    // (방장이라 먼저 위임한다)
    const transfer = await api('POST', `${room.base}/transfer-owner`, { token: a.token, body: { userId: b.userId } });
    assert.equal(transfer.status, 200);
    // 내보낸 e의 공용 물품이 a에게 넘어와 있으므로 처리 방법을 고른다.
    const needChoice = await api('DELETE', `${room.base}/members/me`, { token: a.token });
    assert.equal(needChoice.body.error.code, 'SHARED_ITEMS_CHOICE_REQUIRED');
    const leave = await api('DELETE', `${room.base}/members/me?sharedItems=TRANSFER`, { token: a.token });
    assert.equal(leave.status, 200, JSON.stringify(leave.body));
  });

  it('내보내진 사람은 초대 코드로 다시 가입할 수 있고, 그러면 구성원으로 다시 표시된다', async () => {
    const code = (await api('POST', `${room.base}/invitations`, { token: b.token, body: {} })).body.invite.code;
    const rejoin = await api('POST', '/api/rooms/join', { token: e.token, body: { code } });
    assert.equal(rejoin.status, 200);
    const rice = (await api('GET', `${room.base}/expenses`, { token: b.token })).body.expenses.find((x) => x.title === '쌀');
    assert.equal(rice.payer.status, 'MEMBER');
  });
});

describe('방장이 혼자 남아 나가는 경우', () => {
  it('방이 삭제되고 모든 데이터가 함께 사라진다', async () => {
    const x = await makeRoom(1);
    const today = await dbToday();
    await api('POST', `${x.base}/items`, { token: x.owner.token, body: { name: '혼자', category: 'FOOD', ownershipType: 'SHARED' } });
    await api('POST', `${x.base}/cleaning-tasks`, { token: x.owner.token, body: { areaName: '혼자 청소', nextDueDate: today } });
    await api('POST', `${x.base}/expenses`, { token: x.owner.token, body: { title: '혼자 지출', amount: 1000, expenseDate: today, participantUserIds: [x.owner.userId] } });
    const r = await api('DELETE', `${x.base}/members/me`, { token: x.owner.token });
    assert.equal(r.body.roomDeleted, true);
    for (const t of ['items', 'cleaning_tasks', 'expenses', 'room_invitations', 'room_members']) {
      assert.equal(await count(`SELECT COUNT(*) AS n FROM ${t} WHERE room_id = ?`, [x.roomId]), 0, t);
    }
    assert.equal(await count('SELECT COUNT(*) AS n FROM room_departures WHERE room_id = ?', [x.roomId]), 0);
  });
});
