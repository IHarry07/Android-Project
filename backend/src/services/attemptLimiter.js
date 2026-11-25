/**
 * 같은 대상(예: 아이디)에 대한 실패 횟수를 세어 일정 시간 막는다. 서버 메모리에만 저장하므로 서버를 다시 켜면 초기화된다.
 * 존재하지 않는 대상도 똑같이 세기 때문에, 막혔는지로 그 아이디가 있는지 알아낼 수 없다.
 */

const WINDOW_MS = 15 * 60 * 1000; // 15분
const MAX_FAILURES = 5;
const MAX_ENTRIES = 10000;

const failures = new Map(); // key -> { count, firstAt }

function active(entry) {
  return entry && Date.now() - entry.firstAt <= WINDOW_MS;
}

function isLocked(key) {
  const entry = failures.get(key);
  if (!active(entry)) {
    failures.delete(key);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

function recordFailure(key) {
  const entry = failures.get(key);
  if (active(entry)) {
    entry.count += 1;
    return;
  }
  // 오래된 기록이 너무 쌓이지 않게 가끔 정리한다.
  if (failures.size >= MAX_ENTRIES) {
    for (const [k, e] of failures) if (!active(e)) failures.delete(k);
    if (failures.size >= MAX_ENTRIES) failures.clear();
  }
  failures.set(key, { count: 1, firstAt: Date.now() });
}

function clear(key) {
  failures.delete(key);
}

module.exports = { isLocked, recordFailure, clear, WINDOW_MS, MAX_FAILURES };
