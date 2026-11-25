// 메일 발송 설정 확인: .env 의 SMTP 설정으로 테스트 메일을 한 통 보낸다.
//   사용법: node scripts/send-test-mail.js <받을 이메일 주소>
// 설정이 비어 있으면 어떤 항목이 비었는지 알려 준다. (비밀번호 값은 출력하지 않는다.)
require('../src/config/env');
const mail = require('../src/services/mailService');

(async () => {
  const to = process.argv[2];
  const missing = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD'].filter((k) => !process.env[k]);
  if (missing.length > 0) throw new Error(`.env 에 다음 항목이 비어 있어요: ${missing.join(', ')}`);
  if (!to) throw new Error('사용법: node scripts/send-test-mail.js <받을 이메일 주소>');
  console.log(`보내는 계정: ${process.env.SMTP_USER}  /  서버: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}`);
  await mail.send({
    to,
    subject: '[룸메이드] 메일 발송 테스트',
    text: '이 메일이 보이면 룸메이드 서버의 메일 발송 설정이 정상입니다.',
  });
  console.log(`${to} 로 테스트 메일을 보냈어요. 받은편지함(스팸함 포함)을 확인해 주세요.`);
})().catch((e) => { console.error('실패:', e.message); process.exitCode = 1; });