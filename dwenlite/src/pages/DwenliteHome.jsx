import { useCallback, useEffect, useRef, useState } from 'react';
import { Home, Monitor, Brain, SlidersHorizontal, RotateCcw, Paperclip, Camera, Send, Square, X, Wifi, WifiOff, ShieldAlert, Trash2, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { auth } from '../firebase';
import ChatAnswer from '../components/ChatAnswer';
import ActionCard from '../components/home/ActionCard';
import DevicePanel from '../components/home/DevicePanel';
import { createLiveStream } from '../lib/liveStream';
import { createTypewriter } from '../lib/typewriter';
import { homeCall, homeChatStream, imageToText, IMAGE_MODES, runJs, formatJsResult } from '../lib/homeClient';

const READ_ONLY = new Set(['read_file', 'list_dir', 'system_info']);
const SCREEN = new Set(['screenshot', 'click', 'type_text', 'press_key', 'scroll']);
const JOB_TYPE = { run_shell: 'shell' };
const uid = () => Math.random().toString(36).slice(2, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MODES = [
  { id: 'ask', title: 'Ask me every time', text: 'Safest. Every command, file change, screenshot, click and keystroke waits for your Approve.' },
  { id: 'screen', title: 'Computer-use mode', text: 'Reading files, looking at the screen, clicking, typing and scrolling run on their own. Commands, file writes and opening links still ask.' },
  { id: 'auto', title: 'Autonomous', text: 'Everything runs without asking. Use only when you are watching, and press Stop at any time.' },
];

const QUICK = [
  'Take a screenshot and tell me what is on my screen',
  'My computer feels slow. Find out why and suggest fixes',
  'Write a Python script that renames all photos in a folder by date',
  'Check how much free disk space I have',
];

export default function DwenliteHome() {
  const [gate, setGate] = useState('checking'); // checking | ok | denied | signin | error
  const [vision, setVision] = useState(false);
  const [devices, setDevices] = useState([]);
  const [memory, setMemory] = useState([]);
  const [items, setItems] = useState([]);
  const [input, setInput] = useState('');
  const [images, setImages] = useState([]);
  const [imageMode, setImageMode] = useState('describe');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(() => { try { return localStorage.getItem('dwenliteHomeMode') || 'ask'; } catch { return 'ask'; } });
  const [maxSteps, setMaxSteps] = useState(15);
  const [panel, setPanel] = useState(null); // devices | memory | settings
  const [codeRun, setCodeRun] = useState(null);
  const [newFact, setNewFact] = useState('');

  const convo = useRef([]);
  const stopRef = useRef(false);
  const approvals = useRef({});
  const abortRef = useRef(null);
  const activeJob = useRef(null);
  const devicesRef = useRef([]);
  const modeRef = useRef(mode);
  const listRef = useRef(null);
  const fileRef = useRef(null);
  const camRef = useRef(null);
  devicesRef.current = devices;
  modeRef.current = mode;

  const add = (item) => setItems((p) => [...p, item]);
  const patch = useCallback((id, p) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...p } : i))), []);

  // ---------------------------------------------------------------- access (admin only, checked by the server)
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) { setGate('signin'); return; }
      try {
        const r = await homeCall('whoami');
        setVision(!!r.vision);
        try { localStorage.setItem('dwenliteAdmin', '1'); } catch { /* ignore */ }
        setGate('ok');
      } catch (e) {
        setGate(e.status === 403 ? 'denied' : e.status === 401 ? 'signin' : 'error');
      }
    });
    return unsub;
  }, []);

  const loadDevices = useCallback(async () => { try { setDevices((await homeCall('device_list')).devices || []); } catch { /* keep the last list */ } }, []);
  const loadMemory = useCallback(async () => { try { setMemory((await homeCall('memory_get')).facts || []); } catch { /* optional */ } }, []);
  useEffect(() => {
    if (gate !== 'ok') return undefined;
    loadDevices(); loadMemory();
    const t = setInterval(loadDevices, 8000);
    return () => clearInterval(t);
  }, [gate, loadDevices, loadMemory]);

  // Run buttons on JavaScript / HTML code blocks
  useEffect(() => {
    const onRun = async (e) => {
      const { lang, code } = e.detail;
      if (lang === 'html') { setCodeRun({ kind: 'html', code }); return; }
      setCodeRun({ kind: 'js', code, output: 'Running...' });
      const r = await runJs(code);
      setCodeRun({ kind: 'js', code, output: formatJsResult(r) });
    };
    window.addEventListener('dwenlite:run', onRun);
    return () => window.removeEventListener('dwenlite:run', onRun);
  }, []);

  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [items.length]);

  // ---------------------------------------------------------------- tools
  const pickDevice = (hint) => {
    const list = devicesRef.current;
    if (!list.length) return { error: 'No computer is connected yet. Ask the owner to add one under Devices.' };
    if (hint) {
      const h = String(hint).toLowerCase();
      const d = list.find((x) => x.id === hint) || list.find((x) => x.name.toLowerCase() === h) || list.find((x) => x.name.toLowerCase().includes(h));
      return d ? { d } : { error: `No device matches "${hint}". Devices: ${list.map((x) => x.name).join(', ')}.` };
    }
    const online = list.filter((x) => x.online);
    if (online.length === 1) return { d: online[0] };
    if (online.length === 0 && list.length === 1) return { d: list[0] };
    return { error: online.length ? `Several devices are online (${online.map((x) => x.name).join(', ')}). Ask the owner which one to use.` : `No device is online. Known: ${list.map((x) => x.name).join(', ')}.` };
  };

  const needsApproval = (name) => {
    const m = modeRef.current;
    if (m === 'auto') return false;
    if (m === 'screen') return !(READ_ONLY.has(name) || SCREEN.has(name));
    return true;
  };

  const decide = (id, ok) => { const r = approvals.current[id]; if (r) { delete approvals.current[id]; r(ok); } };

  async function handleTool(call) {
    let args = {};
    try { args = JSON.parse(call.arguments || '{}'); } catch { return 'Error: the tool arguments were not valid JSON. Try again.'; }
    const name = call.name;

    if (name === 'remember') {
      try { await homeCall('memory_add', { fact: args.fact }); loadMemory(); return 'Saved to memory.'; } catch (e) { return `Error: ${e.message}`; }
    }
    const id = uid();
    if (name === 'run_js') {
      add({ id, type: 'action', tool: name, args, status: 'running', note: 'Running in a sandbox...' });
      const r = await runJs(String(args.code || ''));
      const out = formatJsResult(r);
      patch(id, { status: r.error ? 'error' : 'done', output: out });
      return out.slice(0, 8000);
    }

    const picked = pickDevice(args.device);
    if (picked.error) {
      add({ id, type: 'action', tool: name, args, status: 'error', output: picked.error });
      return `Error: ${picked.error}`;
    }
    const dev = picked.d;
    const jobType = JOB_TYPE[name] || name;
    const jobArgs = { ...args }; delete jobArgs.device;
    add({ id, type: 'action', tool: name, args, deviceName: dev.name, status: needsApproval(name) ? 'asking' : 'running', note: 'Starting...' });

    if (needsApproval(name)) {
      const ok = await new Promise((resolve) => { approvals.current[id] = resolve; });
      if (!ok) { patch(id, { status: 'denied' }); return 'The owner denied this action. Do not try it again. Ask what they would like instead.'; }
      patch(id, { status: 'running' });
    }
    if (stopRef.current) { patch(id, { status: 'denied', output: 'Stopped.' }); return 'Cancelled by the owner.'; }

    let jobId;
    try { jobId = (await homeCall('job_create', { deviceId: dev.id, type: jobType, args: jobArgs })).id; } catch (e) { patch(id, { status: 'error', output: e.message }); return `Error: ${e.message}`; }
    activeJob.current = jobId;
    const started = Date.now();
    const limit = ((Number(args.timeout_s) || 60) * 1000) + 150000;
    let sawRunning = false;
    for (;;) {
      if (stopRef.current) { homeCall('job_cancel', { id: jobId }).catch(() => {}); patch(id, { status: 'error', output: 'Stopped.' }); return 'Cancelled by the owner.'; }
      let j;
      try { j = await homeCall('job_get', { id: jobId }); } catch (e) { await sleep(1500); if (Date.now() - started > limit) { patch(id, { status: 'error', output: e.message }); return `Error: ${e.message}`; } continue; }
      if (j.status === 'done' || j.status === 'error') {
        activeJob.current = null;
        patch(id, { status: j.status, output: j.result, image: j.image || '' });
        return `${j.status === 'error' ? 'ERROR: ' : ''}${String(j.result || '(no output)').slice(0, 8000)}${j.image ? '\n[A screenshot was taken and is shown to the owner.]' : ''}`;
      }
      if (j.status === 'cancelled') { patch(id, { status: 'error', output: 'Cancelled.' }); return 'Cancelled by the owner.'; }
      const waited = Date.now() - started;
      if (j.status === 'running') { sawRunning = true; patch(id, { note: `Running on ${dev.name}...` }); }
      else patch(id, { note: waited > 8000 ? `Waiting for ${dev.name} to pick it up. Is the agent running there?` : 'Sent to the device...' });
      if (!sawRunning && waited > 150000) {
        homeCall('job_cancel', { id: jobId }).catch(() => {});
        const msg = `${dev.name} did not pick this up within 2.5 minutes. The agent may not be running.`;
        patch(id, { status: 'error', output: msg });
        return `Error: ${msg}`;
      }
      if (waited > limit) { patch(id, { status: 'error', output: 'Timed out waiting for the result.' }); return 'Error: timed out waiting for the result.'; }
      await sleep(1400);
    }
  }

  // ---------------------------------------------------------------- one assistant turn (streamed with the same sparkle effect as the study chat)
  async function streamAssistant() {
    const aiId = uid();
    const live = createLiveStream();
    add({ id: aiId, type: 'ai', content: '', typing: true, live });
    const tw = createTypewriter((shown, typing) => live.update(shown, typing));
    abortRef.current = new AbortController();
    try {
      const { text, tools } = await homeChatStream({
        messages: convo.current,
        devices: devicesRef.current.map((d) => ({ id: d.id, name: d.name, online: d.online, platform: d.platform, caps: d.caps })),
        onText: (t) => tw.set(t),
        signal: abortRef.current.signal,
      });
      tw.set(text);
      await tw.finish();
      if (!text.trim()) setItems((p) => p.filter((i) => i.id !== aiId)); else patch(aiId, { content: text, typing: false });
      return { text, tools };
    } catch (e) {
      tw.cancel();
      setItems((p) => p.filter((i) => i.id !== aiId));
      throw e;
    }
  }

  async function runLoop() {
    setBusy(true);
    stopRef.current = false;
    try {
      for (let step = 0; step < maxSteps; step++) {
        const { text, tools } = await streamAssistant();
        const msg = { role: 'assistant', content: text };
        if (tools.length) msg.tool_calls = tools.map((t) => ({ id: t.id, type: 'function', function: { name: t.name, arguments: t.arguments || '{}' } }));
        convo.current.push(msg);
        if (!tools.length) break;
        for (const t of tools) {
          if (stopRef.current) { convo.current.push({ role: 'tool', tool_call_id: t.id, content: 'Cancelled by the owner.' }); continue; }
          const out = await handleTool(t);
          convo.current.push({ role: 'tool', tool_call_id: t.id, content: String(out).slice(0, 8000) });
        }
        if (stopRef.current) break;
        if (step === maxSteps - 1) add({ id: uid(), type: 'info', text: `Paused after ${maxSteps} steps. Send a message to let it continue.` });
      }
    } catch (e) {
      if (e.name !== 'AbortError') toast.error(e.message || 'Something went wrong.');
    } finally {
      setBusy(false);
      stopRef.current = false;
    }
  }

  function stopNow() {
    stopRef.current = true;
    abortRef.current?.abort();
    Object.keys(approvals.current).forEach((id) => decide(id, false));
    if (activeJob.current) homeCall('job_cancel', { id: activeJob.current }).catch(() => {});
  }

  // ---------------------------------------------------------------- sending
  const addImages = (files) => {
    const list = Array.from(files || []).filter((f) => f.type.startsWith('image/')).slice(0, 4 - images.length);
    if (!list.length) return;
    setImages((p) => [...p, ...list.map((file) => ({ id: uid(), file, url: URL.createObjectURL(file) }))].slice(0, 4));
  };

  async function send(textOverride) {
    const t = (textOverride ?? input).trim();
    if (busy || (!t && !images.length)) return;
    const imgs = images;
    setInput(''); setImages([]);
    setBusy(true);
    const modeLabel = (IMAGE_MODES.find((m) => m.id === imageMode) || IMAGE_MODES[0]).label.toLowerCase();
    const analysis = [];
    for (let i = 0; i < imgs.length; i++) {
      const note = uid();
      add({ id: note, type: 'info', text: `Reading image ${i + 1} of ${imgs.length}...` });
      try {
        const r = await imageToText(imgs[i].file, { mode: imageMode, instruction: t });
        analysis.push(r.text);
        patch(note, { text: `Image ${i + 1} read (${r.via}).` });
      } catch (e) {
        analysis.push(`[Could not read this image: ${e.message}]`);
        patch(note, { text: `Could not read image ${i + 1}: ${e.message}` });
      }
    }
    const content = (t || 'Please look at the attached image(s) and tell me what matters.')
      + analysis.map((a, i) => `\n\n[Image ${i + 1}, ${modeLabel}, as read by the image model:\n${a}\n]`).join('');
    add({ id: uid(), type: 'user', text: t, thumbs: imgs.map((i) => i.url), analysis });
    convo.current.push({ role: 'user', content });
    await runLoop();
  }

  function newChat() {
    stopNow();
    convo.current = [];
    setItems([]);
  }

  const chooseMode = (m) => {
    if (m === 'auto' && !window.confirm('Autonomous mode lets the assistant run commands, write files, click and type on your devices WITHOUT asking each time.\n\nYou can press Stop at any moment. Turn it on?')) return;
    setMode(m);
    try { localStorage.setItem('dwenliteHomeMode', m); } catch { /* ignore */ }
  };

  // ---------------------------------------------------------------- screens
  if (gate !== 'ok') {
    const msg = {
      checking: 'Checking access...',
      signin: 'Please sign in to use Dwenlite Home.',
      denied: 'Dwenlite Home is only available to the owner of this app.',
      error: 'Could not reach Dwenlite Home. Make sure the latest functions are deployed, then try again.',
    }[gate];
    return (
      <div className="flex min-h-[60dvh] items-center justify-center p-6 text-center text-slate-300">
        <div>
          <ShieldAlert className="mx-auto mb-3 text-violet-300" size={36} />
          <p className={gate === 'checking' ? 'animate-pulse' : ''}>{msg}</p>
        </div>
      </div>
    );
  }

  const onlineCount = devices.filter((d) => d.online).length;
  const modeBanner = mode === 'screen' ? 'Computer-use mode: screen actions run on their own' : mode === 'auto' ? 'AUTONOMOUS: everything runs without asking' : '';

  return (
    <div className="home-root flex h-[calc(100dvh-4rem)] flex-col text-white">
      {/* top bar */}
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5 md:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600"><Home size={18} /></span>
          <div className="min-w-0">
            <p className="truncate font-bold leading-tight">Dwenlite Home</p>
            <p className="truncate text-[11px] text-slate-500">Your personal assistant</p>
          </div>
        </div>
        <button onClick={() => setPanel('devices')} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-800/70 px-3 py-1.5 text-xs hover:border-violet-500/50">
          {onlineCount ? <Wifi size={13} className="text-emerald-400" /> : <WifiOff size={13} className="text-slate-500" />}
          <span className="hidden sm:inline">{devices.length ? `${onlineCount}/${devices.length} online` : 'Add a computer'}</span>
          <Monitor size={13} className="sm:hidden" />
        </button>
        <button onClick={() => setPanel('memory')} aria-label="Memory" title="What it remembers" className="rounded-full border border-white/10 bg-slate-800/70 p-2 hover:border-violet-500/50"><Brain size={16} /></button>
        <button onClick={() => setPanel('settings')} aria-label="Settings" title="How much it may do on its own" className="rounded-full border border-white/10 bg-slate-800/70 p-2 hover:border-violet-500/50"><SlidersHorizontal size={16} /></button>
        <button onClick={newChat} aria-label="New chat" title="New chat" className="rounded-full border border-white/10 bg-slate-800/70 p-2 hover:border-violet-500/50"><RotateCcw size={16} /></button>
      </div>

      {modeBanner && (
        <div className={`flex items-center justify-between px-4 py-1.5 text-xs font-semibold ${mode === 'auto' ? 'bg-red-500/20 text-red-200' : 'bg-amber-400/15 text-amber-200'}`}>
          <span>{modeBanner}</span>
          {busy && <button onClick={stopNow} className="rounded-md bg-black/30 px-2 py-0.5">Stop</button>}
        </div>
      )}

      {/* conversation */}
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-4 md:px-6">
        {items.length === 0 && (
          <div className="mx-auto mt-6 max-w-xl text-center">
            <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600"><Sparkles size={26} /></span>
            <h1 className="text-xl font-bold">What can I do for you?</h1>
            <p className="mt-1 text-sm text-slate-400">Code, look at pictures, and operate your computers on your behalf, with your approval.</p>
            {!devices.length && <button onClick={() => setPanel('devices')} className="mt-4 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold hover:bg-violet-500">Connect your first computer</button>}
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {QUICK.map((q) => <button key={q} onClick={() => send(q)} className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-left text-xs text-violet-100 hover:bg-violet-500/20">{q}</button>)}
            </div>
          </div>
        )}

        {items.map((m) => {
          if (m.type === 'user') return (
            <div key={m.id} className="ml-auto max-w-[92%] sm:max-w-[80%]">
              <div className="rounded-2xl rounded-br-md bg-violet-600 p-3 text-sm">
                {m.thumbs && m.thumbs.length > 0 && <div className="mb-2 flex flex-wrap gap-2">{m.thumbs.map((u) => <img key={u} src={u} alt="" className="h-20 rounded-lg object-cover" />)}</div>}
                {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
              </div>
              {m.analysis && m.analysis.length > 0 && (
                <details className="mt-1 text-xs text-slate-500"><summary className="cursor-pointer">What the image model read</summary><pre className="mt-1 whitespace-pre-wrap rounded-lg bg-black/30 p-2 text-slate-400">{m.analysis.join('\n---\n')}</pre></details>
              )}
            </div>
          );
          if (m.type === 'ai') return (
            <div key={m.id} className="max-w-[96%] rounded-2xl rounded-bl-md bg-slate-800 p-3 text-sm text-slate-200 sm:max-w-[85%]">
              <ChatAnswer content={m.content} typing={m.typing} live={m.live} />
            </div>
          );
          if (m.type === 'action') return <div key={m.id} className="max-w-[96%] sm:max-w-[85%]"><ActionCard item={m} onDecide={decide} /></div>;
          return <p key={m.id} className="text-center text-xs italic text-slate-500">{m.text}</p>;
        })}
      </div>

      {/* composer */}
      <div className="border-t border-white/10 bg-slate-950/60 px-3 pb-3 pt-2 md:px-6">
        {images.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {images.map((im) => (
              <span key={im.id} className="relative">
                <img src={im.url} alt="" className="h-14 w-14 rounded-lg object-cover" />
                <button onClick={() => setImages((p) => p.filter((x) => x.id !== im.id))} aria-label="Remove image" className="absolute -right-1.5 -top-1.5 rounded-full bg-slate-900 p-0.5 text-slate-300"><X size={12} /></button>
              </span>
            ))}
            <select value={imageMode} onChange={(e) => setImageMode(e.target.value)} aria-label="How to read the image" className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs">
              {IMAGE_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            {!vision && <span className="text-[11px] text-amber-300/80">No image model set: only text in pictures can be read.</span>}
          </div>
        )}
        <div className="flex items-end gap-2">
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addImages(e.target.files); e.target.value = ''; }} />
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { addImages(e.target.files); e.target.value = ''; }} />
          <button onClick={() => fileRef.current?.click()} aria-label="Attach image" className="rounded-xl p-2.5 text-slate-400 hover:bg-white/10 hover:text-white"><Paperclip size={20} /></button>
          <button onClick={() => camRef.current?.click()} aria-label="Take a photo" className="rounded-xl p-2.5 text-slate-400 hover:bg-white/10 hover:text-white"><Camera size={20} /></button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && window.innerWidth >= 768) { e.preventDefault(); send(); } }}
            onPaste={(e) => { const f = Array.from(e.clipboardData?.files || []); if (f.length) { e.preventDefault(); addImages(f); } }}
            rows={1}
            placeholder="Ask, code, or tell me what to do on your computer..."
            className="max-h-40 min-h-[2.75rem] flex-1 resize-none rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm outline-none focus:border-violet-500"
          />
          {busy
            ? <button onClick={stopNow} aria-label="Stop" className="rounded-xl bg-red-600 p-3 hover:bg-red-500"><Square size={18} fill="currentColor" /></button>
            : <button onClick={() => send()} disabled={!input.trim() && !images.length} aria-label="Send" className="rounded-xl bg-violet-600 p-3 hover:bg-violet-500 disabled:opacity-40"><Send size={18} /></button>}
        </div>
      </div>

      {/* panels */}
      {panel === 'devices' && <DevicePanel devices={devices} reload={loadDevices} onClose={() => setPanel(null)} />}

      {panel === 'memory' && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setPanel(null)}>
          <div className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-[#121217] p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">What I remember</h2><button onClick={() => setPanel(null)} aria-label="Close"><X size={22} className="text-slate-400" /></button></div>
            <div className="space-y-2">
              {memory.length === 0 && <p className="text-sm text-slate-400">Nothing yet. Tell me things worth remembering, like your setup, projects and preferences.</p>}
              {memory.map((f) => (
                <div key={f.at} className="flex items-start gap-2 rounded-xl bg-slate-900/70 p-3 text-sm"><span className="flex-1">{f.text}</span>
                  <button aria-label="Forget this" onClick={async () => { try { setMemory((await homeCall('memory_delete', { at: f.at })).facts); } catch (e) { toast.error(e.message); } }} className="text-slate-500 hover:text-red-400"><Trash2 size={15} /></button></div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <input value={newFact} onChange={(e) => setNewFact(e.target.value)} maxLength={400} placeholder="Add something to remember" className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-violet-500" />
              <button onClick={async () => { if (!newFact.trim()) return; try { setMemory((await homeCall('memory_add', { fact: newFact })).facts); setNewFact(''); } catch (e) { toast.error(e.message); } }} className="rounded-xl bg-violet-600 px-4 text-sm font-semibold hover:bg-violet-500">Add</button>
            </div>
          </div>
        </div>
      )}

      {panel === 'settings' && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setPanel(null)}>
          <div className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-[#121217] p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">How much may it do alone?</h2><button onClick={() => setPanel(null)} aria-label="Close"><X size={22} className="text-slate-400" /></button></div>
            <div className="space-y-2">
              {MODES.map((m) => (
                <button key={m.id} onClick={() => chooseMode(m.id)} className={`block w-full rounded-2xl border p-3 text-left ${mode === m.id ? (m.id === 'auto' ? 'border-red-500/60 bg-red-500/10' : 'border-violet-500/60 bg-violet-500/10') : 'border-white/10 bg-slate-900/60'}`}>
                  <p className="font-semibold">{m.title}</p><p className="mt-0.5 text-xs text-slate-400">{m.text}</p>
                </button>
              ))}
            </div>
            <label className="mt-4 flex items-center justify-between text-sm text-slate-300">Steps before it pauses
              <select value={maxSteps} onChange={(e) => setMaxSteps(Number(e.target.value))} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5">{[8, 15, 25, 40].map((n) => <option key={n} value={n}>{n}</option>)}</select>
            </label>
            <p className="mt-4 text-xs text-slate-500">The Stop button works in every mode. Each computer's agent also has its own switches (commands and screen control) that you set when you start it.</p>
          </div>
        </div>
      )}

      {codeRun && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setCodeRun(null)}>
          <div className="flex max-h-[85dvh] w-full max-w-2xl flex-col rounded-2xl border border-white/10 bg-[#121217]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><h2 className="font-bold">{codeRun.kind === 'html' ? 'Preview' : 'Output'}</h2><button onClick={() => setCodeRun(null)} aria-label="Close"><X size={20} className="text-slate-400" /></button></div>
            <div className="flex-1 overflow-auto p-4">
              {codeRun.kind === 'html'
                ? <iframe title="Preview" sandbox="allow-scripts" srcDoc={codeRun.code} className="h-[55dvh] w-full rounded-lg bg-white" />
                : <pre className="whitespace-pre-wrap break-words font-mono text-sm text-slate-200">{codeRun.output}</pre>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
