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

app.post('/api/tts', rateLimit, (req, res) => {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text) return res.status(400).send('Text is required');
    if (text.length > MAX_TEXT) return res.status(413).send('Text too long');

    const outputFile = path.join('/tmp', `tts_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`);

    // execFile with an argument array: the text is never interpreted by a shell.
    execFile('python3', [path.join(__dirname, 'generate_tts.py'), text, outputFile], { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
            console.error('Error generating TTS:', error.message, stderr);
            fs.unlink(outputFile, () => {});
            return res.status(500).send('Error generating TTS');
        }
        res.download(outputFile, (err) => {
            if (err) console.error('Error sending file', err.message);
            fs.unlink(outputFile, () => {});
        });
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
});
