import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { db, auth } from '../firebase';
import { doc, getDoc, updateDoc, addDoc, collection, setDoc, query, where, getDocs, arrayUnion } from 'firebase/firestore';
import toast from 'react-hot-toast';
import axios from 'axios';
import jsPDF from 'jspdf';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, Zap, Coins, ChevronLeft, ChevronRight, 
  MessageSquare, Send, AlertTriangle, Trash2, Star, ChevronDown, 
  ChevronUp, Sparkles, FolderOpen, FileText, Download, File, Highlighter
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
    const html = marked(enhancedContent);
    return DOMPurify.sanitize(html);
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
      const maxAttempts = 30;
      let attempts = 0;

      while (status !== 'completed' && status !== 'error' && attempts < maxAttempts) {
        const checkResponse = await axios.get(
          `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
          { headers: { Authorization: `Bearer ${apiKey}` } }
        );
        status = checkResponse.data.status;
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
      const maxAttempts = 60;
      let attempts = 0;

      while (status !== 'completed' && status !== 'error' && attempts < maxAttempts) {
        const checkResponse = await axios.get(
          `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
          { headers: { Authorization: `Bearer ${apiKey}` } }
        );
        status = checkResponse.data.status;
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

      // UPDATED PROMPT: Explicitly requests structure for NEW notes
      const prompt = `Generate comprehensive study notes based on the following content: "${context}". 
      
      Formatting Rules:
      1. Headings: Use # for title, ## for main sections.
      2. Highlights: Use > for key definitions, warnings, or important takeaways.
      3. Lists: Use - for bullet points.
      4. Keywords: Use **bold** for vocabulary.
      5. Do not include intro text. Just the notes.`;

      const response = await axios.post(functionUrl, { prompt })
        .catch(err => {
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
    try {
      const newNote = await generateContent();
      const folderRef = doc(db, 'folders', folderId);
      await updateDoc(folderRef, { notes: arrayUnion(newNote) });
      await deductGCoins(auth.currentUser.uid, 3);

      setFolder(prev => ({ ...prev, notes: [...prev.notes, newNote] }));
      setRatings(prev => ({ ...prev, [newNote.id]: newNote.rating }));
      setHasRated(prev => ({ ...prev, [newNote.id]: false }));
      toast.success('Notes generated successfully! 3 G_COINS deducted.');
      
      setExpandedGroups(prev => ({ ...prev, [newNote.id]: true }));
    } catch (err) { toast.error(err.message); } 
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

  const handleDownloadPDF = (note) => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 10;
      const maxWidth = pageWidth - 2 * margin;

      doc.setFontSize(16);
      doc.text(`Notes (Created: ${new Date(note.createdAt).toLocaleDateString()})`, margin, 20);

      doc.setFontSize(12);
      const cleanContent = note.content.replace(/[*#`>]/g, '');
      const splitText = doc.splitTextToSize(cleanContent, maxWidth);
      let y = 30;
      splitText.forEach(line => {
        if (y > doc.internal.pageSize.getHeight() - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(line, margin, y);
        y += 7;
      });

      doc.save(`notes_${note.id}.pdf`);
      toast.success('PDF downloaded successfully!');
    } catch (err) {
      console.error('PDF generation error:', err);
      toast.error('Failed to generate PDF. Please try again.');
    }
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

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const question = chatInput.trim();
    setChatInput('');

    const noteRegex = /(?:reference|check|use|from)\s*(?:note\s*)(\d+|one|two|three|four|five)/i;
    const match = question.match(noteRegex);
    let noteIndex = null;

    if (match) {
      const noteRef = match[1].toLowerCase();
      const numberWords = ['one', 'two', 'three', 'four', 'five'];
      if (numberWords.includes(noteRef)) {
        noteIndex = numberWords.indexOf(noteRef);
      } else if (!isNaN(parseInt(noteRef))) {
        noteIndex = parseInt(noteRef) - 1;
      }
    }

    if (noteIndex !== null && folder.notes[noteIndex]) {
      const selectedNote = folder.notes[noteIndex];
      await processQuestion(question, selectedNote);
    } else if (folder.notes.length === 0) {
      toast.error('No notes available to reference.');
      return;
    } else {
      setShowNotePrompt(true);
      setChatHistory(prev => [
        ...prev,
        { type: 'user', content: question },
        { type: 'system', content: 'Please select a note to reference for this question.' },
      ]);
      setSelectedNoteId('');
    }
  };

  const handleNoteSelection = async () => {
    if (!selectedNoteId) { toast.error('Please select a note.'); return; }

    const selectedNote = folder.notes.find(note => note.id === selectedNoteId);
    if (!selectedNote) { toast.error('Selected note not found.'); return; }

    const lastQuestion = chatHistory.findLast(item => item.type === 'user')?.content;
    if (!lastQuestion) { toast.error('No question found to process.'); return; }

    setShowNotePrompt(false);
    await processQuestion(lastQuestion, selectedNote);
  };

  const processQuestion = async (question, note) => {
    setChatLoading(true);
    try {
      const noteIndex = folder.notes.findIndex(n => n.id === note.id) + 1;
      setChatHistory(prev => [...prev, { type: 'system', content: `DwenLite AI is reading Note ${noteIndex}...` }]);
      await new Promise(resolve => setTimeout(resolve, 1500));

      const functionUrl = 'https://us-central1-leumas-decipher-softwares.cloudfunctions.net/generateNotesProxy';
      const prompt = `You are DwenLite AI, an assistant that answers questions based on provided notes. Here is the content of the note:\n\n${note.content}\n\nQuestion: ${question}\n\nProvide a clear, concise, and accurate answer based on the note. If the question cannot be answered from the note, state so and provide a brief explanation. Format with Markdown (bold, list).`;

      setChatHistory(prev => [...prev, { type: 'system', content: 'DwenLite AI is typing...' }]);
      await new Promise(resolve => setTimeout(resolve, 1000));

      const response = await axios.post(functionUrl, { prompt });
      let answer;
      if (response.data.choices?.[0]?.message?.content) answer = response.data.choices[0].message.content.trim();
      else if (response.data.choices?.[0]?.text) answer = response.data.choices[0].text.trim();
      else throw new Error('Invalid DwenLite API response: No answer found.');

      setChatHistory(prev => prev.filter(item => item.content !== 'DwenLite AI is typing...' && item.content !== `DwenLite AI is reading Note ${noteIndex}...`).concat({
        type: 'ai',
        content: answer,
      }));

    } catch (err) {
      console.error('Error processing question:', err);
      toast.error(err.message);
      setChatHistory(prev => prev.filter(item => item.content !== 'DwenLite AI is typing...'));
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

  return (
    <>

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
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* LEFT COLUMN: Notes List */}
            <div className="lg:col-span-2 space-y-6">
                
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
                                
                                {folder.notes.map((note, idx) => (
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
                                                onClick={() => handleToggleGroup(note.id)}
                                            >
                                                <h4 className="font-bold text-slate-200 flex items-center gap-2">
                                                   Note {idx + 1}
                                                </h4>
                                                <p className="text-xs text-slate-500 mt-1">Created: {new Date(note.createdAt).toLocaleDateString()}</p>
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
                                                
                                                <button 
                                                    onClick={() => handleDownloadPDF(note)}
                                                    className="p-2 hover:bg-blue-500/20 text-slate-400 hover:text-blue-400 rounded-lg transition-colors"
                                                    title="Download PDF"
                                                >
                                                    <Download size={16} />
                                                </button>

                                                <button 
                                                    onClick={() => handleToggleGroup(note.id)}
                                                    className="p-2 hover:bg-white/10 rounded-lg text-slate-400 transition-colors"
                                                >
                                                    {expandedGroups[note.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
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

                                        <AnimatePresence>
                                            {expandedGroups[note.id] && (
                                                <motion.div 
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    className="border-t border-white/5 bg-slate-900/30 px-6 py-6"
                                                >
                                                    {/* STYLED CONTENT VIEWER */}
                                                    <div 
                                                       className="prose prose-invert prose-sm max-w-none 
                                                       prose-headings:text-purple-300 prose-headings:font-bold prose-headings:mb-2 prose-headings:mt-4
                                                       prose-h3:text-lg 
                                                       prose-p:text-slate-300 prose-p:leading-relaxed prose-p:mb-4
                                                       prose-strong:text-white prose-strong:font-bold prose-strong:bg-white/5 prose-strong:px-1 prose-strong:rounded
                                                       prose-ul:list-disc prose-ul:pl-5 prose-li:text-slate-300 prose-li:mb-1
                                                       prose-blockquote:border-l-4 prose-blockquote:border-purple-500 prose-blockquote:bg-purple-900/20 prose-blockquote:pl-4 prose-blockquote:py-2 prose-blockquote:my-4 prose-blockquote:italic prose-blockquote:text-purple-100 prose-blockquote:rounded-r-lg"
                                                       dangerouslySetInnerHTML={{ __html: renderMarkdown(note.content) }}
                                                    />
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
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
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                        {chatHistory.length === 0 && (
                            <div className="text-center text-slate-500 mt-10 text-sm">
                                <MessageSquare size={32} className="mx-auto mb-2 opacity-50" />
                                <p>Ask me anything about your notes!</p>
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
                                        <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                                      )}
                                </div>
                                
                                {msg.type === 'ai' && !msg.content.includes('typing') && (
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
                        <div ref={chatEndRef} />
                    </div>

                    <div className="p-3 bg-slate-800/50 rounded-b-2xl border-t border-white/5">
                        {showNotePrompt ? (
                            <div className="flex flex-col gap-2 animate-fade-in">
                                <select 
                                    value={selectedNoteId}
                                    onChange={(e) => setSelectedNoteId(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm focus:border-purple-500 outline-none"
                                >
                                    <option value="">Select context...</option>
                                    {folder.notes.map((n, i) => (
                                        <option key={n.id} value={n.id}>Note {i+1} ({new Date(n.createdAt).toLocaleDateString()})</option>
                                    ))}
                                </select>
                                <button 
                                    onClick={handleNoteSelection}
                                    className="w-full bg-purple-600 hover:bg-purple-500 text-white py-2 rounded-lg text-sm"
                                >
                                    Confirm Context
                                </button>
                            </div>
                        ) : (
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
                        )}
                    </div>
                </div>
            </div>
        </div>
      </div>
    </>
  );
}

export default Notes;