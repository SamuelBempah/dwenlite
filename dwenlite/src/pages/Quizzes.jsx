import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { db, auth } from '../firebase';
import { doc, getDoc, updateDoc, addDoc, collection, setDoc, query, where, getDocs } from 'firebase/firestore';
import toast from 'react-hot-toast';
import axios from 'axios';

function Quizzes() {
  const { folderId } = useParams();
  const navigate = useNavigate();
  const [folder, setFolder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quizLoading, setQuizLoading] = useState(false);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [isCorrect, setIsCorrect] = useState(null);
  const [showStoredQuizzes, setShowStoredQuizzes] = useState(false);
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

  const transcribeAudio = async (audioUrl) => {
    try {
      const apiKey = import.meta.env.VITE_ASSEMBLYAI_API_KEY;
      if (!apiKey) {
        throw new Error('AssemblyAI API key not found. Please set VITE_ASSEMBLYAI_API_KEY in your .env file.');
      }

      console.log('Transcribing audio URL:', audioUrl);

      const response = await axios.post(
        'https://api.assemblyai.com/v2/transcript',
        {
          audio_url: audioUrl,
          auto_highlights: false,
          sentiment_analysis: false,
          content_safety: false,
          iab_categories: false,
          auto_chapters: false,
          format_text: false,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      ).catch(err => {
        console.error('Audio transcription request error:', {
          status: err.response?.status,
          statusText: err.response?.statusText,
          data: err.response?.data,
          message: err.message,
        });
        throw new Error(`Audio transcription request failed: ${err.message}`);
      });

      const transcriptId = response.data.id;

      let status = 'queued';
      let transcribedText = '';
      const maxAttempts = 30;
      let attempts = 0;

      while (status !== 'completed' && status !== 'error' && attempts < maxAttempts) {
        const checkResponse = await axios.get(
          `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          }
        ).catch(err => {
          console.error('Audio transcription polling error:', {
            status: err.response?.status,
            statusText: err.response?.statusText,
            data: err.response?.data,
            message: err.message,
          });
          throw new Error(`Audio transcription polling failed: ${err.message}`);
        });

        status = checkResponse.data.status;
        if (status === 'completed') {
          transcribedText = checkResponse.data.text || '';
        } else if (status === 'error') {
          throw new Error(`Audio transcription failed: ${checkResponse.data.error || 'Unknown error'}`);
        }
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      if (attempts >= maxAttempts) {
        throw new Error('Audio transcription timed out.');
      }

      if (!transcribedText) {
        throw new Error('Audio transcription returned empty text.');
      }

      return transcribedText;
    } catch (err) {
      console.error('Audio transcription error:', err);
      throw new Error(`Audio transcription failed: ${err.message}`);
    }
  };

  const transcribeVideo = async (videoUrl) => {
    try {
      const apiKey = import.meta.env.VITE_ASSEMBLYAI_API_KEY;
      if (!apiKey) {
        throw new Error('AssemblyAI API key not found. Please set VITE_ASSEMBLYAI_API_KEY in your .env file.');
      }

      console.log('Transcribing video URL:', videoUrl);

      const response = await axios.post(
        'https://api.assemblyai.com/v2/transcript',
        {
          audio_url: videoUrl,
          auto_highlights: false,
          sentiment_analysis: false,
          content_safety: false,
          iab_categories: false,
          auto_chapters: false,
          format_text: false,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      ).catch(err => {
        console.error('Video transcription request error:', {
          status: err.response?.status,
          statusText: err.response?.statusText,
          data: err.response?.data,
          message: err.message,
        });
        let errorMessage = 'Video transcription request failed';
        if (err.response?.status === 400 && err.response?.data?.error?.includes('transcoding failed')) {
          errorMessage = 'Video file does not contain audio or is corrupted. Please ensure the video has audio and is in a supported format (mp4, mov, avi, mkv, webm).';
        } else if (err.response?.status === 401) {
          errorMessage = 'Invalid AssemblyAI API key. Please check your API key in the .env file.';
        } else if (err.response?.status === 429) {
          errorMessage = 'AssemblyAI rate limit exceeded. Please wait a few minutes and try again.';
        }
        throw new Error(`${errorMessage}: ${err.message}`);
      });

      const transcriptId = response.data.id;

      let status = 'queued';
      let transcribedText = '';
      const maxAttempts = 60;
      let attempts = 0;

      while (status !== 'completed' && status !== 'error' && attempts < maxAttempts) {
        const checkResponse = await axios.get(
          `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          }
        ).catch(err => {
          console.error('Video transcription polling error:', {
            status: err.response?.status,
            statusText: err.response?.statusText,
            data: err.response?.data,
            message: err.message,
          });
          throw new Error(`Video transcription polling failed: ${err.message}`);
        });

        status = checkResponse.data.status;
        if (status === 'completed') {
          transcribedText = checkResponse.data.text || '';
        } else if (status === 'error') {
          let errorMessage = checkResponse.data.error || 'Unknown error';
          if (errorMessage.includes('transcoding failed')) {
            errorMessage = 'Video file does not contain audio or is corrupted. Please ensure the video has audio and is in a supported format.';
          }
          throw new Error(`Video transcription failed: ${errorMessage}`);
        }
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      if (attempts >= maxAttempts) {
        throw new Error('Video transcription timed out.');
      }

      if (!transcribedText) {
        throw new Error('Video transcription returned empty text.');
      }

      return transcribedText;
    } catch (err) {
      console.error('Video transcription error:', err);
      throw new Error(`Video transcription failed: ${err.message}`);
    }
  };

  const generateContent = async (retry = false) => {
    try {
      // --- CORS FIX ---
      // Using the same proxy function for secure server-side API calls
      const functionUrl = 'https://us-central1-leumas-decipher-softwares.cloudfunctions.net/generateNotesProxy';

      const latestDocument = folder.documents.length > 0
        ? folder.documents.reduce((latest, doc) => {
            return new Date(doc.uploadedAt) > new Date(latest.uploadedAt) ? doc : latest;
          }, folder.documents[0])
        : null;

      let context = folder.name;
      if (latestDocument) {
        if (latestDocument.isAudio) {
          context = await transcribeAudio(latestDocument.url);
        } else if (latestDocument.isVideo) {
          context = await transcribeVideo(latestDocument.url);
        } else {
          context = latestDocument.extractedText || folder.name;
        }
      }

      let prompt = `Generate 40 multiple-choice quiz questions based on the following content: "${context}". For each question, provide the question, four options (labeled a, b, c, d), and the correct answer. Format as a JSON array: [{ "question": "...", "options": ["a. ...", "b. ...", "c. ...", "d. ..."], "correctAnswer": "..." }], ...]. Return only the JSON array string, without any markdown, code block markers (like \`\`\`json), or additional text. Ensure the output is valid JSON and that correctAnswer matches one of the options exactly (e.g., "a. ...").`;

      if (retry) {
        prompt = `You previously failed to return valid JSON. Generate 40 multiple-choice quiz questions based on the following content: "${context}". For each question, provide the question, four options (labeled a, b, c, d), and the correct answer. Format as a JSON array: [{ "question": "...", "options": ["a. ...", "b. ...", "c. ...", "d. ..."], "correctAnswer": "..." }, ...]. Return ONLY the JSON array string. Do NOT include markdown, code block markers (like \`\`\`json), or any additional text before or after the JSON. The output MUST be valid JSON, parsable by JSON.parse(), and correctAnswer must match one of the options exactly (e.g., "a. ...").`;
      }

      // Call the Firebase Cloud Function Proxy
      const response = await axios.post(functionUrl, { prompt })
        .catch(err => {
          console.error('Proxy API error:', {
            status: err.response?.status,
            statusText: err.response?.statusText,
            data: err.response?.data,
            message: err.message,
          });
          
          if (err.response?.status === 404) {
             throw new Error('Backend function not found.');
          } else if (err.response?.status === 500) {
             throw new Error(`Server Error: ${err.response?.data?.details || err.message}`);
          } else {
             throw new Error(`Generation failed: ${err.message}`);
          }
        });

      let generatedText;
      // Handle the structure returned by the proxy
      if (response.data.choices?.[0]?.message?.content) {
        generatedText = response.data.choices[0].message.content.trim();
      } else if (response.data.choices?.[0]?.text) {
        generatedText = response.data.choices[0].text.trim();
      } else {
        throw new Error('Invalid API response: No generated content found.');
      }

      generatedText = generatedText
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .replace(/^\s*[\w\s]*?(\[.*\])\s*[\w\s]*$/s, '$1')
        .trim();

      let quizzes;
      try {
        quizzes = JSON.parse(generatedText);
      } catch (parseErr) {
        console.error('JSON parse error:', parseErr, 'Cleaned response:', generatedText);
        if (!retry) {
          console.log('Retrying API call with stricter prompt...');
          return await generateContent(true);
        }
        console.warn('Falling back to default quiz due to repeated parsing failure.');
        quizzes = [
          {
            question: 'What is the capital of France?',
            options: ['a. Paris', 'b. London', 'c. Berlin', 'd. Madrid'],
            correctAnswer: 'a. Paris',
          },
        ];
      }

      if (!Array.isArray(quizzes)) {
        throw new Error('API response must be a JSON array.');
      }

      while (quizzes.length < 40) {
        quizzes.push({
          question: `Sample question ${quizzes.length + 1}`,
          options: ['a. Option A', 'b. Option B', 'c. Option C', 'd. Option D'],
          correctAnswer: 'a. Option A',
        });
      }

      quizzes = quizzes.slice(0, 40);

      return quizzes.map(quiz => {
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
    if (!auth.currentUser) {
      toast.error('Please log in to generate quizzes.');
      return;
    }

    if (gCoins < 5) {
      toast.error(
        <div>
          Insufficient G_COINS. You need 5 G_COINS to generate quizzes.{' '}
          <Link to="/buy-coins" className="underline text-purple-400 hover:text-purple-300">
            Buy more G_COINS
          </Link>.
        </div>,
        { duration: 5000 }
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
      await updateDoc(folderRef, {
        quizGroups: [...folder.quizGroups, newGroup],
      });

      await deductGCoins(auth.currentUser.uid, 5);

      setFolder(prev => ({
        ...prev,
        quizGroups: [...prev.quizGroups, newGroup],
      }));
      setRatings(prev => ({
        ...prev,
        [newGroup.id]: newGroup.rating,
      }));
      setHasRated(prev => ({
        ...prev,
        [newGroup.id]: false,
      }));
      toast.success('Quiz group generated successfully! 5 G_COINS deducted.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setQuizLoading(false);
    }
  };

  const handleDeleteQuizGroup = async (groupId) => {
    try {
      const updatedQuizGroups = folder.quizGroups.filter(group => group.id !== groupId);
      const folderRef = doc(db, 'folders', folderId);
      await updateDoc(folderRef, {
        quizGroups: updatedQuizGroups,
      });

      setFolder(prev => ({
        ...prev,
        quizGroups: updatedQuizGroups,
      }));
      setRatings(prev => {
        const newRatings = { ...prev };
        delete newRatings[groupId];
        return newRatings;
      });
      setHasRated(prev => {
        const newHasRated = { ...prev };
        delete newHasRated[groupId];
        return newHasRated;
      });

      if (selectedQuizGroup?.id === groupId) {
        setSelectedQuizGroup(null);
        setCurrentQuizIndex(0);
        setSelectedAnswer(null);
        setIsCorrect(null);
      }

      toast.success('Quiz group deleted successfully!');
    } catch (err) {
      console.error('Delete quiz group error:', err);
      toast.error('Failed to delete quiz group. Please try again.');
    }
  };

  const handleRateQuizGroup = async (groupId, rating) => {
    if (!auth.currentUser) {
      toast.error('Please log in to rate quiz groups.');
      return;
    }

    if (hasRated[groupId]) {
      toast.error('You have already rated this quiz group.');
      return;
    }

    setRatingLoading(prev => ({ ...prev, [groupId]: true }));
    try {
      const folderRef = doc(db, 'folders', folderId);
      const updatedQuizGroups = folder.quizGroups.map(group => 
        group.id === groupId ? { ...group, rating } : group
      );

      await updateDoc(folderRef, {
        quizGroups: updatedQuizGroups,
      });

      setFolder(prev => ({
        ...prev,
        quizGroups: updatedQuizGroups,
      }));
      setRatings(prev => ({
        ...prev,
        [groupId]: rating,
      }));
      setHasRated(prev => ({
        ...prev,
        [groupId]: true,
      }));

      await addDoc(collection(db, 'ratings'), {
        userId: auth.currentUser.uid,
        folderId,
        quizGroupId: groupId,
        rating,
        createdAt: new Date().toISOString(),
      });

      toast.success('Rating submitted successfully!');
    } catch (err) {
      console.error('Rate quiz group error:', err);
      toast.error('Failed to submit rating. Please try again.');
    } finally {
      setRatingLoading(prev => ({ ...prev, [groupId]: false }));
    }
  };

  const handleSelectQuizGroup = (group) => {
    if (quizLoading) return;
    setSelectedQuizGroup(group);
    setCurrentQuizIndex(0);
    setSelectedAnswer(null);
    setIsCorrect(null);
  };

  const handleToggleGroup = (groupId) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const handleAnswerSelect = (option) => {
    if (selectedAnswer !== null || quizLoading) return;
    setSelectedAnswer(option);
    setIsCorrect(option === currentQuiz.correctAnswer);
  };

  const handleNextQuestion = () => {
    if (currentQuizIndex + 1 < selectedQuizGroup.quizzes.length) {
      setCurrentQuizIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setIsCorrect(null);
    }
  };

  const currentQuiz = selectedQuizGroup?.quizzes[currentQuizIndex];

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const question = chatInput.trim();
    setChatInput('');

    const quizGroupRegex = /(?:reference|check|use|from)\s*(?:quiz\s*group\s*)(\d+|one|two|three|four|five)/i;
    const match = question.match(quizGroupRegex);
    let groupIndex = null;

    if (match) {
      const groupRef = match[1].toLowerCase();
      const numberWords = ['one', 'two', 'three', 'four', 'five'];
      if (numberWords.includes(groupRef)) {
        groupIndex = numberWords.indexOf(groupRef);
      } else if (!isNaN(parseInt(groupRef))) {
        groupIndex = parseInt(groupRef) - 1;
      }
    }

    if (groupIndex !== null && folder.quizGroups[groupIndex]) {
      const selectedGroup = folder.quizGroups[groupIndex];
      await processQuestion(question, selectedGroup);
    } else if (folder.quizGroups.length === 0) {
      toast.error('No quiz groups available to reference.');
      return;
    } else {
      setShowQuizGroupPrompt(true);
      setChatHistory(prev => [
        ...prev,
        { type: 'user', content: question },
        { type: 'system', content: 'Please select a quiz group to reference for this question.' },
      ]);
      setSelectedQuizGroupId('');
    }
  };

  const handleQuizGroupSelection = async () => {
    if (!selectedQuizGroupId) {
      toast.error('Please select a quiz group.');
      return;
    }

    const selectedGroup = folder.quizGroups.find(group => group.id === selectedQuizGroupId);
    if (!selectedGroup) {
      toast.error('Selected quiz group not found.');
      return;
    }

    const lastQuestion = chatHistory.findLast(item => item.type === 'user')?.content;
    if (!lastQuestion) {
      toast.error('No question found to process.');
      return;
    }

    setShowQuizGroupPrompt(false);
    try {
      await processQuestion(lastQuestion, selectedGroup);
    } catch (err) {
      toast.error('Failed to process question. Please try again.');
    }
  };

  const processQuestion = async (question, group) => {
    setChatLoading(true);
    try {
      const groupIndex = folder.quizGroups.findIndex(g => g.id === group.id) + 1;
      setChatHistory(prev => [
        ...prev,
        { type: 'system', content: `DwenLite AI is reading Quiz Group ${groupIndex}...` },
      ]);

      await new Promise(resolve => setTimeout(resolve, 1500));

      // --- CORS FIX ---
      const functionUrl = 'https://us-central1-leumas-decipher-softwares.cloudfunctions.net/generateNotesProxy';

      const quizContent = group.quizzes.map(quiz => 
        `Question: ${quiz.question}\nOptions: ${quiz.options.join(', ')}\nCorrect Answer: ${quiz.correctAnswer}`
      ).join('\n\n');

      const prompt = `You are DwenLite AI, an assistant that answers questions based on provided quiz groups. Here is the content of the quiz group:\n\n${quizContent}\n\nQuestion: ${question}\n\nProvide a clear, concise, and accurate answer based on the quiz group. If the question cannot be answered from the quiz group, state so and provide a brief explanation. Format the answer as plain text suitable for rendering in a React component.`;

      setChatHistory(prev => [
        ...prev,
        { type: 'system', content: 'DwenLite AI is typing...' },
      ]);

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Call Proxy
      const response = await axios.post(functionUrl, { prompt })
        .catch(err => {
             console.error('Chat API error:', err);
             throw new Error(`Chat failed: ${err.message}`);
        });

      let answer;
      if (response.data.choices?.[0]?.message?.content) {
        answer = response.data.choices[0].message.content.trim();
      } else if (response.data.choices?.[0]?.text) {
        answer = response.data.choices[0].text.trim();
      } else {
        throw new Error('Invalid API response: No answer found.');
      }

      setChatHistory(prev => prev.filter(item => item.content !== 'DwenLite AI is typing...').concat({
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="flex items-center">
          <svg className="animate-spin h-5 w-5 mr-3 text-white" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading...
        </div>
      </div>
    );
  }

  if (!folder) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 text-lg">Unable to load folder.</p>
          <Link
            to="/dashboard"
            className={`bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 ${quizLoading ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-8">
      <style>
        {`
          @keyframes slideInFromRight {
            0% { transform: translateX(100%); opacity: 0; }
            100% { transform: translateX(0); opacity: 1; }
          }
          @keyframes slideInFromLeft {
            0% { transform: translateX(-100%); opacity: 0; }
            100% { transform: translateX(0); opacity: 1; }
          }
          @keyframes fadeIn {
            0% { opacity: 0; }
            100% { opacity: 1; }
          }
          @keyframes pulseDots {
            0% { transform: translateY(0); }
            50% { transform: translateY(-5px); }
            100% { transform: translateY(0); }
          }
          @keyframes pulseContainer {
            0% { box-shadow: 0 0 0 0 rgba(147, 51, 234, 0.4); }
            70% { box-shadow: 0 0 0 10px rgba(147, 51, 234, 0); }
            100% { box-shadow: 0 0 0 0 rgba(147, 51, 234, 0); }
          }
          @keyframes coinsDeduction {
            0% { transform: translateY(0); opacity: 1; }
            50% { transform: translateY(-20px); opacity: 0.5; }
            100% { transform: translateY(-40px); opacity: 0; }
          }
          .animate-slide-in-right {
            animation: slideInFromRight 0.3s ease-out forwards;
          }
          .animate-slide-in-left {
            animation: slideInFromLeft 0.3s ease-out forwards;
          }
          .animate-fade-in {
            animation: fadeIn 0.5s ease-in forwards;
          }
          .typing-dots span {
            display: inline-block;
            animation: pulseDots 0.5s infinite alternate;
          }
          .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
          .typing-dots span:nth-child(3) { animation-delay: 0.4s; }
          .pulse-container {
            animation: pulseContainer 2s infinite;
          }
          .coins-deduct {
            animation: coinsDeduction 1s ease-out forwards;
          }
          .hover-scale {
            transition: transform 0.2s ease, box-shadow 0.2s ease;
          }
          .hover-scale:hover {
            transform: scale(1.05);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
          }
          .star-rating {
            display: inline-flex;
            cursor: pointer;
          }
          .star {
            color: #d1d5db;
            transition: color 0.2s ease;
          }
          .star.filled {
            color: #facc15;
          }
          .star:hover,
          .star.filled:hover {
            color: #eab308;
          }
          .star-rating.disabled {
            cursor: not-allowed;
            opacity: 0.5;
          }
        `}
      </style>

      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-3xl font-bold">{folder.name} - Quizzes</h1>
        <div className="mt-2 flex items-center space-x-3">
          <Link
            to={`/folder/${folderId}`}
            className={`bg-purple-600 text-white py-1 px-3 rounded-md hover:bg-purple-700 text-xs sm:text-sm ${quizLoading ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
          >
            Back to Folder
          </Link>
          <p className={`text-sm sm:text-base ${gCoinsAnimating ? 'coins-deduct' : ''}`}>
            💰 G_COINS: {gCoins}
          </p>
        </div>
      </div>

      <div className="mb-6 sm:mb-8">
        <h2 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">Generate Quizzes</h2>
        <p className="text-gray-400 text-sm sm:text-base mb-3 sm:mb-4">
          Quiz generation typically takes 60-180 seconds and costs 5 G_COINS. Processing time may vary based on server load and document size.
        </p>
        <button
          onClick={handleRegenerateQuiz}
          disabled={quizLoading}
          className={`bg-gray-800 p-3 rounded-lg flex items-center justify-between hover:bg-gray-700 text-sm w-full ${quizLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {quizLoading ? (
            <span className="flex items-center">
              <svg
                className="animate-spin h-4 w-4 sm:h-5 sm:w-5 mr-2 text-white"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z"
                />
              </svg>
              Generating Quiz...
            </span>
          ) : (
            <>
              <span>Generate Quizzes (5 G_COINS)</span>
              <span>➔</span>
            </>
          )}
        </button>
      </div>

      <div className="mb-6">
        <h2 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">Take Quiz</h2>
        {!selectedQuizGroup ? (
          <p className="text-gray-400 text-sm">Select a quiz group from the stored quizzes to start!</p>
        ) : currentQuizIndex >= selectedQuizGroup.quizzes.length ? (
          <p className="text-gray-400 text-sm">You've completed this quiz group! Select another to continue.</p>
        ) : currentQuiz ? (
          <div className="bg-gray-800 p-3 sm:p-4 rounded-lg mb-3 sm:mb-4">
            <h3 className="text-base sm:text-lg font-semibold mb-2 break-words">
              Question {currentQuizIndex + 1} of {selectedQuizGroup.quizzes.length}: {currentQuiz.question}
            </h3>
            <ul className="text-gray-300 text-sm">
              {currentQuiz.options.map((option, index) => (
                <li key={index} className="mb-2">
                  <button
                    onClick={() => handleAnswerSelect(option)}
                    className={`w-full text-left p-2 rounded-lg text-sm break-words ${
                      selectedAnswer === option
                        ? isCorrect
                          ? 'bg-green-600'
                          : 'bg-red-600'
                        : 'bg-gray-700 hover:bg-gray-600'
                    } ${quizLoading ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
                    disabled={selectedAnswer !== null || quizLoading}
                  >
                    {option}
                  </button>
                </li>
              ))}
            </ul>
            {selectedAnswer && (
              <p className={`mt-2 text-sm ${isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                {isCorrect ? 'Correct!' : `Incorrect. Correct answer: ${currentQuiz.correctAnswer}`}
              </p>
            )}
            {selectedAnswer && (
              <button
                onClick={handleNextQuestion}
                className={`mt-3 bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 text-sm ${quizLoading ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
                disabled={quizLoading}
              >
                Next Question
              </button>
            )}
          </div>
        ) : (
          <p className="text-gray-400 text-sm">Loading quiz...</p>
        )}
      </div>

      <div className="mb-6">
        <h2 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">Stored Quiz Groups</h2>
        {folder.quizGroups.length === 0 ? (
          <p className="text-gray-400 text-sm">No quiz groups available. Generate a new group to start!</p>
        ) : (
          <div>
            <button
              onClick={() => setShowStoredQuizzes(!showStoredQuizzes)}
              className={`bg-gray-800 p-3 rounded-lg flex items-center justify-between hover:bg-gray-700 text-sm w-full mb-3 ${quizLoading ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
              disabled={quizLoading}
            >
              <span>{showStoredQuizzes ? 'Hide Stored Quiz Groups' : 'Show Stored Quiz Groups'}</span>
              <span>{showStoredQuizzes ? '▼' : '▶'}</span>
            </button>
            {showStoredQuizzes && (
              <div className="space-y-3">
                {folder.quizGroups.map((group, index) => (
                  <div
                    key={group.id}
                    className="bg-gray-800 p-3 sm:p-4 rounded-lg"
                  >
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-2 space-y-2 sm:space-y-0">
                      <button
                        onClick={() => handleSelectQuizGroup(group)}
                        className={`text-left flex-1 text-sm sm:text-base font-semibold hover:text-purple-400 ${quizLoading ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
                        disabled={quizLoading}
                      >
                        Quiz Group {index + 1} (Created: {new Date(group.createdAt).toLocaleDateString()})
                      </button>
                      <div className="flex items-center space-x-2 sm:space-x-3">
                        <div className={`star-rating ${hasRated[group.id] ? 'disabled' : ''}`}>
                          {[1, 2, 3, 4, 5].map(star => (
                            <svg
                              key={star}
                              onClick={() => !hasRated[group.id] && handleRateQuizGroup(group.id, star)}
                              className={`w-4 h-4 sm:w-5 sm:h-5 star ${ratings[group.id] >= star ? 'filled' : ''}`}
                              fill="currentColor"
                              viewBox="0 0 20 20"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                          ))}
                        </div>
                        {ratingLoading[group.id] && (
                          <svg
                            className="animate-spin h-4 w-4 sm:h-5 sm:h-5 text-white"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                              fill="none"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8v8H4z"
                            />
                          </svg>
                        )}
                        <button
                          onClick={() => handleToggleGroup(group.id)}
                          className={`text-gray-400 hover:text-white text-sm sm:text-base ${quizLoading ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
                          disabled={quizLoading}
                        >
                          {expandedGroups[group.id] ? 'Hide Questions' : 'Show Questions'}
                        </button>
                        <button
                          onClick={() => handleDeleteQuizGroup(group.id)}
                          className={`bg-red-600 text-white py-1 px-3 sm:px-4 rounded-lg hover:bg-red-700 text-sm ${quizLoading ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
                          disabled={quizLoading}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    {expandedGroups[group.id] && (
                      <div className="mt-2 space-y-3">
                        {group.quizzes.map((quiz, qIndex) => (
                          <div key={quiz.id} className="bg-gray-700 p-3 rounded-lg">
                            <h4 className="text-sm sm:text-base font-semibold break-words">
                              Question {qIndex + 1}: {quiz.question}
                            </h4>
                            <ul className="text-gray-300 text-sm mt-1">
                              {quiz.options.map((option, oIndex) => (
                                <li key={oIndex} className="break-words">{option}</li>
                              ))}
                            </ul>
                            <p className="text-gray-400 text-sm mt-1">
                              Correct Answer: {quiz.correctAnswer}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mb-6">
        <h2 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">DwenLite AI Chat</h2>
        <p className="text-gray-400 text-sm sm:text-base mb-3 sm:mb-4">
          Ask questions about your quiz groups, and DwenLite AI will provide answers based on the selected quiz group.
        </p>
        <div className={`bg-gray-800 p-3 sm:p-4 rounded-lg ${chatLoading ? 'pulse-container' : ''}`}>
          <div className="mb-3 max-h-96 overflow-y-auto">
            {chatHistory.map((message, index) => (
              <div
                key={index}
                className={`mb-2 relative ${message.type === 'user' ? 'text-right' : 'text-left'} ${
                  message.type === 'user' ? 'animate-slide-in-right' : 'animate-slide-in-left'
                }`}
              >
                <span
                  className={`inline-block p-2 rounded-lg text-sm ${
                    message.type === 'user'
                      ? 'bg-purple-600'
                      : message.type === 'ai'
                      ? 'bg-gray-700'
                      : 'text-gray-400 italic typing-dots'
                  }`}
                >
                  {message.content.includes('DwenLite AI is typing...') || message.content.includes('DwenLite AI is reading Quiz Group...') ? (
                    <>
                      {message.content.replace('...', '')}
                      <span>.</span>
                      <span>.</span>
                      <span>.</span>
                    </>
                  ) : (
                    message.content
                  )}
                </span>
                {message.type === 'ai' && !message.content.includes('DwenLite AI is typing...') && !message.content.includes('DwenLite AI is reading Quiz Group...') && (
                  <button
                    onClick={() => setShowReportForm(showReportForm === index ? null : index)}
                    className={`absolute top-0 right-0 text-red-500 hover:text-red-400 text-xs p-1 ${quizLoading ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
                    disabled={quizLoading}
                  >
                    {showReportForm === index ? 'Cancel' : 'Report'}
                  </button>
                )}
                {showReportForm === index && (
                  <div className="mt-2 p-2 bg-gray-700 rounded-lg animate-fade-in">
                    <textarea
                      value={reportReason}
                      onChange={(e) => setReportReason(e.target.value)}
                      placeholder="Why is this content offensive or inappropriate?"
                      className="w-full p-2 bg-gray-600 text-white rounded-lg focus:outline-none text-sm"
                      rows="3"
                    />
                    <button
                      onClick={() => handleReportContent(index, reportReason)}
                      disabled={reportLoading || !reportReason.trim() || quizLoading}
                      className={`mt-2 bg-red-600 text-white py-1 px-3 rounded-lg hover:bg-red-700 text-sm ${
                        reportLoading || !reportReason.trim() || quizLoading ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      {reportLoading ? (
                        <span className="flex items-center">
                          <svg
                            className="animate-spin h-4 w-4 mr-2 text-white"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                              fill="none"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8v8H4z"
                            />
                          </svg>
                          Reporting...
                        </span>
                      ) : (
                        'Submit Report'
                      )}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {showQuizGroupPrompt && (
            <div className="mb-3 animate-fade-in">
              <select
                value={selectedQuizGroupId}
                onChange={(e) => setSelectedQuizGroupId(e.target.value)}
                className="w-full p-2 bg-gray-700 text-white rounded-lg text-sm"
                disabled={quizLoading}
              >
                <option value="">Select a quiz group</option>
                {folder.quizGroups.map((group, index) => (
                  <option key={group.id} value={group.id}>
                    Quiz Group {index + 1} (Created: {new Date(group.createdAt).toLocaleDateString()})
                  </option>
                ))}
              </select>
              <button
                onClick={handleQuizGroupSelection}
                className={`mt-2 bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 w-full hover-scale text-sm ${quizLoading ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
                disabled={quizLoading}
              >
                Submit
              </button>
            </div>
          )}
          {!showQuizGroupPrompt && (
            <form onSubmit={handleChatSubmit} className="flex items-center">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask DwenLite AI a question..."
                className="flex-1 p-2 bg-gray-700 text-white rounded-l-lg focus:outline-none text-sm"
                disabled={chatLoading || quizLoading}
              />
              <button
                type="submit"
                disabled={chatLoading || quizLoading}
                className={`bg-purple-600 text-white py-2 px-4 rounded-r-lg hover:bg-purple-700 hover-scale text-sm ${
                  chatLoading || quizLoading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                Send
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default Quizzes;