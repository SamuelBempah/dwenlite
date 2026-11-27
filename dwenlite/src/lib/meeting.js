import { auth } from '../firebase';

export const MEETING_URL = 'https://us-central1-leumas-decipher-softwares.cloudfunctions.net/meetingApi';

export async function meetingCall(action, body = {}) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(MEETING_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ action, ...body }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(j.error || `Request failed (${res.status})`); e.status = res.status; throw e; }
  return j;
}

export const LANGS = [
  ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['en-NG', 'English (Nigeria)'], ['en-GH', 'English (Ghana)'], ['en-ZA', 'English (South Africa)'],
  ['fr-FR', 'Français'], ['es-ES', 'Español'], ['de-DE', 'Deutsch'], ['pt-BR', 'Português'], ['it-IT', 'Italiano'],
  ['ar-SA', 'العربية'], ['hi-IN', 'हिन्दी'], ['sw-KE', 'Kiswahili'], ['zh-CN', '中文'], ['ja-JP', '日本語'],
];
export const langName = (code) => (LANGS.find((l) => l[0] === code) || ['', 'English'])[1].replace(/ \(.*\)/, '');

export const speechSupported = () => typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

// Someone is inviting questions: a cue to suggest some.
const CUE = /\b(any (other )?questions?|questions\??|do you have (any )?questions|anything (else|more) (you('d| would) like|to add)|want to (ask|add)|comments or questions|open (it )?up|over to you|your thoughts|what do you think|does that make sense|is that clear|any thoughts|anything from you)\b/i;
export const looksLikeQuestionCue = (text) => CUE.test(text || '');

// Continuous speech-to-text that keeps itself alive (browsers stop it every so often).
export function createRecognizer({ lang, onInterim, onFinal, onError, onState }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null; let want = false; let restarts = 0;
  const start = () => {
    rec = new SR();
    rec.continuous = true; rec.interimResults = true; rec.lang = lang; rec.maxAlternatives = 1;
    rec.onstart = () => { restarts = 0; onState && onState('listening'); };
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) { const t = (r[0].transcript || '').trim(); if (t) onFinal(t); } else interim += r[0].transcript;
      }
      onInterim(interim.trim());
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { want = false; onError && onError('Microphone access was blocked. Allow the microphone for this site and try again.'); onState && onState('idle'); return; }
      if (e.error === 'audio-capture') { want = false; onError && onError('No microphone was found.'); onState && onState('idle'); return; }
      onError && onError(`Speech recognition hiccup (${e.error}). Retrying...`);
    };
    rec.onend = () => {
      onInterim('');
      if (!want) return;
      restarts += 1;
      setTimeout(() => { if (want) { try { start(); } catch { /* already started */ } } }, Math.min(2000, 150 * restarts));
    };
    try { rec.start(); } catch { /* already started */ }
  };
  return {
    start() { want = true; onState && onState('starting'); start(); },
    stop() { want = false; try { rec && rec.stop(); } catch { /* ignore */ } onInterim(''); onState && onState('idle'); },
    setLang(l) { lang = l; },
  };
}

// ---- reading uploaded files so the assistant can use them as context ----
async function pdfText(file) {
  const buf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
  let out = '';
  for (let p = 1; p <= pdf.numPages && out.length < 120000; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    out += tc.items.map((i) => i.str).join(' ') + '\n';
  }
  return out;
}
async function pptxText(file) {
  const JSZip = (await import('jszip')).default;
  const zip = await new JSZip().loadAsync(file);
  const slides = Object.keys(zip.files).filter((p) => /ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a, b) => parseInt(a.match(/(\d+)\.xml/)[1], 10) - parseInt(b.match(/(\d+)\.xml/)[1], 10));
  let out = '';
  for (const s of slides) {
    const xml = await zip.file(s).async('text');
    out += ((xml.match(/<a:t>([\s\S]*?)<\/a:t>/g) || []).map((t) => t.replace(/<\/?a:t>/g, '')).join(' ')) + '\n';
  }
  return out;
}
export async function extractFileText(file) {
  const name = file.name.toLowerCase();
  let text = '';
  if (name.endsWith('.pdf')) text = await pdfText(file);
  else if (name.endsWith('.docx')) text = (await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
  else if (name.endsWith('.pptx')) text = await pptxText(file);
  else if (/\.(txt|md|csv|json|srt|vtt)$/.test(name) || file.type.startsWith('text/')) text = await file.text();
  else throw new Error('Use a PDF, Word (.docx), PowerPoint (.pptx) or text file.');
  text = text.replace(/\s+\n/g, '\n').trim();
  if (!text) throw new Error('No readable text found in that file.');
  return text;
}

export const fmtClock = (ms) => { const s = Math.floor(ms / 1000); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const x = s % 60; return `${h ? h + ':' : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(x).padStart(2, '0')}`; };
