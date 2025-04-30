import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { db, auth } from '../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
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

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => {
      if (!user) {
        toast.error('Please log in to view this folder.');
        navigate('/login');
        return;
      }
      fetchFolder(user.uid);
    });
    return () => unsubscribe();
  }, [navigate, folderId]);

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
      const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY;
      if (!apiKey) {
        throw new Error('DeepSeek API key not found. Please set VITE_DEEPSEEK_API_KEY in your .env file.');
      }

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

      let prompt = `Generate 40 multiple-choice quiz questions based on the following content: "${context}". For each question, provide the question, four options (labeled a, b, c, d), and the correct answer. Format as a JSON array: [{ "question": "...", "options": ["a. ...", "b. ...", "c. ...", "d. ..."], "correctAnswer": "..." }, ...]. Return only the JSON array string, without any markdown, code block markers (like \`\`\`json), or additional text. Ensure the output is valid JSON.`;

      if (retry) {
        prompt = `You previously failed to return valid JSON. Generate 40 multiple-choice quiz questions based on the following content: "${context}". For each question, provide the question, four options (labeled a, b, c, d), and the correct answer. Format as a JSON array: [{ "question": "...", "options": ["a. ...", "b. ...", "c. ...", "d. ..."], "correctAnswer": "..." }, ...]. Return ONLY the JSON array string. Do NOT include markdown, code block markers (like \`\`\`json), or any additional text before or after the JSON. The output MUST be valid JSON, parsable by JSON.parse().`;
      }

      const response = await axios.post(
        'https://api.deepseek.com/v1/chat/completions',
        {
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'You are a helpful assistant for generating educational content.' },
            { role: 'user', content: prompt },
          ],
          max_tokens: 4000,
          temperature: 0.7,
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      ).catch(err => {
        console.error('DeepSeek API error:', {
          status: err.response?.status,
          statusText: err.response?.statusText,
          data: err.response?.data,
          message: err.message,
        });
        if (err.response?.status === 401) {
          throw new Error('Invalid DeepSeek API key. Please check your API key in the .env file.');
        } else if (err.response?.status === 429) {
          throw new Error('Rate limit exceeded. Please wait a few minutes and try again.');
        } else if (err.response?.status === 404) {
          throw new Error('DeepSeek API endpoint not found. The endpoint may have changed.');
        } else {
          throw new Error(`DeepSeek API request failed: ${err.message}`);
        }
      });

      let generatedText;
      if (response.data.choices?.[0]?.message?.content) {
        generatedText = response.data.choices[0].message.content.trim();
      } else if (response.data.choices?.[0]?.text) {
        generatedText = response.data.choices[0].text.trim();
      } else {
        throw new Error('Invalid DeepSeek API response: No generated content found.');
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

      return quizzes.map(quiz => ({
        id: Date.now().toString() + Math.random().toString(36).substring(2),
        ...quiz,
      }));
    } catch (err) {
      console.error('Error generating quizzes:', err);
      throw new Error(err.message);
    }
  };

  const handleRegenerateQuiz = async () => {
    setQuizLoading(true);
    try {
      const newQuizzes = await generateContent();

      const newQuizGroup = {
        id: Date.now().toString(),
        quizzes: newQuizzes,
        createdAt: new Date().toISOString(),
      };

      const folderRef = doc(db, 'folders', folderId);
      const updatedQuizGroups = [...(folder.quizGroups || []), newQuizGroup];

      await updateDoc(folderRef, {
        quizGroups: updatedQuizGroups,
      });

      setFolder(prev => ({
        ...prev,
        quizGroups: updatedQuizGroups,
      }));
      toast.success('New quiz group generated successfully!');
      setSelectedQuizGroup(newQuizGroup);
      setCurrentQuizIndex(0);
      setSelectedAnswer(null);
      setIsCorrect(null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setQuizLoading(false);
    }
  };

  const handleDeleteQuizGroup = async (groupId) => {
    try {
      const folderRef = doc(db, 'folders', folderId);
      const updatedQuizGroups = folder.quizGroups.filter(group => group.id !== groupId);

      await updateDoc(folderRef, {
        quizGroups: updatedQuizGroups,
      });

      setFolder(prev => ({
        ...prev,
        quizGroups: updatedQuizGroups,
      }));

      if (selectedQuizGroup?.id === groupId) {
        setSelectedQuizGroup(null);
        setCurrentQuizIndex(0);
        setSelectedAnswer(null);
        setIsCorrect(null);
      }

      toast.success('Quiz group deleted successfully!');
    } catch (err) {
      console.error('Error deleting quiz group:', err);
      toast.error('Failed to delete quiz group. Please try again.');
    }
  };

  const handleSelectQuizGroup = (group) => {
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

  const handleAnswerSelect = (answer) => {
    if (selectedAnswer) return;
    setSelectedAnswer(answer);
    const currentQuiz = selectedQuizGroup?.quizzes[currentQuizIndex];
    const isAnswerCorrect = answer === currentQuiz.correctAnswer;
    setIsCorrect(isAnswerCorrect);
  };

  const handleNextQuestion = () => {
    setSelectedAnswer(null);
    setIsCorrect(null);
    setCurrentQuizIndex(prev => prev + 1);
  };

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const question = chatInput.trim();
    setChatInput('');

    const quizGroupRegex = /(?:reference|check|use|from)\s*(?:quiz\s*group\s*)(\d+|one|two|three|four|five)/i;
    const match = question.match(quizGroupRegex);
    let quizGroupIndex = null;

    if (match) {
      const quizGroupRef = match[1].toLowerCase();
      const numberWords = ['one', 'two', 'three', 'four', 'five'];
      if (numberWords.includes(quizGroupRef)) {
        quizGroupIndex = numberWords.indexOf(quizGroupRef);
      } else if (!isNaN(parseInt(quizGroupRef))) {
        quizGroupIndex = parseInt(quizGroupRef) - 1;
      }
    }

    if (quizGroupIndex !== null && folder.quizGroups[quizGroupIndex]) {
      const selectedQuizGroup = folder.quizGroups[quizGroupIndex];
      await processQuestion(question, selectedQuizGroup);
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

    const selectedQuizGroup = folder.quizGroups.find(group => group.id === selectedQuizGroupId);
    if (!selectedQuizGroup) {
      toast.error('Selected quiz group not found.');
      return;
    }

    const lastQuestion = chatHistory.findLast(item => item.type === 'user')?.content;
    if (!lastQuestion) {
      toast.error('No question found to process.');
      return;
    }

    setShowQuizGroupPrompt(false);
    await processQuestion(lastQuestion, selectedQuizGroup);
  };

  const processQuestion = async (question, quizGroup) => {
    setChatLoading(true);
    try {
      const quizContent = quizGroup.quizzes.map((quiz, index) => {
        return `Question ${index + 1}: ${quiz.question}\nOptions: ${quiz.options.join(', ')}\nCorrect Answer: ${quiz.correctAnswer}`;
      }).join('\n\n');

      const quizGroupIndex = folder.quizGroups.findIndex(g => g.id === quizGroup.id) + 1;
      setChatHistory(prev => [
        ...prev,
        { type: 'system', content: `DwenLite AI is reading Quiz Group ${quizGroupIndex}...` },
      ]);

      await new Promise(resolve => setTimeout(resolve, 1500));

      const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY;
      if (!apiKey) {
        throw new Error('DeepSeek API key not found. Please set VITE_DEEPSEEK_API_KEY in your .env file.');
      }

      const prompt = `You are DwenLite AI, an assistant that answers questions based on provided quiz group content. Here is the content of the quiz group:\n\n${quizContent}\n\nQuestion: ${question}\n\nProvide a clear, concise, and accurate answer based on the quiz group content. If the question cannot be answered from the quiz group, state so and provide a brief explanation. Format the answer as plain text suitable for rendering in a React component.`;

      setChatHistory(prev => [
        ...prev,
        { type: 'system', content: 'DwenLite AI is typing...' },
      ]);

      await new Promise(resolve => setTimeout(resolve, 1000));

      const response = await axios.post(
        'https://api.deepseek.com/v1/chat/completions',
        {
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'You are DwenLite AI, a helpful assistant for answering questions based on quiz groups.' },
            { role: 'user', content: prompt },
          ],
          max_tokens: 1000,
          temperature: 0.7,
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      ).catch(err => {
        console.error('DeepSeek API error:', {
          status: err.response?.status,
          statusText: err.response?.statusText,
          data: err.response?.data,
          message: err.message,
        });
        if (err.response?.status === 401) {
          throw new Error('Invalid DeepSeek API key. Please check your API key in the .env file.');
        } else if (err.response?.status === 429) {
          throw new Error('Rate limit exceeded. Please wait a few minutes and try again.');
        } else if (err.response?.status === 404) {
          throw new Error('DeepSeek API endpoint not found. The endpoint may have changed.');
        } else {
          throw new Error(`DeepSeek API request failed: ${err.message}`);
        }
      });

      let answer;
      if (response.data.choices?.[0]?.message?.content) {
        answer = response.data.choices[0].message.content.trim();
      } else if (response.data.choices?.[0]?.text) {
        answer = response.data.choices[0].text.trim();
      } else {
        throw new Error('Invalid DeepSeek API response: No answer found.');
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
            className="mt-4 inline-block bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const currentQuiz = selectedQuizGroup?.quizzes[currentQuizIndex];

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 md:p-8">
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
          .hover-scale {
            transition: transform 0.2s ease, box-shadow 0.2s ease;
          }
          .hover-scale:hover {
            transform: scale(1.05);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
          }
        `}
      </style>

      <div className="flex justify-between items-center mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-bold">{folder.name} - Quizzes</h1>
        <Link
          to={`/folder/${folderId}`}
          className="bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 text-sm md:text-base"
        >
          Back to Folder
        </Link>
      </div>

      <div className="mb-6 md:mb-8">
        <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">Generate Quizzes</h2>
        <p className="text-gray-400 text-sm md:text-base mb-3 md:mb-4">
          Quiz generation typically takes 60-180 seconds. Processing time may vary based on server load and document size.
        </p>
        <button
          onClick={handleRegenerateQuiz}
          disabled={quizLoading}
          className={`bg-gray-800 p-3 md:p-4 rounded-lg flex items-center justify-between hover:bg-gray-700 text-sm md:text-base w-full ${
            quizLoading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {quizLoading ? (
            <span className="flex items-center">
              <svg
                className="animate-spin h-4 w-4 md:h-5 md:w-5 mr-2 text-white"
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
              Loading...
            </span>
          ) : (
            <>
              <span>Regenerate Quizzes</span>
              <span>➔</span>
            </>
          )}
        </button>
      </div>

      <div className="mb-6">
        <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">Take Quiz</h2>
        {!selectedQuizGroup ? (
          <p className="text-gray-400 text-sm md:text-base">Select a quiz group from the stored quizzes to start!</p>
        ) : currentQuizIndex >= selectedQuizGroup.quizzes.length ? (
          <p className="text-gray-400 text-sm md:text-base">You've completed this quiz group! Select another to continue.</p>
        ) : currentQuiz ? (
          <div className="bg-gray-800 p-3 md:p-4 rounded-lg mb-3 md:mb-4">
            <h3 className="text-base md:text-lg font-semibold mb-2">
              Question {currentQuizIndex + 1} of {selectedQuizGroup.quizzes.length}: {currentQuiz.question}
            </h3>
            <ul className="text-gray-300 text-sm md:text-base">
              {currentQuiz.options.map((option, index) => (
                <li key={index} className="mb-2">
                  <button
                    onClick={() => handleAnswerSelect(option)}
                    className={`w-full text-left p-2 rounded-lg ${
                      selectedAnswer === option
                        ? isCorrect
                          ? 'bg-green-600'
                          : 'bg-red-600'
                        : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                    disabled={selectedAnswer !== null}
                  >
                    {option}
                  </button>
                </li>
              ))}
            </ul>
            {selectedAnswer && (
              <p className={`mt-2 ${isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                {isCorrect ? 'Correct!' : `Incorrect. Correct answer: ${currentQuiz.correctAnswer}`}
              </p>
            )}
            {selectedAnswer && (
              <button
                onClick={handleNextQuestion}
                className="mt-4 bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700"
              >
                Next Question
              </button>
            )}
          </div>
        ) : (
          <p className="text-gray-400 text-sm md:text-base">Loading quiz...</p>
        )}
      </div>

      <div className="mb-6">
        <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">Stored Quiz Groups</h2>
        {folder.quizGroups.length === 0 ? (
          <p className="text-gray-400 text-sm md:text-base">No quiz groups available. Generate a new group to start!</p>
        ) : (
          <div>
            <button
              onClick={() => setShowStoredQuizzes(!showStoredQuizzes)}
              className="bg-gray-800 p-3 md:p-4 rounded-lg flex items-center justify-between hover:bg-gray-700 text-sm md:text-base w-full mb-3"
            >
              <span>{showStoredQuizzes ? 'Hide Stored Quiz Groups' : 'Show Stored Quiz Groups'}</span>
              <span>{showStoredQuizzes ? '▼' : '▶'}</span>
            </button>
            {showStoredQuizzes && (
              <div className="space-y-3">
                {folder.quizGroups.map((group, index) => (
                  <div
                    key={group.id}
                    className="bg-gray-800 p-3 md:p-4 rounded-lg"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <button
                        onClick={() => handleSelectQuizGroup(group)}
                        className="text-left flex-1 text-base md:text-lg font-semibold hover:text-purple-400"
                      >
                        Quiz Group {index + 1} (Created: {new Date(group.createdAt).toLocaleDateString()})
                      </button>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleToggleGroup(group.id)}
                          className="text-gray-400 hover:text-white"
                        >
                          {expandedGroups[group.id] ? 'Hide Questions' : 'Show Questions'}
                        </button>
                        <button
                          onClick={() => handleDeleteQuizGroup(group.id)}
                          className="bg-red-600 text-white py-1 px-3 rounded-lg hover:bg-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    {expandedGroups[group.id] && (
                      <div className="mt-2 space-y-3">
                        {group.quizzes.map((quiz, qIndex) => (
                          <div key={quiz.id} className="bg-gray-700 p-3 rounded-lg">
                            <h4 className="text-sm md:text-base font-semibold">
                              Question {qIndex + 1}: {quiz.question}
                            </h4>
                            <ul className="text-gray-300 text-sm md:text-base mt-1">
                              {quiz.options.map((option, oIndex) => (
                                <li key={oIndex}>{option}</li>
                              ))}
                            </ul>
                            <p className="text-gray-400 mt-1">
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
        <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">DwenLite AI Chat</h2>
        <p className="text-gray-400 text-sm md:text-base mb-3 md:mb-4">
          Ask questions about your quiz groups, and DwenLite AI will provide answers based on the selected quiz group.
        </p>
        <div className={`bg-gray-800 p-3 md:p-4 rounded-lg ${chatLoading ? 'pulse-container' : ''}`}>
          <div className="mb-3 max-h-96 overflow-y-auto">
            {chatHistory.map((message, index) => (
              <div
                key={index}
                className={`mb-2 ${message.type === 'user' ? 'text-right' : 'text-left'} ${
                  message.type === 'user' ? 'animate-slide-in-right' : 'animate-slide-in-left'
                }`}
              >
                <span
                  className={`inline-block p-2 rounded-lg ${
                    message.type === 'user'
                      ? 'bg-purple-600'
                      : message.type === 'ai'
                      ? 'bg-gray-700'
                      : 'text-gray-400 italic typing-dots'
                  }`}
                >
                  {message.content.includes('DwenLite AI is typing...') ? (
                    <>
                      DwenLite AI is typing
                      <span>.</span>
                      <span>.</span>
                      <span>.</span>
                    </>
                  ) : (
                    message.content
                  )}
                </span>
              </div>
            ))}
          </div>
          {showQuizGroupPrompt && (
            <div className="mb-3 animate-fade-in">
              <select
                value={selectedQuizGroupId}
                onChange={(e) => setSelectedQuizGroupId(e.target.value)}
                className="w-full p-2 bg-gray-700 text-white rounded-lg"
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
                className="mt-2 bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 w-full hover-scale"
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
                className="flex-1 p-2 bg-gray-700 text-white rounded-l-lg focus:outline-none"
                disabled={chatLoading}
              />
              <button
                type="submit"
                disabled={chatLoading}
                className={`bg-purple-600 text-white py-2 px-4 rounded-r-lg hover:bg-purple-700 hover-scale ${
                  chatLoading ? 'opacity-50 cursor-not-allowed' : ''
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