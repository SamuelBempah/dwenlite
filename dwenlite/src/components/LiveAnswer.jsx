import { useEffect, useRef } from 'react';
import { renderMarkdown } from '../lib/markdown';
import { fadeTail } from '../lib/magic';
import { splitBlocks } from '../lib/liveStream';
import Sparkle from './Sparkle';

function scrollParent(el) {
  for (let p = el && el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

// The answer while it is being typed. Each frame only the LAST block is re-rendered; finished blocks
// are rendered once and kept. The sparkle follows the last letter, and the chat stays pinned to the
// bottom (unless you scroll up to read).
export default function LiveAnswer({ live }) {
  const box = useRef(null);
  const stable = useRef(null);
  const tail = useRef(null);
  const cursor = useRef(null);
  const thinking = useRef(null);

  useEffect(() => {
    let done = 0;          // how many finished blocks are already on screen
    let stableHtml = '';
    let lastText = null;
    let scrollEl = null;
    let stick = true;

    const onScroll = () => { stick = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 140; };
    const attach = () => {
      scrollEl = scrollParent(box.current);
      if (scrollEl) scrollEl.addEventListener('scroll', onScroll, { passive: true });
    };

    const render = (text, typing) => {
      if (text === lastText) return;
      lastText = text;
      if (!box.current) return;
      if (!scrollEl) attach();

      thinking.current.style.display = text ? 'none' : 'flex';
      const { stable: blocks, tail: tailText } = splitBlocks(text);
      if (blocks.length !== done) {
        stableHtml += renderMarkdown(blocks.slice(done).join('\n\n'));
        done = blocks.length;
        stable.current.innerHTML = stableHtml;
      }
      const html = tailText ? renderMarkdown(tailText) : '';
      tail.current.innerHTML = typing && text.length < 20000 ? fadeTail(html || '<p></p>') : html;

      // sparkle at the last letter
      const a = tail.current.querySelector('.magic-anchor');
      if (a && cursor.current) {
        const ar = a.getBoundingClientRect();
        const br = box.current.getBoundingClientRect();
        cursor.current.style.opacity = '1';
        cursor.current.style.transform = `translate3d(${ar.left - br.left}px, ${ar.top - br.top + ar.height * 0.55}px, 0)`;
      } else if (cursor.current) {
        cursor.current.style.opacity = typing && text ? '1' : '0';
      }

      // stay at the bottom while it writes
      if (stick && scrollEl) {
        scrollEl.scrollTop = scrollEl.scrollHeight;
        // once more after the browser has laid out the new text, in case it grew a little further
        requestAnimationFrame(() => { if (stick && scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight; });
      }
    };

    const unsub = live.subscribe(render);
    return () => { unsub(); if (scrollEl) scrollEl.removeEventListener('scroll', onScroll); };
  }, [live]);

  return (
    <div ref={box} className="relative">
      <div ref={thinking} className="flex items-center gap-3 py-1" aria-label="DwenLite AI is thinking">
        <span className="spark-cursor spark-cursor-static"><Sparkle /></span>
        <span className="magic-shimmer-text ml-3 text-xs font-medium tracking-wide">Thinking</span>
      </div>
      <div ref={stable} className="md" />
      <div ref={tail} className="md" />
      <span ref={cursor} className="spark-cursor" style={{ opacity: 0 }} aria-hidden="true"><Sparkle /></span>
    </div>
  );
}
