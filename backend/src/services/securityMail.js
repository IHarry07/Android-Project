const mail = require('./mailService');

/**
 * 계정 보안 알림 메일. 보내지 못해도 요청은 실패시키지 않는다. (서버 로그에만 남긴다.)
 * 메일 설정이 없으면 보내지 않는다.
 */
function send(to, subject, lines) {
  if (!to || !mail.canSend()) return;
  mail.send({ to, subject: `[룸메이드] ${subject}`, text: lines.join('\n') })
    .catch((e) => console.error('보안 알림 메일 발송 실패:', e.message));
}

const notMe = '본인이 하지 않았다면 바로 비밀번호를 바꾸고 고객센터로 알려 주세요.';

module.exports = {
  loginLocked(to) {
    send(to, '로그인이 잠시 잠겼어요', [
      '룸메이드 계정에 비밀번호가 5번 틀린 로그인 시도가 있어서 15분 동안 로그인을 막았어요.',
      '15분 뒤에 다시 로그인할 수 있어요.', '', notMe,
    ]);
  },
  passwordChanged(to) {
    send(to, '비밀번호가 변경됐어요', [
      '룸메이드 계정의 비밀번호가 변경됐어요. 다른 기기의 로그인은 모두 해제됐어요.', '', notMe,
    ]);
  },
  emailChanged(oldEmail, newEmail) {
    const masked = newEmail.replace(/^(.{2}).*(@.*)$/, '$1***$2');
    send(oldEmail, '이메일이 변경됐어요', [
      `룸메이드 계정의 이메일이 ${masked} (으)로 변경됐어요. 앞으로 비밀번호 찾기 메일은 새 주소로 가요.`, '', notMe,
    ]);
  },
  withdrawn(to) {
    send(to, '회원 탈퇴가 완료됐어요', [
      '룸메이드 회원 탈퇴가 완료됐어요. 그동안 이용해 주셔서 감사합니다.',
      '개인정보와 프로필 사진은 삭제했고, 함께 쓰던 지출·청소 기록에는 "탈퇴한 회원"으로만 남아요.',
      '', '본인이 탈퇴하지 않았다면 고객센터로 알려 주세요.',
    ]);
  },
};