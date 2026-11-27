# Keeps the Dwenlite helper running. If it stops for any reason it starts again a few seconds later.
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$mutex = New-Object System.Threading.Mutex($false, 'Local\DwenliteHelper')
if (-not $mutex.WaitOne(0)) { exit 0 }
$node = Join-Path $dir 'node\node.exe'
$agent = Join-Path $dir 'agent\dwenlite-agent.mjs'
$log = Join-Path $dir 'helper.log'
if ((Test-Path $log) -and ((Get-Item $log).Length -gt 2097152)) { Remove-Item $log -Force }
while ($true) {
  if (-not (Test-Path $node) -or -not (Test-Path $agent)) { Start-Sleep -Seconds 30; continue }
  & $node $agent run *>> $log
  $code = $LASTEXITCODE
  if ($code -eq 2) { break }
  if ($code -eq 1) { Start-Sleep -Seconds 60 } else { Start-Sleep -Seconds 5 }
}
