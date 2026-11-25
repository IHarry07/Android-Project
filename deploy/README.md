# 룸메이드 서버 배포 (Oracle Cloud 무료 서버 + DuckDNS + HTTPS)

비용 0원으로 서버를 24시간 돌리는 방법이다. 결과 주소는 `https://이름.duckdns.org` 이다.

- 서버: Oracle Cloud **Always Free** 가상 서버 (Ubuntu)
- 주소: **DuckDNS** 무료 하위 도메인
- HTTPS: **Caddy** 가 Let's Encrypt 무료 인증서를 받고 자동으로 갱신
- DB: 서버 안 MySQL, **빈 DB로 시작** (`database/schema.sql`). 지금 PC의 테스트 데이터는 옮기지 않는다.

## 1. Oracle Cloud 가입과 서버 만들기 (직접)

1. https://www.oracle.com/cloud/free/ 에서 무료 계정을 만든다. 카드 등록이 필요하지만 무료 범위에서는 요금이 나가지 않는다.
   - **홈 리전**은 나중에 바꿀 수 없다. `South Korea Central (Seoul)` 또는 `South Korea North (Chuncheon)` 을 고른다.
2. 콘솔 → **Compute → Instances → Create instance**
   - Image: **Canonical Ubuntu 24.04** (또는 22.04)
   - Shape: `VM.Standard.A1.Flex`(Ampere, 1 OCPU / 6GB) 를 먼저 시도하고, 자리가 없다고 나오면 `VM.Standard.E2.1.Micro`(1GB) 를 고른다. 둘 다 Always Free 다. (1GB면 설치 스크립트가 스왑을 자동으로 추가한다)
   - Networking: 새 VCN, **공인 IPv4 주소 할당** 체크
   - SSH keys: **Generate a key pair** → **Save private key** 로 키 파일(`.key`)을 받아 둔다. 잃으면 서버에 들어갈 수 없다.
3. 만든 서버의 **Public IP address** 를 적어 둔다.
4. **방화벽(보안 목록) 열기**: 인스턴스 화면 → Subnet → Security Lists → Default Security List → **Add Ingress Rules**
   - Source CIDR `0.0.0.0/0`, IP Protocol `TCP`, Destination Port `80` → 추가
   - 같은 방법으로 `443` 추가
   - (22번 SSH는 기본으로 열려 있다)

## 2. DuckDNS 주소 만들기 (직접)

1. https://www.duckdns.org 에 Google 또는 GitHub 계정으로 로그인한다.
2. 원하는 이름(예: `roommade-team`)을 입력하고 **add domain** → `roommade-team.duckdns.org`
3. current ip 칸에 1-3의 서버 공인 IP를 넣고 **update ip**
4. 화면 위의 **token** 을 적어 둔다. (설치 스크립트가 5분마다 IP를 자동으로 맞춘다)

## 3. 묶음 만들어서 서버로 보내기 (이 PC)

```powershell
powershell -ExecutionPolicy Bypass -File E:\Project\RoomMade_Merge\deploy\pack.ps1
scp -i <키 파일 경로> E:\Project\RoomMade_Merge\deploy\dist\roomade-deploy.tar.gz ubuntu@<서버 IP>:~/
ssh -i <키 파일 경로> ubuntu@<서버 IP>
```

> Windows에서 키 파일 권한 오류(`UNPROTECTED PRIVATE KEY FILE`)가 나면, 키 파일 속성 → 보안에서 내 계정만 읽기로 바꾼다.

## 4. 서버에서 설치 (ssh 접속한 상태)

```bash
mkdir -p ~/roomade && tar -xzf ~/roomade-deploy.tar.gz -C ~/roomade && cd ~/roomade
sudo bash deploy/setup.sh roommade-team.duckdns.org <DuckDNS 토큰>
```

10분 정도 걸린다. 마지막에 `완료: https://.../api/health 응답 OK` 가 나오면 성공이다.
스크립트가 하는 일: 한국 시간대, 스왑(메모리 작을 때), Node 24·MySQL·Caddy 설치, 서버 안 방화벽 80/443, 빈 DB 만들기,
서버 전용 DB 계정(roomade_app, 비밀번호 자동 생성), **새 비밀 키로 `.env` 생성**, 자동 시작, HTTPS, DuckDNS 자동 갱신, 매일 새벽 3시 DB 백업.

## 5. 메일·푸시 설정 (서버에서)

메일(SMTP)이 없으면 회원가입 이메일 인증과 비밀번호 찾기를 할 수 없다.

```bash
sudo nano /opt/roomade/backend/.env      # SMTP_USER, SMTP_PASSWORD, MAIL_FROM 채우기
sudo systemctl restart roomade
```

푸시 알림(FCM)을 쓰려면 PC에서 Firebase 서비스 계정 키를 올리고:

```powershell
scp -i <키> <Firebase 키 파일> ubuntu@<서버 IP>:~/firebase-key.json
```
```bash
sudo mv ~/firebase-key.json /opt/roomade/firebase-key.json
sudo chown roomade:roomade /opt/roomade/firebase-key.json && sudo chmod 600 /opt/roomade/firebase-key.json
sudo nano /opt/roomade/backend/.env      # FIREBASE_SERVICE_ACCOUNT 줄의 # 지우기
sudo systemctl restart roomade
```

## 6. 앱을 배포 서버로 바꾸기 (이 PC)

`android-app/local.properties` 의 주소를 바꾸고 다시 빌드한다.

```
roomade.baseUrl=https://roommade-team.duckdns.org/
```

주소가 `https://` 이면 앱이 암호화되지 않은 HTTP 통신을 자동으로 막는다. 시연용 PC 서버로 돌아가려면 `http://<PC IP>:3000/` 으로 되돌리면 된다.

## 운영

| 할 일 | 명령 (서버) |
|---|---|
| 서버 상태 / 로그 | `sudo systemctl status roomade`, `sudo journalctl -u roomade -f` |
| 다시 시작 | `sudo systemctl restart roomade` |
| HTTPS 로그 | `sudo journalctl -u caddy -n 50` |
| 공지 등록 | `cd /opt/roomade/backend && sudo -u roomade node scripts/notice.js add "제목" "내용"` |
| 문의 답변 | `cd /opt/roomade/backend && sudo -u roomade node scripts/inquiry.js list --waiting` |
| 지금 백업 | `sudo /opt/roomade/deploy/backup.sh` (`/var/backups/roomade`, 14개 보관) |
| 백업을 PC로 받기 | PC에서 `scp -i <키> ubuntu@<IP>:/var/backups/roomade/<파일> .` (먼저 서버에서 `sudo cp` 로 홈 폴더에 복사) |
| 복원 | `gunzip -c <백업>.sql.gz \| sudo mysql roomade` |

### 코드 업데이트

PC에서 `pack.ps1` → `scp` 로 보낸 뒤 서버에서:

```bash
rm -rf ~/roomade && mkdir -p ~/roomade && tar -xzf ~/roomade-deploy.tar.gz -C ~/roomade && cd ~/roomade
sudo bash deploy/update.sh        # 백업 → 코드 교체 → 다시 시작 (.env, DB 데이터는 그대로)
```

DB 구조가 바뀐 업데이트(`database/migrations` 에 새 파일)는 update.sh 전에 적용한다:
`sudo mysql roomade < database/migrations/<새 파일>.sql`

## 꼭 따로 보관할 것

- SSH 키 파일 (잃으면 서버 접속 불가)
- 서버의 `/opt/roomade/backend/.env` 안 `ACCOUNT_ENC_KEY` (잃으면 저장된 계좌 정보를 복구할 수 없다)
  - 확인: `sudo grep ACCOUNT_ENC_KEY /opt/roomade/backend/.env` → 비밀번호 관리 도구 등에 보관
- DuckDNS 토큰
