// 앱 내부 알림 테스트
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { api, makeUser, makeRoom, startServer, stopServer, pool, dbToday } = require('./helpers');
const { addDays } = require('../src/utils/dates');
const { runDailyJobs, runScheduleStartJob } = require('../src/services/notificationJobs');

before(startServer);
after(stopServer);

const list = async (u, query = '') => (await api('GET', `/api/notifications${query}`, { token: u.token })).body;
const ofType = async (u, type) => (await list(u)).notifications.filter((n) => n.type === type);
const dbTime = async (minutes) => (await pool.query(
  "SELECT DATE_FORMAT(DATE_ADD(NOW(), INTERVAL ? MINUTE), '%Y-%m-%d %H:%i:%s') AS t", [minutes]))[0][0].t;

describe('지출 알림', () => {
  let room;
  let a;
  let b;
  let c;

  before(async () => {
    room = await makeRoom(3);
    a = room.owner;
    [b, c] = room.members;
  });

  const expense = (body, token = a.token) => api('POST', `${room.base}/expenses`, { token, body: { title: '장보기', expenseDate: '2026-11-05', ...body } });

  it('지출을 등록하면 결제자를 뺀 분담자에게 알림이 간다', async () => {
    const r = await expense({ amount: 9000, participantUserIds: [a.userId, b.userId, c.userId] });
    const id = r.body.expense.expenseId;
    const forB = await ofType(b, 'EXPENSE_SHARE');
    assert.equal(forB.length, 1);
    assert.equal(forB[0].title, '새 분담금이 생겼어요');
    assert.ok(forB[0].body.includes(a.nickname) && forB[0].body.includes('장보기') && forB[0].body.includes('3,000원'), forB[0].body);
    assert.deepEqual(forB[0].target, { type: 'EXPENSE', id });
    assert.equal(forB[0].isRead, false);
    assert.equal((await ofType(c, 'EXPENSE_SHARE')).length, 1);
    assert.equal((await list(a)).notifications.length, 0, '결제자 본인에게는 알림이 없다');
  });

  it('분담을 다시 정하면 이전 알림은 지워지고 새 알림이 온다', async () => {
    const made = await expense({ title: '재설정', amount: 6000, participantUserIds: [b.userId, c.userId] });
    const id = made.body.expense.expenseId;
    const before = (await ofType(b, 'EXPENSE_SHARE')).filter((n) => n.target.id === id);
    assert.equal(before.length, 1);
    await api('PATCH', `${room.base}/expenses/${id}`, { token: a.token, body: { shares: [{ userId: b.userId, amount: 5000 }, { userId: c.userId, amount: 1000 }] } });
    const afterB = (await ofType(b, 'EXPENSE_SHARE')).filter((n) => n.target.id === id);
    assert.equal(afterB.length, 1, '중복되지 않는다');
    assert.ok(afterB[0].body.includes('5,000원'), afterB[0].body);
    assert.notEqual(afterB[0].notificationId, before[0].notificationId);
  });

  it('정산 완료를 표시하거나 취소하면 분담자에게 알림이 간다', async () => {
    const made = await expense({ title: '정산 알림', amount: 4000, participantUserIds: [a.userId, b.userId] });
    const id = made.body.expense.expenseId;
    const url = `${room.base}/expenses/${id}/shares/${b.userId}`;
    await api('PATCH', url, { token: a.token, body: { isSettled: true } });
    await api('PATCH', url, { token: a.token, body: { isSettled: false } });
    await api('PATCH', url, { token: a.token, body: { isSettled: true } });
    const settled = (await ofType(b, 'EXPENSE_SETTLED')).filter((n) => n.target.id === id);
    assert.equal(settled.length, 3, '표시와 취소를 할 때마다 알림이 간다');
    assert.deepEqual(settled.map((n) => n.title).sort(), ['정산 완료가 취소됐어요', '정산이 완료로 표시됐어요', '정산이 완료로 표시됐어요']);
    assert.ok(settled[0].body.includes('2,000원'));
    assert.equal((await ofType(a, 'EXPENSE_SETTLED')).length, 0, '결제자에게는 가지 않는다');
  });

  it('지출을 삭제하면 그 알림도 사라진다', async () => {
    const made = await expense({ title: '지울 지출', amount: 2000, participantUserIds: [b.userId] });
    const id = made.body.expense.expenseId;
    assert.ok((await ofType(b, 'EXPENSE_SHARE')).some((n) => n.target.id === id));
    await api('DELETE', `${room.base}/expenses/${id}`, { token: a.token });
    assert.ok(!(await ofType(b, 'EXPENSE_SHARE')).some((n) => n.target.id === id));
  });
});

describe('알림 조회와 관리', () => {
  let room;
  let a;
  let b;
  let c;

  before(async () => {
    room = await makeRoom(3);
    a = room.owner;
    [b, c] = room.members;
    for (let i = 1; i <= 5; i += 1) {
      await api('POST', `${room.base}/expenses`, { token: a.token, body: { title: `지출 ${i}`, amount: 1000 * i, expenseDate: '2026-11-05', participantUserIds: [b.userId, c.userId] } });
    }
  });

  it('로그인이 필요하다', async () => {
    for (const [method, path] of [['GET', '/api/notifications'], ['GET', '/api/notifications/unread-count'], ['POST', '/api/notifications/read-all'], ['PATCH', '/api/notifications/1/read'], ['DELETE', '/api/notifications/1']]) {
      const r = await api(method, path);
      assert.equal(r.status, 401, `${method} ${path}`);
      assert.equal(r.body.error.code, 'AUTH_REQUIRED');
    }
  });

  it('목록은 최신순이고 읽지 않은 개수를 함께 준다', async () => {
    const r = await list(b);
    assert.equal(r.notifications.length, 5);
    assert.equal(r.unreadCount, 5);
    assert.equal(r.nextBeforeId, null);
    assert.ok(r.notifications[0].body.includes('지출 5'), '가장 최근 것이 먼저');
    const ids = r.notifications.map((n) => n.notificationId);
    assert.deepEqual(ids, [...ids].sort((x, y) => y - x));
    assert.equal((await api('GET', '/api/notifications/unread-count', { token: b.token })).body.unreadCount, 5);
  });

  it('페이지를 나눠 볼 수 있다', async () => {
    const p1 = await list(b, '?limit=2');
    assert.equal(p1.notifications.length, 2);
    assert.ok(p1.nextBeforeId);
    const p2 = await list(b, `?limit=2&beforeId=${p1.nextBeforeId}`);
    assert.equal(p2.notifications.length, 2);
    assert.ok(p2.notifications[0].notificationId < p1.notifications[1].notificationId);
    const p3 = await list(b, `?limit=2&beforeId=${p2.nextBeforeId}`);
    assert.equal(p3.notifications.length, 1);
    assert.equal(p3.nextBeforeId, null);
    assert.equal((await api('GET', '/api/notifications?limit=0', { token: b.token })).status, 400);
    assert.equal((await api('GET', '/api/notifications?filter=bad', { token: b.token })).status, 400);
  });

  it('읽음 처리: 한 건, 여러 번, 남의 알림은 404', async () => {
    const [first, second] = (await list(b)).notifications;
    const r1 = await api('PATCH', `/api/notifications/${first.notificationId}/read`, { token: b.token });
    assert.equal(r1.status, 200);
    assert.equal(r1.body.unreadCount, 4);
    const again = await api('PATCH', `/api/notifications/${first.notificationId}/read`, { token: b.token });
    assert.equal(again.body.unreadCount, 4, '다시 눌러도 그대로');

    const others = await api('PATCH', `/api/notifications/${second.notificationId}/read`, { token: c.token });
    assert.equal(others.status, 404);
    assert.equal(others.body.error.code, 'NOTIFICATION_NOT_FOUND');
    assert.equal((await api('DELETE', `/api/notifications/${second.notificationId}`, { token: c.token })).status, 404);
    assert.equal((await api('PATCH', '/api/notifications/999999/read', { token: b.token })).status, 404);

    const readOnly = await list(b, '?filter=read');
    assert.equal(readOnly.notifications.length, 1);
    assert.equal(readOnly.notifications[0].isRead, true);
    assert.ok(readOnly.notifications[0].readAt);
    assert.equal((await list(b, '?filter=unread')).notifications.length, 4);
    assert.equal((await list(c)).unreadCount, 5, '다른 사람의 개수는 그대로');
  });

  it('모두 읽음, 한 건 삭제, 읽은 알림 모두 삭제', async () => {
    const all = await api('POST', '/api/notifications/read-all', { token: b.token });
    assert.equal(all.body.updated, 4);
    assert.equal(all.body.unreadCount, 0);
    assert.equal((await list(b, '?filter=unread')).notifications.length, 0);

    const target = (await list(b)).notifications[0];
    assert.equal((await api('DELETE', `/api/notifications/${target.notificationId}`, { token: b.token })).status, 204);
    assert.equal((await list(b)).notifications.length, 4);

    const cleared = await api('DELETE', '/api/notifications/read', { token: b.token });
    assert.equal(cleared.body.deleted, 4);
    assert.equal((await list(b)).notifications.length, 0);
    assert.equal((await list(c)).notifications.length, 5, '다른 사람 알림은 그대로');
  });
});

describe('유통기한 알림', () => {
  let room;
  let a;
  let b;
  let c;
  let today;
  const ids = {};

  const addItem = async (key, u, ownership, daysFromToday, extra = {}) => {
    const r = await api('POST', `${room.base}/items`, { token: u.token, body: {
      name: key, category: 'FOOD', ownershipType: ownership, expiryDate: addDays(today, daysFromToday), ...extra,
    } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    ids[key] = r.body.item.itemId;
  };

  before(async () => {
    room = await makeRoom(3);
    a = room.owner;
    [b, c] = room.members;
    today = await dbToday();
    await addItem('개인3일', b, 'PERSONAL', 3);
    await addItem('공용1일', b, 'SHARED', 1);
    await addItem('공용당일', a, 'SHARED', 0);
    await addItem('개인2일', b, 'PERSONAL', 2);
    await addItem('공용5일', b, 'SHARED', 5);
    await addItem('공용어제', b, 'SHARED', -1);
    await addItem('개인사흘전', b, 'PERSONAL', -3);
    await addItem('공용나흘전', b, 'SHARED', -4);
    await addItem('사용완료1일', b, 'SHARED', 1, { quantity: 0 });
    await api('PATCH', `${room.base}/items/${ids['사용완료1일']}`, { token: b.token, body: { status: 'USED_UP' } });
    await addItem('기한없음', b, 'SHARED', 0);
    await api('PATCH', `${room.base}/items/${ids['기한없음']}`, { token: b.token, body: { expiryDate: null } });
    await runDailyJobs();
  });

  const bodies = async (u) => (await ofType(u, 'ITEM_EXPIRY')).map((n) => `${n.title} | ${n.body}`).sort();

  it('개인 물품은 등록한 사람에게만, 공용 물품은 방 구성원 모두에게 간다', async () => {
    assert.deepEqual(await bodies(b), [
      "유통기한이 3일 남았어요 | 내 '개인3일'",
      "유통기한이 내일까지예요 | 공용 '공용1일'",
      "오늘이 유통기한이에요 | 공용 '공용당일'",
      "유통기한이 지났어요 | 공용 '공용어제'",
      "유통기한이 지났어요 | 내 '개인사흘전'",
    ].sort());
    assert.deepEqual(await bodies(a), [
      "유통기한이 내일까지예요 | 공용 '공용1일'",
      "오늘이 유통기한이에요 | 공용 '공용당일'",
      "유통기한이 지났어요 | 공용 '공용어제'",
    ].sort(), '다른 사람의 개인 물품은 오지 않는다');
    assert.deepEqual(await bodies(c), await bodies(a));
  });

  it('유통기한이 지난 뒤에는 한 번만 알리고, 3일보다 오래 지난 물품은 알리지 않는다', async () => {
    const [keys] = await pool.query(
      "SELECT dedupe_key FROM notifications WHERE type = 'ITEM_EXPIRY' AND target_id = ? AND user_id = ?", [ids['공용어제'], a.userId]);
    assert.equal(keys.length, 1);
    assert.ok(keys[0].dedupe_key.endsWith(':expired'), '며칠이 지났든 같은 키라서 다시 오지 않는다');
    const [old] = await pool.query("SELECT COUNT(*) AS n FROM notifications WHERE type = 'ITEM_EXPIRY' AND target_id = ?", [ids['공용나흘전']]);
    assert.equal(old[0].n, 0);
  });

  it('3일, 1일, 당일이 아닌 물품, 오래 지난 물품, 사용 완료, 기한 없는 물품은 알리지 않는다', async () => {
    for (const key of ['개인2일', '공용5일', '공용나흘전', '사용완료1일', '기한없음']) {
      const [rows] = await pool.query("SELECT COUNT(*) AS n FROM notifications WHERE type = 'ITEM_EXPIRY' AND target_id = ?", [ids[key]]);
      assert.equal(rows[0].n, 0, key);
    }
  });

  it('같은 작업을 다시 실행해도 알림은 늘지 않는다', async () => {
    const [[{ n: before }]] = await pool.query('SELECT COUNT(*) AS n FROM notifications');
    const result = await runDailyJobs();
    const [[{ n: after }]] = await pool.query('SELECT COUNT(*) AS n FROM notifications');
    assert.equal(after, before);
    assert.equal(result.expiry, 0, '새로 만든 알림 수도 0으로 보고한다');
    assert.equal(result.cleaning, 0);
  });

  it('알림에서 이동할 물품 정보가 들어 있고, 물품을 삭제하면 알림도 사라진다', async () => {
    const note = (await ofType(c, 'ITEM_EXPIRY')).find((n) => n.body.includes('공용1일'));
    assert.deepEqual(note.target, { type: 'ITEM', id: ids['공용1일'] });
    await api('DELETE', `${room.base}/items/${ids['공용1일']}`, { token: b.token });
    assert.ok(!(await ofType(c, 'ITEM_EXPIRY')).some((n) => n.target.id === ids['공용1일']));
    assert.ok(!(await ofType(a, 'ITEM_EXPIRY')).some((n) => n.target.id === ids['공용1일']));
  });
});

describe('청소 당번 알림', () => {
  it('오늘이 예정일인 활성 항목의 담당자에게만 간다. 기한이 지난 청소는 알리지 않는다', async () => {
    const room = await makeRoom(3);
    const [a, b, c] = [room.owner, ...room.members];
    const today = await dbToday();
    const mk = async (areaName, body) => (await api('POST', `${room.base}/cleaning-tasks`, { token: a.token, body: { areaName, nextDueDate: today, repeatType: 'WEEKLY', ...body } })).body.task;
    const todayTask = await mk('화장실', { assigneeUserId: b.userId });
    const tomorrow = await mk('거실', { assigneeUserId: b.userId, nextDueDate: addDays(today, 1) });
    const overdue = await mk('주방', { assigneeUserId: c.userId });
    const noAssignee = await mk('현관', {});
    const inactive = await mk('베란다', { assigneeUserId: c.userId });
    await pool.query('UPDATE cleaning_tasks SET next_due_date = DATE_SUB(CURDATE(), INTERVAL 2 DAY) WHERE task_id = ?', [overdue.taskId]);
    await api('PATCH', `${room.base}/cleaning-tasks/${inactive.taskId}`, { token: a.token, body: { isActive: false } });

    await runDailyJobs();
    const forB = await ofType(b, 'CLEANING_DUE');
    assert.equal(forB.length, 1);
    assert.equal(forB[0].title, '오늘은 청소 당번이에요');
    assert.equal(forB[0].body, '화장실');
    assert.deepEqual(forB[0].target, { type: 'CLEANING_TASK', id: todayTask.taskId });
    assert.equal((await ofType(c, 'CLEANING_DUE')).length, 0, '지난 청소와 비활성 항목은 알리지 않는다');
    assert.equal((await ofType(a, 'CLEANING_DUE')).length, 0, '담당자가 없는 항목은 아무에게도 가지 않는다');
    void [tomorrow, noAssignee];

    await runDailyJobs();
    assert.equal((await ofType(b, 'CLEANING_DUE')).length, 1, '다시 실행해도 그대로');

    // 완료하면 다음 주 같은 요일에 다시 알림 대상이 된다 (키에 예정일이 들어 있다)
    await api('POST', `${room.base}/cleaning-tasks/${todayTask.taskId}/complete`, { token: b.token, body: { dueDate: today } });
    await api('DELETE', `${room.base}/cleaning-tasks/${todayTask.taskId}`, { token: a.token });
    assert.equal((await ofType(b, 'CLEANING_DUE')).length, 0, '항목을 삭제하면 알림도 사라진다');
  });
});

describe('일정 시작 전 알림', () => {
  it('1시간 안에 시작하는 일정을 작성자를 뺀 구성원에게 한 번만 알린다', async () => {
    const room = await makeRoom(3);
    const [a, b, c] = [room.owner, ...room.members];
    const mk = async (title, start, end) => (await api('POST', `${room.base}/schedules`, { token: b.token, body: { title, startAt: start, endAt: end } })).body.schedule;
    const soon = await mk('곧 시작', await dbTime(30), await dbTime(90));
    await mk('두 시간 뒤', await dbTime(120), await dbTime(150));
    await mk('이미 시작', await dbTime(-10), await dbTime(50));
    await mk('어제', await dbTime(-1440), await dbTime(-1380));

    await runScheduleStartJob();
    const forA = await ofType(a, 'SCHEDULE_START');
    assert.equal(forA.length, 1);
    assert.equal(forA[0].title, '곧 시작하는 일정이 있어요');
    assert.ok(forA[0].body.startsWith("'곧 시작'") && forA[0].body.endsWith('시작'), forA[0].body);
    assert.deepEqual(forA[0].target, { type: 'SCHEDULE', id: soon.scheduleId });
    assert.equal((await ofType(c, 'SCHEDULE_START')).length, 1);
    assert.equal((await ofType(b, 'SCHEDULE_START')).length, 0, '작성자는 제외');

    await runScheduleStartJob();
    await runScheduleStartJob();
    assert.equal((await ofType(a, 'SCHEDULE_START')).length, 1, '여러 번 실행해도 한 번만');

    // 시작 시각을 옮기면 새 알림이 간다
    await api('PATCH', `${room.base}/schedules/${soon.scheduleId}`, { token: b.token, body: { startAt: await dbTime(45), endAt: await dbTime(100) } });
    await runScheduleStartJob();
    assert.equal((await ofType(a, 'SCHEDULE_START')).length, 2);

    await api('DELETE', `${room.base}/schedules/${soon.scheduleId}`, { token: b.token });
    assert.equal((await ofType(a, 'SCHEDULE_START')).length, 0, '일정을 삭제하면 알림도 사라진다');
  });
});

describe('방을 나갈 때 알림 정리', () => {
  it('나간 사람의 알림이 지워지고, 삭제되는 공용 물품의 알림도 다른 사람에게서 사라진다', async () => {
    const room = await makeRoom(3);
    const [a, b, c] = [room.owner, ...room.members];
    const today = await dbToday();
    const mkItem = async (name, own) => (await api('POST', `${room.base}/items`, { token: b.token, body: { name, category: 'FOOD', ownershipType: own, expiryDate: addDays(today, 1) } })).body.item;
    const sharedKeep = await mkItem('남길 공용', 'SHARED');
    await api('POST', `${room.base}/expenses`, { token: a.token, body: { title: '정산', amount: 2000, expenseDate: '2026-11-05', participantUserIds: [a.userId, c.userId] } });
    await runDailyJobs();
    assert.equal((await ofType(c, 'ITEM_EXPIRY')).length, 1);
    assert.ok((await list(b)).notifications.length >= 1);

    // b는 정산과 무관하므로 나갈 수 있다. 공용 물품은 방장에게 넘긴다.
    const leave = await api('DELETE', `${room.base}/members/me?sharedItems=TRANSFER`, { token: b.token });
    assert.equal(leave.status, 200, JSON.stringify(leave.body));
    const [mine] = await pool.query('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?', [b.userId]);
    assert.equal(mine[0].n, 0, '나간 사람의 알림은 모두 삭제');
    assert.equal((await ofType(c, 'ITEM_EXPIRY')).filter((n) => n.target.id === sharedKeep.itemId).length, 1, '방에 남는 물품의 알림은 그대로');

    // 이번에는 삭제를 고르는 사람
    const d = await makeUser();
    const code = (await api('POST', `${room.base}/invitations`, { token: a.token, body: {} })).body.invite.code;
    await api('POST', '/api/rooms/join', { token: d.token, body: { code } });
    const gone = (await api('POST', `${room.base}/items`, { token: d.token, body: { name: '삭제될 공용', category: 'FOOD', ownershipType: 'SHARED', expiryDate: addDays(today, 1) } })).body.item;
    await runDailyJobs();
    assert.ok((await ofType(c, 'ITEM_EXPIRY')).some((n) => n.target.id === gone.itemId));
    await api('DELETE', `${room.base}/members/me?sharedItems=DELETE`, { token: d.token });
    assert.ok(!(await ofType(c, 'ITEM_EXPIRY')).some((n) => n.target.id === gone.itemId), '삭제된 물품의 알림은 사라진다');
    assert.ok(!(await ofType(a, 'ITEM_EXPIRY')).some((n) => n.target.id === gone.itemId));
  });

  it('내보낸 사람의 정산을 정리해도 방에 없는 사람에게는 알림이 가지 않는다', async () => {
    const room = await makeRoom(3);
    const [a, b, c] = [room.owner, ...room.members];
    const made = await api('POST', `${room.base}/expenses`, { token: a.token, body: { title: '식비', amount: 4000, expenseDate: '2026-11-05', participantUserIds: [a.userId, c.userId] } });
    await api('DELETE', `${room.base}/members/${c.userId}`, { token: a.token });
    const [afterKick] = await pool.query('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?', [c.userId]);
    assert.equal(afterKick[0].n, 0);
    const settle = await api('PATCH', `${room.base}/expenses/${made.body.expense.expenseId}/shares/${c.userId}`, { token: a.token, body: { isSettled: true } });
    assert.equal(settle.status, 200);
    const [after] = await pool.query('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?', [c.userId]);
    assert.equal(after[0].n, 0, '나간 사람에게는 새 알림이 생기지 않는다');
    void b;
  });
});
