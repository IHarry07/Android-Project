-- =====================================================================
-- 마이그레이션: device_tokens (푸시 알림용 기기 토큰) 추가
-- 이미 만들어 둔 DB(roomade, roomade_test)에 한 번만 적용한다. 새 DB는 schema.sql에 포함되어 있다.
--   mysql -h 127.0.0.1 -P <포트> -u <계정> -p roomade       < database/migrations/2026-11-27_device_tokens.sql
--   mysql -h 127.0.0.1 -P <포트> -u <계정> -p roomade_test  < database/migrations/2026-11-27_device_tokens.sql
-- =====================================================================
CREATE TABLE IF NOT EXISTS device_tokens (
  token       VARCHAR(512) NOT NULL COMMENT 'FCM 기기 토큰',
  user_id     BIGINT UNSIGNED NOT NULL COMMENT '이 기기로 로그인한 회원',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (token(255)),
  KEY idx_device_tokens_user (user_id),
  CONSTRAINT fk_device_tokens_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='푸시 알림을 보낼 기기 토큰';
