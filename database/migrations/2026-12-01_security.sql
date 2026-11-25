-- =====================================================================
-- 마이그레이션: 보안 작업 (이메일 인증번호, 로그아웃 세션 무효화)
-- 이미 만들어 둔 DB(roomade, roomade_test)에 한 번만 적용한다. 새 DB는 schema.sql에 포함되어 있다.
--   mysql -h 127.0.0.1 -P <포트> -u <계정> -p roomade       < database/migrations/2026-12-01_security.sql
--   mysql -h 127.0.0.1 -P <포트> -u <계정> -p roomade_test  < database/migrations/2026-12-01_security.sql
-- =====================================================================
-- 가입·이메일 변경 때 보낸 이메일 인증번호 (이메일마다 하나, 해시로만 저장)
CREATE TABLE IF NOT EXISTS email_verifications (
  email       VARCHAR(100)     NOT NULL COMMENT '인증할 이메일(소문자)',
  code_hash   CHAR(64)         NOT NULL COMMENT '인증번호 해시',
  attempts    TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '틀린 횟수(5번이면 무효)',
  expires_at  DATETIME         NOT NULL COMMENT '만료 시각(보낸 뒤 10분)',
  sent_at     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '보낸 시각',
  PRIMARY KEY (email)
) ENGINE=InnoDB COMMENT='이메일 인증번호';

-- 로그아웃한 로그인(세션). 여기 있는 세션의 토큰은 만료 전이라도 쓸 수 없다.
CREATE TABLE IF NOT EXISTS revoked_sessions (
  sid         CHAR(32) NOT NULL COMMENT '로그인 세션 번호(토큰의 sid)',
  expires_at  DATETIME NOT NULL COMMENT '이 기록을 지워도 되는 시각(토큰 최대 수명 뒤)',
  PRIMARY KEY (sid),
  KEY idx_revoked_sessions_expires (expires_at)
) ENGINE=InnoDB COMMENT='로그아웃한 세션';