# Dwenlite installer (run by Dwenlite-Setup.exe, as you, no administrator needed).
param(
  [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'Dwenlite'),
  [string]$Code = '', # (the installer window asks for the code and pairs after this script)
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
  try { Set-Content -Path (Join-Path $InstallDir 'problem.txt') -Value $m } catch { }
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
    $idx = Invoke-RestMethod 'https://nodejs.org/dist/index.json' -TimeoutSec 60
    $ver = ($idx | Where-Object { $_.version -like 'v22.*' } | Select-Object -First 1).version
    if (-not $ver) { Fail 'Could not find the runtime to download. Check your internet connection and try again.' }
    $zip = Join-Path $env:TEMP "dwenlite-node-$ver.zip"
    $tmp = Join-Path $env:TEMP 'dwenlite-node-extract'
    Invoke-WebRequest "https://nodejs.org/dist/$ver/node-$ver-win-$arch.zip" -OutFile $zip -TimeoutSec 900
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
  Invoke-WebRequest "$Site/dwenlite-agent.mjs" -OutFile $agentFile -TimeoutSec 120

  # 3. start with Windows (a shortcut in your Startup folder: no administrator needed)
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
  Remove-Item (Join-Path $InstallDir 'problem.txt') -Force -ErrorAction SilentlyContinue
  Say 'Files are in place.'
  exit 0
} catch {
  Fail $_.Exception.Message
}
