import { useCallback, useEffect, useRef } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

const KEEP = 30;        // messages remembered per folder and chat
const MAX_CHARS = 6000; // per message

// Remembers the AI chat of a folder in the user's account, so it is still there tomorrow.
export function useChatMemory({ folder, folderId, kind, chatHistory, setChatHistory }) {
  const loaded = useRef(false);
  const lastSaved = useRef('');

  // Restore once, when the folder has loaded.
  useEffect(() => {
    if (!folder || loaded.current) return;
    loaded.current = true;
    const saved = folder.chatMemory?.[kind];
    if (Array.isArray(saved) && saved.length) {
      lastSaved.current = JSON.stringify(saved);
      setChatHistory(saved);
    }
  }, [folder, kind, setChatHistory]);

  // Save a moment after the chat changes.
  useEffect(() => {
    if (!loaded.current) return undefined;
    const clean = chatHistory
      .filter((m) => (m.type === 'user' || m.type === 'ai') && m.content)
      .slice(-KEEP)
      .map((m) => ({
        type: m.type,
        content: String(m.content).slice(0, MAX_CHARS),
        ...(m.followups?.length ? { followups: m.followups.slice(0, 3) } : {}),
      }));
    const json = JSON.stringify(clean);
    if (json === lastSaved.current || (clean.length === 0 && !lastSaved.current)) return undefined;
    const t = setTimeout(() => {
      lastSaved.current = json;
      updateDoc(doc(db, 'folders', folderId), { [`chatMemory.${kind}`]: clean }).catch(() => { });
    }, 1200);
    return () => clearTimeout(t);
  }, [chatHistory, folderId, kind]);

  const clearChat = useCallback(() => {
    setChatHistory([]);
    lastSaved.current = '[]';
    updateDoc(doc(db, 'folders', folderId), { [`chatMemory.${kind}`]: [] }).catch(() => { });
  }, [folderId, kind, setChatHistory]);

  return { clearChat };
}
