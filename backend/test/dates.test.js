// 날짜 계산 단위 테스트 (DB 불필요)
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { addDays, addMonths, nextDueDate } = require('../src/utils/dates');

describe('날짜 계산', () => {
  it('addDays: 월·연도 경계', () => {
    assert.equal(addDays('2026-11-30', 1), '2026-12-01');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
    assert.equal(addDays('2028-03-01', -1), '2028-02-29', '윤년');
  });

  it('addMonths: 짧은 달은 마지막 날로 맞춘다', () => {
    assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
    assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
    assert.equal(addMonths('2026-03-31', 1), '2026-04-30');
    assert.equal(addMonths('2026-11-15', 2), '2027-01-15');
    assert.equal(addMonths('2026-12-15', 1), '2027-01-15');
  });

  it('nextDueDate: 예정일에 주기를 더한다', () => {
    assert.equal(nextDueDate('2026-11-05', 'DAILY', 1, '2026-11-05'), '2026-11-06');
    assert.equal(nextDueDate('2026-11-05', 'WEEKLY', 2, '2026-11-05'), '2026-11-19');
    assert.equal(nextDueDate('2026-11-05', 'MONTHLY', 1, '2026-11-05'), '2026-12-05');
  });

  it('nextDueDate: 일찍 끝내도 다음 예정일은 원래 주기를 따른다', () => {
    assert.equal(nextDueDate('2026-11-10', 'WEEKLY', 1, '2026-11-05'), '2026-11-17');
  });

  it('nextDueDate: 늦게 끝내면 오늘 이후의 가장 가까운 주기일로 건너뛴다', () => {
    assert.equal(nextDueDate('2026-11-01', 'WEEKLY', 1, '2026-11-20'), '2026-11-22');
    assert.equal(nextDueDate('2026-11-01', 'DAILY', 1, '2026-11-20'), '2026-11-21');
    assert.equal(nextDueDate('2026-01-31', 'MONTHLY', 1, '2026-05-10'), '2026-05-28', '말일 보정 이후 그 날짜를 따라간다');
  });

  it('nextDueDate: 반복이 없으면 null', () => {
    assert.equal(nextDueDate('2026-11-05', 'NONE', 1, '2026-11-05'), null);
  });
});
