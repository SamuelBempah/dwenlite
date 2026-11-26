const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const axios = require("axios");
const crypto = require("crypto");
const cors = require("cors")({ origin: true });

admin.initializeApp();
const db = admin.firestore();

// Set with: firebase functions:secrets:set DEEPSEEK_API_KEY
const DEEPSEEK_API_KEY = defineSecret("DEEPSEEK_API_KEY");

// ---------------------------------------------------------------------------
// Limits (tune freely). They exist so a leaked URL or a runaway client loop
// can never burn through your balance.
// ---------------------------------------------------------------------------
// Max input per task (characters). A 1-hour meeting transcript is ~50-60k characters.
const MAX_CHARS = { general: 120000, notes: 400000, support: 3000, rewrite: 5000 };
// Notes longer than this are split into parts, summarised in parallel, then merged.
const CHUNK_CHARS = 30000;
const SINGLE_PASS_MAX = 45000;
const HOURLY_LIMIT = 40;
const DAILY_LIMIT = 250;
const DEDUPE_MS = 60 * 1000;

// ---------------------------------------------------------------------------
// System prompts. IMPORTANT FOR CACHING: DeepSeek caches the *prefix* of a
// request automatically. Keep these strings byte-for-byte stable and put all
// variable content (the user's text) AFTER them. Do not add dates, user
// names or random ids to them.
// ---------------------------------------------------------------------------
const BASE_SYSTEM =
  "You are DwenLite AI, an expert educator and note-taker. Be accurate, " +
  "well organised and information-dense. Never invent facts that are not in " +
  "the source material. Do not add greetings, apologies or closing remarks. " +
  "Follow any output format the user message requests exactly.";

const NOTES_SYSTEM =
  BASE_SYSTEM + "\n\n" +
  "You turn raw source material (lecture, textbook, transcript, document, " +
  "meeting recording, sermon, interview, gathering, etc.) into concise but " +
  "complete notes. First silently identify the type of material, then use " +
  "the matching structure.\n\n" +
  "GENERAL RULES\n" +
  "- Markdown only. # for the title, ## for sections, ### for sub-sections.\n" +
  "- Start with a 1-2 sentence '> **Summary:**' blockquote.\n" +
  "- Bullets over paragraphs. One idea per bullet, no filler words.\n" +
  "- Keep every concrete detail: names, numbers, dates, amounts, places, " +
  "definitions, formulas, examples, deadlines. Cut repetition, small talk " +
  "and tangents.\n" +
  "- **Bold** key terms. Use > blockquotes for definitions, warnings and " +
  "key takeaways. Use tables when comparing things.\n" +
  "- If the source is unclear or a speaker is unknown, say 'Unclear' rather " +
  "than guessing.\n\n" +
  "IF IT IS A MEETING / GATHERING / DISCUSSION / SERMON / EVENT USE THIS:\n" +
  "# <Title>\n" +
  "> **Summary:** ...\n" +
  "## Overview  (date, venue/platform, attendees or speakers if mentioned, purpose)\n" +
  "## Agenda / Topics Covered\n" +
  "## Key Discussion Points  (one ### per topic: what was said, positions, reasons)\n" +
  "## Decisions Made\n" +
  "## Action Items  (table: Task | Owner | Deadline; write 'Unassigned' if none)\n" +
  "## Open Questions / Risks\n" +
  "## Next Steps  (next meeting date, follow-ups)\n" +
  "Omit a section only if the source has nothing for it.\n\n" +
  "IF IT IS A LECTURE / TEXTBOOK / STUDY MATERIAL USE THIS:\n" +
  "# <Title>\n> **Summary:** ...\n## Key Concepts (definitions)\n" +
  "## Detailed Explanation (### per topic, with examples)\n" +
  "## Formulas / Rules / Processes (if any)\n## Common Mistakes & Exam Tips\n" +
  "## Quick Review (5-8 one-line recall points)";

const SUPPORT_SYSTEM =
  BASE_SYSTEM + "\n\n" +
  "You are the support assistant for DwenLite, an AI study app where users " +
  "organise materials in folders, upload PDF/PPTX/TXT/DOCX/audio/video and " +
  "generate notes, quizzes and flashcards. Answer in under 100 words, only " +
  "about DwenLite. If the user wants a human, tell them to type 'agent'. " +
  "End with: \"Is that all?\"";

const REWRITE_SYSTEM =
  "You are a professional customer support agent. Rewrite the user's text to " +
  "be concise, polite, clear and professional, without introductory or " +
  "concluding sentences. Output only the rewritten text.";

const TASKS = {
  general: { system: BASE_SYSTEM, maxTokens: 4000, temperature: 0.4 },
  notes: { system: NOTES_SYSTEM, maxTokens: 4000, temperature: 0.2 },
  support: { system: SUPPORT_SYSTEM, maxTokens: 400, temperature: 0.5 },
  rewrite: { system: REWRITE_SYSTEM, maxTokens: 250, temperature: 0.4 },
};

// ---------------------------------------------------------------------------
// Rate limiting (per signed-in user, stored in Firestore: aiUsage/{uid})
// ---------------------------------------------------------------------------
async function checkAndCountUsage(uid) {
  const ref = db.collection("aiUsage").doc(uid);
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.exists ? snap.data() : {};
    let { hourStart = now, hourCount = 0, dayStart = now, dayCount = 0 } = d;
    if (now - hourStart >= 3600 * 1000) { hourStart = now; hourCount = 0; }
    if (now - dayStart >= 24 * 3600 * 1000) { dayStart = now; dayCount = 0; }
    if (hourCount >= HOURLY_LIMIT) return { ok: false, reason: "hourly" };
    if (dayCount >= DAILY_LIMIT) return { ok: false, reason: "daily" };
    tx.set(ref, { hourStart, hourCount: hourCount + 1, dayStart, dayCount: dayCount + 1 });
    return { ok: true };
  });
}


async function callDeepSeek(system, user, maxTokens, temperature) {
  const r = await axios.post(
    "https://api.deepseek.com/chat/completions",
    {
      model: "deepseek-chat",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: maxTokens,
      temperature,
    },
    {
      headers: {
        Authorization: `Bearer ${DEEPSEEK_API_KEY.value()}`,
        "Content-Type": "application/json",
      },
      timeout: 200000,
    }
  );
  return r.data;
}

// Split long text on paragraph / sentence boundaries into <= size pieces.
function splitText(text, size) {
  const parts = text.split(/(?<=[.!?\n])\s+/);
  const chunks = [];
  let cur = "";
  for (const p of parts) {
    if ((cur + " " + p).length > size && cur) { chunks.push(cur); cur = p; }
    else cur = cur ? cur + " " + p : p;
    while (cur.length > size) { chunks.push(cur.slice(0, size)); cur = cur.slice(size); }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

// Long source (e.g. 2-hour meeting): notes per part in parallel, then one merge pass.
async function longNotes(prompt, cfg) {
  const chunks = splitText(prompt, CHUNK_CHARS);
  const n = chunks.length;
  const usage = { prompt_tokens: 0, completion_tokens: 0, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 0 };
  const add = (d) => { for (const k in usage) usage[k] += d.usage?.[k] || 0; };

  const partNotes = [];
  for (let i = 0; i < n; i += 4) { // 4 at a time
    const batch = await Promise.all(chunks.slice(i, i + 4).map(async (c, j) => {
      const idx = i + j + 1;
      const d = await callDeepSeek(
        cfg.system,
        `This is part ${idx} of ${n} of one long source. Write detailed notes for THIS PART ONLY in the required structure ` +
        `(keep every name, number, date, decision, action item and owner). No title or summary needed.\n\n${c}`,
        3000, cfg.temperature
      );
      add(d);
      return d.choices[0].message.content;
    }));
    partNotes.push(...batch);
  }

  const merged = await callDeepSeek(
    cfg.system,
    `Below are notes written from ${n} consecutive parts of ONE long source. Merge them into a single, ` +
    `well-organised set of notes using the required structure. Remove duplicates, keep all concrete details ` +
    `(names, numbers, dates, decisions, action items with owners/deadlines), keep chronological order inside topics.\n\n` +
    partNotes.map((t, i) => `--- PART ${i + 1} ---\n${t}`).join("\n\n"),
    cfg.maxTokens, cfg.temperature
  );
  add(merged);
  merged.usage = usage;
  return merged;
}

// Best-effort duplicate guard (double clicks, retry loops) - per instance.
const recent = new Map();
function dedupeGet(key) {
  const hit = recent.get(key);
  if (hit && Date.now() - hit.t < DEDUPE_MS) return hit.v;
  recent.delete(key);
  return null;
}
function dedupeSet(key, v) {
  if (recent.size > 200) recent.delete(recent.keys().next().value);
  recent.set(key, { t: Date.now(), v });
}

exports.generateNotesProxy = onRequest(
  {
    timeoutSeconds: 540,
    memory: "512MiB",
    maxInstances: 10, // hard cap on parallel spend
    secrets: [DEEPSEEK_API_KEY],
  },
  (req, res) => {
    cors(req, res, async () => {
      if (req.method === "OPTIONS") {
        res.set("Access-Control-Allow-Methods", "POST");
        res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
        return res.status(204).send("");
      }
      if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

      // 1. Must be a signed-in DwenLite user.
      const m = (req.get("Authorization") || "").match(/^Bearer (.+)$/);
      if (!m) return res.status(401).json({ error: "Please sign in." });
      let uid;
      try {
        uid = (await admin.auth().verifyIdToken(m[1])).uid;
      } catch (e) {
        return res.status(401).json({ error: "Session expired. Please sign in again." });
      }

      // 2. Validate input.
      const { prompt, task = "general" } = req.body || {};
      const cfg = TASKS[task];
      if (!cfg) return res.status(400).json({ error: "Unknown task." });
      if (typeof prompt !== "string" || !prompt.trim()) {
        return res.status(400).json({ error: "Prompt is required." });
      }
      if (prompt.length > (MAX_CHARS[task] || 40000)) {
        return res.status(413).json({ error: "Input is too long. Please use a shorter document." });
      }

      // 3. Duplicate request? Return the earlier answer for free.
      const key = uid + ":" + task + ":" + crypto.createHash("sha256").update(prompt).digest("hex");
      const cached = dedupeGet(key);
      if (cached) return res.status(200).json(cached);

      // 4. Rate limit.
      const usage = await checkAndCountUsage(uid);
      if (!usage.ok) {
        return res.status(429).json({
          error: usage.reason === "hourly"
            ? "Too many AI requests this hour. Please try again later."
            : "Daily AI limit reached. Please try again tomorrow.",
        });
      }

      try {
        const data = task === "notes" && prompt.length > SINGLE_PASS_MAX
          ? await longNotes(prompt, cfg)
          : await callDeepSeek(cfg.system, prompt, cfg.maxTokens, cfg.temperature);
        const response = { data };

        const u = response.data.usage || {};
        logger.info("ai_usage", {
          uid, task,
          prompt: u.prompt_tokens,
          cacheHit: u.prompt_cache_hit_tokens,
          cacheMiss: u.prompt_cache_miss_tokens,
          completion: u.completion_tokens,
        });

        dedupeSet(key, response.data);
        return res.status(200).json(response.data);
      } catch (error) {
        const status = error.response?.status;
        logger.error("API Error", status, error.response?.data?.error?.message || error.message);
        // Never forward upstream details (they can echo request data); give a safe hint instead.
        const hint =
          status === 401 ? "AI service key is invalid. Admin: re-set DEEPSEEK_API_KEY and redeploy." :
          status === 402 ? "AI service balance is empty. Admin: top up the DeepSeek account." :
          status === 429 || status === 503 ? "AI service is busy. Please try again in a moment." :
          error.code === "ECONNABORTED" ? "The AI took too long. Try again with a shorter document." :
          "Failed to generate content. Please try again.";
        return res.status(500).json({ error: hint });
      }
    });
  }
);
