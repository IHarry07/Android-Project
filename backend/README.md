# 룸메이드(Roomade) 서버

Node.js + Express + MySQL로 만든 API 서버다. 회원, 방, 창고(물품), 일정, 청소, 지출·정산 기능이 들어 있다. 알림과 바코드 정보 조회는 아직 없다.

## 실행 방법

1. MySQL에 `database/schema.sql`을 적용한다. (자세한 내용은 `database/README.md`)
2. `.env.example`을 `.env`로 복사하고 값을 채운다.
3. 패키지를 설치하고 서버를 시작한다.

```bash
cd backend
npm install
npm start        # 개발 중에는 npm run dev (파일을 고치면 자동 재시작)
```

서버 주소는 `http://localhost:3000`이다. Android 에뮬레이터에서는 `http://10.0.2.2:3000`으로 접속한다. 실제 폰에서는 PC의 내부 IP를 쓰고, 같은 Wi-Fi여야 한다.

`.env`에는 DB 비밀번호와 암호 키가 들어가므로 **GitHub에 올리지 않는다.** `.gitignore`에 이미 제외되어 있다. `ACCOUNT_ENC_KEY`를 잃어버리면 저장된 계좌 정보를 복호화할 수 없으니 따로 안전하게 보관한다.

## 테스트

테스트는 실제 `roomade`가 아니라 `roomade_test` DB를 쓴다. 테스트 시작 때 이 DB의 모든 데이터를 비운다. DB 이름이 `_test`로 끝나지 않으면 실행이 중단된다.

테스트 DB를 처음 만들 때는 `schema.sql`의 DB 이름을 `roomade_test`로 바꿔서 MySQL에 적용한다.

```bash
npm test
```

90개 테스트가 인증, 토큰 만료, 정보 보호, 방 가입과 정원, 물품, 일정, 청소, 지출·정산, 방을 나갈 때의 데이터 정리를 검증한다. 동시 요청 상황도 포함한다. 정원을 넘는 동시 가입, 같은 청소를 동시에 완료, 수량을 동시에 줄이기, 나가는 도중의 물품 등록이다.

## 로그인 방식

로그인하면 토큰 하나를 받고, 이후 모든 요청에 `Authorization: Bearer <토큰>`을 붙인다.

| 로그인 유지 | 토큰 유효 기간 | 갱신 |
|---|---|---|
| 체크함 | 로그인한 날부터 30일 | 없음. 30일 뒤 반드시 만료 |
| 체크 안 함 | 마지막 요청 후 1시간 | 요청마다 응답 헤더 `X-Refreshed-Token`으로 새 토큰을 준다. 앱은 이 값을 받으면 저장된 토큰을 교체해야 한다. |

비밀번호를 바꾸면 이전에 발급된 토큰이 모두 무효가 된다. 로그아웃은 앱이 저장된 토큰을 지우는 것으로 끝난다.

### 앱이 처리해야 할 오류 코드

| 코드 | 의미 | 앱 동작 |
|---|---|---|
| `AUTH_REQUIRED` | 토큰 없음 | 로그인 화면으로 이동 |
| `TOKEN_EXPIRED` | 토큰 만료 | "보안상의 이유로 로그인이 해제되었습니다" 팝업 후 로그인 화면으로 이동 |
| `TOKEN_INVALID` | 위조·손상·비밀번호 변경 | 팝업 없이 로그인 화면으로 이동 |

## 오류 응답 형식

```json
{ "error": { "code": "ROOM_FULL", "message": "방 정원이 가득 찼습니다." } }
```

입력 검증 오류는 `VALIDATION_ERROR`이며 `details`에 항목별 메시지가 들어간다.

## API 목록

`인증 필요`가 아닌 API는 토큰 없이 호출한다.

### 인증

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/auth/signup` | 회원가입 |
| POST | `/api/auth/login` | 로그인, 본문에 `keepLogin`(true/false) |
| POST | `/api/auth/logout` | 로그아웃 안내 |
| GET | `/api/auth/check-login-id?loginId=` | 아이디 중복 확인 |
| GET | `/api/auth/check-nickname?nickname=` | 닉네임 중복 확인 |

회원가입 본문은 `loginId`, `password`, `name`, `nickname`, `phone`, `accountInfo`, `birthDate`(YYYY-MM-DD), `gender`(MALE, FEMALE, OTHER)다. 모두 필수다.

### 내 정보 (인증 필요)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/users/me` | 내 정보와 가입한 방. 계좌는 마지막 4자리만 보인다. |
| PATCH | `/api/users/me` | 이름, 닉네임, 전화번호 수정 |
| PATCH | `/api/users/me/password` | 비밀번호 변경. `currentPassword`, `newPassword` 필요. 새 토큰을 돌려준다. |
| PATCH | `/api/users/me/account` | 계좌 변경. `currentPassword`, `accountInfo` 필요 |

### 방 (인증 필요)

| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| POST | `/api/rooms` | 누구나 | 방 만들기. 초대 코드를 한 번만 평문으로 돌려준다. |
| GET | `/api/rooms/me` | 누구나 | 내가 가입한 방. 없으면 `null` |
| POST | `/api/rooms/join` | 누구나 | 초대 코드로 가입 |
| GET | `/api/rooms/:roomId` | 구성원 | 방 정보 |
| GET | `/api/rooms/:roomId/members` | 구성원 | 구성원 목록. 닉네임만 보인다. |
| DELETE | `/api/rooms/:roomId/members/me` | 구성원 | 방 나가기. 내가 등록한 공용 물품이 있으면 `?sharedItems=TRANSFER` 또는 `DELETE`가 필요하다. |
| PATCH | `/api/rooms/:roomId` | 방장 | 방 이름, 정원 수정 |
| POST | `/api/rooms/:roomId/invitations` | 방장 | 초대 코드 재발급. 이전 코드는 즉시 무효 |
| POST | `/api/rooms/:roomId/transfer-owner` | 방장 | 방장 위임. 본문 `userId` |
| DELETE | `/api/rooms/:roomId/members/:userId` | 방장 | 구성원 내보내기 |

### 방 오류 코드

| 코드 | 상황 |
|---|---|
| `ALREADY_IN_ROOM` | 이미 방에 가입되어 있음. 같은 계정으로 다른 기기에서 가입해도 동일 |
| `INVALID_INVITE_CODE` | 코드가 없거나 만료됨 |
| `ROOM_FULL` | 정원이 가득 참 |
| `OWNER_MUST_TRANSFER` | 방장이 다른 구성원이 있는데 나가려 함. 먼저 위임해야 함 |
| `NOT_ROOM_OWNER` | 방장만 할 수 있는 작업 |
| `ROOM_NOT_FOUND` | 방이 없거나 내가 구성원이 아님. 방이 있는지 알려주지 않으려고 둘 다 같은 코드를 쓴다. |
| `UNSETTLED_EXPENSES` | 정산이 안 끝나서 나갈 수 없음. `details`에 `owes`(낼 건수), `owed`(받을 건수) |
| `SHARED_ITEMS_CHOICE_REQUIRED` | 내가 등록한 공용 물품의 처리 방법을 골라야 함. `details`에 `sharedItemCount` |

### 창고 (인증 필요, 방 구성원)

경로는 모두 `/api/rooms/:roomId` 아래다.

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/items` | 물품 등록. `name`, `category`(FOOD, SUPPLY), `ownershipType`(PERSONAL, SHARED)가 필수 |
| GET | `/items` | 목록. `scope`(all, mine, shared), `status`(기본 STORED, ALL 가능), `category`, `expiringWithinDays`, `search`, `limit` |
| GET | `/items/:itemId` | 상세 |
| PATCH | `/items/:itemId` | 수정 |
| POST | `/items/:itemId/adjust` | 수량 증감. 본문 `delta`(예: -1). 0 미만이 되면 거절 |
| DELETE | `/items/:itemId` | 삭제 |

방 구성원은 개인 물품도 볼 수 있고 소유자 이름이 같이 나온다. 개인 물품은 등록한 사람만 고치고 지울 수 있다. 공용 물품은 누구나 고칠 수 있고, 소유 구분 변경만 등록한 사람이 한다. 수량이 0이 되면 상태가 USED_UP으로, 다시 늘리면 STORED로 바뀐다.

### 일정 (인증 필요, 방 구성원)

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/schedules` | 일정 등록. `title`, `startAt`, `endAt`(`2026-12-05T18:00` 형식) |
| GET | `/schedules` | 목록. `from`, `to`(날짜)를 주면 그 기간과 겹치는 일정만 |
| GET | `/schedules/:scheduleId` | 상세 |
| PATCH | `/schedules/:scheduleId` | 수정. 작성자나 방장만 |
| DELETE | `/schedules/:scheduleId` | 삭제. 작성자나 방장만 |

일정은 모두 방 구성원에게 공유된다. 시각에는 시간대 정보가 없고 `YYYY-MM-DD HH:mm:ss`로 저장하고 돌려준다.

### 청소 (인증 필요, 방 구성원)

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/cleaning-tasks` | 항목 등록. `areaName`, `nextDueDate`, `assigneeUserId`(선택), `repeatType`(NONE, DAILY, WEEKLY, MONTHLY), `repeatInterval` |
| GET | `/cleaning-tasks` | 목록. `active`(true, false, all), `dueBy`(날짜) |
| GET | `/cleaning-tasks/:taskId` | 상세 |
| PATCH | `/cleaning-tasks/:taskId` | 수정. 담당자·날짜를 바꾸면 예정 회차도 함께 바뀐다. |
| DELETE | `/cleaning-tasks/:taskId` | 삭제. 방장만 |
| POST | `/cleaning-tasks/:taskId/complete` | 완료. 다음 예정일로 넘어간다. 반복이 없으면 비활성이 된다. |
| POST | `/cleaning-tasks/:taskId/skip` | 건너뛰기 |
| POST | `/cleaning-tasks/:taskId/postpone` | 미루기. 본문 `postponedTo`. 담당자, 방장, 또는 담당자가 없을 때 누구나 |
| GET | `/cleaning-tasks/:taskId/records` | 이력 |

완료, 건너뛰기, 미루기 본문에 화면에 보이던 `dueDate`를 같이 보내는 것을 권장한다. 그 사이 다른 사람이 먼저 처리했다면 `STALE_DUE_DATE`(409)를 돌려주고 `details.currentDueDate`로 최신 예정일을 알려준다. 같은 청소가 두 번 처리되는 것을 막는다.

다음 예정일은 지금 예정일에 주기를 더하되, 오늘 이후가 될 때까지 반복해서 더한다. 늦게 완료해도 이미 지난 날짜가 예정일이 되지 않는다. 담당자 대신 다른 사람이 청소하면 이력에 담당자와 실제 완료자가 따로 남는다.

### 지출·정산 (인증 필요, 방 구성원)

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/expenses` | 지출 등록. 결제자는 항상 본인. `title`, `amount`, `expenseDate`와 함께 `participantUserIds`(균등 분담) 또는 `shares`(금액 직접 지정) 중 하나 |
| GET | `/expenses` | 목록. `from`, `to`, `limit`. 최신 날짜순 |
| GET | `/expenses/balances` | 나와 다른 사람 사이의 미정산 금액 요약 |
| GET | `/expenses/:expenseId` | 상세 |
| PATCH | `/expenses/:expenseId` | 수정. 결제자만. 정산된 분담이 있으면 금액·분담은 못 바꾼다. |
| DELETE | `/expenses/:expenseId` | 삭제. 결제자만. 정산된 분담이 있으면 못 지운다. |
| PATCH | `/expenses/:expenseId/shares/:userId` | 정산 완료 표시. 본문 `isSettled`. 돈을 받은 결제자만 할 수 있다. |

균등 분담에서 나누어떨어지지 않는 금액은 앞에서부터 한 명씩 1원을 더 낸다. 결제자 본인의 몫은 처음부터 정산 완료다. 분담 금액의 합이 지출 금액과 다르면 `SHARE_SUM_MISMATCH`다.

응답에서 결제자와 분담자는 `{ userId, nickname, status }`로 나온다. `status`는 `MEMBER`(현재 구성원), `LEFT`(스스로 나감), `KICKED`(방장이 내보냄)다. 나간 사람이 얽힌 지출도 기록으로 남는다.

`/expenses/balances`의 `amount`가 양수이면 상대가 나에게 줄 돈, 음수이면 내가 상대에게 줄 돈이다. 나간 사람과의 금액도 나오며, 받을 돈은 결제자가 정산 완료로 정리할 수 있다.

## 정한 규칙

- 방장이 혼자 남은 상태에서 방을 나가면 **방이 삭제된다.** 방의 물품, 일정, 청소, 지출 데이터도 함께 삭제된다.
- **방을 나갈 때:** 정산이 안 끝났으면 나갈 수 없다. 나가면 개인 물품과 일정은 삭제되고, 공용 물품은 방장에게 넘기거나 삭제 중에서 나가는 사람이 고른다. 청소 담당은 비워지고, 지출·분담 기록은 방에 남는다.
- **내보낼 때:** 방장은 정산이 안 끝났어도 내보낼 수 있다. 같은 정리가 적용되고 공용 물품은 방장에게 넘어간다. 지출 기록에는 추방됨으로 남는다.
- 물품, 일정 등을 만드는 요청은 방 행을 공유 잠금으로 확인한다. 누군가 나가는 중이면 그 처리가 끝날 때까지 기다리므로, 나간 사람의 데이터가 새로 생기지 않는다.
- 구성원 아닌 사람이 방의 어떤 기능에 접근해도 방이 있는지 알 수 없도록 `ROOM_NOT_FOUND`(404)를 준다.
- 초대 코드는 8자리이고 DB에는 해시로만 저장한다. 방장도 코드를 다시 볼 수 없고 재발급해야 한다. 기본 유효 기간은 7일이며 1일에서 30일 사이로 정할 수 있다.
- 로그인과 초대 코드 입력은 같은 IP에서 15분에 20번까지만 시도할 수 있다.
- 구성원 목록에는 이름, 전화번호, 계좌 같은 개인정보를 담지 않는다.
- 정원을 현재 인원보다 작게 줄이는 것은 막지 않는다. 이후에는 새로 가입할 수 없다.

## 배포 전에 바꿀 것

지금은 개발용이라 DB에 root 계정을 쓴다. 실제로 서비스하기 전에 다음을 처리한다.

1. MySQL root 비밀번호를 강한 것으로 바꾼다. 지금 `root`는 매우 약하다.
2. `roomade` DB에서 읽기·쓰기만 할 수 있는 전용 계정을 만들고 `.env`의 `DB_USER`, `DB_PASSWORD`를 바꾼다.
3. MySQL 포트(3306)를 외부에 열지 않는다.
4. 서버를 HTTPS 뒤에 둔다. HTTP로는 토큰과 비밀번호가 그대로 노출된다.
5. 운영 서버의 `.env`에는 개발용과 다른 `JWT_SECRET`과 `ACCOUNT_ENC_KEY`를 쓴다.
