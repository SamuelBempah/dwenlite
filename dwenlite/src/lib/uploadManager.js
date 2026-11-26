import { useSyncExternalStore } from 'react';
import { uploadBytesResumable } from 'firebase/storage';

// Global upload tracker. It lives outside React, so uploads keep running (and
// the progress banner keeps updating) when the user navigates between pages.

const uploads = new Map();
let snapshot = [];
const listeners = new Set();
let seq = 0;

export function formatBytes(n = 0) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1);
  const v = n / Math.pow(1024, i);
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
}

export function formatEta(sec) {
  if (!isFinite(sec) || sec <= 0) return '';
  if (sec < 60) return `~${Math.ceil(sec)}s left`;
  return `~${Math.ceil(sec / 60)} min left`;
}

function emit() {
  snapshot = [...uploads.values()];
  listeners.forEach((l) => l());
  syncSideEffects();
}

export const subscribeUploads = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const getUploads = () => snapshot;
export const useUploads = () => useSyncExternalStore(subscribeUploads, getUploads);

// ---------------------------------------------------------------------------
// Keep-alive helpers (best effort - a web page cannot upload once the browser
// kills it, so we do everything possible to stop that happening).
// ---------------------------------------------------------------------------
let wakeLock = null;
let sideEffectsOn = false;
let lastNotify = 0;

const active = () => snapshot.filter((u) => u.state === 'uploading' || u.state === 'paused');

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && !wakeLock && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch { /* not supported or denied */ }
}

function releaseWakeLock() {
  try { wakeLock?.release(); } catch { /* ignore */ }
  wakeLock = null;
}

const warnBeforeLeave = (e) => { e.preventDefault(); e.returnValue = ''; };

async function notify(title, body, tag = 'dwenlite-upload') {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const opts = { body, tag, renotify: false, silent: true, icon: '/pwa-192x192.png', badge: '/pwa-192x192.png' };
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg?.showNotification) await reg.showNotification(title, opts);
    else new Notification(title, opts);
  } catch { /* ignore */ }
}

function totals() {
  const list = active();
  const size = list.reduce((a, u) => a + u.size, 0);
  const done = list.reduce((a, u) => a + u.transferred, 0);
  return { size, done, pct: size ? Math.floor((done / size) * 100) : 0, count: list.length };
}

function onVisibility() {
  if (document.visibilityState === 'visible') requestWakeLock();
  else if (active().length) {
    const t = totals();
    notify('DwenLite is uploading…', `${t.pct}% · ${formatBytes(t.done)} of ${formatBytes(t.size)}. Keep the app open.`);
  }
}

function syncSideEffects() {
  const t = totals();
  if (t.count && !sideEffectsOn) {
    sideEffectsOn = true;
    window.addEventListener('beforeunload', warnBeforeLeave);
    document.addEventListener('visibilitychange', onVisibility);
    requestWakeLock();
  } else if (!t.count && sideEffectsOn) {
    sideEffectsOn = false;
    window.removeEventListener('beforeunload', warnBeforeLeave);
    document.removeEventListener('visibilitychange', onVisibility);
    releaseWakeLock();
  }

  // Tab title shows live progress, handy when the tab is in the background.
  if (t.count) document.title = `⬆ ${t.pct}% · DwenLite`;
  else if (document.title.startsWith('⬆')) document.title = 'DwenLite';

  // While the app is in the background keep a notification up to date (max 1 per 3s).
  if (t.count && document.visibilityState === 'hidden' && Date.now() - lastNotify > 3000) {
    lastNotify = Date.now();
    notify('DwenLite is uploading…', `${t.pct}% · ${formatBytes(t.done)} of ${formatBytes(t.size)}`);
  }
}

// Call this synchronously from the click handler that starts an upload (browsers
// only allow the permission prompt right after a tap).
export function primeUploadNotifications() {
  try {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Drop-in replacement for uploadBytes() that reports real byte progress.
// ---------------------------------------------------------------------------
export function uploadWithProgress(storageRef, data, { name } = {}) {
  const id = ++seq;
  const entry = {
    id,
    name: name || data?.name || storageRef.name,
    size: data?.size ?? data?.byteLength ?? 0,
    transferred: 0,
    state: 'uploading',
    speed: 0,
    startedAt: Date.now(),
  };
  uploads.set(id, entry);
  emit();

  const task = uploadBytesResumable(storageRef, data);
  let lastBytes = 0;
  let lastTime = Date.now();

  const patch = (p) => { uploads.set(id, { ...uploads.get(id), ...p }); emit(); };
  const remove = (ms) => setTimeout(() => { uploads.delete(id); emit(); }, ms);

  task.on(
    'state_changed',
    (snap) => {
      const now = Date.now();
      let speed = uploads.get(id).speed;
      if (now - lastTime >= 500) {
        const inst = ((snap.bytesTransferred - lastBytes) / (now - lastTime)) * 1000;
        speed = speed ? speed * 0.7 + inst * 0.3 : inst;
        lastBytes = snap.bytesTransferred;
        lastTime = now;
      }
      patch({
        transferred: snap.bytesTransferred,
        size: snap.totalBytes || entry.size,
        speed,
        state: snap.state === 'paused' ? 'paused' : 'uploading',
      });
    },
    () => {
      patch({ state: 'error' });
      notify('Upload failed', `${entry.name} could not be uploaded.`, 'dwenlite-upload-done');
      remove(6000);
    },
    () => {
      patch({ state: 'done', transferred: uploads.get(id).size, speed: 0 });
      if (!active().length && document.visibilityState === 'hidden') {
        notify('Upload complete', `${entry.name} finished uploading.`, 'dwenlite-upload-done');
      }
      remove(2500);
    }
  );

  return task; // thenable: `await uploadWithProgress(...)` works like uploadBytes
}
