import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Mic, Pause, Play, Square, MessageCircleQuestion, Globe, ListChecks, Send, Paperclip, X, Copy, Download, Loader2, ChevronDown, Trash2, FileText, Sparkles, ArrowLeft, RotateCcw } from 'lucide-react';
import Markdown from '../components/Markdown';
import { LANGS, langName, meetingCall, speechSupported, createRecognizer, createHqRecognizer, hqSupported, extractTerms, extractFileText, looksLikeQuestionCue, fmtClock } from '../lib/meeting';

const KEY = 'dwenliteMeeting';
const TABS = [['questions', 'Questions', MessageCircleQuestion], ['research', 'Research', Globe], ['summary', 'Summary', ListChecks], ['ask', 'Ask', Sparkles]];
const TYPE_STYLE = { clarify: 'bg-sky-500/15 text-sky-300', risk: 'bg-amber-500/15 text-amber-300', next: 'bg-emerald-500/15 text-emerald-300', insight: 'bg-violet-500/15 text-violet-300' };

const SPK_COLORS = ['text-sky-300', 'text-emerald-300', 'text-amber-300', 'text-pink-300', 'text-violet-300', 'text-orange-300'];
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };

export default function LiveMeeting() {
  const saved = useMemo(load, []);
  const [title, setTitle] = useState(saved.title || '');
  const [goal, setGoal] = useState(saved.goal || '');
  const [lang, setLang] = useState(saved.lang || 'en-US');
  const [files, setFiles] = useState([]); // {name, text}
  const [lines, setLines] = useState(saved.lines || []); // {at, text}
  const [interim, setInterim] = useState('');
  const [state, setState] = useState('idle'); // idle | starting | listening | paused
  const [elapsed, setElapsed] = useState(saved.elapsed || 0);
  const [tab, setTab] = useState('questions');
  const [setup, setSetup] = useState(!(saved.lines && saved.lines.length));
  const [autoQ, setAutoQ] = useState(saved.autoQ !== false);
  const [busy, setBusy] = useState('');
  const [questions, setQuestions] = useState([]);
  const [research, setResearch] = useState(null);
  const [summary, setSummary] = useState('');
  const [topic, setTopic] = useState('');
  const [focus, setFocus] = useState('');
  const [question, setQuestion] = useState('');
  const [answers, setAnswers] = useState([]);
  const [flash, setFlash] = useState(false);
  const [err, setErr] = useState('');
  const [hqAvail, setHqAvail] = useState(false);
  const [mode, setMode] = useState(saved.mode || 'hq'); // hq = noise filtering + speaker names, std = browser speech
  const [speakers, setSpeakers] = useState(saved.speakers || {}); // id -> { name, bg, me }
  const [openSpk, setOpenSpk] = useState(null);
  const [doubts, setDoubts] = useState({}); // line index -> options

  const recRef = useRef(null);
  const startRef = useRef(0);
  const baseRef = useRef(saved.elapsed || 0);
  const linesRef = useRef(lines);
  const scrollRef = useRef(null);
  const stickRef = useRef(true);
  const lastAuto = useRef(0);
  const wakeRef = useRef(null);
  const supported = speechSupported() || hqSupported();
  const busyRef = useRef('');
  const cleanedUpTo = useRef(saved.lines ? saved.lines.length : 0);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const spkRef = useRef(speakers);
  spkRef.current = speakers;

  useEffect(() => { meetingCall('config').then((c) => { setHqAvail(!!c.hq && hqSupported()); if (!c.hq || !hqSupported()) setMode('std'); }).catch(() => { setMode('std'); }); }, []);
  const spkName = (id) => (id == null ? '' : (spkRef.current[id] && spkRef.current[id].name) || `Speaker ${id + 1}`);

  linesRef.current = lines;
  const transcriptText = useCallback(() => linesRef.current
    .filter((l) => !(l.speaker != null && spkRef.current[l.speaker] && spkRef.current[l.speaker].bg))
    .map((l) => (l.speaker != null ? `${spkName(l.speaker)}: ${l.text}` : l.text)).join('\n'),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  []);
  const filesText = () => files.map((f) => `### ${f.name}\n${f.text}`).join('\n\n').slice(0, 40000);

  // remember the meeting if the page reloads
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ title, goal, lang, lines: lines.slice(-2000), elapsed, autoQ, mode, speakers })); } catch { /* ignore */ }
  }, [title, goal, lang, lines, elapsed, autoQ, mode, speakers]);

  // clock
  useEffect(() => {
    if (state !== 'listening') return undefined;
    const t = setInterval(() => setElapsed(baseRef.current + Date.now() - startRef.current), 500);
    return () => clearInterval(t);
  }, [state]);

  // keep the transcript scrolled to the newest words unless the user scrolls up
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [lines, interim]);
  const onScroll = () => { const el = scrollRef.current; if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; };

  const call = async (key, action, body) => {
    setBusy(key); busyRef.current = key; setErr('');
    try {
      return await meetingCall(action, { title, goal, files: filesText(), transcript: transcriptText(), language: langName(lang), ...body });
    } catch (e) { setErr(e.message); toast.error(e.message); return null; } finally { setBusy(''); busyRef.current = ''; }
  };

  const getQuestions = useCallback(async (auto = false) => {
    if (!auto) setTab('questions');
    const r = await call('questions', 'questions', { focus });
    if (r) { setQuestions(r.questions); if (auto) { setFlash(true); setTimeout(() => setFlash(false), 4000); } }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, goal, lang, files, focus]);

  const onFinal = useCallback((item) => {
    const text = typeof item === 'string' ? item : item.text;
    const speaker = typeof item === 'string' ? null : item.speaker;
    setLines((p) => [...p, { at: baseRef.current + Date.now() - startRef.current, text, speaker }]);
    if (looksLikeQuestionCue(text) && Date.now() - lastAuto.current > 60000) {
      lastAuto.current = Date.now();
      setTimeout(() => document.dispatchEvent(new CustomEvent('meeting-cue')), 800);
    }
  }, []);
  useEffect(() => {
    const h = () => { if (autoQ) { toast('Someone asked for questions. Getting ideas...', { icon: '💡' }); getQuestions(true); } };
    document.addEventListener('meeting-cue', h);
    return () => document.removeEventListener('meeting-cue', h);
  }, [autoQ, getQuestions]);

  const makeRecognizer = (useHq) => {
    const common = { lang, onInterim: setInterim, onFinal, onState: (st) => setState((cur) => (cur === 'paused' ? cur : st)) };
    if (useHq) {
      return createHqRecognizer({
        ...common,
        terms: extractTerms(title, goal, filesText()),
        getToken: async () => (await meetingCall('token')).token,
        heartbeat: () => meetingCall('token', { heartbeat: true }),
        onError: (msg, fatal) => {
          setErr(msg);
          if (fatal && speechSupported()) { // quietly carry on with the standard recogniser
            toast('High accuracy stopped, switching to standard transcription.', { icon: 'ℹ️' });
            setMode('std'); recRef.current = makeRecognizer(false); recRef.current.start();
          }
        },
      });
    }
    return createRecognizer({ ...common, onError: setErr });
  };
  const begin = async () => {
    if (!supported) return;
    setSetup(false); setErr('');
    if (!recRef.current) recRef.current = makeRecognizer(modeRef.current === 'hq' && hqAvail);
    recRef.current.setLang(lang);
    startRef.current = Date.now(); baseRef.current = elapsed;
    setState('starting');
    recRef.current.start();
    try { wakeRef.current = await navigator.wakeLock?.request('screen'); } catch { /* optional */ }
  };
  const pause = () => { baseRef.current += Date.now() - startRef.current; recRef.current?.stop(); setState('paused'); try { wakeRef.current?.release(); } catch { /* ignore */ } };
  const resume = () => { startRef.current = Date.now(); setState('starting'); recRef.current?.start(); navigator.wakeLock?.request('screen').then((w) => { wakeRef.current = w; }).catch(() => {}); };
  const finish = async () => {
    if (state === 'listening' || state === 'starting') baseRef.current += Date.now() - startRef.current;
    recRef.current?.stop(); setState('idle');
    try { wakeRef.current?.release(); } catch { /* ignore */ }
    if (lines.length > 3 && !summary) { setTab('summary'); const r = await call('summary', 'summary'); if (r) setSummary(r.text); }
  };
  useEffect(() => () => { recRef.current?.stop(); try { wakeRef.current?.release(); } catch { /* ignore */ } }, []);

  const reset = () => {
    if (lines.length && !window.confirm('Clear this meeting (transcript, questions, research)? Download it first if you need it.')) return;
    recRef.current?.stop(); recRef.current = null; cleanedUpTo.current = 0; setDoubts({}); setSpeakers({}); setState('idle'); setLines([]); setElapsed(0); baseRef.current = 0; setQuestions([]); setResearch(null); setSummary(''); setAnswers([]); setSetup(true);
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  };

  const addFiles = async (list) => {
    for (const f of Array.from(list || []).slice(0, 6)) {
      if (f.size > 30 * 1024 * 1024) { toast.error(`${f.name} is too big (30 MB max).`); continue; }
      const t = toast.loading(`Reading ${f.name}...`);
      try { const text = await extractFileText(f); setFiles((p) => [...p, { name: f.name, text: text.slice(0, 60000) }]); toast.success(`Added ${f.name}`, { id: t }); } catch (e) { toast.error(e.message, { id: t }); }
    }
  };

  const doResearch = async () => { setTab('research'); const r = await call('research', 'research', { topic: topic.trim() }); if (r) setResearch(r); };
  const doSummary = async () => { setTab('summary'); const r = await call('summary', 'summary'); if (r) setSummary(r.text); };
  const doAsk = async () => {
    const q = question.trim(); if (!q) return;
    setQuestion(''); setAnswers((p) => [...p, { q, a: '' }]);
    const r = await call('ask', 'ask', { question: q });
    setAnswers((p) => p.map((x, i) => (i === p.length - 1 ? { q, a: r ? r.text : 'Sorry, that did not work.' } : x)));
  };

  // quietly tidy up misheard words in the background; never while the user's own request is running
  useEffect(() => {
    const t = setInterval(async () => {
      if (busyRef.current || !['listening', 'paused'].includes(stateRef.current)) return;
      const all = linesRef.current;
      const from = cleanedUpTo.current;
      if (all.length - from < 2) return;
      const batch = all.slice(from, from + 25).map((l, k) => ({ i: from + k, s: l.speaker != null ? spkName(l.speaker) : '', t: l.text }));
      cleanedUpTo.current = from + batch.length;
      try {
        const r = await meetingCall('clean', { title, goal, language: langName(lang), terms: extractTerms(title, goal, filesText()).join(', '), files: filesText().slice(0, 4000), context: all.slice(Math.max(0, from - 6), from).map((l) => l.text).join('\n'), lines: batch });
        if (busyRef.current && !r) return;
        if (r.fixes && r.fixes.length) setLines((p) => p.map((l, i) => { const f = r.fixes.find((x) => x.i === i); return f ? { ...l, raw: l.raw || l.text, text: f.text, fixed: true } : l; }));
        if (r.doubts && r.doubts.length) setDoubts((p) => { const n = { ...p }; r.doubts.forEach((d) => { n[d.i] = d.options; }); return n; });
      } catch { /* cleaning is a bonus: ignore failures */ }
    }, 20000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, goal, lang, files]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const applyDoubt = (i, text) => { setLines((p) => p.map((l, k) => (k === i ? { ...l, raw: l.raw || l.text, text, fixed: true } : l))); setDoubts((p) => { const n = { ...p }; delete n[i]; return n; }); };
  const updateSpk = (id, patch) => setSpeakers((p) => ({ ...p, [id]: { ...(p[id] || {}), ...patch } }));
  const spkIds = [...new Set(lines.map((l) => l.speaker).filter((x) => x != null))];
  const share = (id) => { const tot = lines.reduce((n, l) => n + (l.speaker != null ? l.text.length : 0), 0) || 1; return Math.round((lines.filter((l) => l.speaker === id).reduce((n, l) => n + l.text.length, 0) / tot) * 100); };

  const asMarkdown = () => [
    `# ${title || 'Meeting'}`, `Length: ${fmtClock(elapsed)}`, goal ? `\n**Notes:** ${goal}` : '',
    summary ? `\n## Summary\n${summary}` : '', '\n## Transcript', ...lines.map((l) => `[${fmtClock(l.at)}] ${l.speaker != null ? spkName(l.speaker) + ': ' : ''}${l.text}`),
  ].filter((x) => x !== '').join('\n');
  const copyAll = async () => { try { await navigator.clipboard.writeText(asMarkdown()); toast.success('Copied'); } catch { toast.error('Copy failed'); } };
  const download = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([asMarkdown()], { type: 'text/markdown' })); a.download = `${(title || 'meeting').replace(/[^\w-]+/g, '_')}.md`; a.click(); };

  const live = state === 'listening' || state === 'starting';

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col text-white md:flex-row">
      {/* ------- transcript ------- */}
      <section className="flex min-h-0 flex-1 flex-col border-white/10 md:border-r">
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
          <Link to="/dashboard" aria-label="Back" className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white"><ArrowLeft size={18} /></Link>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold leading-tight">{title || 'Live Meeting'}</p>
            <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
              {live && <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />}
              {state === 'paused' ? 'Paused' : live ? 'Listening' : 'Not recording'} · {fmtClock(elapsed)}
            </p>
          </div>
          {!live && state !== 'paused' && <button onClick={begin} disabled={!supported} className="flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold hover:bg-red-500 disabled:opacity-40"><Mic size={16} />{lines.length ? 'Continue' : 'Start'}</button>}
          {live && <button onClick={pause} className="flex items-center gap-1.5 rounded-full bg-slate-700 px-3 py-2 text-sm font-semibold hover:bg-slate-600"><Pause size={15} />Pause</button>}
          {state === 'paused' && <button onClick={resume} className="flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-2 text-sm font-semibold hover:bg-red-500"><Play size={15} />Resume</button>}
          {(live || state === 'paused' || lines.length > 0) && <button onClick={finish} aria-label="End meeting" title="End and summarise" className="rounded-full bg-slate-800 p-2.5 hover:bg-slate-700"><Square size={15} /></button>}
          <button onClick={() => setSetup(!setup)} aria-label="Meeting details" title="Meeting details and files" className="rounded-full bg-slate-800 p-2.5 hover:bg-slate-700"><Paperclip size={15} /></button>
        </div>

        {!supported && <p className="m-3 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-200">Live transcription needs Chrome, Edge or Safari. Open this page in one of them.</p>}

        {setup && (
          <div className="space-y-3 border-b border-white/10 bg-slate-900/50 p-3 text-sm">
            <div className="grid gap-2 sm:grid-cols-2">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Meeting name (optional)" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-violet-500" />
              <select value={lang} onChange={(e) => { setLang(e.target.value); recRef.current?.setLang(e.target.value); }} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-violet-500">
                {LANGS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
              </select>
            </div>
            <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} placeholder="What is this meeting about? Who is in it? What do you want out of it? (helps the questions be relevant)" className="w-full resize-none rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-violet-500" />
            <div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-600 px-3 py-2 text-slate-300 hover:border-violet-500">
                <Paperclip size={15} /> Add files for context (PDF, Word, PowerPoint, text)
                <input type="file" multiple accept=".pdf,.docx,.pptx,.txt,.md,.csv,.srt,.vtt" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
              </label>
              {files.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{files.map((f, i) => (
                <span key={i} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-violet-500/15 px-3 py-1 text-xs text-violet-200"><FileText size={12} /><span className="truncate">{f.name}</span><button onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}><X size={12} /></button></span>
              ))}</div>}
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-2.5">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Transcription</p>
              <label className={`flex items-start gap-2 py-1 ${hqAvail ? '' : 'opacity-50'}`}><input type="radio" name="tmode" disabled={!hqAvail || state !== 'idle' || lines.length > 0 && !!recRef.current} checked={mode === 'hq'} onChange={() => { setMode('hq'); recRef.current = null; }} className="mt-1 accent-violet-500" /><span><b>High accuracy</b> <span className="text-slate-400">noise filtering, picks up voices from across the room, tells speakers apart{hqAvail ? '' : ' (not set up yet)'}</span></span></label>
              <label className="flex items-start gap-2 py-1"><input type="radio" name="tmode" disabled={state !== 'idle' || !speechSupported()} checked={mode === 'std'} onChange={() => { setMode('std'); recRef.current = null; }} className="mt-1 accent-violet-500" /><span><b>Standard</b> <span className="text-slate-400">free, uses your browser, no speaker names</span></span></label>
            </div>
            <label className="flex items-center gap-2 text-slate-300"><input type="checkbox" checked={autoQ} onChange={(e) => setAutoQ(e.target.checked)} className="accent-violet-500" /> Suggest questions automatically when someone asks "any questions?"</label>
            <p className="text-xs text-slate-500">For a meeting in a room: put your phone or laptop in the middle of the table with the microphone facing the speakers, and keep it away from fans and loud screens. A small external microphone helps most. Nothing is recorded: only text is kept, on this device.</p>
          </div>
        )}

        {spkIds.length > 0 && (
          <div className="border-b border-white/10 px-3 py-2">
            <div className="flex flex-wrap gap-1.5">
              {spkIds.map((id) => {
                const sp = speakers[id] || {};
                return (
                  <button key={id} onClick={() => setOpenSpk(openSpk === id ? null : id)} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${sp.bg ? 'border-slate-700 text-slate-500 line-through' : 'border-white/15 ' + SPK_COLORS[id % SPK_COLORS.length]}`}>
                    {sp.me ? '★ ' : ''}{spkName(id)} <span className="font-normal text-slate-500">{share(id)}%</span>
                  </button>
                );
              })}
            </div>
            {openSpk != null && (
              <div className="mt-2 space-y-2 rounded-xl border border-white/10 bg-slate-900/70 p-2.5 text-xs">
                <input value={(speakers[openSpk] && speakers[openSpk].name) || ''} onChange={(e) => updateSpk(openSpk, { name: e.target.value.slice(0, 30) })} placeholder={`Name for ${spkName(openSpk)}`} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 outline-none focus:border-violet-500" />
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => updateSpk(openSpk, { me: !(speakers[openSpk] || {}).me, name: (speakers[openSpk] || {}).me ? (speakers[openSpk] || {}).name : ((speakers[openSpk] || {}).name || 'Me') })} className="rounded-lg bg-slate-800 px-2.5 py-1.5 hover:bg-slate-700">★ This is me</button>
                  <button onClick={() => updateSpk(openSpk, { bg: !(speakers[openSpk] || {}).bg })} className="rounded-lg bg-slate-800 px-2.5 py-1.5 hover:bg-slate-700">{(speakers[openSpk] || {}).bg ? 'Include this voice again' : 'Background noise: ignore this voice'}</button>
                  <button onClick={() => setOpenSpk(null)} className="rounded-lg px-2.5 py-1.5 text-slate-400 hover:text-white">Done</button>
                </div>
                <p className="text-slate-500">Ignored voices stay on screen, dimmed, but are not used for questions, research or summaries.</p>
              </div>
            )}
          </div>
        )}

        <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {lines.length === 0 && !interim && (
            <div className="mx-auto mt-10 max-w-sm text-center text-slate-500">
              <Mic className="mx-auto mb-3 text-violet-400" size={34} />
              <p className="font-semibold text-slate-300">Press Start when the meeting begins</p>
              <p className="mt-1 text-sm">Words appear here as they are spoken. Ask for questions, research or a summary any time.</p>
            </div>
          )}
          {lines.map((l, i) => {
            const bg = l.speaker != null && speakers[l.speaker] && speakers[l.speaker].bg;
            return (
              <div key={i} className={bg ? 'opacity-35' : ''}>
                <p className="text-[15px] leading-relaxed text-slate-100">
                  <span className="mr-2 font-mono text-[11px] text-slate-500">{fmtClock(l.at)}</span>
                  {l.speaker != null && <span className={`mr-1.5 text-xs font-bold ${SPK_COLORS[l.speaker % SPK_COLORS.length]}`}>{spkName(l.speaker)}</span>}
                  {l.text}
                  {l.fixed && <button onClick={() => toast(`Heard: "${l.raw}"`, { icon: '✎' })} title={`Heard: ${l.raw}`} aria-label="Corrected line, tap to see what was heard" className="ml-1.5 align-middle text-[11px] text-violet-400/80 hover:text-violet-300">✎</button>}
                </p>
                {doubts[i] && (
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-amber-200/90">
                    Not sure I heard that right. Did they mean:
                    {doubts[i].map((o, k) => <button key={k} onClick={() => applyDoubt(i, o)} className="rounded-full bg-amber-400/15 px-2.5 py-1 hover:bg-amber-400/25">{o}</button>)}
                    <button onClick={() => setDoubts((p) => { const n = { ...p }; delete n[i]; return n; })} aria-label="Dismiss" className="text-slate-500 hover:text-white"><X size={12} /></button>
                  </p>
                )}
              </div>
            );
          })}
          {interim && <p className="text-[15px] italic leading-relaxed text-slate-400">{interim}</p>}
        </div>
        {err && <p className="border-t border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-200">{err}</p>}
        <div className="flex items-center justify-between gap-2 border-t border-white/10 px-3 py-2 text-xs text-slate-400">
          <span>{lines.length} lines</span>
          <span className="flex items-center gap-1">
            <button onClick={copyAll} disabled={!lines.length} className="flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-white/10 disabled:opacity-30"><Copy size={13} /> Copy</button>
            <button onClick={download} disabled={!lines.length} className="flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-white/10 disabled:opacity-30"><Download size={13} /> Download</button>
            <button onClick={reset} className="flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-white/10 hover:text-red-300"><RotateCcw size={13} /> New</button>
          </span>
        </div>
      </section>

      {/* ------- assistant ------- */}
      <section className="flex h-[48dvh] min-h-0 flex-col border-t border-white/10 bg-slate-950/40 md:h-auto md:w-[26rem] md:border-t-0 lg:w-[30rem]">
        <div className="flex border-b border-white/10">
          {TABS.map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)} className={`relative flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-semibold sm:text-sm ${tab === id ? 'text-violet-300' : 'text-slate-400 hover:text-white'}`}>
              <Icon size={15} />{label}
              {id === 'questions' && flash && tab !== 'questions' && <span className="absolute right-3 top-2 h-2 w-2 animate-ping rounded-full bg-amber-400" />}
              {tab === id && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded bg-violet-500" />}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {tab === 'questions' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Focus (optional), e.g. budget, timeline" className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-violet-500" />
                <button onClick={() => getQuestions(false)} disabled={busy === 'questions'} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-violet-600 px-3 text-sm font-semibold hover:bg-violet-500 disabled:opacity-50">{busy === 'questions' ? <Loader2 size={15} className="animate-spin" /> : <MessageCircleQuestion size={15} />}Suggest</button>
              </div>
              {flash && <p className="rounded-xl bg-amber-400/10 px-3 py-2 text-xs text-amber-200">They asked for questions. Here are some you can use.</p>}
              {questions.length === 0 && busy !== 'questions' && <p className="py-6 text-center text-sm text-slate-500">Press Suggest any time, or let it do it for you when someone asks "any questions?".</p>}
              {questions.map((q, i) => (
                <button key={i} onClick={async () => { try { await navigator.clipboard.writeText(q.q); toast.success('Copied'); } catch { /* ignore */ } }} className="block w-full rounded-2xl border border-white/10 bg-slate-900/70 p-3 text-left hover:border-violet-500/50">
                  <p className="font-medium leading-snug text-white">{q.q}</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">{q.type && <span className={`rounded-full px-2 py-0.5 font-semibold ${TYPE_STYLE[q.type] || 'bg-slate-700 text-slate-300'}`}>{q.type}</span>}{q.why}</p>
                </button>
              ))}
            </div>
          )}

          {tab === 'research' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doResearch()} placeholder="Look something up, or leave empty to research what was just said" className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-violet-500" />
                <button onClick={doResearch} disabled={busy === 'research'} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-violet-600 px-3 text-sm font-semibold hover:bg-violet-500 disabled:opacity-50">{busy === 'research' ? <Loader2 size={15} className="animate-spin" /> : <Globe size={15} />}Research</button>
              </div>
              {busy === 'research' && <p className="animate-pulse text-sm text-slate-400">Searching the web...</p>}
              {!research && busy !== 'research' && <p className="py-6 text-center text-sm text-slate-500">Searches the web and gives you a quick briefing with sources.</p>}
              {research && (
                <div>
                  <Markdown content={research.text} />
                  {research.sources && research.sources.length > 0 && (
                    <details className="mt-3 rounded-xl border border-white/10 bg-slate-900/60 p-3 text-sm">
                      <summary className="flex cursor-pointer items-center gap-1 text-slate-300">Sources ({research.sources.length}) <ChevronDown size={14} /></summary>
                      <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs">
                        {research.sources.map((s, i) => <li key={i}><a href={s.url} target="_blank" rel="noreferrer" className="break-words text-violet-300 underline">{s.title || s.url}</a></li>)}
                      </ol>
                    </details>
                  )}
                  <p className="mt-2 text-[11px] text-slate-500">Based on web search snippets. Double-check anything important before quoting it.</p>
                </div>
              )}
            </div>
          )}

          {tab === 'summary' && (
            <div className="space-y-3">
              <button onClick={doSummary} disabled={busy === 'summary' || lines.length < 2} className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold hover:bg-violet-500 disabled:opacity-50">{busy === 'summary' ? <Loader2 size={15} className="animate-spin" /> : <ListChecks size={15} />}{summary ? 'Update summary' : 'Summarise so far'}</button>
              {summary ? <Markdown content={summary} /> : <p className="py-6 text-center text-sm text-slate-500">Key points, decisions and action items from the meeting. It also runs automatically when you end the meeting.</p>}
            </div>
          )}

          {tab === 'ask' && (
            <div className="space-y-3">
              {answers.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Ask anything about the meeting: "What did they say about the deadline?", "Explain that term", "Draft a reply".</p>}
              {answers.map((x, i) => (
                <div key={i} className="space-y-2">
                  <p className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-md bg-violet-600 px-3 py-2 text-sm">{x.q}</p>
                  {x.a ? <Markdown content={x.a} /> : <p className="animate-pulse text-sm text-slate-400">Thinking...</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {tab === 'ask' && (
          <div className="flex gap-2 border-t border-white/10 p-3">
            <input value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doAsk()} placeholder="Ask about the meeting..." className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-violet-500" />
            <button onClick={doAsk} disabled={busy === 'ask' || !question.trim()} aria-label="Send" className="rounded-xl bg-violet-600 px-3.5 hover:bg-violet-500 disabled:opacity-50"><Send size={16} /></button>
          </div>
        )}
      </section>
    </div>
  );
}
