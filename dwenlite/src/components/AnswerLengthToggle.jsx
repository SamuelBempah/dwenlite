import { useState } from 'react';

const KEY = 'dwenliteAnswerLength';
export const getAnswerLength = () => {
  try { return localStorage.getItem(KEY) === 'quick' ? 'quick' : 'detailed'; } catch { return 'detailed'; }
};

// Quick (short) or Detailed answers from the study chat. Read by askStudyChat.
export default function AnswerLengthToggle() {
  const [mode, setMode] = useState(getAnswerLength);
  const choose = (m) => {
    setMode(m);
    try { localStorage.setItem(KEY, m); } catch { /* ignore */ }
  };
  return (
    <div className="inline-flex rounded-full bg-slate-900/70 p-0.5 text-[11px] font-medium" role="group" aria-label="Answer length">
      {['quick', 'detailed'].map(m => (
        <button
          key={m}
          type="button"
          onClick={() => choose(m)}
          aria-pressed={mode === m}
          className={`rounded-full px-2.5 py-1 capitalize transition-colors ${mode === m ? 'bg-purple-600 text-white' : 'text-slate-400'}`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
