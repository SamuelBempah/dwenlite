import { askStudyChatStream } from './ai';
import { createTypewriter, stripFollowups } from './typewriter';

// Runs one study-chat question: adds the user message and an empty AI bubble at once, then types
// the answer into the bubble as it streams in. Throws (after cleaning up the bubble) on failure.
export async function runStudyChat({ context, history, question, kind, setChatHistory }) {
  setChatHistory(prev => [...prev, { type: 'user', content: question }, { type: 'ai', content: '', typing: true }]);
  const patchLast = (patch) => setChatHistory(prev => {
    const next = [...prev];
    const i = next.length - 1;
    if (i >= 0 && next[i].type === 'ai') next[i] = { ...next[i], ...patch };
    return next;
  });
  const tw = createTypewriter((shown, typing) => patchLast({ content: shown, typing }));
  try {
    const { text, followups } = await askStudyChatStream({
      context, history, question, kind,
      onText: (t) => tw.set(stripFollowups(t)),
    });
    tw.set(text);
    await tw.finish();
    patchLast({ content: text, followups, typing: false });
  } catch (err) {
    tw.cancel();
    setChatHistory(prev => prev.filter((m, i) => !(i === prev.length - 1 && m.type === 'ai' && m.typing)));
    throw err;
  }
}
