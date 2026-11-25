<#
  Android Studio 없이 앱을 빌드해서 연결된 기기(실제 폰 또는 에뮬레이터)에 설치하고 실행한다.

  사용 예 (PowerShell에서 RoomMade_Merge 폴더 기준)
    .\scripts\dev-test.ps1 -StartServer -ServerIp 192.168.0.10
    .\scripts\dev-test.ps1 -SkipBuild            # APK를 다시 빌드하지 않고 설치만
    .\scripts\dev-test.ps1 -NoLog                # 로그를 따라가지 않고 끝낸다

  옵션
    -SkipBuild    빌드를 건너뛰고 기존 APK를 설치한다.
    -StartServer  새 PowerShell 창에서 backend 서버(npm start)를 켠다. 이미 켜져 있으면 건너뛴다.
    -ServerIp     폰이 접속할 PC의 내부 IP. android-app/local.properties 의 roomade.baseUrl 을 이 값으로 쓴다.
                  (에뮬레이터는 지정하지 않아도 된다. 기본값 10.0.2.2 를 쓴다.)
    -Device       adb 기기 번호. 기기가 둘 이상 연결되었을 때만 필요하다.
    -NoLog        설치와 실행 뒤 로그를 보여주지 않는다.

  이 스크립트는 시스템 환경변수를 바꾸지 않는다. JAVA_HOME 은 이 스크립트 안에서만 지정한다.
#>
param(
    [switch]$SkipBuild,
    [switch]$StartServer,
    [string]$ServerIp,
    [string]$Device,
    [switch]$NoLog
)

$ErrorActionPreference = 'Stop'

$root        = Split-Path -Parent $PSScriptRoot
$appDir      = Join-Path $root 'android-app'
$backendDir  = Join-Path $root 'backend'
$apk         = Join-Path $appDir 'app\build\outputs\apk\debug\app-debug.apk'
$packageName = 'com.example.android_project'
$launchComponent = "$packageName/.ui.LoginActivity"
$minSdk      = 35   # android-app/app/build.gradle.kts 의 minSdk 와 같아야 한다.

function Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }

# ---------------------------------------------------------------
# 1. JDK, Android SDK 위치 (이 스크립트 안에서만 적용)
# ---------------------------------------------------------------
Step 'JDK / Android SDK 확인'

$javaHome = $null
foreach ($scope in 'Machine', 'User') {
    $candidate = [Environment]::GetEnvironmentVariable('JAVA_HOME', $scope)
    if ($candidate -and (Test-Path (Join-Path $candidate 'bin\java.exe'))) { $javaHome = $candidate; break }
}
if (-not $javaHome) {
    throw 'JAVA_HOME 이 가리키는 JDK를 찾을 수 없습니다. 시스템 환경변수 JAVA_HOME 을 확인해 주세요.'
}
$env:JAVA_HOME = $javaHome
Write-Host "JAVA_HOME = $javaHome"

$sdk = $env:ANDROID_HOME
if (-not $sdk -or -not (Test-Path $sdk)) { $sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (-not (Test-Path $sdk)) { throw "Android SDK 를 찾을 수 없습니다: $sdk" }
$env:ANDROID_HOME = $sdk
$adb = Join-Path $sdk 'platform-tools\adb.exe'
if (-not (Test-Path $adb)) { throw "adb 를 찾을 수 없습니다: $adb" }
Write-Host "ANDROID_HOME = $sdk"

# ---------------------------------------------------------------
# 2. 서버 주소 (선택)
# ---------------------------------------------------------------
if ($ServerIp) {
    Step "서버 주소를 http://${ServerIp}:3000/ 로 설정"
    $localProps = Join-Path $appDir 'local.properties'
    $lines = @()
    if (Test-Path $localProps) {
        $lines = @(Get-Content $localProps -Encoding UTF8 | Where-Object { $_ -notmatch '^\s*roomade\.baseUrl\s*=' })
    }
    $lines += "roomade.baseUrl=http://${ServerIp}:3000/"
    # BOM 없는 UTF-8 로 저장한다. (BOM 이 있으면 Gradle 이 첫 줄을 잘못 읽는다.)
    [IO.File]::WriteAllLines($localProps, $lines, (New-Object Text.UTF8Encoding($false)))
    Write-Host "android-app/local.properties 를 갱신했습니다."
}

# ---------------------------------------------------------------
# 3. 서버 실행 (선택)
# ---------------------------------------------------------------
if ($StartServer) {
    Step 'backend 서버 확인'
    if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) {
        Write-Host '3000 포트가 이미 사용 중입니다. 서버가 켜져 있는 것으로 보고 건너뜁니다.'
    } else {
        Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$backendDir'; npm start"
        Write-Host '새 창에서 서버를 시작했습니다. (창을 닫으면 서버도 종료됩니다.)'
    }
}

# ---------------------------------------------------------------
# 4. 빌드
# ---------------------------------------------------------------
if (-not $SkipBuild) {
    Step 'APK 빌드 (assembleDebug)'

    # VS Code의 Gradle 확장이 띄운 데몬(jlink 가 없는 JRE)을 재사용하면 빌드가 jlink 오류로 실패한다.
    # 이 스크립트만 쓰는 별도의 데몬 등록 폴더를 지정해서 다른 도구의 데몬과 섞이지 않게 한다.
    $daemonRegistry = Join-Path $env:LOCALAPPDATA 'roomade-gradle-daemon'
    $daemonFlag = "-Dorg.gradle.daemon.registry.base=$daemonRegistry"

    Push-Location $appDir
    try {
        & .\gradlew.bat ':app:assembleDebug' '--console=plain' $daemonFlag
        if ($LASTEXITCODE -ne 0) { throw "빌드에 실패했습니다. (종료 코드 $LASTEXITCODE)" }
    } finally {
        # 빌드가 끝나면 이 스크립트의 Gradle 데몬만 종료해서 메모리를 돌려준다. (VS Code 쪽 데몬은 건드리지 않는다.)
        & .\gradlew.bat --stop $daemonFlag | Out-Null
        Pop-Location
    }
}
if (-not (Test-Path $apk)) { throw "APK 가 없습니다: $apk" }

# ---------------------------------------------------------------
# 5. 기기 확인
# ---------------------------------------------------------------
Step '연결된 기기 확인'
$deviceLines = @(& $adb devices | Select-Object -Skip 1 | Where-Object { $_.Trim() -ne '' })
$ready = @($deviceLines | Where-Object { $_ -match "`tdevice$" } | ForEach-Object { ($_ -split "`t")[0] })

if (@($deviceLines | Where-Object { $_ -match "`tunauthorized$" }).Count -gt 0) {
    throw '폰 화면에 "USB 디버깅을 허용하시겠습니까?" 창이 떠 있는지 확인하고 허용해 주세요.'
}
if ($ready.Count -eq 0) {
    throw '연결된 기기가 없습니다. 폰의 개발자 옵션에서 USB 디버깅(또는 무선 디버깅)을 켜고 연결해 주세요.'
}
if ($Device) {
    if ($ready -notcontains $Device) { throw "지정한 기기($Device)가 연결되어 있지 않습니다. 연결됨: $($ready -join ', ')" }
    $target = $Device
} elseif ($ready.Count -gt 1) {
    throw "기기가 둘 이상입니다. -Device 로 하나를 지정해 주세요: $($ready -join ', ')"
} else {
    $target = $ready[0]
}
$sel = @('-s', $target)

$model = (& $adb @sel shell getprop ro.product.model).Trim()
$sdkInt = [int](& $adb @sel shell getprop ro.build.version.sdk).Trim()
$release = (& $adb @sel shell getprop ro.build.version.release).Trim()
Write-Host "기기: $model (Android $release, API $sdkInt) [$target]"

if ($sdkInt -lt $minSdk) {
    throw "이 앱은 API $minSdk(Android 15) 이상에서만 설치됩니다. 이 기기는 API $sdkInt 입니다."
}

# ---------------------------------------------------------------
# 6. 설치와 실행
# ---------------------------------------------------------------
Step 'APK 설치'
& $adb @sel install -r $apk
if ($LASTEXITCODE -ne 0) { throw '설치에 실패했습니다.' }

Step '앱 실행'
& $adb @sel logcat -c
& $adb @sel shell am start -n $launchComponent | Out-Null
Write-Host "실행했습니다: $launchComponent"

# ---------------------------------------------------------------
# 7. PC 내부 IP 안내
# ---------------------------------------------------------------
Step '이 PC의 내부 IP (폰이 접속할 주소)'
Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and $_.InterfaceAlias -notmatch 'Loopback|vEthernet|VirtualBox|VMware|WSL|Bluetooth' } |
    ForEach-Object { Write-Host ("  {0,-16} {1}" -f $_.IPAddress, $_.InterfaceAlias) }
Write-Host '폰에서 서버에 접속되지 않으면 Windows 방화벽이 3000 포트를 막고 있을 수 있습니다.'

# ---------------------------------------------------------------
# 8. 로그
# ---------------------------------------------------------------
if (-not $NoLog) {
    Step '앱 로그 (경고 이상만, 종료: Ctrl+C)'
    Start-Sleep -Seconds 2
    $appPid = ((& $adb @sel shell pidof $packageName) | Out-String).Trim()
    if ($appPid) {
        & $adb @sel logcat "--pid=$appPid" -v time '*:W'
    } else {
        Write-Host '앱 프로세스를 찾지 못했습니다. 바로 종료되었을 수 있어 최근 오류를 보여줍니다.' -ForegroundColor Yellow
        & $adb @sel logcat -d -s AndroidRuntime:E
    }
}
