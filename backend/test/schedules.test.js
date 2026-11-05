// 일정 기능 테스트
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { api, makeUser, makeRoom, startServer, stopServer } = require('./helpers');

before(startServer);
after(stopServer);

describe('일정', () => {
  let room;
  let owner;
  let b;
  let c;
  let outsider;
  let party; // b가 만든 일정

  before(async () => {
    room = await makeRoom(3);
    owner = room.owner;
    [b, c] = room.members;
    outsider = await makeUser();
  });

  it('등록: 모든 구성원이 볼 수 있고 시각 형식을 정리해서 저장한다', async () => {
    const r = await api('POST', `${room.base}/schedules`, { token: b.token, body: {
      title: '집들이', startAt: '2026-12-05T18:00', endAt: '2026-12-05 22:00:00',
    } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    party = r.body.schedule;
    assert.equal(party.startAt, '2026-12-05 18:00:00');
    assert.equal(party.endAt, '2026-12-05 22:00:00');
    assert.equal(party.authorUserId, b.userId);
    assert.equal(party.authorNickname, b.nickname);

    const seen = await api('GET', `${room.base}/schedules/${party.scheduleId}`, { token: c.token });
    assert.equal(seen.status, 200, '다른 구성원도 조회할 수 있다');
  });

  it('입력 검증: 종료가 시작보다 빠르거나 잘못된 시각', async () => {
    const cases = [
      [{ title: 'x', startAt: '2026-12-05T18:00', endAt: '2026-12-05T17:00' }, '종료 시각'],
      [{ title: '', startAt: '2026-12-05T18:00', endAt: '2026-12-05T19:00' }, '일정 제목'],
      [{ title: 'x', startAt: '2026-12-05', endAt: '2026-12-05T19:00' }, '시작 시각'],
      [{ title: 'x', startAt: '2026-13-05T18:00', endAt: '2026-12-05T19:00' }, '시작 시각'],
      [{ title: 'x', startAt: '2026-12-05T25:00', endAt: '2026-12-06T19:00' }, '시작 시각'],
    ];
    for (const [body, word] of cases) {
      const r = await api('POST', `${room.base}/schedules`, { token: b.token, body });
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.ok(r.body.error.message.includes(word), `${JSON.stringify(body)} -> ${r.body.error.message}`);
    }
  });

  it('구성원이 아니면 404', async () => {
    for (const [method, path, body] of [
      ['GET', `${room.base}/schedules`],
      ['POST', `${room.base}/schedules`, { title: 'x', startAt: '2026-12-05T18:00', endAt: '2026-12-05T19:00' }],
      ['GET', `${room.base}/schedules/${party.scheduleId}`],
      ['PATCH', `${room.base}/schedules/${party.scheduleId}`, { title: 'x' }],
      ['DELETE', `${room.base}/schedules/${party.scheduleId}`],
    ]) {
      const r = await api(method, path, { token: outsider.token, body });
      assert.equal(r.status, 404, `${method} ${path}`);
    }
  });

  it('기간 조회: 기간과 겹치는 일정만, 시작 순으로', async () => {
    await api('POST', `${room.base}/schedules`, { token: c.token, body: { title: '시험 기간', startAt: '2026-12-01T00:00', endAt: '2026-12-07T23:59' } });
    await api('POST', `${room.base}/schedules`, { token: c.token, body: { title: '다음 달', startAt: '2027-01-10T09:00', endAt: '2027-01-10T10:00' } });

    const all = await api('GET', `${room.base}/schedules`, { token: c.token });
    assert.deepEqual(all.body.schedules.map((s) => s.title), ['시험 기간', '집들이', '다음 달']);

    const dec5 = await api('GET', `${room.base}/schedules?from=2026-12-05&to=2026-12-05`, { token: c.token });
    assert.deepEqual(dec5.body.schedules.map((s) => s.title), ['시험 기간', '집들이'], '하루 조회에도 걸쳐 있는 일정이 나온다');

    const dec8 = await api('GET', `${room.base}/schedules?from=2026-12-08&to=2026-12-31`, { token: c.token });
    assert.equal(dec8.body.schedules.length, 0);

    const jan = await api('GET', `${room.base}/schedules?from=2027-01-01&to=2027-01-31`, { token: c.token });
    assert.deepEqual(jan.body.schedules.map((s) => s.title), ['다음 달']);

    const reversed = await api('GET', `${room.base}/schedules?from=2026-12-31&to=2026-12-01`, { token: c.token });
    assert.equal(reversed.status, 400);
  });

  it('수정과 삭제는 작성자와 방장만 할 수 있다', async () => {
    const byOther = await api('PATCH', `${room.base}/schedules/${party.scheduleId}`, { token: c.token, body: { title: '해킹' } });
    assert.equal(byOther.status, 403);
    assert.equal(byOther.body.error.code, 'NOT_SCHEDULE_AUTHOR');
    assert.equal((await api('DELETE', `${room.base}/schedules/${party.scheduleId}`, { token: c.token })).status, 403);

    const byAuthor = await api('PATCH', `${room.base}/schedules/${party.scheduleId}`, { token: b.token, body: { title: '집들이 (수정)', endAt: '2026-12-05T23:00' } });
    assert.equal(byAuthor.status, 200);
    assert.equal(byAuthor.body.schedule.title, '집들이 (수정)');
    assert.equal(byAuthor.body.schedule.endAt, '2026-12-05 23:00:00');
    assert.equal(byAuthor.body.schedule.startAt, '2026-12-05 18:00:00', '보내지 않은 값은 그대로');

    const byOwner = await api('PATCH', `${room.base}/schedules/${party.scheduleId}`, { token: owner.token, body: { title: '방장이 수정' } });
    assert.equal(byOwner.status, 200);
  });

  it('수정할 때도 종료가 시작보다 빠르면 거절한다', async () => {
    const r = await api('PATCH', `${room.base}/schedules/${party.scheduleId}`, { token: b.token, body: { endAt: '2026-12-05T10:00' } });
    assert.equal(r.status, 400);
    const empty = await api('PATCH', `${room.base}/schedules/${party.scheduleId}`, { token: b.token, body: {} });
    assert.equal(empty.status, 400);
  });

  it('삭제', async () => {
    assert.equal((await api('DELETE', `${room.base}/schedules/${party.scheduleId}`, { token: owner.token })).status, 204);
    assert.equal((await api('GET', `${room.base}/schedules/${party.scheduleId}`, { token: owner.token })).status, 404);
  });

  it('다른 방의 일정은 이 방 경로로 접근할 수 없다', async () => {
    const other = await makeRoom(2);
    const made = await api('POST', `${other.base}/schedules`, { token: other.owner.token, body: { title: '남의 일정', startAt: '2026-12-05T18:00', endAt: '2026-12-05T19:00' } });
    const r = await api('GET', `${room.base}/schedules/${made.body.schedule.scheduleId}`, { token: owner.token });
    assert.equal(r.status, 404);
    assert.equal(r.body.error.code, 'SCHEDULE_NOT_FOUND');
  });
});
