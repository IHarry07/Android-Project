-- =====================================================================
-- 마이그레이션: rooms 테이블에 방 소개(description) 컬럼 추가
-- 이미 만들어 둔 DB(roomade, roomade_test)에 한 번만 적용한다.
-- 새로 만드는 DB는 schema.sql에 이미 포함되어 있어 적용할 필요가 없다.
--
-- 적용 방법 (이미 적용된 DB에 다시 실행하면 "Duplicate column name" 오류가 난다. 무해하다.)
--   mysql -h 127.0.0.1 -P <포트> -u <계정> -p roomade       < database/migrations/2026-11-25_rooms_description.sql
--   mysql -h 127.0.0.1 -P <포트> -u <계정> -p roomade_test  < database/migrations/2026-11-25_rooms_description.sql
--
-- 기존 방은 description이 NULL(소개 없음)로 남고, 데이터는 지워지지 않는다.
-- =====================================================================

ALTER TABLE rooms
  ADD COLUMN description VARCHAR(100) NULL COMMENT '방 소개(선택, 100자 이하)'
  AFTER room_name;
