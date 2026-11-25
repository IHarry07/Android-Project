#!/usr/bin/env bash
# 룸메이드 서버 처음 설치 (Ubuntu 22.04 / 24.04, Oracle Cloud 무료 서버 기준)
#   사용: sudo bash deploy/setup.sh <이름.duckdns.org> <DuckDNS 토큰>
#   pack.ps1 로 만든 묶음을 서버에 풀고, 그 폴더에서 실행한다. 여러 번 실행해도 된다. (이미 한 일은 건너뛴다)
# 하는 일: 한국 시간대, 메모리가 작으면 스왑, Node·MySQL·Caddy 설치, 빈 DB(schema.sql) 만들기,
#          서버 전용 DB 계정(roomade_app), 새 비밀 키로 .env 만들기, 자동 시작(systemd),
#          HTTPS(Caddy + Let's Encrypt 무료 인증서, 자동 갱신), 방화벽 80/443, DuckDNS 주소 갱신, 매일 DB 백업
set -euo pipefail

DOMAIN="${1:-}"
DUCK_TOKEN="${2:-}"
if [[ -z "$DOMAIN" || -z "$DUCK_TOKEN" ]]; then
  echo "사용법: sudo bash deploy/setup.sh <이름.duckdns.org> <DuckDNS 토큰>" >&2
  exit 1
fi
if [[ $EUID -ne 0 ]]; then echo "sudo 로 실행해 주세요." >&2; exit 1; fi
if [[ "$DOMAIN" != *.duckdns.org ]]; then echo "주소는 이름.duckdns.org 형식이어야 해요: $DOMAIN" >&2; exit 1; fi

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # 묶음을 푼 폴더 (backend, database, deploy 가 있다)
APP_DIR=/opt/roomade
APP_USER=roomade
SUBDOMAIN="${DOMAIN%.duckdns.org}"
step() { echo; echo "==== $* ===="; }

for d in backend database deploy; do
  [[ -d "$SRC/$d" ]] || { echo "$SRC/$d 폴더가 없어요. pack.ps1 로 만든 묶음을 풀었는지 확인해 주세요." >&2; exit 1; }
done

step "1. 한국 시간대 (알림 시각·'오늘' 계산이 DB 시계를 따른다)"
timedatectl set-timezone Asia/Seoul
date

step "2. 메모리가 2GB보다 작으면 스왑 2GB 추가"
mem_mb=$(free -m | awk '/^Mem:/{print $2}')
if [[ $mem_mb -lt 2000 ]] && ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "스왑 추가함 (메모리 ${mem_mb}MB)"
else
  echo "건너뜀 (메모리 ${mem_mb}MB)"
fi

step "3. 패키지 설치 (MySQL, Node.js 24, Caddy)"
export DEBIAN_FRONTEND=noninteractive
echo iptables-persistent iptables-persistent/autosave_v4 boolean true | debconf-set-selections
echo iptables-persistent iptables-persistent/autosave_v6 boolean true | debconf-set-selections
apt-get update -y
apt-get install -y curl ca-certificates gnupg openssl cron mysql-server iptables-persistent \
  debian-keyring debian-archive-keyring apt-transport-https
if ! command -v node >/dev/null || [[ "$(node -v)" != v24* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi
echo "node $(node -v), $(mysql --version), caddy $(caddy version | head -n1)"

step "4. 방화벽: 80(인증서 발급), 443(HTTPS) 열기"
for port in 80 443; do
  if ! iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null; then
    # Oracle 우분투 이미지는 마지막에 REJECT 규칙이 있어서 그 앞에 넣는다.
    reject_line=$(iptables -L INPUT --line-numbers -n | awk '$2=="REJECT"{print $1; exit}')
    if [[ -n "$reject_line" ]]; then
      iptables -I INPUT "$reject_line" -p tcp --dport "$port" -m state --state NEW -j ACCEPT
    else
      iptables -A INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT
    fi
  fi
done
netfilter-persistent save
echo "서버 안 방화벽 열림. (Oracle 콘솔의 보안 목록에서도 80, 443을 열어야 한다 — deploy/README.md 참고)"

step "5. 프로그램 복사 → $APP_DIR/backend"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR/backend"
# .env 는 덮어쓰지 않는다. (묶음에는 .env 가 들어 있지 않다)
cp -a "$SRC/backend/." "$APP_DIR/backend/"
rm -rf "$APP_DIR/deploy" && cp -a "$SRC/deploy" "$APP_DIR/deploy"
rm -rf "$APP_DIR/database" && cp -a "$SRC/database" "$APP_DIR/database"
chmod +x "$APP_DIR"/deploy/*.sh
(cd "$APP_DIR/backend" && npm ci --omit=dev --no-audit --no-fund)
chown -R "$APP_USER:$APP_USER" "$APP_DIR/backend"

step "6. DB: 빈 roomade DB 만들기 (이미 있으면 건너뜀)"
systemctl enable --now mysql
exists=$(mysql -N -e "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='roomade'")
if [[ "$exists" == "0" ]]; then
  mysql < "$APP_DIR/database/schema.sql"
  echo "schema.sql 로 빈 DB를 만들었어요."
else
  echo "roomade DB가 이미 있어요. 그대로 둡니다. (바뀐 점은 database/migrations 를 직접 적용)"
fi

step "7. 서버 전용 DB 계정(roomade_app)과 .env (처음 한 번만, 비밀 키는 이 서버에서 새로 만든다)"
ENV_FILE="$APP_DIR/backend/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  DB_PASS=$(openssl rand -hex 16)
  for host in localhost 127.0.0.1; do
    mysql -e "CREATE USER IF NOT EXISTS 'roomade_app'@'$host' IDENTIFIED BY '$DB_PASS';
              ALTER USER 'roomade_app'@'$host' IDENTIFIED BY '$DB_PASS';
              GRANT SELECT, INSERT, UPDATE, DELETE ON roomade.* TO 'roomade_app'@'$host';"
  done
  mysql -e "FLUSH PRIVILEGES;"
  umask 077
  cat > "$ENV_FILE" <<EOF
# 배포 서버 설정. setup.sh 가 만들었다. 이 파일은 이 서버 밖으로 내보내지 않는다.
PORT=3000
# Caddy(HTTPS)만 접근하도록 이 서버 안에서만 받는다.
HOST=127.0.0.1
TRUST_PROXY=loopback
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=roomade_app
DB_PASSWORD=$DB_PASS
DB_NAME=roomade
JWT_SECRET=$(openssl rand -hex 48)
# 계좌 정보 암호화 키. 잃으면 저장된 계좌 정보를 복구할 수 없다. 이 서버 밖 안전한 곳에 따로 보관한다.
ACCOUNT_ENC_KEY=$(openssl rand -hex 32)
# 푸시 알림(FCM): Firebase 서비스 계정 키를 $APP_DIR/firebase-key.json 으로 올린 뒤 아래 주석을 푼다.
# FIREBASE_SERVICE_ACCOUNT=$APP_DIR/firebase-key.json
# 메일(인증번호·보안 알림). 채우지 않으면 회원가입·비밀번호 찾기의 이메일 인증을 할 수 없다.
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
MAIL_FROM=
USER_RATE_LIMIT_PER_MINUTE=120
MAIL_DEV_CONSOLE=false
EOF
  umask 022
  chown "$APP_USER:$APP_USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo ".env 를 만들었어요. 메일(SMTP_*) 칸은 직접 채워야 해요."
else
  echo ".env 가 이미 있어요. 그대로 둡니다."
fi

step "8. 자동 시작 (systemd: roomade)"
install -m 644 "$APP_DIR/deploy/roomade.service" /etc/systemd/system/roomade.service
systemctl daemon-reload
systemctl enable roomade
systemctl restart roomade
sleep 3
if curl -fsS http://127.0.0.1:3000/api/health >/dev/null; then
  echo "서버 동작 확인: http://127.0.0.1:3000/api/health"
else
  echo "서버가 응답하지 않아요. 로그: sudo journalctl -u roomade -n 50" >&2
fi

step "9. DuckDNS 주소를 이 서버 IP로 맞추고, 5분마다 갱신"
install -d -m 700 /etc/roomade
umask 077
printf 'DUCKDNS_DOMAIN=%s\nDUCKDNS_TOKEN=%s\n' "$SUBDOMAIN" "$DUCK_TOKEN" > /etc/roomade/duckdns.env
umask 022
"$APP_DIR/deploy/duckdns.sh"
echo "*/5 * * * * root $APP_DIR/deploy/duckdns.sh >/dev/null 2>&1" > /etc/cron.d/roomade-duckdns
chmod 644 /etc/cron.d/roomade-duckdns

step "10. HTTPS (Caddy가 Let's Encrypt 인증서를 받아 자동으로 갱신)"
sed "s/__DOMAIN__/$DOMAIN/g" "$APP_DIR/deploy/Caddyfile" > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl enable caddy
systemctl reload caddy || systemctl restart caddy

step "11. 매일 새벽 3시 DB 백업 (/var/backups/roomade, 14개 보관)"
echo "0 3 * * * root $APP_DIR/deploy/backup.sh >> /var/log/roomade-backup.log 2>&1" > /etc/cron.d/roomade-backup
chmod 644 /etc/cron.d/roomade-backup
"$APP_DIR/deploy/backup.sh"

step "12. HTTPS 확인 (인증서 발급에 1분 정도 걸릴 수 있다)"
ok=0
for i in $(seq 1 12); do
  if curl -fsS "https://$DOMAIN/api/health" >/dev/null 2>&1; then ok=1; break; fi
  sleep 10
done
if [[ $ok -eq 1 ]]; then
  echo "완료: https://$DOMAIN/api/health 응답 OK"
else
  echo "아직 HTTPS가 응답하지 않아요. 확인할 것:" >&2
  echo "  - Oracle 콘솔 보안 목록에 TCP 80, 443 수신 규칙이 있는지" >&2
  echo "  - DuckDNS 화면에서 $SUBDOMAIN 의 IP가 이 서버 공인 IP인지" >&2
  echo "  - 로그: sudo journalctl -u caddy -n 50" >&2
fi

echo
echo "남은 일: $ENV_FILE 의 SMTP_* 채우기 → sudo systemctl restart roomade"
echo "앱: android-app/local.properties 에 roomade.baseUrl=https://$DOMAIN/ 로 바꾸고 다시 빌드"
