// Dwenlite Home talks like a person, not a terminal: technical words are swapped for everyday ones in what the owner sees.
// (Real programming answers, which contain code blocks, are left exactly as written.)
const SWAPS = [
  [/\b((?:the|a|an) )?power ?shell (?:script|command)(s?)\b/gi, (m, art, pl) => `${art || ''}task${pl}`],
  [/\b(?:(?:the|a|an) )?(?:power ?shell|cmd(?:\.exe)?|bash|zsh|terminal|command[- ]line|command prompt|shell)\b/gi, 'the computer'],
  [/\bscripting\b/gi, 'automating'], [/\bscripted\b/gi, 'automated'], [/\bscripts\b/gi, 'tasks'], [/\bscript\b/gi, 'task'],
  [/\bcommands\b/gi, 'tasks'], [/\bcommand\b/gi, 'task'],
  [/\b(stdout|stderr)\b/gi, 'output'], [/\bexit code \d+\b/gi, ''],
];
export function plainText(text) {
  const t = String(text == null ? '' : text);
  if (!t || t.includes('```')) return t;
  return SWAPS.reduce((acc, [re, to]) => acc.replace(re, to), t).replace(/\s{2,}/g, ' ').replace(/ ([.,!?])/g, '$1');
}
