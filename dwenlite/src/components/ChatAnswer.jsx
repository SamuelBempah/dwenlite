import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { renderMarkdown } from '../lib/markdown';
import { fadeTail } from '../lib/magic';
import Sparkle from './Sparkle';
import LiveAnswer from './LiveAnswer';

const TWINKLES = [[8, 14], [24, 70], [41, 28], [58, 82], [72, 40], [86, 12], [15, 52], [64, 60]];

// An AI answer in a chat bubble, with glitter: a sparkle that thinks, golden letters that settle as
// they are written, a star that sheds sparks at the writing position, and a shimmer when it is done.
export default function ChatAnswer({ content, typing, html, live }) {
  const wasTyping = useRef(false);
  const box = useRef(null);
  const cursor = useRef(null);
  useEffect(() => { if (typing || live) wasTyping.current = true; }, [typing, live]);

  const base = useMemo(() => (html !== undefined ? html : renderMarkdown(content)), [html, content]);
  const shown = useMemo(
    () => (typing && content && content.length < 20000 ? fadeTail(base) : base),
    [typing, content, base]
  );

  // Keep the sparkle on the last written letter (moved directly, so its animation never restarts).
  useLayoutEffect(() => {
    const c = cursor.current;
    const b = box.current;
    if (!c || !b) return;
    const a = b.querySelector('.magic-anchor');
    if (!a) { c.style.opacity = '0'; return; }
    const ar = a.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    c.style.opacity = '1';
    c.style.transform = `translate3d(${ar.left - br.left}px, ${ar.top - br.top + ar.height * 0.55}px, 0)`;
  });

  // A streamed answer stays exactly as it was typed (no full re-render when it finishes), then settles.
  if (live) {
    const done = !typing && wasTyping.current;
    return (
      <div className={`relative ${done ? 'magic-settle' : ''}`}>
        <LiveAnswer live={live} />
        {done && TWINKLES.map(([top, left], i) => (
          <span key={i} className="twinkle" style={{ top: `${top}%`, left: `${left}%`, animationDelay: `${i * 0.09}s` }} aria-hidden="true" />
        ))}
      </div>
    );
  }

  if (typing && !content) {
    return (
      <div className="flex items-center gap-3 py-1" aria-label="DwenLite AI is thinking">
        <span className="spark-cursor spark-cursor-static"><Sparkle /></span>
        <span className="magic-shimmer-text ml-3 text-xs font-medium tracking-wide">Thinking</span>
      </div>
    );
  }

  const settle = !typing && wasTyping.current;
  return (
    <div ref={box} className={`relative ${settle ? 'magic-settle' : ''}`}>
      <div className="md" dangerouslySetInnerHTML={{ __html: shown }} />
      {typing && <span ref={cursor} className="spark-cursor" aria-hidden="true"><Sparkle /></span>}
      {settle && TWINKLES.map(([top, left], i) => (
        <span key={i} className="twinkle" style={{ top: `${top}%`, left: `${left}%`, animationDelay: `${i * 0.09}s` }} aria-hidden="true" />
      ))}
    </div>
  );
}
