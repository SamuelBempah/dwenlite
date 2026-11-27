// Talking to Dwenlite Home and hearing it answer.
const TTS_URL = 'https://dwenlite-backend.fly.dev/api/tts';

export const micSupported = () => typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

// One question at a time: listens until you stop talking.
export function listenOnce({ lang = 'en-US', onInterim, onFinal, onEnd, onError }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SR();
  rec.lang = lang; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
  let got = ''; let finished = false;
  rec.onresult = (e) => {
    let interim = ''; let fin = '';
    for (let i = e.resultIndex; i < e.results.length; i++) (e.results[i].isFinal ? (fin += e.results[i][0].transcript) : (interim += e.results[i][0].transcript));
    if (interim) onInterim && onInterim((got + ' ' + interim).trim());
    if (fin) { got = (got + ' ' + fin).trim(); onInterim && onInterim(got); }
  };
  rec.onerror = (e) => { if (e.error !== 'no-speech' && e.error !== 'aborted') onError && onError(e.error === 'not-allowed' ? 'Microphone access was blocked. Allow it for this site and try again.' : `Could not listen (${e.error}).`); };
  rec.onend = () => { if (finished) return; finished = true; onEnd && onEnd(); if (got) onFinal && onFinal(got); }; // stop() can fire this twice: only act once
  try { rec.start(); } catch { /* already started */ }
  return { stop: () => { try { rec.stop(); } catch { /* ignore */ } } };
}

// Turn an answer into something nice to hear: no code, tables or symbols, and not too long.
export function forSpeech(md, max = 700) {
  let t = String(md || '')
    .replace(/```[\s\S]*?```/g, ' (code on screen) ')
    .replace(/^\s*\|.*\|\s*$/gm, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/[*_~>#]/g, '')
    .replace(/https?:\/\/\S+/g, ' link ')
    .replace(/\s+/g, ' ').trim();
  if (t.length > max) { const cut = t.slice(0, max); const last = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! ')); t = (last > 200 ? cut.slice(0, last + 1) : cut) + ' The rest is on screen.'; }
  return t;
}
export function sentences(text) {
  const parts = text.match(/[^.!?]+[.!?]*\s*/g) || [text];
  const out = []; let cur = '';
  for (const p of parts) { if ((cur + p).length > 200 && cur) { out.push(cur.trim()); cur = p; } else cur += p; }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// Speaks sentence by sentence, fetching the next one while the current plays.
export function speak(text, { onStart, onEnd } = {}) {
  const parts = sentences(text);
  let stopped = false; const audio = new Audio(); const urls = [];
  const fetchUrl = async (s) => { const r = await fetch(TTS_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: s }), signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error('voice'); const b = await r.blob(); const u = URL.createObjectURL(b); urls.push(u); return u; };
  (async () => {
    try {
      let next = fetchUrl(parts[0]);
      for (let i = 0; i < parts.length && !stopped; i++) {
        const u = await next;
        if (i + 1 < parts.length) next = fetchUrl(parts[i + 1]);
        if (stopped) break;
        if (i === 0) onStart && onStart();
        audio.src = u;
        await new Promise((resolve) => { audio.onended = resolve; audio.onerror = resolve; audio.play().catch(resolve); });
      }
    } catch { /* the voice server may be asleep: stay silent, the text is on screen */ }
    urls.forEach((u) => URL.revokeObjectURL(u));
    onEnd && onEnd(stopped);
  })();
  return { stop: () => { stopped = true; try { audio.pause(); } catch { /* ignore */ } } };
}
