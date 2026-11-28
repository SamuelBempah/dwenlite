// Dwenlite vision gateway: puts a password and a queue in front of a local Ollama, so Dwenlite's servers (and nobody else) can use
// the vision model on this computer. No dependencies; needs Node 18 or newer.
//
//   GATEWAY_KEY=<a long secret>  node gateway.mjs
//
// Settings (environment variables):
//   GATEWAY_KEY   required. The same value goes into functions/.env as OWN_VISION_KEY.
//   MODEL         the only model that can be used. Default qwen2.5vl:3b
//   PORT          default 8787 (listens on this computer only; a tunnel makes it reachable)
//   OLLAMA        default http://127.0.0.1:11434
//   MAX_WAITING   how many pictures may wait for their turn before new ones are turned away (default 3)
import http from 'node:http';
import crypto from 'node:crypto';

const KEY = process.env.GATEWAY_KEY || '';
const MODEL = process.env.MODEL || 'qwen2.5vl:3b';
const PORT = Number(process.env.PORT) || 8787;
const OLLAMA = (process.env.OLLAMA || 'http://127.0.0.1:11434').replace(/\/$/, '');
const MAX_WAITING = Number(process.env.MAX_WAITING) || 3;
const MAX_BODY = 9 * 1024 * 1024;
if (KEY.length < 16) { console.error('Set GATEWAY_KEY to a secret of at least 16 characters.'); process.exit(1); }

const same = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const authed = (req) => same(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''), KEY);

// one picture at a time: this computer is small, and two at once would run it out of memory
let running = false; const queue = [];
const turn = () => new Promise((resolve) => { const go = () => { running = true; resolve(() => { running = false; const next = queue.shift(); if (next) next(); }); }; if (!running) go(); else queue.push(go); });

const server = http.createServer(async (req, res) => {
  const send = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  try {
    if (!authed(req)) return send(401, { error: 'No.' });
    if (req.method === 'GET' && req.url === '/health') {
      try { const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(3000) }); const j = await r.json(); const has = (j.models || []).some((m) => String(m.name || m.model).startsWith(MODEL.split(':')[0])); return send(has ? 200 : 503, { ok: has, model: MODEL, waiting: queue.length, busy: running }); }
      catch { return send(503, { ok: false, error: 'The model server is not running.' }); }
    }
    if (req.method === 'POST' && req.url === '/v1/chat/completions') {
      let size = 0; const chunks = [];
      for await (const c of req) { size += c.length; if (size > MAX_BODY) return send(413, { error: 'Too large.' }); chunks.push(c); }
      let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(400, { error: 'Bad request.' }); }
      if (queue.length >= MAX_WAITING) return send(429, { error: 'Busy.' });
      const release = await turn();
      try {
        const payload = { model: MODEL, messages: body.messages, temperature: Math.min(1, Number(body.temperature) || 0.2), max_tokens: Math.min(1500, Number(body.max_tokens) || 1000), stream: false };
        const t0 = Date.now();
        const r = await fetch(`${OLLAMA}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(180000) });
        const text = await r.text();
        console.log(`${new Date().toISOString()} picture read in ${Math.round((Date.now() - t0) / 1000)}s (status ${r.status}, ${queue.length} waiting)`); // never the picture or the answer
        res.writeHead(r.status, { 'Content-Type': 'application/json' }); res.end(text);
      } catch (e) { send(502, { error: 'The model did not answer.' }); } finally { release(); }
      return;
    }
    send(404, { error: 'No.' });
  } catch { try { send(500, { error: 'Something went wrong.' }); } catch { /* gone */ } }
});
server.requestTimeout = 200000; server.headersTimeout = 20000;
server.listen(PORT, '127.0.0.1', () => console.log(`Dwenlite vision gateway ready on 127.0.0.1:${PORT}, model ${MODEL}`));
export { server };
