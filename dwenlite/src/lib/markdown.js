import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: true });

const isSeparator = (l) => /^[\s|:-]+$/.test(l) && l.includes('-') && l.includes('|');
const isRow = (l) => l.includes('|');

// Markdown needs a blank line before a table. AI answers (and older saved notes) often skip it,
// which is why tables showed up as plain text with pipes.
export function normalizeTables(md) {
  const lines = String(md).split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const startsTable = isRow(l) && !isSeparator(l) && i + 1 < lines.length && isSeparator(lines[i + 1]);
    if (startsTable && out.length && out[out.length - 1].trim() !== '' && !isRow(out[out.length - 1])) out.push('');
    out.push(l);
  }
  return out.join('\n');
}

// Markdown -> safe HTML. Tables are wrapped so wide ones scroll sideways on phones.
export function renderMarkdown(md) {
  if (!md) return '';
  const html = DOMPurify.sanitize(marked.parse(normalizeTables(md)));
  return html
    .replace(/<table/g, '<div class="md-table-wrap"><table').replace(/<\/table>/g, '</table></div>')
    // code blocks get a small bar with Copy (and Run for JavaScript or HTML on the Dwenlite Home page)
    .replace(/<pre><code(?: class="language-([\w+#-]{1,20})")?>([\s\S]*?)<\/code><\/pre>/g, (m, lang, code) => {
      const runnable = /^(js|javascript|html)$/i.test(lang || '');
      return `<div class="md-code"><div class="md-code-bar"><span>${lang || 'code'}</span><span><button type="button" data-copy>Copy</button>${runnable ? `<button type="button" data-run="${lang.toLowerCase()}">Run</button>` : ''}</span></div><pre><code>${code}</code></pre></div>`;
    });
}
