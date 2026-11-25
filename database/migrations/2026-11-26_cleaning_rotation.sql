-- =====================================================================
-- 마이그레이션: 청소당번 순번 순환
--   cleaning_tasks.rotation_enabled  1이면 완료·건너뜀 뒤 다음 회차의 담당자가 순번대로 다음 사람으로 넘어간다.
--   cleaning_rotation                방의 순번(position 오름차순). 청소당번 설정을 저장할 때마다 새로 만든다.
-- 이미 만들어 둔 DB(roomade, roomade_test)에 한 번만 적용한다.
-- 새로 만드는 DB는 schema.sql에 이미 포함되어 있어 적용할 필요가 없다.
--
-- 적용 방법 (이미 적용된 DB에 다시 실행하면 "Duplicate column name" 오류가 난다. 무해하다.)
--   mysql -h 127.0.0.1 -P <포트> -u <계정> -p roomade       < database/migrations/2026-11-26_cleaning_rotation.sql
--   mysql -h 127.0.0.1 -P <포트> -u <계정> -p roomade_test  < database/migrations/2026-11-26_cleaning_rotation.sql
--
-- 기존 청소 항목은 순환 없음(0)으로 남고, 데이터는 지워지지 않는다.
-- =====================================================================

ALTER TABLE cleaning_tasks
  ADD COLUMN rotation_enabled TINYINT(1) NOT NULL DEFAULT 0
  COMMENT '1이면 완료 뒤 담당자가 순번대로 넘어감'
  AFTER repeat_interval;

CREATE TABLE IF NOT EXISTS cleaning_rotation (
  room_id   BIGINT UNSIGNED NOT NULL COMMENT '방번호',
  user_id   BIGINT UNSIGNED NOT NULL COMMENT '회원번호',
  position  INT UNSIGNED    NOT NULL COMMENT '순번(작을수록 먼저)',
  PRIMARY KEY (room_id, user_id),
  KEY idx_cleaning_rotation_room_pos (room_id, position),
  CONSTRAINT fk_cleaning_rotation_room
    FOREIGN KEY (room_id) REFERENCES rooms (room_id) ON DELETE CASCADE,
  CONSTRAINT fk_cleaning_rotation_user
    FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='청소당번 순번';
