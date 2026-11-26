// Per-question right/wrong counts, used for adaptive "weak questions" practice. No AI cost.
export function questionKey(q) {
  const text = String(q?.question || '');
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return 'q' + (h >>> 0).toString(36);
}

export function weakQuestions(quizGroups = [], stats = {}) {
  const seen = new Set();
  const out = [];
  for (const g of quizGroups) {
    for (const q of g.quizzes || []) {
      const key = questionKey(q);
      const s = stats[key];
      if (s && s.wrong > s.right && !seen.has(key)) { seen.add(key); out.push(q); }
    }
  }
  return out;
}
