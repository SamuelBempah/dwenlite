#!/usr/bin/env node
// Dwenlite Home agent: lets YOUR Dwenlite Home assistant act on THIS computer, only when you approve.
//
//   node dwenlite-agent.mjs --url <API URL> --device <ID> --token <TOKEN> [--root <folder>] [--allow-shell] [--allow-gui]
//
// - Needs Node 18 or newer. No other installs.
// - Safe by default: it can only read, write and list files inside the work folder (--root).
//   Running shell commands needs --allow-shell. Screenshots, mouse, keyboard and opening links need --allow-gui.
// - Every action is written to dwenlite-agent.log in the work folder.
// - Stop it any time with Ctrl+C. Delete the device in Dwenlite Home to revoke its token for good.
// - Run it as a normal (non-admin) user. Only run it on computers you own.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const VERSION = '1.3.1';
const MAX_OUT = 100000;      // characters of command output sent back
const MAX_READ = 200000;     // bytes read from a file
const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';

// ----------------------------------------------------------------------------- options
export function parseArgs(argv, env = process.env) {
  const o = { url: env.DWENLITE_URL || '', device: env.DWENLITE_DEVICE || '', token: env.DWENLITE_TOKEN || '', root: env.DWENLITE_ROOT || '', shell: false, gui: false, interval: 3000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') o.url = argv[++i];
    else if (a === '--device') o.device = argv[++i];
    else if (a === '--token') o.token = argv[++i];
    else if (a === '--root') o.root = argv[++i];
    else if (a === '--interval') o.interval = Math.max(1000, Number(argv[++i]) || 3000);
    else if (a === '--allow-shell') o.shell = true;
    else if (a === '--allow-gui') o.gui = true;
    else if (a === '--help' || a === '-h') o.help = true;
  }
  if (!o.root) o.root = path.join(os.homedir(), 'dwenlite-home');
  return o;
}

// ----------------------------------------------------------------------------- helpers
const clip = (t, n) => { const s = String(t ?? ''); return s.length > n ? s.slice(0, n) + `\n...[cut, ${s.length - n} more characters]` : s; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Resolve a path inside the work folder. Absolute paths and ".." are allowed only if they stay inside it.
export function safePath(root, p) {
  const realRoot = fs.realpathSync(root);
  const full = path.resolve(realRoot, p || '.');
  // follow symlinks of the nearest existing parent, so a link cannot lead outside the folder
  let probe = full;
  while (!fs.existsSync(probe)) { const up = path.dirname(probe); if (up === probe) break; probe = up; }
  const realProbe = fs.realpathSync(probe);
  const rel = path.relative(realRoot, realProbe);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('That path is outside the work folder (' + realRoot + ').');
  const relFull = path.relative(realRoot, full);
  if (relFull.startsWith('..') || path.isAbsolute(relFull)) throw new Error('That path is outside the work folder (' + realRoot + ').');
  return full;
}

export function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}
export function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
export const imageSize = (buf) => jpegSize(buf) || pngSize(buf);

function run(cmd, args, { timeout = 30000, input } = {}) {
  return new Promise((resolve, reject) => {
    const p = execFile(cmd, args, { timeout, maxBuffer: 20 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err) { err.stdout = stdout; err.stderr = stderr; return reject(err); }
      resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
    if (input) p.stdin.end(input);
  });
}
const have = async (cmd) => { try { await run(IS_WIN ? 'where' : 'which', [cmd], { timeout: 5000 }); return true; } catch { return false; } };

// ----------------------------------------------------------------------------- keys
const WIN_KEYS = { enter: '{ENTER}', return: '{ENTER}', tab: '{TAB}', esc: '{ESC}', escape: '{ESC}', backspace: '{BACKSPACE}', delete: '{DELETE}', del: '{DELETE}', up: '{UP}', down: '{DOWN}', left: '{LEFT}', right: '{RIGHT}', home: '{HOME}', end: '{END}', pageup: '{PGUP}', pgup: '{PGUP}', pagedown: '{PGDN}', pgdn: '{PGDN}', space: ' ', insert: '{INSERT}' };
const sendKeysEscape = (c) => ('+^%~(){}[]'.includes(c) ? `{${c}}` : c);
export function toSendKeys(combo) {
  const parts = String(combo).toLowerCase().split('+').map((s) => s.trim()).filter(Boolean);
  const key = parts.pop();
  let mods = '';
  for (const m of parts) {
    if (m === 'ctrl' || m === 'control') mods += '^';
    else if (m === 'alt') mods += '%';
    else if (m === 'shift') mods += '+';
    else throw new Error(`Modifier "${m}" is not supported on Windows (use ctrl, alt or shift).`);
  }
  let k;
  if (/^f([1-9]|1[0-6])$/.test(key)) k = `{${key.toUpperCase()}}`;
  else if (WIN_KEYS[key] !== undefined) k = WIN_KEYS[key];
  else if (key.length === 1) k = sendKeysEscape(key);
  else throw new Error(`Unknown key "${key}".`);
  return mods + k;
}
const XDO_KEYS = { enter: 'Return', return: 'Return', esc: 'Escape', escape: 'Escape', backspace: 'BackSpace', delete: 'Delete', del: 'Delete', pageup: 'Prior', pgup: 'Prior', pagedown: 'Next', pgdn: 'Next', space: 'space', tab: 'Tab', up: 'Up', down: 'Down', left: 'Left', right: 'Right', home: 'Home', end: 'End', insert: 'Insert', win: 'super', cmd: 'super', super: 'super', ctrl: 'ctrl', control: 'ctrl', alt: 'alt', shift: 'shift' };
export function toXdotool(combo) {
  return String(combo).toLowerCase().split('+').map((s) => s.trim()).filter(Boolean)
    .map((k) => XDO_KEYS[k] || (/^f([1-9]|1[0-2])$/.test(k) ? k.toUpperCase() : k)).join('+');
}
const MAC_CODES = { enter: 36, return: 36, tab: 48, esc: 53, escape: 53, backspace: 51, delete: 117, left: 123, right: 124, down: 125, up: 126, space: 49, home: 115, end: 119, pageup: 116, pgup: 116, pagedown: 121, pgdn: 121 };
export function toMacScript(combo) {
  const parts = String(combo).toLowerCase().split('+').map((s) => s.trim()).filter(Boolean);
  const key = parts.pop();
  const mods = parts.map((m) => ({ ctrl: 'control down', control: 'control down', alt: 'option down', option: 'option down', shift: 'shift down', cmd: 'command down', command: 'command down', win: 'command down', super: 'command down' }[m])).filter(Boolean);
  const using = mods.length ? ` using {${mods.join(', ')}}` : '';
  if (MAC_CODES[key] !== undefined) return `tell application "System Events" to key code ${MAC_CODES[key]}${using}`;
  if (key.length === 1) return `tell application "System Events" to keystroke "${key.replace(/["\\]/g, '\\$&')}"${using}`;
  throw new Error(`Unknown key "${key}".`);
}

// ----------------------------------------------------------------------------- Windows scripts
const PS_DPI = `Add-Type @"
using System; using System.Runtime.InteropServices;
public class DwenNative {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, UIntPtr e);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr e);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
[DwenNative]::SetProcessDPIAware() | Out-Null
`;
const PS_FIND = `Add-Type @"
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public class DwenEnum {
  delegate bool Cb(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(Cb cb, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  public static List<string> All() {
    var r = new List<string>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      int n = GetWindowTextLength(h); if (n == 0) return true;
      var sb = new StringBuilder(n + 1); GetWindowText(h, sb, n + 1);
      uint pid; GetWindowThreadProcessId(h, out pid);
      r.Add(h.ToInt64() + "|" + pid + "|" + sb.ToString());
      return true;
    }, IntPtr.Zero);
    return r;
  }
}
"@
function Get-Wins() {
  $out=@()
  foreach ($line in [DwenEnum]::All()) {
    $p=$line.Split('|',3)
    if ($p[2] -in @('Program Manager','Default IME','MSCTFIME UI','Windows Input Experience')) { continue }
    $name=''; try { $name=(Get-Process -Id ([int]$p[1]) -ErrorAction Stop).ProcessName } catch {}
    $out += [pscustomobject]@{ H=[IntPtr][int64]$p[0]; Title=$p[2]; Proc=$name }
  }
  return $out
}
function Is-Mine($w) { return ($w.Title -match 'Dwenlite Home|dwenlite\.space') }
function Find-Win([string]$App) {
  $a=$App.Trim().ToLower() -replace '^microsoft ',''
  $all=Get-Wins
  $allowMine = $a -like '*dwenlite*'
  $ok=$all | Where-Object { $allowMine -or -not (Is-Mine $_) }
  $hit=$ok | Where-Object { $_.Title.ToLower() -like "*$a*" } | Select-Object -First 1
  if (-not $hit) { $hit=$ok | Where-Object { $_.Proc.ToLower() -like "*$a*" } | Select-Object -First 1 }
  if (-not $hit) {
    $mine=$all | Where-Object { (Is-Mine $_) -and ($_.Title.ToLower() -like "*$a*" -or $_.Proc.ToLower() -like "*$a*") } | Select-Object -First 1
    $names=($ok | ForEach-Object { $_.Title } | Select-Object -First 15) -join '; '
    if ($mine) { Write-Error "The only '$App' window is the Dwenlite Home page itself, which is blocked. Open the link in a new window first (open_url), then use list_windows. Other windows: $names" }
    else { Write-Error "Could not find a window for '$App'. Open windows: $names" }
    exit 3
  }
  $script:FoundTitle=$hit.Title
  return $hit.H
}
`;
const PS_FOCUS = `param([string]$App)
${PS_DPI}
${PS_FIND}
$h=Find-Win $App
if ([DwenNative]::IsIconic($h)) { [DwenNative]::ShowWindow($h,9) | Out-Null }
[DwenNative]::keybd_event(0x12,0,0,[UIntPtr]::Zero); [DwenNative]::keybd_event(0x12,0,2,[UIntPtr]::Zero)
[DwenNative]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 400
`;
const PS_SHOT = `param([string]$Out,[int]$MaxW,[string]$App)
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
${PS_DPI}
${PS_FIND}
$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$offX=0; $offY=0
if ($App) {
  $hw=Find-Win $App
  $wasMin=[DwenNative]::IsIconic($hw)
  if ($wasMin) {
    [DwenNative]::ShowWindow($hw,4) | Out-Null
    for ($i=0; $i -lt 30 -and [DwenNative]::IsIconic($hw); $i++) { Start-Sleep -Milliseconds 100 }
    Start-Sleep -Milliseconds 700
  }
  $r=New-Object DwenNative+RECT
  [DwenNative]::GetWindowRect($hw,[ref]$r) | Out-Null
  $ww=[Math]::Max(50,$r.Right-$r.Left); $wh=[Math]::Max(50,$r.Bottom-$r.Top)
  $bmp=New-Object System.Drawing.Bitmap $ww,$wh
  $g=[System.Drawing.Graphics]::FromImage($bmp)
  $dc=$g.GetHdc()
  [DwenNative]::PrintWindow($hw,$dc,2) | Out-Null
  $g.ReleaseHdc($dc)
  # some programs return a blank picture; if so, copy the window's area from the screen instead (it was just restored)
  $blank=$true; $first=$bmp.GetPixel(1,1)
  foreach ($fx in 0.2,0.5,0.8) { foreach ($fy in 0.2,0.5,0.8) { if ($bmp.GetPixel([int]($ww*$fx),[int]($wh*$fy)).ToArgb() -ne $first.ToArgb()) { $blank=$false } } }
  if ($blank -and $r.Left -gt -30000) { $g.CopyFromScreen($r.Left,$r.Top,0,0,(New-Object System.Drawing.Size $ww,$wh)) }
  if ($wasMin) { [DwenNative]::ShowWindow($hw,7) | Out-Null }
  $offX=$r.Left; $offY=$r.Top
  $b=New-Object System.Drawing.Rectangle 0,0,$ww,$wh
} else {
  $bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height
  $g=[System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size)
}
$w=$b.Width; $h=$b.Height
if ($w -gt $MaxW) { $h=[int]($h*$MaxW/$w); $w=$MaxW }
$small=New-Object System.Drawing.Bitmap $w,$h
$g2=[System.Drawing.Graphics]::FromImage($small)
$g2.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g2.DrawImage($bmp,0,0,$w,$h)
$enc=[System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep=New-Object System.Drawing.Imaging.EncoderParameters 1
$ep.Param[0]=New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality),([int64]60)
$small.Save($Out,$enc,$ep)
Write-Output ("{0}x{1}x{2}x{3}|{4}" -f $b.Width,$b.Height,$offX,$offY,$script:FoundTitle)
`;
const PS_CLICK = `param([int]$X,[int]$Y,[string]$Button,[int]$Count)
${PS_DPI}
[DwenNative]::SetCursorPos($X,$Y) | Out-Null
Start-Sleep -Milliseconds 80
if ($Button -eq 'right') { $d=0x0008; $u=0x0010 } else { $d=0x0002; $u=0x0004 }
for ($i=0; $i -lt $Count; $i++) { [DwenNative]::mouse_event($d,0,0,0,[UIntPtr]::Zero); [DwenNative]::mouse_event($u,0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 70 }
`;
const PS_SCROLL = `param([int]$Amount)
${PS_DPI}
[DwenNative]::mouse_event(0x0800,0,0,[uint32]($Amount),[UIntPtr]::Zero)
`;
const PS_KEYS = `param([string]$Keys)
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait($Keys)
`;
const VK = { enter: 13, return: 13, tab: 9, esc: 27, escape: 27, backspace: 8, delete: 46, del: 46, up: 38, down: 40, left: 37, right: 39, home: 36, end: 35, pageup: 33, pgup: 33, pagedown: 34, pgdn: 34, space: 32, insert: 45, ctrl: 17, control: 17, alt: 18, shift: 16, win: 91 };
export function toVks(combo) {
  return String(combo).toLowerCase().split('+').map((s) => s.trim()).filter(Boolean).map((k) => {
    if (VK[k]) return VK[k];
    if (/^f([1-9]|1[0-2])$/.test(k)) return 111 + Number(k.slice(1));
    if (/^[a-z]$/.test(k)) return k.toUpperCase().charCodeAt(0);
    if (/^[0-9]$/.test(k)) return k.charCodeAt(0);
    throw new Error(`Unknown key "${k}".`);
  }).join(',');
}
// Background input: messages posted straight to the program's own window, so the real mouse/keyboard and focus are untouched.
const PS_BG = `param([string]$Action,[string]$App,[string]$TextB64,[string]$Vks,[int]$X,[int]$Y,[string]$Button,[int]$Count,[int]$Amount)
Add-Type @"
using System; using System.Runtime.InteropServices;
public class DwenBg {
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetGUIThreadInfo(uint tid, ref GUITHREADINFO i);
  [DllImport("user32.dll")] public static extern IntPtr ChildWindowFromPointEx(IntPtr h, POINT p, uint f);
  [DllImport("user32.dll")] public static extern bool ScreenToClient(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct GUITHREADINFO { public int cbSize, flags; public IntPtr hwndActive, hwndFocus, hwndCapture, hwndMenuOwner, hwndMoveSize, hwndCaret; public RECT rcCaret; }
}
"@
[DwenBg]::SetProcessDPIAware() | Out-Null
${PS_FIND}
$h=Find-Win $App
function Focus-Target($h) {
  $pid2=[uint32]0; $tid=[DwenBg]::GetWindowThreadProcessId($h,[ref]$pid2)
  $gi=New-Object DwenBg+GUITHREADINFO; $gi.cbSize=[Runtime.InteropServices.Marshal]::SizeOf($gi)
  if ([DwenBg]::GetGUIThreadInfo($tid,[ref]$gi) -and $gi.hwndFocus -ne [IntPtr]::Zero) { return $gi.hwndFocus }
  return $h
}
function Post($t,$m,$w,$l) { [DwenBg]::PostMessage($t,[uint32]$m,[IntPtr]$w,[IntPtr]$l) | Out-Null }
function Under($h,$sx,$sy) {
  $cur=$h
  for ($i=0; $i -lt 8; $i++) {
    $p=New-Object DwenBg+POINT; $p.X=$sx; $p.Y=$sy
    [DwenBg]::ScreenToClient($cur,[ref]$p) | Out-Null
    $c=[DwenBg]::ChildWindowFromPointEx($cur,$p,0x5)
    if ($c -eq [IntPtr]::Zero -or $c -eq $cur) { break }
    $cur=$c
  }
  return $cur
}
function Lp($t,$sx,$sy) { $p=New-Object DwenBg+POINT; $p.X=$sx; $p.Y=$sy; [DwenBg]::ScreenToClient($t,[ref]$p) | Out-Null; return ((($p.Y -band 0xFFFF) -shl 16) -bor ($p.X -band 0xFFFF)) }
switch ($Action) {
  'type' {
    $text=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($TextB64))
    $f=Focus-Target $h
    foreach ($ch in $text.ToCharArray()) {
      if ($ch -eq [char]10) { continue }
      if ($ch -eq [char]13) { Post $f 0x100 13 0; Post $f 0x102 13 0; Post $f 0x101 13 0 } else { Post $f 0x102 ([int]$ch) 0 }
      Start-Sleep -Milliseconds 6
    }
  }
  'key' {
    $f=Focus-Target $h
    $v=@($Vks.Split(',') | ForEach-Object { [int]$_ })
    foreach ($k in $v) { Post $f 0x100 $k 0 }
    if ($v.Count -eq 2 -and $v[0] -eq 17 -and $v[1] -ge 65 -and $v[1] -le 90) { Post $f 0x102 ($v[1]-64) 0 }
    [array]::Reverse($v)
    foreach ($k in $v) { Post $f 0x101 $k 0xC0000000 }
  }
  'click' {
    $t=Under $h $X $Y
    $lp=Lp $t $X $Y
    if ($Button -eq 'right') { $d=0x204; $u=0x205; $mk=2 } else { $d=0x201; $u=0x202; $mk=1 }
    Post $t 0x200 0 $lp
    for ($i=0; $i -lt $Count; $i++) { Post $t $d $mk $lp; Start-Sleep -Milliseconds 40; Post $t $u 0 $lp; Start-Sleep -Milliseconds 60; if ($Count -gt 1 -and $i -eq 0 -and $Button -ne 'right') { Post $t 0x203 $mk $lp } }
  }
  'scroll' {
    $f=Focus-Target $h
    $notch=[int]($Amount*120)
    $w=[int64](($notch -band 0xFFFF) -shl 16)
    Post $f 0x20A $w 0
  }
}
`;
const psFile = (name, content) => { const f = path.join(os.tmpdir(), `dwenlite-${name}.ps1`); fs.writeFileSync(f, content); return f; };
const ps = (file, args) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file, ...args], { timeout: 30000 });

// ----------------------------------------------------------------------------- the agent
export function createAgent(opts) {
  const root = opts.root;
  fs.mkdirSync(root, { recursive: true });
  const logFile = path.join(root, 'dwenlite-agent.log');
  const log = (m) => { const line = `${new Date().toISOString()} ${m}`; console.log(line); try { fs.appendFileSync(logFile, line + '\n'); } catch { /* ignore */ } };
  let lastShot = null; // sizes of the last screenshot, to turn screenshot pixels into real screen coordinates

  async function api(action, body) {
    const r = await fetch(opts.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, deviceId: opts.device, token: opts.token, ...body }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { const e = new Error('This device was removed or its token is wrong.'); e.fatal = true; throw e; }
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }

  const needShell = () => { if (!opts.shell) throw new Error('Shell commands are switched off on this device. Restart the agent with --allow-shell to enable them.'); };
  const needGui = () => { if (!opts.gui) throw new Error('Screen, mouse and keyboard control is switched off on this device. Restart the agent with --allow-gui to enable it.'); };

  // bring a named program to the front before typing/clicking in it
  const background = (a) => IS_WIN && a && a.app && !a.foreground;
  const bgRun = (action, a, extra) => ps(psFile('bg', PS_BG), ['-Action', action, '-App', String(a.app), ...extra]).catch((e) => { throw new Error((e.stderr || e.message).toString().replace(/\r?\n.*$/s, '').slice(0, 400)); });
  async function focusApp(a) {
    if (background(a)) return;
    const app = a && a.app ? String(a.app).trim() : '';
    if (!app) return;
    if (IS_WIN) { try { await ps(psFile('focus', PS_FOCUS), ['-App', app]); } catch (e) { throw new Error((e.stderr || e.message).toString().replace(/\r?\n.*$/s, '').slice(0, 400)); } }
    else if (IS_MAC) { await run('osascript', ['-e', `tell application "${app.replace(/["\\]/g, '')}" to activate`]); await new Promise((r) => setTimeout(r, 400)); }
    else if (await have('xdotool')) { try { await run('xdotool', ['search', '--name', app, 'windowactivate', '--sync']); } catch { /* keep going */ } }
  }

  // ---- actions ----
  const actions = {
    async system_info() {
      const info = { platform: process.platform, release: os.release(), arch: os.arch(), hostname: os.hostname(), user: os.userInfo().username, cpus: `${os.cpus().length} x ${(os.cpus()[0] || {}).model || ''}`.trim(),
        memory_total_gb: +(os.totalmem() / 1e9).toFixed(1), memory_free_gb: +(os.freemem() / 1e9).toFixed(1), uptime_hours: +(os.uptime() / 3600).toFixed(1), node: process.version, work_folder: root, shell_allowed: opts.shell, gui_allowed: opts.gui };
      try { if (!IS_WIN) info.disk = (await run('df', ['-h', root], { timeout: 5000 })).stdout.trim(); } catch { /* optional */ }
      return JSON.stringify(info, null, 2);
    },
    async list_dir(a) {
      const dir = safePath(root, a.path);
      const items = fs.readdirSync(dir, { withFileTypes: true }).slice(0, 300).map((d) => {
        let size = '', mtime = '';
        try { const st = fs.statSync(path.join(dir, d.name)); size = d.isFile() ? st.size : ''; mtime = st.mtime.toISOString().slice(0, 16); } catch { /* ignore */ }
        return `${d.isDirectory() ? 'dir ' : 'file'}  ${String(size).padStart(10)}  ${mtime}  ${d.name}`;
      });
      return `${dir}\n${items.join('\n') || '(empty)'}`;
    },
    async read_file(a) {
      const f = safePath(root, a.path);
      const st = fs.statSync(f);
      if (!st.isFile()) throw new Error('That is not a file.');
      const buf = fs.readFileSync(f).subarray(0, MAX_READ);
      if (buf.includes(0)) throw new Error('That looks like a binary file, not text.');
      return buf.toString('utf8') + (st.size > MAX_READ ? `\n...[file is ${st.size} bytes, showing the first ${MAX_READ}]` : '');
    },
    async write_file(a) {
      const f = safePath(root, a.path);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      (a.append ? fs.appendFileSync : fs.writeFileSync)(f, a.content, 'utf8');
      return `${a.append ? 'Appended to' : 'Wrote'} ${f} (${Buffer.byteLength(a.content)} bytes)`;
    },
    async shell(a) {
      needShell();
      const cwd = a.cwd ? safePath(root, a.cwd) : root;
      const timeout = Math.min(600, Math.max(1, Number(a.timeout_s) || 60)) * 1000;
      return new Promise((resolve) => {
        const child = IS_WIN
          ? spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', a.command], { cwd, windowsHide: true })
          : spawn('/bin/sh', ['-c', a.command], { cwd, detached: true });
        let out = '';
        const add = (d) => { if (out.length < MAX_OUT * 2) out += d.toString(); };
        child.stdout.on('data', add); child.stderr.on('data', add);
        let timedOut = false;
        const killer = setTimeout(() => {
          timedOut = true;
          try { if (IS_WIN) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']); else process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* gone */ } }
        }, timeout);
        child.on('error', (e) => { clearTimeout(killer); resolve(`Could not start the command: ${e.message}`); });
        child.on('close', (code) => { clearTimeout(killer); resolve(`${clip(out, MAX_OUT).trimEnd()}\n[exit code ${code}${timedOut ? `, stopped after ${timeout / 1000}s timeout` : ''}]`); });
      });
    },
    async list_windows() {
      needGui();
      if (!IS_WIN) {
        if (IS_MAC) return (await run('osascript', ['-e', 'tell application "System Events" to get name of every process whose background only is false'])).stdout.trim();
        return (await have('wmctrl')) ? (await run('wmctrl', ['-l'])).stdout.trim() : 'Listing windows needs wmctrl on Linux.';
      }
      const f = psFile('list', `${PS_FIND}\nGet-Wins | ForEach-Object { '{0}  [{1}]{2}' -f $_.Title,$_.Proc,$(if (Is-Mine $_) {'  (Dwenlite Home page: blocked as a target)'} else {''}) }`);
      const r = await ps(f, []);
      return r.stdout.trim() || '(no windows)';
    },
    async open_url(a) {
      needGui();
      if (!/^https?:\/\//i.test(a.url)) throw new Error('Only http and https links can be opened.');
      if (IS_WIN) {
        const script = `$u='${a.url.replace(/'/g, "''")}'
$id=''; try { $id=(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice' -ErrorAction Stop).ProgId } catch {}
$exe=$null; $arg='--new-window'
if ($id -like 'ChromeHTML*') { $exe='chrome' } elseif ($id -like 'MSEdgeHTM*') { $exe='msedge' } elseif ($id -like 'BraveHTML*') { $exe='brave' } elseif ($id -like 'FirefoxURL*') { $exe='firefox'; $arg='-new-window' }
if ($exe) { try { Start-Process $exe -ArgumentList $arg,$u -ErrorAction Stop; exit 0 } catch {} }
Start-Process $u`;
        await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
        return `Opened ${a.url} in a new browser window. Use list_windows to find its exact title.`;
      }
      else if (IS_MAC) await run('open', [a.url]);
      else spawn('xdg-open', [a.url], { detached: true, stdio: 'ignore' }).unref();
      return `Opened ${a.url}`;
    },
    async screenshot(a) {
      needGui();
      const out = path.join(os.tmpdir(), `dwenlite-shot-${Date.now()}.${IS_WIN || IS_MAC ? 'jpg' : 'png'}`);
      let shotTitle = ''; let offX = 0; let offY = 0; let screenW; let screenH; let pointsW; let pointsH; let file = out;
      try {
        if (IS_WIN) {
          const r = await ps(psFile('shot', PS_SHOT), ['-Out', out, '-MaxW', '1280', '-App', a.app ? String(a.app) : '']);
          const [dims, ttl] = r.stdout.trim().split('|'); [screenW, screenH, offX, offY] = dims.split('x').map(Number); shotTitle = (ttl || '').trim();
        } else if (IS_MAC) {
          await run('screencapture', ['-x', '-t', 'jpg', out]);
          const dims = await run('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', out]);
          screenW = Number(/pixelWidth:\s*(\d+)/.exec(dims.stdout)[1]); screenH = Number(/pixelHeight:\s*(\d+)/.exec(dims.stdout)[1]);
          await run('sips', ['-Z', '1280', '--setProperty', 'formatOptions', '60', out]);
          try { const b = await run('osascript', ['-e', 'tell application "Finder" to get bounds of window of desktop']); const n = b.stdout.trim().split(',').map((x) => Number(x.trim())); pointsW = n[2]; pointsH = n[3]; } catch { /* use pixels */ }
        } else {
          const tries = [['import', ['-window', 'root', out]], ['scrot', ['-o', out]], ['gnome-screenshot', ['-f', out]], ['grim', [out]]];
          let ok = false;
          for (const [cmd, args] of tries) { if (await have(cmd)) { try { await run(cmd, args); ok = true; break; } catch { /* try the next tool */ } } }
          if (!ok) throw new Error('No screenshot tool found. Install one of: imagemagick (import), scrot, gnome-screenshot or grim.');
          const sz = imageSize(fs.readFileSync(out)); screenW = sz.w; screenH = sz.h;
          const conv = (await have('magick')) ? ['magick', []] : (await have('convert')) ? ['convert', []] : null;
          if (conv && screenW > 1280) { const small = out.replace(/\.png$/, '-s.jpg'); await run(conv[0], [out, '-resize', '1280x', '-quality', '60', small]); file = small; }
        }
      } catch (e) {
        throw new Error('Screenshot failed: ' + (e.stderr || e.message).toString().trim().slice(0, 400));
      }
      const buf = fs.readFileSync(file);
      const sz = imageSize(buf) || { w: screenW, h: screenH };
      lastShot = { shotW: sz.w, shotH: sz.h, screenW: pointsW || screenW, screenH: pointsH || screenH, offX: offX || 0, offY: offY || 0 };
      try { fs.unlinkSync(out); if (file !== out) fs.unlinkSync(file); } catch { /* ignore */ }
      let text = '';
      try {
        const r = await api('agent_see', { image: buf.toString('base64'), mime: buf[0] === 0xff ? 'image/jpeg' : 'image/png', look: a.look, width: sz.w, height: sz.h });
        text = r.text;
      } catch (e) { text = `(The screenshot was taken but could not be read by the image model: ${e.message})`; }
      if (a.app && shotTitle) text = `[Captured window: "${shotTitle}"]\n${text}`;
      return { text, image: buf.length < 520000 ? buf.toString('base64') : '' };
    },
    async click(a) {
      needGui();
      const k = lastShot ? { x: lastShot.screenW / lastShot.shotW, y: lastShot.screenH / lastShot.shotH } : { x: 1, y: 1 };
      await focusApp(a);
      const x = Math.round(a.x * k.x) + (lastShot ? lastShot.offX : 0); const y = Math.round(a.y * k.y) + (lastShot ? lastShot.offY : 0);
      const count = a.double ? 2 : 1;
      if (background(a)) await bgRun('click', a, ['-X', String(x), '-Y', String(y), '-Button', a.button || 'left', '-Count', String(count)]);
      else if (IS_WIN) await ps(psFile('click', PS_CLICK), ['-X', String(x), '-Y', String(y), '-Button', a.button || 'left', '-Count', String(count)]);
      else if (IS_MAC) {
        if (await have('cliclick')) await run('cliclick', [`${a.button === 'right' ? 'rc' : a.double ? 'dc' : 'c'}:${x},${y}`]);
        else if (a.button === 'right') throw new Error('Right click on macOS needs cliclick (brew install cliclick).');
        else for (let i = 0; i < count; i++) await run('osascript', ['-e', `tell application "System Events" to click at {${x}, ${y}}`]);
      } else await run('xdotool', ['mousemove', String(x), String(y), 'click', '--repeat', String(count), '--delay', '80', a.button === 'right' ? '3' : '1']);
      return `Clicked (${a.x}, ${a.y})${background(a) ? ' in the background' : ''}${lastShot ? ` -> screen (${x}, ${y})` : ''}`;
    },
    async type_text(a) {
      needGui();
      await focusApp(a);
      if (background(a)) await bgRun('type', a, ['-TextB64', Buffer.from(a.text, 'utf8').toString('base64')]);
      else if (IS_WIN) await ps(psFile('keys', PS_KEYS), ['-Keys', a.text.split(/\r?\n/).map((part) => part.replace(/[+^%~(){}[\]]/g, (c) => `{${c}}`)).join('{ENTER}')]);
      else if (IS_MAC) await run('osascript', ['-e', `tell application "System Events" to keystroke "${a.text.replace(/["\\]/g, '\\$&')}"`]);
      else await run('xdotool', ['type', '--delay', '25', '--', a.text]);
      return `Typed ${a.text.length} characters${background(a) ? ' (sent in the background; check with a screenshot)' : ''}`;
    },
    async press_key(a) {
      needGui();
      await focusApp(a);
      if (background(a)) await bgRun('key', a, ['-Vks', toVks(a.keys)]);
      else if (IS_WIN) await ps(psFile('keys', PS_KEYS), ['-Keys', toSendKeys(a.keys)]);
      else if (IS_MAC) await run('osascript', ['-e', toMacScript(a.keys)]);
      else await run('xdotool', ['key', toXdotool(a.keys)]);
      return `Pressed ${a.keys}${background(a) ? ' (sent in the background; shortcuts can be ignored by some programs, check with a screenshot)' : ''}`;
    },
    async scroll(a) {
      needGui();
      await focusApp(a);
      const n = Math.max(1, Math.min(50, Number(a.amount) || 5));
      if (background(a)) await bgRun('scroll', a, ['-Amount', String((a.direction === 'up' ? 1 : -1) * n)]);
      else if (IS_WIN) await ps(psFile('scroll', PS_SCROLL), ['-Amount', String((a.direction === 'up' ? 1 : -1) * 120 * n)]);
      else if (IS_MAC) for (let i = 0; i < n; i++) await run('osascript', ['-e', `tell application "System Events" to key code ${a.direction === 'up' ? 126 : 125}`]);
      else await run('xdotool', ['click', '--repeat', String(n), '--delay', '40', a.direction === 'up' ? '4' : '5']);
      return `Scrolled ${a.direction} ${n}`;
    },
  };

  async function runJob(job) {
    const fn = actions[job.type];
    if (!fn) throw new Error(`Unknown action "${job.type}".`);
    const r = await fn(job.args || {});
    return typeof r === 'string' ? { text: r, image: '' } : r;
  }

  async function loop(stop = { stopped: false }) {
    log(`Dwenlite agent ${VERSION} started. Work folder: ${root}. Shell: ${opts.shell ? 'ON' : 'off'}. Screen/mouse/keyboard: ${opts.gui ? 'ON' : 'off'}.`);
    let fails = 0;
    while (!stop.stopped) {
      try {
        const { job } = await api('agent_poll', { platform: process.platform, hostname: os.hostname(), version: VERSION, caps: { shell: opts.shell, gui: opts.gui } });
        fails = 0;
        if (job) {
          log(`job ${job.id}: ${job.type} ${job.type === 'shell' ? clip(job.args.command, 200) : JSON.stringify(job.args).slice(0, 200)}`);
          let ok = true; let output = ''; let image = '';
          try { const r = await runJob(job); output = r.text; image = r.image || ''; } catch (e) { ok = false; output = e.message || String(e); }
          log(`job ${job.id}: ${ok ? 'done' : 'error'} - ${clip(output, 160).replace(/\n/g, ' ')}`);
          await api('agent_result', { jobId: job.id, ok, output, image });
          continue; // look for the next job straight away
        }
      } catch (e) {
        if (e.fatal) { log('STOPPED: ' + e.message); return; }
        fails++;
        log(`Cannot reach Dwenlite (${e.message}). Retrying...`);
        await sleep(Math.min(30000, 2000 * fails));
        continue;
      }
      await sleep(opts.interval);
    }
  }
  return { loop, actions, runJob, api, log };
}

// ----------------------------------------------------------------------------- start
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const o = parseArgs(process.argv.slice(2));
  if (o.help || !o.url || !o.device || !o.token) {
    console.log('Usage: node dwenlite-agent.mjs --url <API URL> --device <ID> --token <TOKEN> [--root <folder>] [--allow-shell] [--allow-gui] [--interval 3000]');
    process.exit(o.help ? 0 : 1);
  }
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 18) { console.error('Node 18 or newer is needed. You have ' + process.version); process.exit(1); }
  const agent = createAgent(o);
  const stop = { stopped: false };
  process.on('SIGINT', () => { stop.stopped = true; console.log('\nStopping...'); setTimeout(() => process.exit(0), 300); });
  agent.loop(stop);
}
