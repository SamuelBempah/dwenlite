// The "magic ink" effect: the newest letters of a streaming answer are faint and glowing, and
// become solid as more text follows. Works on already-rendered HTML, so tables and lists keep their shape.
export function fadeTail(html, n = 28) {
  if (!html || typeof DOMParser === 'undefined') return html;
  const doc = new DOMParser().parseFromString(`<div id="r">${html}</div>`, 'text/html');
  const root = doc.getElementById('r');
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  for (let t = walker.nextNode(); t; t = walker.nextNode()) if (t.nodeValue.trim()) nodes.push(t);

  const lastNode = nodes.length ? nodes[nodes.length - 1] : null;
  const hostEl = lastNode && lastNode.parentNode ? lastNode.parentNode : root;
  let consumed = 0; // letters already handled, counted from the very end of the text
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
      span.style.opacity = String(0.12 + 0.88 * t * t * (3 - 2 * t)); // smooth ramp
      if (k < 12) span.style.textShadow = `0 0 ${10 - k * 0.6}px rgba(196, 181, 253, ${0.9 - k * 0.06})`;
      frag.appendChild(span);
    });
    node.parentNode.replaceChild(frag, node);
    consumed += take;
  }
  // the sparkling cursor sits right after the last letter, not on its own line
  const host = hostEl;
  const caret = doc.createElement('span');
  caret.className = 'typing-caret';
  caret.setAttribute('aria-hidden', 'true');
  host.appendChild(caret);
  return root.innerHTML;
}
