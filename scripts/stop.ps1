$ErrorActionPreference = 'Stop'
$projectDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$recordPath = Join-Path $projectDir '.local\launcher.json'
if (-not (Test-Path -LiteralPath $recordPath)) { Write-Host 'No launcher processes recorded.'; exit 0 }
$record = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
foreach ($entry in $record.processes) {
    $processId = [int]$entry.id
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId"
    if (-not $process) { continue }
    if ($process.Name -ne 'node.exe' -or -not $process.CommandLine -or -not $process.CommandLine.Contains([string]$entry.script) -or -not ([string]$entry.script).StartsWith($projectDir + '\', [StringComparison]::OrdinalIgnoreCase)) {
        Write-Host "Skipping process $processId because its identity no longer matches Jobdesk."
        continue
    }
    & taskkill.exe /PID $processId /T /F | Out-Null
    Write-Host ("Stopped Jobdesk " + $entry.role)
}
Write-Host 'Jobdesk background processes stopped. You can close the browser tab.'

