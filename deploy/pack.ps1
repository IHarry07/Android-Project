# 룸메이드 배포 묶음 만들기 (이 PC에서 실행)
#   실행: powershell -ExecutionPolicy Bypass -File E:\Project\RoomMade_Merge\deploy\pack.ps1
#   결과: E:\Project\RoomMade_Merge\deploy\dist\roomade-deploy.tar.gz
# 비밀 파일(.env, .env.admin, Firebase 키)과 node_modules, 테스트는 넣지 않는다.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$dist = Join-Path $PSScriptRoot 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
$out = Join-Path $dist 'roomade-deploy.tar.gz'

# 서버에서 bash 로 실행하는 파일은 줄 끝이 LF 여야 한다. (CRLF 면 실행 오류)
$crlf = Get-ChildItem (Join-Path $root 'deploy') -Filter '*.sh' | Where-Object { [IO.File]::ReadAllText($_.FullName).Contains("`r`n") }
if ($crlf) { throw ("줄 끝이 CRLF 인 파일이 있어요: " + ($crlf.Name -join ', ')) }

tar -czf $out -C $root `
  --exclude=node_modules --exclude=.env --exclude=.env.admin --exclude='*firebase-adminsdk*' `
  --exclude=test --exclude='*.log' --exclude=dist `
  backend database deploy
if ($LASTEXITCODE -ne 0) { throw "tar 실패 ($LASTEXITCODE)" }

# 비밀 파일이 들어가지 않았는지 한 번 더 확인
$list = tar -tzf $out
$bad = $list | Where-Object { $_ -match '(^|/)\.env$|(^|/)\.env\.admin$|firebase-adminsdk|node_modules/' }
if ($bad) { Remove-Item $out; throw ("묶음에 들어가면 안 되는 파일: " + ($bad -join ', ')) }

"배포 묶음: $out ({0:N0} KB, 파일 {1}개)" -f ((Get-Item $out).Length / 1KB), ($list | Where-Object { $_ -notmatch '/$' }).Count
"서버로 보내기: scp -i <SSH 키> `"$out`" ubuntu@<서버 IP>:~/"
