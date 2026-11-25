import axios from 'axios';
import { auth } from '../firebase';

export const AI_URL =
  'https://us-central1-leumas-decipher-softwares.cloudfunctions.net/generateNotesProxy';

// Attach the signed-in user's Firebase ID token to every AI request, so the
// backend can verify the user and rate-limit them. Imported once from main.jsx.
axios.interceptors.request.use(async (config) => {
  if (config.url === AI_URL && auth.currentUser) {
    const token = await auth.currentUser.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// task: 'general' | 'notes' | 'support' | 'rewrite'
export async function askAI(prompt, task = 'general') {
  try {
    const res = await axios.post(AI_URL, { prompt, task });
    const text = res.data?.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('No response from DwenLite AI.');
    return text;
  } catch (err) {
    throw new Error(err.response?.data?.error || err.message);
  }
}
