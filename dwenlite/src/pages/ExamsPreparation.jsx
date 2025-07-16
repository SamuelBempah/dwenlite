import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import toast from 'react-hot-toast';
import axios from 'axios';

function ExamsPreparation() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [examLoading, setExamLoading] = useState(false);
  const [files, setFiles] = useState([]);
  const [uploadedNotes, setUploadedNotes] = useState([]);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [examStage, setExamStage] = useState('upload'); // 'upload', 'review', 'mcq', 'fill-in', 'marking', 'results'
  const [reviewContent, setReviewContent] = useState('');
  const [mcqQuestions, setMcqQuestions] = useState([]);
  const [fillInQuestions, setFillInQuestions] = useState([]);
  const [currentMcqIndex, setCurrentMcqIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [isCorrect, setIsCorrect] = useState(null);
  const [fillInAnswers, setFillInAnswers] = useState({});
  const [scores, setScores] = useState({ mcq: 0, fillIn: 0, total: 0 });
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [showReportForm, setShowReportForm] = useState(null);
  const [reportReason, setReportReason] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [mcqResults, setMcqResults] = useState([]);
  const [fillInResults, setFillInResults] = useState([]);
  const [markingProgress, setMarkingProgress] = useState({ mcq: 0, fillIn: 0 });
  const [submitLoading, setSubmitLoading] = useState(false);

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

  const extractPdfText = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
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

  const transcribeAudio = async (audioUrl) => {
    try {
      const apiKey = import.meta.env.VITE_ASSEMBLYAI_API_KEY;
      if (!apiKey) {
        throw new Error('AssemblyAI API key not found.');
      }

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
      );

      const transcriptId = response.data.id;
      let status = 'queued';
      let transcribedText = '';
      const maxAttempts = 30;
      let attempts = 0;

      while (status !== 'completed' && status !== 'error' && attempts < maxAttempts) {
        const checkResponse = await axios.get(
          `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
          {
            headers: { Authorization: `Bearer ${apiKey}` },
          }
        );

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
        throw new Error('AssemblyAI API key not found.');
      }

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
      );

      const transcriptId = response.data.id;
      let status = 'queued';
      let transcribedText = '';
      const maxAttempts = 60;
      let attempts = 0;

      while (status !== 'completed' && status !== 'error' && attempts < maxAttempts) {
        const checkResponse = await axios.get(
          `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
          {
            headers: { Authorization: `Bearer ${apiKey}` },
          }
        );

        status = checkResponse.data.status;
        if (status === 'completed') {
          transcribedText = checkResponse.data.text || '';
        } else if (status === 'error') {
          throw new Error(`Video transcription failed: ${checkResponse.data.error || 'Unknown error'}`);
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
        toast.error('Unsupported file type. Please upload audio, video, text, or PDF files.');
        setFiles(prev => prev.filter(f => f !== selectedFile));
        setUploadLoading(false);
        return;
      }

      const storageRef = ref(storage, `exam_notes/${currentUser.uid}/${Date.now()}_${selectedFile.name}`);
      await uploadBytes(storageRef, selectedFile);
      const downloadURL = await getDownloadURL(storageRef);

      let extractedText = '';
      if (isAudio) {
        extractedText = await transcribeAudio(downloadURL);
      } else if (isVideo) {
        extractedText = await transcribeVideo(downloadURL);
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
 vagabondedAt: new Date().toISOString(),
        fileName: selectedFile.name,
      };

      setUploadedNotes(prev => [...prev, newNote]);
      toast.success('Note uploaded successfully!');
    } catch (err) {
      console.error('File upload error:', err);
      toast.error(`Failed to upload file: ${err.message}`);
      setFiles(prev => prev.filter(f => f !== selectedFile));
    } finally {
      setUploadLoading(false);
    }
  };

  const handleFillInChange = (id, value) => {
    setFillInAnswers(prev => ({ ...prev, [id]: value }));
  };

  const generateExamContent = async (retry = false) => {
    try {
      const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY;
      if (!apiKey) {
        throw new Error('DeepSeek API key not found.');
      }

      const context = uploadedNotes.length > 0
        ? uploadedNotes.map(note => note.extractedText).join('\n\n')
        : 'No notes uploaded. Generate generic exam content.';

      // Generate Review Content
      const reviewPrompt = `Generate comprehensive and well-organized study notes based on the provided content: "${context}" for an exam review. Structure the notes with clear headings and bullet points for main topics, concisely summarizing key concepts, definitions, and examples to aid revision. Exclude introductory or concluding statements like "Here are the notes" or "Let me know if you need modifications." Format as plain text suitable for rendering in a React component, using plain text indentation for lists instead of asterisks (*)`;
      const reviewResponse = await axios.post(
        'https://api.deepseek.com/v1/chat/completions',
        {
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'You are a helpful assistant for generating educational content.' },
            { role: 'user', content: reviewPrompt },
          ],
          max_tokens: 1000,
          temperature: 0.7,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const reviewText = reviewResponse.data.choices?.[0]?.message?.content?.trim() || 'No review content generated.';

      // Generate MCQs
      const mcqPrompt = `Generate 40 multiple-choice quiz questions based on the following content: "${context}". For each question, provide the question, four options (labeled a, b, c, d), and the correct answer. Format as a JSON array: [{ "question": "...", "options": ["a. ...", "b. ...", "c. ...", "d. ..."], "correctAnswer": "..." }, ...]. Ensure that the "correctAnswer" is the exact string from the "options" array (e.g., if the correct option is "a. Paris", then "correctAnswer" must be "a. Paris", not "Paris"). Return only the JSON array string. ${retry ? 'You previously failed to return valid JSON. Ensure the output is valid JSON, parsable by JSON.parse(), with no markdown or code block markers (like ```json). Do not include any additional text before or after the JSON.' : ''}`;
      const mcqResponse = await axios.post(
        'https://api.deepseek.com/v1/chat/completions',
        {
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'You are a helpful assistant for generating educational content.' },
            { role: 'user', content: mcqPrompt },
          ],
          max_tokens: 4000,
          temperature: 0.7,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      let mcqText = mcqResponse.data.choices?.[0]?.message?.content?.trim() || '[]';
      mcqText = mcqText.replace(/```json/g, '').replace(/```/g, '').trim();
      let mcqs;
      try {
        mcqs = JSON.parse(mcqText);
      } catch (parseErr) {
        console.error('MCQ JSON parse error:', parseErr, 'Response:', mcqText);
        if (!retry) {
          console.log('Retrying MCQ generation...');
          return await generateExamContent(true);
        }
        console.warn('Falling back to default quiz due to repeated parsing failure.');
        mcqs = [
          {
            question: 'What is the capital of France?',
            options: ['a. Paris', 'b. London', 'c. Berlin', 'd. Madrid'],
            correctAnswer: 'a. Paris',
          },
        ];
      }

      mcqs = mcqs.map(quiz => {
        const validCorrectAnswer = quiz.options.includes(quiz.correctAnswer)
          ? quiz.correctAnswer
          : quiz.options[0]; // Fallback to first option if invalid
        return {
          id: Date.now().toString() + Math.random().toString(36).substring(2),
          ...quiz,
          correctAnswer: validCorrectAnswer,
        };
      });

      // Generate Fill-in-the-Blank Questions
      const fillInPrompt = `Generate 10 fill-in-the-blank questions based on the following content: "${context}". For each question, provide the question with a blank (_____) and the expected answer. Format as a JSON array: [{ "question": "...", "expectedAnswer": "..." }, ...]. Return only the JSON array string.`;
      const fillInResponse = await axios.post(
        'https://api.deepseek.com/v1/chat/completions',
        {
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'You are a helpful assistant for generating educational content.' },
            { role: 'user', content: fillInPrompt },
          ],
          max_tokens: 1000,
          temperature: 0.7,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      let fillInText = fillInResponse.data.choices?.[0]?.message?.content?.trim() || '[]';
      fillInText = fillInText.replace(/```json/g, '').replace(/```/g, '').trim();
      let fillIns = JSON.parse(fillInText);
      fillIns = fillIns.map(question => ({
        id: Date.now().toString() + Math.random().toString(36).substring(2),
        ...question,
      }));

      return { reviewText, mcqs, fillIns };
    } catch (err) {
      console.error('Error generating exam content:', err);
      throw new Error(`Failed to generate exam content: ${err.message}`);
    }
  };

  const handleStartExam = async () => {
    if (uploadedNotes.length === 0) {
      toast.error('Please upload at least one note to start the exam.');
      return;
    }
    setExamLoading(true);
    try {
      const { reviewText, mcqs, fillIns } = await generateExamContent();
      setReviewContent(reviewText);
      setMcqQuestions(mcqs);
      setFillInQuestions(fillIns);
      setExamStage('review');
      toast.success('Exam content generated successfully!');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExamLoading(false);
    }
  };

  const handleAnswerSelect = (answer) => {
    if (selectedAnswer) return;
    setSelectedAnswer(answer);
    const currentQuiz = mcqQuestions[currentMcqIndex];
    console.log('Selected Answer:', answer);
    console.log('Correct Answer:', currentQuiz.correctAnswer);
    console.log('Options:', currentQuiz.options);
    // Normalize answers: trim whitespace and convert to —

    const normalizedAnswer = answer.trim().toLowerCase();
    const normalizedCorrectAnswer = currentQuiz.correctAnswer.trim().toLowerCase();
    // Handle cases where correctAnswer might not include the option prefix
    const correctAnswerText = normalizedCorrectAnswer.startsWith('a.') ||
                             normalizedCorrectAnswer.startsWith('b.') ||
                             normalizedCorrectAnswer.startsWith('c.') ||
                             normalizedCorrectAnswer.startsWith('d.')
      ? normalizedCorrectAnswer
      : currentQuiz.options.find(opt => opt.toLowerCase().includes(normalizedCorrectAnswer)) || normalizedCorrectAnswer;
    const isAnswerCorrect = normalizedAnswer === correctAnswerText;
    console.log('Is Correct:', isAnswerCorrect);
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

  const scoreFillInAnswers = async () => {
    setSubmitLoading(true);
    try {
      const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY;
      if (!apiKey) {
        throw new Error('DeepSeek API key not found.');
      }

      let fillInScore = 0;
      const results = [];

      for (const question of fillInQuestions) {
        const userAnswer = fillInAnswers[question.id]?.trim() || '';
        if (!userAnswer) {
          results.push({ id: question.id, isCorrect: false, explanation: 'No answer provided.' });
          continue;
        }

        const prompt = `Compare the user-provided answer "${userAnswer}" to the expected answer "${question.expectedAnswer}" for the question "${question.question}". Determine if the user answer is sufficiently similar to the expected answer to be considered correct. Return a JSON object: { "isCorrect": boolean, "explanation": "..." }.`;

        try {
          const response = await axios.post(
            'https://api.deepseek.com/v1/chat/completions',
            {
              model: 'deepseek-chat',
              messages: [
                { role: 'system', content: 'You are an assistant that evaluates answer similarity.' },
                { role: 'user', content: prompt },
              ],
              max_tokens: 500,
              temperature: 0.7,
            },
            {
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
            }
          );

          const resultText = response.data.choices?.[0]?.message?.content?.trim();
          if (!resultText) {
            console.warn(`No response content for question ID ${question.id}`);
            results.push({
              id: question.id,
              isCorrect: false,
              explanation: 'No response received from DeepSeek API.',
            });
            continue;
          }

          let result;
          try {
            const cleanedText = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
            result = JSON.parse(cleanedText);
            if (typeof result.isCorrect !== 'boolean' || typeof result.explanation !== 'string') {
              throw new Error('Invalid JSON structure: missing isCorrect or explanation');
            }
          } catch (parseErr) {
            console.error(`Error parsing DeepSeek response for question ID ${question.id}:`, parseErr, { resultText });
            results.push({
              id: question.id,
              isCorrect: false,
              explanation: `Failed to parse API response: ${parseErr.message}`,
            });
            continue;
          }

          if (result.isCorrect) {
            fillInScore += 2;
          }
          results.push({ id: question.id, ...result, question: question.question, userAnswer, expectedAnswer: question.expectedAnswer });
        } catch (apiErr) {
          console.error(`API error for question ID ${question.id}:`, apiErr);
          results.push({
            id: question.id,
            isCorrect: false,
            explanation: `API error: ${apiErr.message}`,
            question: question.question,
            userAnswer,
            expectedAnswer: question.expectedAnswer,
          });
        }
      }

      setFillInResults(results);
      setScores(prev => ({
        ...prev,
        fillIn: fillInScore,
        total: prev.mcq + fillInScore,
      }));
      setExamStage('marking');
      return results;
    } catch (err) {
      console.error('Error scoring fill-in answers:', err);
      toast.error(`Failed to score fill-in answers: ${err.message}`);
      setExamStage('results');
      return [];
    } finally {
      setSubmitLoading(false);
    }
  };

  const simulateMarking = async () => {
    let mcqScore = 0;
    let fillInScore = scores.fillIn;

    for (let i = 0; i < mcqResults.length; i++) {
      setMarkingProgress(prev => ({ ...prev, mcq: ((i + 1) / mcqResults.length) * 100 }));
      if (mcqResults[i].isCorrect) {
        mcqScore += 2;
      }
      await new Promise(resolve => setTimeout(resolve, Math.random() * 200 + 300));
    }

    for (let i = 0; i < fillInResults.length; i++) {
      setMarkingProgress(prev => ({ ...prev, fillIn: ((i + 1) / fillInResults.length) * 100 }));
      await new Promise(resolve => setTimeout(resolve, Math.random() * 200 + 300));
    }

    setScores({ mcq: mcqScore, fillIn: fillInScore, total: mcqScore + fillInScore });
    setExamStage('results');
  };

  useEffect(() => {
    if (examStage === 'marking') {
      simulateMarking();
    }
  }, [examStage]);

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const question = chatInput.trim();
    setChatInput('');
    setChatLoading(true);

    try {
      const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY;
      if (!apiKey) {
        throw new Error('DeepSeek API key not found.');
      }

      const context = reviewContent || 'No review content available.';
      const prompt = `Based on the exam review content: "${context}", answer the following question: "${question}". Provide a clear, concise answer in plain text suitable for rendering in a React component.`;

      setChatHistory(prev => [
        ...prev,
        { type: 'user', content: question },
        { type: 'system', content: 'DwenLite AI is typing...' },
      ]);

      await new Promise(resolve => setTimeout(resolve, 1000));

      const response = await axios.post(
        'https://api.deepseek.com/v1/chat/completions',
        {
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'You are DwenLite AI, a helpful assistant for answering questions based on exam content.' },
            { role: 'user', content: prompt },
          ],
          max_tokens: 1000,
          temperature: 0.7,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const answer = response.data.choices?.[0]?.message?.content?.trim() || 'No answer found.';
      setChatHistory(prev => prev.filter(item => item.content !== 'DwenLite AI is typing...').concat({
        type: 'ai',
        content: answer,
      }));
    } catch (err) {
      console.error('Error processing question:', err);
      toast.error(`Failed to process question: ${err.message}`);
      setChatHistory(prev => prev.filter(item => item.content !== 'DwenLite AI is typing...'));
    } finally {
      setChatLoading(false);
    }
  };

  const handleReportContent = async (messageIndex, reason) => {
    setReportLoading(true);
    try {
      if (!currentUser) {
        toast.error('You must be logged in to report content.');
        return;
      }

      const message = chatHistory[messageIndex];
      const reportData = {
        userId: currentUser.uid,
        contentType: 'chat_message',
        contentId: `message_${messageIndex}`,
        content: message.content,
        reason,
        createdAt: new Date().toISOString(),
      };

      const { addDoc, collection } = await import('firebase/firestore');
      await addDoc(collection(db, 'reports'), reportData);
      toast.success('Content reported successfully.');
      setShowReportForm(null);
      setReportReason('');
    } catch (err) {
      console.error('Error reporting content:', err);
      toast.error(`Failed to report content: ${err.message}`);
    } finally {
      setReportLoading(false);
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
          @keyframes markPulse {
            0% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.2); opacity: 0.7; }
            100% { transform: scale(1); opacity: 1; }
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
          .animate-mark-pulse {
            animation: markPulse 0.5s ease-in-out;
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
          .progress-bar {
            transition: width 0.3s ease;
          }
        `}
      </style>

      <div className="flex flex-col md:flex-row justify-between items-center mb-6 md:mb-8 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold">Exam Preparation</h1>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={() => navigate('/dashboard')}
            className="bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 text-sm md:text-base hover-scale"
          >
            Back to Dashboard
          </button>
          <a
            href="DwenConnect.html"
            className="bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 text-sm md:text-base hover-scale text-center"
          >
          DwenConnect
          </a>
        </div>
      </div>

      {examStage === 'upload' && (
        <div className="mb-6 md:mb-8">
          <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">Upload Notes</h2>
          <p className="text-gray-400 text-sm md:text-base mb-3 md:mb-4">
            Upload as many notes as you want (text, PDF, audio, or video). The AI will process all notes to create your exam. Submission and grading may take up to 5 minutes. Please be patient.
          </p>
          <input
            type="file"
            onChange={handleFileUpload}
            accept="text/plain,application/pdf,audio/*,video/*"
            className="bg-gray-800 p-3 md:p-4 rounded-lg w-full text-sm md:text-base"
            disabled={uploadLoading}
          />
          {uploadLoading && (
            <div className="flex items-center mt-2">
              <svg className="animate-spin h-4 w-4 mr-2 text-white" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Uploading...
            </div>
          )}
          {uploadedNotes.length > 0 && (
            <div className="mt-4">
              <h3 className="text-base md:text-lg font-semibold mb-2">Uploaded Notes</h3>
              <ul className="text-gray-300 text-sm md:text-base">
                {uploadedNotes.map((note, index) => (
                  <li key={index} className="mb-2">
                    {note.fileName} ({note.isAudio ? 'Audio' : note.isVideo ? 'Video' : 'Text/PDF'})
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button
            onClick={handleStartExam}
            disabled={examLoading}
            className={`mt-4 bg-gray-800 p-3 md:p-4 rounded-lg flex items-center justify-between hover:bg-gray-700 text-sm md:text-base w-full ${examLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {examLoading ? (
              <span className="flex items-center">
                <svg className="animate-spin h-4 w-4 md:h-5 md:w-5 mr-2 text-white" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Generating Exam...
              </span>
            ) : (
              <>
                <span>Start Exam</span>
                <span>➔</span>
              </>
            )}
          </button>
        </div>
      )}

      {examStage === 'review' && reviewContent && (
        <div className="mb-6 md:mb-8">
          <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">Exam Review</h2>
          <div className="bg-gray-800 p-3 md:p-4 rounded-lg text-sm md:text-base">
            <p>{reviewContent}</p>
            <button
              onClick={() => setExamStage('mcq')}
              className="mt-4 bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700"
            >
              Proceed to MCQs
            </button>
          </div>
        </div>
      )}

      {examStage === 'mcq' && mcqQuestions.length > 0 && (
        <div className="mb-6 md:mb-8">
          <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">Multiple Choice Questions</h2>
          {currentMcqIndex < mcqQuestions.length ? (
            <div className="bg-gray-800 p-3 md:p-4 rounded-lg mb-3 md:mb-4">
              <h3 className="text-base md:text-lg font-semibold mb-2">
                Question {currentMcqIndex + 1} of {mcqQuestions.length}: {mcqQuestions[currentMcqIndex].question}
              </h3>
              <ul className="text-gray-300 text-sm md:text-base">
                {mcqQuestions[currentMcqIndex].options.map((option, index) => (
                  <li key={index} className="mb-2">
                    <button
                      onClick={() => handleAnswerSelect(option)}
                      className={`w-full text-left p-2 rounded-lg ${
                        selectedAnswer === option ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'
                      }`}
                      disabled={selectedAnswer !== null}
                    >
                      {option}
                    </button>
                  </li>
                ))}
              </ul>
              {selectedAnswer && (
                <button
                  onClick={handleNextMcq}
                  className="mt-4 bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700"
                >
                  {currentMcqIndex < mcqQuestions.length - 1 ? 'Next Question' : 'Proceed to Fill-in Questions'}
                </button>
              )}
            </div>
          ) : (
            <p className="text-gray-400 text-sm md:text-base">Loading MCQ...</p>
          )}
        </div>
      )}

      {examStage === 'fill-in' && fillInQuestions.length > 0 && (
        <div className="mb-6 md:mb-8">
          <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">Fill-in-the-Blank Questions</h2>
          <div className="space-y-4">
            {fillInQuestions.map((question, index) => (
              <div key={question.id} className="bg-gray-800 p-3 md:p-4 rounded-lg">
                <p className="text-sm md:text-base mb-2">
                  Question {index + 1}: {question.question}
                </p>
                <input
                  type="text"
                  value={fillInAnswers[question.id] || ''}
                  onChange={(e) => handleFillInChange(question.id, e.target.value)}
                  placeholder="Enter your answer"
                  className="w-full p-2 bg-gray-700 text-white rounded-lg focus:outline-none text-sm"
                  disabled={submitLoading}
                />
              </div>
            ))}
            <button
              onClick={scoreFillInAnswers}
              disabled={submitLoading}
              className={`mt-4 bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 flex items-center justify-center ${
                submitLoading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {submitLoading ? (
                <span className="flex items-center">
                  <svg className="animate-spin h-4 w-4 mr-2 text-white" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Submitting answers for grading, please wait...
                </span>
              ) : (
                'Submit Answers'
              )}
            </button>
          </div>
        </div>
      )}

      {examStage === 'marking' && (
        <div className="mb-6 md:mb-8">
          <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">Marking Your Exam...</h2>
          <div className="bg-gray-800 p-3 md:p-4 rounded-lg text-sm md:text-base pulse-container">
            <div className="mb-4">
              <h3 className="font-semibold mb-2">Multiple Choice Questions</h3>
              <div className="w-full bg-gray-700 rounded-full h-4">
                <div
                  className="bg-purple-600 h-4 rounded-full progress-bar"
                  style={{ width: `${markingProgress.mcq}%` }}
                ></div>
              </div>
              <p className="mt-2 text-gray-400">
                Marking {Math.round(markingProgress.mcq * mcqQuestions.length / 100)} of {mcqQuestions.length} questions...
              </p>
              <div className="mt-2 grid grid-cols-5 gap-2">
                {mcqResults.map((result, index) => (
                  <div
                    key={result.id}
                    className={`flex items-center justify-center w-8 h-8 rounded-full ${
                      index < Math.round(markingProgress.mcq * mcqQuestions.length / 100)
                        ? result.isCorrect
                          ? 'bg-green-600 animate-mark-pulse'
                          : 'bg-red-600 animate-mark-pulse'
                        : 'bg-gray-600'
                    }`}
                  >
                    {index < Math.round(markingProgress.mcq * mcqQuestions.length / 100) &&
                      (result.isCorrect ? '✔' : '✘')}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Fill-in-the-Blank Questions</h3>
              <div className="w-full bg-gray-700 rounded-full h-4">
                <div
                  className="bg-purple-600 h-4 rounded-full progress-bar"
                  style={{ width: `${markingProgress.fillIn}%` }}
                ></div>
              </div>
              <p className="mt-2 text-gray-400">
                Marking {Math.round(markingProgress.fillIn * fillInQuestions.length / 100)} of {fillInQuestions.length} questions...
              </p>
              <div className="mt-2 grid grid-cols-5 gap-2">
                {fillInResults.map((result, index) => (
                  <div
                    key={result.id}
                    className={`flex items-center justify-center w-8 h-8 rounded-full ${
                      index < Math.round(markingProgress.fillIn * fillInQuestions.length / 100)
                        ? result.isCorrect
                          ? 'bg-green-600 animate-mark-pulse'
                          : 'bg-red-600 animate-mark-pulse'
                        : 'bg-gray-600'
                    }`}
                  >
                    {index < Math.round(markingProgress.fillIn * fillInQuestions.length / 100) &&
                      (result.isCorrect ? '✔' : '✘')}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {examStage === 'results' && (
        <div className="mb-6 md:mb-8">
          <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">Exam Results</h2>
          <div className="bg-gray-800 p-3 md:p-4 rounded-lg text-sm md:text-base">
            <p><strong>MCQ Score:</strong> {scores.mcq} / 80 (40 questions × 2 points)</p>
            <p><strong>Fill-in-the-Blank Score:</strong> {scores.fillIn} / 20 (10 questions × 2 points)</p>
            <p><strong>Total Score:</strong> {scores.total} / 100</p>
            <p className="mt-2">
              <strong>Percentage:</strong> {((scores.total / 100) * 100).toFixed(2)}%
            </p>
            <div className="mt-4">
              <h3 className="font-semibold mb-2">MCQ Results</h3>
              {mcqResults.map((result, index) => (
                <div key={result.id} className="mb-2">
                  <p className="font-medium">Question {index + 1}: {result.question}</p>
                  <p className={result.isCorrect ? 'text-green-400' : 'text-red-400'}>
                    Your answer: {result.selectedAnswer} {result.isCorrect ? '(Correct)' : `(Incorrect, Correct: ${result.correctAnswer})`}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <h3 className="font-semibold mb-2">Fill-in-the-Blank Results</h3>
              {fillInResults.map((result, index) => (
                <div key={result.id} className="mb-2">
                  <p className="font-medium">Question {index + 1}: {result.question}</p>
                  <p className={result.isCorrect ? 'text-green-400' : 'text-red-400'}>
                    Your answer: {result.userAnswer} {result.isCorrect ? '(Correct)' : `(Incorrect, Correct: ${result.expectedAnswer})`}
                  </p>
                  <p className="text-gray-400">{result.explanation}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => {
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
              }}
              className="mt-4 bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700"
            >
              Start New Exam
            </button>
          </div>
        </div>
      )}

      <div className="mb-6">
        <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">DwenLite AI Chat</h2>
        <p className="text-gray-400 text-sm md:text-base mb-3 md:mb-4">
          Ask questions about your exam content, and DwenLite AI will provide answers based on the review material.
        </p>
        <div className={`bg-gray-800 p-3 md:p-4 rounded-lg ${chatLoading ? 'pulse-container' : ''}`}>
          <div className="mb-3 max-h-96 overflow-y-auto">
            {chatHistory.map((message, index) => (
              <div
                key={index}
                className={`mb-2 relative ${message.type === 'user' ? 'text-right' : 'text-left'} ${message.type === 'user' ? 'animate-slide-in-right' : 'animate-slide-in-left'}`}
              >
                <span
                  className={`inline-block p-2 rounded-lg text-sm md:text-base ${message.type === 'user' ? 'bg-purple-600' : message.type === 'ai' ? 'bg-gray-700' : 'text-gray-400 italic typing-dots'}`}
                >
                  {message.content.includes('DwenLite AI is typing...') ? (
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
                {message.type === 'ai' && !message.content.includes('DwenLite AI is typing...') && (
                  <button
                    onClick={() => setShowReportForm(showReportForm === index ? null : index)}
                    className="absolute top-0 right-0 text-red-500 hover:text-red-400 text-xs p-1"
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
                      disabled={reportLoading || !reportReason.trim()}
                      className={`mt-2 bg-red-600 text-white py-1 px-3 rounded-lg hover:bg-red-700 text-sm ${reportLoading || !reportReason.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {reportLoading ? (
                        <span className="flex items-center">
                          <svg className="animate-spin h-4 w-4 mr-2 text-white" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
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
          <form onSubmit={handleChatSubmit} className="flex items-center">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask DwenLite AI a question..."
              className="flex-1 p-2 bg-gray-700 text-white rounded-l-lg focus:outline-none text-sm"
              disabled={chatLoading}
            />
            <button
              type="submit"
              disabled={chatLoading}
              className={`bg-purple-600 text-white py-2 px-4 rounded-r-lg hover:bg-purple-700 hover-scale text-sm ${chatLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default ExamsPreparation;