// 청소 담당자 바꾸기(이번 회차만 / 앞으로 계속), 담당자 변경 이력, 방 전체 이력, 매일·한 번만 반복
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { api, makeUser, makeRoom, startServer, stopServer, dbToday } = require('./helpers');
const { addDays } = require('../src/utils/dates');

before(startServer);
after(stopServer);

const SAT = 6;

/** 방장 + 구성원 2명. 거실(방장)·주방(b)·욕실(c)을 저장해 둔 상태. */
async function setup({ rotation = false, repeat = 'WEEKLY' } = {}) {
  const room = await makeRoom(3);
  const [b, c] = room.members;
  const today = await dbToday();
  const save = (body, token = room.owner.token) => api('PUT', `${room.base}/cleaning-settings`, { token, body });
  await save({
    repeat, rotation,
    rows: [
      { userId: room.owner.userId, areaName: '거실', weekday: SAT },
      { userId: b.userId, areaName: '주방', weekday: SAT },
      { userId: c.userId, areaName: '욕실', weekday: SAT },
    ],
  });
  const tasks = async (active = 'true') =>
    (await api('GET', `${room.base}/cleaning-tasks?active=${active}`, { token: room.owner.token })).body.tasks;
  const find = async (area) => (await tasks()).find((t) => t.areaName === area);
  const reassign = (taskId, body, token = room.owner.token) =>
    api('POST', `${room.base}/cleaning-tasks/${taskId}/reassign`, { token, body });
  const complete = (taskId, token = room.owner.token, body = {}) =>
    api('POST', `${room.base}/cleaning-tasks/${taskId}/complete`, { token, body });
  const history = async (query = '', token = room.owner.token) =>
    (await api('GET', `${room.base}/cleaning-history${query}`, { token })).body.events;
  return { room, owner: room.owner, b, c, today, save, tasks, find, reassign, complete, history };
}

describe('청소 담당자 바꾸기', () => {
  it('이번 회차만: 대신할 사람이 담당이 되고, 회차가 끝나면 원래 담당자로 돌아간다', async () => {
    const { b, owner, find, reassign, complete } = await setup();
    const living = await find('거실'); // 방장 담당
    assert.equal(living.isSubstitute, false);

    const r = await reassign(living.taskId, { assigneeUserId: b.userId, scope: 'ONCE', reason: '시험 기간' }, owner.token);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.task.assignee.userId, b.userId);
    assert.equal(r.body.task.isSubstitute, true);
    assert.equal(r.body.task.baseAssignee.userId, owner.userId, '원래 담당자를 알려준다');

    // 완료하면 다음 회차는 원래 담당자(방장)로 돌아간다.
    const done = await complete(living.taskId, b.token);
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(done.body.task.assignee.userId, owner.userId);
    assert.equal(done.body.task.isSubstitute, false);
    assert.equal(done.body.task.baseAssignee, null);
  });

  it('이번 회차만 + 순환: 원래 담당자를 기준으로 다음 사람에게 넘어간다', async () => {
    const { b, c, owner, find, reassign, complete } = await setup({ rotation: true });
    const living = await find('거실'); // 순번: 방장(1) → b(2) → c(3)

    // 방장 대신 c가 이번만 청소
    await reassign(living.taskId, { assigneeUserId: c.userId, scope: 'ONCE' });
    const done = await complete(living.taskId, c.token);
    // 순환 기준은 대신한 c가 아니라 원래 담당자(방장)이므로 다음은 b
    assert.equal(done.body.task.assignee.userId, b.userId);
    assert.ok(owner.userId);
  });

  it('앞으로 계속: 그대로 새 담당자가 되고 원래 담당자 표시는 없다', async () => {
    const { b, find, reassign, complete } = await setup();
    const living = await find('거실');
    const r = await reassign(living.taskId, { assigneeUserId: b.userId, scope: 'ALWAYS' });
    assert.equal(r.body.task.assignee.userId, b.userId);
    assert.equal(r.body.task.isSubstitute, false);
    assert.equal(r.body.task.baseAssignee, null);

    const done = await complete(living.taskId, b.token);
    assert.equal(done.body.task.assignee.userId, b.userId, '다음 회차에도 계속 새 담당자');
  });

  it('이미 대신하는 중에 또 바꿔도 되돌아갈 곳은 처음 담당자이고, 원래 담당자로 바꾸면 대신 상태가 풀린다', async () => {
    const { b, c, owner, find, reassign } = await setup();
    const living = await find('거실');
    await reassign(living.taskId, { assigneeUserId: b.userId, scope: 'ONCE' });
    const second = await reassign(living.taskId, { assigneeUserId: c.userId, scope: 'ONCE' });
    assert.equal(second.body.task.baseAssignee.userId, owner.userId, '처음 담당자 그대로');

    const back = await reassign(living.taskId, { assigneeUserId: owner.userId, scope: 'ONCE' });
    assert.equal(back.body.task.assignee.userId, owner.userId);
    assert.equal(back.body.task.isSubstitute, false);
  });

  it('방 구성원 누구나 바꿀 수 있고, 현재 회차의 예정 기록에도 반영된다', async () => {
    const { room, owner, b, c, find, reassign } = await setup();
    const kitchen = await find('주방'); // b 담당
    const r = await reassign(kitchen.taskId, { assigneeUserId: owner.userId, scope: 'ALWAYS' }, c.token);
    assert.equal(r.status, 200, '담당자도 방장도 아닌 구성원도 바꿀 수 있다');

    const recs = await api('GET', `${room.base}/cleaning-tasks/${kitchen.taskId}/records`, { token: owner.token });
    assert.equal(recs.body.records.find((x) => x.status === 'SCHEDULED').assignee.userId, owner.userId);
    assert.ok(b.userId);
  });

  it('검증: 같은 사람, 방 구성원이 아닌 사람, 잘못된 값, 오래된 예정일, 구성원이 아닌 요청자', async () => {
    const { room, owner, find, reassign } = await setup();
    const outsider = await makeUser();
    const living = await find('거실');

    const same = await reassign(living.taskId, { assigneeUserId: owner.userId, scope: 'ONCE' });
    assert.equal(same.status, 400);
    assert.equal(same.body.error.code, 'SAME_ASSIGNEE');

    const notMember = await reassign(living.taskId, { assigneeUserId: outsider.userId, scope: 'ONCE' });
    assert.equal(notMember.body.error.code, 'ASSIGNEE_NOT_MEMBER');

    for (const body of [{ scope: 'ONCE' }, { assigneeUserId: owner.userId + 1, scope: 'SOMETIMES' }, { assigneeUserId: 'x', scope: 'ONCE' }]) {
      assert.equal((await reassign(living.taskId, body)).status, 400, JSON.stringify(body));
    }

    const stale = await reassign(living.taskId, { assigneeUserId: room.members[0].userId, scope: 'ONCE', dueDate: '2020-01-01' });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.code, 'STALE_DUE_DATE');

    const asOutsider = await reassign(living.taskId, { assigneeUserId: room.members[0].userId, scope: 'ONCE' }, outsider.token);
    assert.equal(asOutsider.status, 404);

    // 거절된 요청은 아무것도 바꾸지 않고 이력도 남기지 않는다.
    assert.equal((await find('거실')).assignee.userId, owner.userId);
  });

  it('이번 회차만 대신하던 원래 담당자가 방을 나가면 원래 담당자 표시가 지워진다', async () => {
    const { room, owner, b, find, reassign, complete } = await setup();
    const living = await find('거실');
    await reassign(living.taskId, { assigneeUserId: b.userId, scope: 'ONCE' });
    // 원래 담당자는 방장이라 나갈 수 없으므로, 대신하던 사람의 원래 담당자를 b로 바꿔 시험한다.
    const kitchen = await find('주방'); // b 담당
    await reassign(kitchen.taskId, { assigneeUserId: owner.userId, scope: 'ONCE' }); // 원래 b
    const left = await api('DELETE', `${room.base}/members/me?sharedItems=DELETE`, { token: b.token });
    assert.equal(left.status, 200, JSON.stringify(left.body));

    const after = await find('주방');
    assert.equal(after.baseAssignee, null);
    assert.equal(after.isSubstitute, false);
    const done = await complete(after.taskId, owner.token);
    assert.equal(done.status, 200, JSON.stringify(done.body));
  });
});

describe('청소 이력(담당자 변경 포함)', () => {
  it('담당자를 바꾸면 누가·누구에서 누구로·이번만/계속·사유가 이력에 남는다', async () => {
    const { owner, b, c, find, reassign, history } = await setup();
    const living = await find('거실');
    await reassign(living.taskId, { assigneeUserId: b.userId, scope: 'ONCE', reason: '시험 기간' }, c.token);

    const events = await history();
    const change = events.find((e) => e.type === 'REASSIGNED');
    assert.ok(change, JSON.stringify(events));
    assert.equal(change.areaName, '거실');
    assert.equal(change.fromAssignee.userId, owner.userId);
    assert.equal(change.toAssignee.userId, b.userId);
    assert.equal(change.changedBy.userId, c.userId, '바꾼 사람이 남는다');
    assert.equal(change.scope, 'ONCE');
    assert.equal(change.memo, '시험 기간');
    assert.equal(change.dueDate, living.nextDueDate, '어느 회차에서 바꿨는지');
  });

  it('청소 항목 수정(PATCH)과 청소당번 설정에서 담당자를 바꿔도 이력이 남는다', async () => {
    const { room, owner, b, c, save, find, history } = await setup();
    const kitchen = await find('주방'); // b 담당

    // PATCH로 변경
    const patch = await api('PATCH', `${room.base}/cleaning-tasks/${kitchen.taskId}`, { token: owner.token, body: { assigneeUserId: c.userId } });
    assert.equal(patch.status, 200, JSON.stringify(patch.body));

    // 설정으로 변경: 거실 담당을 방장 → b
    const rows = (await api('GET', `${room.base}/cleaning-settings`, { token: owner.token })).body.settings.rows;
    await save({
      repeat: 'WEEKLY', rotation: false,
      rows: rows.map((r) => ({ taskId: r.taskId, userId: r.areaName === '거실' ? b.userId : r.userId, areaName: r.areaName, weekday: r.weekday })),
    });

    const changes = (await history()).filter((e) => e.type === 'REASSIGNED');
    assert.equal(changes.length, 2);
    assert.ok(changes.every((e) => e.scope === 'ALWAYS'));
    assert.deepEqual(changes.map((e) => e.areaName).sort(), ['거실', '주방']);
    assert.ok(changes.find((e) => e.areaName === '주방').changedBy.userId === owner.userId);
    assert.ok(find);
  });

  it('바꾸지 않고 저장만 하면 변경 이력이 생기지 않는다', async () => {
    const { room, owner, save, history } = await setup();
    const rows = (await api('GET', `${room.base}/cleaning-settings`, { token: owner.token })).body.settings.rows;
    await save({ repeat: 'WEEKLY', rotation: false, rows: rows.map((r) => ({ taskId: r.taskId, userId: r.userId, areaName: r.areaName, weekday: r.weekday })) });
    assert.equal((await history()).filter((e) => e.type === 'REASSIGNED').length, 0);
  });

  it('방 전체 이력: 완료·건너뜀·미룸·담당자 변경이 회차 기준 최근순으로 나온다', async () => {
    const { room, owner, b, find, reassign, complete, history } = await setup();
    const living = await find('거실');
    const kitchen = await find('주방');
    const bath = await find('욕실');

    await reassign(living.taskId, { assigneeUserId: b.userId, scope: 'ONCE' });
    await complete(living.taskId, b.token, { memo: '대신 했어요' });
    // 주방은 b가 담당이라 건너뛰기도 b가 한다. (방장은 할 수 없다.)
    assert.equal((await api('POST', `${room.base}/cleaning-tasks/${kitchen.taskId}/skip`, { token: owner.token, body: {} })).status, 403);
    await api('POST', `${room.base}/cleaning-tasks/${kitchen.taskId}/skip`, { token: b.token, body: { memo: '여행' } });
    await api('POST', `${room.base}/cleaning-tasks/${bath.taskId}/postpone`, {
      token: owner.token, body: { postponedTo: addDays(bath.nextDueDate, 2), memo: '손님' },
    });

    const events = await history();
    assert.deepEqual(events.map((e) => e.type).sort(), ['DONE', 'POSTPONED', 'REASSIGNED', 'SKIPPED']);

    const done = events.find((e) => e.type === 'DONE');
    assert.equal(done.completedBy.userId, b.userId);
    assert.equal(done.memo, '대신 했어요');
    assert.equal(events.find((e) => e.type === 'SKIPPED').memo, '여행');
    assert.equal(events.find((e) => e.type === 'POSTPONED').postponedTo, addDays(bath.nextDueDate, 2));

    // 같은 회차(거실)에서는 완료가 담당자 변경보다 먼저(더 나중 일) 나온다.
    const livingEvents = events.filter((e) => e.areaName === '거실').map((e) => e.type);
    assert.deepEqual(livingEvents, ['DONE', 'REASSIGNED']);

    // 한 청소만, 그리고 limit
    const only = await history(`?taskId=${living.taskId}`);
    assert.ok(only.every((e) => e.taskId === living.taskId));
    assert.equal((await history('?limit=2')).length, 2);
    assert.equal((await api('GET', `${room.base}/cleaning-history?limit=0`, { token: owner.token })).status, 400);
  });

  it('구성원이 아니면 이력을 볼 수 없다', async () => {
    const { room } = await setup();
    const outsider = await makeUser();
    assert.equal((await api('GET', `${room.base}/cleaning-history`, { token: outsider.token })).status, 404);
    assert.equal((await api('GET', `${room.base}/cleaning-history`)).status, 401);
  });
});

describe('청소 담당자 변경 알림', () => {
  const noticesOf = async (user) =>
    (await api('GET', '/api/notifications?limit=50', { token: user.token })).body.notifications
      .filter((n) => n.type === 'CLEANING_REASSIGNED');

  it('새 담당자와 원래 담당자에게 알림이 가고, 바꾼 사람과 관계없는 사람에게는 가지 않는다', async () => {
    const { owner, b, c, find, reassign } = await setup();
    const living = await find('거실'); // 방장 담당

    // c가 방장의 거실 청소를 b에게 이번 회차만 맡긴다.
    const r = await reassign(living.taskId, { assigneeUserId: b.userId, scope: 'ONCE' }, c.token);
    assert.equal(r.status, 200, JSON.stringify(r.body));

    const forNew = await noticesOf(b);
    assert.equal(forNew.length, 1);
    assert.equal(forNew[0].title, '청소 담당이 되었어요');
    assert.ok(forNew[0].body.includes('거실') && forNew[0].body.includes('이번 회차만') && forNew[0].body.includes(c.nickname), forNew[0].body);
    assert.deepEqual(forNew[0].target, { type: 'CLEANING_TASK', id: living.taskId }, '누르면 그 청소로 이동');
    assert.equal(forNew[0].isRead, false);

    const forOld = await noticesOf(owner);
    assert.equal(forOld.length, 1);
    assert.equal(forOld[0].title, '청소 담당에서 빠졌어요');
    assert.ok(forOld[0].body.includes('이번 회차만') && forOld[0].body.includes(b.nickname), forOld[0].body);

    assert.equal((await noticesOf(c)).length, 0, '바꾼 사람은 알림을 받지 않는다');
  });

  it('앞으로 계속 바꾸면 문구가 "앞으로"로 나온다', async () => {
    const { owner, b, find, reassign } = await setup();
    const kitchen = await find('주방'); // b 담당
    await reassign(kitchen.taskId, { assigneeUserId: owner.userId, scope: 'ALWAYS' }, owner.token);

    // 바꾼 사람(방장)은 받지 않고, 원래 담당자 b만 받는다.
    assert.equal((await noticesOf(owner)).length, 0);
    const forOld = await noticesOf(b);
    assert.equal(forOld.length, 1);
    assert.ok(forOld[0].body.includes('앞으로'), forOld[0].body);
  });

  it('청소 항목 수정(PATCH)과 청소당번 설정으로 바꿔도 알림이 간다', async () => {
    const { room, owner, b, c, save, find } = await setup();
    const kitchen = await find('주방'); // b 담당

    // PATCH: 주방 담당을 c로 (방장이 바꿈) → c는 새 담당, b는 빠진 사람
    await api('PATCH', `${room.base}/cleaning-tasks/${kitchen.taskId}`, { token: owner.token, body: { assigneeUserId: c.userId } });
    assert.equal((await noticesOf(c)).length, 1);
    assert.equal((await noticesOf(b)).length, 1);

    // 설정: 거실 담당을 방장 → b (b가 바꿈): 방장이 빠진 사람, b는 바꾼 사람이라 받지 않는다.
    const rows = (await api('GET', `${room.base}/cleaning-settings`, { token: owner.token })).body.settings.rows;
    await save({
      repeat: 'WEEKLY', rotation: false,
      rows: rows.map((r) => ({ taskId: r.taskId, userId: r.areaName === '거실' ? b.userId : r.userId, areaName: r.areaName, weekday: r.weekday })),
    }, b.token);
    assert.equal((await noticesOf(owner)).length, 1);
    assert.equal((await noticesOf(b)).length, 1, 'b는 처음의 1건뿐이고 자기가 바꾼 것은 받지 않는다');
  });

  it('바꾸지 않고 저장만 하거나 거절된 요청은 알림을 만들지 않는다', async () => {
    const { room, owner, b, c, save, find, reassign } = await setup();
    const rows = (await api('GET', `${room.base}/cleaning-settings`, { token: owner.token })).body.settings.rows;
    await save({ repeat: 'WEEKLY', rotation: false, rows: rows.map((r) => ({ taskId: r.taskId, userId: r.userId, areaName: r.areaName, weekday: r.weekday })) });

    const living = await find('거실');
    await reassign(living.taskId, { assigneeUserId: owner.userId, scope: 'ONCE' }); // 이미 담당 → 400
    for (const u of [owner, b, c]) assert.equal((await noticesOf(u)).length, 0);
  });

  it('청소 항목을 삭제하면 그 알림도 사라진다', async () => {
    const { room, owner, b, find, reassign } = await setup();
    const living = await find('거실');
    await reassign(living.taskId, { assigneeUserId: b.userId, scope: 'ALWAYS' }, owner.token);
    assert.equal((await noticesOf(b)).length, 1);

    const del = await api('DELETE', `${room.base}/cleaning-tasks/${living.taskId}`, { token: owner.token });
    assert.equal(del.status, 204);
    assert.equal((await noticesOf(b)).length, 0);
  });
});

describe('청소 주기: 매일 / 한 번만', () => {
  it('매일 반복: 첫 예정일이 오늘이고, 요일은 상관없다', async () => {
    const { today, find, tasks } = await setup({ repeat: 'DAILY' });
    const list = await tasks();
    assert.ok(list.every((t) => t.repeatType === 'DAILY' && t.repeatInterval === 1));
    assert.ok(list.every((t) => t.nextDueDate === today));

    // 완료하면 내일로 넘어간다.
    const living = await find('거실');
    assert.equal(living.nextDueDate, today);
  });

  it('매일 반복 완료: 다음 예정일은 내일', async () => {
    const { today, find, complete } = await setup({ repeat: 'DAILY' });
    const living = await find('거실');
    const done = await complete(living.taskId);
    assert.equal(done.body.task.nextDueDate, addDays(today, 1));
  });

  it('한 번만: 그 요일에 한 번 하고, 완료하면 목록에서 빠진다', async () => {
    const { b, today, find, tasks, complete, save, room } = await setup({ repeat: 'NONE' });
    const living = await find('거실');
    assert.equal(living.repeatType, 'NONE');
    assert.ok(living.nextDueDate >= today);

    const done = await complete(living.taskId);
    assert.equal(done.body.task.isActive, false, '반복이 없으면 완료 뒤 비활성');
    assert.equal((await tasks()).find((t) => t.areaName === '거실'), undefined);

    // 설정 조회에서도 반복 값이 그대로 나온다.
    const settings = (await api('GET', `${room.base}/cleaning-settings`, { token: room.owner.token })).body.settings;
    assert.equal(settings.repeat, 'NONE');
    assert.ok(b && save);
  });

  it('다른 청소를 내 예정일로 미뤄 둬도 내 청소가 "미룸"으로 표시되지 않는다 (항목별로 구분)', async () => {
    const { room, owner, today } = await setup();
    const make = async (areaName, nextDueDate) =>
      (await api('POST', `${room.base}/cleaning-tasks`, {
        token: owner.token, body: { areaName, nextDueDate, repeatType: 'WEEKLY' },
      })).body.task;

    // X는 오늘이 예정일, Y는 3일 뒤가 예정일. X를 3일 뒤(= Y의 예정일)로 미룬다.
    const x = await make('청소X', today);
    const y = await make('청소Y', addDays(today, 3));
    const post = await api('POST', `${room.base}/cleaning-tasks/${x.taskId}/postpone`, {
      token: owner.token, body: { postponedTo: addDays(today, 3) },
    });
    assert.equal(post.status, 200, JSON.stringify(post.body));
    assert.equal(post.body.task.isPostponed, true);

    // Y는 같은 날짜에 놓였을 뿐 Y 자신은 미루지 않았으므로 미룰 수 있어야 한다.
    const list = (await api('GET', `${room.base}/cleaning-tasks`, { token: owner.token })).body.tasks;
    assert.equal(list.find((t) => t.taskId === y.taskId).isPostponed, false);
    assert.equal(list.find((t) => t.taskId === x.taskId).isPostponed, true);
    const yPost = await api('POST', `${room.base}/cleaning-tasks/${y.taskId}/postpone`, {
      token: owner.token, body: { postponedTo: addDays(today, 5) },
    });
    assert.equal(yPost.status, 200, JSON.stringify(yPost.body));
  });
});


describe('도움받은 횟수 (프로필)', () => {
  it('내 청소를 다른 사람이 대신 끝내 줘야 센다 (넘기기만 하거나 앞으로 계속 바꾼 것은 세지 않는다)', async () => {
    const { b, owner, find, reassign, complete } = await setup();
    const me = async () => (await api('GET', '/api/users/me', { token: owner.token })).body.user.stats;
    assert.equal((await me()).helpedCleanings, 0);

    const living = await find('거실');
    await reassign(living.taskId, { assigneeUserId: b.userId, scope: 'ONCE' }, owner.token);
    assert.equal((await me()).helpedCleanings, 0, '넘기기만 한 단계에서는 아직 아니다');

    await complete(living.taskId, b.token);
    const stats = await me();
    assert.equal(stats.helpedCleanings, 1);
    assert.equal(stats.completedCleanings, 0, '내가 직접 끝낸 횟수는 늘지 않는다');
    const other = (await api('GET', '/api/users/me', { token: b.token })).body.user.stats;
    assert.equal(other.helpedCleanings, 0);
    assert.equal(other.completedCleanings, 1);
  });

  it('내가 직접 끝내면 도움받은 횟수가 아니다', async () => {
    const { b, owner, find, reassign, complete } = await setup();
    const living = await find('거실');
    await reassign(living.taskId, { assigneeUserId: b.userId, scope: 'ONCE' }, owner.token);
    await reassign(living.taskId, { assigneeUserId: owner.userId, scope: 'ONCE' }, owner.token);
    await complete(living.taskId, owner.token);
    assert.equal((await api('GET', '/api/users/me', { token: owner.token })).body.user.stats.helpedCleanings, 0);
  });
});