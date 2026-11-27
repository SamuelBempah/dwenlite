import { useEffect, useState } from 'react';
import { auth } from '../firebase';

export const HOME_URL = 'https://us-central1-leumas-decipher-softwares.cloudfunctions.net/homeApi';

async function headers() {
  const token = await auth.currentUser?.getIdToken();
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

// One request to the Dwenlite Home API (admin only; the server checks).
export async function homeCall(action, body = {}) {
  const res = await fetch(HOME_URL, { method: 'POST', headers: await headers(), body: JSON.stringify({ action, ...body }) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(j.error || `Request failed (${res.status})`); e.status = res.status; e.code = j.code; throw e; }
  return j;
}

// The assistant's answer, streamed. Resolves with { text, tools: [{ id, name, arguments }] }.
export async function homeChatStream({ messages, devices, onText, signal }) {
  const res = await fetch(HOME_URL, { method: 'POST', headers: await headers(), body: JSON.stringify({ action: 'chat', messages, devices }), signal });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    const e = new Error(j.error || `Request failed (${res.status})`); e.status = res.status; throw e;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let text = '';
  let tools = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const ev = buf.slice(0, i);
      buf = buf.slice(i + 2);
      if (!ev.startsWith('data:')) continue;
      let j;
      try { j = JSON.parse(ev.slice(5)); } catch { continue; }
      if (j.error) throw new Error(j.error);
      if (j.t) { text += j.t; onText?.(text); }
      if (j.tools) tools = j.tools;
    }
  }
  return { text, tools };
}

// ---------------------------------------------------------------- images
// Shrinks a photo or screenshot to about 1600px so it uploads quickly and costs almost nothing.
export function resizeImage(file, maxDim = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process the image.'))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image. Try a JPG or PNG.')); };
    img.src = url;
  });
}

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] || '');
  r.onerror = () => reject(new Error('Could not read the image.'));
  r.readAsDataURL(blob);
});

export const IMAGE_MODES = [
  { id: 'describe', label: 'Describe' },
  { id: 'ocr', label: 'Read text' },
  { id: 'translate', label: 'Translate' },
  { id: 'ui', label: 'Screen / error' },
];

// Picture -> text. The free image model (Gemini) does the seeing; DeepSeek then works on the text.
// With no image model configured, the text is read on this device instead (Tesseract, free).
export async function imageToText(file, { mode = 'describe', instruction = '' } = {}) {
  const blob = await resizeImage(file);
  try {
    const { text } = await homeCall('see', { image: await blobToBase64(blob), mime: 'image/jpeg', mode, instruction, lang: 'English' });
    return { text, via: 'image model' };
  } catch (e) {
    if (e.code !== 'no_vision') throw e;
    const { default: Tesseract } = await import('tesseract.js');
    const r = await Tesseract.recognize(blob, 'eng');
    const text = (r.data.text || '').trim();
    return { text: text ? `(Text read on this device. No image model is configured, so only text is available, not a description.)\n${text}` : '(No readable text was found, and no image model is configured to describe the picture.)', via: 'on-device text reading' };
  }
}

// ---------------------------------------------------------------- code sandbox
// Runs JavaScript in a throw-away Worker (no page access) with a time limit.
export function runJs(code, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const src = `
      const logs = [];
      const fmt = (a) => a.map((x) => typeof x === 'string' ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })()).join(' ');
      console.log = (...a) => logs.push(fmt(a)); console.info = console.log; console.warn = console.log;
      console.error = (...a) => logs.push('ERROR: ' + fmt(a));
      onmessage = async (e) => {
        try { const result = await (0, eval)(e.data); postMessage({ logs, result: result === undefined ? undefined : fmt([result]) }); }
        catch (err) { postMessage({ logs, error: String((err && err.stack) || err) }); }
      };`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const worker = new Worker(url);
    const done = (v) => { clearTimeout(timer); worker.terminate(); URL.revokeObjectURL(url); resolve(v); };
    const timer = setTimeout(() => done({ logs: [], error: `Stopped: it ran longer than ${timeoutMs / 1000} seconds.` }), timeoutMs);
    worker.onmessage = (e) => done(e.data);
    worker.onerror = (e) => done({ logs: [], error: e.message || 'The code crashed.' });
    worker.postMessage(code);
  });
}

export const formatJsResult = (r) => [
  ...(r.logs || []),
  r.result !== undefined ? `=> ${r.result}` : '',
  r.error ? `ERROR: ${r.error}` : '',
].filter(Boolean).join('\n') || '(no output)';

// True when the signed-in user is the owner. Remembered per account so other users never trigger repeated checks.
export function useIsOwner() {
  const read = () => { try { return localStorage.getItem('dwenliteAdmin') === '1'; } catch { return false; } };
  const [owner, setOwner] = useState(read);
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) return;
      let checked = '';
      try { checked = localStorage.getItem('dwenliteAdminChecked') || ''; } catch { /* ignore */ }
      if (checked === user.uid) { setOwner(read()); return; }
      try {
        await homeCall('whoami');
        try { localStorage.setItem('dwenliteAdmin', '1'); localStorage.setItem('dwenliteAdminChecked', user.uid); } catch { /* ignore */ }
        setOwner(true);
      } catch (e) {
        if (e.status === 403) { try { localStorage.setItem('dwenliteAdmin', '0'); localStorage.setItem('dwenliteAdminChecked', user.uid); } catch { /* ignore */ } setOwner(false); }
      }
    });
    return unsub;
  }, []);
  return owner;
}

// True when the signed-in user is an admin (the server decides: the owner, the ADMIN_EMAILS setting, or someone added on the usage page).
export function useIsAdmin() {
  const [admin, setAdmin] = useState(() => { try { return localStorage.getItem('dwenliteIsAdmin') === auth.currentUser?.uid; } catch { return false; } });
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) { setAdmin(false); return; }
      try { setAdmin(localStorage.getItem('dwenliteIsAdmin') === user.uid); } catch { /* ignore */ }
      try {
        const r = await homeCall('whoami');
        const yes = r.admin === true;
        setAdmin(yes);
        try { if (yes) localStorage.setItem('dwenliteIsAdmin', user.uid); else localStorage.removeItem('dwenliteIsAdmin'); } catch { /* ignore */ }
      } catch { /* offline: keep what we knew */ }
    });
    return unsub;
  }, []);
  return admin;
}
