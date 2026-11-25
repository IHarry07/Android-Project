#!/usr/bin/env bash
# 룸메이드 서버 업데이트 (코드만 바꾼다. .env 와 DB 데이터는 그대로)
#   사용: 새 묶음을 서버에 풀고 그 폴더에서  sudo bash deploy/update.sh
#   DB 구조가 바뀌었다면(database/migrations 에 새 파일) 먼저 백업 후 직접 적용한다:
#     sudo mysql roomade < database/migrations/<새 파일>.sql
set -euo pipefail
if [[ $EUID -ne 0 ]]; then echo "sudo 로 실행해 주세요." >&2; exit 1; fi
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR=/opt/roomade
[[ -f "$APP_DIR/backend/.env" ]] || { echo "먼저 setup.sh 로 설치해 주세요." >&2; exit 1; }

echo "==== 업데이트 전 DB 백업 ===="
"$APP_DIR/deploy/backup.sh"

echo "==== 코드 복사 (.env 는 그대로) ===="
cp -a "$SRC/backend/." "$APP_DIR/backend/"
rm -rf "$APP_DIR/deploy" && cp -a "$SRC/deploy" "$APP_DIR/deploy"
rm -rf "$APP_DIR/database" && cp -a "$SRC/database" "$APP_DIR/database"
chmod +x "$APP_DIR"/deploy/*.sh
(cd "$APP_DIR/backend" && npm ci --omit=dev --no-audit --no-fund)
chown -R roomade:roomade "$APP_DIR/backend"
install -m 644 "$APP_DIR/deploy/roomade.service" /etc/systemd/system/roomade.service
systemctl daemon-reload

echo "==== 다시 시작 ===="
systemctl restart roomade
sleep 3
if curl -fsS http://127.0.0.1:3000/api/health >/dev/null; then
  echo "업데이트 완료: 서버 응답 OK"
else
  echo "서버가 응답하지 않아요. 로그: sudo journalctl -u roomade -n 50" >&2
  exit 1
fi
