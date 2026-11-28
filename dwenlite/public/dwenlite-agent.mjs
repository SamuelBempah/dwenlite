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
import net from 'node:net';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import dns from 'node:dns/promises';

export const VERSION = '2.12.0';
export const DEFAULT_URL = 'https://us-central1-leumas-decipher-softwares.cloudfunctions.net/homeApi';
export const SITE = 'https://www.dwenlite.space';
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
    else if (a === '--config-dir') o.configDir = argv[++i];
    else if (a === '--help' || a === '-h') o.help = true;
  }
  if (!o.root) o.root = path.join(os.homedir(), 'dwenlite-home');
  return o;
}

// ----------------------------------------------------------------------------- helpers
const clip = (t, n) => { const s = String(t ?? ''); return s.length > n ? s.slice(0, n) + `\n...[cut, ${s.length - n} more characters]` : s; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Resolve a path inside the work folder (or, for absolute paths, inside one of the extra folders the owner allowed).
function insideRoot(root, p) {
  const realRoot = fs.realpathSync(root);
  const full = path.resolve(realRoot, p || '.');
  // follow symlinks of the nearest existing parent, so a link cannot lead outside the folder
  let probe = full;
  while (!fs.existsSync(probe)) { const up = path.dirname(probe); if (up === probe) break; probe = up; }
  const realProbe = fs.realpathSync(probe);
  const rel = path.relative(realRoot, realProbe);
  const relFull = path.relative(realRoot, full);
  if (rel.startsWith('..') || path.isAbsolute(rel) || relFull.startsWith('..') || path.isAbsolute(relFull)) return null;
  return full;
}
export function safePath(root, p, extra = []) {
  const first = insideRoot(root, p);
  if (first) return first;
  if (p && path.isAbsolute(String(p))) {
    for (const r of extra) { try { const hit = insideRoot(r, p); if (hit) return hit; } catch { /* folder missing */ } }
  }
  const allowed = [fs.realpathSync(root), ...extra.filter((r) => { try { return fs.existsSync(r); } catch { return false; } })];
  throw new Error('That path is outside the folders you allowed (' + allowed.join(', ') + ').');
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

// ----------------------------------------------------------------------------- safety rails
// Commands that are refused no matter who asks (they can wreck a computer or run unreviewed downloads). Cannot be bypassed from chat.
const BLOCKED = [
  [/\brm\s+(-[a-z]*\s+)*-[a-z]*r[a-z]*\s+(-[a-z]+\s+)*(\/|~|\$home|\/\*|\*|\.\.?)(\s|$|;|&|\|)/i, 'deleting a whole folder tree from the root, home or a wildcard'],
  [/remove-item\b[^\n;|&]*-recurse[^\n;|&]*(\s|['"])([a-z]:\\?['"]?(\s|$)|\$home|~|\*|\\\*)/i, 'recursively deleting a drive or home folder'],
  [/\b(del|erase)\b[^\n;|&]*\/[a-z]*[sq][a-z]*[^\n;|&]*\s[a-z]:\\?(\s|$|\*)/i, 'deleting a whole drive'],
  [/\b(rd|rmdir)\b[^\n;|&]*\/s[^\n;|&]*\s[a-z]:\\?(\s|$)/i, 'deleting a whole drive'],
  [/\bformat(\.com)?\s+[a-z]:/i, 'formatting a drive'],
  [/\b(diskpart|bcdedit|mkfs(\.\w+)?|fdisk|parted)\b/i, 'disk or boot configuration tools'],
  [/\b(clear-disk|format-volume|remove-partition|initialize-disk)\b/i, 'disk wiping commands'],
  [/\bdd\s+[^\n;|&]*\bof=\/dev\//i, 'writing straight to a disk'],
  [/:\(\)\s*\{\s*:\|:&\s*\};:/, 'a fork bomb'],
  [/\b(shutdown|restart-computer|stop-computer|reboot|halt|poweroff)\b/i, 'shutting down or restarting the computer'],
  [/\breg(\.exe)?\s+delete\s+hk(lm|cr)\b/i, 'deleting system registry keys'],
  [/\bcipher\s+\/w/i, 'wiping free disk space'],
  [/\bchmod\s+-r\s+[0-7]+\s+\/(\s|$)/i, 'changing permissions on the whole system'],
  [/\b(curl|wget|iwr|invoke-webrequest|irm|invoke-restmethod)\b[^\n]*\|\s*(sh|bash|zsh|iex|invoke-expression|powershell|pwsh)\b/i, 'downloading and running code in one step'],
  [/\b(iex|invoke-expression)\b\s*\(?\s*\(?\s*(new-object\s+net\.webclient|iwr|irm|invoke-webrequest|invoke-restmethod)/i, 'downloading and running code in one step'],
];
export function dangerousCommand(cmd) {
  const text = String(cmd || '');
  for (const [re, why] of BLOCKED) if (re.test(text)) return why;
  return null;
}

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
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
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
const PS_HOME = `${PS_DPI}
${PS_FIND}
$mine=Get-Wins | Where-Object { Is-Mine $_ }
$hit=$mine | Where-Object { $_.Title -match 'Dwenlite Home' } | Select-Object -First 1
if (-not $hit) { $hit=$mine | Select-Object -First 1 }
if (-not $hit) { Write-Error 'The Dwenlite Home window was not found.'; exit 3 }
$h=$hit.H
if ([DwenNative]::IsIconic($h)) { [DwenNative]::ShowWindow($h,9) | Out-Null }
[DwenNative]::keybd_event(0x12,0,0,[UIntPtr]::Zero); [DwenNative]::keybd_event(0x12,0,2,[UIntPtr]::Zero)
[DwenNative]::SetForegroundWindow($h) | Out-Null
Write-Output $hit.Title
`;
// A continuous picture of the screen: one JPEG per line (base64) until the program is stopped.
const PS_STREAM = `param([int]$MaxW,[int]$Quality)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
${PS_DPI}
[DwenNative]::SetProcessDPIAware() | Out-Null
$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$w=$b.Width; $h=$b.Height
if ($w -gt $MaxW) { $h=[int]($h*$MaxW/$w); $w=$MaxW }
$bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height
$g=[System.Drawing.Graphics]::FromImage($bmp)
$small=New-Object System.Drawing.Bitmap $w,$h
$g2=[System.Drawing.Graphics]::FromImage($small)
$g2.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::Bilinear
$enc=[System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep=New-Object System.Drawing.Imaging.EncoderParameters 1
$ep.Param[0]=New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality),([int64]$Quality)
$ms=New-Object System.IO.MemoryStream
$out=[Console]::Out
while ($true) {
  $g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size)
  $g2.DrawImage($bmp,0,0,$w,$h)
  $ms.SetLength(0)
  $small.Save($ms,$enc,$ep)
  $out.WriteLine([Convert]::ToBase64String($ms.ToArray()))
  $out.Flush()
  Start-Sleep -Milliseconds 4
}
`;

const PS_SHOT = `param([string]$Out,[int]$MaxW,[string]$App)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
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
  if ($wasMin) { [DwenNative]::SetWindowPos($hw,[IntPtr]1,0,0,0,0,0x13) | Out-Null }  # keep it running: restored, but behind every other window
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
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
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
# a minimised program is paused by Windows: restore it without activating, then tuck it behind everything so it keeps running unseen
if ([DwenBg]::IsIconic($h)) { [DwenBg]::ShowWindow($h,4) | Out-Null; Start-Sleep -Milliseconds 500; [DwenBg]::SetWindowPos($h,[IntPtr]1,0,0,0,0,0x13) | Out-Null }
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

// ----------------------------------------------------------------------------- web search from this computer (a home connection is not blocked the way a cloud server is)
const decodeHtml = (s) => String(s).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const plain = (s) => decodeHtml(String(s).replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
export function parseBing(html) {
  const out = [];
  for (const b of String(html).split(/<li class="b_algo"/i).slice(1)) {
    const a = /<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(b);
    if (!a) continue;
    let url = '';
    try {
      const u = new URL(decodeHtml(a[1]), 'https://www.bing.com');
      const enc = u.searchParams.get('u');
      if (enc && /^a1/.test(enc)) url = Buffer.from(enc.slice(2).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      else if (!/(^|\.)bing\.com$/i.test(u.hostname)) url = u.toString();
    } catch { /* skip */ }
    if (!/^https?:\/\//i.test(url)) continue;
    const sn = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(b);
    out.push({ title: plain(a[2]), url, snippet: plain(sn ? sn[1] : '') });
    if (out.length >= 8) break;
  }
  return out;
}
export function parseDuck(html) {
  const out = [];
  const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g;
  let m;
  while ((m = re.exec(String(html))) && out.length < 8) {
    let url = decodeHtml(m[1]);
    const u = /[?&]uddg=([^&]+)/.exec(url);
    if (u) { try { url = decodeURIComponent(u[1]); } catch { /* keep */ } }
    if (/^\/\//.test(url)) url = 'https:' + url;
    if (!/^https?:\/\//i.test(url)) continue;
    out.push({ title: plain(m[2]), url, snippet: plain(m[3] || '') });
  }
  return out;
}
const SEARCH_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
export async function webSearch(q, fetchFn = fetch) {
  const get = async (url) => { const r = await fetchFn(url, { headers: { 'User-Agent': SEARCH_UA, 'Accept-Language': 'en-US,en;q=0.9' }, signal: AbortSignal.timeout(12000) }); return r.text(); };
  const [d, b] = await Promise.allSettled([
    get('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q)).then(parseDuck),
    get('https://www.bing.com/search?setlang=en&cc=us&q=' + encodeURIComponent(q)).then(parseBing),
  ]);
  const seen = new Set();
  const all = [...(b.status === 'fulfilled' ? b.value : []), ...(d.status === 'fulfilled' ? d.value : [])].filter((x) => x.url && !seen.has(x.url) && seen.add(x.url)).slice(0, 8);
  if (!all.length) throw new Error('No results came back from the search engines. Try different words, or use the browser tool.');
  return all.map((s, i) => `[${i + 1}] ${s.title}\n${s.url}\n${s.snippet}`).join('\n\n');
}

// ----------------------------------------------------------------------------- the assistant's own browser (Chrome DevTools Protocol, no extra software)
class Cdp {
  constructor(wsUrl) { this.url = wsUrl; this.id = 0; this.pending = new Map(); this.handlers = new Map(); }
  open() {
    return new Promise((resolve, reject) => {
      if (typeof WebSocket === 'undefined') return reject(new Error('The built-in browser needs Node.js 22 or newer.'));
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error('Could not talk to the browser.'));
      this.ws.onclose = () => { for (const [, p] of this.pending) p.reject(new Error('The browser closed.')); this.pending.clear(); this.closed = true; };
      this.ws.onmessage = (m) => {
        let j; try { j = JSON.parse(m.data); } catch { return; }
        if (j.id && this.pending.has(j.id)) { const p = this.pending.get(j.id); this.pending.delete(j.id); j.error ? p.reject(new Error(j.error.message || 'Browser error')) : p.resolve(j.result || {}); }
        else if (j.method && this.handlers.has(j.method)) for (const f of [...this.handlers.get(j.method)]) f(j.params || {});
      };
    });
  }
  send(method, params = {}, timeout = 20000) {
    return new Promise((resolve, reject) => {
      if (this.closed) return reject(new Error('The browser closed.'));
      const id = ++this.id;
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`Browser did not answer (${method}).`)); }, timeout);
      this.pending.set(id, { resolve: (r) => { clearTimeout(t); resolve(r); }, reject: (e) => { clearTimeout(t); reject(e); } });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  once(method, timeout = 15000) {
    return new Promise((resolve) => {
      const set = this.handlers.get(method) || new Set(); this.handlers.set(method, set);
      const t = setTimeout(() => { set.delete(f); resolve(false); }, timeout);
      const f = () => { clearTimeout(t); set.delete(f); resolve(true); };
      set.add(f);
    });
  }
  on(method, f) { const set = this.handlers.get(method) || new Set(); this.handlers.set(method, set); set.add(f); return () => set.delete(f); }
  close() { try { this.ws && this.ws.close(); } catch { /* ignore */ } }
}

function findBrowser() {
  if (process.env.DWENLITE_BROWSER && fs.existsSync(process.env.DWENLITE_BROWSER)) return process.env.DWENLITE_BROWSER;
  const w = process.env;
  const list = IS_WIN
    ? [`${w['ProgramFiles']}\\Google\\Chrome\\Application\\chrome.exe`, `${w['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`, `${w.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`, `${w['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`, `${w['ProgramFiles']}\\Microsoft\\Edge\\Application\\msedge.exe`, `${w['ProgramFiles']}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`]
    : IS_MAC
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', '/Applications/Chromium.app/Contents/MacOS/Chromium']
      : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium', '/usr/bin/microsoft-edge', '/usr/bin/brave-browser'];
  return list.find((p) => p && fs.existsSync(p)) || '';
}

const READ_SCRIPT = `(() => {
  document.querySelectorAll('[data-dw]').forEach((e) => e.removeAttribute('data-dw'));
  const sel = 'a[href],button,input,textarea,select,summary,[role=button],[role=link],[role=checkbox],[role=tab],[role=menuitem],[role=option],[onclick],[contenteditable=true]';
  const vis = (e) => { const r = e.getBoundingClientRect(); if (r.width < 3 || r.height < 3) return false; const s = getComputedStyle(e); return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'; };
  const els = [...document.querySelectorAll(sel)].filter(vis).slice(0, 150);
  const clip = (t, n) => String(t || '').replace(/\\s+/g, ' ').trim().slice(0, n);
  const lines = els.map((e, i) => {
    e.setAttribute('data-dw', String(i + 1));
    const tag = e.tagName.toLowerCase();
    const label = clip(e.getAttribute('aria-label') || e.innerText || e.value || e.getAttribute('title') || e.getAttribute('alt') || '', 70);
    if (tag === 'input' || tag === 'textarea') return '[' + (i + 1) + '] ' + (tag === 'input' ? 'input[' + (e.type || 'text') + ']' : 'textarea') + ' ' + (clip(e.placeholder || e.getAttribute('name') || e.getAttribute('aria-label'), 50) ? 'placeholder/name "' + clip(e.placeholder || e.getAttribute('name') || e.getAttribute('aria-label'), 50) + '"' : '') + (e.type === 'checkbox' || e.type === 'radio' ? (e.checked ? ' (checked)' : ' (unchecked)') : e.value && e.type !== 'password' ? ' value "' + clip(e.value, 40) + '"' : '');
    if (tag === 'select') return '[' + (i + 1) + '] select "' + clip(e.options[e.selectedIndex] && e.options[e.selectedIndex].text, 40) + '"';
    if (tag === 'a') return '[' + (i + 1) + '] link "' + label + '" -> ' + clip(e.getAttribute('href'), 80);
    return '[' + (i + 1) + '] ' + tag + ' "' + label + '"';
  });
  return { title: document.title, url: location.href, y: Math.round(scrollY), h: document.documentElement.scrollHeight, vh: innerHeight, text: clip((document.body && document.body.innerText || '').replace(/\\n{3,}/g, '\\n\\n'), 100000).slice(0, 7000), raw: (document.body && document.body.innerText || '').replace(/[ \\t]+/g, ' ').replace(/\\n{3,}/g, '\\n\\n').slice(0, 7000), lines };
})()`;

const KEYMAP = { enter: ['Enter', 'Enter', 13], return: ['Enter', 'Enter', 13], tab: ['Tab', 'Tab', 9], esc: ['Escape', 'Escape', 27], escape: ['Escape', 'Escape', 27], backspace: ['Backspace', 'Backspace', 8], delete: ['Delete', 'Delete', 46], up: ['ArrowUp', 'ArrowUp', 38], down: ['ArrowDown', 'ArrowDown', 40], left: ['ArrowLeft', 'ArrowLeft', 37], right: ['ArrowRight', 'ArrowRight', 39], home: ['Home', 'Home', 36], end: ['End', 'End', 35], pageup: ['PageUp', 'PageUp', 33], pagedown: ['PageDown', 'PageDown', 34], space: [' ', 'Space', 32] };
const EDIT_CMDS = { a: 'selectAll', c: 'copy', v: 'paste', x: 'cut', z: 'undo', y: 'redo' };

export function createBrowser({ root, api, log, see }) {
  let proc = null; let browserWs = null; let page = null; let visible = false;
  const profile = path.join(root, '.browser-profile');

  async function httpJson(port, p, method = 'GET') {
    const r = await fetch(`http://127.0.0.1:${port}${p}`, { method });
    if (!r.ok) throw new Error(`Browser control error ${r.status}`);
    return r.json();
  }

  async function launch(wantVisible) {
    const exe = findBrowser();
    if (!exe) throw new Error('No Chrome, Edge or Brave was found on this computer. Install one of them (or set DWENLITE_BROWSER to its path).');
    fs.mkdirSync(profile, { recursive: true });
    try { fs.unlinkSync(path.join(profile, 'DevToolsActivePort')); } catch { /* none */ }
    const args = ['--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-features=Translate,MediaRouter', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--window-size=1280,900', '--remote-allow-origins=*', '--disable-blink-features=AutomationControlled', '--lang=en-US'];
    if (!wantVisible) args.push('--headless=new', '--hide-scrollbars', '--mute-audio');
    if (!IS_WIN && !IS_MAC && process.getuid && process.getuid() === 0) args.push('--no-sandbox');
    args.push('about:blank');
    proc = spawn(exe, args, { stdio: 'ignore', detached: false, windowsHide: !wantVisible });
    proc.on('exit', () => { proc = null; page = null; });
    visible = wantVisible;
    let port = 0;
    for (let i = 0; i < 100 && !port; i++) {
      await sleep(150);
      try { port = Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); } catch { /* not yet */ }
      if (!proc) throw new Error('The browser closed right after starting. Close other windows that use the same profile and try again.');
    }
    if (!port) throw new Error('The browser did not start in time.');
    return port;
  }

  let portCache = 0;
  async function ensurePage(wantVisible) {
    if (proc && visible !== wantVisible) await closeAll();
    if (!proc) { portCache = await launch(wantVisible); page = null; }
    if (page && !page.closed) return page;
    const list = (await httpJson(portCache, '/json/list')).filter((t) => t.type === 'page');
    const t = list[0] || await httpJson(portCache, '/json/new?about:blank', 'PUT');
    page = new Cdp(t.webSocketDebuggerUrl);
    await page.open();
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    if (!wantVisible) await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    // look like an ordinary browser: many sites (Google, for one) refuse anything that calls itself HeadlessChrome or reports webdriver
    try {
      const ver = await page.send('Browser.getVersion');
      await page.send('Emulation.setUserAgentOverride', { userAgent: String(ver.userAgent || '').replace('HeadlessChrome', 'Chrome'), acceptLanguage: 'en-US,en;q=0.9' });
      await page.send('Page.addScriptToEvaluateOnNewDocument', { source: "Object.defineProperty(navigator,'webdriver',{get:()=>false});" });
    } catch { /* optional */ }
    return page;
  }

  async function closeAll() {
    try { page && page.close(); } catch { /* ignore */ }
    page = null;
    if (proc) { try { proc.kill(); } catch { /* ignore */ } proc = null; await sleep(300); }
  }

  const evalJs = async (p, expression) => {
    const r = await p.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('The page raised an error: ' + clip((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text, 200));
    return r.result && r.result.value;
  };
  const settle = async (p, ms = 900) => { await Promise.race([p.once('Page.loadEventFired', 6000), sleep(ms)]); await sleep(300); };

  async function read(p) {
    const r = await evalJs(p, READ_SCRIPT);
    const pos = r.h > r.vh ? ` (scrolled ${r.y}px of ${r.h - r.vh}px)` : '';
    const blocked = /unusual traffic|are you a robot|verify you are human|captcha|before you continue to google|access denied|enable javascript and cookies/i.test((r.raw || '').slice(0, 1500)) ? '\nNOTE: this looks like a cookie notice or a bot check. Click the accept button if it is a cookie notice. If it is a bot check, do not fight it: use web_search, or a different site such as duckduckgo.com or bing.com.\n' : '';
    return `PAGE: ${r.title || '(no title)'}\nURL: ${r.url}${pos}${blocked}\n\nTEXT:\n${r.raw || '(no visible text)'}\n\nELEMENTS (use the number with click or type):\n${r.lines.join('\n') || '(none)'}`;
  }

  async function press(p, combo) {
    const parts = String(combo).toLowerCase().split('+').map((x) => x.trim()).filter(Boolean);
    const key = parts.pop();
    let mods = 0;
    for (const m of parts) mods |= ({ alt: 1, ctrl: 2, control: 2, meta: 4, cmd: 4, win: 4, shift: 8 })[m] || 0;
    let k = KEYMAP[key];
    if (!k && /^f([1-9]|1[0-2])$/.test(key)) k = [key.toUpperCase(), key.toUpperCase(), 111 + Number(key.slice(1))];
    if (!k && key.length === 1) k = [mods & 8 ? key.toUpperCase() : key, /[a-z]/.test(key) ? 'Key' + key.toUpperCase() : /[0-9]/.test(key) ? 'Digit' + key : '', key.toUpperCase().charCodeAt(0)];
    if (!k) throw new Error(`Unknown key "${key}".`);
    const base = { modifiers: mods, key: k[0], code: k[1], windowsVirtualKeyCode: k[2], nativeVirtualKeyCode: k[2] };
    const text = !(mods & 3) && (k[0].length === 1 || k[0] === 'Enter') ? (k[0] === 'Enter' ? '\r' : k[0]) : undefined;
    const commands = (mods & 2) && EDIT_CMDS[key] ? [EDIT_CMDS[key]] : undefined;
    await p.send('Input.dispatchKeyEvent', { ...base, type: text ? 'keyDown' : 'rawKeyDown', text, commands });
    await p.send('Input.dispatchKeyEvent', { ...base, type: 'keyUp' });
  }

  async function elementPoint(p, n) {
    const pt = await evalJs(p, `(() => { const e = document.querySelector('[data-dw="${n}"]'); if (!e) return null; e.scrollIntoView({ block: 'center', inline: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (!pt) throw new Error(`Element ${n} was not found. The page changed: call read again and use the new numbers.`);
    return pt;
  }

  async function run(a) {
    const act = a.action;
    if (act === 'close') { await closeAll(); return 'Browser closed.'; }
    if (act === 'logins') { const n = vaultNames(root); return n.length ? 'Saved logins (passwords stay on this computer):\n' + n.map((x) => `- ${x.name} (${x.host})`).join('\n') : 'No logins are saved. The owner adds them on this computer with: node dwenlite-agent.mjs vault add'; }
    if (act === 'view') { // the owner looking at, and helping in, the private browser (to sign in, solve a check, and so on)
      if (!proc || !page || page.closed) return { text: JSON.stringify({ open: false }), image: '' };
      const p = page; const op = String(a.op || 'frame');
      if (op === 'tap') {
        const x = Math.max(0, Number(a.x) || 0), y = Math.max(0, Number(a.y) || 0);
        await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
        await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
        await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
        await settle(p, 700);
      } else if (op === 'text') { await p.send('Input.insertText', { text: String(a.text || '').slice(0, 2000) }); await sleep(200); }
      else if (op === 'key') { await press(p, String(a.key || 'enter')); await settle(p, 900); }
      else if (op === 'scroll') { await evalJs(p, `window.scrollBy(0, ${Math.max(-3000, Math.min(3000, Number(a.dy) || 0))})`); await sleep(250); }
      else if (op === 'back') { await evalJs(p, 'history.back()'); await settle(p, 900); }
      const meta = await evalJs(p, '({ w: innerWidth, h: innerHeight, url: location.href, title: document.title })');
      const shot = await p.send('Page.captureScreenshot', { format: 'jpeg', quality: 55 });
      return { text: JSON.stringify({ open: true, w: meta.w, h: meta.h, url: String(meta.url).slice(0, 300), title: String(meta.title).slice(0, 120) }), image: shot.data.length < 650000 ? shot.data : '' };
    }
    const p = await ensurePage(!!a.visible);
    if (act === 'open') {
      const loaded = p.once('Page.loadEventFired', 20000);
      const nav = await p.send('Page.navigate', { url: a.url });
      if (nav.errorText) throw new Error(`Could not open the page: ${nav.errorText}`);
      await loaded; await sleep(600);
      return await read(p);
    }
    if (act === 'read') return await read(p);
    if (act === 'tabs') {
      const list = (await httpJson(portCache, '/json/list')).filter((t) => t.type === 'page');
      return list.map((t, i) => `${i + 1}. ${t.title || '(no title)'} - ${t.url}`).join('\n') || '(no tabs)';
    }
    if (act === 'login') {
      const cred = await vaultGet(root, String(a.site || ''));
      const pageUrl = new URL(await evalJs(p, 'location.href'));
      if (!hostMatches(pageUrl.hostname, cred.host)) throw new Error(`This saved login is for ${cred.host}, but the page is on ${pageUrl.hostname}. Open the right site first.`);
      const found = await evalJs(p, `(() => { const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 3 && r.height > 3 && s.visibility !== 'hidden' && s.display !== 'none'; }; document.querySelectorAll('[data-dwl]').forEach((e) => e.removeAttribute('data-dwl')); const pw = [...document.querySelectorAll('input[type=password]')].find(vis); if (!pw) return { ok: false }; const scope = pw.form || document; const cand = [...scope.querySelectorAll('input')].filter((e) => vis(e) && /^(text|email|tel|)$/i.test(e.type)); let user = null; for (const c of cand) { if (c.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING) user = c; } if (!user) user = cand[0] || null; pw.setAttribute('data-dwl', 'p'); if (user) user.setAttribute('data-dwl', 'u'); return { ok: true, hasUser: !!user }; })()`);
      if (!found || !found.ok) throw new Error('No password box was found on this page. Open the sign-in page first, then use login again.');
      const fill = async (key, value) => { await evalJs(p, `(() => { const e = document.querySelector('[data-dwl="${key}"]'); e.scrollIntoView({ block: 'center' }); e.focus(); if (e.select) e.select(); })()`); await p.send('Input.insertText', { text: value }); };
      if (found.hasUser) await fill('u', cred.user);
      await fill('p', cred.pass);
      if (a.submit) { await press(p, 'enter'); await settle(p, 1800); }
      return `Filled in the saved login "${a.site}"${a.submit ? ' and pressed Enter' : ''}. (The username and password were typed in without being shown.)\n\n${await read(p)}`;
    }
    if (act === 'click') {
      const pt = await elementPoint(p, a.element);
      await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
      await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
      await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
      await settle(p, 1200);
      return await read(p);
    }
    if (act === 'type') {
      const ok = await evalJs(p, `(() => { const e = document.querySelector('[data-dw="${a.element}"]'); if (!e) return false; e.scrollIntoView({ block: 'center' }); e.focus(); if (e.select) { try { e.select(); } catch (x) {} } else if (e.isContentEditable) { document.execCommand('selectAll'); } return true; })()`);
      if (!ok) throw new Error(`Element ${a.element} was not found. Call read again and use the new numbers.`);
      await p.send('Input.insertText', { text: a.text });
      if (a.submit) { await press(p, 'enter'); await settle(p, 1500); }
      return await read(p);
    }
    if (act === 'press') { await press(p, a.keys); await settle(p, 900); return await read(p); }
    if (act === 'scroll') { await evalJs(p, `window.scrollBy(0, ${a.direction === 'up' ? -1 : 1} * Math.round(innerHeight * 0.8))`); await sleep(300); return await read(p); }
    if (act === 'back') { await evalJs(p, 'history.back()'); await settle(p, 1200); return await read(p); }
    if (act === 'screenshot') {
      const shot = await p.send('Page.captureScreenshot', { format: 'jpeg', quality: 60 });
      const buf = Buffer.from(shot.data, 'base64');
      const sz = imageSize(buf) || { w: 1280, h: 900 };
      let text = '';
      try { text = (await (see || ((x) => api('agent_see', x)))({ image: shot.data, mime: 'image/jpeg', look: a.look, width: sz.w, height: sz.h })).text; } catch (e) { text = `(The screenshot was taken but could not be read by the image model: ${e.message})`; }
      return { text, image: buf.length < 520000 ? shot.data : '' };
    }
    throw new Error(`Unknown browser action "${act}".`);
  }

  // ---- a live picture of the browser: the browser pushes a new frame whenever the page changes ----
  async function screencast(onFrame, q = {}) {
    if (!proc || !page || page.closed) return null;
    const p = page;
    const off = p.on('Page.screencastFrame', (f) => { onFrame(f); p.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
    await p.send('Page.startScreencast', { format: 'jpeg', quality: q.quality || 55, maxWidth: q.maxWidth || 1100, maxHeight: q.maxHeight || 1100, everyNthFrame: 1 });
    return () => { off(); p.send('Page.stopScreencast').catch(() => {}); };
  }
  const isOpen = () => !!(proc && page && !page.closed);
  async function pageInfo() { if (!isOpen()) return null; try { return await evalJs(page, '({ w: innerWidth, h: innerHeight, url: location.href, title: document.title, editable: !!(document.activeElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable)) })'); } catch { return null; } }
  async function input(a) { // what the owner does in the live view
    if (!isOpen()) return;
    const p = page; const op = String(a.op || '');
    if (op === 'tap') { const x = Math.max(0, Number(a.x) || 0), y = Math.max(0, Number(a.y) || 0); await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); }
    else if (op === 'text') await p.send('Input.insertText', { text: String(a.text || '').slice(0, 2000) });
    else if (op === 'key') await press(p, String(a.key || 'enter'));
    else if (op === 'scroll') await evalJs(p, `window.scrollBy(0, ${Math.max(-3000, Math.min(3000, Number(a.dy) || 0))})`);
    else if (op === 'back') await evalJs(p, 'history.back()');
    else if (op === 'forward') await evalJs(p, 'history.forward()');
    else if (op === 'reload') await p.send('Page.reload', {});
    else if (op === 'resize') { if (!visible) await p.send('Emulation.setDeviceMetricsOverride', { width: Math.max(320, Math.min(2560, Number(a.w) || 1280)), height: Math.max(320, Math.min(2000, Number(a.h) || 900)), deviceScaleFactor: 1, mobile: false }); }
    else if (op === 'go') { const u = String(a.url || ''); if (/^https?:\/\/[^\s]+$/i.test(u)) await p.send('Page.navigate', { url: u }); }
  }

  return { run, close: closeAll, screencast, isOpen, pageInfo, input };
}

// ----------------------------------------------------------------------------- other devices: Android phones over USB or Wi-Fi debugging, and things on the local network
const ADB_HINT = 'No Android device is connected. On the phone: Settings > About phone > tap "Build number" 7 times, then Settings > Developer options > turn on USB debugging (plug it in and accept the prompt) or Wireless debugging (then use pair/connect with the IP and port shown there).';
const KEYS_ANDROID = { home: 'KEYCODE_HOME', back: 'KEYCODE_BACK', recents: 'KEYCODE_APP_SWITCH', recent: 'KEYCODE_APP_SWITCH', enter: 'KEYCODE_ENTER', power: 'KEYCODE_POWER', wake: 'KEYCODE_WAKEUP', volume_up: 'KEYCODE_VOLUME_UP', volume_down: 'KEYCODE_VOLUME_DOWN', mute: 'KEYCODE_VOLUME_MUTE', delete: 'KEYCODE_DEL', backspace: 'KEYCODE_DEL', tab: 'KEYCODE_TAB', up: 'KEYCODE_DPAD_UP', down: 'KEYCODE_DPAD_DOWN', left: 'KEYCODE_DPAD_LEFT', right: 'KEYCODE_DPAD_RIGHT', menu: 'KEYCODE_MENU', search: 'KEYCODE_SEARCH', play_pause: 'KEYCODE_MEDIA_PLAY_PAUSE', camera: 'KEYCODE_CAMERA' };
// extra things that are never run on a phone
const ANDROID_BLOCKED = [[/\b(wipe|factory.?reset|masterclear)\b/i, 'a factory reset'], [/\brecovery\s+--wipe/i, 'wiping the phone'], [/\breboot\b[^\n]*(bootloader|recovery|fastboot)/i, 'rebooting into the bootloader or recovery'], [/\bflash(ing)?\b/i, 'flashing firmware'], [/\bsvc\s+power\s+shutdown\b/i, 'shutting the phone down']];
export function dangerousAndroid(cmd) { const t = String(cmd || ''); for (const [re, why] of ANDROID_BLOCKED) if (re.test(t)) return why; return dangerousCommand(t); }

export function parseAdbDevices(out) {
  return String(out).split(/\r?\n/).slice(1).map((l) => l.trim()).filter((l) => l && !l.startsWith('*')).map((l) => {
    const m = /^(\S+)\s+(\S+)\s*(.*)$/.exec(l); if (!m) return null;
    const model = /model:(\S+)/.exec(m[3]); return { serial: m[1], state: m[2], model: model ? model[1].replace(/_/g, ' ') : '', wifi: /:\d+$/.test(m[1]) };
  }).filter(Boolean);
}
const xmlAttr = (node, name) => { const m = new RegExp(`${name}="([^"]*)"`).exec(node); return m ? decodeHtml(m[1]) : ''; };
// the phone's own screen description (uiautomator): every button, field and label with its position, no picture needed
export function parseUiXml(xml) {
  const out = [];
  for (const node of String(xml).match(/<node [^>]*>/g) || []) {
    const text = xmlAttr(node, 'text') || xmlAttr(node, 'content-desc');
    const clickable = xmlAttr(node, 'clickable') === 'true' || xmlAttr(node, 'long-clickable') === 'true' || /EditText|Button|Switch|CheckBox|Tab/.test(xmlAttr(node, 'class'));
    const b = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(xmlAttr(node, 'bounds'));
    if (!b || (!text && !clickable) || xmlAttr(node, 'enabled') === 'false') continue;
    const [x1, y1, x2, y2] = b.slice(1).map(Number);
    if (x2 - x1 < 4 || y2 - y1 < 4) continue;
    const cls = xmlAttr(node, 'class').split('.').pop();
    out.push({ n: out.length + 1, kind: /EditText/.test(cls) ? 'field' : clickable ? 'button' : 'text', text: text.slice(0, 80), hint: xmlAttr(node, 'resource-id').split('/').pop(), x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2), checked: xmlAttr(node, 'checked') === 'true' });
    if (out.length >= 140) break;
  }
  return out;
}

function ipv4Hosts() {
  const hosts = [];
  for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) {
    if (i.family !== 'IPv4' || i.internal || !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.address)) continue;
    const p = i.address.split('.').map(Number);
    for (let n = 1; n < 255; n++) if (n !== p[3]) hosts.push(`${p[0]}.${p[1]}.${p[2]}.${n}`);
  }
  return [...new Set(hosts)].slice(0, 1024);
}
function probePort(host, port, ms = 450) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port }); let done = false;
    const fin = (ok) => { if (!done) { done = true; try { s.destroy(); } catch { /* ignore */ } resolve(ok); } };
    s.setTimeout(ms); s.on('connect', () => fin(true)); s.on('timeout', () => fin(false)); s.on('error', () => fin(false));
  });
}
export async function scanHosts(hosts, ports) {
  const found = []; let i = 0;
  await Promise.all(Array.from({ length: 96 }, async () => {
    while (i < hosts.length) {
      const h = hosts[i++]; const open = [];
      for (const p of ports) if (await probePort(h, p)) open.push(p);
      if (open.length) found.push({ ip: h, ports: open });
    }
  }));
  return found.sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }));
}
const PORT_NAMES = { 22: 'ssh', 80: 'web', 443: 'web (https)', 554: 'camera/stream', 5555: 'android debug', 8008: 'chromecast', 8080: 'web', 9100: 'printer', 1883: 'mqtt', 3389: 'remote desktop', 445: 'windows share', 62078: 'iphone' };

// ----------------------------------------------------------------------------- coding helpers
// A small line diff (longest common subsequence) so a file change can be reviewed before it is written.
export function lineDiff(oldText, newText, context = 2) {
  const a = String(oldText).split('\n'); const b = String(newText).split('\n');
  if (a.length > 2500 || b.length > 2500) return `Large file: ${a.length} lines before, ${b.length} lines after.`;
  const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = []; let i = 0; let j = 0;
  while (i < a.length && j < b.length) { if (a[i] === b[j]) { ops.push([' ', a[i]]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) ops.push(['-', a[i++]]); else ops.push(['+', b[j++]]); }
  while (i < a.length) ops.push(['-', a[i++]]); while (j < b.length) ops.push(['+', b[j++]]);
  const keep = new Set();
  ops.forEach((o, k) => { if (o[0] !== ' ') for (let d = -context; d <= context; d++) keep.add(k + d); });
  const out = []; let last = -2;
  ops.forEach((o, k) => { if (!keep.has(k)) return; if (k > last + 1 && out.length) out.push('...'); out.push(o[0] + ' ' + o[1]); last = k; });
  const added = ops.filter((o) => o[0] === '+').length; const removed = ops.filter((o) => o[0] === '-').length;
  return added || removed ? `+${added} -${removed}\n${out.join('\n')}` : 'No changes: the file already has this content.';
}
const GIT_REF = /^[\w./~^@{}-]{1,100}$/;
export function detectTestCommand(dir) {
  const has = (f) => fs.existsSync(path.join(dir, f));
  if (has('package.json')) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      const t = pkg.scripts && pkg.scripts.test;
      if (t && !/no test specified/i.test(t)) return has('pnpm-lock.yaml') ? 'pnpm test' : has('yarn.lock') ? 'yarn test' : 'npm test';
    } catch { /* fall through */ }
  }
  if (has('pytest.ini') || has('tox.ini') || has('pyproject.toml') || has('setup.cfg') || has('tests') || has('test')) return IS_WIN ? 'python -m pytest -q' : 'python3 -m pytest -q';
  if (has('go.mod')) return 'go test ./...';
  if (has('Cargo.toml')) return 'cargo test';
  if (has('pom.xml')) return 'mvn -q test';
  if (has('build.gradle') || has('build.gradle.kts')) return IS_WIN ? 'gradlew.bat test' : './gradlew test';
  return '';
}

// ----------------------------------------------------------------------------- documents: write and read Word, Excel, PDF and CSV files directly (no Office needed)
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

export function zipFiles(files) { // files: [{ name, data: string|Buffer }]
  const parts = []; const central = []; let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8'); const raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8');
    const data = zlib.deflateRawSync(raw); const crc = crc32(raw);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x21, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    parts.push(lh, name, data);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10); ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x21, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    central.push(ch, name);
    offset += lh.length + name.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}
export function unzipFiles(buf) { // -> Map(name -> Buffer)
  let e = buf.length - 22; while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('That is not a valid Office file (zip).');
  const count = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16); const out = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10); const csize = buf.readUInt32LE(p + 20); const nlen = buf.readUInt16LE(p + 28); const elen = buf.readUInt16LE(p + 30); const clen = buf.readUInt16LE(p + 32); const lho = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    const lnlen = buf.readUInt16LE(lho + 26); const lelen = buf.readUInt16LE(lho + 28); const start = lho + 30 + lnlen + lelen;
    const data = buf.subarray(start, start + csize);
    if (!name.endsWith('/')) out.set(name, method === 8 ? zlib.inflateRawSync(data) : Buffer.from(data));
    p += 46 + nlen + elen + clen;
  }
  return out;
}
const xe = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unx = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&');

// blocks: { type: 'heading', level, text } | { type: 'paragraph', text, bold } | { type: 'bullets', items } | { type: 'numbered', items } | { type: 'table', rows, header }
function docxBody(blocks) {
  const run = (t, bold) => `<w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${xe(t)}</w:t></w:r>`;
  const para = (t, style, bold, extra = '') => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${extra}</w:pPr>${run(t, bold)}</w:p>`;
  const out = [];
  for (const b of blocks) {
    if (b.type === 'heading') out.push(para(b.text, b.level === 0 ? 'Title' : `Heading${Math.min(3, Math.max(1, b.level || 1))}`));
    else if (b.type === 'bullets') (b.items || []).forEach((i) => out.push(para(`• ${i}`, '', false, '<w:ind w:left="540" w:hanging="270"/>')));
    else if (b.type === 'numbered') (b.items || []).forEach((i, n) => out.push(para(`${n + 1}. ${i}`, '', false, '<w:ind w:left="540" w:hanging="360"/>')));
    else if (b.type === 'table') {
      const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`).join('');
      out.push(`<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${borders}</w:tblBorders></w:tblPr>${(b.rows || []).map((r, ri) => `<w:tr>${r.map((c) => `<w:tc><w:tcPr>${b.header && ri === 0 ? '<w:shd w:val="clear" w:color="auto" w:fill="E7E6E6"/>' : ''}</w:tcPr>${para(c, '', b.header && ri === 0)}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>${para('')}`);
    } else out.push(para(b.text ?? '', '', !!b.bold));
  }
  return out.join('');
}
export function makeDocx(blocks) {
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const style = (id, name, size, bold) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="${size}"/></w:rPr></w:style>`;
  return zipFiles([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name: 'word/styles.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${style('Title', 'Title', 52, true)}${style('Heading1', 'heading 1', 36, true)}${style('Heading2', 'heading 2', 30, true)}${style('Heading3', 'heading 3', 26, true)}</w:styles>` },
    { name: 'word/document.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${docxBody(blocks)}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>` },
  ]);
}
const colName = (n) => { let s = ''; for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
export function makeXlsx(sheets) {
  const list = (sheets && sheets.length ? sheets : [{ name: 'Sheet1', rows: [] }]).slice(0, 20).map((s, i) => ({ name: String(s.name || `Sheet${i + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31), rows: s.rows || [] }));
  const sheetXml = (rows) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => { const ref = colName(ci) + (ri + 1); if (v === null || v === undefined || v === '') return ''; if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`; if (typeof v === 'boolean') return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`; const t = String(v); if (t.startsWith('=')) return `<c r="${ref}"><f>${xe(t.slice(1))}</f></c>`; return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xe(t)}</t></is></c>`; }).join('')}</row>`).join('')}</sheetData></worksheet>`;
  return zipFiles([
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${list.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${list.map((s, i) => `<sheet name="${xe(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' },
    ...list.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s.rows) })),
  ]);
}
const latin = (s) => String(s ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/•/g, '*').replace(/[^\x20-\x7e\xa0-\xff]/g, '?');
const pdfEsc = (s) => latin(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
export function makePdf(blocks) {
  const PW = 595; const PH = 842; const M = 56; const maxW = PW - 2 * M;
  const pages = [[]]; let y = PH - M;
  const size = (b) => (b.type === 'heading' ? [24, 20, 16, 14][Math.min(3, b.level || 1)] : 11);
  const wrap = (text, fs, bold) => { const cw = fs * (bold ? 0.56 : 0.5); const per = Math.max(10, Math.floor(maxW / cw)); const lines = []; for (const para of latin(text).split('\n')) { let cur = ''; for (const w of para.split(' ')) { if ((cur + ' ' + w).trim().length > per && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); } lines.push(cur); } return lines; };
  const put = (text, fs, bold, indent = 0) => { for (const line of wrap(text, fs, bold)) { if (y - fs < M) { pages.push([]); y = PH - M; } pages[pages.length - 1].push(`BT /${bold ? 'F2' : 'F1'} ${fs} Tf ${M + indent} ${y - fs} Td (${pdfEsc(line)}) Tj ET`); y -= fs * 1.4; } y -= fs * 0.3; };
  for (const b of blocks) {
    if (b.type === 'heading') put(b.text, size(b), true);
    else if (b.type === 'bullets') (b.items || []).forEach((i) => put(`* ${i}`, 11, false, 14));
    else if (b.type === 'numbered') (b.items || []).forEach((i, n) => put(`${n + 1}. ${i}`, 11, false, 14));
    else if (b.type === 'table') (b.rows || []).forEach((r, ri) => put(r.join('  |  '), 10, !!(b.header && ri === 0)));
    else put(b.text ?? '', 11, !!b.bold);
  }
  const objs = []; const add = (s) => { objs.push(s); return objs.length; };
  add('<< /Type /Catalog /Pages 2 0 R >>'); add(''); // 1 catalog, 2 pages (filled below)
  const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'); const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids = pages.map((p) => { const c = add(`<< /Length ${Buffer.byteLength(p.join('\n'), 'latin1')} >>\nstream\n${p.join('\n')}\nendstream`); return add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`); });
  objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}
export function readDocx(buf) {
  const files = unzipFiles(buf); const doc = files.get('word/document.xml'); if (!doc) throw new Error('No document text found in that file.');
  const xml = doc.toString('utf8'); const out = [];
  for (const m of xml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g)) {
    const t = (frag) => unx([...frag.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g)].map((x) => (x[1] !== undefined ? x[1] : ' ')).join(''));
    if (m[0].startsWith('<w:tbl>')) out.push([...m[0].matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].map((r) => [...r[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((c) => t(c[0])).join(' | ')).join('\n'));
    else { const s = t(m[0]); const h = /<w:pStyle w:val="(Title|Heading(\d))"/.exec(m[0]); out.push(h ? `${'#'.repeat(h[1] === 'Title' ? 1 : Number(h[2]))} ${s}` : s); }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
export function readXlsx(buf, maxRows = 200) {
  const files = unzipFiles(buf);
  const shared = files.has('xl/sharedStrings.xml') ? [...files.get('xl/sharedStrings.xml').toString('utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => unx([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(''))) : [];
  const names = files.has('xl/workbook.xml') ? [...files.get('xl/workbook.xml').toString('utf8').matchAll(/<sheet [^>]*name="([^"]*)"/g)].map((m) => unx(m[1])) : [];
  const out = [];
  [...files.keys()].filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.match(/(\d+)\.xml/)[1], 10) - parseInt(b.match(/(\d+)\.xml/)[1], 10)).forEach((n, i) => {
    const xml = files.get(n).toString('utf8'); const rows = [];
    for (const r of xml.matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)) {
      if (rows.length >= maxRows) break;
      const cells = [];
      for (const c of r[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = /r="([A-Z]+)\d+"/.exec(c[1]); const col = ref ? ref[1].split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1 : cells.length;
        const type = /t="(\w+)"/.exec(c[1]); const body = c[2] || '';
        let v = /<v>([\s\S]*?)<\/v>/.exec(body); v = v ? unx(v[1]) : '';
        if (type && type[1] === 'b') v = v === '1' ? 'true' : 'false';
        else if (type && type[1] === 's') v = shared[Number(v)] ?? ''; else if (type && type[1] === 'inlineStr') v = unx([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(''));
        else if (!v) { const f = /<f[^>]*>([\s\S]*?)<\/f>/.exec(body); if (f) v = '=' + unx(f[1]); }
        while (cells.length < col) cells.push(''); cells[col] = v;
      }
      rows.push(cells.join('\t'));
    }
    out.push(`## ${names[i] || `Sheet${i + 1}`}\n${rows.join('\n')}`);
  });
  return out.join('\n\n');
}
export function readPdf(buf) { // best effort: simple PDFs written by common tools
  const text = buf.toString('latin1'); const parts = [];
  for (const m of text.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let data = Buffer.from(m[1], 'latin1'); try { data = zlib.inflateSync(data); } catch { /* not compressed */ }
    const s = data.toString('latin1');
    for (const t of s.matchAll(/\[((?:\\.|[^\]])*)\]\s*TJ|\(((?:\\.|[^)])*)\)\s*Tj/g)) {
      const raw = t[1] !== undefined ? [...t[1].matchAll(/\(((?:\\.|[^)])*)\)/g)].map((x) => x[1]).join('') : t[2];
      parts.push(raw.replace(/\\([()\\])/g, '$1').replace(/\\n/g, ' '));
    }
  }
  const out = parts.join('\n').trim();
  if (!out) throw new Error('No text could be read from that PDF (it may be scanned images, or use an unusual format).');
  return out;
}
export const toCsv = (rows) => (rows || []).map((r) => r.map((v) => { const t = String(v ?? ''); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; }).join(',')).join('\r\n');

// ----------------------------------------------------------------------------- login vault: passwords stay on THIS computer, encrypted, and are never sent to the server or the AI
const vaultFile = (root) => path.join(root, '.vault.json');
const b64 = (b) => Buffer.from(b).toString('base64');
async function psProtect(plain, decrypt) {
  const script = `Add-Type -AssemblyName System.Security; if ($env:DW_MODE -eq 'enc') { [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($env:DW_IN), $null, 'CurrentUser')) } else { [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($env:DW_IN), $null, 'CurrentUser')) }`;
  return await new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { env: { ...process.env, DW_IN: plain, DW_MODE: decrypt ? 'dec' : 'enc' }, windowsHide: true }, (err, out) => (err ? reject(new Error('Windows could not protect the password.')) : resolve(out.replace(/\r?\n$/, ''))));
  });
}
async function vaultKey() { // macOS: the Keychain; elsewhere: a private key file next to your home folder
  if (IS_MAC) {
    try { return Buffer.from((await run('security', ['find-generic-password', '-a', 'dwenlite', '-s', 'dwenlite-vault', '-w'])).stdout.trim(), 'base64'); } catch { /* make one */ }
    const k = crypto.randomBytes(32); await run('security', ['add-generic-password', '-a', 'dwenlite', '-s', 'dwenlite-vault', '-w', k.toString('base64')]); return k;
  }
  const f = process.env.DWENLITE_VAULT_KEY_FILE || path.join(os.homedir(), '.dwenlite-vault.key');
  if (fs.existsSync(f)) return Buffer.from(fs.readFileSync(f, 'utf8').trim(), 'base64');
  const k = crypto.randomBytes(32); fs.writeFileSync(f, k.toString('base64'), { mode: 0o600 }); return k;
}
async function seal(plain) {
  if (IS_WIN) return psProtect(plain, false);
  const key = await vaultKey(); const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]); return b64(Buffer.concat([iv, c.getAuthTag(), ct]));
}
async function unseal(enc) {
  if (IS_WIN) return psProtect(enc, true);
  const key = await vaultKey(); const raw = Buffer.from(enc, 'base64'); const d = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12)); d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
}
const loadVault = (root) => { try { return JSON.parse(fs.readFileSync(vaultFile(root), 'utf8')); } catch { return { v: 1, entries: {} }; } };
const hostOf = (h) => String(h || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
export async function vaultSet(root, { name, host, user, pass }) {
  if (!/^[\w .-]{1,40}$/.test(name || '')) throw new Error('Use a short name (letters, numbers, spaces).');
  if (!hostOf(host) || !user || !pass) throw new Error('A website, a username and a password are needed.');
  const v = loadVault(root); v.entries[name] = { host: hostOf(host), user: await seal(user), pass: await seal(pass) };
  fs.mkdirSync(root, { recursive: true }); fs.writeFileSync(vaultFile(root), JSON.stringify(v), { mode: 0o600 });
}
export function vaultNames(root) { return Object.entries(loadVault(root).entries).map(([name, e]) => ({ name, host: e.host })); }
export async function vaultGet(root, name) { const e = loadVault(root).entries[name]; if (!e) throw new Error(`There is no saved login called "${name}". Saved logins: ${vaultNames(root).map((x) => x.name).join(', ') || 'none'}. Add one on the computer with: node dwenlite-agent.mjs vault add`); return { host: e.host, user: await unseal(e.user), pass: await unseal(e.pass) }; }
export function vaultRemove(root, name) { const v = loadVault(root); if (!v.entries[name]) return false; delete v.entries[name]; fs.writeFileSync(vaultFile(root), JSON.stringify(v), { mode: 0o600 }); return true; }
export const hostMatches = (pageHost, vaultHost) => { const p = hostOf(pageHost); const h = hostOf(vaultHost); return p === h || p.endsWith('.' + h); };

// ----------------------------------------------------------------------------- read and use Windows programs by their buttons and fields (UI Automation), no screenshots
const PS_UI = `param([string]$Action,[string]$App,[string]$Ct,[string]$Name,[string]$AutoId,[int]$Nth,[string]$TextB64)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
${PS_FIND}
$h = Find-Win $App
$AE = [System.Windows.Automation.AutomationElement]
$root = $AE::FromHandle($h)
function Ct-Name($e) { return $e.Current.ControlType.ProgrammaticName -replace '^ControlType\\.','' }
function Find-El() {
  $conds = New-Object 'System.Collections.Generic.List[System.Windows.Automation.Condition]'
  if ($Ct) { $ctObj = [System.Windows.Automation.ControlType].GetField($Ct).GetValue($null); $conds.Add((New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, $ctObj))) }
  if ($Name) { $conds.Add((New-Object System.Windows.Automation.PropertyCondition($AE::NameProperty, $Name))) }
  if ($AutoId) { $conds.Add((New-Object System.Windows.Automation.PropertyCondition($AE::AutomationIdProperty, $AutoId))) }
  if ($conds.Count -eq 0) { Write-Error 'No element was given.'; exit 4 }
  $c = if ($conds.Count -eq 1) { $conds[0] } else { New-Object System.Windows.Automation.AndCondition($conds.ToArray()) }
  $found = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $c)
  if ($found.Count -le $Nth) { Write-Error 'That element is no longer there. Read the window again.'; exit 4 }
  return $found.Item($Nth)
}
switch ($Action) {
  'read' {
    $keep = @('Button','CheckBox','ComboBox','Edit','Hyperlink','ListItem','MenuItem','RadioButton','TabItem','Text','Document','TreeItem','Slider','Spinner','SplitButton')
    $all = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    $out = @(); $seen = @{}; $n = 0
    for ($i = 0; $i -lt $all.Count -and $out.Count -lt 220 -and $i -lt 4000; $i++) {
      $e = $all.Item($i)
      try {
        $ct = Ct-Name $e
        if ($keep -notcontains $ct) { continue }
        if ($e.Current.IsOffscreen -or -not $e.Current.IsEnabled) { continue }
        $name = [string]$e.Current.Name; $id = [string]$e.Current.AutomationId
        if ($ct -eq 'Text' -and $name.Length -lt 2) { continue }
        $key = "$ct|$name|$id"; $nth = 0; if ($seen.ContainsKey($key)) { $nth = $seen[$key] }; $seen[$key] = $nth + 1
        $val = ''
        try { $vp = $e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern); $val = [string]$vp.Current.Value } catch {}
        $chk = ''
        try { $tp = $e.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern); $chk = [string]$tp.Current.ToggleState } catch {}
        if ($val.Length -gt 80) { $val = $val.Substring(0,80) }
        $n++
        $out += [pscustomobject]@{ n = $n; ct = $ct; name = $name; id = $id; nth = $nth; value = $val; state = $chk }
      } catch {}
    }
    Write-Output '###JSON'
    Write-Output (ConvertTo-Json -InputObject @($out) -Compress -Depth 3)
  }
  'click' {
    $e = Find-El
    foreach ($p in @('InvokePattern','TogglePattern','SelectionItemPattern','ExpandCollapsePattern')) {
      try {
        $pt = ([type]"System.Windows.Automation.$p").GetField('Pattern').GetValue($null)
        $pat = $e.GetCurrentPattern($pt)
        if ($p -eq 'InvokePattern') { $pat.Invoke() } elseif ($p -eq 'TogglePattern') { $pat.Toggle() } elseif ($p -eq 'SelectionItemPattern') { $pat.Select() } else { $pat.Expand() }
        Write-Output "OK $p"; exit 0
      } catch {}
    }
    Write-Error 'That control cannot be pressed this way. Try the mouse tools with a screenshot instead.'; exit 5
  }
  'type' {
    $e = Find-El
    $text = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($TextB64))
    try { $vp = $e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern); $vp.SetValue($text); Write-Output 'OK value' }
    catch { Write-Error 'That field does not accept text this way (some editors, like the Word page itself, need real typing: use type_text with the app name).'; exit 5 }
  }
  'focus' { $e = Find-El; $e.SetFocus(); Write-Output 'OK focus' }
}
`;

// ----------------------------------------------------------------------------- finding files, checking the computer, GitHub
// "~Documents" style shortcuts in the allowed folders list point at the user's usual folders.
export function presetFolder(f) {
  const m = /^~(Documents|Desktop|Downloads|Pictures|Music|Videos)$/i.exec(String(f || '').trim());
  if (!m) return f;
  const name = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
  const home = os.homedir();
  for (const c of [path.join(home, name), path.join(home, 'OneDrive', name)]) { try { if (fs.statSync(c).isDirectory()) return c; } catch { /* try the next */ } }
  return path.join(home, name);
}
const SKIP_DIRS = new Set(['node_modules', '.git', '$recycle.bin', 'system volume information', 'appdata', '.cache', '.npm', 'library', '__pycache__']);
const TEXT_EXT = new Set(['.txt', '.md', '.csv', '.json', '.js', '.jsx', '.ts', '.tsx', '.py', '.html', '.css', '.xml', '.yml', '.yaml', '.log', '.ini', '.cfg', '.sql', '.tex', '.rtf']);
export async function findFiles(roots, a, readers = {}) {
  const query = String(a.query || '').trim().toLowerCase(); const text = String(a.text || '').trim().toLowerCase();
  const minBytes = Math.max(0, Number(a.min_mb) || 0) * 1048576; const oldMs = Math.max(0, Number(a.older_than_days) || 0) * 86400000; const newMs = Math.max(0, Number(a.newer_than_days) || 0) * 86400000;
  const ext = a.ext ? String(a.ext).toLowerCase().replace(/^\./, '').split(/[ ,]+/).filter(Boolean) : [];
  const limit = Math.min(60, Math.max(1, Number(a.max) || 25)); const deadline = Date.now() + 25000; const now = Date.now();
  const out = []; let visited = 0, scannedText = 0; let truncated = false;
  const stack = roots.map((r) => [r, 0]);
  while (stack.length && out.length < limit) {
    if (Date.now() > deadline || visited > 60000) { truncated = true; break; }
    const [dir, depth] = stack.pop(); let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      if (out.length >= limit) break;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (depth < 8 && !SKIP_DIRS.has(e.name.toLowerCase()) && !e.isSymbolicLink()) stack.push([full, depth + 1]); continue; }
      if (!e.isFile()) continue;
      visited++;
      const lower = e.name.toLowerCase(); const x = path.extname(lower).slice(1);
      if (ext.length && !ext.includes(x)) continue;
      if (query && !query.split(/\s+/).every((w) => lower.includes(w))) continue;
      let st; try { st = fs.statSync(full); } catch { continue; }
      if (minBytes && st.size < minBytes) continue;
      if (oldMs && now - st.mtimeMs < oldMs) continue;
      if (newMs && now - st.mtimeMs > newMs) continue;
      let snippet = '';
      if (text) {
        if (st.size > 8 * 1048576 || scannedText > 400) continue;
        scannedText++;
        let body = '';
        try {
          const buf = fs.readFileSync(full);
          if (x === 'docx' && readers.docx) body = readers.docx(buf); else if (x === 'xlsx' && readers.xlsx) body = readers.xlsx(buf); else if (x === 'pdf' && readers.pdf) body = readers.pdf(buf);
          else if (TEXT_EXT.has('.' + x) && !buf.includes(0)) body = buf.toString('utf8');
        } catch { continue; }
        const i = body.toLowerCase().indexOf(text); if (i < 0) continue;
        snippet = body.slice(Math.max(0, i - 50), i + text.length + 70).replace(/\s+/g, ' ');
      }
      out.push(`${full}  (${st.size >= 1048576 ? (st.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(st.size / 1024)) + ' KB'}, ${st.mtime.toISOString().slice(0, 10)})${snippet ? `\n    ...${snippet}...` : ''}`);
    }
  }
  if (!out.length) return `Nothing found${truncated ? ' (the search ran out of time, so try a smaller folder)' : ''}.`;
  return `${out.length} file(s)${out.length >= limit ? ' (showing the first ones; narrow the search to see others)' : ''}${truncated ? ', search stopped early' : ''}:\n` + out.join('\n');
}
function dirSize(dir, deadline) { // bytes in a folder, stopping early on huge ones
  let total = 0; const stack = [dir];
  while (stack.length) {
    if (Date.now() > deadline || total > 200 * 1073741824) break;
    const d = stack.pop(); let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) { const f = path.join(d, e.name); try { if (e.isDirectory() && !e.isSymbolicLink()) stack.push(f); else if (e.isFile()) total += fs.statSync(f).size; } catch { /* skip */ } }
  }
  return total;
}
const gb = (n) => (n / 1073741824).toFixed(1) + ' GB';
// ----------------------------------------------------------------------------- reading images on this computer: free, no quota, slower
// Windows has a text reader built in (instant). A small vision model run through Ollama can describe the picture.
// Order of use is set per computer in Dwenlite Home: off, only when the online image models fail (default), or always.
const PS_OCR = `param([string]$Path)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Path)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bmp = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if (-not $engine) { exit 3 }
$res = Await ($engine.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])
$res.Lines | ForEach-Object { $_.Text }
`;
const PS_SHRINK = `param([string]$In,[string]$Out,[int]$MaxW)
Add-Type -AssemblyName System.Drawing
$img=[System.Drawing.Image]::FromFile($In)
$w=$img.Width; $h=$img.Height
if ($w -gt $MaxW) { $h=[int]($h*$MaxW/$w); $w=$MaxW }
$bmp=New-Object System.Drawing.Bitmap $w,$h
$g=[System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($img,0,0,$w,$h)
$enc=[System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep=New-Object System.Drawing.Imaging.EncoderParameters 1
$ep.Param[0]=New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality),([int64]80)
$bmp.Save($Out,$enc,$ep)
$img.Dispose(); $bmp.Dispose(); $g.Dispose()
`;
export const LOCAL_MODELS = ['qwen2.5vl:3b', 'qwen2.5vl:7b', 'qwen2.5vl', 'qwen2-vl:2b', 'qwen2-vl', 'moondream', 'minicpm-v', 'llava-phi3', 'llava:7b', 'llava'];
const OLLAMA = () => (process.env.DWENLITE_OLLAMA || 'http://127.0.0.1:11434').replace(/\/$/, '');
export async function ollamaModels(base = OLLAMA(), fetchFn = fetch) { // which picture-reading models are installed
  const r = await fetchFn(`${base}/api/tags`, { signal: AbortSignal.timeout(2500) }); const j = await r.json();
  return (j.models || []).map((m) => String(m.name || m.model || ''));
}
export function pickLocalModel(installed, wanted = '') {
  if (wanted) { const hit = installed.find((n) => n === wanted || n.startsWith(wanted + ':') || n.split(':')[0] === wanted); if (hit) return hit; }
  for (const p of LOCAL_MODELS) { const hit = installed.find((n) => n === p || (!p.includes(':') && n.split(':')[0] === p) || n.startsWith(p)); if (hit) return hit; }
  return '';
}
export async function ollamaSee({ b64, prompt, model, base = OLLAMA(), fetchFn = fetch, timeoutMs = 300000 }) {
  const r = await fetchFn(`${base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({ model, stream: false, keep_alive: '2m', options: { temperature: 0.1, num_ctx: 4096, num_predict: 700 }, messages: [{ role: 'user', content: prompt, images: [b64] }] }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `The local image model answered ${r.status}.`);
  const text = String((j.message && j.message.content) || '').trim();
  if (!text) throw new Error('The local image model gave no answer.');
  return text;
}
const LOCAL_PROMPT = 'You are the eyes of an AI that operates a computer. Describe this screenshot concisely: the active window or app, the visible text that matters, any errors (verbatim) and what is clickable or typeable that is relevant to the instruction. For every control you mention that can be clicked, give its centre on a 0-1000 grid as: label @ x,y (x across, y down). Do not invent controls that are not visible.';

// Watching a folder: the first look only remembers what is there; later looks report files that were not there before.
export function globMatch(pattern, name) {
  const p = String(pattern || '').trim().toLowerCase(); if (!p) return true;
  if (!/[*?]/.test(p)) return name.toLowerCase().includes(p);
  return new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$').test(name.toLowerCase());
}
export function diffWatch(prev, names, pattern) {
  const now = new Set(names);
  if (!prev) return { fresh: [], next: now };
  return { fresh: names.filter((n) => !prev.has(n) && globMatch(pattern, n)), next: now };
}
export async function pcHealth(runCmd, kind) {
  const lines = []; const deadline = Date.now() + 20000;
  const home = os.homedir();
  lines.push(`Memory: ${gb(os.freemem())} free of ${gb(os.totalmem())}. Up for ${(os.uptime() / 3600).toFixed(1)} hours (a restart now and then keeps things quick).`);
  try {
    if (IS_WIN) {
      const d = (await runCmd('powershell', ['-NoProfile', '-Command', "Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object { $_.DeviceID + ' ' + $_.FreeSpace + ' ' + $_.Size }"], { timeout: 15000 })).stdout;
      for (const l of d.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)) { const [id, free, size] = l.split(' '); if (+size) lines.push(`Drive ${id} ${gb(+free)} free of ${gb(+size)} (${Math.round((+free / +size) * 100)}% free)${+free / +size < 0.1 ? ' - running low' : ''}`); }
      const sa = (await runCmd('powershell', ['-NoProfile', '-Command', "(Get-CimInstance Win32_StartupCommand | Measure-Object).Count; (Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 5 | ForEach-Object { $_.ProcessName + ' ' + [math]::Round($_.WorkingSet64/1MB) + 'MB' }) -join ', '; try { (Get-MpComputerStatus).AntivirusEnabled } catch { 'unknown' }; if (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired') { 'reboot' } else { 'ok' }"], { timeout: 20000 })).stdout.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
      if (sa[0]) lines.push(`Programs that start with Windows: ${sa[0]}${+sa[0] > 12 ? ' (that is a lot, it can slow the start-up)' : ''}`);
      if (sa[1]) lines.push(`Using the most memory right now: ${sa[1]}`);
      if (sa[2]) lines.push(`Virus protection: ${/true/i.test(sa[2]) ? 'on' : /false/i.test(sa[2]) ? 'OFF - worth turning on' : 'could not be checked'}`);
      if (sa[3] === 'reboot') lines.push('Windows is waiting for a restart to finish an update.');
    } else {
      const df = (await runCmd('df', ['-h', home], { timeout: 8000 })).stdout.trim().split('\n').slice(-1)[0]; lines.push(`Disk: ${df.replace(/\s+/g, ' ')}`);
    }
  } catch (e) { lines.push('Some checks could not run: ' + String(e.message).slice(0, 120)); }
  if (kind !== 'quick') {
    const spots = [['Temporary files', os.tmpdir()], ['Downloads', path.join(home, 'Downloads')], ['Recycle Bin / Trash', IS_WIN ? 'C:\\$Recycle.Bin' : path.join(home, '.Trash')]];
    for (const [label, dir] of spots) { try { if (fs.existsSync(dir)) lines.push(`${label}: about ${gb(dirSize(dir, deadline))} in ${dir}`); } catch { /* not readable */ } }
    try { const dl = path.join(home, 'Downloads'); const old = (await findFiles([dl], { older_than_days: 90, min_mb: 20, max: 8 })); if (!/^Nothing/.test(old)) lines.push('Large old downloads (over 90 days, over 20 MB):\n' + old.split('\n').slice(1).join('\n')); } catch { /* optional */ }
  }
  return lines.join('\n') + '\n\nNothing was changed. Tell me what you would like cleaned up and I will ask before deleting anything.';
}
export async function githubCall(token, a) {
  const repo = String(a.repo || '').trim();
  if (a.action !== 'my_repos' && (!/^[\w.-]{1,100}\/[\w.-]{1,100}$/.test(repo) || /(^|\/)\.+(\/|$)/.test(repo))) throw new Error('Give the repository as owner/name.');
  const num = (n) => { const v = Number(n); if (!Number.isInteger(v) || v < 1 || v > 1e7) throw new Error('Give an issue or pull request number.'); return v; };
  let method = 'GET', url = '', body;
  switch (a.action) {
    case 'my_repos': url = '/user/repos?sort=pushed&per_page=15'; break;
    case 'repo': url = `/repos/${repo}`; break;
    case 'issues': url = `/repos/${repo}/issues?state=${a.state === 'closed' ? 'closed' : 'open'}&per_page=15`; break;
    case 'pulls': url = `/repos/${repo}/pulls?state=${a.state === 'closed' ? 'closed' : 'open'}&per_page=15`; break;
    case 'issue': url = `/repos/${repo}/issues/${num(a.number)}`; break;
    case 'commits': url = `/repos/${repo}/commits?per_page=10`; break;
    case 'create_issue': method = 'POST'; url = `/repos/${repo}/issues`; body = { title: String(a.title || '').slice(0, 250), body: String(a.body || '').slice(0, 20000) }; if (!body.title) throw new Error('Give the issue a title.'); break;
    case 'comment': method = 'POST'; url = `/repos/${repo}/issues/${num(a.number)}/comments`; body = { body: String(a.body || '').slice(0, 20000) }; if (!body.body) throw new Error('Write the comment.'); break;
    default: throw new Error('Actions: my_repos, repo, issues, pulls, issue, commits, create_issue, comment.');
  }
  const r = await fetch('https://api.github.com' + url, { method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'dwenlite', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 401 ? 'GitHub did not accept the saved token. Save a new one on the computer with: node dwenlite-agent.mjs vault add' : r.status === 404 ? 'GitHub could not find that (check the name, and that the token can see it).' : `GitHub said: ${String(j.message || r.status).slice(0, 200)}`);
  const one = (x) => (x.full_name ? `${x.full_name}${x.private ? ' (private)' : ''} - ${x.description || 'no description'} [pushed ${String(x.pushed_at || '').slice(0, 10)}]` : x.sha ? `${x.sha.slice(0, 7)} ${String((x.commit || {}).message || '').split('\n')[0]} (${((x.commit || {}).author || {}).name || ''})` : `#${x.number} ${x.title} [${x.state}${x.draft ? ', draft' : ''}] by ${(x.user || {}).login || '?'}`);
  if (method === 'POST') return `Done: ${j.html_url || 'saved'}`;
  if (Array.isArray(j)) return j.length ? j.map(one).join('\n') : 'Nothing found.';
  if (a.action === 'issue') return `${one(j)}\n${String(j.body || '').slice(0, 3000)}`;
  return `${one(j)}${j.open_issues_count != null ? `\nOpen issues: ${j.open_issues_count}. Default branch: ${j.default_branch}.` : ''}`;
}

// ----------------------------------------------------------------------------- the agent
export function createAgent(opts) {
  const root = opts.root;
  fs.mkdirSync(root, { recursive: true });
  const logFile = path.join(root, 'dwenlite-agent.log');
  const log = (m) => { const line = `${new Date().toISOString()} ${m}`; console.log(line); try { fs.appendFileSync(logFile, line + '\n'); } catch { /* ignore */ } };
  // ---- live views: while the owner is watching, pictures are sent as fast as they can be, and their taps and typing come back with each reply ----
  const streams = new Map(); // kind -> stream state
  const viewers = { browser: new Set(), screen: new Set() }; // viewers connected straight to this computer (same computer or home network): no relay, no delay
  let cloudLive = new Set(); // kinds someone is watching through the relay
  const localKeys = new Map(); // one-time keys from the cloud that let the owner's page connect directly
  const wantStream = (kind) => viewers[kind].size > 0 || cloudLive.has(kind);
  function ensureStream(kind) {
    if (streams.has(kind) || !opts.gui || !wantStream(kind)) return; // viewing the screen or the browser needs the screen permission
    log(`live view started: ${kind}`);
    const st = { stopped: false, latest: null, seq: 0, sentCloud: 0, sentLocal: 0, lastLocal: 0, lastSend: 0, inflight: 0, hold: 0, cleanup: null, proc: null, hi: viewers[kind].size > 0, born: Date.now() };
    streams.set(kind, st);
    (async () => {
      let lastInfo = 0; let info = null; let sc = null; let scHi = null;
      const stopAll = () => { st.stopped = true; try { sc && sc(); } catch { /* gone */ } try { st.proc && st.proc.kill(); } catch { /* gone */ } streams.delete(kind); if (kind === 'browser') browser.input({ op: 'resize', w: 1280, h: 900 }).catch(() => {}); };
      st.cleanup = stopAll;
      try {
        if (kind === 'screen' && IS_WIN) {
          const file = psFile('stream', PS_STREAM);
          st.proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file, '-MaxW', st.hi ? '1600' : '1100', '-Quality', st.hi ? '70' : '45'], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
          let buf = ''; st.proc.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line.length > 200) { st.latest = { image: line, meta: { open: true }, n: ++st.seq }; } } if (buf.length > 3000000) buf = ''; });
          st.proc.on('exit', () => { if (!st.stopped) st.latest = { image: '', meta: { open: false }, n: ++st.seq }; });
        }
        while (!st.stopped) {
          const t0 = Date.now();
          st.hi = viewers[kind].size > 0;
          if (kind === 'browser') {
            if (sc && (!browser.isOpen() || scHi !== st.hi)) { try { sc(); } catch { /* gone */ } sc = null; }
            if (!sc && browser.isOpen()) { try { scHi = st.hi; sc = await browser.screencast((f) => { st.latest = { image: f.data, meta: { open: true, w: Math.round(f.metadata.deviceWidth) || 1280, h: Math.round(f.metadata.deviceHeight) || 900, ...(info || {}) }, n: ++st.seq }; }, st.hi ? { quality: 80, maxWidth: 1920, maxHeight: 1920 } : {}); } catch { sc = null; } }
            if (!browser.isOpen()) { if (!st.latest || st.latest.meta.open) st.latest = { image: '', meta: { open: false }, n: ++st.seq }; }
            else if (t0 - lastInfo > 500) { lastInfo = t0; const i = await browser.pageInfo(); if (i) { info = { url: String(i.url).slice(0, 300), title: String(i.title).slice(0, 120), editable: !!i.editable }; if (st.latest && st.latest.meta.open) st.latest.meta = { ...st.latest.meta, ...info }; } }
          } else if (kind === 'screen' && !IS_WIN) {
            try { const r = await actions.screenshot({ look: 'live', novision: true }); if (r && r.image) st.latest = { image: r.image, meta: { open: true }, n: ++st.seq }; } catch (e) { st.latest = { image: '', meta: { open: false, error: String(e.message).slice(0, 200) }, n: ++st.seq }; }
          }
          // straight to viewers on this computer or network: every new picture
          if (viewers[kind].size && st.latest && (st.latest.n !== st.sentLocal || t0 - st.lastLocal > 2000)) {
            st.sentLocal = st.latest.n; st.lastLocal = t0;
            const payload = `data: ${JSON.stringify({ seq: t0, image: st.latest.image, meta: st.latest.meta })}\n\n`;
            for (const r of viewers[kind]) { if (!r.writableNeedDrain) { try { r.write(payload); } catch { viewers[kind].delete(r); } } }
          }
          // through the relay (a phone away from home): the newest picture, with a couple in flight at once
          if (cloudLive.has(kind) && st.latest && st.latest.image.length < 800000 && st.inflight < (kind === 'screen' ? 4 : 3) && Date.now() >= st.hold && (st.latest.n !== st.sentCloud || t0 - st.lastSend > 2000)) {
            st.sentCloud = st.latest.n; st.lastSend = t0; st.inflight++;
            api('agent_frame', { kind, image: st.latest.image, meta: st.latest.meta }).then(async (r) => {
              if (!r || r.live === false) { cloudLive.delete(kind); return; }
              if (kind === 'browser' && Array.isArray(r.ops)) for (const o of r.ops) { try { await browser.input(o); } catch (e) { log('live input failed: ' + clip(e.message, 120)); } }
            }).catch((e) => { if (e.fatal) stopAll(); else st.hold = Date.now() + 500; }).finally(() => { st.inflight--; });
          }
          if (Date.now() - st.born > 4000 && !wantStream(kind)) { stopAll(); return; }
          const spent = Date.now() - t0; await sleep(Math.max(3, (kind === 'screen' && !IS_WIN ? 100 : 8) - spent)); // up to 120 pictures a second; in practice the screen capture and the connection set the pace
        }
      } catch (e) { log('live view stopped: ' + clip(e.message, 160)); stopAll(); }
    })();
  }
  // the direct door: the owner's page talks to this computer without going through the internet
  const LOCAL_PORTS = [47821, 47822, 47823, 47824, 47825];
  const originOk = (o) => !o || /^https:\/\/(www\.)?dwenlite\.space$/.test(o) || /^https:\/\/[\w-]+\.vercel\.app$/.test(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
  let localServer = null;
  function startLocalServer() {
    if (localServer) return;
    const keyOk = (k) => { const e = localKeys.get(String(k || '')); return !!e && e > Date.now(); };
    const server = http.createServer((req, res) => {
      const origin = req.headers.origin;
      if (!originOk(origin)) { res.writeHead(403); return res.end(); }
      if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
      res.setHeader('Access-Control-Allow-Private-Network', 'true'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); res.setHeader('Access-Control-Max-Age', '600');
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      const u = new URL(req.url, 'http://127.0.0.1');
      const json = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.method === 'GET' && u.pathname === '/hello') return json(200, { app: 'dwenlite', device: opts.device, version: VERSION });
      if (!keyOk(u.searchParams.get('key'))) return json(401, { error: 'Not yet.' });
      if (!opts.gui) return json(403, { error: 'Screen sharing is off for this computer.' });
      if (req.method === 'GET' && u.pathname === '/live') {
        const kind = u.searchParams.get('kind'); if (!viewers[kind]) return json(400, { error: 'Unknown view.' });
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' }); res.write(': hello\n\n');
        viewers[kind].add(res); ensureStream(kind);
        req.on('close', () => { viewers[kind].delete(res); });
        return;
      }
      if (req.method === 'POST' && u.pathname === '/input') {
        let b = ''; req.on('data', (c) => { b += c; if (b.length > 20000) req.destroy(); });
        req.on('end', async () => { try { const op = JSON.parse(b || '{}'); if (!['tap', 'text', 'key', 'scroll', 'back', 'forward', 'reload', 'go', 'resize'].includes(op.op)) return json(400, { error: 'No.' }); await browser.input(op); json(200, { ok: true }); } catch (e) { json(500, { error: String(e.message).slice(0, 120) }); } });
        return;
      }
      json(404, { error: 'No.' });
    });
    let i = 0;
    const tryNext = () => { if (i >= LOCAL_PORTS.length) return; const port = LOCAL_PORTS[i++]; server.once('error', tryNext); server.listen(port, '127.0.0.1', () => { server.removeListener('error', tryNext); localServer = server; log(`direct view ready on port ${port}`); }); };
    tryNext();
  }
  // ---- reading a picture: the online image models first (fast); this computer's own as a free backup, or first if the owner chose that ----
  const localVis = { mode: 'fallback', model: '', checked: 0, wanted: '' }; // the shared image model first; a model on this computer only as a backup, unless the owner chose otherwise
  let seeChain = Promise.resolve();
  async function readyLocalModel() { // is a picture-reading model installed? (asked at most once a minute)
    if (Date.now() - localVis.checked < 60000) return localVis.model;
    localVis.checked = Date.now();
    try { localVis.model = pickLocalModel(await ollamaModels(), localVis.wanted); } catch { localVis.model = ''; }
    return localVis.model;
  }
  async function shrinkForLocal(b64, mime, maxW) { // fewer pixels = far less waiting on a computer without a graphics card
    const ext = mime === 'image/png' ? 'png' : 'jpg'; const id = crypto.randomBytes(5).toString('hex');
    const inF = path.join(os.tmpdir(), `dwenlite-see-${id}.${ext}`); const outF = path.join(os.tmpdir(), `dwenlite-see-${id}-s.jpg`);
    try {
      fs.writeFileSync(inF, Buffer.from(b64, 'base64'));
      if (IS_WIN) await ps(psFile('shrink', PS_SHRINK), ['-In', inF, '-Out', outF, '-MaxW', String(maxW)]);
      else if (IS_MAC) await run('sips', ['-Z', String(maxW), '-s', 'format', 'jpeg', inF, '--out', outF]);
      else { const c = (await have('magick')) ? 'magick' : (await have('convert')) ? 'convert' : ''; if (!c) return { b64, file: inF, mime }; await run(c, [inF, '-resize', `${maxW}x`, '-quality', '80', outF]); }
      return { b64: fs.readFileSync(outF).toString('base64'), file: outF, mime: 'image/jpeg', cleanup: [inF, outF] };
    } catch { return { b64, file: inF, mime, cleanup: [inF] }; }
  }
  async function windowsOcr(file) { if (!IS_WIN) return ''; try { return (await ps(psFile('ocr', PS_OCR), ['-Path', file])).stdout.replace(/\r/g, '').trim(); } catch { return ''; } }
  function localSee({ image, mime, look }, { needModel = false, timeoutMs = 300000 } = {}) { // one at a time: this computer is small
    const job = seeChain.then(async () => {
      const model = await readyLocalModel();
      const sm = await shrinkForLocal(image, mime || 'image/jpeg', 896);
      try {
        const ocr = (await windowsOcr(sm.file)).slice(0, 3000);
        if (!model && needModel) throw new Error('No image model is installed on this computer.');
        if (!model) { if (ocr) return { text: `(No image model is installed on this computer, so this is only the text read from the screen.)\n${ocr}` }; throw new Error('No image model is installed on this computer. Install Ollama and a model such as qwen2.5vl:3b.'); }
        const prompt = `${LOCAL_PROMPT}${ocr ? `\n\nText read from the screen by a text reader (may contain mistakes):\n${ocr}` : ''}${look ? `\n\nInstruction: ${String(look).slice(0, 600)}` : ''}`;
        log(`reading a picture on this computer with ${model}...`);
        const t0 = Date.now(); const text = await ollamaSee({ b64: sm.b64, prompt, model, timeoutMs }); log(`local picture reading took ${Math.round((Date.now() - t0) / 1000)}s`);
        return { text };
      } finally { for (const f of sm.cleanup || []) { try { fs.unlinkSync(f); } catch { /* gone */ } } }
    });
    seeChain = job.catch(() => {}); return job;
  }
  async function see(args) {
    let localErr = null;
    if (localVis.mode === 'first') { // this computer's own model first; if it is missing, fails or is too slow (2.5 minutes), the online ones take over
      try { return await localSee(args, { needModel: true, timeoutMs: 150000 }); } catch (e) { localErr = e; log('local picture reading did not work, using the online model: ' + clip(e.message, 160)); }
    }
    try { return await api('agent_see', args); }
    catch (e) {
      if (localVis.mode === 'off') throw e;
      const retry = !e.status || e.status === 429 || e.status >= 500; // quota used up, no online model, or no connection
      if (!retry) throw e;
      try { return await localSee(args, { needModel: false }); } // last resort: whatever this computer can read (at least the text on the screen)
      catch (e2) { throw new Error(`${e.message} (and on this computer: ${(localErr || e2).message})`); }
    }
  }
  const watchSeen = new Map(); let lastWatchCheck = 0;
  async function scanWatches(list) {
    if (Date.now() - lastWatchCheck < 20000) return; lastWatchCheck = Date.now();
    const ids = new Set(list.map((w) => w.id)); for (const k of [...watchSeen.keys()]) if (!ids.has(k)) watchSeen.delete(k);
    for (const w of list) {
      let dir; try { dir = safePath(root, presetFolder(w.folder), extraRoots); } catch (e) { continue; } // only folders the owner allowed
      let names = []; try { names = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).slice(0, 3000).filter((e) => { try { return Date.now() - fs.statSync(path.join(dir, e.name)).mtimeMs > 3000; } catch { return false; } }).map((e) => e.name); } catch { continue; }
      const { fresh, next } = diffWatch(watchSeen.get(w.id) || null, names, w.pattern);
      watchSeen.set(w.id, next);
      if (fresh.length) { try { await api('agent_event', { watchId: w.id, files: fresh.slice(0, 10) }); log(`watch ${w.id}: ${fresh.length} new file(s)`); } catch (e) { watchSeen.set(w.id, new Set([...next].filter((n) => !fresh.includes(n)))); } }
    }
  }
  let extraRoots = []; // extra folders the owner allowed in Dwenlite Home (sent with every poll)
  const extra = () => extraRoots;
  const undoDir = path.join(root, '.undo');
  const undoIndex = path.join(undoDir, 'index.json');
  const loadUndo = () => { try { return JSON.parse(fs.readFileSync(undoIndex, 'utf8')); } catch { return []; } };
  const saveUndo = (list) => { fs.mkdirSync(undoDir, { recursive: true }); fs.writeFileSync(undoIndex, JSON.stringify(list.slice(-100))); };
  // keep a copy of a file before it is changed, so the owner can press Undo
  function backupBeforeWrite(f) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const existed = fs.existsSync(f) && fs.statSync(f).isFile();
    let backup = '';
    if (existed) {
      if (fs.statSync(f).size > 20 * 1024 * 1024) return '';
      fs.mkdirSync(undoDir, { recursive: true }); backup = path.join(undoDir, `${id}-${path.basename(f)}`); fs.copyFileSync(f, backup);
    }
    const list = loadUndo(); list.push({ id, path: f, existed, backup, at: Date.now() }); saveUndo(list);
    return id;
  }
  let lastShot = null; // sizes of the last screenshot, to turn screenshot pixels into real screen coordinates

  async function api(action, body) {
    const r = await fetch(opts.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, deviceId: opts.device, token: opts.token, ...body }), signal: AbortSignal.timeout(action === 'agent_result' ? 60000 : 20000) }); // a stalled connection (wifi change, waking from sleep) must not freeze the helper
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { const e = new Error('This device was removed or its token is wrong.'); e.fatal = true; throw e; }
    if (!r.ok) { const e = new Error(j.error || `HTTP ${r.status}`); e.status = r.status; throw e; }
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

  // ---- Android over USB / Wi-Fi debugging ----
  let adbPath = ''; let uiEls = []; let uiMap = [];
  async function findAdb() {
    if (adbPath && (adbPath === 'adb' || fs.existsSync(adbPath))) return adbPath;
    const exe = IS_WIN ? 'adb.exe' : 'adb';
    const cands = [process.env.DWENLITE_ADB, path.join(root, 'platform-tools', exe), IS_WIN ? path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk', 'platform-tools', exe) : '', IS_MAC ? path.join(os.homedir(), 'Library/Android/sdk/platform-tools/adb') : '', '/usr/bin/adb', '/usr/local/bin/adb'];
    for (const c of cands) if (c && fs.existsSync(c)) { adbPath = c; return c; }
    if (await have('adb')) { adbPath = 'adb'; return 'adb'; }
    return '';
  }
  const adbExec = (args, { timeout = 30000, binary = false } = {}) => new Promise((resolve, reject) => {
    execFile(adbPath, args, { timeout, maxBuffer: 40 * 1024 * 1024, encoding: binary ? 'buffer' : 'utf8', windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(new Error((String(stderr || '').trim() || err.message).slice(0, 400)));
      resolve(stdout);
    });
  });
  async function androidRun(a) {
    const act = a.action;
    if (act === 'setup') {
      const url = `https://dl.google.com/android/repository/platform-tools-latest-${IS_WIN ? 'windows' : IS_MAC ? 'darwin' : 'linux'}.zip`;
      const r = await fetch(url); if (!r.ok) throw new Error(`Download failed (${r.status}).`);
      const zip = path.join(os.tmpdir(), 'dwenlite-platform-tools.zip');
      fs.writeFileSync(zip, Buffer.from(await r.arrayBuffer()));
      if (IS_WIN) await run('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -Force -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${root.replace(/'/g, "''")}'`], { timeout: 120000 });
      else { await run('unzip', ['-o', zip, '-d', root], { timeout: 120000 }); try { fs.chmodSync(path.join(root, 'platform-tools', 'adb'), 0o755); } catch { /* ignore */ } }
      try { fs.unlinkSync(zip); } catch { /* ignore */ }
      adbPath = ''; if (!(await findAdb())) throw new Error('The download finished but adb was not found.');
      return `Android tools installed in ${path.join(root, 'platform-tools')}. ${(await adbExec(['version'])).split('\n')[0]}`;
    }
    if (!(await findAdb())) throw new Error('adb (Android Debug Bridge) is not installed on this computer. Run the android tool with action "setup" to download it, or install Android platform-tools.');
    if (act === 'pair') {
      if (!/^[\w.-]+:\d{2,5}$/.test(a.host || '') || !/^\d{6}$/.test(String(a.code || ''))) throw new Error('Give the pairing address as ip:port and the 6 digit pairing code shown on the phone (Developer options > Wireless debugging > Pair device with pairing code).');
      return (await adbExec(['pair', a.host, String(a.code)], { timeout: 30000 })).trim();
    }
    if (act === 'connect' || act === 'disconnect') {
      const host = /:\d+$/.test(a.host || '') ? a.host : `${a.host}:5555`;
      if (!/^[\w.-]+:\d{2,5}$/.test(host)) throw new Error('Give the phone address like 192.168.1.20:5555 (Wireless debugging shows the exact IP and port).');
      return (await adbExec([act, host], { timeout: 20000 })).trim() || 'Done.';
    }
    const list = parseAdbDevices(await adbExec(['devices', '-l']));
    if (act === 'devices') return list.length ? list.map((d) => `${d.serial}  ${d.state}${d.model ? '  ' + d.model : ''}${d.wifi ? '  (wifi)' : '  (usb)'}${d.state === 'unauthorized' ? '  <- accept the "Allow USB debugging" prompt on the phone' : ''}`).join('\n') : ADB_HINT;
    const ready = list.filter((d) => d.state === 'device');
    let serial = a.serial;
    if (!serial) {
      if (ready.length === 1) serial = ready[0].serial;
      else if (!ready.length) throw new Error(list.length ? `The phone is ${list[0].state}. If it says unauthorized, accept the debugging prompt on the phone.` : ADB_HINT);
      else throw new Error(`Several phones are connected (${ready.map((d) => d.serial).join(', ')}). Say which serial to use.`);
    }
    if (!/^[\w.:-]+$/.test(serial)) throw new Error('Bad device serial.');
    const S = ['-s', serial];
    const sh = (cmd, t) => adbExec([...S, 'shell', cmd], { timeout: t || 30000 });
    const readScreen = async () => {
      await sh('uiautomator dump /sdcard/dwen-ui.xml', 25000);
      uiEls = parseUiXml(await adbExec([...S, 'exec-out', 'cat', '/sdcard/dwen-ui.xml']));
      const top = (await sh('dumpsys window | grep -E "mCurrentFocus" | head -1').catch(() => '')).trim().replace(/^.*\s(\S+\/\S+?)\}?$/, '$1');
      return `ANDROID SCREEN${top ? ' (' + top + ')' : ''}\nELEMENTS (use the number with tap):\n${uiEls.map((e) => `[${e.n}] ${e.kind}${e.text ? ' "' + e.text + '"' : ''}${e.hint ? ' (' + e.hint + ')' : ''}${e.checked ? ' (on)' : ''}`).join('\n') || '(nothing readable: the app may block screen reading. Use a screenshot.)'}`;
    };
    const point = (e) => { const el = uiEls.find((x) => x.n === Number(e)); if (!el) throw new Error(`Element ${e} was not found. Call read again and use the new numbers.`); return el; };
    if (act === 'info') return (await sh('getprop ro.product.model; getprop ro.build.version.release; dumpsys battery | grep -E "level|powered"; wm size')).trim();
    if (act === 'read') return await readScreen();
    if (act === 'screenshot') {
      const buf = await adbExec([...S, 'exec-out', 'screencap', '-p'], { binary: true, timeout: 30000 });
      const sz = imageSize(buf) || { w: 1080, h: 2400 };
      if (buf.length > 2900000) return { text: `(The screenshot is ${(buf.length / 1e6).toFixed(1)} MB, too large for the image model. Use the read action instead: it lists what is on screen without a picture.)`, image: '' };
      let text = '';
      try { text = (await see({ image: buf.toString('base64'), mime: 'image/png', look: a.look, width: sz.w, height: sz.h })).text; } catch (e) { text = `(The screenshot was taken but could not be read by the image model: ${e.message})`; }
      return { text, image: buf.length < 520000 ? buf.toString('base64') : '' };
    }
    if (act === 'tap') {
      const el = a.element ? point(a.element) : { x: Number(a.x), y: Number(a.y) };
      if (!(el.x >= 0 && el.y >= 0)) throw new Error('Give an element number or x and y.');
      await sh(`input tap ${Math.round(el.x)} ${Math.round(el.y)}`); await sleep(700); return await readScreen();
    }
    if (act === 'scroll' || act === 'swipe') {
      let x1 = Number(a.x), y1 = Number(a.y), x2 = Number(a.x2), y2 = Number(a.y2);
      if (act === 'scroll') {
        const m = /(\d+)x(\d+)/.exec(await sh('wm size').catch(() => '')) || [0, 1080, 2400];
        const w = Number(m[1]), h = Number(m[2]); x1 = x2 = w / 2; y1 = h * (a.direction === 'up' ? 0.3 : 0.7); y2 = h * (a.direction === 'up' ? 0.7 : 0.3);
      }
      if (![x1, y1, x2, y2].every((n) => n >= 0)) throw new Error('Give x, y, x2 and y2.');
      await sh(`input swipe ${Math.round(x1)} ${Math.round(y1)} ${Math.round(x2)} ${Math.round(y2)} ${Math.min(2000, Math.max(80, Number(a.duration) || 300))}`); await sleep(600); return await readScreen();
    }
    if (act === 'text') {
      const t = String(a.text || ''); if (!t || t.length > 500) throw new Error('Give text up to 500 characters.');
      if (/[^\x20-\x7e]/.test(t)) throw new Error('Only plain letters, numbers and common symbols can be typed on a phone this way.');
      await sh(`input text ${t.replace(/ /g, '%s').replace(/([&|;<>()$\`\\"'*?#~!{}[\]^])/g, '\\$1')}`);
      if (a.submit) await sh('input keyevent KEYCODE_ENTER');
      await sleep(500); return await readScreen();
    }
    if (act === 'key') {
      const k = KEYS_ANDROID[String(a.key || '').toLowerCase()] || (/^(KEYCODE_[A-Z0-9_]+|\d{1,3})$/.test(String(a.key)) ? a.key : '');
      if (!k) throw new Error(`Unknown key "${a.key}". Try home, back, recents, enter, power, volume_up, volume_down.`);
      await sh(`input keyevent ${k}`); await sleep(600); return await readScreen();
    }
    if (act === 'open_app') {
      if (a.url) { if (!/^https?:\/\/[^\s'"]+$/.test(a.url)) throw new Error('Give a full http link.'); await sh(`am start -a android.intent.action.VIEW -d '${a.url}'`); }
      else if (/^[\w.]+$/.test(a.package || '')) await sh(`monkey -p ${a.package} -c android.intent.category.LAUNCHER 1`);
      else throw new Error('Give a package name (like com.whatsapp) or a url.');
      await sleep(1500); return await readScreen();
    }
    if (act === 'apps') {
      const out = (await sh('pm list packages -3')).split(/\r?\n/).map((l) => l.replace('package:', '').trim()).filter(Boolean);
      const q = String(a.text || '').toLowerCase();
      return (q ? out.filter((p) => p.toLowerCase().includes(q)) : out).slice(0, 200).join('\n') || '(none)';
    }
    if (act === 'shell') {
      const cmd = String(a.command || ''); const why = dangerousAndroid(cmd);
      if (why) throw new Error(`Blocked for safety: this looks like ${why}. Dwenlite will not run it.`);
      return clip((await sh(cmd, 60000)).trim() || '(no output)', MAX_OUT);
    }
    if (act === 'install') {
      const f = safePath(root, a.local, extra());
      if (!/\.apk$/i.test(f) || !fs.existsSync(f)) throw new Error('Give the path of an .apk file inside an allowed folder.');
      return (await adbExec([...S, 'install', '-r', f], { timeout: 180000 })).trim();
    }
    if (act === 'push' || act === 'pull') {
      const remote = String(a.remote || ''); if (!/^\/[\w./ -]+$/.test(remote) || remote.includes('..')) throw new Error('Give a phone path like /sdcard/Download/file.txt.');
      const local = safePath(root, a.local, extra());
      if (act === 'push') { if (!fs.existsSync(local)) throw new Error('That file does not exist on this computer.'); return (await adbExec([...S, 'push', local, remote], { timeout: 300000 })).trim(); }
      fs.mkdirSync(path.dirname(local), { recursive: true }); return (await adbExec([...S, 'pull', remote, local], { timeout: 300000 })).trim();
    }
    throw new Error(`Unknown android action "${act}".`);
  }

  const browser = createBrowser({ root, api: (action, body) => api(action, body), log: (m) => log(m), see: (x) => see(x) });

  // ---- actions ----
  const actions = {
    async browser(a) {
      needGui();
      return await browser.run(a);
    },
    async browser_view(a) { needGui(); return await browser.run({ ...a, action: 'view' }); },
    async android(a) { needShell(); return await androidRun(a); },
    async network_scan(a) {
      needShell();
      const ports = Array.isArray(a.ports) && a.ports.length ? a.ports.map(Number).filter((p) => p > 0 && p < 65536).slice(0, 20) : [22, 80, 443, 445, 554, 1883, 3389, 5555, 8008, 8080, 9100];
      const hosts = ipv4Hosts();
      if (!hosts.length) return 'This computer is not on a home or office network (no private network address found).';
      const found = await scanHosts(hosts, ports);
      const byIp = new Map(found.map((f) => [f.ip, { ...f }]));
      try { // the computer's address table also lists phones and other devices that answered but have no open port
        const arp = (await run('arp', ['-a'], { timeout: 8000 })).stdout;
        for (const m of arp.matchAll(/(\d+\.\d+\.\d+\.\d+)\)?\s+(?:at\s+)?([0-9a-f]{1,2}[:-][0-9a-f]{1,2}[:-][0-9a-f]{1,2}[:-][0-9a-f]{1,2}[:-][0-9a-f]{1,2}[:-][0-9a-f]{1,2})/gi)) {
          const ip = m[1]; if (!hosts.includes(ip) || /^(ff[:-]){5}ff$/i.test(m[2])) continue;
          const e = byIp.get(ip) || { ip, ports: [] }; e.mac = m[2].toLowerCase().replace(/-/g, ':'); byIp.set(ip, e);
        }
      } catch { /* arp is optional */ }
      const list = [...byIp.values()].sort((x, y) => x.ip.localeCompare(y.ip, undefined, { numeric: true }));
      await Promise.all(list.map(async (e) => { try { e.name = (await Promise.race([dns.reverse(e.ip), sleep(800).then(() => [])]))[0] || ''; } catch { e.name = ''; } }));
      return list.length ? `${list.length} device(s) on the network:\n` + list.map((e) => `${e.ip}${e.name ? '  ' + e.name : ''}${e.mac ? '  ' + e.mac : ''}${e.ports.length ? '  open: ' + e.ports.map((p) => PORT_NAMES[p] ? `${p} (${PORT_NAMES[p]})` : p).join(', ') : ''}`).join('\n') : 'No devices answered.';
    },
    async lan_http(a) {
      needShell();
      let u; try { u = new URL(String(a.url)); } catch { throw new Error('Give a full http link.'); }
      if (!/^https?:$/.test(u.protocol)) throw new Error('Only http and https links.');
      const addrs = net.isIP(u.hostname.replace(/^\[|\]$/g, '')) ? [{ address: u.hostname.replace(/^\[|\]$/g, '') }] : await dns.lookup(u.hostname, { all: true });
      const priv = (ip) => /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|f[cd][0-9a-f]{2}:)/i.test(ip);
      if (!addrs.length || !addrs.every((x) => priv(x.address)) || addrs.some((x) => /^169\.254\./.test(x.address))) throw new Error('This tool only talks to devices on your own network (private addresses), not the internet. Use read_page or the browser for websites.');
      const method = String(a.method || 'GET').toUpperCase() === 'POST' ? 'POST' : 'GET';
      const hdrs = a.body ? { 'Content-Type': a.content_type || 'application/json' } : {};
      if (a.login) { // a saved login for this device: sent as a basic sign-in, never shown to the AI
        const cred = await vaultGet(root, String(a.login));
        if (hostOf(cred.host) !== hostOf(u.hostname)) throw new Error(`That saved login is for ${cred.host}, not ${u.hostname}.`);
        hdrs.Authorization = 'Basic ' + Buffer.from(`${cred.user}:${cred.pass}`).toString('base64');
      }
      const r = await fetch(u, { method, body: method === 'POST' ? String(a.body || '').slice(0, 20000) : undefined, headers: hdrs, signal: AbortSignal.timeout(8000), redirect: 'manual' });
      const text = await r.text();
      return `HTTP ${r.status} ${r.headers.get('content-type') || ''}\n\n${clip(text, 8000)}`;
    },
    async document(a) {
      if (a.action === 'read') {
        const f = safePath(root, a.path, extra()); const st = fs.statSync(f);
        if (!st.isFile() || st.size > 25 * 1024 * 1024) throw new Error('That is not a readable file (25 MB at most).');
        const buf = fs.readFileSync(f); const ext = path.extname(f).toLowerCase();
        const text = ext === '.docx' ? readDocx(buf) : ext === '.xlsx' ? readXlsx(buf) : ext === '.pdf' ? readPdf(buf) : (buf.includes(0) ? (() => { throw new Error('That looks like a binary file. Supported: .docx .xlsx .pdf .csv .txt'); })() : buf.toString('utf8'));
        return clip(text, MAX_OUT);
      }
      const kind = String(a.kind || path.extname(String(a.path || '')).slice(1)).toLowerCase();
      if (!['docx', 'xlsx', 'pdf', 'csv'].includes(kind)) throw new Error('Choose docx, xlsx, pdf or csv.');
      let f = safePath(root, a.path, extra());
      if (path.extname(f).toLowerCase() !== `.${kind}`) f += `.${kind}`;
      f = safePath(root, f, extra());
      const blocks = Array.isArray(a.blocks) ? a.blocks : [{ type: 'paragraph', text: String(a.text || '') }];
      const buf = kind === 'docx' ? makeDocx(blocks) : kind === 'pdf' ? makePdf(blocks) : kind === 'xlsx' ? makeXlsx(a.sheets) : Buffer.from('\ufeff' + toCsv(a.rows), 'utf8');
      fs.mkdirSync(path.dirname(f), { recursive: true });
      const undoId = backupBeforeWrite(f);
      fs.writeFileSync(f, buf);
      return `Created ${f} (${buf.length} bytes)${undoId ? ` [undo:${undoId}]` : ''}`;
    },
    async app_ui(a) {
      needGui();
      if (!IS_WIN) throw new Error('Reading programs by their buttons works on Windows only for now. On this computer use the screenshot tools.');
      const clean = (e) => { throw new Error(String((e.stderr || e.message || e)).replace(/\r?\n[\s\S]*$/, '').slice(0, 400)); };
      const readUi = async () => {
        const r = await ps(psFile('ui', PS_UI), ['-Action', 'read', '-App', String(a.app)]).catch(clean);
        const json = r.stdout.split('###JSON')[1] || '[]'; uiMap = JSON.parse(json.trim() || '[]');
        return `PROGRAM: ${a.app}\nELEMENTS (use the number with click or type):\n${uiMap.map((e) => `[${e.n}] ${e.ct}${e.name ? ' "' + e.name + '"' : ''}${e.id ? ' (' + e.id + ')' : ''}${e.value ? ' value "' + e.value + '"' : ''}${e.state === 'On' ? ' (on)' : ''}`).join('\n') || '(nothing readable: the program may not support this. Use screenshots.)'}`;
      };
      if (a.action === 'read') return await readUi();
      const el = uiMap.find((x) => x.n === Number(a.element));
      if (!el) throw new Error(`Element ${a.element} was not found. Read the program again first and use the new numbers.`);
      const args = ['-Action', a.action, '-App', String(a.app), '-Ct', el.ct, '-Name', el.name, '-AutoId', el.id, '-Nth', String(el.nth)];
      if (a.action === 'type') args.push('-TextB64', Buffer.from(String(a.text || ''), 'utf8').toString('base64'));
      await ps(psFile('ui', PS_UI), args).catch(clean);
      await sleep(600);
      return `Done.\n\n${await readUi()}`;
    },
    async git(a) {
      needShell();
      const cwd = a.repo ? safePath(root, a.repo, extra()) : root;
      const act = String(a.action || '');
      const clean = (arr) => (Array.isArray(arr) ? arr : []).map(String).filter((p) => p && !p.startsWith('-') && p.length < 300).slice(0, 50);
      let args;
      if (act === 'status') args = ['status', '--short', '--branch'];
      else if (act === 'diff') args = ['diff', ...(a.staged ? ['--cached'] : []), ...(a.stat ? ['--stat'] : []), ...(clean(a.paths).length ? ['--', ...clean(a.paths)] : [])];
      else if (act === 'log') args = ['log', '--oneline', '--decorate', '-n', String(Math.min(50, Math.max(1, Number(a.count) || 15)))];
      else if (act === 'show') { if (!GIT_REF.test(a.ref || 'HEAD') || String(a.ref || '').startsWith('-')) throw new Error('Give a commit, branch or tag name.'); args = ['show', '--stat', '--format=fuller', a.ref || 'HEAD']; }
      else if (act === 'branch') args = ['branch', '-vv'];
      else if (act === 'add') args = a.all ? ['add', '-A'] : ['add', '--', ...clean(a.paths)];
      else if (act === 'commit') { const m = String(a.message || '').trim(); if (!m || m.length > 500) throw new Error('Give a commit message (up to 500 characters).'); args = ['commit', ...(a.all ? ['-a'] : []), '-m', m]; }
      else throw new Error('Supported git actions: status, diff, log, show, branch, add, commit. (Pushing and discarding changes are not available.)');
      if (act === 'add' && !a.all && args.length <= 2) throw new Error('Give the paths to add, or all=true.');
      return await new Promise((resolve) => {
        execFile('git', ['-c', 'core.pager=cat', '-c', 'color.ui=false', ...args], { cwd, timeout: 60000, maxBuffer: 20 * 1024 * 1024, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_EDITOR: 'true' } }, (err, stdout, stderr) => {
          const out = `${stdout || ''}${stderr ? (stdout ? '\n' : '') + stderr : ''}`.trim();
          if (err && err.code === 'ENOENT') return resolve('Git is not installed on this computer.');
          resolve(clip(out || (err ? err.message : '(no output)'), MAX_OUT) + (err && err.code ? `\n[exit code ${err.code}]` : ''));
        });
      });
    },
    async run_tests(a) {
      needShell();
      const dir = a.path ? safePath(root, a.path, extra()) : root;
      const cmd = String(a.command || '').trim() || detectTestCommand(dir);
      if (!cmd) throw new Error('Could not tell how to run the tests here. Tell me the command (for example "npm test" or "pytest").');
      const out = await actions.shell({ command: cmd, cwd: dir, timeout_s: Math.min(600, Number(a.timeout_s) || 300) });
      return `Ran: ${cmd}\n\n${out}`;
    },
    async preview_write(a) {
      const f = safePath(root, a.path, extra());
      if (!fs.existsSync(f)) return `New file: ${f}\n${String(a.content || '').split('\n').length} lines, ${Buffer.byteLength(String(a.content || ''))} bytes.\n\n${clip(String(a.content || '').split('\n').slice(0, 40).join('\n'), 4000)}`;
      const old = fs.readFileSync(f, 'utf8');
      return a.append ? `Adds to the end of ${f}:\n\n${clip(String(a.content || ''), 4000)}` : `Changes to ${f}\n${lineDiff(old, String(a.content || ''))}`;
    },
    // a file from the owner's browser, delivered in pieces through the server
    async fetch_file(a) {
      const name = path.basename(String(a.name || 'file')).replace(/[^\w. ()-]/g, '_').slice(0, 120) || 'file';
      const total = Math.min(20, Math.max(1, Number(a.total) || 1));
      const dest = safePath(root, path.join(String(a.folder || 'uploads'), name), extra());
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const fd = fs.openSync(dest, 'w');
      try { for (let i = 0; i < total; i++) { const r = await api('agent_file_get', { fileId: String(a.fileId), index: i }); fs.writeSync(fd, Buffer.from(r.data || '', 'base64')); } } finally { fs.closeSync(fd); }
      return `Saved ${dest} (${fs.statSync(dest).size} bytes)`;
    },
    // a file from this computer to the owner's browser
    async send_file(a, job) {
      const f = safePath(root, presetFolder(a.path), extra());
      const st = fs.statSync(f);
      if (!st.isFile()) throw new Error('That is not a file.');
      if (st.size > 8 * 1024 * 1024) throw new Error(`That file is ${(st.size / 1048576).toFixed(1)} MB. Files up to 8 MB can be sent.`);
      const buf = fs.readFileSync(f); const CH = 500 * 1024; const total = Math.max(1, Math.ceil(buf.length / CH));
      for (let i = 0; i < total; i++) await api('agent_file_put', { jobId: job.id, index: i, total, data: buf.subarray(i * CH, (i + 1) * CH).toString('base64') });
      return `Sent ${path.basename(f)} (${buf.length} bytes) [file:${job.id}:${total}:${buf.length}]`;
    },
    async web_search(a) { return await webSearch(String(a.query || '')); },
    async undo(a) {
      const list = loadUndo();
      const e = list.find((x) => x.id === a.id);
      if (!e) throw new Error('Nothing to undo for that (it may be too old).');
      if (e.undone) return 'That change was already undone.';
      const f = safePath(root, e.path, extra());
      if (e.existed) { if (!e.backup || !fs.existsSync(e.backup)) throw new Error('The backup copy is gone.'); fs.copyFileSync(e.backup, f); }
      else { try { fs.unlinkSync(f); } catch { /* already gone */ } }
      e.undone = true; saveUndo(list);
      return e.existed ? `Put ${f} back the way it was.` : `Removed ${f} (it did not exist before).`;
    },
    async system_info() {
      const info = { platform: process.platform, release: os.release(), arch: os.arch(), hostname: os.hostname(), user: os.userInfo().username, cpus: `${os.cpus().length} x ${(os.cpus()[0] || {}).model || ''}`.trim(),
        memory_total_gb: +(os.totalmem() / 1e9).toFixed(1), memory_free_gb: +(os.freemem() / 1e9).toFixed(1), uptime_hours: +(os.uptime() / 3600).toFixed(1), node: process.version, work_folder: root, shell_allowed: opts.shell, gui_allowed: opts.gui };
      try { if (!IS_WIN) info.disk = (await run('df', ['-h', root], { timeout: 5000 })).stdout.trim(); } catch { /* optional */ }
      return JSON.stringify(info, null, 2);
    },
    async list_dir(a) {
      const dir = safePath(root, presetFolder(a.path), extra());
      const items = fs.readdirSync(dir, { withFileTypes: true }).slice(0, 300).map((d) => {
        let size = '', mtime = '';
        try { const st = fs.statSync(path.join(dir, d.name)); size = d.isFile() ? st.size : ''; mtime = st.mtime.toISOString().slice(0, 16); } catch { /* ignore */ }
        return `${d.isDirectory() ? 'dir ' : 'file'}  ${String(size).padStart(10)}  ${mtime}  ${d.name}`;
      });
      return `${dir}\n${items.join('\n') || '(empty)'}`;
    },
    async find_files(a) {
      const roots = a.folder ? [safePath(root, presetFolder(a.folder), extra())] : [fs.realpathSync(root), ...extra()];
      if (!a.query && !a.text && !a.ext && !a.min_mb && !a.older_than_days && !a.newer_than_days) throw new Error('Say what to look for: part of a name, some text inside, a file type, a size or an age.');
      return await findFiles(roots, a, { docx: readDocx, xlsx: readXlsx, pdf: readPdf });
    },
    async reveal_file(a) { // show a file in the folder window on this computer, or open it with its normal program
      const f = safePath(root, presetFolder(a.path), extra());
      if (!fs.existsSync(f)) throw new Error('That file is not there any more.');
      const open = a.mode === 'open';
      if (open && /\.(exe|bat|cmd|com|msi|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|scr|pif|lnk|hta|jar|reg|sh|command|app|appimage|desktop|dll|cpl)$/i.test(f)) throw new Error('For safety, programs and scripts are not opened from here. It was not opened.');
      const go = (cmd, args) => new Promise((resolve, reject) => { try { const p = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: false }); p.on('error', reject); p.unref(); setTimeout(resolve, 400); } catch (e) { reject(e); } });
      if (IS_WIN) await go('explorer.exe', open ? [f] : ['/select,' + f]);
      else if (IS_MAC) await go('open', open ? [f] : ['-R', f]);
      else await go('xdg-open', [open ? f : path.dirname(f)]);
      return open ? `Opened ${path.basename(f)} on the computer.` : `Showing ${path.basename(f)} in its folder on the computer.`;
    },
    async clipboard(a) {
      needShell();
      const pick = async (list) => { for (const c of list) if (await have(c[0])) return c; return null; };
      if (a.action === 'read') {
        let r;
        if (IS_WIN) r = await run('powershell', ['-NoProfile', '-Command', '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Clipboard -Raw'], { timeout: 10000 });
        else if (process.platform === 'darwin') r = await run('pbpaste', [], { timeout: 8000 });
        else { const c = await pick([['wl-paste', '--no-newline'], ['xclip', '-selection', 'clipboard', '-o'], ['xsel', '-b']]); if (!c) throw new Error('Reading the clipboard needs xclip, xsel or wl-clipboard installed on this computer.'); r = await run(c[0], c.slice(1), { timeout: 8000 }); }
        const t = String(r.stdout || '').replace(/\r\n/g, '\n').replace(/\s+$/, '');
        return t ? clip(t, 20000) : '(The clipboard is empty or holds something that is not text, such as a picture.)';
      }
      if (a.action === 'write') {
        const t = String(a.text || '').slice(0, 100000); if (!t) throw new Error('There is nothing to copy.');
        if (IS_WIN) await run('powershell', ['-NoProfile', '-Command', '[Console]::InputEncoding=[Text.Encoding]::UTF8; $t=[Console]::In.ReadToEnd(); Set-Clipboard -Value $t'], { timeout: 10000, input: t });
        else if (process.platform === 'darwin') await run('pbcopy', [], { timeout: 8000, input: t });
        else { const c = await pick([['wl-copy'], ['xclip', '-selection', 'clipboard', '-i'], ['xsel', '-b', '-i']]); if (!c) throw new Error('Copying needs xclip, xsel or wl-clipboard installed on this computer.'); await run(c[0], c.slice(1), { timeout: 8000, input: t }); }
        return `Copied ${t.length} characters to the computer's clipboard.`;
      }
      throw new Error('Clipboard actions: read, write.');
    },
    async pc_control(a) {
      needShell();
      const act = String(a.action || ''); const win = (cmd) => run('powershell', ['-NoProfile', '-Command', cmd], { timeout: 15000 });
      const key = (code) => `(New-Object -ComObject WScript.Shell).SendKeys([char]${code})`;
      const KEYS = { volume_up: 175, volume_down: 174, mute: 173, play_pause: 179, next: 176, previous: 177 };
      if (!['lock', 'sleep', 'volume_up', 'volume_down', 'mute', 'play_pause', 'next', 'previous'].includes(act)) throw new Error('Choose lock, sleep, volume_up, volume_down, mute, play_pause, next or previous.');
      const times = Math.min(10, Math.max(1, Number(a.times) || (act.startsWith('volume') ? 3 : 1)));
      if (IS_WIN) {
        if (act === 'lock') await run('rundll32.exe', ['user32.dll,LockWorkStation'], { timeout: 8000 });
        else if (act === 'sleep') { await run('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0'], { timeout: 8000 }); }
        else await win(Array.from({ length: times }, () => key(KEYS[act])).join('; '));
      } else if (process.platform === 'darwin') {
        if (act === 'lock') await run('pmset', ['displaysleepnow'], { timeout: 8000 });
        else if (act === 'sleep') await run('pmset', ['sleepnow'], { timeout: 8000 });
        else if (act === 'mute') await run('osascript', ['-e', 'set volume output muted not (output muted of (get volume settings))'], { timeout: 8000 });
        else if (act.startsWith('volume')) await run('osascript', ['-e', `set volume output volume ((output volume of (get volume settings)) ${act === 'volume_up' ? '+' : '-'} ${times * 6})`], { timeout: 8000 });
        else throw new Error('Music controls are not available on this kind of computer yet.');
      } else {
        if (act === 'lock') await run('loginctl', ['lock-session'], { timeout: 8000 });
        else if (act === 'sleep') await run('systemctl', ['suspend'], { timeout: 8000 });
        else if (act === 'mute') await run('pactl', ['set-sink-mute', '@DEFAULT_SINK@', 'toggle'], { timeout: 8000 });
        else if (act.startsWith('volume')) await run('pactl', ['set-sink-volume', '@DEFAULT_SINK@', `${act === 'volume_up' ? '+' : '-'}${times * 5}%`], { timeout: 8000 });
        else await run('playerctl', [act === 'play_pause' ? 'play-pause' : act], { timeout: 8000 });
      }
      return { lock: 'Locked the computer.', sleep: 'Putting the computer to sleep.', mute: 'Toggled mute.', volume_up: 'Turned the volume up.', volume_down: 'Turned the volume down.', play_pause: 'Pressed play/pause.', next: 'Skipped to the next track.', previous: 'Went back a track.' }[act];
    },
    async pc_health(a) { needShell(); return await pcHealth(run, a.kind === 'quick' ? 'quick' : 'full'); },
    async github(a) {
      const cred = await vaultGet(root, 'github'); // the token is saved on this computer as a login called "github"
      return await githubCall(cred.pass, a);
    },
    async read_file(a) {
      const f = safePath(root, a.path, extra());
      const st = fs.statSync(f);
      if (!st.isFile()) throw new Error('That is not a file.');
      const buf = fs.readFileSync(f).subarray(0, MAX_READ);
      if (buf.includes(0)) throw new Error('That looks like a binary file, not text.');
      return buf.toString('utf8') + (st.size > MAX_READ ? `\n...[file is ${st.size} bytes, showing the first ${MAX_READ}]` : '');
    },
    async write_file(a) {
      const f = safePath(root, a.path, extra());
      fs.mkdirSync(path.dirname(f), { recursive: true });
      const undoId = backupBeforeWrite(f);
      (a.append ? fs.appendFileSync : fs.writeFileSync)(f, a.content, 'utf8');
      return `${a.append ? 'Appended to' : 'Wrote'} ${f} (${Buffer.byteLength(a.content)} bytes)${undoId ? ` [undo:${undoId}]` : ''}`;
    },
    async shell(a) {
      needShell();
      const why = dangerousCommand(a.command);
      if (why) throw new Error(`Blocked for safety: this looks like ${why}. Dwenlite will not run it. If you really need it, run it yourself.`);
      const cwd = a.cwd ? safePath(root, a.cwd, extra()) : root;
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
    // bring the Dwenlite Home page (browser tab or installed app) back in front so the owner sees what happened
    async show_home() {
      if (IS_WIN) { const r = await ps(psFile('home', PS_HOME), []); return `Showed ${r.stdout.trim() || 'Dwenlite Home'}`; }
      if (!IS_MAC && (await have('xdotool'))) { await run('xdotool', ['search', '--name', 'Dwenlite Home', 'windowactivate', '--sync']); return 'Showed Dwenlite Home'; }
      return 'Returning to Dwenlite Home is not supported on this system.';
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
$exe=$null
$flags=@('--new-window',"--user-data-dir=$HOME\\dwenlite-browser",'--no-first-run','--no-default-browser-check','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--disable-background-timer-throttling','--disable-features=CalculateNativeWinOcclusion')
if ($id -like 'ChromeHTML*') { $exe='chrome' } elseif ($id -like 'MSEdgeHTM*') { $exe='msedge' } elseif ($id -like 'BraveHTML*') { $exe='brave' } elseif ($id -like 'FirefoxURL*') { $exe='firefox'; $flags=@('-new-window') }
if ($exe) { try { Start-Process $exe -ArgumentList ($flags + $u) -ErrorAction Stop; exit 0 } catch {} }
Start-Process $u`;
        await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
        return `Opened ${a.url} in a separate browser window with its own profile (it keeps running while hidden or behind other windows; sign in there once if a site needs it). Use list_windows to find its exact title.`;
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
      if (a.novision) return { text: 'Screen picture for the owner.', image: buf.length < 520000 ? buf.toString('base64') : '' }; // a live peek: no image model needed
      let text = '';
      try {
        const r = await see({ image: buf.toString('base64'), mime: buf[0] === 0xff ? 'image/jpeg' : 'image/png', look: a.look, width: sz.w, height: sz.h });
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
    const r = await fn(job.args || {}, job);
    return typeof r === 'string' ? { text: r, image: '' } : r;
  }

  // ---- what the tray icon and the cloud want to know: connected? busy? screen locked? ----
  const state = { lastOk: 0, busy: 0, locked: false };
  let awake = null; let awakeTimer = null;
  function keepAwake(on) { // while a task runs the computer must not go to sleep
    if (on) {
      clearTimeout(awakeTimer); awakeTimer = null;
      if (awake) return;
      try {
        if (IS_WIN) awake = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', "Add-Type -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint f);' -Name P -Namespace DW; while ($true) { [DW.P]::SetThreadExecutionState(0x80000001) | Out-Null; Start-Sleep 20 }"], { windowsHide: true, stdio: 'ignore' });
        else if (IS_MAC) awake = spawn('caffeinate', ['-i'], { stdio: 'ignore' });
        else awake = spawn('systemd-inhibit', ['--what=idle:sleep', '--who=Dwenlite', '--why=A task is running', 'sleep', '86400'], { stdio: 'ignore' });
        if (awake) awake.on('error', () => { awake = null; });
        if (awake) awake.on('exit', () => { awake = null; });
      } catch { awake = null; }
    } else if (awake && !awakeTimer) {
      awakeTimer = setTimeout(() => { try { awake && awake.kill(); } catch { /* gone */ } awake = null; awakeTimer = null; }, 60000);
    }
  }
  let lockTimer = null;
  const refreshLock = () => {
    if (IS_MAC) { execFile('ioreg', ['-n', 'Root', '-d1', '-a'], { timeout: 5000, maxBuffer: 2 * 1024 * 1024 }, (err, out) => { if (!err) state.locked = /<key>CGSSessionScreenIsLocked<\/key>\s*<true\/>/.test(String(out)); }); return; }
    if (!IS_WIN) { execFile('loginctl', ['show-session', process.env.XDG_SESSION_ID || 'self', '-p', 'LockedHint'], { timeout: 5000 }, (err, out) => { if (!err) state.locked = /LockedHint=yes/.test(String(out)); }); return; } execFile('tasklist', ['/FI', 'IMAGENAME eq LogonUI.exe', '/NH'], { windowsHide: true, timeout: 5000 }, (err, out) => { if (!err) state.locked = /LogonUI\.exe/i.test(String(out)); }); };

  async function loop(stop = { stopped: false }) {
    try { await loopInner(stop); } finally { for (const st of [...streams.values()]) { try { st.cleanup && st.cleanup(); } catch { /* gone */ } } try { localServer && localServer.close(); } catch { /* gone */ } localServer = null; }
  }
  async function loopInner(stop) {
    startLocalServer();
    if (!lockTimer) { refreshLock(); lockTimer = setInterval(refreshLock, 8000); lockTimer.unref && lockTimer.unref(); }
    log(`Dwenlite agent ${VERSION} started. Work folder: ${root}. Shell: ${opts.shell ? 'ON' : 'off'}. Screen/mouse/keyboard: ${opts.gui ? 'ON' : 'off'}.`);
    let fails = 0;
    // while a long job runs the main loop is busy, so a separate heartbeat keeps this computer shown as online (and live views working)
    const pollBody = (extra) => ({ platform: process.platform, hostname: os.hostname(), version: VERSION, caps: { shell: opts.shell, gui: opts.gui }, state: { locked: state.locked, busy: state.busy > 0 }, ...extra });
    let hbBusy = false;
    const hb = setInterval(async () => {
      if (!state.busy || hbBusy || stop.stopped) return; hbBusy = true;
      try { const r = await api('agent_poll', pollBody({ noJob: true })); state.lastOk = Date.now(); applyConfig(r.config); } catch (e) { if (e.fatal) stop.stopped = true; } finally { hbBusy = false; }
    }, 4000);
    hb.unref && hb.unref();
    try {
    while (!stop.stopped) {
      try {
        const { job, config } = await api('agent_poll', pollBody({}));
        fails = 0; state.lastOk = Date.now();
        applyConfig(config);
        if (job) {
          log(`job ${job.id}: ${job.type} ${job.type === 'shell' ? clip(job.args.command, 200) : job.type === 'browser_view' ? job.args.op : JSON.stringify(job.args).slice(0, 200)}`);
          let ok = true; let output = ''; let image = '';
          state.busy++; keepAwake(true);
          try { const r = await runJob(job); output = r.text; image = r.image || ''; } catch (e) { ok = false; output = e.message || String(e); } finally { state.busy--; if (!state.busy) keepAwake(false); }
          log(`job ${job.id}: ${ok ? 'done' : 'error'} - ${clip(output, 160).replace(/\n/g, ' ')}`);
          await api('agent_result', { jobId: job.id, ok, output, image });
          continue; // look for the next job straight away
        }
      } catch (e) {
        if (e.fatal) { log('STOPPED: ' + e.message); return; }
        fails++;
        log(`Cannot reach Dwenlite (${e.message}). Retrying...`);
        await sleep(Math.min(8000, 1500 * fails));
        continue;
      }
      await sleep(state.fast ? 450 : opts.interval);
    }
    } finally { clearInterval(hb); }
  }
  function applyConfig(config) {
    {
      {
        if (config && Array.isArray(config.folders)) extraRoots = config.folders.map(presetFolder).filter((f) => typeof f === 'string' && path.isAbsolute(f) && fs.existsSync(f)).map((f) => fs.realpathSync(f));
        state.fast = !!(config && config.fast);
        if (config && ['off', 'fallback', 'first'].includes(config.localVision)) localVis.mode = config.localVision;
        if (config && typeof config.localVisionModel === 'string') localVis.wanted = config.localVisionModel.slice(0, 60);
        cloudLive = new Set(Array.isArray(config && config.live) ? config.live.filter((k) => k === 'browser' || k === 'screen') : []);
        if (config && config.liveKey) { localKeys.set(String(config.liveKey), Date.now() + 20 * 60000); for (const [k, e] of localKeys) if (e < Date.now()) localKeys.delete(k); }
        for (const k of cloudLive) ensureStream(k);
        if (config && Array.isArray(config.watches) && config.watches.length) scanWatches(config.watches).catch(() => {});
      }
    }
  }
  return { loop, actions, runJob, api, log, state, see, localVis, shutdown: () => { for (const st of [...streams.values()]) { try { st.cleanup && st.cleanup(); } catch { /* gone */ } } try { localServer && localServer.close(); } catch { /* gone */ } try { awake && awake.kill(); } catch { /* gone */ } return browser.close(); } };
}

// ----------------------------------------------------------------------------- the installed app: pairing, saved settings, status, quick ask, self-update
export function configDir() {
  if (process.env.DWENLITE_CONFIG_DIR) return process.env.DWENLITE_CONFIG_DIR;
  if (IS_WIN) return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Dwenlite');
  if (IS_MAC) return path.join(os.homedir(), 'Library', 'Application Support', 'Dwenlite');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'dwenlite');
}
export async function saveConfig(dir, cfg) { // the device key is protected for this Windows/Mac/Linux user, never stored in the clear
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ url: cfg.url, deviceId: cfg.deviceId, name: cfg.name, shell: !!cfg.shell, gui: !!cfg.gui, token: await seal(cfg.token) }), { mode: 0o600 });
}
export async function loadConfig(dir) {
  try { const j = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')); return { ...j, token: await unseal(j.token) }; } catch { return null; }
}
export async function pairWithCode(code, { url = DEFAULT_URL, dir = configDir(), fetchFn = fetch } = {}) {
  const r = await fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'agent_pair', code, hostname: os.hostname(), platform: process.platform }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Could not pair (${r.status}).`);
  await saveConfig(dir, { url, deviceId: j.deviceId, name: j.name, shell: j.shell, gui: j.gui, token: j.token });
  return j;
}
const semver = (v) => String(v).split('.').map((x) => Number(x) || 0);
export const isNewer = (a, b) => { const x = semver(a); const y = semver(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
export async function checkForUpdate({ site = SITE, file, fetchFn = fetch, current = VERSION } = {}) { // true when a newer agent was saved and a restart is needed
  const r = await fetchFn(`${site}/dwenlite-agent.mjs`, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) return false;
  const text = await r.text();
  const m = /export const VERSION = '([\d.]+)'/.exec(text);
  if (!m || !isNewer(m[1], current) || !text.includes('createAgent')) return false;
  fs.writeFileSync(file + '.new', text); fs.renameSync(file + '.new', file);
  return m[1];
}
export function startServices(agent, { dir, name, site = SITE, file, onRestart }) {
  const secret = crypto.randomBytes(16).toString('hex'); let port = 0;
  const write = () => { try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'status.json'), JSON.stringify({ pid: process.pid, version: VERSION, name, connected: Date.now() - agent.state.lastOk < 20000, busy: agent.state.busy > 0, locked: agent.state.locked, port, secret, updated: Date.now() })); } catch { /* ignore */ } };
  const server = http.createServer((req, res) => { // the hotkey on this computer sends a quick question here
    const done = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.method !== 'POST' || req.url !== '/quick' || req.headers['x-dwenlite'] !== secret) return done(403, { error: 'No.' });
    let b = ''; req.on('data', (c) => { b += c; if (b.length > 20000) req.destroy(); });
    req.on('end', async () => { try { const t = String(JSON.parse(b || '{}').text || '').trim(); if (!t) return done(400, { error: 'Nothing to ask.' }); await agent.api('agent_quick', { text: t }); done(200, { ok: true }); } catch (e) { done(502, { error: e.message }); } });
  });
  server.listen(0, '127.0.0.1', () => { port = server.address().port; write(); });
  const t1 = setInterval(write, 4000);
  const check = async () => { try { const v = await checkForUpdate({ site, file }); if (v) { agent.log(`Updated to ${v}. Restarting.`); onRestart && onRestart(v); } } catch { /* try again later */ } };
  const t2 = setInterval(check, 30 * 60000); setTimeout(check, 20000);
  return { stop: () => { clearInterval(t1); clearInterval(t2); try { server.close(); } catch { /* ignore */ } try { fs.unlinkSync(path.join(dir, 'status.json')); } catch { /* ignore */ } } };
}

// ----------------------------------------------------------------------------- start
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv[2] === 'vault') {
  // run on THIS computer: node dwenlite-agent.mjs vault add | list | remove <name>
  const { createInterface } = await import('node:readline');
  const o = parseArgs(process.argv.slice(3)); const rootDir = o.root;
  const ask = (q, hidden) => new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) { rl._writeToOutput = (s) => { if (s.includes(q)) rl.output.write(s); else rl.output.write(''); }; }
    rl.question(q, (v) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(v); });
  });
  const sub = process.argv[3];
  if (sub === 'add') {
    const name = (await ask('Name for this login (for example: Gmail): ')).trim(); const host = (await ask('Website address (for example: gmail.com or accounts.google.com): ')).trim();
    const user = (await ask('Username or email: ')).trim(); const pass = await ask('Password (hidden): ', true);
    try { await vaultSet(rootDir, { name, host, user, pass }); console.log(`Saved "${name}". The password is encrypted on this computer and is never sent anywhere.`); } catch (e) { console.error('Could not save: ' + e.message); process.exit(1); }
  } else if (sub === 'list') { const n = vaultNames(rootDir); console.log(n.length ? n.map((x) => `${x.name}  (${x.host})`).join('\n') : 'No logins saved.'); }
  else if (sub === 'remove') { const name = process.argv[4] || (await ask('Name to remove: ')).trim(); console.log(vaultRemove(rootDir, name) ? `Removed "${name}".` : 'No login with that name.'); }
  else console.log('Usage: node dwenlite-agent.mjs vault add | list | remove <name>');
  process.exit(0);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv[2] === 'pair') {
  // node dwenlite-agent.mjs pair ABCD-EFGH   (the code comes from Dwenlite Home > Add a computer)
  const code = process.argv.slice(3).join(''); // a code typed with a space still works
  try { const r = await pairWithCode(code, { url: process.env.DWENLITE_URL || DEFAULT_URL }); console.log(`Paired: ${r.name}`); process.exit(0); }
  catch (e) { console.error(e.message); process.exit(1); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && (process.argv[2] === 'run' || (process.argv.length <= 2))) {
  // the installed app: uses the saved pairing, shows its status to the tray icon, keeps itself up to date
  const dir = configDir(); const cfg = await loadConfig(dir);
  if (!cfg) { console.error('This computer is not paired yet. Run: node dwenlite-agent.mjs pair <code from Dwenlite Home>'); process.exit(1); }
  const major = Number(process.versions.node.split('.')[0]); if (major < 18) { console.error('Node 18 or newer is needed.'); process.exit(1); }
  const o = { ...parseArgs(process.argv.slice(3)), url: cfg.url, device: cfg.deviceId, token: cfg.token, shell: cfg.shell, gui: cfg.gui };
  const agent = createAgent(o); const stop = { stopped: false };
  const services = startServices(agent, { dir, name: cfg.name, file: fileURLToPath(import.meta.url), onRestart: () => { stop.stopped = true; setTimeout(() => process.exit(3), 500); } });
  process.on('SIGINT', () => { stop.stopped = true; services.stop(); agent.shutdown().catch(() => {}); setTimeout(() => process.exit(0), 600); });
  process.on('exit', () => { services.stop(); agent.shutdown().catch(() => {}); });
  await agent.loop(stop);
  if (!stop.stopped) { try { fs.writeFileSync(path.join(dir, 'removed.flag'), 'removed'); } catch { /* ignore */ } process.exit(2); } // 2 = removed in Dwenlite Home: do not restart
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv[2] !== 'vault' && process.argv[2] !== 'pair' && process.argv[2] !== 'run' && process.argv.length > 2) {
  const o = parseArgs(process.argv.slice(2));
  if (o.help || !o.url || !o.device || !o.token) {
    console.log('Usage: node dwenlite-agent.mjs --url <API URL> --device <ID> --token <TOKEN> [--root <folder>] [--allow-shell] [--allow-gui] [--interval 3000]');
    process.exit(o.help ? 0 : 1);
  }
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 18) { console.error('Node 18 or newer is needed. You have ' + process.version); process.exit(1); }
  const agent = createAgent(o);
  const stop = { stopped: false };
  process.on('SIGINT', () => { stop.stopped = true; console.log('\nStopping...'); agent.shutdown().catch(() => {}); setTimeout(() => process.exit(0), 600); });
  process.on('exit', () => { agent.shutdown().catch(() => {}); });
  agent.loop(stop).then(() => { if (!stop.stopped) process.exit(2); }); // 2 = this device was removed, do not restart
}
