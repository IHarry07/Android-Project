-- =====================================================================
-- 룸메이드(Roomade) 개발용 샘플 데이터
-- 주의: 실행하면 roomade 데이터베이스의 모든 테이블 데이터를 먼저 비운다.
--       개발·테스트 DB에서만 실행할 것. (schema.sql을 먼저 실행해야 한다.)
--
-- 구성
--   301호 (정원 4명): 하나(방장), 두리, 세나
--   302호 (정원 2명): 민준(방장), 다은   <- 정원이 가득 찬 방
--   무소속: 한솔                         <- 방 가입 테스트용
--
-- 초대 코드 (평문은 여기에만 있고 DB에는 SHA-256 해시로 저장)
--   ROOM301A : 301호, 7일 뒤 만료, 사용 가능
--   OLDCODE1 : 301호, 이미 만료되어 비활성
--   ROOM302B : 302호, 만료 없음 (정원이 차서 가입은 거절되어야 함)
--
-- 모든 회원의 비밀번호 해시와 암호화 계좌 값은 가짜 값이다.
-- =====================================================================

USE roomade;

SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE notifications;
TRUNCATE TABLE room_departures;
TRUNCATE TABLE expense_shares;
TRUNCATE TABLE expenses;
TRUNCATE TABLE cleaning_records;
TRUNCATE TABLE cleaning_tasks;
TRUNCATE TABLE schedules;
TRUNCATE TABLE items;
TRUNCATE TABLE room_invitations;
TRUNCATE TABLE room_members;
TRUNCATE TABLE rooms;
TRUNCATE TABLE users;
SET FOREIGN_KEY_CHECKS = 1;

START TRANSACTION;

-- ---------------------------------------------------------------------
-- 회원
-- ---------------------------------------------------------------------
INSERT INTO users (login_id, password_hash, name, nickname, phone, account_encrypted, birth_date, gender) VALUES
  ('hana01',   '$2b$10$FAKEHASHFAKEHASHFAKEHASHFAKEHASHFAKEHASHFAKEHASHFAKEH', '김하나', '하나',   '010-1111-0001', 'ZmFrZS1lbmNyeXB0ZWQtYWNjb3VudC0x', '2001-03-14', 'FEMALE'),
  ('doori02',  '$2b$10$FAKEHASHFAKEHASHFAKEHASHFAKEHASHFAKEHASHFAKEHASHFAKEH', '이두리', '두리',   '010-1111-0002', 'ZmFrZS1lbmNyeXB0ZWQtYWNjb3VudC0y', '2000-07-02', 'FEMALE'),
  ('sena03',   '$2b$10$FAKEHASHFAKEHASHFAKEHASHFAKEHASHFAKEHASHFAKEHASHFAKEH', '박세나', '세나',   '010-1111-0003', 'ZmFrZS1lbmNyeXB0ZWQtYWNjb3VudC0z', '2002-11-25', 'FEMALE'),
  ('minjun04', '$2b$10$FAKEHASHFAKEHASHFAKEHASHFAKEHASHFAKEHASHFAKEHASHFAKEH', '최민준', '민준',   '010-1111-0004', 'ZmFrZS1lbmNyeXB0ZWQtYWNjb3VudC00', '1999-01-09', 'MALE'),
  ('daeun05',  '$2b$10$FAKEHASHFAKEHASHFAKEHASHFAKEHASHFAKEHASHFAKEHASHFAKEH', '정다은', '다은',   '010-1111-0005', 'ZmFrZS1lbmNyeXB0ZWQtYWNjb3VudC01', '2001-09-30', 'OTHER'),
  ('hansol06', '$2b$10$FAKEHASHFAKEHASHFAKEHASHFAKEHASHFAKEHASHFAKEHASHFAKEH', '한솔',   '한솔',   '010-1111-0006', 'ZmFrZS1lbmNyeXB0ZWQtYWNjb3VudC02', '2000-05-18', 'MALE');

SET @hana   = (SELECT user_id FROM users WHERE login_id = 'hana01');
SET @doori  = (SELECT user_id FROM users WHERE login_id = 'doori02');
SET @sena   = (SELECT user_id FROM users WHERE login_id = 'sena03');
SET @minjun = (SELECT user_id FROM users WHERE login_id = 'minjun04');
SET @daeun  = (SELECT user_id FROM users WHERE login_id = 'daeun05');
SET @hansol = (SELECT user_id FROM users WHERE login_id = 'hansol06');

-- ---------------------------------------------------------------------
-- 방과 방 회원 (방장은 방을 만들 때 방 회원에도 함께 넣는다)
-- ---------------------------------------------------------------------
INSERT INTO rooms (room_name, owner_user_id, capacity) VALUES ('301호', @hana, 4);
SET @room301 = LAST_INSERT_ID();
INSERT INTO rooms (room_name, owner_user_id, capacity) VALUES ('302호', @minjun, 2);
SET @room302 = LAST_INSERT_ID();

INSERT INTO room_members (room_id, user_id) VALUES
  (@room301, @hana), (@room301, @doori), (@room301, @sena),
  (@room302, @minjun), (@room302, @daeun);

-- ---------------------------------------------------------------------
-- 초대 코드 (SHA-256 해시로 저장)
-- ---------------------------------------------------------------------
INSERT INTO room_invitations (room_id, code_hash, created_by, expires_at, is_active) VALUES
  (@room301, SHA2('ROOM301A', 256), @hana,   DATE_ADD(NOW(), INTERVAL 7 DAY), 1),
  (@room301, SHA2('OLDCODE1', 256), @hana,   DATE_SUB(NOW(), INTERVAL 1 DAY), 0),
  (@room302, SHA2('ROOM302B', 256), @minjun, NULL,                            1);

-- ---------------------------------------------------------------------
-- 창고 물품 (등록 회원이 곧 소유자)
-- 유통기한은 오늘 날짜 기준으로 만들어 임박·만료 상태가 항상 보이게 한다.
-- ---------------------------------------------------------------------
INSERT INTO items (room_id, created_by, name, category, ownership_type, quantity, unit, expiry_date, barcode, storage_location, status) VALUES
  (@room301, @hana,   '우유',         'FOOD',   'SHARED',   2,   '팩', DATE_ADD(CURDATE(), INTERVAL 2 DAY),  '8801115114154', '냉장', 'STORED'),
  (@room301, @doori,  '계란',         'FOOD',   'PERSONAL', 10,  '개', DATE_ADD(CURDATE(), INTERVAL 7 DAY),  NULL,            '냉장', 'STORED'),
  (@room301, @hana,   '김치',         'FOOD',   'SHARED',   1,   '통', DATE_ADD(CURDATE(), INTERVAL 30 DAY), NULL,            '냉장', 'STORED'),
  (@room301, @sena,   '요거트',       'FOOD',   'PERSONAL', 3,   '개', DATE_SUB(CURDATE(), INTERVAL 1 DAY),  '8801104102019', '냉장', 'STORED'),
  (@room301, @hana,   '라면',         'FOOD',   'PERSONAL', 0,   '개', NULL,                                 '8801045570716', '선반', 'USED_UP'),
  (@room301, @doori,  '배달 치킨',    'FOOD',   'PERSONAL', 0.5, '마리', DATE_SUB(CURDATE(), INTERVAL 2 DAY), NULL,           '냉장', 'DISCARDED'),
  (@room301, @hana,   '휴지',         'SUPPLY', 'SHARED',   5,   '롤', NULL,                                 NULL,            '화장실', 'STORED'),
  (@room301, @sena,   '주방 세제',    'SUPPLY', 'SHARED',   1,   '개', NULL,                                 '8801051240021', '싱크대', 'STORED'),
  (@room302, @minjun, '즉석밥',       'FOOD',   'SHARED',   6,   '개', DATE_ADD(CURDATE(), INTERVAL 90 DAY), '8801007213103', '선반', 'STORED'),
  (@room302, @daeun,  '샴푸',         'SUPPLY', 'PERSONAL', 1,   '개', NULL,                                 NULL,            '욕실', 'STORED');

-- ---------------------------------------------------------------------
-- 일정 (모두 방 구성원에게 공유)
-- ---------------------------------------------------------------------
INSERT INTO schedules (room_id, user_id, title, start_at, end_at) VALUES
  (@room301, @hana,   '집들이',           TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 3 DAY), '18:00:00'), TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 3 DAY), '22:00:00')),
  (@room301, @doori,  '중간고사 기간',    TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 5 DAY), '00:00:00'), TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 11 DAY), '23:59:00')),
  (@room301, @sena,   '택배 수령',        TIMESTAMP(CURDATE(), '14:00:00'),                          TIMESTAMP(CURDATE(), '15:00:00')),
  (@room302, @daeun,  '친구 방문',        TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 1 DAY), '19:00:00'), TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 1 DAY), '21:00:00'));

-- ---------------------------------------------------------------------
-- 청소 항목
-- ---------------------------------------------------------------------
INSERT INTO cleaning_tasks (room_id, assignee_user_id, area_name, next_due_date, repeat_type, repeat_interval, is_active) VALUES
  (@room301, @doori, '화장실',   DATE_ADD(CURDATE(), INTERVAL 2 DAY), 'WEEKLY',  1, 1),
  (@room301, @sena,  '분리수거', CURDATE(),                           'WEEKLY',  2, 1),
  (@room301, @hana,  '거실',     DATE_ADD(CURDATE(), INTERVAL 1 DAY), 'DAILY',   1, 1),
  (@room301, NULL,   '베란다',   DATE_ADD(CURDATE(), INTERVAL 20 DAY),'MONTHLY', 1, 0),
  (@room302, @daeun, '화장실',   DATE_ADD(CURDATE(), INTERVAL 4 DAY), 'WEEKLY',  1, 1);

SET @task_bath301 = (SELECT task_id FROM cleaning_tasks WHERE room_id = @room301 AND area_name = '화장실');
SET @task_recycle = (SELECT task_id FROM cleaning_tasks WHERE room_id = @room301 AND area_name = '분리수거');

-- 청소 이력: 지난주 완료, 이번 주 미룸(오늘 -> 2일 뒤), 오늘 예정
INSERT INTO cleaning_records (task_id, assignee_user_id, due_date, status, completed_at, completed_by, postponed_to, memo) VALUES
  (@task_bath301, @sena,  DATE_SUB(CURDATE(), INTERVAL 5 DAY), 'DONE',      DATE_SUB(NOW(), INTERVAL 5 DAY), @hana, NULL, '하나가 대신 청소'),
  (@task_bath301, @doori, CURDATE(),                           'POSTPONED', NULL, NULL, DATE_ADD(CURDATE(), INTERVAL 2 DAY), '시험 준비로 이틀 미룸'),
  (@task_bath301, @doori, DATE_ADD(CURDATE(), INTERVAL 2 DAY), 'SCHEDULED', NULL, NULL, NULL, NULL),
  (@task_recycle, @sena,  CURDATE(),                           'SCHEDULED', NULL, NULL, NULL, NULL);

-- ---------------------------------------------------------------------
-- 지출과 분담 (분담 금액의 합 = 지출 금액)
-- ---------------------------------------------------------------------
INSERT INTO expenses (room_id, paid_by, title, amount, expense_date) VALUES (@room301, @hana,   '휴지 구매',   12000, DATE_SUB(CURDATE(), INTERVAL 3 DAY));
SET @exp_tissue = LAST_INSERT_ID();
INSERT INTO expenses (room_id, paid_by, title, amount, expense_date) VALUES (@room301, @doori,  '주방 세제',    9000, DATE_SUB(CURDATE(), INTERVAL 1 DAY));
SET @exp_soap = LAST_INSERT_ID();
INSERT INTO expenses (room_id, paid_by, title, amount, expense_date) VALUES (@room301, @sena,   '인터넷 요금', 33000, CURDATE());
SET @exp_net = LAST_INSERT_ID();
INSERT INTO expenses (room_id, paid_by, title, amount, expense_date) VALUES (@room302, @minjun, '전기 요금',   40000, CURDATE());
SET @exp_elec = LAST_INSERT_ID();

INSERT INTO expense_shares (expense_id, user_id, share_amount, is_settled, settled_at) VALUES
  (@exp_tissue, @hana,   4000, 1, NOW()),
  (@exp_tissue, @doori,  4000, 1, NOW()),
  (@exp_tissue, @sena,   4000, 0, NULL),
  (@exp_soap,   @hana,   3000, 0, NULL),
  (@exp_soap,   @doori,  3000, 1, NOW()),
  (@exp_soap,   @sena,   3000, 0, NULL),
  (@exp_net,    @hana,  11000, 0, NULL),
  (@exp_net,    @doori, 11000, 0, NULL),
  (@exp_net,    @sena,  11000, 1, NOW()),
  (@exp_elec,   @minjun, 20000, 1, NOW()),
  (@exp_elec,   @daeun,  20000, 0, NULL);

-- ---------------------------------------------------------------------
-- 알림 (읽지 않은 알림과 읽은 알림을 하나씩 섞어 둔다)
-- ---------------------------------------------------------------------
SET @item_milk = (SELECT item_id FROM items WHERE room_id = @room301 AND name = '우유');

INSERT INTO notifications (user_id, room_id, type, title, body, target_type, target_id, dedupe_key, is_read, read_at) VALUES
  (@hana,  @room301, 'ITEM_EXPIRY',    '유통기한 3일 남았어요', '공용 ''우유''', 'ITEM', @item_milk, CONCAT('ITEM_EXPIRY:', @item_milk, ':seed:3'), 0, NULL),
  (@doori, @room301, 'ITEM_EXPIRY',    '유통기한 3일 남았어요', '공용 ''우유''', 'ITEM', @item_milk, CONCAT('ITEM_EXPIRY:', @item_milk, ':seed:3'), 1, NOW()),
  (@doori, @room301, 'EXPENSE_SHARE',  '새 분담금이 생겼어요',  '하나님이 ''휴지 구매'' 지출에서 4,000원을 분담하도록 지정했어요', 'EXPENSE', @exp_tissue, CONCAT('EXPENSE_SHARE:', @exp_tissue, ':', @doori), 0, NULL);

COMMIT;
