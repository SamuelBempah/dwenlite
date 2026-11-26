import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { db, auth, storage } from '../firebase';
import { ref as storageRef, getDownloadURL } from 'firebase/storage';
import { uploadWithProgress } from '../lib/uploadManager';
import { doc, getDoc, updateDoc, addDoc, collection, setDoc, query, where, getDocs } from 'firebase/firestore';
import toast from 'react-hot-toast';
import axios from 'axios';
import { askStudyChat, buildFolderContext } from '../lib/ai';
import FollowUpChips from '../components/FollowUpChips';
import AnswerLengthToggle from '../components/AnswerLengthToggle';
import { useChatMemory } from '../lib/chatMemory';
import { isDue, nextSrs, intervalLabel } from '../lib/srs';
import { recordStudy } from '../lib/streak';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, Zap, Coins, Brain, RotateCw, ChevronLeft, ChevronRight, 
  MessageSquare, Send, AlertTriangle, Trash2, Star, ChevronDown, 
  ChevronUp, Sparkles, FolderOpen, MoreVertical 
} from 'lucide-react';

function Flashcards() {
  const { folderId } = useParams();
  const navigate = useNavigate();

  // --- ORIGINAL STATE MANAGEMENT ---
  const [folder, setFolder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [flashcardsLoading, setFlashcardsLoading] = useState(false);
  const [currentFlashcardIndex, setCurrentFlashcardIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [dueOnly, setDueOnly] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const imageInputRef = useRef(null);
  const [reverseCards, setReverseCards] = useState(() => {
    try { return localStorage.getItem('dwenliteReverseCards') === '1'; } catch { return false; }
  });
  const [showStoredFlashcards, setShowStoredFlashcards] = useState(false);
  const [selectedFlashcardGroup, setSelectedFlashcardGroup] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [chatInput, setChatInput] = useState('');
  const [selectedFlashcardGroupId, setSelectedFlashcardGroupId] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [showFlashcardGroupPrompt, setShowFlashcardGroupPrompt] = useState(false);
  const [showReportForm, setShowReportForm] = useState(null);
  const [reportReason, setReportReason] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [gCoins, setGCoins] = useState(0);
  const [gCoinsAnimating, setGCoinsAnimating] = useState(false);
  const [ratings, setRatings] = useState({});
  const [ratingLoading, setRatingLoading] = useState({});
  const [hasRated, setHasRated] = useState({});
  
  const chatEndRef = useRef(null);
  const { clearChat } = useChatMemory({ folder, folderId, kind: 'flashcards', chatHistory, setChatHistory });

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, showReportForm]);

  // --- ORIGINAL LOGIC & EFFECTS ---
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
      const hasRatedGroups = {};
      ratingsSnap.forEach(doc => {
        const data = doc.data();
        userRatings[data.flashcardGroupId] = data.rating;
        hasRatedGroups[data.flashcardGroupId] = true;
      });
      setRatings(userRatings);
      setHasRated(hasRatedGroups);
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

      folderData.flashcardGroups = folderData.flashcardGroups || [];
      folderData.documents = folderData.documents || [];
      folderData.flashcardGroups = folderData.flashcardGroups.map(group => ({
        ...group,
        rating: group.rating || 0
      }));
      setFolder(folderData);
      setLoading(false);
    } catch (err) {
      console.error('Fetch folder error:', err);
      toast.error('Failed to fetch folder. Please try again.');
      setLoading(false);
      navigate('/dashboard');
    }
  };

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

      const prompt = `Generate 20 flashcards based on the following content: "${context}". Each flashcard should have a question and an answer. Format as a JSON array: [{ "question": "...", "answer": "..." }, ...]. Return only the JSON array string, without any markdown, code block markers (like \`\`\`json), or additional text. Ensure the output is valid JSON.`;

      const response = await axios.post(functionUrl, { prompt });
      
      let generatedText;
      if (response.data.choices?.[0]?.message?.content) generatedText = response.data.choices[0].message.content.trim();
      else if (response.data.choices?.[0]?.text) generatedText = response.data.choices[0].text.trim();
      else throw new Error('Invalid API response: No generated content found.');

      generatedText = generatedText.replace(/```json/g, '').replace(/```/g, '').replace(/^\s*[\w\s]*?(\[.*\])\s*[\w\s]*$/s, '$1').trim();

      let flashcards;
      try { flashcards = JSON.parse(generatedText); } 
      catch (parseErr) { console.error('JSON parse error:', parseErr); throw new Error('Failed to parse flashcard data. Please try again.'); }

      if (!Array.isArray(flashcards)) throw new Error('API response must be a JSON array.');

      return flashcards.map(card => ({ id: Date.now().toString() + Math.random().toString(36).substring(2), ...card }));
    } catch (err) {
      console.error('Error generating flashcards:', err);
      throw new Error(err.message);
    }
  };

  const handleGenerateFlashcards = async () => {
    if (!auth.currentUser) { toast.error('Please log in to generate flashcards.'); return; }
    if (gCoins < 3) {
      toast.error(
        <div>
          Insufficient G_COINS. You need 3 G_COINS to generate flashcards.{' '}
          <Link to="/buy-coins" className="underline text-purple-400 hover:text-purple-300">Buy more G_COINS</Link>.
        </div>,
        { duration: 5000 }
      );
      return;
    }

    setFlashcardsLoading(true);
    try {
      const newFlashcards = await generateContent();
      const newFlashcardGroup = {
        id: Date.now().toString(),
        flashcards: newFlashcards,
        createdAt: new Date().toISOString(),
        rating: 0
      };

      const folderRef = doc(db, 'folders', folderId);
      const updatedFlashcardGroups = [...(folder.flashcardGroups || []), newFlashcardGroup];
      await updateDoc(folderRef, { flashcardGroups: updatedFlashcardGroups });
      await deductGCoins(auth.currentUser.uid, 3);

      setFolder(prev => ({ ...prev, flashcardGroups: updatedFlashcardGroups }));
      setRatings(prev => ({ ...prev, [newFlashcardGroup.id]: newFlashcardGroup.rating }));
      setHasRated(prev => ({ ...prev, [newFlashcardGroup.id]: false }));
      toast.success('New flashcard group generated successfully! 3 G_COINS deducted.');
      setSelectedFlashcardGroup(newFlashcardGroup);
      setCurrentFlashcardIndex(0);
      setShowAnswer(false);
    } catch (err) { toast.error(err.message); } 
    finally { setFlashcardsLoading(false); }
  };

  const handleDeleteFlashcardGroup = async (groupId) => {
    try {
      const folderRef = doc(db, 'folders', folderId);
      const updatedFlashcardGroups = folder.flashcardGroups.filter(group => group.id !== groupId);
      await updateDoc(folderRef, { flashcardGroups: updatedFlashcardGroups });

      setFolder(prev => ({ ...prev, flashcardGroups: updatedFlashcardGroups }));
      setRatings(prev => { const newRatings = { ...prev }; delete newRatings[groupId]; return newRatings; });
      setHasRated(prev => { const newHasRated = { ...prev }; delete newHasRated[groupId]; return newHasRated; });

      if (selectedFlashcardGroup?.id === groupId) {
        setSelectedFlashcardGroup(null);
        setCurrentFlashcardIndex(0);
        setShowAnswer(false);
      }
      toast.success('Flashcard group deleted successfully!');
    } catch (err) {
      console.error('Error deleting flashcard group:', err);
      toast.error('Failed to delete flashcard group. Please try again.');
    }
  };

  const handleRateFlashcardGroup = async (groupId, rating) => {
    if (!auth.currentUser) { toast.error('Please log in to rate flashcard groups.'); return; }
    if (hasRated[groupId]) { toast.error('You have already rated this flashcard group.'); return; }

    setRatingLoading(prev => ({ ...prev, [groupId]: true }));
    try {
      const folderRef = doc(db, 'folders', folderId);
      const updatedFlashcardGroups = folder.flashcardGroups.map(group => 
        group.id === groupId ? { ...group, rating } : group
      );

      await updateDoc(folderRef, { flashcardGroups: updatedFlashcardGroups });
      setFolder(prev => ({ ...prev, flashcardGroups: updatedFlashcardGroups }));
      setRatings(prev => ({ ...prev, [groupId]: rating }));
      setHasRated(prev => ({ ...prev, [groupId]: true }));

      await addDoc(collection(db, 'ratings'), {
        userId: auth.currentUser.uid,
        folderId,
        flashcardGroupId: groupId,
        rating,
        createdAt: new Date().toISOString(),
      });
      toast.success('Rating submitted successfully!');
    } catch (err) {
      console.error('Rate flashcard group error:', err);
      toast.error('Failed to submit rating. Please try again.');
    } finally {
      setRatingLoading(prev => ({ ...prev, [groupId]: false }));
    }
  };

  const handleSelectFlashcardGroup = (group) => {
    setSelectedFlashcardGroup(group);
    setCurrentFlashcardIndex(0);
    setShowAnswer(false);
  };

  const handleToggleGroup = (groupId) => {
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const handleToggleAnswer = () => {
    setShowAnswer(prev => !prev);
  };

  const handleNextFlashcard = () => {
    setShowAnswer(false);
    setCurrentFlashcardIndex(prev => prev + 1);
  };

  const handlePreviousFlashcard = () => {
    setShowAnswer(false);
    setCurrentFlashcardIndex(prev => Math.max(0, prev - 1));
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
    if (!chatInput.trim() || chatLoading) return;
    const question = chatInput.trim();
    setChatInput('');
    await processQuestion(question);
  };

  // The AI reads every flashcard group, note and document in the folder and may go beyond them.
  const processQuestion = async (question) => {
    const priorHistory = chatHistory;
    setChatHistory(prev => [...prev, { type: 'user', content: question }, { type: 'system', content: 'DwenLite AI is typing...' }]);
    setChatLoading(true);
    try {
      const { text: answer, followups } = await askStudyChat({ context: buildFolderContext(folder), history: priorHistory, question, kind: 'flashcards' });
      setChatHistory(prev => prev.filter(item => item.content !== 'DwenLite AI is typing...').concat({ type: 'ai', content: answer, followups }));
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

  const allCards = selectedFlashcardGroup?.flashcards || [];
  const dueCount = allCards.filter(c => isDue(c)).length;
  const cards = dueOnly ? allCards.filter(c => isDue(c)) : allCards;
  const currentFlashcard = cards[currentFlashcardIndex];
  // Reverse mode: you see the answer and recall the question.
  const frontText = reverseCards ? currentFlashcard?.answer : currentFlashcard?.question;
  const backText = reverseCards ? currentFlashcard?.question : currentFlashcard?.answer;

  // One deck with every card that is due today, from all groups in this folder.
  const dueAcrossGroups = (folder.flashcardGroups || []).flatMap(g => (g.flashcards || []).filter(c => isDue(c)).map(c => ({ ...c, _g: g.id })));
  const startDailyReview = () => {
    if (!dueAcrossGroups.length) return;
    setSelectedFlashcardGroup({ id: '__due__', name: 'Daily review', flashcards: dueAcrossGroups });
    setDueOnly(true);
    setCurrentFlashcardIndex(0);
    setShowAnswer(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Save how well the student knew this card; spaced repetition schedules the next review.
  // Save changes to the card on screen (schedule, image...) in the right group, also in the mixed deck.
  const persistCardPatch = (patch) => {
    if (!currentFlashcard || !selectedFlashcardGroup) return;
    const isMixed = selectedFlashcardGroup.id === '__due__';
    const realGroupId = isMixed ? currentFlashcard._g : selectedFlashcardGroup.id;
    const realGroup = folder.flashcardGroups.find(g => g.id === realGroupId);
    if (!realGroup) return;
    const realIdx = isMixed
      ? realGroup.flashcards.findIndex(c => c.question === currentFlashcard.question && c.answer === currentFlashcard.answer)
      : realGroup.flashcards.indexOf(currentFlashcard);
    const updatedReal = {
      ...realGroup,
      flashcards: realGroup.flashcards.map((c, i) => (i === realIdx ? { ...c, ...patch } : c)),
    };
    const groups = folder.flashcardGroups.map(g => (g.id === updatedReal.id ? updatedReal : g));
    setFolder(prev => ({ ...prev, flashcardGroups: groups }));

    if (isMixed) {
      const cardIdx = allCards.indexOf(currentFlashcard);
      setSelectedFlashcardGroup({
        ...selectedFlashcardGroup,
        flashcards: allCards.map((c, i) => (i === cardIdx ? { ...c, ...patch } : c)),
      });
    } else {
      setSelectedFlashcardGroup(updatedReal);
    }
    updateDoc(doc(db, 'folders', folderId), { flashcardGroups: groups })
      .catch(() => toast.error('Could not save your changes.'));
  };

  const handleRateCard = (grade) => {
    if (!currentFlashcard || !selectedFlashcardGroup) return;
    recordStudy();
    persistCardPatch({ srs: nextSrs(currentFlashcard.srs, grade) });
    setShowAnswer(false);
    // In "due only" mode the rated card leaves the list, so the next card slides into this spot.
    if (!dueOnly) setCurrentFlashcardIndex(i => i + 1);
  };

  // Shrinks a photo to about 900px so it loads fast and costs almost nothing to store.
  const compressImage = (file) => new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 900 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => (b ? resolve(b) : reject(new Error('Could not process the image.'))), 'image/jpeg', 0.8);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image. Try a JPG or PNG.')); };
    img.src = url;
  });

  const handleCardImage = async (file) => {
    if (!file || imageBusy) return;
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image.'); return; }
    if (file.size > 15 * 1024 * 1024) { toast.error('That image is too large (15 MB max).'); return; }
    setImageBusy(true);
    try {
      const blob = await compressImage(file);
      const r = storageRef(storage, `documents/${folderId}/card_${Date.now()}.jpg`);
      await uploadWithProgress(r, blob, { name: file.name || 'card image' });
      persistCardPatch({ imageUrl: await getDownloadURL(r) });
      toast.success('Image added to the card');
    } catch (err) {
      toast.error(err.message || 'Could not add the image.');
    } finally {
      setImageBusy(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

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
                <Brain className="text-purple-400" size={24} /> 
                {folder.name}
              </h1>
              <p className="text-xs text-slate-400">Flashcard Study Mode</p>
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
                 <h2 className="font-bold text-lg">AI Flashcard Generator</h2>
                 <p className="text-sm text-purple-200/70 max-w-md">
                    Instantly create study cards from your documents, audio, or video notes. 
                    <span className="text-yellow-400 font-bold ml-1">Cost: 3 GC</span>
                 </p>
              </div>
           </div>
           <button
              onClick={handleGenerateFlashcards}
              disabled={flashcardsLoading}
              className="w-full md:w-auto px-6 py-3 bg-white text-purple-900 rounded-xl font-bold hover:scale-105 active:scale-95 transition-all shadow-lg shadow-white/10 disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
           >
              {flashcardsLoading ? (
                 <div className="w-5 h-5 border-2 border-purple-900 border-t-transparent rounded-full animate-spin" />
              ) : (
                 <> <Zap size={18} fill="currentColor" /> Generate </>
              )}
           </button>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* LEFT COLUMN: Study Area */}
            <div className="lg:col-span-2 space-y-6">
                
                {/* Daily review across every group in this folder */}
                {folder.flashcardGroups.length > 0 && (
                   <button
                      onClick={startDailyReview}
                      disabled={dueAcrossGroups.length === 0}
                      className="flex w-full items-center justify-between rounded-2xl border border-purple-500/30 bg-purple-500/10 px-5 py-4 text-left hover:bg-purple-500/20 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                   >
                      <span>
                         <span className="block font-bold">Daily review</span>
                         <span className="block text-xs text-slate-400">
                            {dueAcrossGroups.length > 0 ? 'Cards due today from all your groups in one deck' : 'Nothing due right now. Nice work!'}
                         </span>
                      </span>
                      <span className="rounded-full bg-purple-600 px-3 py-1 text-sm font-bold">{dueAcrossGroups.length}</span>
                   </button>
                )}

                {/* Active Flashcard Stage */}
                <div className="relative">
                   {!selectedFlashcardGroup ? (
                      <div className="aspect-[16/9] bg-slate-800/30 border-2 border-dashed border-slate-700 rounded-3xl flex flex-col items-center justify-center text-slate-500 p-8 text-center">
                         <FolderOpen size={48} className="mb-4 opacity-50" />
                         <p className="text-lg font-medium">No Collection Selected</p>
                         <p className="text-sm">Choose a flashcard group from the list below or generate a new one.</p>
                      </div>
                   ) : currentFlashcardIndex >= cards.length ? (
                      <div className="aspect-[16/9] bg-slate-800/50 backdrop-blur-md border border-white/5 rounded-3xl flex flex-col items-center justify-center text-center p-8">
                         <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mb-6">
                            <Star size={40} className="text-green-400" fill="currentColor" />
                         </div>
                         <h2 className="text-2xl font-bold mb-2">Great Job!</h2>
                         <p className="text-slate-400 mb-6">{dueOnly ? 'No more cards are due right now. Come back later for your next review.' : "You've reviewed all cards in this group."}</p>
                         <button 
                            onClick={() => { setCurrentFlashcardIndex(0); setShowAnswer(false); }}
                            className="px-6 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                         >
                            Restart Review
                         </button>
                      </div>
                   ) : (
                      <>
                        <div className="flex items-center justify-between gap-3 mb-3 px-2">
                            <div className="inline-flex rounded-full bg-slate-800 p-1 text-xs font-medium">
                                <button
                                    onClick={() => { setDueOnly(false); setCurrentFlashcardIndex(0); setShowAnswer(false); }}
                                    className={`px-3 py-1.5 rounded-full transition-colors ${!dueOnly ? 'bg-purple-600 text-white' : 'text-slate-400'}`}
                                >
                                    All cards
                                </button>
                                <button
                                    onClick={() => { setDueOnly(true); setCurrentFlashcardIndex(0); setShowAnswer(false); }}
                                    className={`px-3 py-1.5 rounded-full transition-colors ${dueOnly ? 'bg-purple-600 text-white' : 'text-slate-400'}`}
                                >
                                    Due today ({dueCount})
                                </button>
                            </div>
                            <button
                                onClick={() => { setReverseCards(v => { try { localStorage.setItem('dwenliteReverseCards', v ? '0' : '1'); } catch { /* ignore */ } return !v; }); setShowAnswer(false); }}
                                aria-pressed={reverseCards}
                                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${reverseCards ? 'border-purple-500 bg-purple-600/30 text-purple-200' : 'border-slate-700 text-slate-400 hover:text-white'}`}
                            >
                                Reverse cards
                            </button>
                        </div>
                        <div className="flex justify-between items-center mb-4 px-2">
                            <span className="text-sm font-mono text-purple-400">
                                Card {currentFlashcardIndex + 1} / {cards.length}
                            </span>
                            <div className="h-2 flex-1 mx-4 bg-slate-800 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-purple-500 transition-all duration-300" 
                                    style={{ width: `${((currentFlashcardIndex + 1) / Math.max(cards.length, 1)) * 100}%` }}
                                />
                            </div>
                        </div>

                        {/* The 3D Card - FIXED VERSION */}
                        <div className="perspective-1000 w-full aspect-[1.6/1] md:aspect-[2/1] relative cursor-pointer group" onClick={handleToggleAnswer}>
                            <motion.div
                                initial={false}
                                animate={{ rotateY: showAnswer ? 180 : 0 }}
                                transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
                                className="w-full h-full relative"
                                style={{ transformStyle: "preserve-3d" }}
                            >
                                {/* Front (Question) */}
                                <div 
                                    className="absolute inset-0 bg-slate-800 border border-white/10 rounded-3xl p-8 md:p-12 flex flex-col items-center justify-center text-center shadow-2xl shadow-black/50"
                                    style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                                >
                                    <h3 className="text-sm text-purple-400 font-bold uppercase tracking-wider mb-4">{reverseCards ? 'Answer' : 'Question'}</h3>
                                    {currentFlashcard.imageUrl && (
                                        <img src={currentFlashcard.imageUrl} alt="" className="mb-3 max-h-28 md:max-h-40 rounded-xl object-contain" />
                                    )}
                                    <p className="text-xl md:text-3xl font-medium leading-relaxed overflow-y-auto max-h-[80%] scrollbar-hide">{frontText}</p>
                                    <div className="absolute bottom-6 text-xs text-slate-500 flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                                        <RotateCw size={12} /> Click to flip
                                    </div>
                                </div>

                                {/* Back (Answer) */}
                                <div 
                                    className="absolute inset-0 bg-gradient-to-br from-purple-900 to-slate-900 border border-purple-500/30 rounded-3xl p-8 md:p-12 flex flex-col items-center justify-center text-center shadow-2xl shadow-purple-900/20"
                                    style={{ 
                                        transform: "rotateY(180deg)", 
                                        backfaceVisibility: 'hidden', 
                                        WebkitBackfaceVisibility: 'hidden' 
                                    }}
                                >
                                    <h3 className="text-sm text-green-400 font-bold uppercase tracking-wider mb-4">{reverseCards ? 'Question' : 'Answer'}</h3>
                                    <p className="text-xl md:text-2xl font-medium leading-relaxed text-slate-100 overflow-y-auto max-h-[80%] scrollbar-hide">{backText}</p>
                                </div>
                            </motion.div>
                        </div>

                        {/* Controls */}
                        <div className="flex items-center justify-center gap-4 mt-8">
                            <button 
                                onClick={(e) => { e.stopPropagation(); handlePreviousFlashcard(); }}
                                disabled={currentFlashcardIndex === 0 || flashcardsLoading}
                                className="w-12 h-12 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                            >
                                <ChevronLeft size={24} />
                            </button>

                            <button
                                onClick={(e) => { e.stopPropagation(); handleToggleAnswer(); }}
                                className="px-8 py-3 bg-purple-600 hover:bg-purple-500 rounded-xl font-semibold shadow-lg shadow-purple-900/40 transition-all active:scale-95"
                            >
                                {showAnswer ? 'Hide Answer' : 'Show Answer'}
                            </button>

                            <button 
                                onClick={(e) => { e.stopPropagation(); handleNextFlashcard(); }}
                                disabled={flashcardsLoading}
                                className="w-12 h-12 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center hover:bg-slate-700 transition-all"
                            >
                                <ChevronRight size={24} />
                            </button>
                        </div>

                        <div className="mt-4 flex items-center justify-center gap-4 text-xs">
                            <input
                                ref={imageInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => handleCardImage(e.target.files?.[0])}
                            />
                            <button
                                onClick={(e) => { e.stopPropagation(); imageInputRef.current?.click(); }}
                                disabled={imageBusy}
                                className="text-slate-400 hover:text-white disabled:opacity-50 transition-colors"
                            >
                                {imageBusy ? 'Adding image...' : currentFlashcard.imageUrl ? 'Change image' : 'Add image'}
                            </button>
                            {currentFlashcard.imageUrl && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); persistCardPatch({ imageUrl: null }); }}
                                    className="text-slate-500 hover:text-red-400 transition-colors"
                                >
                                    Remove image
                                </button>
                            )}
                        </div>

                        {/* How well did you know it? */}
                        {showAnswer && (
                            <div className="mt-6 grid grid-cols-4 gap-2 sm:gap-3">
                                {[
                                    { g: 0, label: 'Again', color: 'bg-red-500/15 text-red-300 border-red-500/30 hover:bg-red-500/25' },
                                    { g: 1, label: 'Hard', color: 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25' },
                                    { g: 2, label: 'Good', color: 'bg-green-500/15 text-green-300 border-green-500/30 hover:bg-green-500/25' },
                                    { g: 3, label: 'Easy', color: 'bg-blue-500/15 text-blue-300 border-blue-500/30 hover:bg-blue-500/25' },
                                ].map(({ g, label, color }) => (
                                    <button
                                        key={g}
                                        onClick={(e) => { e.stopPropagation(); handleRateCard(g); }}
                                        className={`flex flex-col items-center rounded-xl border py-2.5 text-sm font-semibold transition-colors ${color}`}
                                    >
                                        {label}
                                        <span className="text-[11px] font-normal opacity-70">{intervalLabel(currentFlashcard.srs, g)}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                      </>
                   )}
                </div>

                {/* Stored Groups List */}
                <div className="bg-slate-800/30 backdrop-blur-sm border border-white/5 rounded-2xl p-6">
                    <div 
                        className="flex items-center justify-between cursor-pointer mb-4"
                        onClick={() => setShowStoredFlashcards(!showStoredFlashcards)}
                    >
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                           <FolderOpen size={20} className="text-slate-400" /> Collection Library
                        </h3>
                        {showStoredFlashcards ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </div>

                    <AnimatePresence>
                        {showStoredFlashcards && (
                            <motion.div 
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden space-y-3"
                            >
                                {folder.flashcardGroups.length === 0 && <p className="text-slate-500 italic">No stored groups.</p>}
                                {folder.flashcardGroups.map((group, idx) => (
                                    <div key={group.id} className="bg-slate-800/80 rounded-xl p-4 border border-white/5 hover:border-purple-500/30 transition-colors">
                                        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                                            <div 
                                                className="flex-1 cursor-pointer"
                                                onClick={() => handleSelectFlashcardGroup(group)}
                                            >
                                                <h4 className="font-bold text-slate-200">Group {idx + 1}</h4>
                                                <p className="text-xs text-slate-500">Created: {new Date(group.createdAt).toLocaleDateString()}</p>
                                            </div>
                                            
                                            <div className="flex items-center gap-3">
                                                {/* Rating Stars */}
                                                <div className="flex gap-1 bg-slate-900/50 p-1.5 rounded-lg">
                                                    {[1,2,3,4,5].map(star => (
                                                        <Star 
                                                            key={star} 
                                                            size={14} 
                                                            className={`cursor-pointer transition-colors ${ratings[group.id] >= star ? 'text-yellow-400 fill-yellow-400' : 'text-slate-600 hover:text-yellow-400'}`}
                                                            onClick={() => !hasRated[group.id] && handleRateFlashcardGroup(group.id, star)}
                                                        />
                                                    ))}
                                                </div>
                                                
                                                <button 
                                                    onClick={() => handleToggleGroup(group.id)}
                                                    className="p-2 hover:bg-white/10 rounded-lg text-slate-400"
                                                >
                                                    {expandedGroups[group.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                </button>
                                                
                                                <button 
                                                    onClick={() => handleDeleteFlashcardGroup(group.id)}
                                                    className="p-2 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>

                                        <AnimatePresence>
                                            {expandedGroups[group.id] && (
                                                <motion.div 
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    className="mt-4 pt-4 border-t border-white/5 grid gap-3 overflow-hidden"
                                                >
                                                    {group.flashcards.map((card, i) => (
                                                        <div key={i} className="bg-slate-900/50 p-3 rounded-lg text-sm border border-white/5">
                                                            <div className="font-semibold text-purple-300 mb-1">Q: {card.question}</div>
                                                            <div className="text-slate-400">A: {card.answer}</div>
                                                        </div>
                                                    ))}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
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
                        <h3 className="font-bold flex items-center gap-2">DwenLite AI <span className="text-xs font-normal text-slate-400 px-2 py-0.5 bg-slate-700 rounded">Flash Cards</span></h3>
                        <div className="ml-auto flex items-center gap-3"><AnswerLengthToggle /></div>
                        {chatHistory.length > 0 && (
                            <button onClick={clearChat} disabled={chatLoading} className="text-xs text-slate-400 hover:text-white disabled:opacity-40 transition-colors">New chat</button>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                        {chatHistory.length === 0 && (
                            <div className="text-center text-slate-500 mt-10 text-sm">
                                <MessageSquare size={32} className="mx-auto mb-2 opacity-50" />
                                <p>Ask me anything about the selected flashcards!</p>
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
                                     {/* Simple "Typing..." check logic from original code */}
                                     {msg.content.includes('DwenLite AI is typing...') || msg.content.includes('DwenLite AI is searching the web...') ? (
                                        <div className="flex items-center gap-1">
                                            {msg.content.replace('...', '')}
                                            <span className="animate-bounce">.</span>
                                            <span className="animate-bounce delay-100">.</span>
                                            <span className="animate-bounce delay-200">.</span>
                                        </div>
                                      ) : (
                                        msg.content
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

                                {/* Report Form Modal Inside Chat */}
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

export default Flashcards;