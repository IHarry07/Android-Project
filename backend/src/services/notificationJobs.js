const { pool } = require('../config/db');
const env = require('../config/env');
const { createNotifications } = require('./notificationService');

/**
 * 시간이 되면 자동으로 만드는 알림
 *
 *  - 매일 오전 9시 이후 하루 한 번 (DB 서버 시계 기준)
 *      유통기한 3일 전·1일 전·당일, 그리고 지난 뒤 한 번: 개인 물품은 등록한 사람에게, 공용 물품은 방 구성원 모두에게
 *      오늘의 청소 당번: 오늘이 예정일인 청소의 담당자에게. 기한이 지난 청소는 다시 알리지 않는다.
 *  - 1분마다
 *      일정 시작 1시간 전: 작성자를 뺀 방 구성원에게
 *
 * 모든 알림에 중복 방지 키가 있어서 같은 작업을 여러 번 실행해도 알림은 한 번만 생긴다.
 * 서버가 9시에 꺼져 있었다면 켜지는 시점에 그날 몫을 한 번 만든다.
 */

// 유통기한까지 남은 날: 3일 전, 1일 전, 당일은 그날 알리고,
// 지난 뒤에는 최근 3일 안에 지난 물품을 한 번만 알린다. (서버가 하루 꺼져 있어도 놓치지 않도록)
const EXPIRY_DAYS = [3, 1, 0];
const EXPIRED_WITHIN_DAYS = 3;

const EXPIRY_TITLE = {
  3: '유통기한이 3일 남았어요',
  1: '유통기한이 내일까지예요',
  0: '오늘이 유통기한이에요',
  expired: '유통기한이 지났어요',
};

async function membersOfRooms(roomIds) {
  if (roomIds.length === 0) return new Map();
  const [rows] = await pool.query('SELECT room_id, user_id FROM room_members WHERE room_id IN (?)', [roomIds]);
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.room_id)) map.set(r.room_id, []);
    map.get(r.room_id).push(r.user_id);
  }
  return map;
}

async function expiryNotifications() {
  const [items] = await pool.query(
    `SELECT i.item_id, i.room_id, i.name, i.ownership_type, i.created_by, i.expiry_date,
            DATEDIFF(i.expiry_date, CURDATE()) AS days_left
       FROM items i
      WHERE i.status = 'STORED' AND i.expiry_date IS NOT NULL
        AND (DATEDIFF(i.expiry_date, CURDATE()) IN (?)
             OR DATEDIFF(i.expiry_date, CURDATE()) BETWEEN ? AND -1)`,
    [EXPIRY_DAYS, -EXPIRED_WITHIN_DAYS],
  );
  const members = await membersOfRooms([...new Set(items.map((i) => i.room_id))]);
  const rows = [];
  for (const i of items) {
    const personal = i.ownership_type === 'PERSONAL';
    const recipients = personal ? [i.created_by] : members.get(i.room_id) || [];
    // 지난 뒤 알림은 며칠이 지났든 같은 키를 써서 한 번만 간다.
    const stage = i.days_left < 0 ? 'expired' : i.days_left;
    for (const userId of recipients) {
      rows.push({
        userId,
        roomId: i.room_id,
        type: 'ITEM_EXPIRY',
        title: EXPIRY_TITLE[stage],
        body: `${personal ? '내' : '공용'} '${i.name}'`,
        targetType: 'ITEM',
        targetId: i.item_id,
        dedupeKey: `ITEM_EXPIRY:${i.item_id}:${i.expiry_date}:${stage}`,
      });
    }
  }
  return createNotifications(pool, rows);
}

async function cleaningNotifications() {
  const [tasks] = await pool.query(
    `SELECT task_id, room_id, area_name, assignee_user_id, next_due_date
       FROM cleaning_tasks
      WHERE is_active = 1 AND next_due_date = CURDATE() AND assignee_user_id IS NOT NULL`,
  );
  const rows = tasks.map((t) => ({
    userId: t.assignee_user_id,
    roomId: t.room_id,
    type: 'CLEANING_DUE',
    title: '오늘은 청소 당번이에요',
    body: t.area_name,
    targetType: 'CLEANING_TASK',
    targetId: t.task_id,
    dedupeKey: `CLEANING_DUE:${t.task_id}:${t.next_due_date}`,
  }));
  return createNotifications(pool, rows);
}

async function scheduleNotifications() {
  const [schedules] = await pool.query(
    `SELECT schedule_id, room_id, user_id, title, start_at
       FROM schedules
      WHERE start_at > NOW() AND start_at <= DATE_ADD(NOW(), INTERVAL 60 MINUTE)`,
  );
  const members = await membersOfRooms([...new Set(schedules.map((s) => s.room_id))]);
  const rows = [];
  for (const s of schedules) {
    for (const userId of members.get(s.room_id) || []) {
      if (userId === s.user_id) continue; // 작성자는 이미 알고 있다.
      rows.push({
        userId,
        roomId: s.room_id,
        type: 'SCHEDULE_START',
        title: '곧 시작하는 일정이 있어요',
        body: `'${s.title}' ${s.start_at.slice(11, 16)} 시작`,
        targetType: 'SCHEDULE',
        targetId: s.schedule_id,
        // 일정 시각을 옮기면 새 키가 되어 다시 알린다.
        dedupeKey: `SCHEDULE_START:${s.schedule_id}:${s.start_at}`,
      });
    }
  }
  return createNotifications(pool, rows);
}

/** 오래된 알림 정리 */
async function purgeOld() {
  const [result] = await pool.query('DELETE FROM notifications WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY)');
  return result.affectedRows;
}

async function runDailyJobs() {
  const expiry = await expiryNotifications();
  const cleaning = await cleaningNotifications();
  const purged = await purgeOld();
  return { expiry, cleaning, purged };
}

async function runScheduleStartJob() {
  return { schedule: await scheduleNotifications() };
}

let timer = null;
let lastDailyRunDate = null;

async function tick() {
  try {
    const [rows] = await pool.query('SELECT CURDATE() AS today, HOUR(NOW()) AS hour');
    const { today, hour } = rows[0];
    if (hour >= env.notifyHour && lastDailyRunDate !== today) {
      const result = await runDailyJobs();
      lastDailyRunDate = today;
      console.log(`[알림] 일일 작업 완료 ${today}`, result);
    }
    await runScheduleStartJob();
  } catch (err) {
    // 알림 작업이 실패해도 서버는 계속 동작해야 한다.
    console.error('[알림] 작업 실패:', err.message);
  }
}

/** 서버 시작 때 한 번 호출한다. 시작하자마자 한 번 실행해 밀린 알림을 만든다. */
function startScheduler() {
  if (timer) return;
  tick();
  timer = setInterval(tick, 60 * 1000);
  timer.unref();
}

function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { runDailyJobs, runScheduleStartJob, startScheduler, stopScheduler };
