// Click handling for the Copy / Run buttons that rendered code blocks have (see lib/markdown.js).
export function installCodeActions() {
  if (typeof document === 'undefined' || window.__codeActions) return;
  window.__codeActions = true;
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest && e.target.closest('[data-copy], [data-run]');
    if (!btn) return;
    const code = btn.closest('.md-code')?.querySelector('pre')?.innerText || '';
    if (btn.hasAttribute('data-copy')) {
      try { await navigator.clipboard.writeText(code); btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = 'Copy'; }, 1400); } catch { btn.textContent = 'Press Ctrl+C'; }
    } else {
      window.dispatchEvent(new CustomEvent('dwenlite:run', { detail: { lang: btn.getAttribute('data-run'), code } }));
    }
  });
}
