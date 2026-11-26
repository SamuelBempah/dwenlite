// Import / export of flashcards as CSV, TSV or semicolon text (works with Anki, Quizlet, Excel).

function parseRows(text, delim) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(c => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(c => c.trim() !== '')) rows.push(row);
  return rows;
}

export function parseCards(raw, max = 500) {
  const text = String(raw || '').replace(/^﻿/, '');
  const first = text.split(/\r?\n/).find(l => l.trim()) || '';
  const count = (d) => first.split(d).length - 1;
  const delim = [['\t', count('\t')], [';', count(';')], [',', count(',')]].sort((a, b) => b[1] - a[1])[0][0];
  let rows = parseRows(text, delim);
  if (rows.length && /^(question|front|term)$/i.test(rows[0][0]?.trim()) && /^(answer|back|definition)$/i.test(rows[0][1]?.trim() || '')) rows = rows.slice(1);
  return rows
    .map(r => ({ question: (r[0] || '').trim(), answer: (r[1] || '').trim() }))
    .filter(c => c.question && c.answer)
    .slice(0, max)
    .map(c => ({ id: Date.now().toString() + Math.random().toString(36).slice(2), ...c }));
}

export function toCsv(cards) {
  const q = (t) => `"${String(t ?? '').replace(/"/g, '""')}"`;
  return '﻿' + ['Question,Answer', ...cards.map(c => `${q(c.question)},${q(c.answer)}`)].join('\r\n');
}
