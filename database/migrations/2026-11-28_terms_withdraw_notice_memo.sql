-- =====================================================================
-- 마이그레이션: 약관 동의 기록, 회원 탈퇴 표시, 공지사항, 공동 메모
-- 이미 만들어 둔 DB(roomade, roomade_test)에 한 번만 적용한다. 새 DB는 schema.sql에 포함되어 있다.
--   mysql -h 127.0.0.1 -P <포트> -u <계정> -p roomade       < database/migrations/2026-11-28_terms_withdraw_notice_memo.sql
--   mysql -h 127.0.0.1 -P <포트> -u <계정> -p roomade_test  < database/migrations/2026-11-28_terms_withdraw_notice_memo.sql
-- =====================================================================
-- 약관 동의 기록, 회원 탈퇴 표시
ALTER TABLE users
  ADD COLUMN terms_version     VARCHAR(20) NULL COMMENT '가입할 때 동의한 이용약관 버전' AFTER photo_public,
  ADD COLUMN terms_agreed_at   DATETIME    NULL COMMENT '이용약관 동의 시각' AFTER terms_version,
  ADD COLUMN privacy_agreed_at DATETIME    NULL COMMENT '개인정보 수집·이용 동의 시각' AFTER terms_agreed_at,
  ADD COLUMN withdrawn_at      DATETIME    NULL COMMENT '회원 탈퇴 시각(NULL이면 정상 회원). 탈퇴하면 개인정보는 지우고 기록용 행만 남긴다' AFTER privacy_agreed_at;

-- 서비스 공지사항 (운영자가 scripts/notice.js 로 등록)
CREATE TABLE IF NOT EXISTS notices (
  notice_id   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '공지번호',
  title       VARCHAR(150)    NOT NULL COMMENT '제목',
  body        TEXT            NOT NULL COMMENT '내용',
  is_pinned   TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '1이면 목록 맨 위에 고정',
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (notice_id),
  KEY idx_notices_list (is_pinned, notice_id)
) ENGINE=InnoDB COMMENT='서비스 공지사항';

-- 공동 메모: 방 구성원 모두가 보는 메모
CREATE TABLE IF NOT EXISTS room_memos (
  memo_id     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '메모번호',
  room_id     BIGINT UNSIGNED NOT NULL COMMENT '방번호',
  user_id     BIGINT UNSIGNED NOT NULL COMMENT '작성 회원번호',
  title       VARCHAR(100)    NOT NULL COMMENT '제목',
  content     VARCHAR(2000)   NULL COMMENT '내용',
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (memo_id),
  KEY idx_room_memos_room (room_id, updated_at),
  CONSTRAINT fk_room_memos_room FOREIGN KEY (room_id) REFERENCES rooms (room_id) ON DELETE CASCADE,
  CONSTRAINT fk_room_memos_user FOREIGN KEY (user_id) REFERENCES users (user_id)
) ENGINE=InnoDB COMMENT='공동 메모';