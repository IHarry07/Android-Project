-- =====================================================================
-- 마이그레이션: schedules 테이블에 내용(description)과 공개 범위(visibility) 컬럼 추가
--   visibility = 'SHARED'   방 구성원 모두에게 보이는 공유 일정 (기본값)
--   visibility = 'PERSONAL' 작성자에게만 보이는 개인 일정
-- 이미 만들어 둔 DB(roomade, roomade_test)에 한 번만 적용한다.
-- 새로 만드는 DB는 schema.sql에 이미 포함되어 있어 적용할 필요가 없다.
--
-- 적용 방법 (이미 적용된 DB에 다시 실행하면 "Duplicate column name" 오류가 난다. 무해하다.)
--   mysql -h 127.0.0.1 -P <포트> -u <계정> -p roomade       < database/migrations/2026-11-26_schedules_description_visibility.sql
--   mysql -h 127.0.0.1 -P <포트> -u <계정> -p roomade_test  < database/migrations/2026-11-26_schedules_description_visibility.sql
--
-- 기존 일정은 모두 공유 일정(SHARED)으로 남고, 데이터는 지워지지 않는다.
-- =====================================================================

ALTER TABLE schedules
  ADD COLUMN description VARCHAR(500) NULL COMMENT '일정 내용(선택, 500자 이하)'
  AFTER title,
  ADD COLUMN visibility ENUM('SHARED','PERSONAL') NOT NULL DEFAULT 'SHARED'
  COMMENT 'SHARED=방 구성원 공개, PERSONAL=작성자만'
  AFTER description;
