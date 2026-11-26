import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { db, auth } from '../firebase';
import { doc, getDoc, updateDoc, addDoc, collection, setDoc, query, where, getDocs, arrayUnion, arrayRemove } from 'firebase/firestore';
import toast from 'react-hot-toast';
import axios from 'axios';
import { buildFolderContext, askAI } from '../lib/ai';
import { runStudyChat } from '../lib/chatRun';
import ChatAnswer from '../components/ChatAnswer';
import FollowUpChips from '../components/FollowUpChips';
import AnswerLengthToggle from '../components/AnswerLengthToggle';
import { loadVoicePrefs, LANGUAGES } from '../components/VoiceSettings';
import { renderMarkdown as renderMd } from '../lib/markdown';
import { useChatMemory } from '../lib/chatMemory';
import { generateStream } from '../lib/generate';
import { useGenProgress } from '../lib/genProgress';
import GenerationProgress from '../components/GenerationProgress';
import jsPDF from 'jspdf';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, Zap, Coins, ChevronLeft, ChevronRight, 
  MessageSquare, Send, AlertTriangle, Trash2, Star, ChevronDown, 
  ChevronUp, Sparkles, FolderOpen, FileText, Download, File, Highlighter, Search, X, Maximize2
} from 'lucide-react';

function Notes() {
  const { folderId } = useParams();
  const navigate = useNavigate();
  
  // --- STATE MANAGEMENT ---
  const [folder, setFolder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notesLoading, setNotesLoading] = useState(false);
  const [showStoredNotes, setShowStoredNotes] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [noteQuery, setNoteQuery] = useState('');
  const [exportOpenId, setExportOpenId] = useState(null);
  const [genProgress, gp] = useGenProgress();
  const [readerId, setReaderId] = useState(null);      // note open in the full-screen reader
  const [outline, setOutline] = useState([]);
  const [pages, setPages] = useState([]);              // the note split into A4 pages (HTML strings)
  const [fitScale, setFitScale] = useState(1);         // shrinks the A4 page to fit narrow screens, like a PDF on a phone
  const [fitMode, setFitMode] = useState(() => {
    try { return localStorage.getItem('dwenliteReaderFit') !== '0'; } catch { return true; }
  });
  const measureRef = useRef(null);
  const [paperMode, setPaperMode] = useState(() => {
    try { return localStorage.getItem('dwenliteReaderTheme') === 'paper'; } catch { return false; }
  });
  const [readerScale, setReaderScale] = useState(() => {
    try { return parseFloat(localStorage.getItem('dwenliteReaderScale')) || 1; } catch { return 1; }
  });
  const [noteLang, setNoteLang] = useState(() => loadVoicePrefs().language);
  const [noteTemplate, setNoteTemplate] = useState(() => {
    try { return localStorage.getItem('dwenliteNoteTemplate') || 'auto'; } catch { return 'auto'; }
  });
  const [showHighlights, setShowHighlights] = useState(true);
  const [mergeSel, setMergeSel] = useState([]);
  const [mergeBusy, setMergeBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState('');
  const [titleBusy, setTitleBusy] = useState(null);
  const latestFolder = useRef(null);
  latestFolder.current = folder;

  // Full-screen reader: Escape closes it, the page behind does not scroll, and an outline is built from the headings.
  useEffect(() => {
    if (!readerId) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setReaderId(null); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [readerId]);

  // Split the formatted note into real A4 pages: measure each block at A4 width and start a new page when it no longer fits.
  useEffect(() => {
    if (!readerId || editingId === readerId) { setPages([]); return undefined; }
    let cancelled = false;
    const PAGE_CONTENT_H = 1011; // 1123px A4 height minus top and bottom padding
    const run = () => {
      const el = measureRef.current;
      if (cancelled || !el) return;
      const out = [];
      let cur = [];
      let start = 0;
      [...el.children].forEach((k) => {
        const top = k.offsetTop;
        const bottom = top + k.offsetHeight;
        if (cur.length && bottom - start > PAGE_CONTENT_H) {
          // never leave a heading alone at the bottom of a page
          const carry = [];
          while (cur.length > 1 && /^H[1-3]$/.test(cur[cur.length - 1].tag)) carry.unshift(cur.pop());
          out.push(cur.map(c => c.html).join(''));
          cur = carry;
          start = carry.length ? carry[0].top : top;
        }
        cur.push({ html: k.outerHTML, tag: k.tagName, top });
      });
      if (cur.length) out.push(cur.map(c => c.html).join(''));
      setPages(out.length ? out : ['']);
    };
    const t = setTimeout(() => { (document.fonts?.ready ?? Promise.resolve()).then(run); }, 40);
    return () => { cancelled = true; clearTimeout(t); };
  }, [readerId, folder?.notes, editingId, readerScale]);

  // Outline from the headings on the pages.
  useEffect(() => {
    if (!readerId || pages.length === 0) { setOutline([]); return undefined; }
    const t = setTimeout(() => {
      const heads = [...document.querySelectorAll('.a4-sheet h1, .a4-sheet h2, .a4-sheet h3')];
      heads.forEach((h, i) => { h.id = `sec-${i}`; });
      setOutline(heads.map((h, i) => ({ id: `sec-${i}`, text: h.textContent.trim(), level: Number(h.tagName[1]) })));
    }, 60);
    return () => clearTimeout(t);
  }, [readerId, pages]);

  // Fit the A4 page to the available width (so a phone shows the whole page, like a PDF), or show it at full size.
  useEffect(() => {
    if (!readerId) return undefined;
    const el = document.getElementById('reader-article');
    if (!el) return undefined;
    const calc = () => setFitScale(fitMode ? Math.min(1, el.clientWidth / 794) : 1);
    calc();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(calc) : null;
    ro?.observe(el);
    window.addEventListener('resize', calc);
    return () => { ro?.disconnect(); window.removeEventListener('resize', calc); };
  }, [readerId, fitMode, pages.length]);

  useEffect(() => {
    if (!exportOpenId) return undefined;
    const close = (e) => { if (!e.target.closest?.('[data-export-menu]')) setExportOpenId(null); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [exportOpenId]);
  const [toolBusy, setToolBusy] = useState(null); // `${noteId}:${mode}` while a tool runs
  const [chatInput, setChatInput] = useState('');
  const [selectedNoteId, setSelectedNoteId] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [showNotePrompt, setShowNotePrompt] = useState(false);
  const [showReportForm, setShowReportForm] = useState(null);
  const [reportReason, setReportReason] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [gCoins, setGCoins] = useState(0);
  const [gCoinsAnimating, setGCoinsAnimating] = useState(false);
  const [ratings, setRatings] = useState({});
  const [ratingLoading, setRatingLoading] = useState({});
  const [hasRated, setHasRated] = useState({});
  
  const chatEndRef = useRef(null);
  const { clearChat } = useChatMemory({ folder, folderId, kind: 'notes', chatHistory, setChatHistory });

  // Configure marked for GFM (GitHub Flavored Markdown)
  marked.setOptions({ 
    breaks: true, 
    gfm: true 
  });

  // --- SMART RENDERER: Applies formatting to OLD and NEW notes ---
  const renderMarkdown = (content) => {
    if (!content) return '';

    // 1. HEURISTIC FORMATTING: Upgrade plain text to Markdown on the fly
    let enhancedContent = content;

    // Convert "Title:" or lines that look like headers (short, no punctuation at end or ends in colon)
    // Avoids lines that are likely sentences (contain periods)
    enhancedContent = enhancedContent.replace(
      /^([A-Z][a-zA-Z0-9\s]{3,40}:?)$/gm, 
      '### $1'
    );

    // Convert "Important:", "Note:", "Key Takeaway:" into highlights (blockquotes)
    enhancedContent = enhancedContent.replace(
      /^(Important|Note|Definition|Key Takeaway|Summary):/gmi, 
      '> **$1:**'
    );

    // Convert star bullets to dashes if they aren't already formatted lists
    enhancedContent = enhancedContent.replace(/^\* /gm, '- ');

    // 2. Render to HTML
    return renderMd(enhancedContent);
  };

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, showReportForm]);

  // --- LOGIC & EFFECTS ---
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => {
      if (!user) {
        toast.error('Please log in to view this folder.');
        navigate('/login');
        return;
      }
      setGCoins(0);
      fetchFolder(user.uid);
      fetchUserGCoins(user.uid);
      fetchUserRatings(user.uid);
    });
    return () => unsubscribe();
  }, [navigate, folderId]);

  const fetchUserGCoins = async (userId) => {
    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        setGCoins(userSnap.data().gCoins || 0);
      } else {
        await setDoc(userRef, { gCoins: 30 });
        setGCoins(30);
      }
    } catch (err) {
      console.error('Fetch user G_COINS error:', err);
      toast.error('Failed to fetch G_COINS. Please try again.');
    }
  };

  const fetchUserRatings = async (userId) => {
    try {
      const ratingsQuery = query(
        collection(db, 'ratings'),
        where('userId', '==', userId),
        where('folderId', '==', folderId)
      );
      const ratingsSnap = await getDocs(ratingsQuery);
      const userRatings = {};
      const hasRatedNotes = {};
      ratingsSnap.forEach(doc => {
        const data = doc.data();
        userRatings[data.noteId] = data.rating;
        hasRatedNotes[data.noteId] = true;
      });
      setRatings(userRatings);
      setHasRated(hasRatedNotes);
    } catch (err) {
      console.error('Fetch user ratings error:', err);
      toast.error('Failed to fetch user ratings. Please try again.');
    }
  };

  const deductGCoins = async (userId, amount) => {
    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        throw new Error('User document not found.');
      }
      const currentGCoins = userSnap.data().gCoins || 0;
      if (currentGCoins < amount) {
        throw new Error('Insufficient G_COINS.');
      }
      await updateDoc(userRef, { gCoins: currentGCoins - amount });
      setGCoins(currentGCoins - amount);
      setGCoinsAnimating(true);
      setTimeout(() => setGCoinsAnimating(false), 1000);
    } catch (err) {
      console.error('Deduct G_COINS error:', err);
      throw err;
    }
  };

  const fetchFolder = async (userId) => {
    try {
      const folderRef = doc(db, 'folders', folderId);
      const folderSnap = await getDoc(folderRef);

      if (!folderSnap.exists()) {
        toast.error('Folder not found.');
        setLoading(false);
        navigate('/dashboard');
        return;
      }

      const folderData = { id: folderSnap.id, ...folderSnap.data() };
      if (folderData.user_id !== userId) {
        toast.error('You do not have permission to view this folder.');
        setLoading(false);
        navigate('/dashboard');
        return;
      }

      folderData.notes = folderData.notes || [];
      folderData.documents = folderData.documents || [];
      setFolder(folderData);
      setLoading(false);
    } catch (err) {
      console.error('Fetch folder error:', err);
      toast.error('Failed to fetch folder. Please try again.');
      setLoading(false);
      navigate('/dashboard');
    }
  };

  // --- TRANSCRIPTION & GENERATION LOGIC ---
  const transcribeAudio = async (audioUrl) => {
    try {
      const apiKey = import.meta.env.VITE_ASSEMBLYAI_API_KEY;
      if (!apiKey) throw new Error('AssemblyAI API key not found.');
      console.log('Transcribing audio URL:', audioUrl);

      const response = await axios.post(
        'https://api.assemblyai.com/v2/transcript',
        { audio_url: audioUrl, auto_highlights: false, sentiment_analysis: false, content_safety: false, iab_categories: false, auto_chapters: false, format_text: false },
        { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
      );

      const transcriptId = response.data.id;
      let status = 'queued';
      let transcribedText = '';
      const maxAttempts = 600;
      let attempts = 0;

      while (status !== 'completed' && status !== 'error' && attempts < maxAttempts) {
        const checkResponse = await axios.get(
          `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
          { headers: { Authorization: `Bearer ${apiKey}` } }
        );
        status = checkResponse.data.status;
        gp.set(0, 0.5, `Transcribing your recording (${status})`, { indeterminate: true });
        if (status === 'completed') transcribedText = checkResponse.data.text || '';
        else if (status === 'error') throw new Error(`Audio transcription failed: ${checkResponse.data.error || 'Unknown error'}`);
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      if (attempts >= maxAttempts) throw new Error('Audio transcription timed out.');
      if (!transcribedText) throw new Error('Audio transcription returned empty text.');
      return transcribedText;
    } catch (err) {
      console.error('Audio transcription error:', err);
      throw new Error(`Audio transcription failed: ${err.message}`);
    }
  };

  const transcribeVideo = async (videoUrl) => {
    try {
      const apiKey = import.meta.env.VITE_ASSEMBLYAI_API_KEY;
      if (!apiKey) throw new Error('AssemblyAI API key not found.');
      console.log('Transcribing video URL:', videoUrl);

      const response = await axios.post(
        'https://api.assemblyai.com/v2/transcript',
        { audio_url: videoUrl, auto_highlights: false, sentiment_analysis: false, content_safety: false, iab_categories: false, auto_chapters: false, format_text: false },
        { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
      );

      const transcriptId = response.data.id;
      let status = 'queued';
      let transcribedText = '';
      const maxAttempts = 600;
      let attempts = 0;

      while (status !== 'completed' && status !== 'error' && attempts < maxAttempts) {
        const checkResponse = await axios.get(
          `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
          { headers: { Authorization: `Bearer ${apiKey}` } }
        );
        status = checkResponse.data.status;
        gp.set(0, 0.5, `Transcribing your recording (${status})`, { indeterminate: true });
        if (status === 'completed') transcribedText = checkResponse.data.text || '';
        else if (status === 'error') {
           let errorMessage = checkResponse.data.error || 'Unknown error';
           if (errorMessage.includes('transcoding failed')) errorMessage = 'Video file does not contain audio or is corrupted.';
           throw new Error(`Video transcription failed: ${errorMessage}`);
        }
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      if (attempts >= maxAttempts) throw new Error('Video transcription timed out.');
      if (!transcribedText) throw new Error('Video transcription returned empty text.');
      return transcribedText;
    } catch (err) {
      console.error('Video transcription error:', err);
      throw new Error(`Video transcription failed: ${err.message}`);
    }
  };

  const generateContent = async () => {
    try {
      const functionUrl = 'https://us-central1-leumas-decipher-softwares.cloudfunctions.net/generateNotesProxy';
      
      const latestDocument = folder.documents.length > 0
        ? folder.documents.reduce((latest, doc) => {
            return new Date(doc.uploadedAt) > new Date(latest.uploadedAt) ? doc : latest;
          }, folder.documents[0])
        : null;

      let context = folder.name;
      if (latestDocument) {
        if (latestDocument.isAudio) context = await transcribeAudio(latestDocument.url);
        else if (latestDocument.isVideo) context = await transcribeVideo(latestDocument.url);
        else context = latestDocument.extractedText || folder.name;
      }

      // Formatting rules (and meeting/lecture templates) live in the backend system prompt.
      const templateLine = noteTemplate !== 'auto' ? `Template: ${noteTemplate}\n\n` : '';
      const lang = LANGUAGES.find(l => l.id === loadVoicePrefs().language);
      const langLine = lang && lang.id !== 'en' ? `Write the notes in ${lang.name}.\n\n` : '';
      const prompt = `${templateLine}${langLine}Create notes from the following source material:\n\n${context}`;

      gp.set(0, 1, 'Material ready');
      gp.set(1, 0, 'Connecting to the AI...');
      const response = await generateStream({
        prompt,
        task: 'notes',
        onProgress: (e) => {
          if (e.phase === 'parts') gp.set(1, (e.done / e.total) * 0.9, `Long recording: written ${e.done} of ${e.total} parts`);
          else if (e.phase === 'merge') gp.set(1, 0.93, 'Combining the parts into one set of notes');
          else gp.set(1, Math.min(0.97, e.chars / 3800), `${e.chars.toLocaleString()} characters written`);
        },
      })
        .catch(err => {
           if (err.response?.data?.error) throw new Error(err.response.data.error);
           if (err.response?.status === 404) throw new Error('Backend function not found.');
           throw new Error(`Generation failed: ${err.message}`);
        });

      let generatedText;
      if (response.data.choices?.[0]?.message?.content) generatedText = response.data.choices[0].message.content.trim();
      else if (response.data.choices?.[0]?.text) generatedText = response.data.choices[0].text.trim();
      else throw new Error('Invalid API response: No generated content found.');

      return { 
        id: Date.now().toString(), 
        content: generatedText,
        createdAt: new Date().toISOString(),
        rating: 0
      };
    } catch (err) {
      console.error('Error generating notes:', err);
      throw new Error(err.message);
    }
  };

  const handleGenerateNotes = async () => {
    if (!auth.currentUser) { toast.error('Please log in to generate notes.'); return; }
    if (gCoins < 3) {
      toast.error(
        <div>
          Insufficient G_COINS. You need 3 G_COINS to generate notes.{' '}
          <Link to="/buy-coins" className="underline text-purple-400 hover:text-purple-300">Buy more G_COINS</Link>.
        </div>,
        { duration: 5000 }
      );
      return;
    }

    setNotesLoading(true);
    gp.start('Creating your notes');
    try {
      gp.set(0, 0.1, 'Reading your material');
      const newNote = await generateContent();
      gp.set(2, 0.2, 'Saving your notes');
      const folderRef = doc(db, 'folders', folderId);
      await updateDoc(folderRef, { notes: arrayUnion(newNote) });
      await deductGCoins(auth.currentUser.uid, 3);

      setFolder(prev => ({ ...prev, notes: [...prev.notes, newNote] }));
      setRatings(prev => ({ ...prev, [newNote.id]: newNote.rating }));
      setHasRated(prev => ({ ...prev, [newNote.id]: false }));
      gp.finish();
      toast.success('Notes generated successfully! 3 G_COINS deducted.');
      
      setReaderId(newNote.id);
      titleNote(newNote.id, { note: newNote });
    } catch (err) { gp.fail(); toast.error(err.message); } 
    finally { setNotesLoading(false); }
  };

  const handleDeleteNote = async (noteId) => {
    try {
      const updatedNotes = folder.notes.filter(note => note.id !== noteId);
      const folderRef = doc(db, 'folders', folderId);
      await updateDoc(folderRef, { notes: updatedNotes });

      setFolder(prev => ({ ...prev, notes: updatedNotes }));
      setRatings(prev => { const newRatings = { ...prev }; delete newRatings[noteId]; return newRatings; });
      setHasRated(prev => { const newHasRated = { ...prev }; delete newHasRated[noteId]; return newHasRated; });
      toast.success('Note deleted successfully!');
    } catch (err) {
      console.error('Delete note error:', err);
      toast.error('Failed to delete note. Please try again.');
    }
  };

  const handleRateNote = async (noteId, rating) => {
    if (!auth.currentUser) { toast.error('Please log in to rate notes.'); return; }
    if (hasRated[noteId]) { toast.error('You have already rated this note.'); return; }

    setRatingLoading(prev => ({ ...prev, [noteId]: true }));
    try {
      const folderRef = doc(db, 'folders', folderId);
      const updatedNotes = folder.notes.map(note => note.id === noteId ? { ...note, rating } : note);

      await updateDoc(folderRef, { notes: updatedNotes });
      setFolder(prev => ({ ...prev, notes: updatedNotes }));
      setRatings(prev => ({ ...prev, [noteId]: rating }));
      setHasRated(prev => ({ ...prev, [noteId]: true }));

      await addDoc(collection(db, 'ratings'), {
        userId: auth.currentUser.uid,
        folderId,
        noteId,
        rating,
        createdAt: new Date().toISOString(),
      });
      toast.success('Rating submitted successfully!');
    } catch (err) {
      console.error('Rate note error:', err);
      toast.error('Failed to submit rating. Please try again.');
    } finally {
      setRatingLoading(prev => ({ ...prev, [noteId]: false }));
    }
  };

  const handleToggleGroup = (noteId) => {
    setExpandedGroups(prev => ({ ...prev, [noteId]: !prev[noteId] }));
  };

  // ---- Export: PDF (with headings and bullets), Word and Markdown ----
  const exportName = (idx) => `${(folder?.name || 'notes').replace(/[^\w\- ]+/g, '').trim().slice(0, 40) || 'notes'}-note-${idx + 1}`;

  const saveBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const handleDownloadPDF = (note, idx) => {
    try {
      const pdf = new jsPDF();
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 14;
      let y = 20;
      const clean = (t) => t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/[*_`]/g, '').trim();
      const ensure = (need) => { if (y + need > pageH - margin) { pdf.addPage(); y = margin + 4; return true; } return false; };
      const write = (text, { size = 11, bold = false, italic = false, indent = 0, gap = 2 } = {}) => {
        pdf.setFont('helvetica', bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal');
        pdf.setFontSize(size);
        const lineH = size * 0.5 + 1.6;
        pdf.splitTextToSize(text, pageW - 2 * margin - indent).forEach(line => {
          ensure(lineH);
          pdf.text(line, margin + indent, y);
          y += lineH;
        });
        y += gap;
      };

      // Real table: borders, shaded header, wrapped cells, header repeated on a new page.
      const isSep = (l) => /^[\s|:-]+$/.test(l) && l.includes('-') && l.includes('|');
      const cellsOf = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => clean(c));
      const drawTable = (rows) => {
        const cols = Math.max(...rows.map(r => r.length));
        const norm = rows.map(r => Array.from({ length: cols }, (_, i) => r[i] || ''));
        const total = pageW - 2 * margin;
        const weight = Array.from({ length: cols }, (_, c) => Math.min(38, Math.max(8, ...norm.map(r => r[c].length))));
        const wsum = weight.reduce((a, b) => a + b, 0);
        const widths = weight.map(w => (total * w) / wsum);
        const pad = 2;
        const size = 9.5;
        const lineH = size * 0.5 + 1.2;
        const rowHeight = (r, bold) => {
          pdf.setFont('helvetica', bold ? 'bold' : 'normal');
          pdf.setFontSize(size);
          return Math.max(...r.map((c, i) => pdf.splitTextToSize(c, widths[i] - 2 * pad).length)) * lineH + 2 * pad;
        };
        const drawRow = (r, header, zebra) => {
          const h = rowHeight(r, header);
          let x = margin;
          pdf.setDrawColor(150, 150, 165);
          pdf.setLineWidth(0.2);
          r.forEach((c, i) => {
            if (header) pdf.setFillColor(237, 233, 254);
            else if (zebra) pdf.setFillColor(246, 246, 250);
            else pdf.setFillColor(255, 255, 255);
            pdf.rect(x, y, widths[i], h, 'FD');
            pdf.setFont('helvetica', header ? 'bold' : 'normal');
            pdf.setFontSize(size);
            pdf.setTextColor(header ? 60 : 30, header ? 30 : 30, header ? 120 : 40);
            pdf.splitTextToSize(c, widths[i] - 2 * pad).forEach((line, k) => pdf.text(line, x + pad, y + pad + lineH * (k + 0.8)));
            x += widths[i];
          });
          pdf.setTextColor(0, 0, 0);
          y += h;
        };
        y += 1;
        norm.forEach((r, ri) => {
          const header = ri === 0;
          const h = rowHeight(r, header);
          if (ensure(h)) { if (!header) drawRow(norm[0], true, false); }
          drawRow(r, header, !header && ri % 2 === 0);
        });
        y += 4;
      };

      const lines = (note.content || '').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trimEnd();
        if (!line.trim()) { y += 2; continue; }
        // a table starts with a row that is followed by a separator row
        if (line.includes('|') && i + 1 < lines.length && isSep(lines[i + 1].trim())) {
          const rows = [cellsOf(line)];
          i += 2;
          while (i < lines.length && lines[i].includes('|') && lines[i].trim()) { rows.push(cellsOf(lines[i])); i++; }
          i--;
          drawTable(rows);
          continue;
        }
        if (line.startsWith('### ')) write(clean(line.slice(4)), { size: 13, bold: true, gap: 1 });
        else if (line.startsWith('## ')) write(clean(line.slice(3)), { size: 15, bold: true, gap: 2 });
        else if (line.startsWith('# ')) write(clean(line.slice(2)), { size: 19, bold: true, gap: 4 });
        else if (line.startsWith('>')) write(clean(line.replace(/^>\s*/, '')), { italic: true, indent: 6 });
        else if (/^\s*[-*]\s+/.test(line)) write('\u2022 ' + clean(line.replace(/^\s*[-*]\s+/, '')), { indent: 4, gap: 0.5 });
        else write(clean(line));
      }
      pdf.save(`${exportName(idx)}.pdf`);
      toast.success('PDF downloaded!');
    } catch (err) {
      console.error('PDF generation error:', err);
      toast.error('Failed to generate PDF. Please try again.');
    }
  };

  const handleDownloadWord = (note, idx) => {
    const html = DOMPurify.sanitize(marked.parse(note.content || ''));
    const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${exportName(idx)}</title><style>table{border-collapse:collapse;width:100%}td,th{border:1px solid #888;padding:5px 8px;vertical-align:top}th{background:#ede9fe}</style></head><body style="font-family:Calibri,Arial,sans-serif">${html}</body></html>`;
    saveBlob(new Blob(['\ufeff', doc], { type: 'application/msword' }), `${exportName(idx)}.doc`);
    toast.success('Word file downloaded!');
  };

  const handleDownloadMarkdown = (note, idx) => {
    saveBlob(new Blob([note.content || ''], { type: 'text/markdown;charset=utf-8' }), `${exportName(idx)}.md`);
    toast.success('Markdown file downloaded!');
  };

  const handleReportContent = async (messageIndex, reason) => {
    setReportLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) { toast.error('You must be logged in to report content.'); return; }

      const message = chatHistory[messageIndex];
      const reportData = {
        userId: user.uid,
        folderId,
        contentType: 'chat_message',
        contentId: `message_${messageIndex}`,
        content: message.content,
        reason,
        createdAt: new Date().toISOString(),
      };

      await addDoc(collection(db, 'reports'), reportData);
      toast.success('Content reported successfully. Thank you for your feedback.');
      setShowReportForm(null);
      setReportReason('');
    } catch (err) {
      console.error('Error reporting content:', err);
      toast.error(`Failed to report content: ${err.message}`);
    } finally {
      setReportLoading(false);
    }
  };

  // ---- Highlights: select text inside a note, tap Save highlight ----
  const saveHighlight = async (note, idx) => {
    const sel = window.getSelection();
    const text = (sel?.toString() || '').replace(/\s+/g, ' ').trim();
    const owner = sel?.anchorNode?.parentElement?.closest?.('[data-note-content]')?.dataset?.noteContent;
    if (!text || owner !== note.id) { toast('Select some text inside the note first.', { icon: '\u261D\uFE0F' }); return; }
    if (text.length < 3) { toast.error('Select a little more text.'); return; }
    const highlight = { id: Date.now().toString(), noteId: note.id, noteLabel: `Note ${idx + 1}`, text: text.slice(0, 500), createdAt: new Date().toISOString() };
    try {
      await updateDoc(doc(db, 'folders', folderId), { highlights: arrayUnion(highlight) });
      setFolder(prev => ({ ...prev, highlights: [...(prev.highlights || []), highlight] }));
      sel.removeAllRanges();
      toast.success('Highlight saved');
    } catch (err) { toast.error('Could not save the highlight.'); }
  };

  const removeHighlight = async (h) => {
    try {
      await updateDoc(doc(db, 'folders', folderId), { highlights: arrayRemove(h) });
      setFolder(prev => ({ ...prev, highlights: (prev.highlights || []).filter(x => x.id !== h.id) }));
    } catch (err) { toast.error('Could not remove the highlight.'); }
  };

  const saveNotes = async (updatedNotes) => {
    await updateDoc(doc(db, 'folders', folderId), { notes: updatedNotes });
    setFolder(prev => ({ ...prev, notes: updatedNotes }));
  };

  // Short title + tags for a note (one tiny AI call). Runs in the background after new notes.
  const titleNote = async (noteId, { quiet = true, note: given = null } = {}) => {
    const note = given || latestFolder.current?.notes?.find(n => n.id === noteId);
    if (!note) return;
    setTitleBusy(noteId);
    try {
      const raw = await askAI(`Return ONLY a JSON object like {"title":"at most 6 words","tags":["tag1","tag2","tag3"]} describing these notes. Tags are short lowercase words.\n\n${String(note.content).slice(0, 3000)}`, 'general');
      const m = raw.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(m ? m[0] : raw);
      const title = String(parsed.title || '').replace(/[#*"]/g, '').trim().slice(0, 60);
      const tags = (Array.isArray(parsed.tags) ? parsed.tags : []).map(t => String(t).toLowerCase().trim().slice(0, 24)).filter(Boolean).slice(0, 4);
      if (!title) throw new Error('no title');
      const current = latestFolder.current.notes;
      await saveNotes(current.map(n => (n.id === noteId ? { ...n, title, tags } : n)));
    } catch (err) {
      if (!quiet) toast.error('Could not make a title this time.');
    } finally {
      setTitleBusy(null);
    }
  };

  // Combine two or more selected notes into one new note (originals stay).
  const mergeSelected = async () => {
    if (mergeSel.length < 2 || mergeBusy) return;
    setMergeBusy(true);
    try {
      const picked = folder.notes.map((n, i) => ({ n, i })).filter(({ n }) => mergeSel.includes(n.id));
      const text = picked.map(({ n, i }) => `=== NOTE ${i + 1} ===\n${n.content}`).join('\n\n');
      const content = await askAI(`MODE: merge\n\n${text}`, 'note_tools');
      const newNote = {
        id: Date.now().toString(),
        content,
        createdAt: new Date().toISOString(),
        rating: 0,
        label: `merged Notes ${picked.map(({ i }) => i + 1).join(' + ')}`,
      };
      await updateDoc(doc(db, 'folders', folderId), { notes: arrayUnion(newNote) });
      setFolder(prev => ({ ...prev, notes: [...prev.notes, newNote] }));
      setReaderId(newNote.id);
      setMergeSel([]);
      toast.success('Notes merged into a new note');
      titleNote(newNote.id, { note: newNote });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setMergeBusy(false);
    }
  };

  // Editing keeps the last 3 versions so a mistake can be undone.
  const startEdit = (note) => { setEditingId(note.id); setDraft(note.content || ''); };
  const saveEdit = async (note) => {
    const text = draft.trim();
    if (!text) { toast.error('A note cannot be empty.'); return; }
    if (text === note.content) { setEditingId(null); return; }
    try {
      const versions = [{ content: note.content, savedAt: new Date().toISOString() }, ...(note.versions || [])].slice(0, 3);
      await saveNotes(folder.notes.map(n => (n.id === note.id ? { ...n, content: text, versions } : n)));
      setEditingId(null);
      toast.success('Note saved');
    } catch (err) { toast.error('Could not save the note.'); }
  };
  const undoEdit = async (note) => {
    const [latest, ...rest] = note.versions || [];
    if (!latest) return;
    try {
      await saveNotes(folder.notes.map(n => (n.id === note.id ? { ...n, content: latest.content, versions: rest } : n)));
      toast.success('Restored the previous version');
    } catch (err) { toast.error('Could not restore.'); }
  };

  // Shorter / longer / action items / key terms: creates a NEW note and keeps the original.
  const NOTE_TOOLS = {
    shorter: { label: 'Shorter', tag: 'shorter' },
    longer: { label: 'Longer', tag: 'longer' },
    action_items: { label: 'Action items', tag: 'action items' },
    key_terms: { label: 'Key terms', tag: 'key terms' },
  };
  const runNoteTool = async (note, idx, mode) => {
    if (toolBusy) return;
    setToolBusy(`${note.id}:${mode}`);
    try {
      const content = await askAI(`MODE: ${mode}\n\n${note.content}`, 'note_tools');
      const newNote = {
        id: Date.now().toString(),
        content,
        createdAt: new Date().toISOString(),
        rating: 0,
        label: `${NOTE_TOOLS[mode].tag} of Note ${idx + 1}`,
      };
      await updateDoc(doc(db, 'folders', folderId), { notes: arrayUnion(newNote) });
      setFolder(prev => ({ ...prev, notes: [...prev.notes, newNote] }));
      setReaderId(newNote.id);
      toast.success(`Created: ${newNote.label}`);
      titleNote(newNote.id, { note: newNote });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setToolBusy(null);
    }
  };

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;
    const question = chatInput.trim();
    setChatInput('');
    await processQuestion(question);
  };

  // The AI reads every note (and uploaded document) in the folder and may go beyond them.
  const processQuestion = async (question) => {
    const priorHistory = chatHistory;
    setChatLoading(true);
    try {
      await runStudyChat({ context: buildFolderContext(folder), history: priorHistory, question, kind: 'notes', setChatHistory });
    } catch (err) {
      console.error('Error processing question:', err);
      toast.error(err.message);
    } finally {
      setChatLoading(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
       <div className="w-10 h-10 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
    </div>
  );

  if (!folder) return null;

  // Search across every note: keep the ones that contain the text and show where it appears.
  const q = noteQuery.trim().toLowerCase();
  const visibleNotes = folder.notes
    .map((note, idx) => {
      if (!q) return { note, idx, snippet: null };
      const text = (note.content || '').replace(/[#>*_`]/g, '');
      const at = text.toLowerCase().indexOf(q);
      const metaHit = [note.title, ...(note.tags || [])].join(' ').toLowerCase().includes(q);
      if (at < 0) return metaHit ? { note, idx, snippet: null } : null;
      return {
        note, idx,
        snippet: {
          before: (at > 40 ? '...' : '') + text.slice(Math.max(0, at - 40), at),
          match: text.slice(at, at + q.length),
          after: text.slice(at + q.length, at + q.length + 80) + '...',
        },
      };
    })
    .filter(Boolean);

  const readerIdx = readerId ? folder.notes.findIndex(n => n.id === readerId) : -1;
  const readerNote = readerIdx >= 0 ? folder.notes[readerIdx] : null;
  const togglePaper = () => setPaperMode(v => { try { localStorage.setItem('dwenliteReaderTheme', v ? 'dark' : 'paper'); } catch { /* ignore */ } return !v; });
  const setScale = (v) => { setReaderScale(v); try { localStorage.setItem('dwenliteReaderScale', String(v)); } catch { /* ignore */ } };
  const jumpTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Everything shown inside the reader: tools, editor or the formatted note.
  const renderNoteBody = (note, idx) => (
    <>
      <div className="mb-6 flex gap-2 overflow-x-auto rounded-xl bg-slate-800/70 p-2 [&>button]:shrink-0 [&>button]:whitespace-nowrap">
                     {Object.entries(NOTE_TOOLS).map(([mode, t]) => (
                        <button
                           key={mode}
                           onClick={() => runNoteTool(note, idx, mode)}
                           disabled={!!toolBusy}
                           className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-purple-200 hover:bg-purple-500/20 disabled:opacity-40 transition-colors"
                        >
                           {toolBusy === `${note.id}:${mode}` ? 'Working...' : t.label}
                        </button>
                     ))}
                     <button
                        onClick={() => startEdit(note)}
                        className="rounded-full border border-slate-600 bg-slate-700/40 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 transition-colors"
                     >
                        Edit
                     </button>
                     {note.versions?.length > 0 && (
                        <button
                           onClick={() => undoEdit(note)}
                           className="rounded-full border border-slate-600 bg-slate-700/40 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 transition-colors"
                        >
                           Undo last edit
                        </button>
                     )}
                     {!note.title && (
                        <button
                           onClick={() => titleNote(note.id, { quiet: false })}
                           disabled={titleBusy === note.id}
                           className="rounded-full border border-slate-600 bg-slate-700/40 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50 transition-colors"
                        >
                           {titleBusy === note.id ? 'Working...' : 'Add title & tags'}
                        </button>
                     )}
                     <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => saveHighlight(note, idx)}
                        className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-3 py-1.5 text-xs font-medium text-yellow-200 hover:bg-yellow-500/20 transition-colors"
                     >
                        Save highlight
                     </button>
                  </div>
                  {editingId === note.id ? (
                     <div>
                        <textarea
                           value={draft}
                           onChange={(e) => setDraft(e.target.value)}
                           className="min-h-[50vh] w-full resize-y rounded-xl border border-slate-700 bg-slate-900 p-4 font-mono text-sm text-slate-200 outline-none focus:border-purple-500"
                        />
                        <div className="mt-3 flex justify-end gap-2">
                           <button onClick={() => setEditingId(null)} className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
                           <button onClick={() => saveEdit(note)} className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold hover:bg-purple-500">Save</button>
                        </div>
                     </div>
                  ) : (
                  <div style={{ zoom: fitScale, width: 794 }} className="mx-auto">
                     {pages.map((html, i) => (
                        <div
                           key={i}
                           data-note-content={note.id}
                           className={`a4-sheet md md-reader md-a4${paperMode ? ' md-paper a4-paper' : ''}`}
                           style={{ '--md-scale': readerScale }}
                        >
                           <div className="a4-inner" dangerouslySetInnerHTML={{ __html: html }} />
                           <div className="a4-num">Page {i + 1} of {pages.length}</div>
                        </div>
                     ))}
                  </div>
                  )}
    </>
  );


  return (
    <>
      {readerNote && createPortal(
        <div className="fixed inset-0 z-[80] flex flex-col bg-slate-950 text-slate-200" role="dialog" aria-modal="true" aria-label="Note reader">
          <div className="flex items-center gap-2 border-b border-white/10 bg-slate-950/95 px-3 py-3 backdrop-blur md:px-6">
            <button onClick={() => setReaderId(null)} aria-label="Close reader" className="rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white">
              <X size={22} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">Note {readerIdx + 1}{readerNote.title ? ` · ${readerNote.title}` : ''}</p>
              <p className="truncate text-xs text-slate-500">{new Date(readerNote.createdAt).toLocaleDateString()}{readerNote.label ? ` · ${readerNote.label}` : ''}</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setFitMode(v => { try { localStorage.setItem('dwenliteReaderFit', v ? '0' : '1'); } catch { /* ignore */ } return !v; })}
                aria-pressed={fitMode}
                title={fitMode ? 'Fits the whole page on screen. Tap for full size.' : 'Full size. Tap to fit the page on screen.'}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${fitMode ? 'bg-white/15 text-white' : 'text-slate-300 hover:bg-white/10'}`}
              >{fitMode ? 'Fit' : '100%'}</button>
              <button onClick={togglePaper} aria-pressed={paperMode} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${paperMode ? 'bg-white text-slate-900' : 'text-slate-300 hover:bg-white/10'}`}>Paper</button>
              <button onClick={() => setScale(Math.max(0.9, +(readerScale - 0.15).toFixed(2)))} aria-label="Smaller text" className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-300 hover:bg-white/10">A-</button>
              <button onClick={() => setScale(Math.min(1.5, +(readerScale + 0.15).toFixed(2)))} aria-label="Larger text" className="rounded-lg px-2.5 py-1.5 text-base font-semibold text-slate-300 hover:bg-white/10">A+</button>
              <div className="relative" data-export-menu>
                <button onClick={() => setExportOpenId(exportOpenId === 'reader' ? null : 'reader')} aria-label="Export" className="rounded-lg p-2 text-slate-300 hover:bg-white/10"><Download size={18} /></button>
                {exportOpenId === 'reader' && (
                  <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-xl border border-white/10 bg-slate-900 shadow-2xl">
                    {[['PDF (.pdf)', () => handleDownloadPDF(readerNote, readerIdx)], ['Word (.doc)', () => handleDownloadWord(readerNote, readerIdx)], ['Markdown (.md)', () => handleDownloadMarkdown(readerNote, readerIdx)]].map(([label, fn]) => (
                      <button key={label} role="menuitem" onClick={() => { fn(); setExportOpenId(null); }} className="block w-full px-4 py-2.5 text-left text-sm text-slate-200 hover:bg-white/10">{label}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className={`flex-1 overflow-y-auto ${paperMode ? 'bg-slate-300' : 'bg-black/40'}`}>
            <div className="mx-auto flex max-w-6xl gap-10 px-1.5 py-2 md:px-8 md:py-8">
              {outline.length > 2 && (
                <aside className="sticky top-2 hidden h-fit max-h-[80vh] w-60 shrink-0 overflow-y-auto lg:block">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">On this page</p>
                  <ul className="space-y-1.5 border-l border-white/10">
                    {outline.map(o => (
                      <li key={o.id}>
                        <button onClick={() => jumpTo(o.id)} className={`block w-full truncate py-0.5 text-left text-sm text-slate-400 hover:text-white ${o.level === 3 ? 'pl-6' : 'pl-3'}`}>{o.text}</button>
                      </li>
                    ))}
                  </ul>
                </aside>
              )}
              <article id="reader-article" className={`mx-auto min-w-0 max-w-[794px] flex-1 ${fitMode ? '' : 'overflow-x-auto'} ${outline.length > 2 ? 'lg:mx-0' : ''}`}>
                {outline.length > 2 && (
                  <select
                    onChange={(e) => { if (e.target.value) jumpTo(e.target.value); e.target.value = ''; }}
                    defaultValue=""
                    aria-label="Jump to section"
                    className="mb-5 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-200 lg:hidden"
                  >
                    <option value="">Jump to section...</option>
                    {outline.filter(o => o.level < 3).map(o => <option key={o.id} value={o.id}>{o.text}</option>)}
                  </select>
                )}
                {renderNoteBody(readerNote, readerIdx)}
              </article>
              {/* hidden copy at real A4 width, only used to measure where the pages break */}
              <div ref={measureRef} aria-hidden="true" className="a4-measure md md-reader md-a4" style={{ '--md-scale': readerScale }} dangerouslySetInnerHTML={{ __html: renderMarkdown(readerNote.content) }} />
            </div>
          </div>
        </div>,
        document.body
      )}


      <div className="relative z-10 max-w-6xl mx-auto p-4 md:p-8 pb-20">
        
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link 
              to={`/folder/${folderId}`}
              className="w-10 h-10 rounded-xl bg-slate-800/50 backdrop-blur-sm border border-white/10 flex items-center justify-center hover:bg-slate-700 transition-colors"
            >
              <ArrowLeft size={20} className="text-slate-300" />
            </Link>
            <div>
              <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
                <FileText className="text-purple-400" size={24} /> 
                {folder.name}
              </h1>
              <p className="text-xs text-slate-400">Smart Note Mode</p>
            </div>
          </div>

          <div className="bg-slate-800/80 backdrop-blur-md px-4 py-2 rounded-full border border-purple-500/30 flex items-center gap-2 shadow-lg shadow-purple-900/20">
             <Coins size={16} className={`text-yellow-400 ${gCoinsAnimating ? 'animate-bounce' : ''}`} />
             <span className="font-mono font-bold">{gCoins}</span>
          </div>
        </header>

        {/* Generator Banner */}
        <motion.div 
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           className="bg-gradient-to-r from-purple-900/60 to-indigo-900/60 backdrop-blur-md border border-purple-500/30 rounded-2xl p-6 mb-8 flex flex-col md:flex-row justify-between items-center gap-4"
        >
           <div className="flex items-start gap-4">
              <div className="p-3 bg-purple-500/20 rounded-xl">
                 <Sparkles className="text-purple-300" size={24} />
              </div>
              <div>
                 <h2 className="font-bold text-lg">AI Notes Generator</h2>
                 <p className="text-sm text-purple-200/70 max-w-md">
                    Instantly create comprehensive study notes from your uploaded content. 
                    <span className="text-yellow-400 font-bold ml-1">Cost: 3 GC</span>
                 </p>
              </div>
           </div>
           <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
           <select
              value={noteLang}
              onChange={(e) => {
                setNoteLang(e.target.value);
                // shared with the AI Teacher setting, so chat answers follow it too
                try { localStorage.setItem('dwenliteVoicePrefs', JSON.stringify({ ...loadVoicePrefs(), language: e.target.value })); } catch { /* ignore */ }
              }}
              aria-label="Language"
              className="rounded-xl border border-white/20 bg-slate-900/60 px-3 py-3 text-sm text-white outline-none focus:border-purple-400"
           >
              {LANGUAGES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
           </select>
           <select
              value={noteTemplate}
              onChange={(e) => { setNoteTemplate(e.target.value); try { localStorage.setItem('dwenliteNoteTemplate', e.target.value); } catch { /* ignore */ } }}
              aria-label="Notes template"
              className="rounded-xl border border-white/20 bg-slate-900/60 px-3 py-3 text-sm text-white outline-none focus:border-purple-400"
           >
              <option value="auto">Auto-detect</option>
              <option value="meeting">Meeting or gathering</option>
              <option value="lecture">Lecture or study</option>
              <option value="sermon">Sermon or talk</option>
              <option value="interview">Interview</option>
              <option value="brief">Brief bullets</option>
           </select>
           <button
              onClick={handleGenerateNotes}
              disabled={notesLoading}
              className="w-full md:w-auto px-6 py-3 bg-white text-purple-900 rounded-xl font-bold hover:scale-105 active:scale-95 transition-all shadow-lg shadow-white/10 disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
           >
              {notesLoading ? (
                 <div className="w-5 h-5 border-2 border-purple-900 border-t-transparent rounded-full animate-spin" />
              ) : (
                 <> <Zap size={18} fill="currentColor" /> Generate Notes </>
              )}
           </button>
           </div>
        </motion.div>

        {genProgress && <div className="mb-8"><GenerationProgress progress={genProgress} /></div>}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* LEFT COLUMN: Notes List */}
            <div className="lg:col-span-2 space-y-6">
                
                {(folder.highlights || []).length > 0 && (
                <div className="mb-6 rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-6">
                    <div className="flex cursor-pointer items-center justify-between" onClick={() => setShowHighlights(v => !v)}>
                        <h3 className="flex items-center gap-2 text-lg font-semibold"><Highlighter size={20} className="text-yellow-400" /> Highlights ({folder.highlights.length})</h3>
                        {showHighlights ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </div>
                    {showHighlights && (
                        <ul className="mt-4 space-y-3">
                            {folder.highlights.map(h => (
                                <li key={h.id} className="flex items-start gap-3 rounded-xl border border-yellow-500/20 bg-slate-900/60 p-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm text-slate-200">"{h.text}"</p>
                                        <p className="mt-1 text-xs text-slate-500">{h.noteLabel}</p>
                                    </div>
                                    <button onClick={() => removeHighlight(h)} aria-label="Remove highlight" className="shrink-0 text-slate-500 hover:text-red-400"><Trash2 size={16} /></button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                )}

                <div className="bg-slate-800/30 backdrop-blur-sm border border-white/5 rounded-2xl p-6">
                    <div 
                        className="flex items-center justify-between cursor-pointer mb-6"
                        onClick={() => setShowStoredNotes(!showStoredNotes)}
                    >
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                           <FolderOpen size={20} className="text-slate-400" /> Stored Notes
                        </h3>
                        {showStoredNotes ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </div>

                    <AnimatePresence>
                        {showStoredNotes && (
                            <motion.div 
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="space-y-4 overflow-hidden"
                            >
                                {folder.notes.length === 0 && (
                                   <div className="text-center p-8 border-2 border-dashed border-slate-700 rounded-xl text-slate-500">
                                      <File size={32} className="mx-auto mb-2 opacity-50" />
                                      <p>No notes generated yet.</p>
                                   </div>
                                )}

                                {folder.notes.length > 0 && (
                                   <div className="relative">
                                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                      <input
                                         value={noteQuery}
                                         onChange={(e) => setNoteQuery(e.target.value)}
                                         placeholder="Search all your notes..."
                                         className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2.5 pl-9 pr-9 text-sm outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                                      />
                                      {noteQuery && (
                                         <button onClick={() => setNoteQuery('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                                            <X size={16} />
                                         </button>
                                      )}
                                   </div>
                                )}
                                {mergeSel.length >= 2 && (
                                   <div className="flex items-center justify-between gap-3 rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-2.5">
                                      <span className="text-sm text-purple-100">{mergeSel.length} notes selected</span>
                                      <div className="flex gap-2">
                                         <button onClick={() => setMergeSel([])} className="text-xs text-slate-400 hover:text-white">Clear</button>
                                         <button onClick={mergeSelected} disabled={mergeBusy} className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-semibold hover:bg-purple-500 disabled:opacity-50">
                                            {mergeBusy ? 'Merging...' : 'Merge into one note'}
                                         </button>
                                      </div>
                                   </div>
                                )}
                                {noteQuery.trim() && (
                                   <p className="text-xs text-slate-500">
                                      {visibleNotes.length} of {folder.notes.length} notes match "{noteQuery.trim()}"
                                   </p>
                                )}
                                {noteQuery.trim() && visibleNotes.length === 0 && (
                                   <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">
                                      No notes contain that. Try the AI chat: it can answer beyond your notes.
                                   </div>
                                )}

                                {visibleNotes.map(({ note, idx, snippet }) => (
                                    <motion.div 
                                      key={note.id}
                                      layout
                                      initial={{ opacity: 0, y: 10 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      className={`bg-slate-800/80 rounded-xl border transition-all duration-300 ${expandedGroups[note.id] ? 'border-purple-500/50 shadow-lg shadow-purple-900/10' : 'border-white/5 hover:border-purple-500/30'}`}
                                    >
                                        <div className="p-4 flex flex-col md:flex-row justify-between md:items-center gap-4">
                                            <div 
                                                className="flex-1 cursor-pointer"
                                                onClick={() => setReaderId(note.id)}
                                            >
                                                <h4 className="font-bold text-slate-200 flex flex-wrap items-center gap-x-2">
                                                   <input
                                                      type="checkbox"
                                                      checked={mergeSel.includes(note.id)}
                                                      onClick={(e) => e.stopPropagation()}
                                                      onChange={() => setMergeSel(sel => sel.includes(note.id) ? sel.filter(x => x !== note.id) : [...sel, note.id])}
                                                      aria-label={`Select Note ${idx + 1} to merge`}
                                                      className="h-4 w-4 accent-purple-500"
                                                   />
                                                   <span>Note {idx + 1}{note.title ? <span className="font-semibold text-white"> · {note.title}</span> : null}</span>
                                                   {note.label ? <span className="text-xs font-normal text-purple-300">({note.label})</span> : null}
                                                </h4>
                                                {note.tags?.length > 0 && (
                                                   <div className="mt-1.5 flex flex-wrap gap-1.5">
                                                      {note.tags.map(t => <span key={t} className="rounded-full bg-slate-700/70 px-2 py-0.5 text-[10px] text-slate-300">#{t}</span>)}
                                                   </div>
                                                )}
                                                <p className="text-xs text-slate-500 mt-1">Created: {new Date(note.createdAt).toLocaleDateString()}</p>
                                                {snippet && (
                                                   <p className="mt-2 text-xs text-slate-400 line-clamp-2">
                                                      {snippet.before}<mark className="rounded bg-yellow-400/30 px-0.5 text-yellow-100">{snippet.match}</mark>{snippet.after}
                                                   </p>
                                                )}
                                            </div>
                                            
                                            <div className="flex items-center gap-3">
                                                <div className="flex gap-1 bg-slate-900/50 p-1.5 rounded-lg border border-white/5">
                                                    {[1,2,3,4,5].map(star => (
                                                        <Star 
                                                            key={star} 
                                                            size={14} 
                                                            className={`cursor-pointer transition-colors ${ratings[note.id] >= star ? 'text-yellow-400 fill-yellow-400' : 'text-slate-600 hover:text-yellow-400'}`}
                                                            onClick={() => !hasRated[note.id] && handleRateNote(note.id, star)}
                                                        />
                                                    ))}
                                                </div>
                                                
                                                <div className="relative" data-export-menu>
                                                    <button
                                                        onClick={() => setExportOpenId(exportOpenId === note.id ? null : note.id)}
                                                        className="p-2 hover:bg-blue-500/20 text-slate-400 hover:text-blue-400 rounded-lg transition-colors"
                                                        title="Export"
                                                        aria-haspopup="menu"
                                                        aria-expanded={exportOpenId === note.id}
                                                    >
                                                        <Download size={16} />
                                                    </button>
                                                    {exportOpenId === note.id && (
                                                        <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-xl border border-white/10 bg-slate-900 shadow-2xl">
                                                            {[
                                                                ['PDF (.pdf)', () => handleDownloadPDF(note, idx)],
                                                                ['Word (.doc)', () => handleDownloadWord(note, idx)],
                                                                ['Markdown (.md)', () => handleDownloadMarkdown(note, idx)],
                                                            ].map(([label, fn]) => (
                                                                <button
                                                                    key={label}
                                                                    role="menuitem"
                                                                    onClick={() => { fn(); setExportOpenId(null); }}
                                                                    className="block w-full px-4 py-2.5 text-left text-sm text-slate-200 hover:bg-white/10"
                                                                >
                                                                    {label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>

                                                <button 
                                                    onClick={() => setReaderId(note.id)}
                                                    className="flex items-center gap-1.5 rounded-lg bg-purple-500/15 px-3 py-2 text-xs font-semibold text-purple-200 hover:bg-purple-500/25 transition-colors"
                                                    title="Open in full screen"
                                                >
                                                    <Maximize2 size={14} /> Open
                                                </button>
                                                
                                                <button 
                                                    onClick={() => handleDeleteNote(note.id)}
                                                    className="p-2 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg transition-colors"
                                                    title="Delete Note"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>

                                    </motion.div>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* RIGHT COLUMN: Chat AI */}
            <div className="lg:col-span-1">
                <div className="bg-slate-800/40 backdrop-blur-md border border-white/10 rounded-2xl flex flex-col h-[600px] sticky top-8">
                    <div className="p-4 border-b border-white/5 bg-slate-800/50 rounded-t-2xl flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <h3 className="font-bold flex items-center gap-2">DwenLite AI <span className="text-xs font-normal text-slate-400 px-2 py-0.5 bg-slate-700 rounded">Notes</span></h3>
                        <div className="ml-auto flex items-center gap-3"><AnswerLengthToggle /></div>
                        {chatHistory.length > 0 && (
                            <button onClick={clearChat} disabled={chatLoading} className="text-xs text-slate-400 hover:text-white disabled:opacity-40 transition-colors">New chat</button>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                        {chatHistory.length === 0 && (
                            <div className="text-center text-slate-500 mt-10 text-sm">
                                <MessageSquare size={32} className="mx-auto mb-2 opacity-50" />
                                <p>Ask me anything. I will search all your notes and add more.</p>
                            </div>
                        )}
                        
                        {chatHistory.map((msg, idx) => (
                            <motion.div 
                                key={idx} 
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className={`flex flex-col ${msg.type === 'user' ? 'items-end' : 'items-start'}`}
                            >
                                <div 
                                    className={`max-w-[85%] p-3 rounded-2xl text-sm ${
                                        msg.type === 'user' 
                                            ? 'bg-purple-600 text-white rounded-br-none' 
                                            : msg.type === 'system' 
                                                ? 'bg-transparent text-slate-500 italic text-xs w-full text-center border border-dashed border-slate-700' 
                                                : 'bg-slate-700 text-slate-200 rounded-bl-none'
                                    }`}
                                >
                                     {(msg.content.includes('DwenLite AI is typing') || msg.content.includes('DwenLite AI is reading')) ? (
                                        <div className="flex items-center gap-1">
                                            {msg.content.replace('...', '')}
                                            <span className="animate-bounce">.</span>
                                            <span className="animate-bounce delay-100">.</span>
                                            <span className="animate-bounce delay-200">.</span>
                                        </div>
                                      ) : (
                                        msg.type === 'ai' ? <ChatAnswer content={msg.content} typing={msg.typing} html={renderMarkdown(msg.content)} /> : <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                                      )}
                                </div>
                                
                                {msg.type === 'ai' && !msg.typing && !msg.content.includes('typing') && (
                                    <button 
                                        onClick={() => setShowReportForm(showReportForm === idx ? null : idx)}
                                        className="text-[10px] text-slate-500 mt-1 hover:text-red-400 flex items-center gap-1"
                                    >
                                        <AlertTriangle size={10} /> {showReportForm === idx ? 'Cancel' : 'Report'}
                                    </button>
                                )}

                                <AnimatePresence>
                                    {showReportForm === idx && (
                                        <motion.div 
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="w-full bg-slate-800 border border-red-500/30 rounded-lg p-3 mt-2 overflow-hidden"
                                        >
                                            <p className="text-xs text-red-300 mb-2">Report inappropriate content:</p>
                                            <textarea 
                                                value={reportReason}
                                                onChange={(e) => setReportReason(e.target.value)}
                                                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs mb-2 focus:border-red-500 outline-none"
                                                rows="2"
                                            />
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={() => handleReportContent(idx, reportReason)} 
                                                    disabled={reportLoading || !reportReason.trim()}
                                                    className="bg-red-500/20 text-red-400 text-xs px-3 py-1 rounded hover:bg-red-500/30 disabled:opacity-50"
                                                >
                                                    {reportLoading ? 'Sending...' : 'Submit'}
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        ))}
                        <FollowUpChips items={!chatLoading ? chatHistory[chatHistory.length - 1]?.followups : []} onPick={processQuestion} disabled={chatLoading} />
                        <div ref={chatEndRef} />
                    </div>

                    <div className="p-3 bg-slate-800/50 rounded-b-2xl border-t border-white/5">
                        <form onSubmit={handleChatSubmit} className="flex gap-2">
                                <input 
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    placeholder="Type a question..." 
                                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all"
                                    disabled={chatLoading}
                                />
                                <button 
                                    type="submit" 
                                    disabled={chatLoading || !chatInput.trim()}
                                    className="p-2 bg-purple-600 hover:bg-purple-500 rounded-xl text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    <Send size={18} />
                                </button>
                            </form>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </>
  );
}

export default Notes;