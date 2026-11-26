import axios from 'axios';
import { auth } from '../firebase';
import { getAnswerLength } from '../components/AnswerLengthToggle';
import { loadVoicePrefs } from '../components/VoiceSettings';

export const AI_URL =
  'https://us-central1-leumas-decipher-softwares.cloudfunctions.net/generateNotesProxy';

// Attach the signed-in user's Firebase ID token to every AI request, so the
// backend can verify the user and rate-limit them. Imported once from main.jsx.
axios.interceptors.request.use(async (config) => {
  if (config.url === AI_URL && auth.currentUser) {
    const token = await auth.currentUser.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// task: 'general' | 'notes' | 'support' | 'rewrite'
export async function askAI(prompt, task = 'general') {
  try {
    const res = await axios.post(AI_URL, { prompt, task });
    const text = res.data?.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('No response from DwenLite AI.');
    return text;
  } catch (err) {
    throw new Error(err.response?.data?.error || err.message);
  }
}

// ---------------------------------------------------------------------------
// Study chat: the AI reads the student's WHOLE folder, so nobody has to pick a note.
// ---------------------------------------------------------------------------
const cap = (t = '', n) => (t.length > n ? t.slice(0, n) + '\n[...cut for length]' : t);

export function buildFolderContext(folder) {
  if (!folder) return '';
  const parts = [];
  (folder.notes || []).forEach((n, i) => parts.push(`### Note ${i + 1}\n${cap(n.content, 30000)}`));
  (folder.documents || []).forEach((d) => {
    if (d.extractedText) parts.push(`### Document: ${d.name}\n${cap(d.extractedText, 40000)}`);
  });
  (folder.quizGroups || []).forEach((g, i) => {
    const qs = (g.quizzes || []).map((q) =>
      `Q: ${q.question}\nOptions: ${(q.options || []).join(' | ')}\nCorrect answer: ${q.correctAnswer}`).join('\n\n');
    parts.push(`### Quiz Group ${i + 1}\n${qs}`);
  });
  (folder.flashcardGroups || []).forEach((g, i) => {
    const cs = (g.flashcards || []).map((c, j) => `Card ${j + 1}\nQ: ${c.question}\nA: ${c.answer}`).join('\n\n');
    parts.push(`### Flashcards ${i + 1}\n${cs}`);
  });
  return cap(parts.join('\n\n'), 200000);
}

// history: [{type:'user'|'ai', content}], question: the new user message
export async function askStudyChat({ context, history = [], question, kind = 'folder' }) {
  const messages = history
    .filter((m) => m.type === 'user' || m.type === 'ai')
    .map((m) => ({ role: m.type === 'user' ? 'user' : 'assistant', content: m.content }));
  const last = messages[messages.length - 1];
  if (!(last && last.role === 'user' && last.content === question)) messages.push({ role: 'user', content: question });

  try {
    const res = await axios.post(AI_URL, { task: 'study_chat', messages, context: context || 'No materials yet.', kind, length: getAnswerLength(), language: loadVoicePrefs().language });
    const text = res.data?.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('No answer found.');
    // Split off the trailing "FOLLOWUPS: a | b | c" line into tappable suggestions.
    const m = text.match(/\n?\s*FOLLOWUPS:\s*(.+)\s*$/i);
    if (!m) return { text, followups: [] };
    return {
      text: text.slice(0, m.index).trim(),
      followups: m[1].split('|').map((q) => q.trim()).filter(Boolean).slice(0, 3),
    };
  } catch (err) {
    throw new Error(err.response?.data?.error || err.message);
  }
}

function splitFollowups(text) {
  const m = text.match(/\n?\s*FOLLOWUPS:\s*(.+)\s*$/i);
  if (!m) return { text: text.trim(), followups: [] };
  return {
    text: text.slice(0, m.index).trim(),
    followups: m[1].split('|').map((q) => q.trim()).filter(Boolean).slice(0, 3),
  };
}

// Same as askStudyChat, but the answer streams in. onText(textSoFar) is called as it grows.
// If streaming is not possible the whole answer arrives at once through the same callback.
export async function askStudyChatStream({ context, history = [], question, kind = 'folder', onText }) {
  const messages = history
    .filter((m) => m.type === 'user' || m.type === 'ai')
    .map((m) => ({ role: m.type === 'user' ? 'user' : 'assistant', content: m.content }));
  const last = messages[messages.length - 1];
  if (!(last && last.role === 'user' && last.content === question)) messages.push({ role: 'user', content: question });

  const body = { task: 'study_chat', messages, context: context || 'No materials yet.', kind, length: getAnswerLength(), language: loadVoicePrefs().language };
  let res;
  try {
    const token = await auth.currentUser?.getIdToken();
    res = await fetch(AI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ ...body, stream: true }),
    });
  } catch {
    res = null;
  }

  if (!res || !res.body?.getReader) {
    const out = await askStudyChat({ context, history, question, kind });
    onText?.(out.text + (out.followups.length ? `\nFOLLOWUPS: ${out.followups.join(' | ')}` : ''));
    return out;
  }
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `Request failed (${res.status})`);
  }

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
      if (j.t) { text += j.t; onText?.(text); }
    }
  }
  if (!text.trim()) throw new Error('No answer found.');
  return splitFollowups(text);
}
