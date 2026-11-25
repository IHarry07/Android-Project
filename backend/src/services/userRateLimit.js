/**
 * 로그인한 회원별 요청 수 제한 (1분 단위). 서버 메모리에만 두므로 서버를 다시 켜면 초기화된다.
 * createCounter 는 테스트에서 직접 확인할 수 있게 따로 내보낸다.
 */
function createCounter(limit, windowMs = 60 * 1000) {
  const counts = new Map(); // key -> { count, start }
  return function hit(key, now = Date.now()) {
    const entry = counts.get(key);
    if (!entry || now - entry.start >= windowMs) {
      if (counts.size > 50000) counts.clear();
      counts.set(key, { count: 1, start: now });
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}

module.exports = { createCounter };