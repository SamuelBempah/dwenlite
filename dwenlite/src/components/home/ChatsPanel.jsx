import { useEffect, useState } from 'react';
import { X, Search, Trash2, MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';
import { homeCall } from '../../lib/homeClient';
import { Sheet, motion, spring } from './motion';

const ago = (t) => { const s = Math.max(1, Math.round((Date.now() - t) / 1000)); if (s < 60) return 'just now'; if (s < 3600) return `${Math.round(s / 60)} min ago`; if (s < 86400) return `${Math.round(s / 3600)} h ago`; return `${Math.round(s / 86400)} d ago`; };

// Earlier conversations: search, reopen, delete.
export default function ChatsPanel({ currentId, onOpen, onClose }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  const load = (query) => homeCall('chat_list', { q: query }).then((r) => setList(r.chats)).catch((e) => toast.error(e.message));
  useEffect(() => { const t = setTimeout(() => load(q), q ? 250 : 0); return () => clearTimeout(t); }, [q]);
  const del = async (c) => { if (!window.confirm(`Delete "${c.title}"?`)) return; try { await homeCall('chat_delete', { id: c.id }); load(q); } catch (e) { toast.error(e.message); } };
  return (
    <Sheet onClose={onClose} className="max-h-[88dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-white/10 bg-[#121217] p-5 text-white shadow-2xl sm:rounded-3xl">
      <div>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Earlier chats</h2><button onClick={onClose} aria-label="Close"><X size={22} className="text-slate-400" /></button></div>
        <div className="relative mb-3"><Search size={15} className="absolute left-3 top-3.5 text-slate-500" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your chats" className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-violet-500" /></div>
        {!list && <p className="animate-pulse text-sm text-slate-400">Loading...</p>}
        {list && list.length === 0 && <p className="py-6 text-center text-sm text-slate-500">{q ? 'No chats match.' : 'Your conversations are saved here automatically.'}</p>}
        <ul className="space-y-1.5">
          {(list || []).map((c, i) => (
            <motion.li key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: Math.min(i, 10) * 0.03 }} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${c.id === currentId ? 'border-violet-500/50 bg-violet-500/10' : 'border-white/10 bg-slate-900/60'}`}>
              <button onClick={() => onOpen(c.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                <MessageSquare size={16} className="shrink-0 text-violet-300" />
                <span className="min-w-0"><span className="block truncate font-medium">{c.title}</span><span className="block truncate text-xs text-slate-400">{c.preview}</span></span>
              </button>
              <span className="shrink-0 text-xs text-slate-500">{ago(c.updatedAt)}</span>
              <button onClick={() => del(c)} aria-label={`Delete ${c.title}`} className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400"><Trash2 size={14} /></button>
            </motion.li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}
