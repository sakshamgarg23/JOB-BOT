param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $projectDir
$runtimeDir = Join-Path $projectDir '.local'
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
$baseUrl = 'http://127.0.0.1:3000'
$envFile = Join-Path $projectDir '.env'
if (Test-Path -LiteralPath $envFile) {
    $line = Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^JOBDESK_BASE_URL=' } | Select-Object -First 1
    if ($line) { $baseUrl = ($line -split '=', 2)[1].Trim().Trim('"').Trim("'").TrimEnd('/') }
}
$uri = [Uri]$baseUrl
if ($uri.Host -notin @('127.0.0.1', 'localhost')) { throw 'The launcher only supports a local Jobdesk URL.' }
function Get-AppState {
    try { return Invoke-RestMethod -Uri "$baseUrl/api/state" -TimeoutSec 3 } catch { return $null }
}
function Worker-IsOnline($state) {
    if (-not $state -or -not $state.worker -or $state.worker.state -ne 'running') { return $false }
    return (([DateTimeOffset]::UtcNow - [DateTimeOffset]::Parse($state.worker.at)).TotalSeconds -lt 16)
}
$nodePath = (Get-Command node -ErrorAction Stop).Source
$nextPath = Join-Path $projectDir 'node_modules\next\dist\bin\next'
$workerPath = Join-Path $projectDir 'worker\index.ts'
if (-not (Test-Path -LiteralPath $nextPath)) { throw 'Dependencies are missing. Run npm install in the project folder first.' }
$recordPath = Join-Path $runtimeDir 'launcher.json'
$owned = @()
if (Test-Path -LiteralPath $recordPath) {
    try { $owned = @((Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json).processes) } catch {}
}
$state = Get-AppState
if (-not $state -or $null -eq $state.jobs) {
    if (-not (Test-Path -LiteralPath (Join-Path $projectDir '.next\BUILD_ID'))) {
        Write-Host 'Building Jobdesk for the first launch...'
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Build failed. Read the terminal output above.' }
    }
    $web = Start-Process -FilePath $nodePath -ArgumentList @(('"' + $nextPath + '"'), 'start', '--hostname', '127.0.0.1', '--port', [string]$uri.Port) -WorkingDirectory $projectDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'web.out.log') -RedirectStandardError (Join-Path $runtimeDir 'web.error.log') -PassThru
    $owned += [PSCustomObject]@{ id = $web.Id; script = $nextPath; role = 'web' }
}
@{ processes = $owned } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $recordPath -Encoding UTF8
$deadline = [DateTime]::UtcNow.AddSeconds(45)
do {
    $state = Get-AppState
    if ($state -and $null -ne $state.jobs) { break }
    Start-Sleep -Milliseconds 500
} while ([DateTime]::UtcNow -lt $deadline)
if (-not $state -or $null -eq $state.jobs) { throw "Jobdesk did not start. Read .local\web.error.log." }
if (-not (Worker-IsOnline $state)) {
    $worker = Start-Process -FilePath $nodePath -ArgumentList @('--env-file-if-exists=.env', '--import', 'tsx', ('"' + $workerPath + '"')) -WorkingDirectory $projectDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'worker.out.log') -RedirectStandardError (Join-Path $runtimeDir 'worker.error.log') -PassThru
    $owned += [PSCustomObject]@{ id = $worker.Id; script = $workerPath; role = 'worker' }
    @{ processes = $owned } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $recordPath -Encoding UTF8
    $deadline = [DateTime]::UtcNow.AddSeconds(12)
    do {
        $state = Get-AppState
        if (Worker-IsOnline $state) { break }
        Start-Sleep -Milliseconds 500
    } while ([DateTime]::UtcNow -lt $deadline)
    if (-not (Worker-IsOnline $state)) { throw 'The app is open but the worker could not start. Read .local\worker.error.log.' }
}
Write-Host "Jobdesk is ready at $baseUrl"
Write-Host 'Your profile is prefilled. Open My profile, review it, and save your confirmation.'
Write-Host 'Real-platform auto-submit is not enabled. The local demo can verify automation.'
Write-Host 'Open Automation for background discovery and Naukri Neo setup.'
if (-not $NoBrowser) {
    try { Start-Process -FilePath $baseUrl }
    catch { Write-Host "The app is running. Open this address in your browser: $baseUrl" }
}

