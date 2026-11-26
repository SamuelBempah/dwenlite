// A tiny store that carries the text of an answer that is being typed, WITHOUT going through React
// state on every frame. The live answer component subscribes and updates the screen directly.
export function createLiveStream() {
  const subs = new Set();
  const s = {
    text: '',
    typing: true,
    subscribe(fn) { subs.add(fn); fn(s.text, s.typing); return () => subs.delete(fn); },
    update(text, typing) { s.text = text; s.typing = typing; subs.forEach((f) => f(text, typing)); },
  };
  return s;
}

// Splits markdown into finished blocks (never touched again) and the last, still-growing block.
// Blank lines separate blocks, except inside code fences.
export function splitBlocks(text) {
  const lines = text.split('\n');
  const blocks = [];
  let cur = [];
  let fence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) fence = !fence;
    if (!fence && line.trim() === '' && !/^\s*```/.test(line)) {
      if (cur.length) { blocks.push(cur.join('\n')); cur = []; }
    } else cur.push(line);
  }
  const tail = cur.join('\n');
  return { stable: blocks, tail };
}
