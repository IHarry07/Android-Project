const items = require('./itemService');
const schedules = require('./scheduleService');
const cleaning = require('./cleaningService');

/**
 * 통합 검색: 방의 음식·물품·일정(일정과 청소)을 한 번에 찾는다.
 *  - 보이는 범위는 각 목록과 똑같다. 다른 구성원의 개인 일정은 나오지 않고, 개인 물품은 읽기 전용으로 나온다.
 *  - 음식·물품은 이름, 보관 장소, 등록한 사람으로, 일정은 제목, 내용, 작성자로, 청소는 항목과 담당자로 찾는다.
 *  - 대소문자는 구분하지 않는다.
 */

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const md = (dateStr) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr));
  return m ? `${Number(m[2])}.${String(Number(m[3])).padStart(2, '0')}` : '';
};

const mdw = (dateStr) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr));
  if (!m) return '';
  const day = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  return `${md(dateStr)} (${WEEKDAYS[day]})`;
};

const REPEAT_TEXT = {
  NONE: '한 번만',
  DAILY: (n) => (n === 1 ? '매일 반복' : `${n}일마다 반복`),
  WEEKLY: (n) => (n === 1 ? '매주 반복' : `${n}주마다 반복`),
  MONTHLY: (n) => (n === 1 ? '매달 반복' : `${n}달마다 반복`),
};

const repeatText = (type, interval) => {
  const t = REPEAT_TEXT[type];
  return typeof t === 'function' ? t(interval) : t || '';
};

const hit = (needle, ...fields) => fields.some((f) => f && String(f).toLowerCase().includes(needle));

function itemResult(i) {
  const food = i.category === 'FOOD';
  const own = i.ownershipType === 'SHARED' ? (food ? '공용 음식' : '공유 물품') : `${i.ownerNickname || '구성원'}의 개인 ${food ? '음식' : '물품'}`;
  const place = i.storageLocation || (food ? '냉장고' : '창고');
  const qty = `${i.quantity}${i.unit || '개'}`;
  const expiry = i.expiryDate ? ` · 유통기한 ${md(i.expiryDate)}` : '';
  return {
    type: food ? 'FOOD' : 'SUPPLY',
    id: i.itemId,
    title: i.name,
    line1: `${place} · ${own}`,
    line2: food ? `${qty} 남음${expiry}` : `${qty}${i.ownershipType === 'SHARED' && i.ownerNickname ? ` · ${i.ownerNickname}님이 등록` : ''}${expiry}`,
  };
}

function scheduleResult(s) {
  return {
    type: 'SCHEDULE',
    id: s.scheduleId,
    title: s.title,
    line1: `${s.visibility === 'PERSONAL' ? '내 개인 일정' : '공유 일정'}${s.authorNickname ? ` · ${s.authorNickname}님` : ''}`,
    line2: `${mdw(s.startAt)}${s.description ? ` · ${s.description}` : ''}`,
    date: String(s.startAt).slice(0, 10), // 눌렀을 때 캘린더를 이 날짜로 연다
  };
}

function cleaningResult(t) {
  const who = t.assignee && t.assignee.nickname ? `${t.assignee.nickname}님 담당` : '담당자 없음';
  return {
    type: 'CLEANING',
    id: t.taskId,
    title: t.areaName,
    line1: `청소 · ${who}`,
    line2: `${mdw(t.nextDueDate)} · ${repeatText(t.repeatType, t.repeatInterval)}`,
    date: String(t.nextDueDate).slice(0, 10),
  };
}

async function search(userId, roomId, q) {
  const needle = q.toLowerCase();

  const [allItems, allSchedules, allTasks] = await Promise.all([
    items.listItems(userId, roomId, { scope: 'all', status: 'STORED', limit: 500 }),
    schedules.listSchedules(userId, roomId, { limit: 500 }),
    cleaning.listTasks(userId, roomId, { active: 'true' }),
  ]);

  const itemHits = allItems
    .filter((i) => hit(needle, i.name, i.storageLocation, i.ownerNickname))
    .map(itemResult);
  const scheduleHits = [
    ...allSchedules.filter((s) => hit(needle, s.title, s.description, s.authorNickname)).map(scheduleResult),
    ...allTasks.filter((t) => hit(needle, t.areaName, t.assignee && t.assignee.nickname)).map(cleaningResult),
  ];

  const results = [...itemHits, ...scheduleHits];
  const count = (type) => results.filter((r) => r.type === type).length;
  return {
    query: q,
    counts: {
      all: results.length,
      food: count('FOOD'),
      supply: count('SUPPLY'),
      schedule: count('SCHEDULE') + count('CLEANING'),
    },
    results: results.slice(0, 100),
  };
}

module.exports = { search };