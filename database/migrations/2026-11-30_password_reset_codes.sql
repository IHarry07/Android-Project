-- =====================================================================
-- 마이그레이션: password_reset_codes (이메일 인증번호) 추가
-- 이미 만들어 둔 DB(roomade, roomade_test)에 한 번만 적용한다. 새 DB는 schema.sql에 포함되어 있다.
--   mysql -h 127.0.0.1 -P <포트> -u <계정> -p roomade       < database/migrations/2026-11-30_password_reset_codes.sql
--   mysql -h 127.0.0.1 -P <포트> -u <계정> -p roomade_test  < database/migrations/2026-11-30_password_reset_codes.sql
-- =====================================================================
-- 이메일로 비밀번호를 찾을 때 보낸 인증번호 (회원마다 하나, 해시로만 저장)
CREATE TABLE IF NOT EXISTS password_reset_codes (
  user_id     BIGINT UNSIGNED NOT NULL COMMENT '회원번호',
  code_hash   CHAR(64)        NOT NULL COMMENT '인증번호 해시',
  attempts    TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '틀린 횟수(5번이면 무효)',
  expires_at  DATETIME        NOT NULL COMMENT '만료 시각(보낸 뒤 10분)',
  sent_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '보낸 시각',
  PRIMARY KEY (user_id),
  CONSTRAINT fk_password_reset_codes_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='비밀번호 찾기 이메일 인증번호';