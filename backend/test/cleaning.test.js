// 청소 기능 테스트
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { api, makeUser, makeRoom, startServer, stopServer, pool, dbToday } = require('./helpers');
const { addDays } = require('../src/utils/dates');

before(startServer);
after(stopServer);

describe('청소', () => {
  let room;
  let owner;
  let b;
  let c;
  let outsider;
  let today;

  const create = (body, token = owner.token) =>
    api('POST', `${room.base}/cleaning-tasks`, { token, body: { areaName: '화장실', nextDueDate: today, ...body } });
  const records = async (taskId, token = owner.token) =>
    (await api('GET', `${room.base}/cleaning-tasks/${taskId}/records`, { token })).body.records;

  before(async () => {
    room = await makeRoom(3);
    owner = room.owner;
    [b, c] = room.members;
    outsider = await makeUser();
    today = await dbToday();
  });

  it('항목 만들기: 첫 예정 기록이 함께 생긴다', async () => {
    const r = await create({ assigneeUserId: b.userId, repeatType: 'WEEKLY', repeatInterval: 1 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const t = r.body.task;
    assert.equal(t.areaName, '화장실');
    assert.deepEqual(t.assignee, { userId: b.userId, nickname: b.nickname, status: 'MEMBER' });
    assert.equal(t.nextDueDate, today);
    assert.equal(t.isActive, true);
    assert.equal(t.isOverdue, false);
    const recs = await records(t.taskId);
    assert.equal(recs.length, 1);
    assert.equal(recs[0].status, 'SCHEDULED');
    assert.equal(recs[0].dueDate, today);
  });

  it('입력 검증: 과거 날짜, 구성원이 아닌 담당자, 잘못된 주기', async () => {
    const past = await create({ nextDueDate: addDays(today, -1) });
    assert.equal(past.status, 400);
    assert.equal(past.body.error.code, 'DUE_DATE_IN_PAST');
    const out = await create({ assigneeUserId: outsider.userId });
    assert.equal(out.status, 400);
    assert.equal(out.body.error.code, 'ASSIGNEE_NOT_MEMBER');
    const type = await create({ repeatType: 'YEARLY' });
    assert.equal(type.status, 400);
    const interval = await create({ repeatType: 'DAILY', repeatInterval: 0 });
    assert.equal(interval.status, 400);
    const noName = await create({ areaName: '' });
    assert.equal(noName.status, 400);
    const noAssignee = await create({ assigneeUserId: null });
    assert.equal(noAssignee.status, 201, '담당자 없이도 만들 수 있다');
    assert.equal(noAssignee.body.task.assignee, null);
  });

  it('구성원이 아니면 404', async () => {
    for (const [method, path, body] of [
      ['GET', `${room.base}/cleaning-tasks`],
      ['POST', `${room.base}/cleaning-tasks`, { areaName: 'x', nextDueDate: today }],
      ['POST', `${room.base}/cleaning-tasks/1/complete`, {}],
    ]) {
      const r = await api(method, path, { token: outsider.token, body });
      assert.equal(r.status, 404, `${method} ${path}`);
    }
  });

  it('완료·건너뛰기는 담당자만 할 수 있다: 방장도, 다른 구성원도 안 되고, 담당자가 없으면 누구나 된다', async () => {
    const made = await create({ areaName: '다용도실', assigneeUserId: b.userId, repeatType: 'WEEKLY', repeatInterval: 1 });
    const id = made.body.task.taskId;
    const url = `${room.base}/cleaning-tasks/${id}/complete`;

    // 방장(관리자)이어도 담당자가 아니면 완료할 수 없다.
    const byOwner = await api('POST', url, { token: owner.token, body: { dueDate: today } });
    assert.equal(byOwner.status, 403);
    assert.equal(byOwner.body.error.code, 'NOT_TASK_ASSIGNEE');
    const byOther = await api('POST', url, { token: c.token, body: { dueDate: today } });
    assert.equal(byOther.status, 403);
    assert.equal(byOther.body.error.code, 'NOT_TASK_ASSIGNEE');

    // 거절된 요청은 아무것도 바꾸지 않는다.
    const untouched = (await api('GET', `${room.base}/cleaning-tasks/${id}`, { token: owner.token })).body.task;
    assert.equal(untouched.nextDueDate, today);
    assert.equal((await records(id)).filter((r) => r.status === 'DONE').length, 0);

    // 담당자는 완료할 수 있다.
    assert.equal((await api('POST', url, { token: b.token, body: { dueDate: today } })).status, 200);

    // 담당자가 없는 청소는 누구나 완료할 수 있다.
    const free = await create({ areaName: '현관 앞', repeatType: 'WEEKLY', repeatInterval: 1 });
    assert.equal(free.body.task.assignee, null);
    const byAnyone = await api('POST', `${room.base}/cleaning-tasks/${free.body.task.taskId}/complete`, { token: c.token, body: {} });
    assert.equal(byAnyone.status, 200, JSON.stringify(byAnyone.body));

    // 건너뛰기도 완료와 같다: 담당자만 할 수 있다. (방장도 안 된다.)
    const skipTarget = await create({ areaName: '창고', assigneeUserId: b.userId, repeatType: 'WEEKLY', repeatInterval: 1 });
    const skipUrl = `${room.base}/cleaning-tasks/${skipTarget.body.task.taskId}/skip`;
    for (const who of [owner, c]) {
      const denied = await api('POST', skipUrl, { token: who.token, body: {} });
      assert.equal(denied.status, 403);
      assert.equal(denied.body.error.code, 'NOT_TASK_ASSIGNEE');
    }
    assert.equal((await records(skipTarget.body.task.taskId)).filter((r) => r.status === 'SKIPPED').length, 0, '거절되면 기록도 남지 않는다');
    const bySkipper = await api('POST', skipUrl, { token: b.token, body: { memo: '출장' } });
    assert.equal(bySkipper.status, 200, JSON.stringify(bySkipper.body));

    // 담당자가 없는 청소는 누구나 건너뛸 수 있다.
    const freeSkip = await api('POST', `${room.base}/cleaning-tasks/${free.body.task.taskId}/skip`, { token: c.token, body: {} });
    assert.equal(freeSkip.status, 200, JSON.stringify(freeSkip.body));
  });

  it('완료: 주 1회 항목은 다음 예정일이 일주일 뒤로 바뀌고, 완료한 사람(담당자)이 기록된다', async () => {
    const made = await create({ areaName: '거실', assigneeUserId: b.userId, repeatType: 'WEEKLY', repeatInterval: 1 });
    const id = made.body.task.taskId;
    const done = await api('POST', `${room.base}/cleaning-tasks/${id}/complete`, { token: b.token, body: { dueDate: today, memo: '깨끗하게 했어요' } });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(done.body.task.nextDueDate, addDays(today, 7));

    const recs = await records(id);
    assert.equal(recs.length, 2);
    const doneRec = recs.find((r) => r.status === 'DONE');
    assert.equal(doneRec.assignee.userId, b.userId, '담당자는 그대로');
    assert.equal(doneRec.completedBy.userId, b.userId, '완료한 사람');
    assert.equal(doneRec.memo, '깨끗하게 했어요');
    assert.ok(doneRec.completedAt);
    const next = recs.find((r) => r.status === 'SCHEDULED');
    assert.equal(next.dueDate, addDays(today, 7));
    assert.equal(next.assignee.userId, b.userId);
  });

  it('같은 회차를 두 번 처리하려 하면 STALE_DUE_DATE로 거절된다', async () => {
    const made = await create({ areaName: '주방', repeatType: 'DAILY', repeatInterval: 2 });
    const id = made.body.task.taskId;
    assert.equal((await api('POST', `${room.base}/cleaning-tasks/${id}/complete`, { token: b.token, body: { dueDate: today } })).status, 200);
    const again = await api('POST', `${room.base}/cleaning-tasks/${id}/complete`, { token: c.token, body: { dueDate: today } });
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'STALE_DUE_DATE');
    assert.equal(again.body.error.details.currentDueDate, addDays(today, 2));
    assert.equal((await records(id)).filter((r) => r.status === 'DONE').length, 1);
  });

  it('동시에 여러 명이 완료를 눌러도 한 번만 처리된다', async () => {
    const made = await create({ areaName: '베란다', assigneeUserId: b.userId, repeatType: 'DAILY', repeatInterval: 1 });
    const id = made.body.task.taskId;
    // 담당자(b)가 연달아 눌러도 한 번만 처리되고, 담당자가 아닌 사람의 요청은 모두 거절된다.
    const results = await Promise.all([owner, b, c, owner, b, c, b].map((u) =>
      api('POST', `${room.base}/cleaning-tasks/${id}/complete`, { token: u.token, body: { dueDate: today } })));
    assert.equal(results.filter((r) => r.status === 200).length, 1);
    assert.equal(results.filter((r) => r.status === 409 && r.body.error.code === 'STALE_DUE_DATE').length, 2);
    assert.equal(results.filter((r) => r.status === 403 && r.body.error.code === 'NOT_TASK_ASSIGNEE').length, 4);
    const recs = await records(id);
    assert.equal(recs.filter((r) => r.status === 'DONE').length, 1);
    assert.equal(recs.filter((r) => r.status === 'SCHEDULED').length, 1);
  });

  it('반복이 없는 항목은 완료하면 비활성이 된다', async () => {
    const made = await create({ areaName: '창고 정리', repeatType: 'NONE' });
    const id = made.body.task.taskId;
    const done = await api('POST', `${room.base}/cleaning-tasks/${id}/complete`, { token: b.token, body: {} });
    assert.equal(done.body.task.isActive, false);
    const again = await api('POST', `${room.base}/cleaning-tasks/${id}/complete`, { token: b.token, body: {} });
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'TASK_INACTIVE');
    const active = await api('GET', `${room.base}/cleaning-tasks`, { token: b.token });
    assert.ok(!active.body.tasks.some((t) => t.taskId === id), '기본 목록에는 활성 항목만 나온다');
    const all = await api('GET', `${room.base}/cleaning-tasks?active=all`, { token: b.token });
    assert.ok(all.body.tasks.some((t) => t.taskId === id));
  });

  it('건너뛰기: 기록은 SKIPPED로 남고 다음 예정일로 넘어간다', async () => {
    const made = await create({ areaName: '신발장', repeatType: 'MONTHLY', repeatInterval: 1 });
    const id = made.body.task.taskId;
    const r = await api('POST', `${room.base}/cleaning-tasks/${id}/skip`, { token: b.token, body: { memo: '여행' } });
    assert.equal(r.status, 200);
    const recs = await records(id);
    assert.equal(recs.find((x) => x.status === 'SKIPPED').memo, '여행');
    assert.ok(r.body.task.nextDueDate > today);
    assert.equal(recs.find((x) => x.status === 'SKIPPED').completedBy, null);
  });

  it('미루기: 기록은 POSTPONED로 남고 예정일이 미룬 날짜로 바뀐다', async () => {
    const made = await create({ areaName: '욕실 바닥', assigneeUserId: b.userId, repeatType: 'WEEKLY' });
    const id = made.body.task.taskId;
    const url = `${room.base}/cleaning-tasks/${id}/postpone`;

    const byOther = await api('POST', url, { token: c.token, body: { postponedTo: addDays(today, 2) } });
    assert.equal(byOther.status, 403, '담당자도 방장도 아닌 사람은 미룰 수 없다');
    assert.equal(byOther.body.error.code, 'NOT_TASK_ASSIGNEE');
    const same = await api('POST', url, { token: b.token, body: { postponedTo: today } });
    assert.equal(same.body.error.code, 'INVALID_POSTPONE_DATE');
    const earlier = await api('POST', url, { token: b.token, body: { postponedTo: addDays(today, -1) } });
    assert.equal(earlier.status, 400);
    const bad = await api('POST', url, { token: b.token, body: { postponedTo: '내일' } });
    assert.equal(bad.status, 400);

    const ok = await api('POST', url, { token: b.token, body: { postponedTo: addDays(today, 2), memo: '시험 기간', dueDate: today } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.task.nextDueDate, addDays(today, 2));
    const recs = await records(id);
    const postponed = recs.find((r) => r.status === 'POSTPONED');
    assert.equal(postponed.dueDate, today);
    assert.equal(postponed.postponedTo, addDays(today, 2));
    assert.equal(postponed.memo, '시험 기간');
    assert.equal(recs.find((r) => r.status === 'SCHEDULED').dueDate, addDays(today, 2));

    // 같은 회차는 두 번 미룰 수 없다. (방장이어도)
    const twice = await api('POST', url, { token: owner.token, body: { postponedTo: addDays(today, 4) } });
    assert.equal(twice.status, 409);
    assert.equal(twice.body.error.code, 'ALREADY_POSTPONED');

    // 방장은 다른 청소를 대신 미룰 수 있다.
    const other = await create({ areaName: '베란다', assigneeUserId: b.userId, repeatType: 'WEEKLY' });
    const byOwner = await api('POST', `${room.base}/cleaning-tasks/${other.body.task.taskId}/postpone`, { token: owner.token, body: { postponedTo: addDays(today, 4) } });
    assert.equal(byOwner.status, 200, '방장은 대신 미룰 수 있다');
    const noAssignee = await create({ areaName: '현관' });
    const free = await api('POST', `${room.base}/cleaning-tasks/${noAssignee.body.task.taskId}/postpone`, { token: c.token, body: { postponedTo: addDays(today, 1) } });
    assert.equal(free.status, 200, '담당자가 없으면 누구나 미룰 수 있다');
  });

  it('미루기 제한: 한 회차에 1번, 예정일에서 최대 7일까지', async () => {
    const made = await create({ areaName: '창틀', assigneeUserId: b.userId, repeatType: 'WEEKLY' });
    const { taskId, nextDueDate: due } = made.body.task;
    const url = `${room.base}/cleaning-tasks/${taskId}/postpone`;
    assert.equal(made.body.task.isPostponed, false);
    assert.equal(made.body.task.postponeUntil, addDays(due, 7), '미룰 수 있는 마지막 날을 알려준다');

    // 8일 뒤는 거절하고, 아무것도 바꾸지 않는다.
    const tooLong = await api('POST', url, { token: b.token, body: { postponedTo: addDays(due, 8) } });
    assert.equal(tooLong.status, 400);
    assert.equal(tooLong.body.error.code, 'POSTPONE_TOO_LONG');
    assert.equal(tooLong.body.error.details.latestDate, addDays(due, 7));
    assert.equal((await api('GET', `${room.base}/cleaning-tasks/${taskId}`, { token: owner.token })).body.task.nextDueDate, due);

    // 정확히 7일 뒤는 된다. 미룬 뒤에는 isPostponed가 true
    const ok = await api('POST', url, { token: b.token, body: { postponedTo: addDays(due, 7), memo: '여행' } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.task.nextDueDate, addDays(due, 7));
    assert.equal(ok.body.task.isPostponed, true);

    // 같은 회차는 다시 미룰 수 없다. 미룬 날짜 기준으로 7일 이내여도 거절
    const again = await api('POST', url, { token: b.token, body: { postponedTo: addDays(due, 9) } });
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'ALREADY_POSTPONED');

    // 목록에서도 isPostponed가 보인다.
    const listed = (await api('GET', `${room.base}/cleaning-tasks`, { token: owner.token })).body.tasks.find((t) => t.taskId === taskId);
    assert.equal(listed.isPostponed, true);

    // 미룬 회차를 완료하면 다음 회차는 다시 한 번 미룰 수 있다.
    const done = await api('POST', `${room.base}/cleaning-tasks/${taskId}/complete`, { token: b.token, body: {} });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(done.body.task.isPostponed, false);
    const next = await api('POST', url, { token: b.token, body: { postponedTo: addDays(done.body.task.nextDueDate, 1) } });
    assert.equal(next.status, 200, JSON.stringify(next.body));
  });

  it('수정: 담당자와 날짜를 바꾸면 예정된 회차도 함께 바뀐다', async () => {
    const made = await create({ areaName: '냉장고', assigneeUserId: b.userId, repeatType: 'WEEKLY' });
    const id = made.body.task.taskId;
    const r = await api('PATCH', `${room.base}/cleaning-tasks/${id}`, { token: c.token, body: { assigneeUserId: c.userId, nextDueDate: addDays(today, 3), areaName: '냉장고 정리' } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.task.areaName, '냉장고 정리');
    assert.equal(r.body.task.assignee.userId, c.userId);
    const recs = await records(id);
    assert.equal(recs.length, 1, '새 기록을 만들지 않고 기존 예정 기록을 고친다');
    assert.equal(recs[0].dueDate, addDays(today, 3));
    assert.equal(recs[0].assignee.userId, c.userId);

    const outsiderAssignee = await api('PATCH', `${room.base}/cleaning-tasks/${id}`, { token: c.token, body: { assigneeUserId: outsider.userId } });
    assert.equal(outsiderAssignee.body.error.code, 'ASSIGNEE_NOT_MEMBER');
    const clear = await api('PATCH', `${room.base}/cleaning-tasks/${id}`, { token: c.token, body: { assigneeUserId: null } });
    assert.equal(clear.body.task.assignee, null);
    const off = await api('PATCH', `${room.base}/cleaning-tasks/${id}`, { token: c.token, body: { isActive: false } });
    assert.equal(off.body.task.isActive, false);
    const empty = await api('PATCH', `${room.base}/cleaning-tasks/${id}`, { token: c.token, body: {} });
    assert.equal(empty.status, 400);
  });

  it('목록: 기한이 지난 항목 표시와 dueBy 필터', async () => {
    const made = await create({ areaName: '지난 항목' });
    const id = made.body.task.taskId;
    await pool.query('UPDATE cleaning_tasks SET next_due_date = DATE_SUB(CURDATE(), INTERVAL 3 DAY) WHERE task_id = ?', [id]);
    const list = await api('GET', `${room.base}/cleaning-tasks?dueBy=${today}`, { token: b.token });
    const t = list.body.tasks.find((x) => x.taskId === id);
    assert.equal(t.isOverdue, true);
    assert.ok(list.body.tasks.every((x) => x.nextDueDate <= today));
    const sorted = list.body.tasks.map((x) => x.nextDueDate);
    assert.deepEqual(sorted, [...sorted].sort(), '예정일 순');
    const future = await api('GET', `${room.base}/cleaning-tasks?dueBy=2000-01-01`, { token: b.token });
    assert.equal(future.body.tasks.length, 0);
  });

  it('삭제는 방장만 할 수 있다', async () => {
    const made = await create({ areaName: '삭제용' });
    const id = made.body.task.taskId;
    const byMember = await api('DELETE', `${room.base}/cleaning-tasks/${id}`, { token: b.token });
    assert.equal(byMember.status, 403);
    assert.equal(byMember.body.error.code, 'NOT_ROOM_OWNER');
    assert.equal((await api('DELETE', `${room.base}/cleaning-tasks/${id}`, { token: owner.token })).status, 204);
    assert.equal((await api('GET', `${room.base}/cleaning-tasks/${id}`, { token: owner.token })).status, 404);
    const [rows] = await pool.query('SELECT COUNT(*) AS n FROM cleaning_records WHERE task_id = ?', [id]);
    assert.equal(rows[0].n, 0, '이력도 함께 삭제된다');
  });

  it('다른 방의 청소 항목은 이 방 경로로 접근할 수 없다', async () => {
    const other = await makeRoom(2);
    const made = await api('POST', `${other.base}/cleaning-tasks`, { token: other.owner.token, body: { areaName: '남의 방', nextDueDate: today } });
    const r = await api('POST', `${room.base}/cleaning-tasks/${made.body.task.taskId}/complete`, { token: owner.token, body: {} });
    assert.equal(r.status, 404);
    assert.equal(r.body.error.code, 'TASK_NOT_FOUND');
  });
});
