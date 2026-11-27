<#
  Dwenlite agent launcher for Windows.
  - Always downloads the newest agent first, so you never run an old one.
  - Restarts the agent if it crashes or the network drops.
  - With -Install it also starts by itself every time you sign in to Windows.

  Run in PowerShell (the Reconnect button in Dwenlite Home gives you this exact command with your keys filled in):
    .\dwenlite-start.ps1 -Device <id> -Token <key>                 # run now
    .\dwenlite-start.ps1 -Device <id> -Token <key> -Install        # run now AND at every sign-in
    .\dwenlite-start.ps1 -Uninstall                                # remove the automatic start
#>
param(
  [string]$Device,
  [string]$Token,
  [string]$Url = 'https://us-central1-leumas-decipher-softwares.cloudfunctions.net/homeApi',
  [string]$Site = 'https://www.dwenlite.space',
  [string]$NodeDir = '',          # folder that contains node.exe, if Node is not installed system-wide
  [switch]$NoShell,
  [switch]$NoGui,
  [switch]$Install,
  [switch]$Uninstall,
  [switch]$Hidden                 # used by the automatic start
)
$ErrorActionPreference = 'Stop'
$Folder = Join-Path $HOME 'dwenlite-agent'
$TaskName = 'DwenliteAgent'
New-Item -ItemType Directory -Force -Path $Folder | Out-Null

if ($Uninstall) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host 'Automatic start removed.'
  return
}
if (-not $Device -or -not $Token) { Write-Host 'Missing -Device or -Token. Copy the command from Dwenlite Home > Your devices > Reconnect.' -ForegroundColor Red; return }

# keep this script itself in the folder so the automatic start can call it
$self = Join-Path $Folder 'dwenlite-start.ps1'
if ($PSCommandPath -and ($PSCommandPath -ne $self)) { Copy-Item -Force $PSCommandPath $self }

if ($Install) {
  $argList = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$self`" -Device $Device -Token $Token -Url $Url -Site $Site -Hidden"
  if ($NodeDir) { $argList += " -NodeDir `"$NodeDir`"" }
  if ($NoShell) { $argList += ' -NoShell' }
  if ($NoGui) { $argList += ' -NoGui' }
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argList
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
  Write-Host 'Done: the agent will now start by itself every time you sign in. Run with -Uninstall to remove that.' -ForegroundColor Green
}

if ($NodeDir) { $env:Path = "$NodeDir;$env:Path" }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'Node.js was not found. Install it, or pass -NodeDir "C:\path\to\node-folder".' -ForegroundColor Red
  return
}

$agent = Join-Path $Folder 'dwenlite-agent.mjs'
$flags = @('--url', $Url, '--device', $Device, '--token', $Token)
if (-not $NoShell) { $flags += '--allow-shell' }
if (-not $NoGui) { $flags += '--allow-gui' }

while ($true) {
  try {
    Invoke-WebRequest -UseBasicParsing -Uri "$Site/dwenlite-agent.mjs" -OutFile "$agent.new"
    Move-Item -Force "$agent.new" $agent
  } catch {
    if (-not (Test-Path $agent)) { Write-Host "Could not download the agent: $($_.Exception.Message). Retrying in 15s..." -ForegroundColor Yellow; Start-Sleep 15; continue }
    Write-Host 'Could not check for a newer agent; using the one already here.' -ForegroundColor Yellow
  }
  & node $agent @flags
  if ($LASTEXITCODE -eq 2) { Write-Host 'This device was removed in Dwenlite Home, so the agent will not restart. Use Reconnect to get a new command.' -ForegroundColor Red; break }
  Write-Host 'The agent stopped. Restarting in 5 seconds (close this window to stop)...' -ForegroundColor Yellow
  Start-Sleep 5
}
