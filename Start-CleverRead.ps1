$ErrorActionPreference = 'Stop'
$appDirectory = $PSScriptRoot
$appUrl = 'http://127.0.0.1:4173'
$expectedVersion = (Get-Content -LiteralPath (Join-Path $appDirectory 'package.json') -Raw | ConvertFrom-Json).version
$runtimeDirectory = Join-Path $appDirectory '.runtime'
function Test-CleverRead {
    try {
        $health = Invoke-RestMethod -Uri ($appUrl + '/api/health') -TimeoutSec 2
        return $health.ok -and $health.app -eq 'clever-read' -and $health.version -eq $expectedVersion
    } catch { return $false }
}
if (-not (Test-CleverRead)) {
    try { $oldHealth = Invoke-RestMethod -Uri ($appUrl + '/api/health') -TimeoutSec 2 } catch { $oldHealth = $null }
    if ($oldHealth.ok -and $oldHealth.app -eq 'clever-read') {
        $pidFile = Join-Path $runtimeDirectory 'server.pid'
        if (-not (Test-Path -LiteralPath $pidFile)) { throw 'An older Clever Read service is running. Close its terminal, then launch again.' }
        $savedServiceId = [int](Get-Content -LiteralPath $pidFile -Raw).Trim()
        $oldProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$savedServiceId"
        $listener = Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalAddress -eq '127.0.0.1' -and $_.OwningProcess -eq $savedServiceId }
        if (-not $listener -or -not $oldProcess -or (Split-Path $oldProcess.ExecutablePath -Leaf) -ne 'node.exe' -or $oldProcess.CommandLine -notmatch 'server\.mjs"?\s*$') { throw 'Cannot verify the old app process. Close the older Clever Read service, then launch again.' }
        Stop-Process -Id $savedServiceId -ErrorAction Stop
    }
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($nodeCommand) {
        $nodeExecutable = $nodeCommand.Source
    } else {
        $nodeExecutable = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
        if (-not (Test-Path -LiteralPath $nodeExecutable)) { throw 'Node.js 22+ is required. Install Node.js, then run this launcher again.' }
    }
    New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
    $serverArgument = '"' + (Join-Path $appDirectory 'server.mjs') + '"'
    $appProcess = Start-Process -FilePath $nodeExecutable -ArgumentList $serverArgument -WorkingDirectory $appDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDirectory 'server-output.log') -RedirectStandardError (Join-Path $runtimeDirectory 'server-error.log')
    $ready = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        if (Test-CleverRead) { $ready = $true; break }
        if ($appProcess.HasExited) { break }
        Start-Sleep -Milliseconds 250
    }
    if (-not $ready) { throw 'Clever Read could not start. Check port 4173 and .runtime/server-error.log.' }
    Set-Content -LiteralPath (Join-Path $runtimeDirectory 'server.pid') -Value $appProcess.Id
}
Start-Process $appUrl
