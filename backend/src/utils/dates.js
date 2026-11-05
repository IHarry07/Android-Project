// 날짜는 모두 "YYYY-MM-DD" 문자열로 다룬다. 시간대 문제를 피하려고 UTC로만 계산한다.

function toDate(str) {
  return new Date(`${str}T00:00:00Z`);
}

function toStr(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(str, days) {
  const d = toDate(str);
  d.setUTCDate(d.getUTCDate() + days);
  return toStr(d);
}

/** 월 단위로 더한다. 31일에 한 달을 더했는데 다음 달이 짧으면 그 달의 마지막 날로 맞춘다. */
function addMonths(str, months) {
  const d = toDate(str);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return toStr(d);
}

function addPeriod(str, repeatType, interval) {
  if (repeatType === 'DAILY') return addDays(str, interval);
  if (repeatType === 'WEEKLY') return addDays(str, interval * 7);
  if (repeatType === 'MONTHLY') return addMonths(str, interval);
  return null;
}

/**
 * 완료·건너뜀 뒤의 다음 예정일.
 * 지금 예정일에서 주기를 더하되, 오늘 이후가 될 때까지 반복해서 더한다.
 * 늦게 완료해도 이미 지나간 날짜가 다음 예정일이 되지 않는다.
 * 반복이 없으면(NONE) null.
 */
function nextDueDate(due, repeatType, interval, today) {
  if (repeatType === 'NONE') return null;
  let next = addPeriod(due, repeatType, interval);
  while (next <= today) next = addPeriod(next, repeatType, interval);
  return next;
}

module.exports = { addDays, addMonths, nextDueDate };
