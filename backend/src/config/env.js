require('dotenv').config({ quiet: true });

const required = [
  'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME',
  'JWT_SECRET', 'ACCOUNT_ENC_KEY',
];

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(`필수 환경변수가 없습니다: ${missing.join(', ')} (.env.example 참고)`);
}

if (process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET은 32자 이상이어야 합니다.');
}

if (!/^[0-9a-fA-F]{64}$/.test(process.env.ACCOUNT_ENC_KEY)) {
  throw new Error('ACCOUNT_ENC_KEY는 64자리 16진수(32바이트)여야 합니다.');
}

const isProduction = process.env.NODE_ENV === 'production';
if (isProduction && process.env.MAIL_DEV_CONSOLE === 'true') {
  throw new Error('배포(NODE_ENV=production)에서는 MAIL_DEV_CONSOLE을 켤 수 없습니다. (인증번호가 로그에 남습니다)');
}

// 앞단 프록시(HTTPS를 처리하는 Caddy 등)를 믿을지. 믿어야 요청 수 제한이 실제 사용자 IP 기준으로 동작한다.
//  - 비우면 믿지 않는다. (PC에서 직접 받는 개발·시연)
//  - loopback: 같은 서버(127.0.0.1)의 프록시만 믿는다. (배포 서버 권장)
//  - 숫자: 앞단 프록시 개수
function parseTrustProxy(value) {
  if (!value) return false;
  if (/^\d+$/.test(value)) return Number(value);
  if (value === 'true') return true;
  return value;
}

module.exports = {
  isTest: process.env.NODE_ENV === 'test',
  isProduction,
  port: Number(process.env.PORT || 3000),
  // 서버가 받을 주소. 배포에서는 127.0.0.1(프록시만 접근)로, 비우면 모든 주소(같은 와이파이의 폰이 직접 접속).
  host: process.env.HOST || undefined,
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  db: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  },
  jwtSecret: process.env.JWT_SECRET,
  accountEncKey: Buffer.from(process.env.ACCOUNT_ENC_KEY, 'hex'),
  // 로그인 유지를 체크하지 않은 토큰: 마지막 요청 후 이 시간이 지나면 만료
  idleTokenTtl: '1h',
  // 로그인 유지를 체크한 토큰: 로그인한 날부터 이 기간이 지나면 만료
  keepTokenTtl: '30d',
  // 초대 코드 기본 유효 기간(일)
  inviteDefaultDays: 7,
  // 하루 한 번 만드는 알림(유통기한, 청소 당번)을 이 시각(시) 이후에 만든다. DB 서버 시계 기준
  notifyHour: 9,
  // 로그인한 회원 한 명이 1분에 보낼 수 있는 요청 수 (도배 방지). 테스트에서는 쓰지 않는다.
  userRateLimitPerMinute: Number(process.env.USER_RATE_LIMIT_PER_MINUTE || 120),
  // 개발용: 메일 설정(SMTP)이 없을 때 인증번호를 서버 콘솔에 출력한다. 배포에서는 절대 켜지 않는다.
  mailDevConsole: process.env.MAIL_DEV_CONSOLE === 'true',
  // 알림 스케줄러를 끄려면 DISABLE_SCHEDULER=true (테스트에서는 항상 꺼진다)
  schedulerEnabled: process.env.NODE_ENV !== 'test' && process.env.DISABLE_SCHEDULER !== 'true',
};
