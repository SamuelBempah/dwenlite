import { useEffect, useState } from 'react';
import { useUploads, formatBytes, formatEta } from '../lib/uploadManager';

// Banner pinned to the top of the screen showing every upload in progress.
export default function UploadTray() {
  const uploads = useUploads();
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  if (!uploads.length) return null;

  return (
    <div
      className="fixed top-0 inset-x-0 z-[100] px-3 pt-2 pointer-events-none"
      style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto max-w-xl space-y-2 pointer-events-auto">
        {uploads.map((u) => {
          const pct = u.size ? Math.min(100, Math.floor((u.transferred / u.size) * 100)) : 0;
          const left = u.speed ? (u.size - u.transferred) / u.speed : 0;
          const done = u.state === 'done';
          const err = u.state === 'error';
          return (
            <div key={u.id} className="rounded-xl border border-white/10 bg-slate-900/95 backdrop-blur p-3 shadow-xl text-white">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-semibold">{u.name}</span>
                <span className={`shrink-0 font-bold ${err ? 'text-red-400' : done ? 'text-green-400' : 'text-purple-300'}`}>
                  {err ? 'Failed' : done ? 'Done' : `${pct}%`}
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-700">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${err ? 'bg-red-500' : done ? 'bg-green-500' : 'bg-gradient-to-r from-purple-500 to-indigo-500'}`}
                  style={{ width: `${err ? 100 : pct}%` }}
                />
              </div>
              <div className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-xs text-slate-400">
                <span>{formatBytes(u.transferred)} of {formatBytes(u.size)}</span>
                <span>
                  {u.state === 'paused' ? 'Paused'
                    : !done && !err && !online ? 'Waiting for connection…'
                    : !done && !err && u.speed ? `${formatBytes(u.speed)}/s · ${formatEta(left)}` : ''}
                </span>
              </div>
              {err && u.message && <p className="mt-1 text-xs text-red-300">{u.message}</p>}
            </div>
          );
        })}
        {uploads.some((u) => u.state === 'uploading') && (
          <p className="text-center text-[11px] text-slate-300 drop-shadow">Keep DwenLite open until the upload finishes.</p>
        )}
      </div>
    </div>
  );
}
