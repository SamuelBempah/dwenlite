import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { db, auth } from '../firebase';
import { doc, getDoc, updateDoc, addDoc, collection, setDoc, query, where, getDocs } from 'firebase/firestore';
import toast from 'react-hot-toast';
import axios from 'axios';
import { askStudyChat, buildFolderContext } from '../lib/ai';
import FollowUpChips from '../components/FollowUpChips';
import { questionKey, weakQuestions } from '../lib/quizStats';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, Zap, Coins, ChevronLeft, ChevronRight, 
  MessageSquare, Send, AlertTriangle, Trash2, Star, ChevronDown, 
  ChevronUp, Sparkles, FolderOpen, FileQuestion, CheckCircle, XCircle, Timer, Target
} from 'lucide-react';

function Quizzes() {
  const { folderId } = useParams();
  const navigate = useNavigate();
  
  // --- STATE MANAGEMENT ---
  const [folder, setFolder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quizLoading, setQuizLoading] = useState(false);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [isCorrect, setIsCorrect] = useState(null);
  const QUESTION_SECONDS = 30;
  const [timedMode, setTimedMode] = useState(() => {
    try { return localStorage.getItem('dwenliteTimedQuiz') === '1'; } catch { return false; }
  });
  const [timeLeft, setTimeLeft] = useState(QUESTION_SECONDS);
  const [results, setResults] = useState([]); // [{ quiz, correct, timedOut }]
  const [showStoredQuizzes, setShowStoredQuizzes] = useState(true); // Default to true to match Notes style
  const [selectedQuizGroup, setSelectedQuizGroup] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [chatInput, setChatInput] = useState('');
  const [selectedQuizGroupId, setSelectedQuizGroupId] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [showQuizGroupPrompt, setShowQuizGroupPrompt] = useState(false);
  const [showReportForm, setShowReportForm] = useState(null);
  const [reportReason, setReportReason] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [gCoins, setGCoins] = useState(0);
  const [gCoinsAnimating, setGCoinsAnimating] = useState(false);
  const [ratings, setRatings] = useState({});
  const [ratingLoading, setRatingLoading] = useState({});
  const [hasRated, setHasRated] = useState({});

  const chatEndRef = useRef(null);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, showReportForm]);

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

  // --- DATA FETCHING & LOGIC ---

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
        userRatings[data.quizGroupId] = data.rating;
        hasRatedGroups[data.quizGroupId] = true;
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
      if (!userSnap.exists()) throw new Error('User document not found.');
      
      const currentGCoins = userSnap.data().gCoins || 0;
      if (currentGCoins < amount) throw new Error('Insufficient G_COINS.');
      
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

      folderData.quizGroups = folderData.quizGroups || [];
      folderData.documents = folderData.documents || [];
      folderData.quizGroups = folderData.quizGroups.map(group => ({
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

  // --- TRANSCRIPTION LOGIC ---
  const transcribeAudio = async (audioUrl) => {
    // ... [Logic kept identical to original]
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
    // ... [Logic kept identical to original]
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

  const generateContent = async (retry = false) => {
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

      let prompt = `Generate 40 multiple-choice quiz questions based on the following content: "${context}". For each question, provide the question, four options (labeled a, b, c, d), and the correct answer. Format as a JSON array: [{ "question": "...", "options": ["a. ...", "b. ...", "c. ...", "d. ..."], "correctAnswer": "..." }], ...]. Return only the JSON array string, without any markdown or code blocks.`;

      if (retry) {
        prompt = `You previously failed to return valid JSON. Generate 40 multiple-choice quiz questions based on content: "${context}". Return ONLY the JSON array string. No markdown.`;
      }

      const response = await axios.post(functionUrl, { prompt })
        .catch(err => {
          if (err.response?.status === 404) throw new Error('Backend function not found.');
          throw new Error(`Generation failed: ${err.message}`);
        });

      let generatedText;
      if (response.data.choices?.[0]?.message?.content) generatedText = response.data.choices[0].message.content.trim();
      else if (response.data.choices?.[0]?.text) generatedText = response.data.choices[0].text.trim();
      else throw new Error('Invalid API response.');

      generatedText = generatedText.replace(/```json/g, '').replace(/```/g, '').replace(/^\s*[\w\s]*?(\[.*\])\s*[\w\s]*$/s, '$1').trim();

      let quizzes;
      try {
        quizzes = JSON.parse(generatedText);
      } catch (parseErr) {
        if (!retry) return await generateContent(true);
        // Fallback
        quizzes = [{ question: 'Sample Question', options: ['a. Option A', 'b. B', 'c. C', 'd. D'], correctAnswer: 'a. Option A' }];
      }

      if (!Array.isArray(quizzes)) throw new Error('API response must be a JSON array.');
      
      // Ensure we have enough and format
      while (quizzes.length < 40) {
        quizzes.push({
          question: `Sample question ${quizzes.length + 1}`,
          options: ['a. Option A', 'b. Option B', 'c. Option C', 'd. Option D'],
          correctAnswer: 'a. Option A',
        });
      }
      
      return quizzes.slice(0, 40).map(quiz => {
        const validCorrectAnswer = quiz.options.find(opt => opt.startsWith(quiz.correctAnswer)) || quiz.correctAnswer;
        return {
          id: Date.now().toString() + Math.random().toString(36).substring(2),
          question: quiz.question,
          options: quiz.options,
          correctAnswer: validCorrectAnswer,
        };
      });

    } catch (err) {
      console.error('Error generating quizzes:', err);
      throw new Error(err.message || 'Failed to generate quizzes.');
    }
  };

  const handleRegenerateQuiz = async () => {
    if (!auth.currentUser) { toast.error('Please log in to generate quizzes.'); return; }
    if (gCoins < 5) {
      toast.error(
        <div>
          Insufficient G_COINS. You need 5 G_COINS.{' '}
          <Link to="/buy-coins" className="underline text-purple-400 hover:text-purple-300">Buy more</Link>.
        </div>
      );
      return;
    }

    setQuizLoading(true);
    try {
      const newQuizzes = await generateContent();
      const newGroup = {
        id: Date.now().toString(),
        quizzes: newQuizzes,
        createdAt: new Date().toISOString(),
        rating: 0,
      };

      const folderRef = doc(db, 'folders', folderId);
      await updateDoc(folderRef, { quizGroups: [...folder.quizGroups, newGroup] });
      await deductGCoins(auth.currentUser.uid, 5);

      setFolder(prev => ({ ...prev, quizGroups: [...prev.quizGroups, newGroup] }));
      setRatings(prev => ({ ...prev, [newGroup.id]: 0 }));
      setHasRated(prev => ({ ...prev, [newGroup.id]: false }));
      
      // Auto select the new group
      setSelectedQuizGroup(newGroup);
      setCurrentQuizIndex(0);
      setSelectedAnswer(null);
      setIsCorrect(null);
      
      toast.success('Quiz generated successfully! 5 G_COINS deducted.');
    } catch (err) { toast.error(err.message); } 
    finally { setQuizLoading(false); }
  };

  const handleDeleteQuizGroup = async (groupId) => {
    try {
      const updatedQuizGroups = folder.quizGroups.filter(group => group.id !== groupId);
      const folderRef = doc(db, 'folders', folderId);
      await updateDoc(folderRef, { quizGroups: updatedQuizGroups });

      setFolder(prev => ({ ...prev, quizGroups: updatedQuizGroups }));
      
      if (selectedQuizGroup?.id === groupId) {
        setSelectedQuizGroup(null);
        setCurrentQuizIndex(0);
        setSelectedAnswer(null);
        setIsCorrect(null);
      }
      toast.success('Quiz group deleted successfully!');
    } catch (err) {
      console.error('Delete quiz group error:', err);
      toast.error('Failed to delete quiz group.');
    }
  };

  const handleRateQuizGroup = async (groupId, rating) => {
    if (!auth.currentUser) { toast.error('Please log in to rate.'); return; }
    if (hasRated[groupId]) { toast.error('You have already rated this quiz group.'); return; }

    setRatingLoading(prev => ({ ...prev, [groupId]: true }));
    try {
      const folderRef = doc(db, 'folders', folderId);
      const updatedQuizGroups = folder.quizGroups.map(group => 
        group.id === groupId ? { ...group, rating } : group
      );

      await updateDoc(folderRef, { quizGroups: updatedQuizGroups });
      setFolder(prev => ({ ...prev, quizGroups: updatedQuizGroups }));
      setRatings(prev => ({ ...prev, [groupId]: rating }));
      setHasRated(prev => ({ ...prev, [groupId]: true }));

      await addDoc(collection(db, 'ratings'), {
        userId: auth.currentUser.uid,
        folderId,
        quizGroupId: groupId,
        rating,
        createdAt: new Date().toISOString(),
      });
      toast.success('Rating submitted!');
    } catch (err) {
      toast.error('Failed to submit rating.');
    } finally {
      setRatingLoading(prev => ({ ...prev, [groupId]: false }));
    }
  };

  // --- QUIZ INTERACTION ---
  const handleSelectQuizGroup = (group) => {
    if (quizLoading) return;
    setSelectedQuizGroup(group);
    setCurrentQuizIndex(0);
    setSelectedAnswer(null);
    setIsCorrect(null);
    setResults([]);
    setTimeLeft(QUESTION_SECONDS);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleGroup = (groupId) => {
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  // Remember right/wrong per question so weak ones can be practised again.
  const saveQuestionResult = (quiz, correct) => {
    const key = questionKey(quiz);
    const prev = folder?.quizStats?.[key] || { right: 0, wrong: 0 };
    const stats = { ...(folder?.quizStats || {}), [key]: { right: prev.right + (correct ? 1 : 0), wrong: prev.wrong + (correct ? 0 : 1) } };
    setFolder(f => ({ ...f, quizStats: stats }));
    updateDoc(doc(db, 'folders', folderId), { quizStats: stats }).catch(() => { });
  };

  const handleAnswerSelect = (option) => {
    if (selectedAnswer !== null || quizLoading) return;
    const correct = option === currentQuiz.correctAnswer;
    setSelectedAnswer(option);
    setIsCorrect(correct);
    setResults(r => [...r, { quiz: currentQuiz, correct, timedOut: false }]);
    saveQuestionResult(currentQuiz, correct);
  };

  const handleTimeUp = () => {
    if (selectedAnswer !== null || !currentQuiz) return;
    setSelectedAnswer('__timeout__');
    setIsCorrect(false);
    setResults(r => [...r, { quiz: currentQuiz, correct: false, timedOut: true }]);
    saveQuestionResult(currentQuiz, false);
  };

  const handleNextQuestion = () => {
    setTimeLeft(QUESTION_SECONDS);
    // Moving past the last question shows the score screen.
    setCurrentQuizIndex(prev => prev + 1);
    setSelectedAnswer(null);
    setIsCorrect(null);
  };

  const toggleTimedMode = () => {
    setTimedMode(v => {
      try { localStorage.setItem('dwenliteTimedQuiz', v ? '0' : '1'); } catch { /* ignore */ }
      return !v;
    });
  };

  const startPractice = (name, quizzes) => {
    if (!quizzes.length) return;
    handleSelectQuizGroup({ id: '__practice__', name, quizzes });
  };

  const currentQuiz = selectedQuizGroup?.quizzes[currentQuizIndex];

  // Countdown for timed mode: one tick per second while a question is open.
  useEffect(() => {
    if (!timedMode || !currentQuiz || selectedAnswer !== null) return undefined;
    if (timeLeft <= 0) { handleTimeUp(); return undefined; }
    const t = setTimeout(() => setTimeLeft(v => v - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timedMode, currentQuiz, selectedAnswer, timeLeft]);

  // --- CHAT LOGIC ---
  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;
    const question = chatInput.trim();
    setChatInput('');
    await processQuestion(question);
  };

  const handleReportContent = async (messageIndex, reason) => {
    setReportLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) { toast.error('Login required.'); return; }
      
      const message = chatHistory[messageIndex];
      await addDoc(collection(db, 'reports'), {
        userId: user.uid,
        folderId,
        contentType: 'quiz_chat_message',
        contentId: `message_${messageIndex}`,
        content: message.content,
        reason,
        createdAt: new Date().toISOString(),
      });
      toast.success('Report submitted.');
      setShowReportForm(null);
      setReportReason('');
    } catch (err) { toast.error(`Report failed: ${err.message}`); }
    finally { setReportLoading(false); }
  };

  // The AI reads every quiz group, note and document in the folder and may go beyond them.
  const processQuestion = async (question) => {
    const priorHistory = chatHistory;
    setChatHistory(prev => [...prev, { type: 'user', content: question }, { type: 'system', content: 'DwenLite AI is typing...' }]);
    setChatLoading(true);
    try {
      const { text: answer, followups } = await askStudyChat({ context: buildFolderContext(folder), history: priorHistory, question, kind: 'quizzes' });
      setChatHistory(prev => prev.filter(item => item.content !== 'DwenLite AI is typing...').concat({ type: 'ai', content: answer, followups }));
    } catch (err) {
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
                <FileQuestion className="text-purple-400" size={24} /> 
                {folder.name}
              </h1>
              <p className="text-xs text-slate-400">Smart Quiz Mode</p>
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
                 <h2 className="font-bold text-lg">AI Quiz Generator</h2>
                 <p className="text-sm text-purple-200/70 max-w-md">
                    Instantly create 40 multiple-choice questions from your content.
                    <span className="text-yellow-400 font-bold ml-1">Cost: 5 GC</span>
                 </p>
              </div>
           </div>
           <button
              onClick={handleRegenerateQuiz}
              disabled={quizLoading}
              className="w-full md:w-auto px-6 py-3 bg-white text-purple-900 rounded-xl font-bold hover:scale-105 active:scale-95 transition-all shadow-lg shadow-white/10 disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
           >
              {quizLoading ? (
                 <div className="w-5 h-5 border-2 border-purple-900 border-t-transparent rounded-full animate-spin" />
              ) : (
                 <> <Zap size={18} fill="currentColor" /> Generate Quizzes </>
              )}
           </button>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* LEFT COLUMN: Active Quiz & List */}
            <div className="lg:col-span-2 space-y-6">
                
                {/* ACTIVE QUIZ AREA */}
                {selectedQuizGroup && currentQuizIndex < selectedQuizGroup.quizzes.length && currentQuiz && (
                   <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-slate-800/40 backdrop-blur-md border border-purple-500/20 rounded-2xl p-6 md:p-8 shadow-xl relative overflow-hidden"
                   >
                      <div className="flex justify-between items-start mb-6">
                         <span className="bg-purple-500/20 text-purple-300 text-xs font-bold px-3 py-1 rounded-full border border-purple-500/30">
                            Question {currentQuizIndex + 1} of {selectedQuizGroup.quizzes.length}
                         </span>
                         <button 
                            onClick={() => setSelectedQuizGroup(null)}
                            className="text-slate-500 hover:text-white transition-colors"
                         >
                            <Trash2 size={16} /> <span className="text-xs">Exit</span>
                         </button>
                      </div>

                      {timedMode && (
                         <div className="mb-5">
                            <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                               <span className="flex items-center gap-1"><Timer size={12} /> Timed mode</span>
                               <span className={timeLeft <= 5 && selectedAnswer === null ? 'text-red-400 font-bold' : ''}>{selectedAnswer === '__timeout__' ? "Time's up!" : `${timeLeft}s`}</span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-700">
                               <div
                                  className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${timeLeft <= 5 ? 'bg-red-500' : 'bg-purple-500'}`}
                                  style={{ width: `${(timeLeft / QUESTION_SECONDS) * 100}%` }}
                               />
                            </div>
                         </div>
                      )}

                      <h2 className="text-xl md:text-2xl font-bold text-white mb-6 leading-relaxed">
                         {currentQuiz.question}
                      </h2>

                      <div className="space-y-3">
                         {currentQuiz.options.map((option, idx) => {
                            const isSelected = selectedAnswer === option;
                            const isCorrectAnswer = option === currentQuiz.correctAnswer;
                            
                            let btnClass = "w-full text-left p-4 rounded-xl border transition-all duration-200 flex justify-between items-center group ";
                            
                            if (selectedAnswer) {
                               if (isSelected && isCorrect) btnClass += "bg-green-500/20 border-green-500/50 text-green-100";
                               else if (isSelected && !isCorrect) btnClass += "bg-red-500/20 border-red-500/50 text-red-100";
                               else if (isCorrectAnswer && !isCorrect) btnClass += "bg-green-500/10 border-green-500/30 text-green-200"; // Show correct if wrong
                               else btnClass += "bg-slate-900/50 border-white/5 opacity-50";
                            } else {
                               btnClass += "bg-slate-900/50 border-white/10 hover:border-purple-500/50 hover:bg-slate-800 hover:shadow-lg hover:shadow-purple-900/10";
                            }

                            return (
                               <button 
                                  key={idx}
                                  onClick={() => handleAnswerSelect(option)}
                                  disabled={selectedAnswer !== null}
                                  className={btnClass}
                               >
                                  <span className="flex-1">{option}</span>
                                  {selectedAnswer && isSelected && isCorrect && <CheckCircle className="text-green-400" size={20} />}
                                  {selectedAnswer && isSelected && !isCorrect && <XCircle className="text-red-400" size={20} />}
                               </button>
                            );
                         })}
                      </div>

                      <AnimatePresence>
                         {selectedAnswer && (
                            <motion.div 
                               initial={{ opacity: 0, y: 10 }}
                               animate={{ opacity: 1, y: 0 }}
                               className="mt-6 flex justify-end"
                            >
                               <button 
                                  onClick={handleNextQuestion}
                                  className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-purple-900/30"
                               >
                                  {currentQuizIndex + 1 >= selectedQuizGroup.quizzes.length ? 'See Results' : 'Next Question'} <ChevronRight size={18} />
                               </button>
                            </motion.div>
                         )}
                      </AnimatePresence>
                   </motion.div>
                )}
                
                {/* COMPLETED STATE */}
                {selectedQuizGroup && currentQuizIndex >= selectedQuizGroup.quizzes.length && (() => {
                   const total = selectedQuizGroup.quizzes.length;
                   const right = results.filter(r => r.correct).length;
                   const pct = total ? Math.round((right / total) * 100) : 0;
                   const missed = results.filter(r => !r.correct);
                   return (
                   <div className="bg-slate-800/40 backdrop-blur-md border border-white/10 rounded-2xl p-6 md:p-8">
                      <div className="text-center">
                         <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle className="text-green-400" size={32} />
                         </div>
                         <h2 className="text-2xl font-bold mb-1">Quiz Completed!</h2>
                         <p className="text-4xl font-extrabold text-white">{pct}%</p>
                         <p className="text-slate-400 mb-4">You got {right} of {total} right.</p>
                         <div className="mx-auto mb-6 h-2.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-700">
                            <div className={`h-full rounded-full ${pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-400' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
                         </div>
                      </div>

                      {missed.length > 0 && (
                         <div className="mb-6 space-y-2 text-left">
                            <p className="text-sm font-semibold text-slate-300">Review what you missed</p>
                            {missed.map((r, i) => (
                               <div key={i} className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm">
                                  <p className="text-slate-200">{r.quiz.question}</p>
                                  <p className="mt-1 text-green-300">Answer: {r.quiz.correctAnswer}{r.timedOut ? <span className="text-red-300"> (ran out of time)</span> : null}</p>
                               </div>
                            ))}
                         </div>
                      )}

                      <div className="flex flex-wrap justify-center gap-3">
                         {missed.length > 0 && (
                            <button
                               onClick={() => startPractice('Missed questions', missed.map(r => r.quiz))}
                               className="px-5 py-2 bg-purple-600 hover:bg-purple-500 rounded-xl font-semibold transition-colors"
                            >
                               Retry missed ({missed.length})
                            </button>
                         )}
                         <button
                            onClick={() => setSelectedQuizGroup(null)}
                            className="px-5 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl transition-colors"
                         >
                            Back to List
                         </button>
                      </div>
                   </div>
                   );
                })()}

                {/* PRACTICE OPTIONS */}
                {!selectedQuizGroup && folder.quizGroups.length > 0 && (() => {
                   const weak = weakQuestions(folder.quizGroups, folder.quizStats);
                   return (
                   <div className="flex flex-col gap-3 rounded-2xl border border-white/5 bg-slate-800/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <button
                         onClick={toggleTimedMode}
                         role="switch"
                         aria-checked={timedMode}
                         className="flex items-center gap-3 text-left"
                      >
                         <span className={`relative h-6 w-11 rounded-full transition-colors ${timedMode ? 'bg-purple-600' : 'bg-slate-600'}`}>
                            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${timedMode ? 'left-[22px]' : 'left-0.5'}`} />
                         </span>
                         <span>
                            <span className="flex items-center gap-1 text-sm font-semibold"><Timer size={14} /> Timed mode</span>
                            <span className="block text-xs text-slate-400">{QUESTION_SECONDS} seconds per question</span>
                         </span>
                      </button>
                      <button
                         onClick={() => startPractice('Weak questions', weak)}
                         disabled={weak.length === 0}
                         className="flex items-center justify-center gap-2 rounded-xl bg-amber-500/15 px-4 py-2.5 text-sm font-semibold text-amber-300 hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
                      >
                         <Target size={16} /> Practice weak questions ({weak.length})
                      </button>
                   </div>
                   );
                })()}

                {/* STORED QUIZZES LIST */}
                <div className="bg-slate-800/30 backdrop-blur-sm border border-white/5 rounded-2xl p-6">
                    <div 
                        className="flex items-center justify-between cursor-pointer mb-6"
                        onClick={() => setShowStoredQuizzes(!showStoredQuizzes)}
                    >
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                           <FolderOpen size={20} className="text-slate-400" /> Stored Quiz Groups
                        </h3>
                        {showStoredQuizzes ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </div>

                    <AnimatePresence>
                        {showStoredQuizzes && (
                            <motion.div 
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="space-y-4 overflow-hidden"
                            >
                                {folder.quizGroups.length === 0 && (
                                   <div className="text-center p-8 border-2 border-dashed border-slate-700 rounded-xl text-slate-500">
                                      <FileQuestion size={32} className="mx-auto mb-2 opacity-50" />
                                      <p>No quizzes generated yet.</p>
                                   </div>
                                )}
                                
                                {folder.quizGroups.map((group, idx) => (
                                    <motion.div 
                                      key={group.id}
                                      layout
                                      initial={{ opacity: 0, y: 10 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      className={`bg-slate-800/80 rounded-xl border transition-all duration-300 ${selectedQuizGroup?.id === group.id ? 'border-purple-500/50 ring-1 ring-purple-500/30' : 'border-white/5 hover:border-purple-500/30'}`}
                                    >
                                        <div className="p-4 flex flex-col md:flex-row justify-between md:items-center gap-4">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3">
                                                    <h4 
                                                       className="font-bold text-slate-200 cursor-pointer hover:text-purple-400 transition-colors"
                                                       onClick={() => handleSelectQuizGroup(group)}
                                                    >
                                                       Quiz Group {idx + 1}
                                                    </h4>
                                                    {selectedQuizGroup?.id === group.id && (
                                                       <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded border border-purple-500/20">Active</span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-slate-500 mt-1">Created: {new Date(group.createdAt).toLocaleDateString()}</p>
                                            </div>
                                            
                                            <div className="flex items-center gap-3">
                                                <div className="flex gap-1 bg-slate-900/50 p-1.5 rounded-lg border border-white/5">
                                                    {[1,2,3,4,5].map(star => (
                                                        <Star 
                                                            key={star} 
                                                            size={14} 
                                                            className={`cursor-pointer transition-colors ${ratings[group.id] >= star ? 'text-yellow-400 fill-yellow-400' : 'text-slate-600 hover:text-yellow-400'}`}
                                                            onClick={() => !hasRated[group.id] && handleRateQuizGroup(group.id, star)}
                                                        />
                                                    ))}
                                                </div>
                                                
                                                <button 
                                                    onClick={() => handleToggleGroup(group.id)}
                                                    className="p-2 hover:bg-white/10 rounded-lg text-slate-400 transition-colors"
                                                >
                                                    {expandedGroups[group.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                </button>
                                                
                                                <button 
                                                    onClick={() => handleDeleteQuizGroup(group.id)}
                                                    className="p-2 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg transition-colors"
                                                    title="Delete Group"
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
                                                    className="border-t border-white/5 bg-slate-900/30 px-4 py-4 space-y-3"
                                                >
                                                    {group.quizzes.map((q, i) => (
                                                       <div key={q.id} className="bg-slate-800 p-3 rounded-lg border border-white/5">
                                                          <p className="text-sm font-semibold text-slate-300 mb-2">Q{i+1}: {q.question}</p>
                                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-400">
                                                             {q.options.map((opt, oIdx) => (
                                                                <div key={oIdx} className={opt === q.correctAnswer ? "text-green-400 font-bold" : ""}>
                                                                   {opt}
                                                                </div>
                                                             ))}
                                                          </div>
                                                       </div>
                                                    ))}
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
                        <h3 className="font-bold flex items-center gap-2">DwenLite AI <span className="text-xs font-normal text-slate-400 px-2 py-0.5 bg-slate-700 rounded">Quizzes</span></h3>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                        {chatHistory.length === 0 && (
                            <div className="text-center text-slate-500 mt-10 text-sm">
                                <MessageSquare size={32} className="mx-auto mb-2 opacity-50" />
                                <p>Ask me to explain any quiz question!</p>
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
                                    {msg.content}
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
                                            <textarea 
                                                value={reportReason}
                                                onChange={(e) => setReportReason(e.target.value)}
                                                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs mb-2 focus:border-red-500 outline-none"
                                                rows="2"
                                                placeholder="Describe the issue..."
                                            />
                                            <button 
                                                onClick={() => handleReportContent(idx, reportReason)} 
                                                disabled={reportLoading || !reportReason.trim()}
                                                className="bg-red-500/20 text-red-400 text-xs px-3 py-1 rounded hover:bg-red-500/30 disabled:opacity-50"
                                            >
                                                {reportLoading ? 'Sending...' : 'Submit'}
                                            </button>
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

export default Quizzes;