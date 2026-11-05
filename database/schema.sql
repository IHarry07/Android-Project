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
  account_encrypted VARCHAR(512) NOT NULL COMMENT '암호화된 계좌 정보(AES-256-GCM, base64)',
  birth_date     DATE            NOT NULL COMMENT '생년월일',
  gender         ENUM('MALE','FEMALE','OTHER') NOT NULL COMMENT '성별',
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_users_login_id (login_id),
  UNIQUE KEY uq_users_nickname (nickname),
  UNIQUE KEY uq_users_phone (phone)
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
  start_at       DATETIME        NOT NULL COMMENT '시작 날짜 및 시간',
  end_at         DATETIME        NOT NULL COMMENT '종료 날짜 및 시간',
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
  area_name         VARCHAR(100)    NOT NULL COMMENT '청소 항목(구역)',
  next_due_date     DATE            NOT NULL COMMENT '다음 청소 날짜',
  repeat_type       ENUM('NONE','DAILY','WEEKLY','MONTHLY') NOT NULL DEFAULT 'NONE' COMMENT '반복 주기 유형',
  repeat_interval   INT UNSIGNED    NOT NULL DEFAULT 1 COMMENT '반복 간격(예: 2주마다면 2)',
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
  CONSTRAINT ck_cleaning_tasks_interval CHECK (repeat_interval >= 1)
) ENGINE=InnoDB COMMENT='청소 항목';

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
  postponed_to      DATE            NULL COMMENT '미룬 날짜(POSTPONED일 때만)',
  memo              VARCHAR(255)    NULL COMMENT '메모(미룸/건너뜀 사유 등)',
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (record_id),
  KEY idx_cleaning_records_task_due (task_id, due_date),
  KEY idx_cleaning_records_assignee (assignee_user_id),
  CONSTRAINT fk_cleaning_records_task
    FOREIGN KEY (task_id) REFERENCES cleaning_tasks (task_id) ON DELETE CASCADE,
  CONSTRAINT fk_cleaning_records_assignee
    FOREIGN KEY (assignee_user_id) REFERENCES users (user_id) ON DELETE SET NULL,
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
