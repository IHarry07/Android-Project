-- =====================================================================
-- 룸메이드(Roomade) 데이터베이스 스키마
-- 대상: MySQL 8.0.16 이상 (CHECK 제약 사용)
-- 규칙:
--   * 한 회원은 한 방에만 가입할 수 있다. (room_members.user_id UNIQUE)
--     방을 나가면 room_members 행을 삭제하고, 이후 다른 방에 가입할 수 있다.
--   * 방장 = 방 관리자다. 권한의 기준은 rooms.owner_user_id 하나뿐이다.
--     방장 위임은 owner_user_id를 새 방장으로 바꾸는 UPDATE 한 번으로 끝난다.
--     방장은 위임하기 전에는 방을 나가거나 탈퇴할 수 없다. (서버에서 검사)
--   * 일정은 구분 없이 모두 방 구성원에게 공유된다.
--   * 물품은 등록 회원(created_by)이 곧 소유자다.
--   * 방을 나가거나 내보내질 때의 데이터 정리는 DB가 아니라 서버가 한 트랜잭션으로
--     처리한다. (외래키가 회원만 가리켜서 "그 방에서의 그 사람"을 DB가 지정할 수 없다.)
--     정리 내용은 database/README.md의 "방을 나갈 때 데이터 처리" 참고.
--   * 모든 시각은 DATETIME이며 서버에서 UTC 또는 KST 중 하나로 통일한다.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS roomade
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

USE roomade;

-- ---------------------------------------------------------------------
-- 1. users: 회원
--    비밀번호는 서버에서 bcrypt 등으로 해시한 값만 저장한다.
--    전화번호, 계좌, 생년월일, 성별은 모두 필수다.
--    전화번호와 닉네임은 중복될 수 없다. (닉네임 중복 확인은 가입 화면에서 조회)
--    계좌 정보는 서버가 암호화한 값만 저장한다. 암호 키는 DB가 아닌 서버
--    환경변수로 관리하고, 설정에서 변경하면 새로 암호화해서 덮어쓴다.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  user_id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '회원번호',
  login_id       VARCHAR(50)     NOT NULL COMMENT '로그인 ID',
  password_hash  VARCHAR(255)    NOT NULL COMMENT '비밀번호 해시',
  name           VARCHAR(50)     NOT NULL COMMENT '이름',
  nickname       VARCHAR(50)     NOT NULL COMMENT '닉네임',
  phone          VARCHAR(20)     NOT NULL COMMENT '전화번호',
  email          VARCHAR(100)    NULL COMMENT '이메일(선택). 비밀번호 찾기에 쓴다',
  account_encrypted VARCHAR(512) NOT NULL COMMENT '암호화된 계좌 정보(AES-256-GCM, base64)',
  birth_date     DATE            NOT NULL COMMENT '생년월일',
  gender         ENUM('MALE','FEMALE','OTHER') NOT NULL COMMENT '성별',
  photo_public   TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '프로필 사진을 같은 방 구성원에게 보일지(1=보임)',
  terms_version     VARCHAR(20) NULL COMMENT '가입할 때 동의한 이용약관 버전',
  terms_agreed_at   DATETIME    NULL COMMENT '이용약관 동의 시각',
  privacy_agreed_at DATETIME    NULL COMMENT '개인정보 수집·이용 동의 시각',
  withdrawn_at      DATETIME    NULL COMMENT '회원 탈퇴 시각(NULL이면 정상 회원). 탈퇴하면 개인정보는 지우고 기록용 행만 남긴다',
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_users_login_id (login_id),
  UNIQUE KEY uq_users_nickname (nickname),
  UNIQUE KEY uq_users_phone (phone),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB COMMENT='회원';

-- ---------------------------------------------------------------------
-- 2. rooms: 방
--    owner_user_id가 방장이자 방 관리자다. 방장은 반드시 그 방의 구성원이어야
--    하며, 방을 만들 때 같은 트랜잭션에서 room_members에도 함께 넣는다.
--    초대 코드는 room_invitations 테이블에서 관리한다.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rooms (
  room_id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '방번호',
  room_name      VARCHAR(100)    NOT NULL COMMENT '방 이름',
  description    VARCHAR(100)    NULL COMMENT '방 소개(선택, 100자 이하)',
  owner_user_id  BIGINT UNSIGNED NOT NULL COMMENT '방장 회원번호',
  capacity       TINYINT UNSIGNED NOT NULL DEFAULT 10 COMMENT '방 정원(2~10명)',
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성일',
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (room_id),
  KEY idx_rooms_owner (owner_user_id),
  CONSTRAINT fk_rooms_owner
    FOREIGN KEY (owner_user_id) REFERENCES users (user_id),
  CONSTRAINT ck_rooms_capacity CHECK (capacity BETWEEN 2 AND 10)
) ENGINE=InnoDB COMMENT='방';

-- ---------------------------------------------------------------------
-- 3. room_members: 방 회원
--    user_id UNIQUE: 한 회원은 한 방에만 가입할 수 있다.
--    역할 컬럼은 없다. 방장 여부는 rooms.owner_user_id로 판단한다.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS room_members (
  room_member_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '방 회원번호',
  room_id        BIGINT UNSIGNED NOT NULL COMMENT '방번호',
  user_id        BIGINT UNSIGNED NOT NULL COMMENT '회원번호',
  joined_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '가입일',
  PRIMARY KEY (room_member_id),
  UNIQUE KEY uq_room_members_user (user_id),
  KEY idx_room_members_room (room_id),
  CONSTRAINT fk_room_members_room
    FOREIGN KEY (room_id) REFERENCES rooms (room_id) ON DELETE CASCADE,
  CONSTRAINT fk_room_members_user
    FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='방 회원';

-- 정원 초과 방지 트리거
--   방 행을 잠근 뒤 현재 인원을 세므로, 여러 명이 동시에 가입해도 정원을 넘지 않는다.
--   정원이 차면 마지막에 처리된 요청이 오류(SQLSTATE 45000)로 거절된다.
DROP TRIGGER IF EXISTS trg_room_members_capacity;
DELIMITER $$
CREATE TRIGGER trg_room_members_capacity
BEFORE INSERT ON room_members
FOR EACH ROW
BEGIN
  DECLARE v_capacity TINYINT UNSIGNED;
  DECLARE v_count INT;
  SELECT capacity INTO v_capacity FROM rooms WHERE room_id = NEW.room_id FOR UPDATE;
  SELECT COUNT(*) INTO v_count FROM room_members WHERE room_id = NEW.room_id;
  IF v_count >= v_capacity THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ROOM_FULL';
  END IF;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- 4. room_invitations: 방 초대 코드
--    입력한 코드만으로 방을 찾아야 하므로 SHA-256 해시(64자리 16진수)를
--    저장하고 UNIQUE로 조회한다. 코드는 서버에서 충분히 긴 난수로 만든다.
--    사용 횟수 제한은 없다. 코드는 만료 전까지 쓸 수 있고, 인원은 방 정원으로
--    제한한다. 같은 계정이 다른 기기로 다시 가입해도 room_members의
--    user_id UNIQUE 때문에 인원이 늘지 않는다.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS room_invitations (
  invitation_id  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '초대번호',
  room_id        BIGINT UNSIGNED NOT NULL COMMENT '초대 대상 방',
  code_hash      CHAR(64)        NOT NULL COMMENT '초대 코드의 SHA-256 해시',
  created_by     BIGINT UNSIGNED NOT NULL COMMENT '발급한 회원',
  expires_at     DATETIME        NULL COMMENT '만료 시각(없으면 무기한)',
  is_active     TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '활성 여부',
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (invitation_id),
  UNIQUE KEY uq_room_invitations_code (code_hash),
  KEY idx_room_invitations_room (room_id),
  CONSTRAINT fk_room_invitations_room
    FOREIGN KEY (room_id) REFERENCES rooms (room_id) ON DELETE CASCADE,
  CONSTRAINT fk_room_invitations_creator
    FOREIGN KEY (created_by) REFERENCES users (user_id)
) ENGINE=InnoDB COMMENT='방 초대 코드';

-- ---------------------------------------------------------------------
-- 5. items: 창고 물품
--    등록 회원(created_by)이 곧 소유자다.
--    ownership_type: PERSONAL(개인) / SHARED(공용)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS items (
  item_id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '물품번호',
  room_id          BIGINT UNSIGNED NOT NULL COMMENT '방번호',
  created_by       BIGINT UNSIGNED NOT NULL COMMENT '등록 회원번호(소유자)',
  name             VARCHAR(100)    NOT NULL COMMENT '물품 이름',
  category         ENUM('FOOD','SUPPLY') NOT NULL COMMENT '물품 종류: 식료품/생필품',
  ownership_type   ENUM('PERSONAL','SHARED') NOT NULL COMMENT '소유 구분: 개인/공용',
  quantity         DECIMAL(10,2)   NOT NULL DEFAULT 1 COMMENT '수량',
  unit             VARCHAR(20)     NULL COMMENT '단위(개, 팩, ml 등)',
  expiry_date      DATE            NULL COMMENT '유통기한',
  barcode          VARCHAR(100)    NULL COMMENT '바코드 값',
  storage_location VARCHAR(50)     NULL COMMENT '보관 위치(냉장, 냉동 등)',
  status           ENUM('STORED','USED_UP','DISCARDED') NOT NULL DEFAULT 'STORED' COMMENT '상태',
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (item_id),
  KEY idx_items_room_status_expiry (room_id, status, expiry_date),
  KEY idx_items_creator (created_by),
  KEY idx_items_barcode (barcode),
  CONSTRAINT fk_items_room
    FOREIGN KEY (room_id) REFERENCES rooms (room_id) ON DELETE CASCADE,
  CONSTRAINT fk_items_creator
    FOREIGN KEY (created_by) REFERENCES users (user_id),
  CONSTRAINT ck_items_quantity CHECK (quantity >= 0)
) ENGINE=InnoDB COMMENT='창고 물품';

-- ---------------------------------------------------------------------
-- 6. schedules: 일정 (모두 방 구성원에게 공유)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schedules (
  schedule_id    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '일정번호',
  room_id        BIGINT UNSIGNED NOT NULL COMMENT '방번호',
  user_id        BIGINT UNSIGNED NOT NULL COMMENT '작성 회원번호',
  title          VARCHAR(150)    NOT NULL COMMENT '일정 제목',
  description    VARCHAR(500)    NULL COMMENT '일정 내용(선택, 500자 이하)',
  visibility     ENUM('SHARED','PERSONAL') NOT NULL DEFAULT 'SHARED' COMMENT 'SHARED=방 구성원 공개, PERSONAL=작성자만',
  start_at       DATETIME        NOT NULL COMMENT '시작 날짜 및 시간',
  end_at         DATETIME        NOT NULL COMMENT '종료 날짜 및 시간',
  reminder_minutes INT UNSIGNED  NULL DEFAULT 60 COMMENT '시작 몇 분 전에 알릴지(0=정각, NULL=알림 없음)',
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (schedule_id),
  KEY idx_schedules_room_start (room_id, start_at),
  KEY idx_schedules_user (user_id),
  CONSTRAINT fk_schedules_room
    FOREIGN KEY (room_id) REFERENCES rooms (room_id) ON DELETE CASCADE,
  CONSTRAINT fk_schedules_user
    FOREIGN KEY (user_id) REFERENCES users (user_id),
  CONSTRAINT ck_schedules_time CHECK (end_at >= start_at)
) ENGINE=InnoDB COMMENT='일정';

-- ---------------------------------------------------------------------
-- 7. cleaning_tasks: 청소 항목/규칙
--    next_due_date는 "지금 예정된 날짜"이며 아래 상황마다 서버가 갱신한다.
--      * 완료: 반복 주기에 따라 다음 날짜로 갱신 (반복 없음이면 is_active=0)
--      * 미루기: 미룬 날짜(postponed_to)로 갱신
--    갱신은 cleaning_records 기록과 같은 트랜잭션으로 처리한다.
--    완료 여부는 cleaning_records에서 관리한다.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cleaning_tasks (
  task_id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '청소번호',
  room_id           BIGINT UNSIGNED NOT NULL COMMENT '방번호',
  assignee_user_id  BIGINT UNSIGNED NULL COMMENT '담당 회원번호(담당자 없으면 NULL)',
  base_assignee_user_id BIGINT UNSIGNED NULL COMMENT '이번 회차만 대신하는 경우의 원래 담당자',
  area_name         VARCHAR(100)    NOT NULL COMMENT '청소 항목(구역)',
  next_due_date     DATE            NOT NULL COMMENT '다음 청소 날짜',
  repeat_type       ENUM('NONE','DAILY','WEEKLY','MONTHLY') NOT NULL DEFAULT 'NONE' COMMENT '반복 주기 유형',
  repeat_interval   INT UNSIGNED    NOT NULL DEFAULT 1 COMMENT '반복 간격(예: 2주마다면 2)',
  rotation_enabled  TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '1이면 완료 뒤 담당자가 순번대로 넘어감',
  is_active         TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '활성 여부',
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (task_id),
  KEY idx_cleaning_tasks_room_due (room_id, next_due_date),
  KEY idx_cleaning_tasks_assignee (assignee_user_id),
  CONSTRAINT fk_cleaning_tasks_room
    FOREIGN KEY (room_id) REFERENCES rooms (room_id) ON DELETE CASCADE,
  CONSTRAINT fk_cleaning_tasks_assignee
    FOREIGN KEY (assignee_user_id) REFERENCES users (user_id) ON DELETE SET NULL,
  CONSTRAINT fk_cleaning_tasks_base_assignee
    FOREIGN KEY (base_assignee_user_id) REFERENCES users (user_id) ON DELETE SET NULL,
  CONSTRAINT ck_cleaning_tasks_interval CHECK (repeat_interval >= 1)
) ENGINE=InnoDB COMMENT='청소 항목';

-- ---------------------------------------------------------------------
-- 7-2. cleaning_assignee_changes: 청소 담당자 변경 이력
--      담당자를 바꿀 때마다 누가·누구에서 누구로·이번만/계속·사유를 남긴다.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 7-1. cleaning_rotation: 청소당번 순번
--      rotation_enabled인 청소 항목은 완료·건너뜀 뒤 담당자가 이 순번대로 다음 사람으로 넘어간다.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 8. cleaning_records: 청소 이력
--    담당자 변경이나 미루기는 덮어쓰지 않고 이력으로 남긴다.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cleaning_records (
  record_id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '기록번호',
  task_id           BIGINT UNSIGNED NOT NULL COMMENT '청소번호',
  assignee_user_id  BIGINT UNSIGNED NULL COMMENT '해당 회차 담당 회원번호',
  due_date          DATE            NOT NULL COMMENT '예정 날짜',
  status            ENUM('SCHEDULED','DONE','POSTPONED','SKIPPED') NOT NULL DEFAULT 'SCHEDULED' COMMENT '상태',
  completed_at      DATETIME        NULL COMMENT '완료 시각(DONE일 때만)',
  completed_by      BIGINT UNSIGNED NULL COMMENT '실제로 청소를 완료한 회원(담당자와 다를 수 있음)',
  postponed_to     DATE            NULL COMMENT '미룬 날짜(POSTPONED일 때만)',
  memo              VARCHAR(255)    NULL COMMENT '메모(미룸/건너뜀 사유 등)',
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (record_id),
  KEY idx_cleaning_records_task_due (task_id, due_date),
  KEY idx_cleaning_records_assignee (assignee_user_id),
  CONSTRAINT fk_cleaning_records_task
    FOREIGN KEY (task_id) REFERENCES cleaning_tasks (task_id) ON DELETE CASCADE,
  CONSTRAINT fk_cleaning_records_assignee
    FOREIGN KEY (assignee_user_id) REFERENCES users (user_id) ON DELETE SET NULL,
  CONSTRAINT fk_cleaning_records_completed_by
    FOREIGN KEY (completed_by) REFERENCES users (user_id) ON DELETE SET NULL,
  CONSTRAINT ck_cleaning_records_done
    CHECK ((status = 'DONE') = (completed_at IS NOT NULL)),
  CONSTRAINT ck_cleaning_records_postponed
    CHECK ((status = 'POSTPONED') = (postponed_to IS NOT NULL)
           AND (postponed_to IS NULL OR postponed_to > due_date))
) ENGINE=InnoDB COMMENT='청소 이력';

-- ---------------------------------------------------------------------
-- 9. expenses: 지출 내역
--    금액은 원 단위 정수로 저장한다.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expenses (
  expense_id     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '지출번호',
  room_id        BIGINT UNSIGNED NOT NULL COMMENT '방번호',
  paid_by        BIGINT UNSIGNED NOT NULL COMMENT '결제 회원번호',
  title          VARCHAR(100)    NOT NULL COMMENT '지출 항목',
  amount         BIGINT UNSIGNED NOT NULL COMMENT '지출 금액(원)',
  expense_date   DATE            NOT NULL COMMENT '지출 날짜',
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (expense_id),
  KEY idx_expenses_room_date (room_id, expense_date),
  KEY idx_expenses_payer (paid_by),
  CONSTRAINT fk_expenses_room
    FOREIGN KEY (room_id) REFERENCES rooms (room_id) ON DELETE CASCADE,
  CONSTRAINT fk_expenses_payer
    FOREIGN KEY (paid_by) REFERENCES users (user_id),
  CONSTRAINT ck_expenses_amount CHECK (amount > 0)
) ENGINE=InnoDB COMMENT='지출 내역';

-- ---------------------------------------------------------------------
-- 10. expense_shares: 지출 분담
--     한 지출을 누가 얼마씩 나눠 내는지 기록한다.
--     결제자 본인의 몫도 한 행으로 넣는다.
--     분담 금액의 합이 지출 금액과 같은지는 서버가 트랜잭션 안에서 검사한다.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expense_shares (
  share_id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '분담번호',
  expense_id     BIGINT UNSIGNED NOT NULL COMMENT '지출번호',
  user_id        BIGINT UNSIGNED NOT NULL COMMENT '분담 회원번호',
  share_amount   BIGINT UNSIGNED NOT NULL COMMENT '분담 금액(원)',
  is_settled     TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '정산 완료 여부',
  settled_at     DATETIME        NULL COMMENT '정산 완료 시각',
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (share_id),
  UNIQUE KEY uq_expense_shares_expense_user (expense_id, user_id),
  KEY idx_expense_shares_user (user_id),
  CONSTRAINT fk_expense_shares_expense
    FOREIGN KEY (expense_id) REFERENCES expenses (expense_id) ON DELETE CASCADE,
  CONSTRAINT fk_expense_shares_user
    FOREIGN KEY (user_id) REFERENCES users (user_id),
  CONSTRAINT ck_expense_shares_settled
    CHECK ((is_settled = 1) = (settled_at IS NOT NULL))
) ENGINE=InnoDB COMMENT='지출 분담';

-- ---------------------------------------------------------------------
-- 11. room_departures: 방 퇴장 기록
--     방을 나가거나 내보내질 때 서버가 남긴다. 나간 사람이 결제하거나 분담한
--     지출은 방의 기록으로 남기 때문에, 그 사람이 지금 구성원이 아니라
--     나갔는지(LEFT) 추방됐는지(KICKED)를 지출 목록에서 보여주는 데 쓴다.
--     같은 사람이 나갔다가 다시 가입할 수 있으므로 여러 행이 생길 수 있다.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS room_departures (
  departure_id   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '퇴장번호',
  room_id        BIGINT UNSIGNED NOT NULL COMMENT '방번호',
  user_id        BIGINT UNSIGNED NOT NULL COMMENT '나간 회원번호',
  reason         ENUM('LEFT','KICKED') NOT NULL COMMENT 'LEFT 스스로 나감, KICKED 방장이 내보냄',
  departed_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '퇴장 시각',
  PRIMARY KEY (departure_id),
  KEY idx_room_departures_room_user (room_id, user_id),
  CONSTRAINT fk_room_departures_room
    FOREIGN KEY (room_id) REFERENCES rooms (room_id) ON DELETE CASCADE,
  CONSTRAINT fk_room_departures_user
    FOREIGN KEY (user_id) REFERENCES users (user_id)
) ENGINE=InnoDB COMMENT='방 퇴장 기록';

-- ---------------------------------------------------------------------
-- 12. notifications: 앱 내부 알림
--     서버가 만들어 저장하고 앱이 조회·읽음 처리한다. (푸시 알림은 아직 없다.)
--     dedupe_key: 같은 알림이 두 번 만들어지지 않게 하는 키. 같은 회원에게 같은 키는 한 번만 들어간다.
--     예) ITEM_EXPIRY:12:2026-11-20:3  (12번 물품, 유통기한 2026-11-20, 3일 전 알림)
--     target_type, target_id: 알림을 눌렀을 때 이동할 대상. 대상이 삭제되면 서버가 알림도 함께 지운다.
--     오래된 알림(90일 지남)은 서버가 매일 정리한다.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  notification_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '알림번호',
  user_id         BIGINT UNSIGNED NOT NULL COMMENT '받는 회원',
  room_id         BIGINT UNSIGNED NOT NULL COMMENT '알림이 생긴 방',
  type            ENUM('ITEM_EXPIRY','CLEANING_DUE','SCHEDULE_START','EXPENSE_SHARE','EXPENSE_SETTLED','CLEANING_REASSIGNED') NOT NULL COMMENT '알림 종류',
  title           VARCHAR(100)    NOT NULL COMMENT '제목',
  body            VARCHAR(255)    NOT NULL COMMENT '내용',
  target_type     ENUM('ITEM','SCHEDULE','CLEANING_TASK','EXPENSE') NULL COMMENT '이동할 대상 종류',
  target_id       BIGINT UNSIGNED NULL COMMENT '이동할 대상 번호',
  dedupe_key      VARCHAR(120)    NOT NULL COMMENT '중복 방지 키',
  is_read         TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '읽음 여부',
  read_at         DATETIME        NULL COMMENT '읽은 시각',
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (notification_id),
  UNIQUE KEY uq_notifications_dedupe (user_id, dedupe_key),
  KEY idx_notifications_user_read (user_id, is_read, notification_id),
  KEY idx_notifications_target (target_type, target_id),
  KEY idx_notifications_room_user (room_id, user_id),
  KEY idx_notifications_created (created_at),
  CONSTRAINT fk_notifications_user
    FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_room
    FOREIGN KEY (room_id) REFERENCES rooms (room_id) ON DELETE CASCADE,
  CONSTRAINT ck_notifications_read
    CHECK ((is_read = 1) = (read_at IS NOT NULL)),
  CONSTRAINT ck_notifications_target
    CHECK ((target_type IS NULL) = (target_id IS NULL))
) ENGINE=InnoDB COMMENT='앱 내부 알림';

-- 푸시 알림(FCM)을 보낼 기기 토큰. 로그인한 기기마다 한 줄.
CREATE TABLE IF NOT EXISTS device_tokens (
  token       VARCHAR(512) NOT NULL COMMENT 'FCM 기기 토큰',
  user_id     BIGINT UNSIGNED NOT NULL COMMENT '이 기기로 로그인한 회원',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (token(255)),
  KEY idx_device_tokens_user (user_id),
  CONSTRAINT fk_device_tokens_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='푸시 알림을 보낼 기기 토큰';

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

-- 프로필 사진. 같은 방 구성원에게 보일지는 users.photo_public 으로 정한다.
CREATE TABLE IF NOT EXISTS user_photos (
  user_id     BIGINT UNSIGNED NOT NULL COMMENT '회원번호',
  image       MEDIUMBLOB      NOT NULL COMMENT '프로필 사진(JPEG, 앱이 줄여서 올린다)',
  updated_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_user_photos_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='프로필 사진';

-- 알림 종류별 푸시 설정. 행이 없으면 모두 켜짐.
CREATE TABLE IF NOT EXISTS user_notification_settings (
  user_id          BIGINT UNSIGNED NOT NULL COMMENT '회원번호',
  push_item_expiry TINYINT(1) NOT NULL DEFAULT 1 COMMENT '유통기한 알림 푸시',
  push_cleaning    TINYINT(1) NOT NULL DEFAULT 1 COMMENT '청소 알림 푸시(당번 날, 담당 변경)',
  push_schedule    TINYINT(1) NOT NULL DEFAULT 1 COMMENT '일정 시작 알림 푸시',
  push_expense     TINYINT(1) NOT NULL DEFAULT 1 COMMENT '지출·정산 알림 푸시',
  PRIMARY KEY (user_id),
  CONSTRAINT fk_notification_settings_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='알림 설정(푸시만 끈다. 앱 안 알림 목록에는 항상 쌓인다. 행이 없으면 모두 켜짐)';
