-- =====================================================================
-- 마이그레이션: 알림 종류에 CLEANING_REASSIGNED(청소 담당자 변경) 추가
--   청소 담당자가 바뀌면 새 담당자와 원래 담당자(바꾼 사람 제외)에게 알림을 보낸다.
-- 이미 만들어 둔 DB(roomade, roomade_test)에 한 번만 적용한다.
-- 새로 만드는 DB는 schema.sql에 이미 포함되어 있어 적용할 필요가 없다.
--
-- 적용 방법 (이미 적용된 DB에 다시 실행해도 같은 결과라 무해하다.)
--   mysql -h 127.0.0.1 -P <포트> -u <계정> -p roomade       < database/migrations/2026-11-26_notification_cleaning_reassigned.sql
--   mysql -h 127.0.0.1 -P <포트> -u <계정> -p roomade_test  < database/migrations/2026-11-26_notification_cleaning_reassigned.sql
--
-- 기존 알림은 그대로 남는다.
-- =====================================================================

ALTER TABLE notifications
  MODIFY COLUMN type ENUM('ITEM_EXPIRY','CLEANING_DUE','SCHEDULE_START','EXPENSE_SHARE','EXPENSE_SETTLED','CLEANING_REASSIGNED')
  NOT NULL COMMENT '알림 종류';
