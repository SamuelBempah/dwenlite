import { GoogleAuthProvider, reauthenticateWithPopup } from 'firebase/auth';
import { auth } from '../firebase';

// Gmail and Calendar are used straight from this browser with a short-lived Google permission. Nothing is stored on our server.
const KEY = 'dwenliteGoogle';
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.compose', 'https://www.googleapis.com/auth/calendar.events'];

export function googleStatus() {
  try { const j = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (j && j.exp > Date.now() + 30000) return { connected: true, until: j.exp }; } catch { /* ignore */ }
  return { connected: false };
}
export async function connectGoogle() {
  if (!auth.currentUser) throw new Error('Please sign in first.');
  const provider = new GoogleAuthProvider();
  SCOPES.forEach((s) => provider.addScope(s));
  provider.setCustomParameters({ login_hint: auth.currentUser.email || '' });
  const res = await reauthenticateWithPopup(auth.currentUser, provider);
  const cred = GoogleAuthProvider.credentialFromResult(res);
  if (!cred || !cred.accessToken) throw new Error('Google did not give permission.');
  sessionStorage.setItem(KEY, JSON.stringify({ token: cred.accessToken, exp: Date.now() + 55 * 60 * 1000 }));
  return true;
}
export const disconnectGoogle = () => { try { sessionStorage.removeItem(KEY); } catch { /* ignore */ } };
const token = () => { try { const j = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (j && j.exp > Date.now()) return j.token; } catch { /* ignore */ } return ''; };
const NOT_CONNECTED = 'Google is not connected (or the permission ran out). Ask the owner to open Settings in Dwenlite Home and tap "Connect Google", then try again.';

async function g(url, opts = {}) {
  const t = token(); if (!t) throw new Error(NOT_CONNECTED);
  const r = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { disconnectGoogle(); throw new Error(NOT_CONNECTED); }
  if (!r.ok) { const m = (j.error && (j.error.message || j.error)) || `Google said ${r.status}`; throw new Error(/has not been used|disabled/i.test(String(m)) ? `${m} (the owner must switch that Google API on in the Google Cloud console)` : String(m)); }
  return j;
}
const b64urlDecode = (s) => { try { return decodeURIComponent(escape(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')))); } catch { try { return atob(String(s).replace(/-/g, '+').replace(/_/g, '/')); } catch { return ''; } } };
const b64urlEncode = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const header = (m, n) => ((m.payload && m.payload.headers) || []).find((h) => h.name.toLowerCase() === n.toLowerCase())?.value || '';
const textOf = (part) => {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body && part.body.data) return b64urlDecode(part.body.data);
  const kids = (part.parts || []).map(textOf).filter(Boolean);
  if (kids.length) return kids.join('\n');
  if (part.mimeType === 'text/html' && part.body && part.body.data) return b64urlDecode(part.body.data).replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  return '';
};

export async function runGoogleTool(name, a) {
  if (name === 'google_mail') {
    if (a.action === 'search') {
      const list = await g(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${Math.min(15, Math.max(1, Number(a.max) || 8))}&q=${encodeURIComponent(String(a.query || 'in:inbox'))}`);
      const ids = (list.messages || []).map((m) => m.id);
      if (!ids.length) return 'No emails matched.';
      const rows = await Promise.all(ids.map((id) => g(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`)));
      return rows.map((m) => `id: ${m.id}\nfrom: ${header(m, 'From')}\ndate: ${header(m, 'Date')}\nsubject: ${header(m, 'Subject')}\n${m.snippet || ''}`).join('\n\n');
    }
    if (a.action === 'read') {
      const m = await g(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(String(a.id || ''))}?format=full`);
      return `from: ${header(m, 'From')}\nto: ${header(m, 'To')}\ndate: ${header(m, 'Date')}\nsubject: ${header(m, 'Subject')}\n\n${textOf(m.payload).replace(/\n{3,}/g, '\n\n').trim().slice(0, 6000) || '(no readable text)'}`;
    }
    if (a.action === 'draft') {
      const to = String(a.to || '').replace(/[\r\n]/g, ''); const subject = String(a.subject || '').replace(/[\r\n]/g, ' ');
      const raw = `To: ${to}\r\nSubject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${String(a.body || '')}`;
      const d = await g('https://gmail.googleapis.com/gmail/v1/users/me/drafts', { method: 'POST', body: JSON.stringify({ message: { raw: b64urlEncode(raw) } }) });
      return `Draft saved in Gmail (id ${d.id}) to ${to || '(no recipient yet)'}. It was NOT sent: the owner reviews and sends it from Gmail.`;
    }
    throw new Error('Mail actions: search, read, draft.');
  }
  if (name === 'google_calendar') {
    if (a.action === 'list') {
      const from = a.from ? new Date(a.from) : new Date(); const to = new Date(from.getTime() + Math.min(60, Math.max(1, Number(a.days) || 7)) * 86400000);
      const j = await g(`https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=50&timeMin=${encodeURIComponent(from.toISOString())}&timeMax=${encodeURIComponent(to.toISOString())}`);
      return (j.items || []).map((e) => `${(e.start && (e.start.dateTime || e.start.date)) || '?'} to ${(e.end && (e.end.dateTime || e.end.date)) || '?'}: ${e.summary || '(no title)'}${e.location ? ` at ${e.location}` : ''}`).join('\n') || 'Nothing scheduled in that time.';
    }
    if (a.action === 'create') {
      const start = new Date(a.start); const end = a.end ? new Date(a.end) : new Date(start.getTime() + 3600000);
      if (isNaN(start) || isNaN(end)) throw new Error('Give the start (and end) as a date and time, like 2026-12-01T14:00:00.');
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const ev = await g('https://www.googleapis.com/calendar/v3/calendars/primary/events', { method: 'POST', body: JSON.stringify({ summary: String(a.title || 'Event'), description: a.description ? String(a.description) : undefined, start: { dateTime: start.toISOString(), timeZone: tz }, end: { dateTime: end.toISOString(), timeZone: tz }, attendees: Array.isArray(a.attendees) ? a.attendees.map((e) => ({ email: String(e) })).slice(0, 20) : undefined }) });
      return `Event created: ${ev.summary} on ${ev.start && ev.start.dateTime}. ${ev.htmlLink || ''}`;
    }
    throw new Error('Calendar actions: list, create.');
  }
  throw new Error('Unknown Google tool.');
}
