-- =====================================================================
-- 마이그레이션: 회원 이메일(users.email), 고객센터 문의(inquiries)
-- 이미 만들어 둔 DB(roomade, roomade_test)에 한 번만 적용한다. 새 DB는 schema.sql에 포함되어 있다.
--   mysql -h 127.0.0.1 -P <포트> -u <계정> -p roomade       < database/migrations/2026-11-29_email_inquiry.sql
--   mysql -h 127.0.0.1 -P <포트> -u <계정> -p roomade_test  < database/migrations/2026-11-29_email_inquiry.sql
-- =====================================================================
-- 이메일(선택, 비밀번호 찾기에 쓴다). 값이 있으면 회원마다 달라야 한다. (NULL은 여러 명이어도 된다.)
ALTER TABLE users
  ADD COLUMN email VARCHAR(100) NULL COMMENT '이메일(선택). 비밀번호 찾기에 쓴다' AFTER phone,
  ADD UNIQUE KEY uq_users_email (email);

-- 고객센터 문의: 회원이 남기고 운영자가 scripts/inquiry.js 로 답변한다.
CREATE TABLE IF NOT EXISTS inquiries (
  inquiry_id   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '문의번호',
  user_id      BIGINT UNSIGNED NOT NULL COMMENT '문의한 회원',
  title        VARCHAR(100)    NOT NULL COMMENT '제목',
  content      VARCHAR(2000)   NOT NULL COMMENT '내용',
  status       ENUM('WAITING','ANSWERED') NOT NULL DEFAULT 'WAITING' COMMENT '답변 대기 / 답변 완료',
  answer       TEXT            NULL COMMENT '운영자 답변',
  answered_at  DATETIME        NULL COMMENT '답변 시각',
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (inquiry_id),
  KEY idx_inquiries_user (user_id, inquiry_id),
  KEY idx_inquiries_status (status, inquiry_id),
  CONSTRAINT fk_inquiries_user FOREIGN KEY (user_id) REFERENCES users (user_id)
) ENGINE=InnoDB COMMENT='고객센터 문의';