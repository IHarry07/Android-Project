-- =====================================================================
-- 마이그레이션: schedules.reminder_minutes (일정별 알림 시간) 추가
--   일정을 만든 사람이 "시작 몇 분 전"에 알릴지 정한다. NULL이면 알림이 없다. 기존 일정은 60분 전으로 둔다.
-- 이미 만들어 둔 DB(roomade, roomade_test)에 한 번만 적용한다. 새 DB는 schema.sql에 포함되어 있다.
--   mysql -h 127.0.0.1 -P <포트> -u <계정> -p roomade       < database/migrations/2026-11-27_schedule_reminder.sql
--   mysql -h 127.0.0.1 -P <포트> -u <계정> -p roomade_test  < database/migrations/2026-11-27_schedule_reminder.sql
-- =====================================================================

ALTER TABLE schedules
  ADD COLUMN reminder_minutes INT UNSIGNED NULL DEFAULT 60
  COMMENT '시작 몇 분 전에 알릴지(0=정각, NULL=알림 없음)' AFTER end_at;