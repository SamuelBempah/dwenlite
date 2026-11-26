import { useEffect, useRef, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';

export const VOICE_OPTIONS = [
  { id: 'en-US-AvaNeural', label: 'Ava (female, US)' },
  { id: 'en-US-JennyNeural', label: 'Jenny (female, US)' },
  { id: 'en-US-EmmaNeural', label: 'Emma (female, US)' },
  { id: 'en-GB-SoniaNeural', label: 'Sonia (female, UK)' },
  { id: 'en-US-AndrewNeural', label: 'Andrew (male, US)' },
  { id: 'en-US-BrianNeural', label: 'Brian (male, US)' },
  { id: 'en-US-GuyNeural', label: 'Guy (male, US)' },
  { id: 'en-GB-RyanNeural', label: 'Ryan (male, UK)' },
];
const SPEEDS = [0.8, 1, 1.2, 1.5];
const KEY = 'dwenliteVoicePrefs';

export function loadVoicePrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      voice: VOICE_OPTIONS.some(v => v.id === p.voice) ? p.voice : VOICE_OPTIONS[0].id,
      speed: SPEEDS.includes(p.speed) ? p.speed : 1,
    };
  } catch { return { voice: VOICE_OPTIONS[0].id, speed: 1 }; }
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
        aria-label="Voice and speed"
        title="Voice and speed"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-700 bg-gray-800/80 text-gray-300 hover:bg-gray-700/80 hover:text-white transition-colors"
      >
        <SlidersHorizontal size={16} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Voice and speed"
          className="fixed left-4 right-4 top-[4.5rem] z-[70] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-72 rounded-2xl border border-gray-700 bg-[#17171c] p-4 shadow-2xl"
        >
          <p className="text-sm font-semibold text-gray-200">Teacher voice</p>
          <select
            value={prefs.voice}
            onChange={(e) => update({ voice: e.target.value })}
            className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-blue-500"
          >
            {VOICE_OPTIONS.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>

          <p className="mt-4 text-sm font-semibold text-gray-200">Speaking speed</p>
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
          <p className="mt-3 text-xs text-gray-500">A new voice starts from the teacher's next sentence.</p>
        </div>
      )}
    </div>
  );
}
