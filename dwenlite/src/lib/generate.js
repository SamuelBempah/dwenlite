import axios from 'axios';
import { auth } from '../firebase';
import { AI_URL } from './ai';

// Runs a generation job (notes, quizzes, flashcards...) as a stream so the page can show REAL progress.
// onProgress receives: { phase: 'writing', text, chars }  while the AI writes,
//                      { phase: 'parts', done, total }    for very long sources (written in parts),
//                      { phase: 'merge' }                  while the parts are combined.
// Resolves with the same shape as the plain request: { data: { choices: [{ message: { content } }] } }.
export async function generateStream({ prompt, task = 'general', onProgress }) {
  const plain = () => axios.post(AI_URL, { prompt, task });

  let res;
  try {
    const token = await auth.currentUser?.getIdToken();
    res = await fetch(AI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ prompt, task, stream: true }),
    });
  } catch {
    return plain(); // network hiccup before anything started: use the normal request
  }

  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    const err = new Error(j.error || `Request failed (${res.status})`);
    err.response = { status: res.status, data: j };
    throw err;
  }
  if (!res.body?.getReader) return plain();

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let text = '';
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
      if (j.p) onProgress?.(j.p.stage === 'merge' ? { phase: 'merge', total: j.p.total } : { phase: 'parts', done: j.p.done, total: j.p.total });
      if (j.t) {
        text += j.t;
        onProgress?.({ phase: 'writing', text, chars: text.length });
      }
    }
  }
  if (!text.trim()) throw new Error('The AI returned nothing. Please try again.');
  return { data: { choices: [{ message: { content: text } }] } };
}
