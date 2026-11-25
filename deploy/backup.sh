#!/usr/bin/env bash
# 룸메이드 DB 백업 (배포 서버). /var/backups/roomade/roomade_날짜.sql.gz, 최근 14개만 남긴다.
# root 로 실행하면 MySQL 관리자(소켓 인증)로 비밀번호 없이 백업한다. (cron: /etc/cron.d/roomade-backup)
# 같은 서버에만 있으면 서버가 사라질 때 같이 사라지므로, 가끔 PC로 내려받아 둔다. (deploy/README.md 참고)
set -euo pipefail
OUT=/var/backups/roomade
KEEP=14
mkdir -p "$OUT"
chmod 700 "$OUT"
file="$OUT/roomade_$(date +%F_%H%M).sql.gz"
mysqldump --single-transaction --routines --triggers --default-character-set=utf8mb4 roomade | gzip > "$file"
chmod 600 "$file"
ls -1t "$OUT"/roomade_*.sql.gz | tail -n +$((KEEP + 1)) | xargs -r rm -f
echo "$(date '+%F %T') 백업 완료: $file ($(du -h "$file" | cut -f1))"
