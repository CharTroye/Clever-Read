$ErrorActionPreference = 'Stop'
$appDirectory = $PSScriptRoot
$appUrl = 'http://127.0.0.1:4173'
function Test-CleverRead {
    try {
        $health = Invoke-RestMethod -Uri ($appUrl + '/api/health') -TimeoutSec 2
        return $health.ok -and $health.app -eq 'clever-read'
    } catch { return $false }
}
if (-not (Test-CleverRead)) {
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($nodeCommand) {
        $nodeExecutable = $nodeCommand.Source
    } else {
        $nodeExecutable = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
        if (-not (Test-Path -LiteralPath $nodeExecutable)) { throw 'Node.js 22+ is required. Install Node.js, then run this launcher again.' }
    }
    $runtimeDirectory = Join-Path $appDirectory '.runtime'
    New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
    $appProcess = Start-Process -FilePath $nodeExecutable -ArgumentList 'server.mjs' -WorkingDirectory $appDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDirectory 'server-output.log') -RedirectStandardError (Join-Path $runtimeDirectory 'server-error.log')
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
