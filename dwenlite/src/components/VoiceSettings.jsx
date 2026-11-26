import { useEffect, useRef, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';

const SPEEDS = [0.8, 1, 1.2, 1.5];
export const STYLES = [
  { id: 'default', label: 'Balanced' },
  { id: 'story', label: 'Storyteller' },
  { id: 'coach', label: 'Exam coach' },
  { id: 'socratic', label: 'Socratic' },
  { id: 'simple', label: "Like I'm 10" },
];
export const LEVELS = [
  { id: 'easy', label: 'Easy' },
  { id: 'normal', label: 'Normal' },
  { id: 'exam', label: 'Exam' },
];
const KEY = 'dwenliteVoicePrefs';

export function loadVoicePrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      speed: SPEEDS.includes(p.speed) ? p.speed : 1,
      style: STYLES.some(s => s.id === p.style) ? p.style : 'default',
      level: LEVELS.some(l => l.id === p.level) ? p.level : 'normal',
      handsFree: p.handsFree === true,
    };
  } catch { return { speed: 1, style: 'default', level: 'normal', handsFree: false }; }
}

// Lesson settings for the AI Teacher: speaking speed, teaching style, difficulty, hands-free mic.
export default function VoiceSettings({ prefs, onChange, className = '' }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const update = (patch) => {
    const next = { ...prefs, ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
    onChange(next);
  };

  const pill = (active) => `rounded-lg px-2 py-2 text-xs sm:text-sm font-medium transition-colors ${active ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`;

  return (
    <div ref={box} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label="Lesson settings"
        title="Lesson settings"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-700 bg-gray-800/80 text-gray-300 hover:bg-gray-700/80 hover:text-white transition-colors"
      >
        <SlidersHorizontal size={16} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Lesson settings"
          className="fixed left-4 right-4 top-[4.5rem] z-[70] max-h-[75dvh] overflow-y-auto sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 rounded-2xl border border-gray-700 bg-[#17171c] p-4 shadow-2xl"
        >
          <p className="text-sm font-semibold text-gray-200">Teaching style</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {STYLES.map(s => (
              <button key={s.id} type="button" onClick={() => update({ style: s.id })} className={pill(prefs.style === s.id)}>{s.label}</button>
            ))}
          </div>

          <p className="mt-4 text-sm font-semibold text-gray-200">Difficulty</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {LEVELS.map(l => (
              <button key={l.id} type="button" onClick={() => update({ level: l.id })} className={pill(prefs.level === l.id)}>{l.label}</button>
            ))}
          </div>

          <p className="mt-4 text-sm font-semibold text-gray-200">Speaking speed</p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {SPEEDS.map(sp => (
              <button key={sp} type="button" onClick={() => update({ speed: sp })} className={pill(prefs.speed === sp)}>{sp}x</button>
            ))}
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={prefs.handsFree}
            onClick={() => update({ handsFree: !prefs.handsFree })}
            className="mt-4 flex w-full items-center justify-between gap-3 text-left"
          >
            <span>
              <span className="block text-sm font-semibold text-gray-200">Hands-free listening</span>
              <span className="block text-xs text-gray-500">The mic opens by itself after the teacher speaks. No holding.</span>
            </span>
            <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${prefs.handsFree ? 'bg-blue-600' : 'bg-gray-600'}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${prefs.handsFree ? 'left-[22px]' : 'left-0.5'}`} />
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
