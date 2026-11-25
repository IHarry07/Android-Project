// 통합 검색 (음식·물품·일정·청소)
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { api, makeUser, makeRoom, startServer, stopServer } = require('./helpers');

before(startServer);
after(stopServer);

describe('통합 검색', () => {
  let room;
  let a;
  let b;
  let outsider;
  const search = (q, token = a.token, base = room.base) =>
    api('GET', `${base}/search?q=${encodeURIComponent(q)}`, { token });

  before(async () => {
    room = await makeRoom(2);
    a = room.owner;
    [b] = room.members;
    outsider = await makeUser();

    const item = (token, body) => api('POST', `${room.base}/items`, { token, body });
    await item(a.token, { name: '공용 달걀', category: 'FOOD', ownershipType: 'SHARED', quantity: 6, unit: '개', expiryDate: '2026-12-16', storageLocation: '주방 냉장고' });
    await item(b.token, { name: '주방 세제', category: 'SUPPLY', ownershipType: 'SHARED', quantity: 1, unit: '개', storageLocation: '주방 싱크대' });
    await item(b.token, { name: '비밀 간식', category: 'FOOD', ownershipType: 'PERSONAL', quantity: 3, unit: '개' });
    await api('POST', `${room.base}/schedules`, { token: a.token, body: { title: '주방 대청소', startAt: '2026-12-08 10:00:00', endAt: '2026-12-08 12:00:00' } });
    await api('POST', `${room.base}/schedules`, { token: b.token, body: { title: '몰래 주방 모임', visibility: 'PERSONAL', startAt: '2026-12-09 10:00:00', endAt: '2026-12-09 12:00:00' } });
    await api('PUT', `${room.base}/cleaning-settings`, { token: a.token, body: {
      repeat: 'WEEKLY', rotation: false,
      rows: [{ userId: a.userId, areaName: '주방 청소', weekday: 0 }, { userId: b.userId, areaName: '욕실', weekday: 6 }],
    } });
  });

  it('이름·보관 장소로 음식, 물품, 일정, 청소를 한 번에 찾는다', async () => {
    const r = await search('주방');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const titles = r.body.results.map((x) => `${x.type}:${x.title}`).sort();
    assert.deepEqual(titles, ['CLEANING:주방 청소', 'FOOD:공용 달걀', 'SCHEDULE:주방 대청소', 'SUPPLY:주방 세제'].sort());
    assert.deepEqual(r.body.counts, { all: 4, food: 1, supply: 1, schedule: 2 });
    const egg = r.body.results.find((x) => x.type === 'FOOD');
    assert.ok(egg.line1.includes('주방 냉장고') && egg.line1.includes('공용 음식'), egg.line1);
    assert.ok(egg.line2.includes('6개') && egg.line2.includes('12.16'), egg.line2);
  });

  it('담당자 닉네임으로 청소를, 등록한 사람으로 물품을 찾는다', async () => {
    const byAssignee = await search(b.nickname);
    const types = byAssignee.body.results.map((x) => x.type);
    assert.ok(types.includes('CLEANING'), '담당자로 청소를 찾는다');
    assert.ok(types.includes('SUPPLY') || types.includes('FOOD'), '등록한 사람으로 물품을 찾는다');
  });

  it('다른 구성원의 개인 일정은 나오지 않고, 내 개인 일정은 나온다', async () => {
    const forA = await search('몰래');
    assert.equal(forA.body.counts.all, 0);
    const forB = await search('몰래', b.token);
    assert.equal(forB.body.counts.schedule, 1);
  });

  it('다른 구성원의 개인 물품도 읽기 전용으로 나온다', async () => {
    const r = await search('간식');
    assert.equal(r.body.counts.food, 1);
    assert.ok(r.body.results[0].line1.includes('개인'), r.body.results[0].line1);
  });

  it('대소문자 구분 없이 찾고, 결과가 없으면 빈 목록이다', async () => {
    await api('POST', `${room.base}/items`, { token: a.token, body: { name: 'Olive Oil', category: 'SUPPLY', ownershipType: 'SHARED', quantity: 1 } });
    assert.equal((await search('olive')).body.counts.supply, 1);
    const none = await search('존재하지않는검색어');
    assert.deepEqual(none.body.counts, { all: 0, food: 0, supply: 0, schedule: 0 });
  });

  it('검색어가 없으면 400, 방 구성원이 아니면 404, 로그인이 없으면 401', async () => {
    assert.equal((await api('GET', `${room.base}/search`, { token: a.token })).status, 400);
    assert.equal((await api('GET', `${room.base}/search?q=%20`, { token: a.token })).status, 400);
    assert.equal((await search('주방', outsider.token)).status, 404);
    assert.equal((await api('GET', `${room.base}/search?q=a`)).status, 401);
  });
});