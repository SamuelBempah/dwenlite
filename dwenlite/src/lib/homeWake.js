// Hands-free: listens for "Hey Dwen" while the page is open, then hands over what was said.
// Speech recognition hears "Dwen" in many ways, so the match is generous about the name.
const NAMES = '(?:dwen|dwan|duan|dwin|dwayne|when|wen|den|dwenlite|dwen lite|dwain|twin)';
const WAKE = new RegExp(`\\b(?:hey|hi|hay|okay|ok|hello|yo)[ ,.]+${NAMES}\\b[ ,.!?:-]*`, 'i');

// Returns null when the wake phrase was not said, otherwise whatever followed it ('' if nothing).
export function matchWake(text) {
  const t = String(text || '');
  const m = WAKE.exec(t);
  if (!m) return null;
  return t.slice(m.index + m[0].length).trim();
}

export const wakeSupported = () => typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

// Keeps listening (restarting when the browser ends a session) until stop() is called.
export function startWake({ onWake, onError }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let stopped = false; let rec = null; let errors = 0; let handled = -1;
  const begin = () => {
    if (stopped) return;
    rec = new SR(); rec.lang = 'en-US'; rec.continuous = true; rec.interimResults = true;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (i <= handled) continue;
        const text = e.results[i][0].transcript; const rest = matchWake(text);
        if (rest === null) continue;
        if (!e.results[i].isFinal && !rest) { handled = -1; continue; } // wait: they may still be saying the request
        if (!e.results[i].isFinal) continue;
        handled = i; errors = 0;
        try { rec.onend = null; rec.stop(); } catch { /* ignore */ }
        stopped = true; onWake(rest); return;
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { stopped = true; onError && onError('Microphone access was blocked. Allow it for this site to use "Hey Dwen".'); return; }
      errors++;
    };
    rec.onend = () => { handled = -1; if (!stopped) setTimeout(begin, Math.min(5000, 300 + errors * 700)); };
    try { rec.start(); } catch { setTimeout(begin, 1000); }
  };
  begin();
  return { stop: () => { stopped = true; try { rec && (rec.onend = null, rec.stop()); } catch { /* ignore */ } } };
}
