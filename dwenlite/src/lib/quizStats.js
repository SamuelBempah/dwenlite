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

// Fill-in-the-blank answers: ignore case, punctuation, articles and extra spaces.
function normalize(t = '') {
  return String(t).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\b(the|a|an)\b/g, ' ').replace(/\s+/g, ' ').trim();
}
export function answersMatch(typed, correct) {
  const a = normalize(typed);
  const b = normalize(correct);
  if (!a) return false;
  if (a === b) return true;
  // allow one typo on longer answers
  if (b.length >= 6 && Math.abs(a.length - b.length) <= 1) {
    let diff = 0; let i = 0; let j = 0;
    while (i < a.length && j < b.length && diff <= 1) {
      if (a[i] === b[j]) { i++; j++; continue; }
      diff++;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    diff += (a.length - i) + (b.length - j);
    return diff <= 1;
  }
  return false;
}
