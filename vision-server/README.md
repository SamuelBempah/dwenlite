# Dwenlite shared vision model

One Qwen vision model, served from a computer we control, used by every Dwenlite user. The cloud functions call it first
(`OWN_VISION_URL`, `OWN_VISION_KEY`, `OWN_VISION_MODEL` in `functions/.env`); Groq and the other online models are the backup.

- `dwenlite/public/vision-gateway.mjs` is the gateway: a password, a queue (one picture at a time) and one allowed door in front of Ollama.
- It is served by the website at `/vision-gateway.mjs` so it can be downloaded onto the vision computer.
- The same setup works on a rented GPU machine later: run Ollama and the gateway there, and change `OWN_VISION_URL`.

Test: `node gateway_test.mjs` (kept in the maintainer's scratch folder) starts a fake Ollama and checks the password, the single door, the model lock and the queue.
