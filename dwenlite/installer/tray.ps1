# The Dwenlite icon near the clock: status, open Dwenlite Home, and Ctrl+Alt+D to ask something from anywhere.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName Microsoft.VisualBasic
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$mutex = New-Object System.Threading.Mutex($false, 'Local\DwenliteTray')
if (-not $mutex.WaitOne(0)) { exit 0 }
$cfgDir = Join-Path $env:APPDATA 'Dwenlite'
$site = 'https://www.dwenlite.space'

Add-Type -ReferencedAssemblies System.Windows.Forms -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;
public class DwenHotKey : NativeWindow {
  [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr h, int id, uint mod, uint vk);
  [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr h, int id);
  public event EventHandler Pressed;
  public DwenHotKey() { CreateHandle(new CreateParams()); }
  public bool Register(uint mod, uint vk) { return RegisterHotKey(Handle, 1, mod, vk); }
  protected override void WndProc(ref Message m) {
    if (m.Msg == 0x0312 && Pressed != null) { Pressed(this, EventArgs.Empty); }
    base.WndProc(ref m);
  }
  public void Close() { UnregisterHotKey(Handle, 1); DestroyHandle(); }
}
"@

function Get-Status {
  try { return (Get-Content -Path (Join-Path $cfgDir 'status.json') -Raw | ConvertFrom-Json) } catch { return $null }
}
function Describe-Status {
  $s = Get-Status
  if (-not $s) { return 'Dwenlite: helper not running' }
  $age = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - [int64]$s.updated
  if ($age -gt 20000) { return 'Dwenlite: helper not running' }
  if ($s.locked) { return 'Dwenlite: screen locked' }
  if ($s.busy) { return 'Dwenlite: working' }
  if ($s.connected) { return 'Dwenlite: ready' }
  return 'Dwenlite: not connected'
}

$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = New-Object System.Drawing.Icon (Join-Path $dir 'dwenlite.ico')
$notify.Text = 'Dwenlite'
$notify.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$itemStatus = $menu.Items.Add('Starting...')
$itemStatus.Enabled = $false
$menu.Items.Add('-') | Out-Null
$itemOpen = $menu.Items.Add('Open Dwenlite Home')
$itemAsk = $menu.Items.Add('Ask Dwenlite...   (Ctrl+Alt+D)')
$itemRestart = $menu.Items.Add('Restart the helper')
$menu.Items.Add('-') | Out-Null
$itemQuit = $menu.Items.Add('Hide this icon')
$notify.ContextMenuStrip = $menu

function Ask-Dwenlite {
  $t = [Microsoft.VisualBasic.Interaction]::InputBox('What should Dwenlite do?', 'Ask Dwenlite', '')
  if (-not $t -or -not $t.Trim()) { return }
  $s = Get-Status
  if (-not $s -or -not $s.port) { $notify.ShowBalloonTip(4000, 'Dwenlite', 'The helper is not running yet. Try again in a moment.', 'Warning'); return }
  try {
    $body = (@{ text = $t.Trim() } | ConvertTo-Json)
    Invoke-RestMethod -Method Post -Uri ("http://127.0.0.1:{0}/quick" -f $s.port) -Headers @{ 'X-Dwenlite' = $s.secret } -ContentType 'application/json' -Body $body | Out-Null
    $notify.ShowBalloonTip(4000, 'Dwenlite', 'On it. You will get a notification when it is done.', 'Info')
  } catch {
    $notify.ShowBalloonTip(5000, 'Dwenlite', 'Could not send that. Is this computer connected?', 'Warning')
  }
}
function Open-Home { Start-Process "$site/dwenlite-home" }

$itemOpen.add_Click({ Open-Home })
$itemAsk.add_Click({ Ask-Dwenlite })
$itemRestart.add_Click({
  Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*dwenlite-agent.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  $notify.ShowBalloonTip(3000, 'Dwenlite', 'Restarting the helper...', 'Info')
})
$itemQuit.add_Click({ $notify.Visible = $false; [System.Windows.Forms.Application]::Exit() })
$notify.add_MouseClick({ param($sender, $e) if ($e.Button -eq 'Left') { Open-Home } })

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 3000
$timer.add_Tick({
  $d = Describe-Status
  $itemStatus.Text = $d
  $notify.Text = $d.Substring(0, [Math]::Min(63, $d.Length))
})
$timer.Start()

$hotkey = New-Object DwenHotKey
$hotkey.add_Pressed({ Ask-Dwenlite })
$null = $hotkey.Register(3, 0x44)

[System.Windows.Forms.Application]::Run()
$hotkey.Close()
$notify.Dispose()
