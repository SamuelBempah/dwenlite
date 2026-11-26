import { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import { X } from 'lucide-react';

// Shows a diagram the teacher drew (Mermaid). The library is loaded only when needed.
export default function DiagramModal({ code, onClose }) {
  const [svg, setSvg] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const id = `dwen-diagram-${Date.now()}`;
    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'strict',
          flowchart: { htmlLabels: false },
        });
        const { svg: out } = await mermaid.render(id, code);
        if (!cancelled) setSvg(DOMPurify.sanitize(out, { USE_PROFILES: { svg: true, svgFilters: true } }));
      } catch (err) {
        console.warn('Diagram failed:', err?.message);
        document.getElementById(id)?.remove();
        document.getElementById(`d${id}`)?.remove();
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[85dvh] w-full max-w-2xl flex-col rounded-2xl border border-white/10 bg-[#121217] text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-lg font-bold">Diagram</h2>
          <button onClick={onClose} aria-label="Close diagram" className="text-gray-400 hover:text-white"><X size={22} /></button>
        </div>
        <div className="flex-1 overflow-auto p-5">
          {failed ? (
            <p className="text-sm text-slate-400">Sorry, I couldn't draw that diagram this time. Ask me to try again.</p>
          ) : svg ? (
            <div className="[&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <p className="animate-pulse text-sm text-slate-400">Drawing...</p>
          )}
        </div>
      </div>
    </div>
  );
}
