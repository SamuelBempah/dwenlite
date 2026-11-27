// Gmail and Calendar for cloud tasks. The short-lived Google permission comes from the owner's browser with each task and is never stored.
function create({ axios }) {
  const NOT_CONNECTED = "Google is not connected (or the permission ran out). Ask the owner to open Settings in Dwenlite Home and tap Connect Google, then try again.";
  async function g(token, method, url, data) {
    if (!token) throw new Error(NOT_CONNECTED);
    try {
      const r = await axios({ method, url, data, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, timeout: 20000 });
      return r.data;
    } catch (e) {
      const st = e.response && e.response.status;
      if (st === 401) throw new Error(NOT_CONNECTED);
      const m = (e.response && e.response.data && e.response.data.error && (e.response.data.error.message || e.response.data.error)) || e.message;
      throw new Error(/has not been used|disabled/i.test(String(m)) ? `${m} (the owner must switch that Google API on in the Google Cloud console)` : String(m).slice(0, 300));
    }
  }
  const b64urlDecode = (s) => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  const header = (m, n) => ((m.payload && m.payload.headers) || []).find((h) => h.name.toLowerCase() === n.toLowerCase());
  const hv = (m, n) => (header(m, n) || {}).value || "";
  const textOf = (part) => {
    if (!part) return "";
    if (part.mimeType === "text/plain" && part.body && part.body.data) return b64urlDecode(part.body.data);
    const kids = (part.parts || []).map(textOf).filter(Boolean);
    if (kids.length) return kids.join("\n");
    if (part.mimeType === "text/html" && part.body && part.body.data) return b64urlDecode(part.body.data).replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
    return "";
  };
  async function run(name, a, token) {
    if (name === "google_mail") {
      if (a.action === "search") {
        const list = await g(token, "get", `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${Math.min(15, Math.max(1, Number(a.max) || 8))}&q=${encodeURIComponent(String(a.query || "in:inbox"))}`);
        const ids = (list.messages || []).map((m) => m.id);
        if (!ids.length) return "No emails matched.";
        const rows = await Promise.all(ids.map((id) => g(token, "get", `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`)));
        return rows.map((m) => `id: ${m.id}\nfrom: ${hv(m, "From")}\ndate: ${hv(m, "Date")}\nsubject: ${hv(m, "Subject")}\n${m.snippet || ""}`).join("\n\n");
      }
      if (a.action === "read") {
        const m = await g(token, "get", `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(String(a.id || ""))}?format=full`);
        return `from: ${hv(m, "From")}\nto: ${hv(m, "To")}\ndate: ${hv(m, "Date")}\nsubject: ${hv(m, "Subject")}\n\n${textOf(m.payload).replace(/\n{3,}/g, "\n\n").trim().slice(0, 6000) || "(no readable text)"}`;
      }
      if (a.action === "draft") {
        const to = String(a.to || "").replace(/[\r\n]/g, ""); const subject = String(a.subject || "").replace(/[\r\n]/g, " ");
        const raw = `To: ${to}\r\nSubject: =?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${String(a.body || "")}`;
        const d = await g(token, "post", "https://gmail.googleapis.com/gmail/v1/users/me/drafts", { message: { raw: Buffer.from(raw, "utf8").toString("base64url") } });
        return `Draft saved in Gmail (id ${d.id}) to ${to || "(no recipient yet)"}. It was NOT sent: the owner reviews and sends it from Gmail.`;
      }
      throw new Error("Mail actions: search, read, draft.");
    }
    if (name === "google_calendar") {
      if (a.action === "list") {
        const from = a.from ? new Date(a.from) : new Date(); const to = new Date(from.getTime() + Math.min(60, Math.max(1, Number(a.days) || 7)) * 86400000);
        const j = await g(token, "get", `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=50&timeMin=${encodeURIComponent(from.toISOString())}&timeMax=${encodeURIComponent(to.toISOString())}`);
        return (j.items || []).map((e) => `${(e.start && (e.start.dateTime || e.start.date)) || "?"} to ${(e.end && (e.end.dateTime || e.end.date)) || "?"}: ${e.summary || "(no title)"}${e.location ? ` at ${e.location}` : ""}`).join("\n") || "Nothing scheduled in that time.";
      }
      if (a.action === "create") {
        const start = new Date(a.start); const end = a.end ? new Date(a.end) : new Date(start.getTime() + 3600000);
        if (isNaN(start) || isNaN(end)) throw new Error("Give the start (and end) as a date and time, like 2026-12-01T14:00:00.");
        const ev = await g(token, "post", "https://www.googleapis.com/calendar/v3/calendars/primary/events", { summary: String(a.title || "Event"), description: a.description ? String(a.description) : undefined, start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() }, attendees: Array.isArray(a.attendees) ? a.attendees.map((e) => ({ email: String(e) })).slice(0, 20) : undefined });
        return `Event created: ${ev.summary} on ${ev.start && ev.start.dateTime}. ${ev.htmlLink || ""}`;
      }
      throw new Error("Calendar actions: list, create.");
    }
    throw new Error("Unknown Google tool.");
  }
  return { run };
}
module.exports = { create };
