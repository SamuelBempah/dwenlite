import { useEffect, useMemo, useRef } from 'react';
import { renderMarkdown } from '../lib/markdown';
import { fadeTail } from '../lib/magic';

// An AI answer in a chat bubble. Magical by design: glowing orbs while it thinks, letters that
// fade in like ink as it writes, a sparkling cursor, and a soft glow that settles when it is done.
export default function ChatAnswer({ content, typing, html }) {
  const wasTyping = useRef(false);
  useEffect(() => { if (typing) wasTyping.current = true; }, [typing]);

  const base = useMemo(() => (html !== undefined ? html : renderMarkdown(content)), [html, content]);
  const shown = useMemo(
    () => (typing && content && content.length < 20000 ? fadeTail(base) : base),
    [typing, content, base]
  );

  if (typing && !content) {
    return (
      <div className="flex items-center gap-2.5 py-1" aria-label="DwenLite AI is thinking">
        <span className="magic-orb" />
        <span className="magic-orb [animation-delay:160ms]" />
        <span className="magic-orb [animation-delay:320ms]" />
        <span className="magic-shimmer-text text-xs font-medium tracking-wide">Thinking</span>
      </div>
    );
  }

  const settle = !typing && wasTyping.current;
  return (
    <div className={settle ? 'magic-settle' : ''}>
      <div className="md" dangerouslySetInnerHTML={{ __html: shown }} />
      {typing && content && content.length >= 20000 && <span className="typing-caret" aria-hidden="true" />}
    </div>
  );
}
