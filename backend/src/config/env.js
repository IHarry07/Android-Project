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

module.exports = {
  isTest: process.env.NODE_ENV === 'test',
  port: Number(process.env.PORT || 3000),
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
