const fs = require('fs');
const { pool } = require('../config/db');
const config = require('../config/env');

// 알림 종류 -> 설정 칼럼
const SETTING_COLUMN = {
  ITEM_EXPIRY: 'push_item_expiry',
  CLEANING_DUE: 'push_cleaning',
  CLEANING_REASSIGNED: 'push_cleaning',
  SCHEDULE_START: 'push_schedule',
  EXPENSE_SHARE: 'push_expense',
  EXPENSE_SETTLED: 'push_expense',
};

/**
 * 푸시 알림(FCM)
 *  - 알림이 새로 만들어지면 그 회원이 로그인한 기기들로 푸시를 보낸다.
 *  - FIREBASE_SERVICE_ACCOUNT(서비스 계정 키 JSON 파일 경로)가 없거나 테스트일 때는 아무것도 하지 않는다.
 *    (앱 안의 알림 목록은 푸시와 상관없이 항상 동작한다.)
 *  - 푸시 실패는 알림 생성을 막지 않는다.
 */

let messaging; // undefined: 아직 모름, null: 사용 안 함

function getMessaging() {
  if (messaging !== undefined) return messaging;
  messaging = null;
  const path = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (config.isTest || !path) return messaging;
  try {
    const { initializeApp, cert } = require('firebase-admin/app');
    const { getMessaging } = require('firebase-admin/messaging');
    const key = JSON.parse(fs.readFileSync(path, 'utf8'));
    const app = initializeApp({ credential: cert(key) });
    messaging = getMessaging(app);
    console.log('푸시 알림(FCM)을 사용합니다.');
  } catch (e) {
    console.error('푸시 알림 설정에 실패해 푸시 없이 동작합니다:', e.message);
  }
  return messaging;
}

const TOKEN_GONE = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/** rows: { userId, title, body, targetType } — 저장된 기기마다 한 건씩 보낸다. */
async function sendForNotifications(allRows) {
  const m = getMessaging();
  if (!m || allRows.length === 0) return;

  // 푸시를 끈 종류는 보내지 않는다. (앱 안 알림 목록에는 이미 저장됐다.)
  const [prefs] = await pool.query('SELECT * FROM user_notification_settings WHERE user_id IN (?)', [[...new Set(allRows.map((r) => r.userId))]]);
  const prefOf = new Map(prefs.map((x) => [Number(x.user_id), x]));
  const rows = allRows.filter((r) => {
    const col = SETTING_COLUMN[r.type];
    const pref = prefOf.get(Number(r.userId));
    return !col || !pref || pref[col] === 1;
  });
  if (rows.length === 0) return;

  const userIds = [...new Set(rows.map((r) => r.userId))];
  const [tokens] = await pool.query('SELECT token, user_id FROM device_tokens WHERE user_id IN (?)', [userIds]);
  if (tokens.length === 0) return;

  const messages = [];
  for (const row of rows) {
    for (const t of tokens.filter((x) => Number(x.user_id) === Number(row.userId))) {
      messages.push({
        token: t.token,
        // data만 보낸다: 앱이 직접 알림을 만들어서 탭 이동 정보(tab)를 넣는다.
        data: { title: row.title, body: row.body, targetType: row.targetType || '' },
        android: { priority: 'high' },
      });
    }
  }
  if (messages.length === 0) return;

  const result = await m.sendEach(messages);
  const dead = [];
  result.responses.forEach((r, i) => {
    if (!r.success && TOKEN_GONE.has(r.error && r.error.code)) dead.push(messages[i].token);
  });
  if (dead.length > 0) await pool.query('DELETE FROM device_tokens WHERE token IN (?)', [dead]);
}

/** 알림 저장이 끝난 뒤 기다리지 않고 보낸다. */
function sendInBackground(rows) {
  sendForNotifications(rows).catch((e) => console.error('푸시 전송 실패:', e.message));
}

async function registerDevice(userId, token) {
  await pool.query(
    `INSERT INTO device_tokens (token, user_id) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
    [token, userId],
  );
}

/** 기기 토큰은 추측할 수 없는 값이라, 로그인이 풀린 뒤에도 토큰만으로 등록을 해제할 수 있게 한다. */
async function unregisterDevice(token) {
  await pool.query('DELETE FROM device_tokens WHERE token = ?', [token]);
}

/** 알림 종류별 푸시 설정. 행이 없으면 모두 켜짐. */
async function getSettings(userId) {
  const [[row]] = await pool.query('SELECT * FROM user_notification_settings WHERE user_id = ?', [userId]);
  const on = (col) => (row ? row[col] === 1 : true);
  return {
    itemExpiry: on('push_item_expiry'),
    cleaning: on('push_cleaning'),
    schedule: on('push_schedule'),
    expense: on('push_expense'),
  };
}

async function updateSettings(userId, fields) {
  const next = { ...(await getSettings(userId)), ...fields };
  await pool.query(
    `INSERT INTO user_notification_settings (user_id, push_item_expiry, push_cleaning, push_schedule, push_expense)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE push_item_expiry = VALUES(push_item_expiry), push_cleaning = VALUES(push_cleaning),
       push_schedule = VALUES(push_schedule), push_expense = VALUES(push_expense)`,
    [userId, next.itemExpiry ? 1 : 0, next.cleaning ? 1 : 0, next.schedule ? 1 : 0, next.expense ? 1 : 0],
  );
  return next;
}

module.exports = { sendInBackground, registerDevice, unregisterDevice, getSettings, updateSettings };