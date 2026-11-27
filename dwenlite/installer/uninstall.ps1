# Removes Dwenlite from this computer (run by the uninstaller).
param([string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'Dwenlite'))
$ErrorActionPreference = 'SilentlyContinue'
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*Dwenlite*' -and $_.ProcessId -ne $PID -and ($_.Name -eq 'node.exe' -or $_.Name -eq 'powershell.exe' -or $_.Name -eq 'wscript.exe') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Sleep -Seconds 1
Remove-Item (Join-Path ([Environment]::GetFolderPath('Startup')) 'Dwenlite.lnk') -Force
Remove-Item (Join-Path ([Environment]::GetFolderPath('Programs')) 'Dwenlite (start the helper).lnk') -Force
Remove-Item (Join-Path ([Environment]::GetFolderPath('Programs')) 'Dwenlite Home.url') -Force
Remove-Item (Join-Path $env:APPDATA 'Dwenlite') -Recurse -Force
exit 0
