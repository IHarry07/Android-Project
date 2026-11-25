#!/usr/bin/env bash
# DuckDNS 주소(이름.duckdns.org)가 이 서버의 공인 IP를 가리키도록 갱신한다. (cron 으로 5분마다)
# 토큰은 /etc/roomade/duckdns.env (root만 읽기)에 있다.
set -euo pipefail
# shellcheck disable=SC1091
source /etc/roomade/duckdns.env
result=$(curl -fsS --max-time 20 "https://www.duckdns.org/update?domains=${DUCKDNS_DOMAIN}&token=${DUCKDNS_TOKEN}&ip=")
if [[ "$result" != "OK" ]]; then
  echo "DuckDNS 갱신 실패: $result (이름과 토큰을 확인)" >&2
  exit 1
fi
echo "DuckDNS 갱신 OK: ${DUCKDNS_DOMAIN}.duckdns.org"
