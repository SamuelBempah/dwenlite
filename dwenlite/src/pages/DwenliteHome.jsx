import { useCallback, useEffect, useRef, useState } from 'react';
import { Home, Monitor, Brain, SlidersHorizontal, RotateCcw, History, Repeat, Mic, Volume2, VolumeX, Bell, BookmarkPlus, FileUp, Paperclip, Camera, Send, Square, X, Wifi, WifiOff, ShieldAlert, Trash2, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { auth } from '../firebase';
import ChatAnswer from '../components/ChatAnswer';
import ActionCard from '../components/home/ActionCard';
import DevicePanel from '../components/home/DevicePanel';
import PlanCard from '../components/home/PlanCard';
import ActivityPanel from '../components/home/ActivityPanel';
import RoutinesPanel from '../components/home/RoutinesPanel';
import { pushSupported, pushState, enablePush, disablePush, pingMe } from '../lib/push';
import { micSupported, listenOnce, speak, forSpeech } from '../lib/homeVoice';
import { uploadPieces, downloadPieces, MAX_FILE } from '../lib/homeFiles';
import { AnimatePresence, Appear, IconBtn, Motion, Sheet, Tap, motion, spring } from '../components/home/motion';
import { createLiveStream } from '../lib/liveStream';
import { createTypewriter } from '../lib/typewriter';
import { homeCall, homeChatStream, imageToText, IMAGE_MODES, runJs, formatJsResult } from '../lib/homeClient';

const READ_ONLY = new Set(['read_file', 'list_dir', 'system_info', 'list_windows', 'send_file']);
const GIT_FREE = new Set(['status', 'diff', 'log', 'show', 'branch']);
const SCREEN = new Set(['screenshot', 'click', 'type_text', 'press_key', 'scroll', 'browser', 'app_ui']);
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
  const [panel, setPanel] = useState(null); // devices | memory | settings | activity | routines
  const [routineDraft, setRoutineDraft] = useState(null);
  const [savable, setSavable] = useState('');
  const [pushOn, setPushOn] = useState('off');
  const [listening, setListening] = useState(false);
  const [speakOn, setSpeakOn] = useState(() => { try { return localStorage.getItem('dwenliteHomeSpeak') === '1'; } catch { return false; } });
  const [speaking, setSpeaking] = useState(false);
  const micRef = useRef(null);
  const voiceRef = useRef(null);
  const speakRef = useRef(false);
  const fromMic = useRef(false);
  const actionsThisTurn = useRef(0);
  const lastPrompt = useRef('');
  speakRef.current = speakOn;
  useEffect(() => { pushState().then(setPushOn); }, []);
  const [codeRun, setCodeRun] = useState(null);
  const [newFact, setNewFact] = useState('');

  const convo = useRef([]);
  const stopRef = useRef(false);
  const [why, setWhy] = useState('');
  const [unlimited, setUnlimited] = useState(false);
  const approvals = useRef({});
  useEffect(() => { const old = document.title; document.title = 'Dwenlite Home'; return () => { document.title = old; }; }, []);
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
        setVision(!!r.vision); setUnlimited(!!r.unlimited);
        try { localStorage.setItem('dwenliteAdmin', '1'); } catch { /* ignore */ }
        setGate('ok');
      } catch (e) {
        if (e.status === 403) setWhy(e.message || ''); setGate(e.status === 403 ? 'denied' : e.status === 401 ? 'signin' : 'error');
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

  const ANDROID_FREE = new Set(['devices', 'info', 'read', 'tap', 'scroll', 'swipe', 'text', 'key', 'open_app', 'apps', 'screenshot']);
  const needsApproval = (name, args = {}) => {
    const m = modeRef.current;
    if (m === 'auto') return false;
    if (name === 'android') return m === 'screen' ? !ANDROID_FREE.has(args.action) : true;
    if (name === 'git') return m === 'screen' ? !GIT_FREE.has(args.action) : true;
    if (name === 'document') return m === 'screen' ? args.action !== 'read' : true;
    if (m === 'screen') return !(READ_ONLY.has(name) || SCREEN.has(name));
    return true;
  };

  const pendingNotes = useRef([]);
  const awayFrom = useRef(null);
  function returnHome() {
    const id = awayFrom.current;
    if (!id) return;
    awayFrom.current = null;
    homeCall('job_create', { deviceId: id, type: 'show_home', args: {} }).catch(() => {});
  }
  // put a changed file back the way it was
  async function undoAction(item, undoId) {
    try {
      const { id } = await homeCall('job_create', { deviceId: item.deviceId, type: 'undo', args: { id: undoId }, summary: 'Undoing a file change' });
      for (let i = 0; i < 40; i++) {
        await sleep(1200);
        const j = await homeCall('job_get', { id });
        if (j.status === 'done') { patch(item.id, { undone: true }); toast.success(j.result || 'Undone'); return; }
        if (j.status === 'error' || j.status === 'cancelled') { toast.error(j.result || 'Could not undo.'); return; }
      }
      toast.error('The computer did not answer. Is the agent running?');
    } catch (e) { toast.error(e.message); }
  }
  const decide = (id, ok) => { const r = approvals.current[id]; if (r) { delete approvals.current[id]; r(ok); } };

  async function handleTool(call) {
    let args = {};
    try { args = JSON.parse(call.arguments || '{}'); } catch { return 'Error: the tool arguments were not valid JSON. Try again.'; }
    const name = call.name;

    if (name === 'remember') {
      try { await homeCall('memory_add', { fact: args.fact }); loadMemory(); return 'Saved to memory.'; } catch (e) { return `Error: ${e.message}`; }
    }
    if (name === 'update_plan') {
      const steps = (Array.isArray(args.steps) ? args.steps : []).map((s) => ({ text: String((s && s.text) || '').slice(0, 200), status: ['pending', 'doing', 'done'].includes(s && s.status) ? s.status : 'pending' })).filter((s) => s.text).slice(0, 12);
      if (!steps.length) return 'Error: give at least one step.';
      setItems((p) => {
        const last = [...p].reverse().find((i) => i.type === 'plan');
        if (last && !last.steps.every((s) => s.status === 'done')) return p.map((i) => (i.id === last.id ? { ...i, steps } : i));
        return [...p, { id: uid(), type: 'plan', steps }];
      });
      return 'Plan updated.';
    }
    const id = uid();
    // searching from the owner's own computer works much better than from a cloud server (search engines block those)
    if (name === 'web_search') {
      const pick = pickDevice(args.device);
      if (!pick.error && pick.d.online) {
        add({ id, type: 'action', tool: name, args, status: 'running', note: 'Searching...' });
        try {
          const { id: jobId } = await homeCall('job_create', { deviceId: pick.d.id, type: 'web_search', args: { query: args.query }, summary: args.summary });
          for (let i = 0; i < 40; i++) {
            if (stopRef.current) { homeCall('job_cancel', { id: jobId }).catch(() => {}); patch(id, { status: 'error', output: 'Stopped.' }); return 'Cancelled by the owner.'; }
            await sleep(1000);
            const j = await homeCall('job_get', { id: jobId });
            if (j.status === 'done') { patch(id, { status: 'done', output: j.result }); return String(j.result || '').slice(0, 12000); }
            if (j.status === 'error' || j.status === 'cancelled') break; // fall back to the server
          }
        } catch { /* fall back to the server */ }
        patch(id, { note: 'Trying another way...' });
      } else add({ id, type: 'action', tool: name, args, status: 'running', note: 'Searching...' });
      try {
        const r = await homeCall('web', { kind: 'search', query: args.query });
        const bad = /^Error:|^No results/.test(r.text || '');
        patch(id, { status: bad ? 'error' : 'done', output: r.text });
        return String(r.text || '(nothing)').slice(0, 12000);
      } catch (e) { patch(id, { status: 'error', output: e.message }); return `Error: ${e.message}`; }
    }
    if (name === 'read_page') {
      add({ id, type: 'action', tool: name, args, status: 'running', note: name === 'web_search' ? 'Searching...' : 'Reading...' });
      try {
        const r = await homeCall('web', name === 'web_search' ? { kind: 'search', query: args.query } : { kind: 'read', url: args.url });
        const bad = /^Error:/.test(r.text || '');
        patch(id, { status: bad ? 'error' : 'done', output: r.text });
        return String(r.text || '(nothing)').slice(0, 12000);
      } catch (e) { patch(id, { status: 'error', output: e.message }); return `Error: ${e.message}`; }
    }
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
    const jobArgs = { ...args }; delete jobArgs.device; delete jobArgs.summary;
    // real mouse/keyboard, a new window or a launched program pulls focus away from this page: remember to come back
    const steals = name === 'open_url' || (name === 'browser' && !!args.visible) || (SCREEN.has(name) && name !== 'screenshot' && (args.foreground || !args.app)) || (name === 'run_shell' && /\b(start|start-process|explorer|invoke-item|ii)\b/i.test(String(args.command || '')));
    add({ id, type: 'action', tool: name, args, deviceName: dev.name, deviceId: dev.id, status: needsApproval(name, args) ? 'asking' : 'running', note: 'Starting...' });

    actionsThisTurn.current += 1;
    if (needsApproval(name, args) && name === 'write_file') {
      // show exactly what would change before asking
      try {
        const pj = await homeCall('job_create', { deviceId: dev.id, type: 'preview_write', args: { path: args.path, content: args.content, append: !!args.append }, summary: 'Checking what would change' });
        for (let i = 0; i < 12; i++) { await sleep(700); const j = await homeCall('job_get', { id: pj.id }); if (j.status === 'done') { patch(id, { preview: j.result }); break; } if (j.status === 'error' || j.status === 'cancelled') break; }
      } catch { /* the preview is a bonus */ }
    }
    if (needsApproval(name, args)) {
      returnHome(); // bring this page back so the question is seen
      pingMe('Needs your OK', args.summary || 'Dwenlite Home is waiting for your approval.');
      const ok = await new Promise((resolve) => { approvals.current[id] = resolve; });
      if (!ok) { patch(id, { status: 'denied' }); return 'The owner denied this action. Do not try it again. Ask what they would like instead.'; }
      patch(id, { status: 'running' });
    }
    if (stopRef.current) { patch(id, { status: 'denied', output: 'Stopped.' }); return 'Cancelled by the owner.'; }

    if (steals) awayFrom.current = dev.id;
    let jobId;
    try { jobId = (await homeCall('job_create', { deviceId: dev.id, type: jobType, args: jobArgs, summary: args.summary })).id; } catch (e) { patch(id, { status: 'error', output: e.message }); return `Error: ${e.message}`; }
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
        const fm = /\[file:([\w-]+):(\d+):(\d+)\]/.exec(j.result || '');
        patch(id, { status: j.status, output: j.result, image: j.image || '', ...(fm && name === 'send_file' ? { fileMeta: { jobId: fm[1], total: Number(fm[2]), size: Number(fm[3]), name: String(args.path || 'file').split(/[\\/]/).pop() } } : {}) });
        return `${j.status === 'error' ? 'ERROR: ' : ''}${String(j.result || '(no output)').slice(0, 8000)}${j.image ? '\n[A screenshot was taken but is hidden from the owner. Explain in plain words what you see; do not tell them to look at it.]' : ''}`;
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
    actionsThisTurn.current = 0;
    voiceRef.current && voiceRef.current.stop();
    let finalText = '';
    try {
      for (let step = 0; step < maxSteps; step++) {
        const { text, tools } = await streamAssistant();
        const msg = { role: 'assistant', content: text };
        if (tools.length) msg.tool_calls = tools.map((t) => ({ id: t.id, type: 'function', function: { name: t.name, arguments: t.arguments || '{}' } }));
        convo.current.push(msg);
        if (!tools.length) { finalText = text; break; }
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
      returnHome(); // finished: show the owner this page again
      setBusy(false);
      stopRef.current = false;
      if (finalText) pingMe('Dwenlite Home finished', finalText);
      if (actionsThisTurn.current > 0 && lastPrompt.current) setSavable(lastPrompt.current); else setSavable('');
      if (finalText && speakRef.current) {
        const say = forSpeech(finalText);
        if (say) voiceRef.current = speak(say, { onStart: () => setSpeaking(true), onEnd: (stopped) => { setSpeaking(false); if (!stopped && fromMic.current && speakRef.current) startMic(); } });
      }
    }
  }

  function stopNow() {
    voiceRef.current && voiceRef.current.stop(); setSpeaking(false);
    stopRef.current = true;
    abortRef.current?.abort();
    Object.keys(approvals.current).forEach((id) => decide(id, false));
    if (activeJob.current) homeCall('job_cancel', { id: activeJob.current }).catch(() => {});
  }

  // ---------------------------------------------------------------- sending
  const sendFile = async (file) => {
    const pick = pickDevice('');
    if (pick.error || !pick.d.online) { toast.error('Connect an online computer first to send it files.'); return; }
    if (file.size > MAX_FILE) { toast.error(`${file.name} is too big. Files up to 8 MB can be sent.`); return; }
    const noteId = uid();
    add({ id: noteId, type: 'info', text: `Sending ${file.name} to ${pick.d.name}...` });
    try {
      const { fileId, total } = await uploadPieces(file, (p) => patch(noteId, { text: `Sending ${file.name} to ${pick.d.name}... ${Math.round(p * 100)}%` }));
      const { id: jobId } = await homeCall('job_create', { deviceId: pick.d.id, type: 'fetch_file', args: { fileId, name: file.name, total, folder: 'uploads' }, summary: 'Receiving a file' });
      for (let i = 0; i < 60; i++) {
        await sleep(1000);
        const j = await homeCall('job_get', { id: jobId });
        if (j.status === 'done') { const where = (/Saved (.+?) \(/.exec(j.result || '') || [])[1] || `uploads/${file.name}`; patch(noteId, { text: `${file.name} is on ${pick.d.name}: ${where}` }); pendingNotes.current.push(`[The owner sent you a file. It is on ${pick.d.name} at ${where}]`); return; }
        if (j.status === 'error' || j.status === 'cancelled') throw new Error(j.result || 'The computer could not receive it.');
      }
      throw new Error('The computer did not answer. Is the agent running?');
    } catch (e) { patch(noteId, { text: `Could not send ${file.name}: ${e.message}` }); toast.error(e.message); }
  };
  const addPicked = (files) => {
    const all = Array.from(files || []);
    addImages(all.filter((f) => f.type.startsWith('image/')));
    all.filter((f) => !f.type.startsWith('image/')).slice(0, 3).forEach(sendFile);
  };
  const addImages = (files) => {
    const list = Array.from(files || []).filter((f) => f.type.startsWith('image/')).slice(0, 4 - images.length);
    if (!list.length) return;
    setImages((p) => [...p, ...list.map((file) => ({ id: uid(), file, url: URL.createObjectURL(file) }))].slice(0, 4));
  };

  async function send(textOverride) {
    let t = (textOverride ?? input).trim();
    if (busy || (!t && !images.length)) return;
    micRef.current && micRef.current.stop(); setListening(false);
    lastPrompt.current = t;
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
    const notes = pendingNotes.current.splice(0).join('\n');
    convo.current.push({ role: 'user', content: notes ? `${notes}\n\n${content}` : content });
    await runLoop();
  }

  function startMic() {
    if (!micSupported()) { toast.error('Talking needs Chrome, Edge or Safari.'); return; }
    voiceRef.current && voiceRef.current.stop(); setSpeaking(false);
    setListening(true);
    micRef.current = listenOnce({ onInterim: (t) => setInput(t), onFinal: (t) => { fromMic.current = true; setInput(''); send(t); }, onEnd: () => setListening(false), onError: (m) => toast.error(m) });
  }
  const toggleMic = () => { if (listening) { micRef.current && micRef.current.stop(); setListening(false); } else { fromMic.current = false; startMic(); } };
  const toggleSpeak = () => { const v = !speakOn; setSpeakOn(v); try { localStorage.setItem('dwenliteHomeSpeak', v ? '1' : '0'); } catch { /* ignore */ } if (!v) { voiceRef.current && voiceRef.current.stop(); setSpeaking(false); } };
  const togglePush = async () => { try { if (pushOn === 'on') { await disablePush(); setPushOn('off'); toast.success('Notifications are off.'); } else { await enablePush(); setPushOn('on'); toast.success('Notifications are on.'); } } catch (e) { toast.error(e.message); setPushState_(); } };
  const setPushState_ = () => pushState().then(setPushOn);
  const downloadFile = async (item) => { const t = toast.loading('Downloading...'); try { await downloadPieces(item.fileMeta.jobId, item.fileMeta.total, item.fileMeta.name); toast.success('Downloaded', { id: t }); } catch (e) { toast.error(e.message, { id: t }); } };

  function newChat() {
    stopNow();
    setSavable(''); pendingNotes.current = [];
    convo.current = [];
    setItems([]);
  }

  const toggleAuto = () => chooseMode(mode === 'auto' ? 'ask' : 'auto');
  const chooseMode = (m) => {
    let confirmed = false; try { confirmed = localStorage.getItem('dwenliteAutoOk') === '1'; } catch { /* ignore */ }
    if (m === 'auto' && !confirmed && !window.confirm('Autonomous mode lets the assistant run commands, write files, click and type on your devices WITHOUT asking each time.\n\nYou can press Stop at any moment. Turn it on?')) return;
    setMode(m);
    try { if (m === 'auto') localStorage.setItem('dwenliteAutoOk', '1'); localStorage.setItem('dwenliteHomeMode', m); } catch { /* ignore */ }
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
          {gate === 'denied' && why && <p className="mx-auto mt-3 max-w-sm text-xs text-slate-500">{why}</p>}
        </div>
      </div>
    );
  }

  const onlineCount = devices.filter((d) => d.online).length;
  const modeBanner = mode === 'screen' ? 'Computer-use mode: screen actions run on their own' : mode === 'auto' ? 'AUTONOMOUS: everything runs without asking' : '';

  return (
    <Motion>
    <div className="home-root flex h-[calc(100dvh-4rem)] flex-col text-white">
      {/* top bar */}
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5 md:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <motion.span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600" initial={{ scale: 0.6, rotate: -20, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} whileHover={{ scale: 1.08, rotate: -6 }} whileTap={{ scale: 0.92 }} transition={spring}><Home size={18} /></motion.span>
          <div className="hidden min-w-0 sm:block">
            <p className="truncate font-bold leading-tight">Dwenlite Home</p>
            <p className="truncate text-[11px] text-slate-500">Your personal assistant</p>
          </div>
        </div>
        <motion.button onClick={toggleAuto} role="switch" aria-checked={mode === 'auto'} title="Let the assistant do everything by itself, without asking" whileTap={{ scale: 0.92 }} transition={spring} className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-300 ${mode === 'auto' ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200' : 'border-white/10 bg-slate-800/70 text-slate-300 hover:border-violet-500/50'}`}>
          <span className={`relative inline-block h-4 w-7 rounded-full transition-colors duration-300 ${mode === 'auto' ? 'bg-emerald-500' : 'bg-slate-600'}`}><motion.span className="absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white" animate={{ x: mode === 'auto' ? 12 : 0 }} transition={spring} /></span>
          Auto
        </motion.button>
        <motion.button onClick={() => setPanel('devices')} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.93 }} transition={spring} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-800/70 px-3 py-1.5 text-xs hover:border-violet-500/50">
          {onlineCount ? <motion.span style={{ display: 'inline-flex' }} animate={{ opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}><Wifi size={13} className="text-emerald-400" /></motion.span> : <WifiOff size={13} className="text-slate-500" />}
          <span className="hidden sm:inline">{devices.length ? `${onlineCount}/${devices.length} online` : 'Add a computer'}</span>
          <Monitor size={13} className="sm:hidden" />
        </motion.button>
        <IconBtn icon={Repeat} anim="spin" onClick={() => { setRoutineDraft(null); setPanel('routines'); }} aria-label="Routines" title="Saved and scheduled tasks" className="rounded-full border border-white/10 bg-slate-800/70 p-2 hover:border-violet-500/50" />
        <IconBtn icon={History} anim="clock" onClick={() => setPanel('activity')} aria-label="Activity" title="What it did recently" className="rounded-full border border-white/10 bg-slate-800/70 p-2 hover:border-violet-500/50" />
        <IconBtn icon={Brain} anim="pulse" onClick={() => setPanel('memory')} aria-label="Memory" title="What it remembers" className="rounded-full border border-white/10 bg-slate-800/70 p-2 hover:border-violet-500/50" />
        <IconBtn icon={SlidersHorizontal} anim="tilt" onClick={() => setPanel('settings')} aria-label="Settings" title="How much it may do on its own" className="rounded-full border border-white/10 bg-slate-800/70 p-2 hover:border-violet-500/50" />
        <IconBtn icon={RotateCcw} anim="spin" onClick={newChat} aria-label="New chat" title="New chat" className="rounded-full border border-white/10 bg-slate-800/70 p-2 hover:border-violet-500/50" />
      </div>

      <AnimatePresence initial={false}>
      {devices.length > 0 && onlineCount === 0 && (
        <motion.div key="offline" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring} style={{ overflow: 'hidden' }} className="flex items-center justify-between gap-2 bg-slate-800/80 px-4 py-2 text-xs text-slate-200">
          <span>Your computer is not connected. Start the Dwenlite agent on it again.</span>
          <Tap onClick={() => setPanel('devices')} className="shrink-0 rounded-md bg-violet-600 px-2.5 py-1 font-semibold hover:bg-violet-500">How to reconnect</Tap>
        </motion.div>
      )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
      {modeBanner && (
        <motion.div key={mode} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring} style={{ overflow: 'hidden' }} className={`flex items-center justify-between px-4 py-1.5 text-xs font-semibold ${mode === 'auto' ? 'bg-red-500/20 text-red-200' : 'bg-amber-400/15 text-amber-200'}`}>
          <span>{modeBanner}</span>
          {busy && <Tap onClick={stopNow} className="rounded-md bg-black/30 px-2 py-0.5">Stop</Tap>}
        </motion.div>
      )}
      </AnimatePresence>

      {/* conversation */}
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-4 md:px-6">
        {items.length === 0 && (
          <div className="mx-auto mt-6 max-w-xl text-center">
            <motion.span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1, y: [0, -6, 0] }} transition={{ scale: spring, opacity: { duration: 0.2 }, y: { repeat: Infinity, duration: 3.2, ease: 'easeInOut' } }}><motion.span style={{ display: 'inline-flex' }} animate={{ rotate: [0, 12, -8, 0], scale: [1, 1.15, 1] }} transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}><Sparkles size={26} /></motion.span></motion.span>
            <h1 className="text-xl font-bold">What can I do for you?</h1>
            <p className="mt-1 text-sm text-slate-400">Code, look at pictures, and operate your computers on your behalf, with your approval.</p>
            {!devices.length && <button onClick={() => setPanel('devices')} className="mt-4 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold hover:bg-violet-500">Connect your first computer</button>}
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {QUICK.map((q, i) => <motion.button key={q} initial={{ opacity: 0, y: 14, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }} transition={{ ...spring, delay: 0.12 + i * 0.05 }} onClick={() => send(q)} className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-left text-xs text-violet-100 hover:bg-violet-500/20">{q}</motion.button>)}
            </div>
          </div>
        )}

        {items.map((m) => {
          if (m.type === 'user') return (
            <Appear key={m.id} className="ml-auto max-w-[92%] sm:max-w-[80%]">
              <div className="rounded-2xl rounded-br-md bg-violet-600 p-3 text-sm">
                {m.thumbs && m.thumbs.length > 0 && <div className="mb-2 flex flex-wrap gap-2">{m.thumbs.map((u) => <img key={u} src={u} alt="" className="h-20 rounded-lg object-cover" />)}</div>}
                {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
              </div>
              {m.analysis && m.analysis.length > 0 && (
                <details className="mt-1 text-xs text-slate-500"><summary className="cursor-pointer">What the image model read</summary><pre className="mt-1 whitespace-pre-wrap rounded-lg bg-black/30 p-2 text-slate-400">{m.analysis.join('\n---\n')}</pre></details>
              )}
            </Appear>
          );
          if (m.type === 'ai') return (
            <Appear key={m.id} y={8} className="max-w-[96%] rounded-2xl rounded-bl-md bg-slate-800 p-3 text-sm text-slate-200 sm:max-w-[85%]">
              <ChatAnswer content={m.content} typing={m.typing} live={m.live} />
            </Appear>
          );
          if (m.type === 'plan') return <div key={m.id} className="max-w-[96%] sm:max-w-[85%]"><PlanCard steps={m.steps} /></div>;
          if (m.type === 'action') return <div key={m.id} className="max-w-[96%] sm:max-w-[85%]"><ActionCard item={m} onDecide={decide} onUndo={undoAction} onDownload={downloadFile} /></div>;
          return <p key={m.id} className="text-center text-xs italic text-slate-500">{m.text}</p>;
        })}
      </div>

      <AnimatePresence initial={false}>
        {savable && !busy && (
          <motion.div key="save" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring} style={{ overflow: 'hidden' }} className="flex justify-center px-3">
            <Tap onClick={() => { setRoutineDraft({ name: savable.slice(0, 40), prompt: savable }); setPanel('routines'); }} className="mb-1 flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-100 hover:bg-violet-500/20"><BookmarkPlus size={13} /> Save this as a routine</Tap>
          </motion.div>
        )}
        {speaking && <motion.div key="speaking" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center justify-center gap-2 pb-1 text-xs text-violet-200"><Volume2 size={13} /> Speaking... <button onClick={() => { voiceRef.current && voiceRef.current.stop(); setSpeaking(false); }} className="underline">stop</button></motion.div>}
      </AnimatePresence>

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
          <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { addPicked(e.target.files); e.target.value = ''; }} />
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { addImages(e.target.files); e.target.value = ''; }} />
          <IconBtn icon={Paperclip} size={20} anim="tilt" onClick={() => fileRef.current?.click()} aria-label="Attach an image or a file" title="Attach an image, or send a file to your computer" className="rounded-xl p-2.5 text-slate-400 hover:bg-white/10 hover:text-white" />
          <IconBtn icon={Camera} size={20} anim="pop" onClick={() => camRef.current?.click()} aria-label="Take a photo" className="rounded-xl p-2.5 text-slate-400 hover:bg-white/10 hover:text-white" />
          <IconBtn icon={listening ? Mic : Mic} size={20} anim="pulse" onClick={toggleMic} aria-label={listening ? 'Stop listening' : 'Talk'} title="Talk instead of typing" className={`rounded-xl p-2.5 transition-colors ${listening ? 'bg-red-500/20 text-red-300' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`} />
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
            ? <motion.button key="stop" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: [1, 1.07, 1], opacity: 1 }} transition={{ scale: { repeat: Infinity, duration: 1.4 }, opacity: { duration: 0.15 } }} whileTap={{ scale: 0.88 }} onClick={stopNow} aria-label="Stop" className="rounded-xl bg-red-600 p-3 hover:bg-red-500"><Square size={18} fill="currentColor" /></motion.button>
            : <IconBtn key="send" icon={Send} size={18} anim="fly" onClick={() => send()} disabled={!input.trim() && !images.length} aria-label="Send" className="rounded-xl bg-violet-600 p-3 hover:bg-violet-500 disabled:opacity-40" />}
        </div>
      </div>

      {/* panels */}
      <AnimatePresence>
      {panel === 'routines' && <RoutinesPanel key="routines" devices={devices} draft={routineDraft} onClose={() => setPanel(null)} onRunHere={(p) => { setPanel(null); send(p); }} />}
      {panel === 'activity' && <ActivityPanel key="activity" devices={devices} onClose={() => setPanel(null)} />}
      {panel === 'devices' && <DevicePanel key="devices" devices={devices} reload={loadDevices} onClose={() => setPanel(null)} />}

      {panel === 'memory' && (
        <Sheet key="memory" onClose={() => setPanel(null)} className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-[#121217] p-5 sm:rounded-3xl">
          <div>
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
        </Sheet>
      )}

      {panel === 'settings' && (
        <Sheet key="settings" onClose={() => setPanel(null)} className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-[#121217] p-5 sm:rounded-3xl">
          <div>
            <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">How much may it do alone?</h2><button onClick={() => setPanel(null)} aria-label="Close"><X size={22} className="text-slate-400" /></button></div>
            <div className="space-y-2">
              {MODES.map((m) => (
                <motion.button key={m.id} whileTap={{ scale: 0.98 }} onClick={() => chooseMode(m.id)} className={`block w-full rounded-2xl border p-3 text-left transition-colors duration-300 ${mode === m.id ? (m.id === 'auto' ? 'border-red-500/60 bg-red-500/10' : 'border-violet-500/60 bg-violet-500/10') : 'border-white/10 bg-slate-900/60'}`}>
                  <p className="font-semibold">{m.title}</p><p className="mt-0.5 text-xs text-slate-400">{m.text}</p>
                </motion.button>
              ))}
            </div>
            <p className={`mt-3 rounded-xl px-3 py-2 text-xs ${unlimited ? 'bg-emerald-500/10 text-emerald-200' : 'bg-slate-800/70 text-slate-400'}`}>{unlimited ? 'Admin account: no usage limits on Dwenlite Home or the Teacher.' : 'Standard account: daily allowances apply. (Admins have no limits. If you are an admin, your sign-in email is not in the server\'s admin list.)'}</p>
            <div className="mt-4 space-y-2 rounded-2xl border border-white/10 bg-slate-900/60 p-3 text-sm">
              <button onClick={togglePush} disabled={pushOn === 'unsupported' || pushOn === 'blocked'} className="flex w-full items-center justify-between gap-3 text-left disabled:opacity-50">
                <span className="flex items-center gap-2"><Bell size={16} className="text-violet-300" /><span><b>Notifications</b><span className="block text-xs text-slate-400">{pushOn === 'unsupported' ? 'Not available in this browser. On iPhone, install the app first.' : pushOn === 'blocked' ? 'Blocked. Allow notifications for this site in your settings.' : 'Get a ping when a task finishes, needs your OK, or a routine runs.'}</span></span></span>
                <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${pushOn === 'on' ? 'bg-emerald-500' : 'bg-slate-600'}`}><motion.span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white" animate={{ x: pushOn === 'on' ? 16 : 0 }} transition={spring} /></span>
              </button>
              <button onClick={toggleSpeak} className="flex w-full items-center justify-between gap-3 text-left">
                <span className="flex items-center gap-2">{speakOn ? <Volume2 size={16} className="text-violet-300" /> : <VolumeX size={16} className="text-slate-500" />}<span><b>Speak the answers</b><span className="block text-xs text-slate-400">Reads each finished answer aloud. Use the microphone button to talk back.</span></span></span>
                <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${speakOn ? 'bg-emerald-500' : 'bg-slate-600'}`}><motion.span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white" animate={{ x: speakOn ? 16 : 0 }} transition={spring} /></span>
              </button>
            </div>
            <label className="mt-4 flex items-center justify-between text-sm text-slate-300">Steps before it pauses
              <select value={maxSteps} onChange={(e) => setMaxSteps(Number(e.target.value))} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5">{[8, 15, 25, 40].map((n) => <option key={n} value={n}>{n}</option>)}</select>
            </label>
            <p className="mt-4 text-xs text-slate-500">The Stop button works in every mode. Each computer's agent also has its own switches (commands and screen control) that you set when you start it.</p>
          </div>
        </Sheet>
      )}
      </AnimatePresence>

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
    </Motion>
  );
}
