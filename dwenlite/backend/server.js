const express = require('express');
const cors = require('cors');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;
const MAX_TEXT = 700;            // characters per request (the app sends one sentence at a time)
const RATE_PER_MIN = 90;         // per IP

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '20kb' }));

// ---- Cost control -------------------------------------------------------------
// 1) Identical sentences ("Welcome back!", greetings, repeated explanations) are served from memory.
const CACHE_MAX = 300;
const cache = new Map(); // text -> Buffer
function cacheGet(k) { const v = cache.get(k); if (v) { cache.delete(k); cache.set(k, v); } return v; }
function cacheSet(k, v) { cache.set(k, v); if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value); }

// 2) At most N speech jobs run at once, so a small (cheap) machine never runs out of memory.
const MAX_JOBS = 3;
let running = 0;
const waiting = [];
function runJob(fn) {
    return new Promise((resolve, reject) => {
        const go = () => { running++; fn().then(resolve, reject).finally(() => { running--; waiting.shift()?.(); }); };
        if (running < MAX_JOBS) go(); else if (waiting.length < 30) waiting.push(go); else reject(new Error('busy'));
    });
}

app.get('/health', (req, res) => res.send('ok'));

// Very small in-memory per-IP rate limiter.
const hits = new Map();
setInterval(() => hits.clear(), 60 * 1000).unref();
function rateLimit(req, res, next) {
    const n = (hits.get(req.ip) || 0) + 1;
    hits.set(req.ip, n);
    if (n > RATE_PER_MIN) return res.status(429).send('Too many requests');
    next();
}

app.post('/api/tts', rateLimit, async (req, res) => {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text) return res.status(400).send('Text is required');
    if (text.length > MAX_TEXT) return res.status(413).send('Text too long');

    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'public, max-age=86400');

    const hit = cacheGet(text);
    if (hit) return res.send(hit);

    const outputFile = path.join('/tmp', `tts_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`);
    try {
        await runJob(() => new Promise((resolve, reject) => {
            // execFile with an argument array: the text is never interpreted by a shell.
            execFile('python3', [path.join(__dirname, 'generate_tts.py'), text, outputFile], { timeout: 30000 },
                (error, stdout, stderr) => (error ? reject(new Error(error.message + ' ' + stderr)) : resolve()));
        }));
        const audio = await fs.promises.readFile(outputFile);
        cacheSet(text, audio);
        res.send(audio);
    } catch (err) {
        console.error('Error generating TTS:', err.message);
        res.status(err.message === 'busy' ? 503 : 500).send('Error generating TTS');
    } finally {
        fs.unlink(outputFile, () => {});
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
});
