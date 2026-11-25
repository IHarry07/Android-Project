// 청소당번 설정(구성원별 담당 구역·요일, 반복 주기, 순번 순환) 테스트
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { api, makeUser, makeRoom, startServer, stopServer, dbToday } = require('./helpers');
const { addDays } = require('../src/utils/dates');

before(startServer);
after(stopServer);

const SAT = 6;
const SUN = 0;
const WED = 3;
const weekdayOf = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();

/** 방장 + 구성원 2명이 있는 새 방. 테스트끼리 영향을 주지 않도록 매번 새로 만든다. */
async function setup() {
  const room = await makeRoom(3);
  const [b, c] = room.members;
  const today = await dbToday();
  const save = (body, token = room.owner.token) => api('PUT', `${room.base}/cleaning-settings`, { token, body });
  const get = (token = room.owner.token) => api('GET', `${room.base}/cleaning-settings`, { token });
  const tasks = async (active = 'true') =>
    (await api('GET', `${room.base}/cleaning-tasks?active=${active}`, { token: room.owner.token })).body.tasks;
  const rows = [
    { userId: room.owner.userId, areaName: '거실', weekday: SAT },
    { userId: b.userId, areaName: '주방', weekday: SUN },
    { userId: c.userId, areaName: '욕실', weekday: SAT },
  ];
  return { room, owner: room.owner, b, c, today, save, get, tasks, rows };
}

describe('청소당번 설정', () => {
  it('처음에는 비어 있다', async () => {
    const { get } = await setup();
    const r = await get();
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.settings, { repeat: 'WEEKLY', rotation: false, rows: [] });
  });

  it('저장: 구성원별 담당 구역·요일이 항목으로 만들어지고, 순번은 줄 순서', async () => {
    const { owner, b, c, today, save, get, tasks, rows } = await setup();
    const r = await save({ repeat: 'WEEKLY', rotation: true, rows });
    assert.equal(r.status, 200, JSON.stringify(r.body));

    const s = r.body.settings;
    assert.equal(s.repeat, 'WEEKLY');
    assert.equal(s.rotation, true);
    assert.deepEqual(s.rows.map((x) => [x.userId, x.areaName, x.weekday]),
      [[owner.userId, '거실', SAT], [b.userId, '주방', SUN], [c.userId, '욕실', SAT]]);
    assert.equal(s.rows[0].nickname, owner.nickname);

    // 예정일은 오늘 이후 가장 가까운 그 요일
    for (const row of s.rows) {
      assert.equal(weekdayOf(row.nextDueDate), row.weekday);
      assert.ok(row.nextDueDate >= today);
    }

    const list = await tasks();
    assert.equal(list.length, 3);
    assert.ok(list.every((t) => t.rotationEnabled && t.repeatType === 'WEEKLY' && t.repeatInterval === 1));
    const again = await get();
    assert.deepEqual(again.body.settings.rows.map((x) => x.areaName), ['거실', '주방', '욕실']);
  });

  it('저장하면 각 항목에 첫 예정 기록이 생긴다', async () => {
    const { room, owner, save, tasks, rows } = await setup();
    await save({ repeat: 'WEEKLY', rotation: false, rows });
    const [first] = await tasks();
    const recs = await api('GET', `${room.base}/cleaning-tasks/${first.taskId}/records`, { token: owner.token });
    assert.equal(recs.body.records.length, 1);
    assert.equal(recs.body.records[0].status, 'SCHEDULED');
  });

  it('반복 주기: 격주는 2주 간격, 매월은 1개월 간격으로 저장된다', async () => {
    const { save, get, tasks, rows } = await setup();
    await save({ repeat: 'BIWEEKLY', rotation: false, rows });
    let list = await tasks();
    assert.ok(list.every((t) => t.repeatType === 'WEEKLY' && t.repeatInterval === 2));
    assert.equal((await get()).body.settings.repeat, 'BIWEEKLY');

    const existing = (await get()).body.settings.rows;
    await save({ repeat: 'MONTHLY', rotation: false, rows: existing.map((x) => ({ taskId: x.taskId, userId: x.userId, areaName: x.areaName, weekday: x.weekday })) });
    list = await tasks();
    assert.ok(list.every((t) => t.repeatType === 'MONTHLY' && t.repeatInterval === 1));
    assert.equal((await get()).body.settings.repeat, 'MONTHLY');
  });

  it('다시 저장: 같은 항목은 고치고, 새 줄은 만들고, 빠진 항목은 비활성(이력은 남김)', async () => {
    const { room, owner, b, c, save, get, tasks, rows } = await setup();
    const first = (await save({ repeat: 'WEEKLY', rotation: false, rows })).body.settings.rows;
    const living = first.find((x) => x.areaName === '거실');
    const kitchen = first.find((x) => x.areaName === '주방');

    const second = await save({
      repeat: 'WEEKLY', rotation: false,
      rows: [
        { taskId: living.taskId, userId: owner.userId, areaName: '거실·복도', weekday: SAT },
        { userId: c.userId, areaName: '베란다', weekday: WED },
      ],
    });
    assert.equal(second.status, 200, JSON.stringify(second.body));
    const rowsNow = second.body.settings.rows;
    assert.deepEqual(rowsNow.map((x) => x.areaName), ['거실·복도', '베란다']);
    assert.equal(rowsNow[0].taskId, living.taskId, '같은 항목은 번호가 그대로');
    assert.equal(rowsNow[0].nextDueDate, living.nextDueDate, '요일이 같으면 예정일을 유지');
    assert.equal(weekdayOf(rowsNow[1].nextDueDate), WED);

    const active = await tasks();
    assert.equal(active.length, 2);
    const all = await tasks('all');
    assert.equal(all.length, 4);
    assert.equal(all.find((t) => t.taskId === kitchen.taskId).isActive, false);

    const recs = await api('GET', `${room.base}/cleaning-tasks/${kitchen.taskId}/records`, { token: owner.token });
    assert.equal(recs.body.records.length, 1, '비활성이 된 항목의 이력은 남는다');
    assert.ok(b.userId);
    assert.equal((await get()).body.settings.rows.length, 2);
  });

  it('순환: 완료하면 다음 회차 담당자가 순번대로 넘어가고, 끝에서는 처음으로 돌아간다', async () => {
    const { room, owner, b, c, save, tasks, rows } = await setup();
    await save({ repeat: 'WEEKLY', rotation: true, rows });
    const living = (await tasks()).find((t) => t.areaName === '거실');
    assert.equal(living.assignee.userId, owner.userId);

    // 완료는 그때그때의 담당자가 한다. (방장 → b → c 순서로 담당자가 바뀐다.)
    const tokenOf = new Map([[owner.userId, owner.token], [b.userId, b.token], [c.userId, c.token]]);
    let current = owner.userId;
    const complete = async () => {
      const task = (await api('POST', `${room.base}/cleaning-tasks/${living.taskId}/complete`, { token: tokenOf.get(current), body: {} })).body.task;
      current = task.assignee.userId;
      return task;
    };

    assert.equal((await complete()).assignee.userId, b.userId);
    assert.equal((await complete()).assignee.userId, c.userId);
    const wrapped = await complete();
    assert.equal(wrapped.assignee.userId, owner.userId, '마지막 다음은 처음');

    // 새 회차 기록도 새 담당자로 만들어진다.
    const recs = await api('GET', `${room.base}/cleaning-tasks/${living.taskId}/records`, { token: owner.token });
    const scheduled = recs.body.records.find((r) => r.status === 'SCHEDULED');
    assert.equal(scheduled.assignee.userId, owner.userId);
  });

  it('건너뛰어도 순환하고, 미루기는 담당자를 바꾸지 않는다', async () => {
    const { room, owner, b, save, tasks, rows } = await setup();
    await save({ repeat: 'WEEKLY', rotation: true, rows });
    const living = (await tasks()).find((t) => t.areaName === '거실');

    const post = await api('POST', `${room.base}/cleaning-tasks/${living.taskId}/postpone`, {
      token: owner.token, body: { postponedTo: addDays(living.nextDueDate, 1) },
    });
    assert.equal(post.status, 200, JSON.stringify(post.body));
    assert.equal(post.body.task.assignee.userId, owner.userId, '미뤄도 담당자는 그대로');

    const skip = await api('POST', `${room.base}/cleaning-tasks/${living.taskId}/skip`, { token: owner.token, body: {} });
    assert.equal(skip.body.task.assignee.userId, b.userId);
  });

  it('내 정보의 완료한 청소 횟수: 실제로 완료한 사람만 센다', async () => {
    const { room, owner, b, save, tasks, rows } = await setup();
    const me = async (u) => (await api('GET', '/api/users/me', { token: u.token })).body.user.stats.completedCleanings;
    assert.equal(await me(owner), 0);

    await save({ repeat: 'WEEKLY', rotation: false, rows });
    const living = (await tasks()).find((t) => t.areaName === '거실'); // 방장 담당

    // 담당자가 아닌 b는 완료할 수 없다. (거절되면 횟수도 늘지 않는다.)
    const denied = await api('POST', `${room.base}/cleaning-tasks/${living.taskId}/complete`, { token: b.token, body: {} });
    assert.equal(denied.status, 403);
    assert.equal(await me(b), 0);

    // b가 이번 회차만 방장 대신 담당하면, 완료는 b가 하고 b의 횟수가 늘어난다.
    const swap = await api('POST', `${room.base}/cleaning-tasks/${living.taskId}/reassign`, { token: owner.token, body: { assigneeUserId: b.userId, scope: 'ONCE' } });
    assert.equal(swap.status, 200, JSON.stringify(swap.body));
    const done = await api('POST', `${room.base}/cleaning-tasks/${living.taskId}/complete`, { token: b.token, body: {} });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(await me(b), 1);
    assert.equal(await me(owner), 0, '원래 담당자라도 직접 완료하지 않았으면 세지 않는다');

    // 건너뛰기는 완료로 세지 않는다. (회차가 끝나 담당자는 원래대로 방장이 되었으므로 방장이 건너뛴다.)
    const skip = await api('POST', `${room.base}/cleaning-tasks/${living.taskId}/skip`, { token: owner.token, body: {} });
    assert.equal(skip.status, 200, JSON.stringify(skip.body));
    assert.equal(await me(b), 1);
    assert.equal(await me(owner), 0, '건너뛰어도 완료 횟수는 늘지 않는다');
  });

  it('순환을 끄면 담당자가 그대로다', async () => {
    const { room, owner, save, tasks, rows } = await setup();
    await save({ repeat: 'WEEKLY', rotation: false, rows });
    const living = (await tasks()).find((t) => t.areaName === '거실');
    const done = await api('POST', `${room.base}/cleaning-tasks/${living.taskId}/complete`, { token: owner.token, body: {} });
    assert.equal(done.body.task.assignee.userId, owner.userId);
    assert.equal(done.body.task.rotationEnabled, false);
  });

  it('순번에서 나간 사람은 건너뛴다', async () => {
    const { room, owner, b, c, save, tasks, rows } = await setup();
    await save({ repeat: 'WEEKLY', rotation: true, rows });
    const kitchen = (await tasks()).find((t) => t.areaName === '주방'); // b 담당
    assert.equal(kitchen.assignee.userId, b.userId);

    const left = await api('DELETE', `${room.base}/members/me`, { token: c.token });
    assert.equal(left.status, 200, JSON.stringify(left.body));

    // b 다음은 원래 c였지만, c가 나갔으므로 처음(방장)으로 간다. (완료는 담당자 b가 한다.)
    const done = await api('POST', `${room.base}/cleaning-tasks/${kitchen.taskId}/complete`, { token: b.token, body: {} });
    assert.equal(done.body.task.assignee.userId, owner.userId);
  });

  it('입력 검증', async () => {
    const { owner, b, save, tasks, rows } = await setup();
    const outsider = await makeUser();
    const okRow = rows[0];

    const bad = [
      [{ repeat: 'YEARLY', rotation: false, rows }, 'repeat'],
      [{ repeat: 'WEEKLY', rotation: 'yes', rows }, 'rotation'],
      [{ repeat: 'WEEKLY', rotation: false, rows: [] }, '담당 구역'],
      [{ repeat: 'WEEKLY', rotation: false, rows: [{ ...okRow, weekday: 7 }] }, '요일'],
      [{ repeat: 'WEEKLY', rotation: false, rows: [{ ...okRow, areaName: '  ' }] }, '청소 항목'],
      [{ repeat: 'WEEKLY', rotation: false, rows: [{ ...okRow, userId: undefined }] }, '담당자'],
    ];
    for (const [body, word] of bad) {
      const r = await save(body);
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.ok(r.body.error.message.includes(word) || JSON.stringify(r.body).includes(word), `${JSON.stringify(body)} -> ${r.body.error.message}`);
    }

    const notMember = await save({ repeat: 'WEEKLY', rotation: false, rows: [{ ...okRow, userId: outsider.userId }] });
    assert.equal(notMember.status, 400);
    assert.equal(notMember.body.error.code, 'ASSIGNEE_NOT_MEMBER');

    const unknown = await save({ repeat: 'WEEKLY', rotation: false, rows: [{ ...okRow, taskId: 999999999 }] });
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.error.code, 'TASK_NOT_FOUND');

    // 검증에 실패한 요청은 아무것도 바꾸지 않는다.
    assert.equal((await tasks('all')).length, 0);

    // 같은 항목을 두 번 넣으면 거절
    const first = (await save({ repeat: 'WEEKLY', rotation: false, rows: [okRow] })).body.settings.rows[0];
    const dup = await save({ repeat: 'WEEKLY', rotation: false, rows: [
      { taskId: first.taskId, userId: owner.userId, areaName: '거실', weekday: SAT },
      { taskId: first.taskId, userId: b.userId, areaName: '거실', weekday: SAT },
    ] });
    assert.equal(dup.status, 400);
  });

  it('방 구성원이 아니면 404, 구성원이면 누구나 설정할 수 있다', async () => {
    const { room, b, save, get, rows } = await setup();
    const outsider = await makeUser();
    assert.equal((await get(outsider.token)).status, 404);
    assert.equal((await save({ repeat: 'WEEKLY', rotation: false, rows }, outsider.token)).status, 404);
    assert.equal((await api('GET', `${room.base}/cleaning-settings`)).status, 401);

    const byMember = await save({ repeat: 'WEEKLY', rotation: false, rows }, b.token);
    assert.equal(byMember.status, 200, '방장이 아닌 구성원도 설정할 수 있다');
  });
});
