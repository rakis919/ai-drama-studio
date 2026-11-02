$ErrorActionPreference = 'Stop'
$studioNode = 'C:\Users\rakis\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
if (-not (Test-Path -LiteralPath $studioNode)) { $studioNode = (Get-Command node -ErrorAction Stop).Source }
$studioUrl = 'http://127.0.0.1:4173'
try { $null = Invoke-WebRequest -Uri $studioUrl -UseBasicParsing -TimeoutSec 2 }
catch {
  Start-Process -FilePath $studioNode -ArgumentList ('"' + (Join-Path $PSScriptRoot 'server.cjs') + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
  for ($studioAttempt = 0; $studioAttempt -lt 20; $studioAttempt++) {
    Start-Sleep -Milliseconds 200
    try { $null = Invoke-WebRequest -Uri $studioUrl -UseBasicParsing -TimeoutSec 1; break } catch {}
  }
}
Start-Process $studioUrl
