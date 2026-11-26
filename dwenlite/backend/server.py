"""DwenLite voice server: text in, MP3 out. One long-lived process (no per-request startup cost)."""
import asyncio
import os
import time
from collections import OrderedDict

import edge_tts
from aiohttp import web

PORT = int(os.environ.get("PORT", "3001"))
VOICE = os.environ.get("TTS_VOICE", "en-US-AvaNeural")
MAX_TEXT = 700            # characters per request (the app sends one sentence at a time)
RATE_PER_MIN = 120        # per IP
CACHE_MAX = 400           # identical sentences are served from memory
MAX_JOBS = 4              # concurrent speech jobs (keeps a tiny machine safe)

cache: "OrderedDict[str, bytes]" = OrderedDict()
hits: dict = {}
hits_reset = time.time()
sem = asyncio.Semaphore(MAX_JOBS)
waiting = 0


@web.middleware
async def cors(request, handler):
    if request.method == "OPTIONS":
        resp = web.Response(status=204)
    else:
        try:
            resp = await handler(request)
        except web.HTTPException as e:
            resp = e
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "POST, GET, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return resp


def client_ip(request):
    return request.headers.get("Fly-Client-IP") or request.headers.get("X-Forwarded-For", "").split(",")[0].strip() or request.remote


async def synth(text: str) -> bytes:
    chunks = []
    async for ch in edge_tts.Communicate(text, VOICE).stream():
        if ch["type"] == "audio":
            chunks.append(ch["data"])
    audio = b"".join(chunks)
    if not audio:
        raise RuntimeError("empty audio")
    return audio


async def tts(request):
    global hits_reset, waiting
    now = time.time()
    if now - hits_reset > 60:
        hits.clear()
        hits_reset = now
    ip = client_ip(request)
    hits[ip] = hits.get(ip, 0) + 1
    if hits[ip] > RATE_PER_MIN:
        return web.Response(status=429, text="Too many requests")

    try:
        body = await request.json()
    except Exception:
        return web.Response(status=400, text="Invalid JSON")
    text = body.get("text") if isinstance(body, dict) else None
    text = text.strip() if isinstance(text, str) else ""
    if not text:
        return web.Response(status=400, text="Text is required")
    if len(text) > MAX_TEXT:
        return web.Response(status=413, text="Text too long")

    key = text

    headers = {"Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=86400"}
    audio = cache.get(key)
    if audio is not None:
        cache.move_to_end(key)
        return web.Response(body=audio, headers=headers)

    if waiting >= 30:
        return web.Response(status=503, text="Busy")
    waiting += 1
    try:
        async with sem:
            audio = await asyncio.wait_for(synth(text), timeout=30)
    except Exception as e:  # noqa: BLE001
        print("TTS error:", repr(e), flush=True)
        return web.Response(status=500, text="Error generating TTS")
    finally:
        waiting -= 1

    cache[key] = audio
    if len(cache) > CACHE_MAX:
        cache.popitem(last=False)
    return web.Response(body=audio, headers=headers)


async def health(request):
    return web.Response(text="ok")


app = web.Application(middlewares=[cors], client_max_size=20 * 1024)
app.add_routes([web.post("/api/tts", tts), web.get("/health", health), web.get("/", health)])

if __name__ == "__main__":
    web.run_app(app, host="0.0.0.0", port=PORT, print=lambda *_: print(f"Voice server listening on {PORT}", flush=True))
