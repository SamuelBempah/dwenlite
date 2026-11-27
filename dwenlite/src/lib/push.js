import { homeCall } from './homeClient';

const toBytes = (b64) => { const pad = '='.repeat((4 - (b64.length % 4)) % 4); const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))); };

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export async function pushState() {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); return sub && Notification.permission === 'granted' ? 'on' : 'off'; } catch { return 'off'; }
}

export async function enablePush() {
  if (!pushSupported()) throw new Error('This browser cannot show notifications. On iPhone, install the app to your home screen first.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications were not allowed. Allow them in your browser or phone settings for this site.');
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await homeCall('push_key');
  let sub = await reg.pushManager.getSubscription();
  const same = sub && sub.options && sub.options.applicationServerKey && btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') === publicKey;
  if (sub && !same) { try { await sub.unsubscribe(); } catch { /* ignore */ } sub = null; }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(publicKey) });
  await homeCall('push_subscribe', { subscription: sub.toJSON() });
  return true;
}

export async function disablePush() {
  try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (sub) { await homeCall('push_unsubscribe', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); } } catch { /* ignore */ }
}

// Tell the owner's phone something happened (only when this page is not in front).
export function pingMe(title, body) {
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;
  homeCall('push_notify', { title, body }).catch(() => {});
}
