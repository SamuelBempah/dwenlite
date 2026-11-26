import { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

// Daily study streak + badges. Kept on the device and synced (best effort) to the account.
const KEY = 'dwenliteStreak';
export const BADGES = [
  { days: 3, name: 'Warming up' },
  { days: 7, name: 'One week strong' },
  { days: 14, name: 'Two week habit' },
  { days: 30, name: 'Study master' },
  { days: 100, name: 'Legend' },
];

export const localDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const yesterdayOf = () => { const d = new Date(); d.setDate(d.getDate() - 1); return localDay(d); };

export function readStreak() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { count: s.count || 0, best: s.best || 0, last: s.last || '' };
  } catch { return { count: 0, best: 0, last: '' }; }
}

// What to show: a streak that was not continued yesterday or today is over.
export const effectiveCount = (s) => (s.last === localDay() || s.last === yesterdayOf() ? s.count : 0);

function write(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
  try { window.dispatchEvent(new Event('dwenlite-streak')); } catch { /* ignore */ }
  const uid = auth.currentUser?.uid;
  if (uid) updateDoc(doc(db, 'users', uid), { streak: s }).catch(() => { });
}

// Call whenever the student does real studying (lesson, quiz, flashcards).
export function recordStudy() {
  const s = readStreak();
  const today = localDay();
  if (s.last === today) return s;
  const count = s.last === yesterdayOf() ? s.count + 1 : 1;
  const next = { count, best: Math.max(s.best, count), last: today };
  write(next);
  return next;
}

export function useStreak() {
  const [streak, setStreak] = useState(readStreak);

  useEffect(() => {
    const refresh = () => setStreak(readStreak());
    window.addEventListener('dwenlite-streak', refresh);
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) return;
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const remote = snap.exists() ? snap.data().streak : null;
        if (!remote) return;
        const local = readStreak();
        const remoteWins = remote.last > local.last || (remote.last === local.last && remote.count > local.count);
        const merged = remoteWins
          ? { count: remote.count || 0, best: Math.max(remote.best || 0, local.best), last: remote.last || '' }
          : { ...local, best: Math.max(local.best, remote.best || 0) };
        try { localStorage.setItem(KEY, JSON.stringify(merged)); } catch { /* ignore */ }
        setStreak(merged);
      } catch { /* offline or no permission: keep local */ }
    });
    return () => { window.removeEventListener('dwenlite-streak', refresh); unsub(); };
  }, []);

  return streak;
}
