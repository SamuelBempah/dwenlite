// Pure helpers for scheduled routines: when to run next, and what an unattended run may do.

function tzOffsetMs(utcMs, tz) {
  const p = {};
  new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" })
    .formatToParts(new Date(utcMs)).forEach((x) => { p[x.type] = Number(x.value); });
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour === 24 ? 0 : p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000) * 60000;
}
function zonedToUtc(y, m, d, h, mi, tz) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const off = tzOffsetMs(guess, tz);
  let utc = guess - off;
  const off2 = tzOffsetMs(utc, tz);
  if (off2 !== off) utc = guess - off2;
  return utc;
}
const validTz = (tz) => { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; } };

// schedule: { kind: "interval", everyMinutes } | { kind: "daily" | "weekdays", time: "HH:MM", tz }
function computeNextRun(schedule, now = Date.now()) {
  if (!schedule || !schedule.kind) return 0;
  if (schedule.kind === "interval") return now + Math.max(15, Math.min(1440, Number(schedule.everyMinutes) || 60)) * 60000;
  const m = /^(\d{1,2}):(\d{2})$/.exec(schedule.time || "");
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return 0;
  const tz = validTz(schedule.tz) ? schedule.tz : "UTC";
  const local = {};
  new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date(now)).forEach((x) => { local[x.type] = Number(x.value); });
  for (let add = 0; add < 9; add++) {
    const day = new Date(Date.UTC(local.year, local.month - 1, local.day + add));
    const dow = day.getUTCDay();
    if (schedule.kind === "weekdays" && (dow === 0 || dow === 6)) continue;
    const t = zonedToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), Number(m[1]), Number(m[2]), tz);
    if (t > now) return t;
  }
  return 0;
}

// What a routine may do when nobody is there to approve. Reading and looking are always fine; changing things needs "allow actions".
const SAFE = {
  always: new Set(["web_search", "read_page", "remember", "update_plan", "read_file", "list_dir", "system_info", "list_windows", "network_scan", "screenshot"]),
  browser: new Set(["open", "read", "scroll", "back", "tabs", "screenshot", "close"]),
  git: new Set(["status", "diff", "log", "show", "branch"]),
  android: new Set(["devices", "info", "read", "screenshot", "apps"]),
};
function allowedUnattended(name, args = {}, allowActions = false) {
  if (SAFE.always.has(name)) return true;
  if (name === "browser") return allowActions || SAFE.browser.has(args.action);
  if (name === "git") return allowActions || SAFE.git.has(args.action);
  if (name === "android") return allowActions || SAFE.android.has(args.action);
  if (name === "document") return allowActions || args.action === "read";
  if (name === "app_ui") return allowActions || args.action === "read";
  if (name.startsWith("google_")) return !!allowActions;
  if (name === "lan_http") return allowActions || String(args.method || "GET").toUpperCase() === "GET";
  if (["run_shell", "write_file", "click", "type_text", "press_key", "scroll", "open_url", "run_tests", "send_file"].includes(name)) return !!allowActions;
  return false;
}

module.exports = { computeNextRun, zonedToUtc, tzOffsetMs, validTz, allowedUnattended };
