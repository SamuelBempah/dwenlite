import { homeCall } from './homeClient';

export const MAX_FILE = 8 * 1024 * 1024;
const CHUNK = 500 * 1024;
const uid = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 8);

const toBase64 = (bytes) => { let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(bin); };

// Sends a file from this browser to the server in pieces; the computer's agent then collects it.
export async function uploadPieces(file, onProgress) {
  if (file.size > MAX_FILE) throw new Error(`${file.name} is ${(file.size / 1048576).toFixed(1)} MB. Files up to 8 MB can be sent.`);
  const fileId = uid(); const total = Math.max(1, Math.ceil(file.size / CHUNK));
  for (let i = 0; i < total; i++) {
    const buf = new Uint8Array(await file.slice(i * CHUNK, (i + 1) * CHUNK).arrayBuffer());
    await homeCall('file_put', { fileId, index: i, total, data: toBase64(buf) });
    onProgress && onProgress((i + 1) / total);
  }
  return { fileId, total };
}

// Collects the pieces the agent uploaded for a send_file job and saves them as one download.
export async function downloadPieces(jobId, total, name, onProgress) {
  const parts = [];
  for (let i = 0; i < total; i++) {
    const { data } = await homeCall('file_get', { jobId, index: i });
    const bin = atob(data); const bytes = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
    parts.push(bytes); onProgress && onProgress((i + 1) / total);
  }
  const url = URL.createObjectURL(new Blob(parts));
  const a = document.createElement('a'); a.href = url; a.download = name || 'file'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
