# Dwenlite installer (run by Dwenlite-Setup.exe, as you, no administrator needed).
param(
  [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'Dwenlite'),
  [string]$Code = '',
  [string]$Site = 'https://www.dwenlite.space'
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$log = Join-Path $InstallDir 'install.log'
function Say([string]$m) { Write-Host $m; Add-Content -Path $log -Value ("{0} {1}" -f (Get-Date -Format 'HH:mm:ss'), $m) }
function Fail([string]$m) {
  Say "PROBLEM: $m"
  try { Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show("Dwenlite could not finish setting up.`n`n$m`n`nMore details: $log", 'Dwenlite', 'OK', 'Error') | Out-Null } catch { }
  exit 1
}

try {
  New-Item -ItemType Directory -Force -Path (Join-Path $InstallDir 'agent') | Out-Null

  # 1. a small private copy of the runtime the helper needs (no administrator, nothing changes on your PC)
  $node = Join-Path $InstallDir 'node\node.exe'
  $ready = $false
  if (Test-Path $node) { try { $v = (& $node -v).TrimStart('v'); if ([int]$v.Split('.')[0] -ge 22) { $ready = $true } } catch { } }
  if (-not $ready) {
    Say 'Getting the helper runtime (one time, about 30 MB)...'
    $real = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
    $arch = if ($real -eq 'ARM64') { 'arm64' } else { 'x64' }
    $idx = Invoke-RestMethod 'https://nodejs.org/dist/index.json'
    $ver = ($idx | Where-Object { $_.version -like 'v22.*' } | Select-Object -First 1).version
    if (-not $ver) { Fail 'Could not find the runtime to download. Check your internet connection and try again.' }
    $zip = Join-Path $env:TEMP "dwenlite-node-$ver.zip"
    $tmp = Join-Path $env:TEMP 'dwenlite-node-extract'
    Invoke-WebRequest "https://nodejs.org/dist/$ver/node-$ver-win-$arch.zip" -OutFile $zip
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    $inner = Get-ChildItem $tmp -Directory | Select-Object -First 1
    $dest = Join-Path $InstallDir 'node'
    if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
    Move-Item $inner.FullName $dest
    Remove-Item $zip -Force -ErrorAction SilentlyContinue
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }

  # 2. the helper itself (it keeps itself up to date after this)
  Say 'Getting the latest Dwenlite helper...'
  $agentFile = Join-Path $InstallDir 'agent\dwenlite-agent.mjs'
  Invoke-WebRequest "$Site/dwenlite-agent.mjs" -OutFile $agentFile

  # 3. connect this computer to your account with the short code from Dwenlite Home
  $cfg = Join-Path $env:APPDATA 'Dwenlite\config.json'
  $paired = Test-Path $cfg
  if ($paired) { Say 'This computer is already connected.' }
  Add-Type -AssemblyName Microsoft.VisualBasic
  Add-Type -AssemblyName System.Windows.Forms
  $tries = 0
  while (-not $paired -and $tries -lt 5) {
    $tries++
    $c = $Code
    if (-not $c) {
      $c = [Microsoft.VisualBasic.Interaction]::InputBox("Open Dwenlite Home on your phone or in your browser, tap the computer button, then Add a computer. Type the code it shows here.`n`nLeave this empty to connect later.", 'Connect this computer to Dwenlite', '')
    }
    if (-not $c -or -not $c.Trim()) { break }
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $out = (& $node $agentFile pair $c.Trim() 2>&1 | Out-String).Trim()
    $okCode = $LASTEXITCODE
    $ErrorActionPreference = $prev
    Say $out
    if ($okCode -eq 0) { $paired = $true }
    else { $Code = ''; [System.Windows.Forms.MessageBox]::Show($out, 'Dwenlite', 'OK', 'Warning') | Out-Null }
  }
  if (-not $paired) { Say 'Not connected yet. Open Dwenlite from the Start menu later to connect.' }

  # 4. start with Windows (a shortcut in your Startup folder: no administrator needed) and run now
  $wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
  $launch = Join-Path $InstallDir 'launch.vbs'
  $icon = Join-Path $InstallDir 'dwenlite.ico'
  $shell = New-Object -ComObject WScript.Shell
  $lnk = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Startup')) 'Dwenlite.lnk'))
  $lnk.TargetPath = $wscript
  $lnk.Arguments = "`"$launch`""
  $lnk.IconLocation = $icon
  $lnk.WindowStyle = 7
  $lnk.Save()
  $menu = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Programs')) 'Dwenlite (start the helper).lnk'))
  $menu.TargetPath = $wscript
  $menu.Arguments = "`"$launch`""
  $menu.IconLocation = $icon
  $menu.Save()
  Set-Content -Path (Join-Path ([Environment]::GetFolderPath('Programs')) 'Dwenlite Home.url') -Value "[InternetShortcut]`r`nURL=$Site/dwenlite-home`r`nIconFile=$icon`r`nIconIndex=0"
  Remove-Item (Join-Path $env:APPDATA 'Dwenlite\removed.flag') -Force -ErrorAction SilentlyContinue
  Start-Process -FilePath $wscript -ArgumentList "`"$launch`""
  Say 'All set. Dwenlite now runs quietly in the background and starts when you sign in. Look for its icon near the clock.'
  if ($paired) {
    [System.Windows.Forms.MessageBox]::Show("Dwenlite is set up on this computer.`n`nIt runs quietly in the background. Look for its icon near the clock: click it to open Dwenlite Home, or press Ctrl+Alt+D to ask something from anywhere.", 'Dwenlite', 'OK', 'Information') | Out-Null
  } else {
    [System.Windows.Forms.MessageBox]::Show("Dwenlite is installed, but this computer is not connected to your account yet.`n`nOpen Dwenlite Home, tap Add a computer, then run Dwenlite (start the helper) from the Start menu... or run this installer again with the new code.", 'Dwenlite', 'OK', 'Information') | Out-Null
  }
  exit 0
} catch {
  Fail $_.Exception.Message
}
