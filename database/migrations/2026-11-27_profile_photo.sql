-- =====================================================================
-- 마이그레이션: 프로필 사진 (user_photos 테이블, users.photo_public 칼럼) 추가
-- 이미 만들어 둔 DB(roomade, roomade_test)에 한 번만 적용한다. 새 DB는 schema.sql에 포함되어 있다.
--   mysql -h 127.0.0.1 -P <포트> -u <계정> -p roomade       < database/migrations/2026-11-27_profile_photo.sql
--   mysql -h 127.0.0.1 -P <포트> -u <계정> -p roomade_test  < database/migrations/2026-11-27_profile_photo.sql
-- =====================================================================
CREATE TABLE IF NOT EXISTS user_photos (
  user_id     BIGINT UNSIGNED NOT NULL COMMENT '회원번호',
  image       MEDIUMBLOB      NOT NULL COMMENT '프로필 사진(JPEG, 앱이 줄여서 올린다)',
  updated_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_user_photos_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='프로필 사진';
ALTER TABLE users ADD COLUMN photo_public TINYINT(1) NOT NULL DEFAULT 1 COMMENT '프로필 사진을 같은 방 구성원에게 보일지(1=보임)';
