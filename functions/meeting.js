// Live Meeting: helps a signed-in user during a meeting. Suggests questions, researches on the web, summarises, answers.
// The browser does the live speech-to-text; this file only does the thinking.

function create({ admin, logger, axios, cors, onRequest, DEEPSEEK_API_KEY, checkAndCountUsage, callDeepSeek }) {
  const clip = (s, n) => String(s == null ? "" : s).slice(0, n);
  const tail = (s, n) => { s = String(s == null ? "" : s); return s.length > n ? s.slice(s.length - n) : s; };

  const SYSTEM = "You are DwenLite Live Meeting, a sharp, discreet assistant sitting beside the user during a meeting. " +
    "You get a running transcript (speech-to-text, so it can contain mistakes and has no speaker names), the user's own notes about the meeting, and optional reference documents. " +
    "Be concrete and specific to what was actually said. Never invent facts about the meeting. If something is unclear in the transcript, say so briefly. " +
    "Keep answers short enough to read in a few seconds, because the user is in a live meeting.";

  function contextBlock({ title, goal, files, transcript, transcriptMax }) {
    return [
      title ? `MEETING: ${clip(title, 200)}` : "",
      goal ? `USER'S NOTES / GOAL:\n${clip(goal, 3000)}` : "",
      files ? `REFERENCE DOCUMENTS (uploaded by the user):\n${clip(files, 40000)}` : "",
      `TRANSCRIPT SO FAR (most recent at the bottom):\n${tail(transcript, transcriptMax || 12000) || "(nothing said yet)"}`,
    ].filter(Boolean).join("\n\n");
  }

  function parseJson(text) {
    const t = String(text || "").replace(/```json|```/g, "").trim();
    const a = t.search(/[\[{]/);
    if (a < 0) return null;
    const open = t[a]; const close = open === "[" ? "]" : "}";
    const b = t.lastIndexOf(close);
    if (b <= a) return null;
    try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
  }
  const textOf = (data) => (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || "").trim();

  // ---------------- web search (no key needed): DuckDuckGo HTML + Wikipedia ----------------
  const decodeHtml = (s) => String(s).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
  async function searchDuck(q) {
    const r = await axios.get("https://html.duckduckgo.com/html/", { params: { q }, timeout: 9000, headers: { "User-Agent": "Mozilla/5.0 (compatible; DwenLiteBot/1.0)", "Accept-Language": "en" } });
    const html = String(r.data || "");
    const out = [];
    const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g;
    let m;
    while ((m = re.exec(html)) && out.length < 6) {
      let url = m[1];
      const u = /[?&]uddg=([^&]+)/.exec(url);
      if (u) { try { url = decodeURIComponent(u[1]); } catch { /* keep */ } }
      if (!/^https?:\/\//i.test(url)) continue;
      out.push({ title: decodeHtml(m[2]), url, snippet: decodeHtml(m[3] || "") });
    }
    return out;
  }
  async function searchWiki(q) {
    const r = await axios.get("https://en.wikipedia.org/w/api.php", { params: { action: "query", generator: "search", gsrsearch: q, gsrlimit: 3, prop: "extracts|info", exintro: 1, explaintext: 1, exchars: 700, inprop: "url", format: "json", origin: "*" }, timeout: 9000, headers: { "User-Agent": "DwenLiteBot/1.0" } });
    const pages = (r.data && r.data.query && r.data.query.pages) || {};
    return Object.values(pages).sort((a, b) => (a.index || 0) - (b.index || 0)).map((p) => ({ title: p.title, url: p.fullurl, snippet: clip(p.extract, 700) }));
  }
  async function webSearch(q) {
    const [d, w] = await Promise.allSettled([searchDuck(q), searchWiki(q)]);
    const all = [...(d.status === "fulfilled" ? d.value : []), ...(w.status === "fulfilled" ? w.value : [])];
    if (d.status === "rejected") logger.warn("ddg failed", d.reason && d.reason.message);
    const seen = new Set();
    return all.filter((x) => x.url && !seen.has(x.url) && seen.add(x.url));
  }

  const meetingApi = onRequest(
    { timeoutSeconds: 120, memory: "256MiB", maxInstances: 10, secrets: [DEEPSEEK_API_KEY] },
    (req, res) => {
      cors(req, res, async () => {
        if (req.method === "OPTIONS") {
          res.set("Access-Control-Allow-Methods", "POST");
          res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
          return res.status(204).send("");
        }
        if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
        const m = (req.get("Authorization") || "").match(/^Bearer (.+)$/);
        if (!m) return res.status(401).json({ error: "Please sign in." });
        let uid;
        try { uid = (await admin.auth().verifyIdToken(m[1])).uid; } catch { return res.status(401).json({ error: "Session expired. Please sign in again." }); }

        const b = req.body || {};
        const action = String(b.action || "");
        const lang = clip(b.language || "English", 30);
        const base = { title: b.title, goal: b.goal, files: b.files, transcript: b.transcript };
        try {
          if (!["questions", "summary", "ask", "research"].includes(action)) return res.status(400).json({ error: "Unknown action." });
          const usage = await checkAndCountUsage(uid, action === "research" ? 2 : 1, {});
          if (!usage.ok) return res.status(429).json({ error: usage.reason === "daily" ? "You have used today's AI allowance. Try again tomorrow." : "You are going a bit fast. Wait a few minutes and try again." });

          if (action === "questions") {
            const focus = clip(b.focus, 300);
            const prompt = `${contextBlock({ ...base, transcriptMax: 9000 })}\n\n` +
              `TASK: The meeting is at a point where the user may be asked "any questions?" or wants to contribute. Write 6 smart questions the user could ask RIGHT NOW. ` +
              `Ground each in something actually said in the transcript, the user's notes, or the documents. Mix: clarifying, risk/assumption checks, practical next steps, and one that shows depth. ` +
              `Short and natural to say out loud (max 25 words). ${focus ? `Extra focus from the user: ${focus}. ` : ""}` +
              `Write in ${lang}. Reply with ONLY JSON: [{"q":"the question","why":"max 12 words on why it is worth asking","type":"clarify|risk|next|insight"}]`;
            const data = await callDeepSeek(SYSTEM, prompt, 900, 0.5);
            const list = parseJson(textOf(data));
            const questions = (Array.isArray(list) ? list : []).filter((x) => x && x.q).slice(0, 8).map((x) => ({ q: clip(x.q, 300), why: clip(x.why, 160), type: clip(x.type, 12) }));
            if (!questions.length) return res.status(502).json({ error: "Could not come up with questions yet. Let the meeting run a little longer." });
            return res.status(200).json({ questions });
          }

          if (action === "summary") {
            const prompt = `${contextBlock({ ...base, transcriptMax: 24000 })}\n\n` +
              `TASK: Summarise the meeting so far in ${lang}. Use Markdown with exactly these sections (skip a section only if truly empty): ` +
              `**Key points**, **Decisions**, **Action items** (who, what, when if said), **Open questions**. Be concise and specific.`;
            const data = await callDeepSeek(SYSTEM, prompt, 1400, 0.3);
            return res.status(200).json({ text: textOf(data) });
          }

          if (action === "ask") {
            const q = clip(b.question, 800).trim();
            if (!q) return res.status(400).json({ error: "Ask something first." });
            const prompt = `${contextBlock({ ...base, transcriptMax: 14000 })}\n\nTHE USER ASKS: ${q}\n\nAnswer in ${lang}, briefly and directly, using the transcript, notes and documents. If the answer is not there, say so and give your best general knowledge, clearly marked as such.`;
            const data = await callDeepSeek(SYSTEM, prompt, 900, 0.4);
            return res.status(200).json({ text: textOf(data) });
          }

          // research: decide what to look up, search the web, then answer from the results with sources
          const topic = clip(b.topic, 300).trim();
          const planPrompt = `${contextBlock({ ...base, transcriptMax: 6000 })}\n\nTASK: ${topic ? `The user wants to research: "${topic}".` : "Pick the 1-2 most useful things to look up right now (a claim, term, company, number or topic just mentioned)."} ` +
            `Write at most 3 short web search queries in English or the meeting language. Reply with ONLY JSON: {"queries":["..."]}`;
          const plan = parseJson(textOf(await callDeepSeek(SYSTEM, planPrompt, 200, 0.2)));
          const queries = ((plan && plan.queries) || (topic ? [topic] : [])).map((x) => clip(x, 120)).filter(Boolean).slice(0, 3);
          if (!queries.length) return res.status(502).json({ error: "Nothing obvious to research yet. Type what you want looked up." });
          const results = (await Promise.all(queries.map((q) => webSearch(q).catch(() => [])))).flat();
          const seen = new Set();
          const sources = results.filter((x) => !seen.has(x.url) && seen.add(x.url)).slice(0, 8);
          if (!sources.length) return res.status(200).json({ text: "I could not reach the web just now, so I have no sources for this. Try again in a moment, or ask me directly and I will answer from general knowledge.", sources: [], queries });
          const list = sources.map((s, i) => `[${i + 1}] ${s.title}\n${s.url}\n${s.snippet}`).join("\n\n");
          const ansPrompt = `${contextBlock({ ...base, transcriptMax: 5000 })}\n\nWEB RESULTS:\n${list}\n\n` +
            `TASK: ${topic ? `Research "${topic}".` : "Brief the user on what was just discussed."} Using ONLY the web results above for facts, write a quick briefing in ${lang}: 3 to 6 bullet points the user can use in the meeting, each ending with its source number like [2]. ` +
            `If the results do not answer it, say so. Then one line starting "Say this:" with a sentence the user could say aloud.`;
          const text = textOf(await callDeepSeek(SYSTEM, ansPrompt, 900, 0.3));
          return res.status(200).json({ text, sources: sources.map((s) => ({ title: clip(s.title, 140), url: s.url })), queries });
        } catch (e) {
          logger.error("meetingApi failed", action, e && e.message);
          return res.status(500).json({ error: "Something went wrong. Please try again." });
        }
      });
    }
  );

  return { meetingApi, _test: { parseJson } };
}

module.exports = { create };
