import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { auth, storage, db } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { addDoc, collection } from 'firebase/firestore';
import toast from 'react-hot-toast';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutDashboard, Coins, HelpCircle, LogOut, 
  ArrowLeft, Upload, FileText, Mic, Video, 
  Play, CheckCircle, XCircle, Send, AlertTriangle,
  Sparkles, BrainCircuit, GraduationCap, ChevronRight,
  Clock, Check, RefreshCw, AlertCircle, SpellCheck
} from 'lucide-react';

function ExamsPreparation() {
  const navigate = useNavigate();
  
  // --- STATE MANAGEMENT ---
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Exam Generation State
  const [examLoading, setExamLoading] = useState(false);
  const [files, setFiles] = useState([]);
  const [uploadedNotes, setUploadedNotes] = useState([]);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [examStage, setExamStage] = useState('upload'); // 'upload', 'review', 'mcq', 'fill-in', 'marking', 'results'
  const [reviewContent, setReviewContent] = useState('');
  
  // Quiz State
  const [mcqQuestions, setMcqQuestions] = useState([]);
  const [fillInQuestions, setFillInQuestions] = useState([]);
  const [currentMcqIndex, setCurrentMcqIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [isCorrect, setIsCorrect] = useState(null);
  const [fillInAnswers, setFillInAnswers] = useState({});
  const [scores, setScores] = useState({ mcq: 0, fillIn: 0, total: 0 });
  const [mcqResults, setMcqResults] = useState([]);
  const [fillInResults, setFillInResults] = useState([]);
  const [markingProgress, setMarkingProgress] = useState({ mcq: 0, fillIn: 0 });
  const [submitLoading, setSubmitLoading] = useState(false);

  // Chat & Report State
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [showReportForm, setShowReportForm] = useState(null);
  const [reportReason, setReportReason] = useState('');
  const [reportLoading, setReportLoading] = useState(false);

  // Refs
  const chatContainerRef = useRef(null);

  // --- INITIALIZATION ---
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => {
      if (!user) {
        toast.error('Please log in to access exam preparation.');
        navigate('/login');
        return;
      }
      setCurrentUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [navigate]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory, showReportForm]);


  // --- CORE LOGIC HANDLERS ---

  // PROXY HELPER FUNCTION (Fixes CORS)
  const callAIProxy = async (prompt) => {
    const functionUrl = 'https://us-central1-leumas-decipher-softwares.cloudfunctions.net/generateNotesProxy';
    try {
      const response = await axios.post(functionUrl, { prompt })
        .catch(err => {
           if (err.response?.status === 404) throw new Error('Backend function not found.');
           throw new Error(`AI Request failed: ${err.message}`);
        });

      let content;
      if (response.data.choices?.[0]?.message?.content) content = response.data.choices[0].message.content.trim();
      else if (response.data.choices?.[0]?.text) content = response.data.choices[0].text.trim();
      else throw new Error('Invalid API response: No generated content found.');
      
      return content;
    } catch (err) {
      console.error('Proxy Error:', err);
      throw err;
    }
  };

  const extractPdfText = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      // Ensure pdfjsLib is loaded in your index.html via CDN
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      const numPages = pdf.numPages;

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + ' ';
      }

      return fullText.trim() || 'No text found in the PDF.';
    } catch (error) {
      throw new Error('PDF text extraction failed: ' + error.message);
    }
  };

  const transcribeMedia = async (url, type) => {
    try {
      const apiKey = import.meta.env.VITE_ASSEMBLYAI_API_KEY;
      if (!apiKey) throw new Error('AssemblyAI API key not found.');
      
      const response = await axios.post(
        'https://api.assemblyai.com/v2/transcript',
        { 
          audio_url: url, 
          auto_highlights: false, 
          sentiment_analysis: false, 
          content_safety: false, 
          iab_categories: false, 
          auto_chapters: false, 
          format_text: false 
        },
        { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
      );

      const transcriptId = response.data.id;
      let status = 'queued';
      let transcribedText = '';
      const maxAttempts = type === 'Video' ? 60 : 30;
      let attempts = 0;

      while (status !== 'completed' && status !== 'error' && attempts < maxAttempts) {
        const checkResponse = await axios.get(
          `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
          { headers: { Authorization: `Bearer ${apiKey}` } }
        );

        status = checkResponse.data.status;
        if (status === 'completed') {
          transcribedText = checkResponse.data.text || '';
        } else if (status === 'error') {
           let errorMessage = checkResponse.data.error || 'Unknown error';
           if (errorMessage.includes('transcoding failed')) errorMessage = 'File format not supported or corrupted.';
           throw new Error(`Transcription failed: ${errorMessage}`);
        }
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      if (attempts >= maxAttempts) throw new Error(`${type} transcription timed out.`);
      if (!transcribedText) throw new Error(`${type} returned empty text.`);

      return transcribedText;
    } catch (err) {
      console.error(`${type} transcription error:`, err);
      throw new Error(`Failed to process ${type}: ${err.message}`);
    }
  };

  const handleFileUpload = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    setFiles(prev => [...prev, selectedFile]);
    setUploadLoading(true);

    try {
      const fileType = selectedFile.type;
      const fileExtension = selectedFile.name.split('.').pop().toLowerCase();
      const isAudio = fileType.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'ogg', 'flac'].includes(fileExtension);
      const isVideo = fileType.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(fileExtension);
      const isText = fileType === 'text/plain' || fileType === 'application/pdf' || ['txt', 'pdf'].includes(fileExtension);

      if (!isAudio && !isVideo && !isText) {
        throw new Error('Unsupported file type. Please upload audio, video, text, or PDF files.');
      }

      // Upload to Firebase
      const storageRef = ref(storage, `exam_notes/${currentUser.uid}/${Date.now()}_${selectedFile.name}`);
      await uploadBytes(storageRef, selectedFile);
      const downloadURL = await getDownloadURL(storageRef);

      // Extract Text
      let extractedText = '';
      if (isAudio) {
        extractedText = await transcribeMedia(downloadURL, 'Audio');
      } else if (isVideo) {
        extractedText = await transcribeMedia(downloadURL, 'Video');
      } else if (isText) {
        if (fileType === 'text/plain' || fileExtension === 'txt') {
          extractedText = await selectedFile.text();
        } else if (fileType === 'application/pdf' || fileExtension === 'pdf') {
          extractedText = await extractPdfText(selectedFile);
        }
      }

      const newNote = {
        url: downloadURL,
        isAudio,
        isVideo,
        isText,
        extractedText,
        createdAt: new Date().toISOString(),
        fileName: selectedFile.name,
      };

      setUploadedNotes(prev => [...prev, newNote]);
      toast.success('Note uploaded and processed successfully!');
    } catch (err) {
      console.error('File upload error:', err);
      toast.error(err.message);
      setFiles(prev => prev.filter(f => f !== selectedFile));
    } finally {
      setUploadLoading(false);
      e.target.value = null; // Reset input
    }
  };

  const generateExamContent = async (retry = false) => {
    try {
      const context = uploadedNotes.length > 0
        ? uploadedNotes.map(note => note.extractedText).join('\n\n')
        : 'No notes uploaded. Generate generic exam content.';

      // 1. Generate Review Content (Using Proxy)
      const reviewPrompt = `You are a helpful educational assistant. Generate comprehensive and well-organized study notes based on the following content: "${context}". Structure with clear headings and bullet points. Format as plain text suitable for React rendering.`;
      const reviewText = await callAIProxy(reviewPrompt);

      // 2. Generate MCQs (Using Proxy)
      const mcqPrompt = `You are a strict JSON generator for educational content. Generate 40 multiple-choice quiz questions based on: "${context}". Format as a JSON array: [{ "question": "...", "options": ["a. ...", "b. ...", "c. ...", "d. ..."], "correctAnswer": "..." }, ...]. Ensure "correctAnswer" matches one of the options exactly. Return ONLY valid JSON. ${retry ? 'Previously failed to return valid JSON. Ensure strict JSON format.' : ''}`;
      let mcqText = await callAIProxy(mcqPrompt);
      
      // Sanitize JSON
      mcqText = mcqText.replace(/```json/g, '').replace(/```/g, '').trim();
      
      let mcqs;
      try {
        mcqs = JSON.parse(mcqText);
      } catch (parseErr) {
        console.error('MCQ JSON parse error:', parseErr);
        if (!retry) return await generateExamContent(true); // Retry once
        
        // Fallback
        mcqs = [{
          question: 'What is the core concept of the uploaded notes?',
          options: ['a. Review Material', 'b. Unknown', 'c. To be determined', 'd. None'],
          correctAnswer: 'a. Review Material',
        }];
      }

      // Add unique IDs
      mcqs = mcqs.map(quiz => ({
        id: Date.now().toString() + Math.random().toString(36).substring(2),
        ...quiz,
        correctAnswer: quiz.options.includes(quiz.correctAnswer) ? quiz.correctAnswer : quiz.options[0]
      }));

      // 3. Generate Fill-in-the-Blank (Using Proxy)
      const fillInPrompt = `You are a JSON generator. Generate 10 fill-in-the-blank questions based on: "${context}". Format as JSON array: [{ "question": "...", "expectedAnswer": "..." }]. Return ONLY valid JSON.`;
      let fillInText = await callAIProxy(fillInPrompt);
      
      fillInText = fillInText.replace(/```json/g, '').replace(/```/g, '').trim();
      let fillIns = JSON.parse(fillInText);
      
      fillIns = fillIns.map(q => ({
        id: Date.now().toString() + Math.random().toString(36).substring(2),
        ...q,
      }));

      return { reviewText, mcqs, fillIns };

    } catch (err) {
      console.error('Error generating exam content:', err);
      throw new Error(`Failed to generate exam content: ${err.message}`);
    }
  };

  const handleStartExam = async () => {
    if (uploadedNotes.length === 0) {
      toast.error('Please upload at least one note to start.');
      return;
    }
    setExamLoading(true);
    try {
      const { reviewText, mcqs, fillIns } = await generateExamContent();
      setReviewContent(reviewText);
      setMcqQuestions(mcqs);
      setFillInQuestions(fillIns);
      setExamStage('review');
      toast.success('Exam generated successfully!');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExamLoading(false);
    }
  };

  const handleMcqAnswer = (answer) => {
    if (selectedAnswer) return;
    setSelectedAnswer(answer);
    
    const currentQuiz = mcqQuestions[currentMcqIndex];
    const normalizedAnswer = answer.trim().toLowerCase();
    const normalizedCorrect = currentQuiz.correctAnswer.trim().toLowerCase();
    
    // Logic to handle "a. Option" vs just "Option"
    const isAnswerCorrect = normalizedAnswer === normalizedCorrect || 
                            normalizedCorrect.includes(normalizedAnswer) ||
                            (normalizedAnswer.length > 2 && normalizedCorrect.includes(normalizedAnswer.substring(3)));

    setIsCorrect(isAnswerCorrect);
    
    setMcqResults(prev => [
      ...prev,
      {
        id: currentQuiz.id,
        question: currentQuiz.question,
        selectedAnswer: answer,
        correctAnswer: currentQuiz.correctAnswer,
        isCorrect: isAnswerCorrect,
      },
    ]);
  };

  const handleNextMcq = () => {
    setSelectedAnswer(null);
    setIsCorrect(null);
    if (currentMcqIndex < mcqQuestions.length - 1) {
      setCurrentMcqIndex(prev => prev + 1);
    } else {
      setExamStage('fill-in');
      setCurrentMcqIndex(0);
    }
  };

  const handleFillSubmit = async () => {
    setSubmitLoading(true);
    try {
      let fillInScore = 0;
      const results = [];

      for (const question of fillInQuestions) {
        const userAnswer = fillInAnswers[question.id]?.trim() || '';
        
        if (!userAnswer) {
          results.push({ 
            id: question.id, 
            isCorrect: false, 
            explanation: 'No answer provided.', 
            question: question.question, 
            userAnswer, 
            expectedAnswer: question.expectedAnswer,
            hasTypos: false 
          });
          continue;
        }

        // --- SMART TEACHER GRADING PROMPT ---
        const prompt = `
          Act as a smart, human teacher grading a student's fill-in-the-blank answer.
          
          Context (Question): "${question.question}"
          Expected Answer: "${question.expectedAnswer}"
          Student Answer: "${userAnswer}"

          GRADING RULES:
          1. Mark as CORRECT (true) if the student's answer has the same meaning as the expected answer.
          2. IGNORE capitalization, punctuation, and spacing differences.
          3. ALLOW typos or spelling errors if the word is still recognizable (e.g., "processer" = "processor").
          4. ACCEPT standard abbreviations (e.g., "CPU" = "Central Processing Unit").
          5. Mark INCORRECT (false) only if the answer is conceptually wrong or unrelated.

          Return JSON ONLY:
          { 
            "isCorrect": boolean, 
            "explanation": "Brief, helpful teacher feedback. If there was a spelling error, mention it kindly.", 
            "hasTypos": boolean 
          }
        `;

        try {
          let resultText = await callAIProxy(prompt);
          resultText = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
          const result = JSON.parse(resultText);

          if (result.isCorrect) fillInScore += 2;
          
          results.push({ 
            id: question.id, 
            ...result, 
            question: question.question, 
            userAnswer, 
            expectedAnswer: question.expectedAnswer 
          });

        } catch (apiErr) {
          console.error(`Grading error for QID ${question.id}:`, apiErr);
          // Fallback simple grading if API fails
          const strictMatch = userAnswer.toLowerCase() === question.expectedAnswer.toLowerCase();
          results.push({
            id: question.id, 
            isCorrect: strictMatch, 
            explanation: strictMatch ? 'Correct.' : 'Grading unavailable.', 
            question: question.question, 
            userAnswer, 
            expectedAnswer: question.expectedAnswer,
            hasTypos: false
          });
          if (strictMatch) fillInScore += 2;
        }
      }

      setFillInResults(results);
      
      // Calculate final scores
      const mcqScore = mcqResults.filter(r => r.isCorrect).length * 2;
      setScores({
        mcq: mcqScore,
        fillIn: fillInScore,
        total: mcqScore + fillInScore,
      });

      setExamStage('marking');

    } catch (err) {
      console.error('Error scoring fill-in answers:', err);
      toast.error(`Grading failed: ${err.message}`);
      setExamStage('results');
    } finally {
      setSubmitLoading(false);
    }
  };

  // Simulate Marking Animation
  useEffect(() => {
    if (examStage === 'marking') {
      let mcqP = 0;
      let fillP = 0;
      const interval = setInterval(() => {
        mcqP = Math.min(mcqP + 4, 100);
        if (mcqP > 50) fillP = Math.min(fillP + 4, 100);
        
        setMarkingProgress({ mcq: mcqP, fillIn: fillP });
        
        if (mcqP === 100 && fillP === 100) {
          clearInterval(interval);
          setTimeout(() => setExamStage('results'), 800);
        }
      }, 50);
      return () => clearInterval(interval);
    }
  }, [examStage]);

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const question = chatInput.trim();
    setChatInput('');
    setChatLoading(true);

    setChatHistory(prev => [
      ...prev,
      { type: 'user', content: question },
      { type: 'loading', content: 'Thinking...' },
    ]);

    try {
      const context = reviewContent || 'No review content available.';
      const prompt = `You are DwenLite AI, a helpful exam tutor. Based on these notes: "${context}", answer: "${question}". Keep it concise.`;

      const answer = await callAIProxy(prompt);
      
      setChatHistory(prev => prev.filter(m => m.type !== 'loading').concat({
        type: 'ai',
        content: answer,
      }));

    } catch (err) {
      toast.error('Chat failed');
      setChatHistory(prev => prev.filter(m => m.type !== 'loading'));
    } finally {
      setChatLoading(false);
    }
  };

  const handleReportContent = async (messageIndex, reason) => {
    setReportLoading(true);
    try {
      const message = chatHistory[messageIndex];
      await addDoc(collection(db, 'reports'), {
        userId: currentUser.uid,
        contentType: 'chat_message',
        content: message.content,
        reason,
        createdAt: new Date().toISOString(),
      });
      toast.success('Report submitted.');
      setShowReportForm(null);
      setReportReason('');
    } catch (err) {
      toast.error('Failed to report.');
    } finally {
      setReportLoading(false);
    }
  };

  const resetExam = () => {
    setExamStage('upload');
    setScores({ mcq: 0, fillIn: 0, total: 0 });
    setCurrentMcqIndex(0);
    setSelectedAnswer(null);
    setIsCorrect(null);
    setFillInAnswers({});
    setUploadedNotes([]);
    setFiles([]);
    setMcqResults([]);
    setFillInResults([]);
    setMarkingProgress({ mcq: 0, fillIn: 0 });
    setChatHistory([]);
  };

  // --- ANIMATION VARIANTS ---
  const pageVariants = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.4 } },
    exit: { opacity: 0, y: -20, transition: { duration: 0.3 } }
  };

  const staggerContainer = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const listItem = {
    hidden: { opacity: 0, x: -20 },
    show: { opacity: 1, x: 0 }
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans selection:bg-purple-500 selection:text-white overflow-hidden relative">
      
      {/* Background Ambience */}
      <div className="fixed inset-0 z-0 opacity-20 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-purple-600 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-indigo-600 rounded-full blur-[120px]" />
      </div>

      <div className="flex h-screen relative z-10">
        
        {/* SIDEBAR (Desktop) */}
        <aside className="hidden md:flex flex-col w-72 bg-slate-900/50 backdrop-blur-xl border-r border-white/10 p-6 justify-between transition-all">
          <div>
            <div 
              className="flex items-center gap-3 mb-10 cursor-pointer group" 
              onClick={() => navigate('/dashboard')}
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center font-bold shadow-lg shadow-purple-500/20 group-hover:shadow-purple-500/40 transition-shadow">
                <LayoutDashboard size={20} />
              </div>
              <div>
                <h3 className="font-semibold text-sm group-hover:text-purple-300 transition-colors">Dashboard</h3>
                <p className="text-xs text-slate-500">Return Home</p>
              </div>
            </div>

            <nav className="space-y-2">
              <div className="px-4 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider">Active Module</div>
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-purple-600/20 text-purple-300 border border-purple-500/20">
                <BrainCircuit size={20} />
                <span className="font-medium text-sm">Exam Prep AI</span>
              </div>
              
              <div className="mt-6 px-4 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider">Shortcuts</div>
              <Link to="/dwen-connect" className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-white/5 hover:text-white transition-all">
                <GraduationCap size={20} />
                <span className="font-medium text-sm">DwenConnect</span>
              </Link>
            </nav>
          </div>

          <div className="space-y-3">
             <div className="bg-slate-800/50 p-4 rounded-xl border border-white/5">
                <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                  <Clock size={12} />
                  <span>Session Time</span>
                </div>
                <div className="text-lg font-mono font-bold text-white">
                  {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
             </div>
             
             <button 
               onClick={() => navigate('/dashboard')} 
               className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-white/10 hover:bg-white/5 transition-all text-sm text-slate-400"
             >
               <ArrowLeft size={16} /> Back to Dashboard
             </button>
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8 relative scroll-smooth">
          
          {/* Mobile Header */}
          <header className="md:hidden flex justify-between items-center mb-6 sticky top-0 bg-slate-900/80 backdrop-blur-md z-30 py-4 px-2 -mx-2">
             <button onClick={() => navigate('/dashboard')} className="p-2 bg-slate-800 rounded-full border border-white/10 active:scale-95 transition-transform">
                <ArrowLeft size={18} />
             </button>
             <div className="flex items-center gap-2">
               <BrainCircuit size={18} className="text-purple-400" />
               <span className="font-semibold">Exam Prep AI</span>
             </div>
             <div className="w-8" /> 
          </header>

          <div className="max-w-4xl mx-auto space-y-6">
            
            {/* Context Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
              <div>
                <motion.h1 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-white via-purple-100 to-purple-200 bg-clip-text text-transparent"
                >
                  {examStage === 'upload' && 'Setup Your Exam'}
                  {examStage === 'review' && 'AI Generated Review'}
                  {examStage === 'mcq' && 'Multiple Choice Assessment'}
                  {examStage === 'fill-in' && 'Fill in the Blanks'}
                  {examStage === 'marking' && 'AI Grading In Progress'}
                  {examStage === 'results' && 'Performance Analysis'}
                </motion.h1>
                <motion.p 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="text-slate-400 text-sm mt-1"
                >
                  {examStage === 'upload' && 'Upload lectures or notes. Our AI will handle the rest.'}
                  {examStage === 'review' && 'Study these notes carefully before starting the quiz.'}
                  {examStage === 'mcq' && 'Select the best answer for each question.'}
                  {examStage === 'results' && 'Review your mistakes and ask DwenLite for clarification.'}
                </motion.p>
              </div>
              
              {examStage !== 'upload' && examStage !== 'marking' && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded-full">
                  <Sparkles size={14} className="text-purple-400" />
                  <span className="text-xs font-mono text-purple-300">DwenLite AI Active</span>
                </div>
              )}
            </div>

            {/* PROGRESS STEPPER (Visual Only) */}
            {examStage !== 'upload' && examStage !== 'results' && (
              <div className="flex items-center justify-center gap-2 mb-8">
                {['review', 'mcq', 'fill-in', 'marking'].map((step, i) => (
                  <div key={step} className={`h-1.5 rounded-full transition-all duration-500 ${
                    ['review', 'mcq', 'fill-in', 'marking'].indexOf(examStage) >= i 
                      ? 'w-12 bg-purple-500' 
                      : 'w-4 bg-slate-700'
                  }`} />
                ))}
              </div>
            )}

            <AnimatePresence mode="wait">
              
              {/* --- STAGE 1: UPLOAD --- */}
              {examStage === 'upload' && (
                <motion.div 
                  key="upload"
                  variants={pageVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="space-y-6"
                >
                  {/* Upload Area */}
                  <div className="relative group">
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-indigo-600/20 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <div className="relative bg-slate-800/40 backdrop-blur-xl border border-white/10 rounded-3xl p-10 text-center border-dashed border-2 border-slate-700 group-hover:border-purple-500/50 transition-all overflow-hidden">
                      
                      <input 
                        type="file" 
                        onChange={handleFileUpload} 
                        accept="text/plain,application/pdf,audio/*,video/*"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                        disabled={uploadLoading}
                      />
                      
                      <div className="w-20 h-20 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 group-hover:bg-purple-500/20 transition-all duration-300">
                        {uploadLoading ? (
                          <div className="w-8 h-8 border-3 border-purple-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Upload size={40} className="text-purple-400 group-hover:text-purple-300" />
                        )}
                      </div>
                      
                      <h3 className="text-xl font-bold text-white mb-2">
                        {uploadLoading ? 'Analyzing File...' : 'Click or Drag to Upload'}
                      </h3>
                      <p className="text-slate-400 text-sm max-w-md mx-auto">
                        Compatible with <span className="text-slate-300">PDF, Text</span>, <span className="text-slate-300">Audio (MP3)</span>, and <span className="text-slate-300">Video (MP4)</span>.
                        <br/><span className="text-xs opacity-70 mt-2 block">Max file size: 50MB</span>
                      </p>
                    </div>
                  </div>

                  {/* Uploaded Files List */}
                  {uploadedNotes.length > 0 && (
                    <motion.div 
                      variants={staggerContainer}
                      initial="hidden"
                      animate="show"
                      className="bg-slate-800/40 backdrop-blur-md border border-white/5 rounded-2xl p-5"
                    >
                      <h4 className="text-sm font-semibold text-slate-300 mb-4 px-2 flex items-center gap-2">
                        <CheckCircle size={16} className="text-green-500" /> Ready for Processing
                      </h4>
                      <div className="space-y-3">
                        {uploadedNotes.map((note, idx) => (
                           <motion.div 
                             key={`${note.fileName}-${note.createdAt}`} 
                             layout
                             variants={listItem}
                             className="flex items-center gap-4 bg-slate-900/60 p-4 rounded-xl border border-white/5 hover:border-purple-500/30 transition-colors"
                           >
                             <div className={`p-2 rounded-lg ${note.isAudio ? 'bg-orange-500/10 text-orange-400' : note.isVideo ? 'bg-red-500/10 text-red-400' : 'bg-blue-500/10 text-blue-400'}`}>
                               {note.isAudio ? <Mic size={18} /> : note.isVideo ? <Video size={18} /> : <FileText size={18} />}
                             </div>
                             <div className="flex-1 min-w-0">
                               <div className="text-sm font-medium truncate text-white">{note.fileName}</div>
                               <div className="text-xs text-slate-500">Processed • {new Date(note.createdAt).toLocaleTimeString()}</div>
                             </div>
                             <button onClick={() => setUploadedNotes(p => p.filter((_, i) => i !== idx))} className="text-slate-600 hover:text-red-400">
                               <XCircle size={18} />
                             </button>
                           </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Action Button */}
                  <button
                    onClick={handleStartExam}
                    disabled={examLoading || uploadedNotes.length === 0}
                    className="group w-full relative overflow-hidden bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white p-5 rounded-2xl font-bold text-lg shadow-xl shadow-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.99]"
                  >
                    <div className="relative z-10 flex items-center justify-center gap-3">
                      {examLoading ? (
                        <>
                          <Sparkles className="animate-spin" /> Generating Your Exam...
                        </>
                      ) : (
                        <>
                          Generate Exam <ChevronRight className="group-hover:translate-x-1 transition-transform" />
                        </>
                      )}
                    </div>
                    {/* Button Shine Effect */}
                    <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent z-0" />
                  </button>
                </motion.div>
              )}

              {/* --- STAGE 2: REVIEW --- */}
              {examStage === 'review' && (
                <motion.div 
                  key="review"
                  variants={pageVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="space-y-6"
                >
                  <div className="bg-slate-800/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6 md:p-8 max-h-[60vh] overflow-y-auto custom-scrollbar shadow-2xl">
                    <div className="flex items-center gap-2 mb-6 border-b border-white/10 pb-4">
                      <FileText className="text-purple-400" />
                      <h2 className="text-lg font-bold">Study Notes</h2>
                    </div>
                    <div className="prose prose-invert max-w-none prose-p:text-slate-300 prose-headings:text-white prose-strong:text-purple-300 prose-ul:list-disc prose-li:marker:text-purple-500">
                      <pre className="whitespace-pre-wrap font-sans text-sm md:text-base leading-relaxed">{reviewContent}</pre>
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => setExamStage('mcq')} 
                    className="w-full bg-purple-600 hover:bg-purple-500 text-white p-4 rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-2 hover:-translate-y-1 transition-all"
                  >
                    I'm Ready - Start Quiz <ChevronRight />
                  </button>
                </motion.div>
              )}

              {/* --- STAGE 3: MCQ --- */}
              {examStage === 'mcq' && mcqQuestions.length > 0 && (
                <motion.div 
                  key="mcq"
                  variants={pageVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="space-y-6"
                >
                  {/* Progress Bar */}
                  <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden">
                    <motion.div 
                      className="absolute top-0 left-0 h-full bg-gradient-to-r from-purple-500 to-indigo-500" 
                      initial={{ width: 0 }} 
                      animate={{ width: `${((currentMcqIndex + 1) / mcqQuestions.length) * 100}%` }} 
                    />
                  </div>

                  <div className="bg-slate-800/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6 md:p-10 min-h-[400px] flex flex-col justify-center shadow-2xl">
                    <div className="flex justify-between items-center mb-6">
                      <span className="text-purple-400 text-xs font-bold tracking-widest uppercase bg-purple-500/10 px-3 py-1 rounded-full">
                        Question {currentMcqIndex + 1} / {mcqQuestions.length}
                      </span>
                      <span className="text-slate-500 text-xs font-mono">2 Points</span>
                    </div>

                    <h2 className="text-xl md:text-2xl font-bold mb-8 leading-snug">{mcqQuestions[currentMcqIndex].question}</h2>
                    
                    <div className="grid grid-cols-1 gap-3">
                      {mcqQuestions[currentMcqIndex].options.map((option, idx) => {
                        // Determine styles based on state
                        let styleClass = "bg-slate-700/30 border-white/5 hover:bg-slate-700/50 hover:border-purple-500/30 text-slate-200";
                        if (selectedAnswer === option) {
                          if (isCorrect) styleClass = "bg-green-500/20 border-green-500 text-green-200 shadow-[0_0_15px_rgba(34,197,94,0.3)]";
                          else styleClass = "bg-red-500/20 border-red-500 text-red-200 shadow-[0_0_15px_rgba(239,68,68,0.3)]";
                        } else if (selectedAnswer && option === mcqQuestions[currentMcqIndex].correctAnswer) {
                          // Show correct answer if wrong one selected
                          styleClass = "bg-green-500/10 border-green-500/50 text-green-300 opacity-70";
                        } else if (selectedAnswer) {
                          styleClass = "opacity-40 cursor-not-allowed border-transparent";
                        }

                        return (
                          <button
                            key={idx}
                            onClick={() => handleMcqAnswer(option)}
                            disabled={selectedAnswer !== null}
                            className={`p-4 md:p-5 rounded-xl text-left border transition-all duration-300 font-medium ${styleClass}`}
                          >
                            <span className="mr-3 opacity-50">{String.fromCharCode(65 + idx)}.</span>
                            {option}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {selectedAnswer && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                       <button 
                        onClick={handleNextMcq} 
                        className="w-full bg-white text-slate-900 hover:bg-slate-200 p-4 rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-2 transition-colors"
                       >
                         {currentMcqIndex < mcqQuestions.length - 1 ? 'Next Question' : 'Continue to Part 2'} 
                         <ArrowLeft className="rotate-180" size={20} />
                       </button>
                    </motion.div>
                  )}
                </motion.div>
              )}

              {/* --- STAGE 4: FILL-IN --- */}
              {examStage === 'fill-in' && (
                <motion.div 
                  key="fill-in"
                  variants={pageVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="space-y-6"
                >
                  <div className="bg-slate-800/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6 md:p-8 shadow-2xl">
                    <div className="flex items-center gap-3 mb-8">
                       <div className="p-3 bg-indigo-500/20 rounded-lg text-indigo-400">
                         <FileText size={24} />
                       </div>
                       <div>
                         <h3 className="text-xl font-bold">Complete the Sentences</h3>
                         <p className="text-sm text-slate-400">Type the missing word or phrase for each statement.</p>
                       </div>
                    </div>
                    
                    <div className="space-y-8">
                      {fillInQuestions.map((q, idx) => (
                        <div key={q.id} className="space-y-3 group">
                          <label className="text-slate-300 text-sm md:text-base font-medium leading-relaxed block">
                            <span className="text-purple-400 font-bold mr-2">{idx + 1}.</span> 
                            {q.question}
                          </label>
                          <div className="relative">
                            <input 
                              type="text" 
                              placeholder="Type your answer here..."
                              className="w-full bg-slate-900/50 border border-white/10 rounded-xl p-4 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 focus:outline-none transition-all placeholder:text-slate-600"
                              value={fillInAnswers[q.id] || ''}
                              onChange={(e) => setFillInAnswers(p => ({ ...p, [q.id]: e.target.value }))}
                              disabled={submitLoading}
                            />
                            {fillInAnswers[q.id] && (
                              <CheckCircle size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-green-500 animate-pulse" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button 
                    onClick={handleFillSubmit} 
                    disabled={submitLoading}
                    className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white p-4 rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-3 transition-all active:scale-[0.99]"
                  >
                    {submitLoading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Analyzing Answers...
                      </>
                    ) : (
                      <>
                        Submit Exam <Check size={20} />
                      </>
                    )}
                  </button>
                </motion.div>
              )}

              {/* --- STAGE 5: MARKING --- */}
              {examStage === 'marking' && (
                <motion.div 
                  key="marking"
                  variants={pageVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="flex flex-col items-center justify-center py-20 text-center"
                >
                  <div className="relative w-40 h-40 mb-10">
                    <div className="absolute inset-0 border-8 border-slate-800 rounded-full" />
                    <svg className="absolute inset-0 w-full h-full -rotate-90">
                      <circle 
                        cx="80" cy="80" r="72" 
                        fill="none" 
                        stroke="url(#gradient)" 
                        strokeWidth="8"
                        strokeDasharray="452"
                        strokeDashoffset={452 - (452 * ((markingProgress.mcq + markingProgress.fillIn) / 200))}
                        className="transition-all duration-300 ease-out"
                      />
                      <defs>
                        <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#9333ea" />
                          <stop offset="100%" stopColor="#4f46e5" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-bold text-white">{Math.round((markingProgress.mcq + markingProgress.fillIn) / 2)}%</span>
                      <span className="text-xs text-slate-500 uppercase tracking-widest mt-1">Complete</span>
                    </div>
                  </div>

                  <h2 className="text-2xl font-bold mb-2 animate-pulse">AI Grading in Progress</h2>
                  <p className="text-slate-400 mb-8 max-w-sm">DwenLite is analyzing your written answers against the source material context...</p>
                  
                  <div className="w-full max-w-md space-y-4 bg-slate-800/50 p-6 rounded-2xl border border-white/5">
                     <div className="space-y-2">
                       <div className="flex justify-between text-xs uppercase text-slate-400 font-bold tracking-wider">
                         <span>Checking MCQ</span>
                         <span className={markingProgress.mcq === 100 ? "text-green-400" : "text-white"}>{markingProgress.mcq}%</span>
                       </div>
                       <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                         <motion.div className="h-full bg-blue-500" animate={{ width: `${markingProgress.mcq}%` }} />
                       </div>
                     </div>
                     
                     <div className="space-y-2">
                       <div className="flex justify-between text-xs uppercase text-slate-400 font-bold tracking-wider">
                         <span>Analyzing Written Answers</span>
                         <span className={markingProgress.fillIn === 100 ? "text-green-400" : "text-white"}>{markingProgress.fillIn}%</span>
                       </div>
                       <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                         <motion.div className="h-full bg-purple-500" animate={{ width: `${markingProgress.fillIn}%` }} />
                       </div>
                     </div>
                  </div>
                </motion.div>
              )}

              {/* --- STAGE 6: RESULTS --- */}
              {examStage === 'results' && (
                <motion.div 
                  key="results"
                  variants={pageVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="space-y-8"
                >
                  
                  {/* Score Dashboard */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="col-span-1 md:col-span-3 bg-gradient-to-br from-purple-900/80 to-indigo-900/80 backdrop-blur-xl border border-purple-500/30 rounded-3xl p-8 flex flex-col md:flex-row items-center justify-between text-center md:text-left shadow-2xl relative overflow-hidden">
                       <div className="relative z-10">
                         <span className="text-purple-200 text-sm uppercase font-bold tracking-wider mb-2 block">Final Result</span>
                         <div className="flex items-baseline gap-2 justify-center md:justify-start">
                           <span className="text-6xl font-bold text-white tracking-tight">{scores.total}</span>
                           <span className="text-2xl text-white/40">/100</span>
                         </div>
                         <div className={`inline-block mt-3 px-4 py-1.5 rounded-full text-xs font-bold border ${
                           scores.total >= 70 ? 'bg-green-500/20 border-green-500/30 text-green-300' : 'bg-orange-500/20 border-orange-500/30 text-orange-300'
                         }`}>
                           {scores.total >= 90 ? 'Outstanding!' : scores.total >= 70 ? 'Good Job!' : 'Needs Improvement'}
                         </div>
                       </div>
                       
                       {/* Decorative Circle */}
                       <div className="hidden md:block w-32 h-32 rounded-full border-8 border-white/10 relative">
                          <div className="absolute inset-0 flex items-center justify-center">
                            <GraduationCap size={40} className="text-white/50" />
                          </div>
                       </div>

                       {/* Confetti if high score (simple css) */}
                       {scores.total > 80 && (
                         <div className="absolute top-0 right-0 w-full h-full pointer-events-none opacity-30 bg-[url('https://assets.codepen.io/t-1/confetti.png')] bg-cover" />
                       )}
                    </div>

                    <div className="bg-slate-800/40 border border-white/5 rounded-2xl p-6 text-center hover:bg-slate-800/60 transition-colors">
                      <div className="text-slate-400 text-xs font-bold uppercase mb-2">MCQ Score</div>
                      <div className="text-2xl font-bold">{scores.mcq} <span className="text-sm text-slate-500">/ 80</span></div>
                    </div>
                    <div className="bg-slate-800/40 border border-white/5 rounded-2xl p-6 text-center hover:bg-slate-800/60 transition-colors">
                      <div className="text-slate-400 text-xs font-bold uppercase mb-2">Written Score</div>
                      <div className="text-2xl font-bold">{scores.fillIn} <span className="text-sm text-slate-500">/ 20</span></div>
                    </div>
                    <div className="bg-slate-800/40 border border-white/5 rounded-2xl p-6 text-center hover:bg-slate-800/60 transition-colors">
                       <div className="text-slate-400 text-xs font-bold uppercase mb-2">Accuracy</div>
                       <div className="text-2xl font-bold">{Math.round((scores.total / 100) * 100)}%</div>
                    </div>
                  </div>

                  {/* AI Tutor Chat */}
                  <div className="bg-slate-800/60 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                    <div className="bg-white/5 p-4 border-b border-white/5 flex items-center gap-3">
                      <div className="p-2 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-lg shadow-lg">
                        <Sparkles size={18} className="text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-white">Ask DwenLite AI</h3>
                        <p className="text-xs text-slate-400">Ask about your mistakes or for more explanation</p>
                      </div>
                    </div>

                    <div className="p-4 md:p-6">
                      <div className="h-64 overflow-y-auto mb-4 space-y-4 pr-2 custom-scrollbar" ref={chatContainerRef}>
                        {chatHistory.length === 0 && (
                          <div className="text-center text-slate-500 py-10">
                            <p>Ask me anything about the exam content!</p>
                          </div>
                        )}
                        {chatHistory.map((msg, i) => (
                          <div key={i} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-2xl px-5 py-3 text-sm leading-relaxed shadow-md ${
                              msg.type === 'user' 
                                ? 'bg-purple-600 text-white rounded-br-none' 
                                : 'bg-slate-700 text-slate-200 rounded-bl-none relative group border border-white/5'
                            }`}>
                              {msg.content}
                              
                              {msg.type === 'ai' && (
                                <button 
                                  onClick={() => setShowReportForm(i)} 
                                  className="absolute -right-8 top-1 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all p-1"
                                  title="Report Content"
                                >
                                  <AlertTriangle size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                        
                        {/* Report Form */}
                        <AnimatePresence>
                          {showReportForm !== null && (
                            <motion.div 
                              initial={{ opacity: 0, height: 0 }} 
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="bg-red-500/5 border border-red-500/20 p-4 rounded-xl mb-4 mx-4"
                            >
                              <p className="text-xs font-bold text-red-400 mb-2 uppercase">Report Inappropriate Content</p>
                              <input 
                                className="w-full bg-slate-900/50 border border-red-500/30 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 outline-none focus:border-red-500 mb-3"
                                placeholder="Describe the issue..."
                                value={reportReason}
                                onChange={(e) => setReportReason(e.target.value)}
                              />
                              <div className="flex justify-end gap-3">
                                <button onClick={() => setShowReportForm(null)} className="text-xs text-slate-400 hover:text-white transition-colors">Cancel</button>
                                <button 
                                  onClick={() => handleReportContent(showReportForm, reportReason)} 
                                  className="text-xs bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-lg transition-colors shadow-lg shadow-red-500/20"
                                >
                                  Submit Report
                                </button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      <form onSubmit={handleChatSubmit} className="flex gap-2">
                        <input 
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          placeholder="Type your question here..."
                          className="flex-1 bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all placeholder:text-slate-600 text-white"
                          disabled={chatLoading}
                        />
                        <button 
                          disabled={chatLoading} 
                          type="submit" 
                          className="bg-purple-600 p-3 rounded-xl hover:bg-purple-500 text-white transition-colors disabled:opacity-50 shadow-lg shadow-purple-500/20"
                        >
                          {chatLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send size={20} />}
                        </button>
                      </form>
                    </div>
                  </div>

                  {/* Detailed Results List */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold text-slate-300 px-2">Detailed Breakdown</h3>
                    
                    {fillInResults.map((res, idx) => (
                      <div key={idx} className={`p-5 rounded-2xl border transition-all ${
                        res.isCorrect 
                          ? res.hasTypos 
                            ? 'bg-yellow-500/5 border-yellow-500/20 hover:bg-yellow-500/10' // Correct but w/ typos
                            : 'bg-green-500/5 border-green-500/20 hover:bg-green-500/10' 
                          : 'bg-red-500/5 border-red-500/20 hover:bg-red-500/10'
                      }`}>
                         <div className="flex justify-between items-start mb-3">
                           <span className="text-sm font-bold text-slate-300">Question {idx + 1} (Written)</span>
                           
                           {/* Status Badge */}
                           {res.isCorrect ? (
                             res.hasTypos ? (
                               <span className="flex items-center gap-1 text-xs font-bold text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded-full">
                                 <SpellCheck size={12}/> Correct (Check Spelling)
                               </span>
                             ) : (
                               <span className="flex items-center gap-1 text-xs font-bold text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">
                                 <CheckCircle size={12}/> Correct (+2)
                               </span>
                             )
                           ) : (
                             <span className="flex items-center gap-1 text-xs font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
                               <XCircle size={12}/> Incorrect
                             </span>
                           )}
                         </div>
                         <p className="text-sm mb-4 text-white font-medium">{res.question}</p>
                         
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                           <div className="bg-black/20 p-3 rounded-lg border border-white/5">
                             <div className="text-xs text-slate-500 mb-1">Your Answer</div>
                             <div className={res.isCorrect ? (res.hasTypos ? 'text-yellow-300' : 'text-green-300') : 'text-red-300'}>
                               {res.userAnswer || '(Empty)'}
                             </div>
                           </div>
                           <div className="bg-black/20 p-3 rounded-lg border border-white/5">
                             <div className="text-xs text-slate-500 mb-1">Expected Answer</div>
                             <div className="text-purple-300">{res.expectedAnswer}</div>
                           </div>
                         </div>
                         
                         {/* Show explanation if wrong OR if there are typos/comments */}
                         {(!res.isCorrect || res.explanation) && (
                           <div className="mt-3 text-xs text-slate-400 italic flex gap-2 items-start">
                             <AlertCircle size={14} className="mt-0.5 shrink-0" />
                             {res.explanation}
                           </div>
                         )}
                      </div>
                    ))}
                    
                    {/* Collapsible MCQ Results could go here if list is too long */}
                  </div>

                  {/* Reset Button */}
                  <div className="flex justify-center pt-8">
                    <button 
                      onClick={resetExam} 
                      className="flex items-center gap-2 px-8 py-3 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 hover:text-white transition-all font-medium"
                    >
                      <RefreshCw size={18} /> Start New Exam
                    </button>
                  </div>

                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </main>

        {/* --- MOBILE NAVIGATION --- */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur-xl border-t border-white/5 px-6 py-4 flex justify-between items-center z-50 pb-safe">
          <Link to="/dashboard" className="text-slate-400 flex flex-col items-center gap-1">
            <LayoutDashboard size={24} />
            <span className="text-[10px] font-medium">Home</span>
          </Link>
          <div className="text-purple-400 flex flex-col items-center gap-1">
            <BrainCircuit size={24} className="drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]" />
            <span className="text-[10px] font-medium">Exam</span>
          </div>
          <Link to="/community-support" className="text-slate-400 flex flex-col items-center gap-1">
            <HelpCircle size={24} />
            <span className="text-[10px] font-medium">Help</span>
          </Link>
          <button onClick={() => auth.signOut()} className="text-red-400 flex flex-col items-center gap-1">
            <LogOut size={24} />
            <span className="text-[10px] font-medium">Exit</span>
          </button>
        </nav>

      </div>
    </div>
  );
}

export default ExamsPreparation;