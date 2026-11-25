# 룸메이드 DB 백업: roomade DB를 날짜별 .sql 파일로 저장하고 최근 7개만 남긴다.
#   실행: powershell -ExecutionPolicy Bypass -File E:\Project\RoomMade_Merge\scripts\backup-db.ps1
#   저장 위치: E:\Project\backups\db\ (원하면 -OutDir 로 바꾼다)
#   DB 접속 정보는 backend\.env 에서 읽는다. 비밀번호는 명령줄에 드러나지 않게 환경변수로 넘긴다.
#   mysqldump 위치는 PATH, 환경변수 MYSQL_BIN, 이 PC의 설치 경로 순서로 찾는다.
param(
  [string]$OutDir = 'E:\Project\backups\db',
  [int]$Keep = 7
)
$ErrorActionPreference = 'Stop'
$envFile = Join-Path $PSScriptRoot '..\backend\.env'
$cfg = @{}
Get-Content $envFile -Encoding UTF8 | Where-Object { $_ -match '^\s*([A-Z_]+)\s*=(.*)$' } | ForEach-Object { $cfg[$Matches[1]] = $Matches[2].Trim() }
# 백업(프로시저·트리거 포함)은 관리자 권한이 필요하다. backend\.env.admin 이 있으면 그 계정을 쓴다.
$adminFile = Join-Path $PSScriptRoot '..\backend\.env.admin'
if (Test-Path $adminFile) {
  Get-Content $adminFile -Encoding UTF8 | Where-Object { $_ -match '^\s*([A-Z_]+)\s*=(.*)$' } | ForEach-Object { $cfg[$Matches[1]] = $Matches[2].Trim() }
}
if ($cfg.DB_ADMIN_USER) { $cfg.DB_USER = $cfg.DB_ADMIN_USER; $cfg.DB_PASSWORD = $cfg.DB_ADMIN_PASSWORD }

$dump = (Get-Command mysqldump -ErrorAction SilentlyContinue).Source
if (-not $dump -and $env:MYSQL_BIN) { $dump = Join-Path $env:MYSQL_BIN 'mysqldump.exe' }
if (-not $dump) { $dump = 'C:\26_2026591024\db\mysql5.7.44_64\bin\mysqldump.exe' }
if (-not (Test-Path $dump)) { throw "mysqldump 를 찾을 수 없어요. MYSQL_BIN 환경변수에 MySQL bin 폴더를 지정해 주세요." }

New-Item -ItemType Directory -Force $OutDir | Out-Null
$db = if ($cfg.DB_NAME) { $cfg.DB_NAME } else { 'roomade' }
$file = Join-Path $OutDir ("{0}_{1}.sql" -f $db, (Get-Date -Format 'yyyy-MM-dd_HHmm'))

$env:MYSQL_PWD = $cfg.DB_PASSWORD
try {
  & $dump --host=$($cfg.DB_HOST) --port=$($cfg.DB_PORT) --user=$($cfg.DB_USER) --single-transaction --routines --triggers --default-character-set=utf8mb4 --result-file=$file $db
  if ($LASTEXITCODE -ne 0) { throw "mysqldump 실패 (종료 코드 $LASTEXITCODE)" }
} finally {
  Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
}

# 오래된 백업 정리 (최근 $Keep 개만 남김)
Get-ChildItem $OutDir -Filter "${db}_*.sql" | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Keep | Remove-Item -Force
"백업 완료: $file ({0:N1} KB)" -f ((Get-Item $file).Length / 1KB)