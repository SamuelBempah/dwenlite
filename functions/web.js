// Web access for Dwenlite Home: search, and read a page as text. Server-side, with protection against reaching private networks.
const dns = require("dns");
const net = require("net");
const http = require("http");
const https = require("https");

function isPrivateIp(ip) {
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    if (x === "::1" || x === "::") return true;
    if (x.startsWith("::ffff:")) return isPrivateIp(x.slice(7));
    return /^f[cd]/.test(x) || /^fe[89ab]/.test(x);
  }
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !(n >= 0 && n <= 255))) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
}

// DNS lookup that refuses private addresses, checked at connect time (so a name cannot change its answer after the check)
function safeLookup(hostname, options, cb) {
  if (typeof options === "function") { cb = options; options = {}; }
  dns.lookup(hostname, { all: true, family: (options && options.family) || 0 }, (err, addrs) => {
    if (err) return cb(err);
    const ok = addrs.filter((a) => !isPrivateIp(a.address));
    if (!ok.length) return cb(new Error("That address is not allowed."));
    if (options && options.all) return cb(null, ok);
    return cb(null, ok[0].address, ok[0].family);
  });
}

const decode = (s) => String(s).replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)));
const stripTags = (s) => decode(String(s).replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

// Bing wraps result links in a redirect: .../ck/a?...&u=a1<base64url of the real address>
function bingUnwrap(href) {
  try {
    const u = new URL(decode(href), "https://www.bing.com");
    const enc = u.searchParams.get("u");
    if (enc && /^a1/.test(enc)) { const real = Buffer.from(enc.slice(2).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"); if (/^https?:\/\//i.test(real)) return real; }
    return /^https?:\/\//i.test(u.toString()) && !/(^|\.)bing\.com$/i.test(u.hostname) ? u.toString() : "";
  } catch { return ""; }
}
function parseBing(html) {
  const out = [];
  const blocks = String(html).split(/<li class="b_algo"/i).slice(1);
  for (const b of blocks) {
    const a = /<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(b);
    if (!a) continue;
    const url = bingUnwrap(a[1]);
    if (!url) continue;
    const sn = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(b) || /class="b_caption"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i.exec(b);
    out.push({ title: stripTags(a[2]), url, snippet: stripTags(sn ? sn[1] : "") });
    if (out.length >= 8) break;
  }
  return out;
}
function parseDuck(html) {
  const out = [];
  const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g;
  let m;
  while ((m = re.exec(String(html))) && out.length < 8) {
    let url = decode(m[1]);
    const u = /[?&]uddg=([^&]+)/.exec(url);
    if (u) { try { url = decodeURIComponent(u[1]); } catch { /* keep */ } }
    if (/^\/\//.test(url)) url = "https:" + url;
    if (!/^https?:\/\//i.test(url)) continue;
    out.push({ title: stripTags(m[2]), url, snippet: stripTags(m[3] || "") });
  }
  return out;
}
function formatResults(list) {
  const seen = new Set();
  const all = list.filter((x) => x.url && !seen.has(x.url) && seen.add(x.url)).slice(0, 8);
  return all.length ? all.map((s, i) => `[${i + 1}] ${s.title}\n${s.url}\n${s.snippet}`).join("\n\n") : "";
}

function create({ axios, logger }) {
  const httpAgent = new http.Agent({ lookup: safeLookup });
  const httpsAgent = new https.Agent({ lookup: safeLookup });

  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
  async function searchDuck(q) {
    const r = await axios.get("https://html.duckduckgo.com/html/", { params: { q }, timeout: 9000, headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" } });
    return parseDuck(r.data);
  }
  async function searchBing(q) {
    const r = await axios.get("https://www.bing.com/search", { params: { q, setlang: "en", cc: "us" }, timeout: 9000, headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" } });
    return parseBing(r.data);
  }
  async function searchWiki(q) {
    const r = await axios.get("https://en.wikipedia.org/w/api.php", { params: { action: "query", generator: "search", gsrsearch: q, gsrlimit: 3, prop: "extracts|info", exintro: 1, explaintext: 1, exchars: 600, inprop: "url", format: "json", origin: "*" }, timeout: 9000, headers: { "User-Agent": "DwenliteBot/1.0" } });
    const pages = (r.data && r.data.query && r.data.query.pages) || {};
    return Object.values(pages).sort((a, b) => (a.index || 0) - (b.index || 0)).map((p) => ({ title: p.title, url: p.fullurl, snippet: String(p.extract || "").slice(0, 600) }));
  }
  async function search(q) {
    const [d, b, w] = await Promise.allSettled([searchDuck(q), searchBing(q), searchWiki(q)]);
    if (d.status === "rejected") logger.warn("ddg failed", d.reason && d.reason.message);
    if (b.status === "rejected") logger.warn("bing failed", b.reason && b.reason.message);
    const web = [...(d.status === "fulfilled" ? d.value : []), ...(b.status === "fulfilled" ? b.value : [])];
    // web results first, then Wikipedia as a bonus (it used to be the only thing that worked from a cloud server)
    const text = formatResults([...web, ...(w.status === "fulfilled" ? w.value : [])]);
    if (!text) return "No results came back. The search services may be busy; try different words, or use the browser tool.";
    return text;
  }

  async function readPage(rawUrl, maxChars = 12000) {
    let url = String(rawUrl || "").trim();
    if (!/^https?:\/\/[^\s]+$/i.test(url) || url.length > 2000) throw new Error("Give a full http or https link.");
    let res = null;
    for (let hop = 0; hop < 4; hop++) {
      const u = new URL(url);
      if (net.isIP(u.hostname.replace(/^\[|\]$/g, "")) && isPrivateIp(u.hostname.replace(/^\[|\]$/g, ""))) throw new Error("That address is not allowed.");
      if (/^(localhost|.*\.local|.*\.internal)$/i.test(u.hostname)) throw new Error("That address is not allowed.");
      res = await axios.get(url, {
        timeout: 10000, maxRedirects: 0, maxContentLength: 2500000, maxBodyLength: 2500000, responseType: "text", transformResponse: (x) => x,
        httpAgent, httpsAgent, validateStatus: (s) => s < 400 || (s >= 300 && s < 400),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; DwenliteBot/1.0)", Accept: "text/html,text/plain,application/json;q=0.9,*/*;q=0.5", "Accept-Language": "en" },
      });
      if (res.status >= 300 && res.headers.location) { url = new URL(res.headers.location, url).toString(); if (!/^https?:/i.test(url)) throw new Error("Bad redirect."); res = null; continue; }
      break;
    }
    if (!res) throw new Error("Too many redirects.");
    const type = String(res.headers["content-type"] || "");
    const body = String(res.data || "");
    if (/json|text\/plain|xml/i.test(type) && !/html/i.test(type)) return `${url}\n\n${body.slice(0, maxChars)}`;
    if (!/html/i.test(type) && !/^\s*</.test(body)) throw new Error(`That is not a web page (${type || "unknown type"}).`);
    const title = stripTags((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(body) || [])[1] || "");
    const links = [];
    body.replace(/<a[^>]*href="([^"#][^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (m, h, t) => { const label = stripTags(t); if (label && links.length < 20 && /^(https?:\/\/|\/)/.test(h)) { try { links.push(`- ${label.slice(0, 80)}: ${new URL(h, url).toString()}`); } catch { /* skip */ } } return m; });
    let text = body.replace(/<(script|style|noscript|svg|iframe|template)[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<\/(p|div|section|article|li|tr|h[1-6]|br|ul|ol|table|header|footer|main)>|<br\s*\/?>/gi, "\n");
    text = decode(text.replace(/<[^>]+>/g, " ")).replace(/[ \t\f\v]+/g, " ").replace(/\n\s*\n+/g, "\n\n").replace(/^ +| +$/gm, "").trim();
    return `${title ? title + "\n" : ""}${url}\n\n${text.slice(0, maxChars)}${text.length > maxChars ? "\n...[cut]" : ""}${links.length ? "\n\nLinks:\n" + links.join("\n") : ""}`;
  }

  return { search, readPage, isPrivateIp, safeLookup };
}

module.exports = { create, isPrivateIp, parseBing, parseDuck, formatResults, bingUnwrap };
