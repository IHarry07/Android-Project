// 테스트 알림 보내기: 지정한 계정에 알림을 하나 만들고(앱 알림 목록에 쌓임) 그 계정의 기기로 푸시를 보낸다.
//   사용법: node scripts/send-test-notification.js <로그인ID>
//   계정 목록과 기기 등록 상태만 보려면: node scripts/send-test-notification.js
require('../src/config/env');
const { pool } = require('../src/config/db');
const notifications = require('../src/services/notificationService');

(async () => {
  const loginId = process.argv[2];
  if (!loginId) {
    const [rows] = await pool.query(
      `SELECT u.user_id, u.login_id, u.nickname, COUNT(d.token) AS devices
       FROM users u LEFT JOIN device_tokens d ON d.user_id = u.user_id
       GROUP BY u.user_id ORDER BY u.user_id`);
    console.log('계정 (기기 등록 수)');
    rows.forEach((r) => console.log(`  ${r.login_id} (${r.nickname}) : 기기 ${r.devices}대`));
    console.log('\n보내기: node scripts/send-test-notification.js <로그인ID>');
    return;
  }
  const [[user]] = await pool.query('SELECT user_id, nickname FROM users WHERE login_id = ?', [loginId]);
  if (!user) throw new Error(`로그인ID '${loginId}' 계정이 없습니다.`);
  const [[room]] = await pool.query('SELECT room_id FROM room_members WHERE user_id = ? LIMIT 1', [user.user_id]);

  const now = new Date().toLocaleTimeString('ko-KR');
  const created = await notifications.createNotifications(pool, [{
    userId: user.user_id,
    roomId: room ? room.room_id : null,
    type: 'CLEANING_DUE',
    title: '테스트 알림',
    body: `${user.nickname}님에게 보낸 테스트 알림이에요 (${now})`,
    targetType: null,
    targetId: null,
    dedupeKey: `TEST:${Date.now()}`,
  }]);
  console.log(created ? '알림을 만들고 푸시를 보냈어요.' : '알림을 만들지 못했어요.');
  await new Promise((r) => setTimeout(r, 4000)); // 푸시 전송이 끝날 때까지 기다린다.
})().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => pool.end());