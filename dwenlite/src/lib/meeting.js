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
        if (r.isFinal) { const t = (r[0].transcript || '').trim(); if (t) onFinal({ text: t, speaker: null }); } else interim += r[0].transcript;
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

// ---- high-accuracy mode: Deepgram over a WebSocket, with noise suppression and speaker labels ----
export const hqSupported = () => typeof window !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.WebSocket && (window.AudioContext || window.webkitAudioContext));

// names and unusual words from the user's notes and files, so the recogniser spells them right
export function extractTerms(...texts) {
  const text = texts.filter(Boolean).join('\n').slice(0, 60000);
  const counts = new Map();
  for (const m of text.matchAll(/\b[A-Z][A-Za-z0-9&'-]{2,24}(?:\s+[A-Z][A-Za-z0-9&'-]{2,24}){0,2}\b/g)) counts.set(m[0], (counts.get(m[0]) || 0) + 1);
  const stop = new Set(['The', 'This', 'That', 'These', 'Those', 'And', 'But', 'For', 'With', 'From', 'Our', 'You', 'Your', 'They', 'Then', 'When', 'What', 'Who', 'How', 'Why', 'Here', 'There', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']);
  return [...counts.entries()].filter(([w]) => !stop.has(w)).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([w]) => w);
}

const dgLang = (code) => ({ 'zh-CN': 'zh', 'ja-JP': 'ja' }[code] || code.split('-')[0]);

// groups Deepgram words into one entry per consecutive speaker
export function groupWords(words) {
  const out = [];
  for (const w of words || []) {
    const sp = typeof w.speaker === 'number' ? w.speaker : null;
    const word = w.punctuated_word || w.word || '';
    const last = out[out.length - 1];
    if (last && last.speaker === sp) last.text += ' ' + word; else out.push({ speaker: sp, text: word });
  }
  return out;
}

export function createHqRecognizer({ getToken, heartbeat, lang, terms = [], onInterim, onFinal, onError, onState }) {
  let protoTry = 0; let audio = null; let ws = null; let rec = null; let stream = null; let want = false; let hb = null; let keep = null; let tries = 0;
  const cleanup = () => {
    clearInterval(hb); clearInterval(keep);
    try { rec && rec.state !== 'inactive' && rec.stop(); } catch { /* ignore */ }
    try { ws && ws.readyState <= 1 && ws.close(); } catch { /* ignore */ }
    try { stream && stream.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    try { audio && audio.close(); } catch { /* ignore */ }
    ws = null; rec = null; stream = null; audio = null;
  };
  const fail = (msg, fatal) => { cleanup(); want = false; onError && onError(msg, fatal); onState && onState('idle'); };

  async function open() {
    try {
      // in a room nothing is playing back, so echo cancelling is off (it can swallow distant voices); noise suppression and gain stay on
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: true, autoGainControl: true } });
    } catch { return fail('Microphone access was blocked. Allow the microphone for this site and try again.', false); }
    // far-field boost: cut low rumble, level out quiet and loud talkers, lift faint voices
    let sendStream = stream;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      audio = new AC();
      const src = audio.createMediaStreamSource(stream);
      const hp = audio.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 110;
      const comp = audio.createDynamicsCompressor(); comp.threshold.value = -48; comp.knee.value = 30; comp.ratio.value = 10; comp.attack.value = 0.005; comp.release.value = 0.25;
      const gain = audio.createGain(); gain.gain.value = 2.2;
      const dest = audio.createMediaStreamDestination();
      src.connect(hp); hp.connect(comp); comp.connect(gain); gain.connect(dest);
      sendStream = dest.stream;
    } catch { sendStream = stream; }
    let token;
    try { token = await getToken(); } catch (e) { return fail(e.message, true); }
    const q = new URLSearchParams({ model: 'nova-3', language: dgLang(lang), punctuate: 'true', smart_format: 'true', diarize: 'true', interim_results: 'true', endpointing: '400', utterance_end_ms: '1500', vad_events: 'false' });
    terms.slice(0, 30).forEach((t) => q.append('keyterm', t));
    const url = `wss://api.deepgram.com/v1/listen?${q}`;
    const protocols = [['bearer', token], ['token', token]];
    let opened = false;
    ws = new WebSocket(url, protocols[Math.min(protoTry, 1)]);
    ws.onopen = () => {
      opened = true; tries = 0;
      rec = new MediaRecorder(sendStream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 32000 });
      rec.ondataavailable = (e) => { if (e.data && e.data.size && ws && ws.readyState === 1) ws.send(e.data); };
      rec.start(250);
      keep = setInterval(() => { try { ws.readyState === 1 && ws.send(JSON.stringify({ type: 'KeepAlive' })); } catch { /* ignore */ } }, 8000);
      hb = setInterval(async () => { try { await heartbeat(); } catch (e) { fail(e.message, true); } }, 270000);
      onState && onState('listening');
    };
    ws.onmessage = (m) => {
      let j; try { j = JSON.parse(m.data); } catch { return; }
      if (j.type !== 'Results') return;
      const alt = j.channel && j.channel.alternatives && j.channel.alternatives[0];
      if (!alt || !alt.transcript) { if (j.is_final) onInterim(''); return; }
      if (j.is_final) { onInterim(''); groupWords(alt.words).forEach((g) => { if (g.text.trim()) onFinal({ text: g.text.trim(), speaker: g.speaker }); }); } else onInterim(alt.transcript);
    };
    ws.onerror = () => { /* onclose follows */ };
    ws.onclose = (e) => {
      if (!want) return;
      cleanup();
      // the connection was refused before it opened: try the other way of presenting the key once
      if (!opened && protoTry === 0) { protoTry = 1; setTimeout(() => { if (want) open(); }, 200); return; }
      if (!opened) return fail(`High accuracy could not connect (code ${e.code}${e.reason ? ', ' + e.reason : ''}). The speech service refused the connection.`, true);
      if (e.code === 1008 || e.code === 4001 || e.code === 4003 || ++tries > 3) return fail(`High-accuracy transcription disconnected (code ${e.code}${e.reason ? ', ' + e.reason : ''}).`, true);
      onError && onError('Connection dropped. Reconnecting...');
      setTimeout(() => { if (want) open(); }, 800 * tries);
    };
  }
  return {
    start() { want = true; onState && onState('starting'); open(); },
    stop() { want = false; cleanup(); onInterim(''); onState && onState('idle'); },
    setLang(l) { lang = l; },
  };
}

// ---- AssemblyAI streaming (preferred): far-field Voice Focus, live speaker labels, raw PCM over a WebSocket ----
// Tried in this order if the service refuses a setting: [model, voice focus, speaker labels]
const AAI_STEPS = [
  { model: 'assemblyai-stt-3-7-realtime-agent', focus: true, labels: true },
  { model: 'assemblyai-stt-3-7-realtime', focus: false, labels: true },
  { model: 'assemblyai-stt-3-7-realtime', focus: false, labels: false },
];
const labelToId = (l) => (/^[A-J]$/.test(l || '') ? l.charCodeAt(0) - 65 : null); // UNKNOWN / PENDING => no speaker

// turns a final Turn message into lines, one per consecutive speaker
export function turnToLines(j) {
  const words = Array.isArray(j.words) ? j.words : [];
  const turnSp = labelToId(j.speaker_label);
  const out = [];
  for (const w of words) {
    const t = w.text || w.word || '';
    if (!t) continue;
    let sp = labelToId(w.speaker);
    if (sp == null) sp = out.length ? out[out.length - 1].speaker : turnSp;
    const last = out[out.length - 1];
    if (last && last.speaker === sp) last.text += ' ' + t; else out.push({ speaker: sp, text: t });
  }
  if (!out.length && (j.transcript || '').trim()) out.push({ speaker: turnSp, text: j.transcript.trim() });
  return out;
}

// linear-interpolation resampler to 16 kHz, emitting 50 ms (800 sample) PCM16 frames
function makePcmSender(inRate, send) {
  const ratio = inRate / 16000; let buf = new Float32Array(0); let pos = 0; let out = new Int16Array(800); let n = 0;
  return (chunk) => {
    const merged = new Float32Array(buf.length + chunk.length); merged.set(buf); merged.set(chunk, buf.length); buf = merged;
    while (pos + 1 < buf.length) {
      const i = Math.floor(pos); const f = pos - i;
      const v = buf[i] * (1 - f) + buf[i + 1] * f;
      out[n++] = Math.max(-1, Math.min(1, v)) * 32767;
      if (n === 800) { send(out.buffer.slice(0)); n = 0; }
      pos += ratio;
    }
    const drop = Math.floor(pos); if (drop > 0) { buf = buf.slice(drop); pos -= drop; }
  };
}

export function createAaiRecognizer({ getToken, heartbeat, terms = [], onInterim, onFinal, onError, onState }) {
  let ws = null; let ctx = null; let stream = null; let node = null; let want = false; let hb = null; let step = 0; let gotTurn = false; let tries = 0; let begun = false;
  const cleanup = () => {
    clearInterval(hb);
    try { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'Terminate' })); } catch { /* ignore */ }
    const w = ws; setTimeout(() => { try { w && w.readyState <= 1 && w.close(); } catch { /* ignore */ } }, 400);
    try { node && node.disconnect(); } catch { /* ignore */ }
    try { ctx && ctx.close(); } catch { /* ignore */ }
    try { stream && stream.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    ws = null; ctx = null; stream = null; node = null;
  };
  const fail = (msg, fatal) => { cleanup(); want = false; onError && onError(msg, fatal); onState && onState('idle'); };
  // a setting the service does not accept: drop to the next, simpler configuration
  const nextStep = (why) => {
    if (step >= AAI_STEPS.length - 1) return false;
    step += 1; cleanup(); onError && onError(`${why} Trying a simpler setup...`);
    setTimeout(() => { if (want) open(true); }, 300); return true;
  };

  async function startAudio(sendFrame) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaStreamSource(stream);
    const push = makePcmSender(ctx.sampleRate, sendFrame);
    const quiet = ctx.createGain(); quiet.gain.value = 0; quiet.connect(ctx.destination);
    try {
      const code = 'class P extends AudioWorkletProcessor{process(i){const c=i[0]&&i[0][0];if(c)this.port.postMessage(c.slice(0));return true}}registerProcessor("dwen-pcm",P)';
      const url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url); URL.revokeObjectURL(url);
      node = new AudioWorkletNode(ctx, 'dwen-pcm');
      node.port.onmessage = (e) => push(e.data);
    } catch {
      node = ctx.createScriptProcessor(4096, 1, 1); // older browsers
      node.onaudioprocess = (e) => push(new Float32Array(e.inputBuffer.getChannelData(0)));
    }
    src.connect(node); node.connect(quiet);
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch { /* ignore */ } }
  }

  async function open(retry) {
    if (!stream) {
      try {
        // nothing plays back in a room, so echo cancelling stays off; the service's Voice Focus does the heavy noise isolation
        stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: true, autoGainControl: true } });
      } catch { return fail('Microphone access was blocked. Allow the microphone for this site and try again.', false); }
    }
    let token;
    try { token = await getToken(!!retry); } catch (e) { return fail(e.message, true); }
    const cfg = AAI_STEPS[step];
    const q = new URLSearchParams({ token, sample_rate: '16000', encoding: 'pcm_s16le', speech_model: cfg.model });
    if (cfg.labels) q.set('speaker_labels', 'true');
    if (cfg.focus) q.set('voice_focus', 'far-field');
    if (terms.length) q.set('keyterms_prompt', JSON.stringify(terms.slice(0, 40)));
    gotTurn = false; begun = false;
    ws = new WebSocket(`wss://streaming.assemblyai.com/v3/ws?${q}`);
    ws.binaryType = 'arraybuffer';
    const mine = ws;
    ws.onopen = async () => {
      tries = 0;
      try { await startAudio((frame) => { if (ws === mine && mine.readyState === 1) mine.send(frame); }); } catch (e) { return fail('Could not start the microphone: ' + e.message, false); }
      hb = setInterval(async () => { try { await heartbeat(); } catch (e) { fail(e.message, true); } }, 270000);
      onState && onState('listening');
    };
    ws.onmessage = (m) => {
      if (typeof m.data !== 'string') return;
      let j; try { j = JSON.parse(m.data); } catch { return; }
      if (j.type === 'Begin') { begun = true; return; }
      if (j.type === 'Error') { const why = `Speech service error ${j.error_code || ''}: ${j.error || 'unknown'}.`; if (!gotTurn && nextStep(why)) return; return fail(why, true); }
      if (j.type !== 'Turn') return;
      gotTurn = true;
      if (!j.end_of_turn) { const t = (Array.isArray(j.words) && j.words.length ? j.words.map((w) => w.text).join(' ') : j.transcript) || ''; onInterim(t); return; }
      onInterim('');
      turnToLines(j).forEach((l) => { if (l.text.trim()) onFinal({ text: l.text.trim(), speaker: l.speaker }); });
    };
    ws.onerror = () => { /* onclose follows */ };
    ws.onclose = (e) => {
      if (!want || ws !== mine) return;
      const wasOpen = begun;
      cleanup();
      if (!wasOpen && !gotTurn) { if (nextStep(`Could not connect (code ${e.code}${e.reason ? ', ' + e.reason : ''}).`)) return; return fail(`High accuracy could not connect (code ${e.code}${e.reason ? ', ' + e.reason : ''}).`, true); }
      if (++tries > 3) return fail(`High-accuracy transcription disconnected (code ${e.code}${e.reason ? ', ' + e.reason : ''}).`, true);
      onError && onError('Connection dropped. Reconnecting...');
      setTimeout(() => { if (want) open(true); }, 800 * tries);
    };
  }
  return {
    start() { want = true; onState && onState('starting'); open(false); },
    stop() { want = false; cleanup(); onInterim(''); onState && onState('idle'); },
    setLang() { /* the model detects the language itself */ },
  };
}
