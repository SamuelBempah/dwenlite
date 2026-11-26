// The "glitter ink" effect for a streaming answer. The newest letters are golden, faint and glowing,
// and turn into normal text as more follows. An invisible anchor is left at the very end so a
// sparkle can sit there. Works on already-rendered HTML, so tables and lists keep their shape.
export function fadeTail(html, n = 30) {
  if (!html || typeof DOMParser === 'undefined') return html;
  const doc = new DOMParser().parseFromString(`<div id="r">${html}</div>`, 'text/html');
  const root = doc.getElementById('r');
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  for (let t = walker.nextNode(); t; t = walker.nextNode()) if (t.nodeValue.trim()) nodes.push(t);

  const lastNode = nodes.length ? nodes[nodes.length - 1] : null;
  const host = lastNode && lastNode.parentNode ? lastNode.parentNode : root;

  let consumed = 0; // letters handled so far, counted from the very end
  for (let i = nodes.length - 1; i >= 0 && consumed < n; i--) {
    const node = nodes[i];
    const chars = [...node.nodeValue];
    const take = Math.min(n - consumed, chars.length);
    const frag = doc.createDocumentFragment();
    const head = chars.slice(0, chars.length - take).join('');
    if (head) frag.appendChild(doc.createTextNode(head));
    chars.slice(chars.length - take).forEach((ch, idx) => {
      const k = consumed + (take - 1 - idx);   // 0 = newest letter
      const t = k / n;                          // 0 (newest) .. 1 (settled)
      const span = doc.createElement('span');
      span.textContent = ch;
      span.style.opacity = String(0.15 + 0.85 * t * t * (3 - 2 * t));
      if (k < 16) {
        // golden glitter fading into the normal text colour
        const c = Math.min(1, k / 16);
        span.style.color = `rgb(${Math.round(253 + (226 - 253) * c)}, ${Math.round(226 + (232 - 226) * c)}, ${Math.round(140 + (240 - 140) * c)})`;
        span.style.textShadow = `0 0 ${11 - k * 0.55}px rgba(251, 191, 36, ${0.95 - k * 0.055})`;
      }
      frag.appendChild(span);
    });
    node.parentNode.replaceChild(frag, node);
    consumed += take;
  }

  const anchor = doc.createElement('span');
  anchor.className = 'magic-anchor';
  anchor.setAttribute('aria-hidden', 'true');
  host.appendChild(anchor);
  return root.innerHTML;
}
