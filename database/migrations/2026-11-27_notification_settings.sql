-- =====================================================================
-- 마이그레이션: user_notification_settings (알림 종류별 푸시 켜기/끄기) 추가
-- 이미 만들어 둔 DB(roomade, roomade_test)에 한 번만 적용한다. 새 DB는 schema.sql에 포함되어 있다.
--   mysql -h 127.0.0.1 -P <포트> -u <계정> -p roomade       < database/migrations/2026-11-27_notification_settings.sql
--   mysql -h 127.0.0.1 -P <포트> -u <계정> -p roomade_test  < database/migrations/2026-11-27_notification_settings.sql
-- =====================================================================
CREATE TABLE IF NOT EXISTS user_notification_settings (
  user_id          BIGINT UNSIGNED NOT NULL COMMENT '회원번호',
  push_item_expiry TINYINT(1) NOT NULL DEFAULT 1 COMMENT '유통기한 알림 푸시',
  push_cleaning    TINYINT(1) NOT NULL DEFAULT 1 COMMENT '청소 알림 푸시(당번 날, 담당 변경)',
  push_schedule    TINYINT(1) NOT NULL DEFAULT 1 COMMENT '일정 시작 알림 푸시',
  push_expense     TINYINT(1) NOT NULL DEFAULT 1 COMMENT '지출·정산 알림 푸시',
  PRIMARY KEY (user_id),
  CONSTRAINT fk_notification_settings_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='알림 설정(푸시만 끈다. 앱 안 알림 목록에는 항상 쌓인다. 행이 없으면 모두 켜짐)';