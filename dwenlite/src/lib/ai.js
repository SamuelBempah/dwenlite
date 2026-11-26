import axios from 'axios';
import { auth } from '../firebase';
import { getAnswerLength } from '../components/AnswerLengthToggle';

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
    const res = await axios.post(AI_URL, { task: 'study_chat', messages, context: context || 'No materials yet.', kind, length: getAnswerLength() });
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
