// 창고(물품) 기능 테스트
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { api, makeUser, makeRoom, startServer, stopServer, pool, dbToday } = require('./helpers');
const { addDays } = require('../src/utils/dates');

before(startServer);
after(stopServer);

describe('물품', () => {
  let room;
  let [a, b] = [];
  let outsider;
  let milk; // a의 공용
  let eggs; // a의 개인

  before(async () => {
    room = await makeRoom(3);
    a = room.owner;
    [b] = room.members;
    outsider = await makeUser();
  });

  it('등록: 공용과 개인, 소유자는 등록한 사람', async () => {
    const today = await dbToday();
    const r1 = await api('POST', `${room.base}/items`, { token: a.token, body: {
      name: '우유', category: 'FOOD', ownershipType: 'SHARED', quantity: 2, unit: '팩',
      expiryDate: addDays(today, 3), storageLocation: '냉장', barcode: '8801115114154',
    } });
    assert.equal(r1.status, 201, JSON.stringify(r1.body));
    milk = r1.body.item;
    assert.equal(milk.ownerUserId, a.userId);
    assert.equal(milk.ownerNickname, a.nickname);
    assert.equal(milk.quantity, 2);
    assert.equal(milk.daysUntilExpiry, 3);
    assert.equal(milk.status, 'STORED');

    const r2 = await api('POST', `${room.base}/items`, { token: a.token, body: {
      name: '계란', category: 'FOOD', ownershipType: 'PERSONAL', quantity: 10, expiryDate: addDays(today, 10),
    } });
    eggs = r2.body.item;
    assert.equal(eggs.ownershipType, 'PERSONAL');
    const r3 = await api('POST', `${room.base}/items`, { token: b.token, body: {
      name: '휴지', category: 'SUPPLY', ownershipType: 'SHARED', quantity: 5, unit: '롤',
    } });
    assert.equal(r3.status, 201);
    assert.equal(r3.body.item.expiryDate, null);
    assert.equal(r3.body.item.daysUntilExpiry, null);
  });

  it('입력 검증', async () => {
    const bad = [
      [{ name: '', category: 'FOOD', ownershipType: 'SHARED' }, '물품 이름'],
      [{ name: 'x', category: 'ETC', ownershipType: 'SHARED' }, 'category'],
      [{ name: 'x', category: 'FOOD', ownershipType: 'NOBODY' }, 'ownershipType'],
      [{ name: 'x', category: 'FOOD', ownershipType: 'SHARED', quantity: -1 }, '수량'],
      [{ name: 'x', category: 'FOOD', ownershipType: 'SHARED', expiryDate: '2026-02-31' }, '유통기한'],
      [{ name: 'x', category: 'FOOD', ownershipType: 'SHARED', unit: 'a'.repeat(21) }, '단위'],
    ];
    for (const [body, word] of bad) {
      const r = await api('POST', `${room.base}/items`, { token: a.token, body });
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.ok(r.body.error.message.includes(word), `${JSON.stringify(body)} -> ${r.body.error.message}`);
    }
  });

  it('구성원이 아니면 어떤 물품 API도 404', async () => {
    const calls = [
      ['GET', `${room.base}/items`], ['POST', `${room.base}/items`, { name: 'x', category: 'FOOD', ownershipType: 'SHARED' }],
      ['GET', `${room.base}/items/${milk.itemId}`], ['PATCH', `${room.base}/items/${milk.itemId}`, { name: 'x' }],
      ['POST', `${room.base}/items/${milk.itemId}/adjust`, { delta: -1 }], ['DELETE', `${room.base}/items/${milk.itemId}`],
    ];
    for (const [method, path, body] of calls) {
      const r = await api(method, path, { token: outsider.token, body });
      assert.equal(r.status, 404, `${method} ${path}`);
      assert.equal(r.body.error.code, 'ROOM_NOT_FOUND');
    }
    const noAuth = await api('GET', `${room.base}/items`);
    assert.equal(noAuth.status, 401);
  });

  it('다른 방의 물품은 이 방 경로로 접근할 수 없다', async () => {
    const other = await makeRoom(2);
    const foreign = await api('POST', `${other.base}/items`, { token: other.owner.token, body: { name: '남의 것', category: 'FOOD', ownershipType: 'SHARED' } });
    const r = await api('GET', `${room.base}/items/${foreign.body.item.itemId}`, { token: a.token });
    assert.equal(r.status, 404);
    assert.equal(r.body.error.code, 'ITEM_NOT_FOUND');
  });

  it('목록: 구성원은 개인 물품도 볼 수 있고, 유통기한 순으로 정렬된다', async () => {
    const r = await api('GET', `${room.base}/items`, { token: b.token });
    assert.equal(r.status, 200);
    const names = r.body.items.map((i) => i.name);
    assert.deepEqual(names, ['우유', '계란', '휴지'], '유통기한이 없는 물품은 맨 뒤');
    const eggsSeen = r.body.items.find((i) => i.name === '계란');
    assert.equal(eggsSeen.ownerNickname, a.nickname);
  });

  it('목록 필터: 범위, 종류, 유통기한 임박, 검색', async () => {
    const mine = await api('GET', `${room.base}/items?scope=mine`, { token: b.token });
    assert.deepEqual(mine.body.items.map((i) => i.name), ['휴지']);
    const shared = await api('GET', `${room.base}/items?scope=shared`, { token: b.token });
    assert.deepEqual(shared.body.items.map((i) => i.name), ['우유', '휴지']);
    const supply = await api('GET', `${room.base}/items?category=SUPPLY`, { token: b.token });
    assert.deepEqual(supply.body.items.map((i) => i.name), ['휴지']);
    const soon = await api('GET', `${room.base}/items?expiringWithinDays=5`, { token: b.token });
    assert.deepEqual(soon.body.items.map((i) => i.name), ['우유']);
    const search = await api('GET', `${room.base}/items?search=${encodeURIComponent('계')}`, { token: b.token });
    assert.deepEqual(search.body.items.map((i) => i.name), ['계란']);
    const percent = await api('GET', `${room.base}/items?search=${encodeURIComponent('%')}`, { token: b.token });
    assert.equal(percent.body.items.length, 0, '검색어의 % 는 글자 그대로 취급');
    const badScope = await api('GET', `${room.base}/items?scope=everyone`, { token: b.token });
    assert.equal(badScope.status, 400);
  });

  it('개인 물품은 등록한 사람만 고치고 지울 수 있다', async () => {
    const edit = await api('PATCH', `${room.base}/items/${eggs.itemId}`, { token: b.token, body: { name: '내 계란' } });
    assert.equal(edit.status, 403);
    assert.equal(edit.body.error.code, 'NOT_ITEM_OWNER');
    const adjust = await api('POST', `${room.base}/items/${eggs.itemId}/adjust`, { token: b.token, body: { delta: -1 } });
    assert.equal(adjust.status, 403);
    const del = await api('DELETE', `${room.base}/items/${eggs.itemId}`, { token: b.token });
    assert.equal(del.status, 403);
    const ok = await api('PATCH', `${room.base}/items/${eggs.itemId}`, { token: a.token, body: { name: '달걀', storageLocation: '냉장 문칸' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.item.name, '달걀');
  });

  it('공용 물품은 누구나 고칠 수 있지만 소유 구분은 등록한 사람만 바꾼다', async () => {
    const edit = await api('PATCH', `${room.base}/items/${milk.itemId}`, { token: b.token, body: { storageLocation: '냉동' } });
    assert.equal(edit.status, 200);
    assert.equal(edit.body.item.storageLocation, '냉동');
    const owner = await api('PATCH', `${room.base}/items/${milk.itemId}`, { token: b.token, body: { ownershipType: 'PERSONAL' } });
    assert.equal(owner.status, 403);
    const clear = await api('PATCH', `${room.base}/items/${milk.itemId}`, { token: b.token, body: { expiryDate: null, barcode: null } });
    assert.equal(clear.body.item.expiryDate, null);
    assert.equal(clear.body.item.barcode, null);
    const empty = await api('PATCH', `${room.base}/items/${milk.itemId}`, { token: b.token, body: {} });
    assert.equal(empty.status, 400);
  });

  it('수량 증감: 0이 되면 사용 완료, 다시 늘리면 보관 중, 0 미만은 거절', async () => {
    const down = await api('POST', `${room.base}/items/${milk.itemId}/adjust`, { token: b.token, body: { delta: -2 } });
    assert.equal(down.body.item.quantity, 0);
    assert.equal(down.body.item.status, 'USED_UP');
    const tooMuch = await api('POST', `${room.base}/items/${milk.itemId}/adjust`, { token: b.token, body: { delta: -1 } });
    assert.equal(tooMuch.status, 409);
    assert.equal(tooMuch.body.error.code, 'INSUFFICIENT_QUANTITY');
    const up = await api('POST', `${room.base}/items/${milk.itemId}/adjust`, { token: b.token, body: { delta: 3 } });
    assert.equal(up.body.item.quantity, 3);
    assert.equal(up.body.item.status, 'STORED');
    const zero = await api('POST', `${room.base}/items/${milk.itemId}/adjust`, { token: b.token, body: { delta: 0 } });
    assert.equal(zero.status, 400);
    const used = await api('GET', `${room.base}/items?status=USED_UP`, { token: b.token });
    assert.equal(used.body.items.length, 0);
  });

  it('동시에 수량을 줄여도 값이 틀어지거나 0 미만이 되지 않는다', async () => {
    const r = await api('POST', `${room.base}/items`, { token: a.token, body: { name: '세제', category: 'SUPPLY', ownershipType: 'SHARED', quantity: 5 } });
    const id = r.body.item.itemId;
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) =>
      api('POST', `${room.base}/items/${id}/adjust`, { token: i % 2 ? a.token : b.token, body: { delta: -1 } })));
    assert.equal(results.filter((x) => x.status === 200).length, 5);
    assert.equal(results.filter((x) => x.status === 409).length, 7);
    const final = await api('GET', `${room.base}/items/${id}`, { token: a.token });
    assert.equal(final.body.item.quantity, 0);
    assert.equal(final.body.item.status, 'USED_UP');
  });

  it('삭제', async () => {
    const del = await api('DELETE', `${room.base}/items/${eggs.itemId}`, { token: a.token });
    assert.equal(del.status, 204);
    const gone = await api('GET', `${room.base}/items/${eggs.itemId}`, { token: a.token });
    assert.equal(gone.status, 404);
    const sharedDel = await api('DELETE', `${room.base}/items/${milk.itemId}`, { token: b.token });
    assert.equal(sharedDel.status, 204, '공용 물품은 누구나 삭제할 수 있다');
    const [rows] = await pool.query('SELECT COUNT(*) AS n FROM items WHERE item_id IN (?)', [[eggs.itemId, milk.itemId]]);
    assert.equal(rows[0].n, 0);
  });
});
