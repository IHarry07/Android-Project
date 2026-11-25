-- 로그인 실패 잠금·비밀번호 찾기 요청 제한 기록을 DB에 둔다. (전에는 서버 메모리라 서버를 다시 켜면 풀렸다)
--  attempt_key : 'login:아이디' 같은 대상의 SHA-256 (없는 아이디도 세므로 아이디를 그대로 저장하지 않는다)
--  fail_count  : 첫 실패부터 15분 안의 실패 횟수
-- 하루 지난 기록은 알림 정리 작업(notificationJobs.purgeOld)이 지운다.
CREATE TABLE IF NOT EXISTS login_attempts (
    attempt_key     CHAR(64)     NOT NULL,
    fail_count      INT UNSIGNED NOT NULL,
    first_failed_at DATETIME     NOT NULL,
    PRIMARY KEY (attempt_key),
    KEY idx_login_attempts_first (first_failed_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
