-- =====================================================================
-- 마이그레이션: 청소 담당자 변경 이력과 "이번 회차만 대신하기"
--   cleaning_tasks.base_assignee_user_id  이번 회차만 다른 사람이 대신할 때의 원래 담당자.
--                                         회차가 끝나면 비워지고, 다음 회차는 원래 담당자(순환이면 그 다음 사람)로 돌아간다.
--   cleaning_assignee_changes              담당자를 바꿀 때마다 남기는 이력 (누가, 누구에서 누구로, 이번만/계속, 사유)
-- 이미 만들어 둔 DB(roomade, roomade_test)에 한 번만 적용한다.
-- 새로 만드는 DB는 schema.sql에 이미 포함되어 있어 적용할 필요가 없다.
--
-- 적용 방법 (이미 적용된 DB에 다시 실행하면 "Duplicate column name" 오류가 난다. 무해하다.)
--   mysql -h 127.0.0.1 -P <포트> -u <계정> -p roomade       < database/migrations/2026-11-26_cleaning_reassign.sql
--   mysql -h 127.0.0.1 -P <포트> -u <계정> -p roomade_test  < database/migrations/2026-11-26_cleaning_reassign.sql
--
-- 기존 데이터는 그대로 남는다. (기존 항목은 원래 담당자 없음, 변경 이력 없음)
-- =====================================================================

ALTER TABLE cleaning_tasks
  ADD COLUMN base_assignee_user_id BIGINT UNSIGNED NULL
  COMMENT '이번 회차만 대신하는 경우의 원래 담당자'
  AFTER assignee_user_id,
  ADD CONSTRAINT fk_cleaning_tasks_base_assignee
    FOREIGN KEY (base_assignee_user_id) REFERENCES users (user_id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS cleaning_assignee_changes (
  change_id    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '변경번호',
  task_id      BIGINT UNSIGNED NOT NULL COMMENT '청소번호',
  due_date     DATE            NOT NULL COMMENT '바꿀 당시의 예정일(어느 회차인지)',
  from_user_id BIGINT UNSIGNED NULL COMMENT '이전 담당자(없었으면 NULL)',
  to_user_id   BIGINT UNSIGNED NULL COMMENT '새 담당자',
  changed_by   BIGINT UNSIGNED NULL COMMENT '바꾼 사람',
  scope        ENUM('ONCE','ALWAYS') NOT NULL COMMENT 'ONCE=이번 회차만, ALWAYS=앞으로 계속',
  reason       VARCHAR(255)    NULL COMMENT '변경 사유(선택)',
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (change_id),
  KEY idx_cleaning_changes_task (task_id, change_id),
  CONSTRAINT fk_cleaning_changes_task
    FOREIGN KEY (task_id) REFERENCES cleaning_tasks (task_id) ON DELETE CASCADE,
  CONSTRAINT fk_cleaning_changes_from
    FOREIGN KEY (from_user_id) REFERENCES users (user_id) ON DELETE SET NULL,
  CONSTRAINT fk_cleaning_changes_to
    FOREIGN KEY (to_user_id) REFERENCES users (user_id) ON DELETE SET NULL,
  CONSTRAINT fk_cleaning_changes_by
    FOREIGN KEY (changed_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='청소 담당자 변경 이력';
