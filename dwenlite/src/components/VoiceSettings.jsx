import { useEffect, useRef, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';

const SPEEDS = [0.8, 1, 1.2, 1.5];
const KEY = 'dwenliteVoicePrefs';

export function loadVoicePrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { speed: SPEEDS.includes(p.speed) ? p.speed : 1 };
  } catch { return { speed: 1 }; }
}

// Voice and speed picker for the AI Teacher. Speed is applied in the browser (free).
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

  return (
    <div ref={box} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label="Speaking speed"
        title="Speaking speed"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-700 bg-gray-800/80 text-gray-300 hover:bg-gray-700/80 hover:text-white transition-colors"
      >
        <SlidersHorizontal size={16} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Speaking speed"
          className="fixed left-4 right-4 top-[4.5rem] z-[70] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-72 rounded-2xl border border-gray-700 bg-[#17171c] p-4 shadow-2xl"
        >
          <p className="text-sm font-semibold text-gray-200">Speaking speed</p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {SPEEDS.map(sp => (
              <button
                key={sp}
                type="button"
                onClick={() => update({ speed: sp })}
                className={`rounded-lg py-2 text-sm font-medium transition-colors ${prefs.speed === sp ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
              >
                {sp}x
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
