// Who is an admin: the owner (built in, cannot be removed), the ADMIN_EMAILS setting, and admins added from inside the app.
const OWNER_EMAILS = ["ixy.chase@gmail.com"];

// lowercase, no spaces; for Gmail dots and +tags do not change the mailbox
const normEmail = (e) => {
  const x = String(e || "").toLowerCase().replace(/\s+/g, "");
  const m = /^([^@]+)@(gmail\.com|googlemail\.com)$/.exec(x);
  return m ? `${m[1].split("+")[0].replace(/\./g, "")}@gmail.com` : x;
};
const validEmail = (e) => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/.test(String(e || "").trim()) && String(e).length <= 120;

function create({ db, ADMIN_EMAILS, ttlMs = 20000 }) {
  const ref = () => db.collection("appConfig").doc("admins");
  let cache = null; let at = 0;
  async function stored() {
    if (cache && Date.now() - at < ttlMs) return cache;
    let emails = [];
    try { const s = await ref().get(); emails = (s.exists && Array.isArray(s.data().emails) ? s.data().emails : []).filter((x) => typeof x === "string"); } catch (e) { /* none yet */ }
    cache = emails; at = Date.now();
    return emails;
  }
  const fromEnv = () => String(ADMIN_EMAILS && ADMIN_EMAILS.value ? ADMIN_EMAILS.value() : "").split(/[,;]+/).map((x) => x.trim()).filter(Boolean);
  async function all() {
    const seen = new Set(); const out = [];
    const add = (email, source) => { const k = normEmail(email); if (k && !seen.has(k)) { seen.add(k); out.push({ email, source }); } };
    OWNER_EMAILS.forEach((e) => add(e, "owner"));
    fromEnv().forEach((e) => add(e, "setting"));
    (await stored()).forEach((e) => add(e, "added"));
    return out;
  }
  async function isAdmin(decoded) {
    if (!decoded || !decoded.email || !decoded.email_verified) return false;
    const me = normEmail(decoded.email);
    return (await all()).some((a) => normEmail(a.email) === me);
  }
  async function add(email) {
    const e = String(email || "").trim().toLowerCase();
    if (!validEmail(e)) throw Object.assign(new Error("That does not look like an email address."), { status: 400 });
    const list = (await stored()).slice();
    if ((await all()).some((a) => normEmail(a.email) === normEmail(e))) return all();
    if (list.length >= 50) throw Object.assign(new Error("You can add up to 50 admins."), { status: 400 });
    list.push(e);
    await ref().set({ emails: list });
    cache = list; at = Date.now();
    return all();
  }
  async function remove(email, requesterEmail) {
    const k = normEmail(email);
    if (OWNER_EMAILS.some((o) => normEmail(o) === k)) throw Object.assign(new Error("The owner cannot be removed."), { status: 400 });
    if (k === normEmail(requesterEmail)) throw Object.assign(new Error("You cannot remove yourself."), { status: 400 });
    if (fromEnv().some((x) => normEmail(x) === k)) throw Object.assign(new Error("That admin comes from the server setting (ADMIN_EMAILS). Remove it there."), { status: 400 });
    const list = (await stored()).filter((x) => normEmail(x) !== k);
    await ref().set({ emails: list });
    cache = list; at = Date.now();
    return all();
  }
  return { isAdmin, all, add, remove, normEmail, OWNER_EMAILS };
}

module.exports = { create, normEmail, validEmail, OWNER_EMAILS };
