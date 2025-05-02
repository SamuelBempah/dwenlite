import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { db, auth } from '../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import axios from 'axios';

function Flashcards() {
  const { folderId } = useParams();
  const navigate = useNavigate();
  const [folder, setFolder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [flashcardsLoading, setFlashcardsLoading] = useState(false);
  const [currentFlashcardIndex, setCurrentFlashcardIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [showStoredFlashcards, setShowStoredFlashcards] = useState(false);
  const [selectedFlashcardGroup, setSelectedFlashcardGroup] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [chatInput, setChatInput] = useState('');
  const [selectedFlashcardGroupId, setSelectedFlashcardGroupId] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [showFlashcardGroupPrompt, setShowFlashcardGroupPrompt] = useState(false);

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

      folderData.flashcardGroups = folderData.flashcardGroups || [];
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

  const generateContent = async () => {
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

      const prompt = `Generate 20 flashcards based on the following content: "${context}". Each flashcard should have a question and an answer. Format as a JSON array: [{ "question": "...", "answer": "..." }, ...]. Return only the JSON array string, without any markdown, code block markers (like \`\`\`json), or additional text. Ensure the output is valid JSON.`;

      const response = await axios.post(
        'https://api.deepseek.com/v1/chat/completions',
        {
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'You are a helpful assistant for generating educational content.' },
            { role: 'user', content: prompt },
          ],
          max_tokens: 2000,
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

      let flashcards;
      try {
        flashcards = JSON.parse(generatedText);
      } catch (parseErr) {
        console.error('JSON parse error:', parseErr, 'Cleaned response:', generatedText);
        throw new Error('Failed to parse flashcard data. Please try again.');
      }

      if (!Array.isArray(flashcards)) {
        throw new Error('API response must be a JSON array.');
      }

      return flashcards.map(card => ({
        id: Date.now().toString() + Math.random().toString(36).substring(2),
        ...card,
      }));
    } catch (err) {
      console.error('Error generating flashcards:', err);
      throw new Error(err.message);
    }
  };

  const handleGenerateFlashcards = async () => {
    setFlashcardsLoading(true);
    try {
      const newFlashcards = await generateContent();

      const newFlashcardGroup = {
        id: Date.now().toString(),
        flashcards: newFlashcards,
        createdAt: new Date().toISOString(),
      };

      const folderRef = doc(db, 'folders', folderId);
      const updatedFlashcardGroups = [...(folder.flashcardGroups || []), newFlashcardGroup];

      await updateDoc(folderRef, {
        flashcardGroups: updatedFlashcardGroups,
      });

      setFolder(prev => ({
        ...prev,
        flashcardGroups: updatedFlashcardGroups,
      }));
      toast.success('New flashcard group generated successfully!');
      setSelectedFlashcardGroup(newFlashcardGroup);
      setCurrentFlashcardIndex(0);
      setShowAnswer(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setFlashcardsLoading(false);
    }
  };

  const handleDeleteFlashcardGroup = async (groupId) => {
    try {
      const folderRef = doc(db, 'folders', folderId);
      const updatedFlashcardGroups = folder.flashcardGroups.filter(group => group.id !== groupId);

      await updateDoc(folderRef, {
        flashcardGroups: updatedFlashcardGroups,
      });

      setFolder(prev => ({
        ...prev,
        flashcardGroups: updatedFlashcardGroups,
      }));

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

  const handleSelectFlashcardGroup = (group) => {
    setSelectedFlashcardGroup(group);
    setCurrentFlashcardIndex(0);
    setShowAnswer(false);
  };

  const handleToggleGroup = (groupId) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
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

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const question = chatInput.trim();
    setChatInput('');

    const flashcardGroupRegex = /(?:reference|check|use|from)\s*(?:flashcard\s*group\s*)(\d+|one|two|three|four|five)/i;
    const match = question.match(flashcardGroupRegex);
    let flashcardGroupIndex = null;

    if (match) {
      const flashcardGroupRef = match[1].toLowerCase();
      const numberWords = ['one', 'two', 'three', 'four', 'five'];
      if (numberWords.includes(flashcardGroupRef)) {
        flashcardGroupIndex = numberWords.indexOf(flashcardGroupRef);
      } else if (!isNaN(parseInt(flashcardGroupRef))) {
        flashcardGroupIndex = parseInt(flashcardGroupRef) - 1;
      }
    }

    if (flashcardGroupIndex !== null && folder.flashcardGroups[flashcardGroupIndex]) {
      const selectedFlashcardGroup = folder.flashcardGroups[flashcardGroupIndex];
      await processQuestion(question, selectedFlashcardGroup);
    } else if (folder.flashcardGroups.length === 0) {
      toast.error('No flashcard groups available to reference.');
      return;
    } else {
      setShowFlashcardGroupPrompt(true);
      setChatHistory(prev => [
        ...prev,
        { type: 'user', content: question },
        { type: 'system', content: 'Please select a flashcard group to reference for this question.' },
      ]);
      setSelectedFlashcardGroupId('');
    }
  };

  const handleFlashcardGroupSelection = async () => {
    if (!selectedFlashcardGroupId) {
      toast.error('Please select a flashcard group.');
      return;
    }

    const selectedFlashcardGroup = folder.flashcardGroups.find(group => group.id === selectedFlashcardGroupId);
    if (!selectedFlashcardGroup) {
      toast.error('Selected flashcard group not found.');
      return;
    }

    const lastQuestion = chatHistory.findLast(item => item.type === 'user')?.content;
    if (!lastQuestion) {
      toast.error('No question found to process.');
      return;
    }

    setShowFlashcardGroupPrompt(false);
    await processQuestion(lastQuestion, selectedFlashcardGroup);
  };

  const scrapeWeb = async (query) => {
    try {
      const apiKey = import.meta.env.VITE_SERPAPI_API_KEY;
      if (!apiKey) {
        throw new Error('SerpApi API key not found. Please set VITE_SERPAPI_API_KEY in your .env file.');
      }

      const params = new URLSearchParams({
        q: query,
        api_key: apiKey,
      });

      const response = await axios.get(`https://serpapi.com/search?${params.toString()}`).catch(err => {
        console.error('SerpApi request error:', {
          status: err.response?.status,
          statusText: err.response?.statusText,
          data: err.response?.data,
          message: err.message,
        });
        let errorMessage = 'Web search request failed';
        if (err.response?.status === 401) {
          errorMessage = 'Invalid SerpApi API key. Please check your API key in the .env file.';
        } else if (err.response?.status === 429) {
          errorMessage = 'SerpApi rate limit exceeded. Please wait a few minutes and try again.';
        }
        throw new Error(`${errorMessage}: ${err.message}`);
      });

      const organicResults = response.data.organic_results || [];
      let searchResults = organicResults.slice(0, 3).map(result => ({
        title: result.title,
        snippet: result.snippet,
        link: result.link,
      }));

      if (searchResults.length === 0) {
        searchResults = [{ title: 'No results found', snippet: 'No relevant information was found for your query.', link: '' }];
      }

      return searchResults;
    } catch (err) {
      console.error('Web scraping error:', err);
      throw new Error(`Web scraping failed: ${err.message}`);
    }
  };

  const processQuestion = async (question, flashcardGroup) => {
    setChatLoading(true);
    try {
      const flashcardContent = flashcardGroup.flashcards.map((card, index) => {
        return `Flashcard ${index + 1}:\nQuestion: ${card.question}\nAnswer: ${card.answer}`;
      }).join('\n\n');

      const flashcardGroupIndex = folder.flashcardGroups.findIndex(g => g.id === flashcardGroup.id) + 1;
      setChatHistory(prev => [
        ...prev,
        { type: 'system', content: `DwenLite AI is reading Flashcard Group ${flashcardGroupIndex}...` },
      ]);

      await new Promise(resolve => setTimeout(resolve, 1500));

      const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY;
      if (!apiKey) {
        throw new Error('DeepSeek API key not found. Please set VITE_DEEPSEEK_API_KEY in your .env file.');
      }

      let prompt = `You are DwenLite AI, an assistant that answers questions based on provided flashcard group content. Here is the content of the flashcard group:\n\n${flashcardContent}\n\nQuestion: ${question}\n\nProvide a clear, concise, and accurate answer based on the flashcard group content. If the question cannot be answered from the flashcard group, state so and provide a brief explanation. Format the answer as plain text suitable for rendering in a React component.`;

      setChatHistory(prev => [
        ...prev,
        { type: 'system', content: 'DwenLite AI is typing...' },
      ]);

      await new Promise(resolve => setTimeout(resolve, 1000));

      let response = await axios.post(
        'https://api.deepseek.com/v1/chat/completions',
        {
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'You are DwenLite AI, a helpful assistant for answering questions based on flashcard groups.' },
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

      if (answer.includes('cannot be answered from the flashcard group')) {
        setChatHistory(prev => [
          ...prev,
          { type: 'system', content: 'DwenLite AI is searching the web for additional information...' },
        ]);

        await new Promise(resolve => setTimeout(resolve, 1000));

        const searchResults = await scrapeWeb(question);
        const searchContent = searchResults.map(result => `Title: ${result.title}\nSnippet: ${result.snippet}\nLink: ${result.link}`).join('\n\n');

        prompt = `You are DwenLite AI, an assistant that answers questions using provided flashcard group content and web search results. The flashcard group content did not provide enough information to answer the question. Here is the flashcard group content:\n\n${flashcardContent}\n\nHere are the web search results:\n\n${searchContent}\n\nQuestion: ${question}\n\nProvide a clear, concise, and accurate answer based on the web search results. If the question still cannot be answered, state so and provide a brief explanation. Format the answer as plain text suitable for rendering in a React component.`;

        response = await axios.post(
          'https://api.deepseek.com/v1/chat/completions',
          {
            model: 'deepseek-chat',
            messages: [
              { role: 'system', content: 'You are DwenLite AI, a helpful assistant for answering questions using flashcard groups and web search results.' },
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
          console.error('DeepSeek API error (web search):', {
            status: err.response?.status,
            statusText: err.response?.statusText,
            data: err.response?.data,
            message: err.message,
          });
          throw new Error(`DeepSeek API request failed: ${err.message}`);
        });

        if (response.data.choices?.[0]?.message?.content) {
          answer = response.data.choices[0].message.content.trim();
        } else if (response.data.choices?.[0]?.text) {
          answer = response.data.choices[0].text.trim();
        } else {
          throw new Error('Invalid DeepSeek API response: No answer found after web search.');
        }
      }

      setChatHistory(prev => prev.filter(item => item.content !== 'DwenLite AI is typing...' && item.content !== 'DwenLite AI is searching the web for additional information...').concat({
        type: 'ai',
        content: answer,
      }));

    } catch (err) {
      console.error('Error processing question:', err);
      toast.error(err.message);
      setChatHistory(prev => prev.filter(item => item.content !== 'DwenLite AI is typing...' && item.content !== 'DwenLite AI is searching the web for additional information...'));
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

  const currentFlashcard = selectedFlashcardGroup?.flashcards[currentFlashcardIndex];

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
          @keyframes flipCard {
            0% { transform: rotateY(0deg); }
            100% { transform: rotateY(180deg); }
          }
          @keyframes flipCardBack {
            0% { transform: rotateY(180deg); }
            100% { transform: rotateY(0deg); }
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
          .flashcard-container {
            perspective: 1000px;
            width: 100%;
            max-width: 600px;
            height: 300px;
            margin: 0 auto;
          }
          .flashcard {
            position: relative;
            width: 100%;
            height: 100%;
            transition: transform 0.6s;
            transform-style: preserve-3d;
          }
          .flashcard.flipped {
            transform: rotateY(180deg);
          }
          .flashcard-front, .flashcard-back {
            position: absolute;
            width: 100%;
            height: 100%;
            backface-visibility: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            border-radius: 12px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
            text-align: center;
          }
          .flashcard-front {
            background-color: #4B5563;
            color: white;
          }
          .flashcard-back {
            background-color: #6B7280;
            color: white;
            transform: rotateY(180deg);
          }
        `}
      </style>

      <div className="flex justify-between items-center mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-bold">{folder.name} - Flashcards</h1>
        <Link
          to={`/folder/${folderId}`}
          className="bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 text-sm md:text-base"
        >
          Back to Folder
        </Link>
      </div>

      <div className="mb-6 md:mb-8">
        <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">Generate Flashcards</h2>
        <p className="text-gray-400 text-sm md:text-base mb-3 md:mb-4">
          FlashCards generation typically takes 30-60 seconds. Processing time may vary based on server load and document size.
        </p>
        <button
          onClick={handleGenerateFlashcards}
          disabled={flashcardsLoading}
          className={`bg-gray-800 p-3 md:p-4 rounded-lg flex items-center justify-between hover:bg-gray-700 text-sm md:text-base w-full ${
            flashcardsLoading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {flashcardsLoading ? (
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
              <span>Generate Flashcards</span>
              <span>➔</span>
            </>
          )}
        </button>
      </div>

      <div className="mb-6">
        <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">Review Flashcards</h2>
        {!selectedFlashcardGroup ? (
          <p className="text-gray-400 text-sm md:text-base">Select a flashcard group from the stored flashcards to start!</p>
        ) : currentFlashcardIndex >= selectedFlashcardGroup.flashcards.length ? (
          <p className="text-gray-400 text-sm md:text-base">You've completed this flashcard group! Select another to continue.</p>
        ) : currentFlashcard ? (
          <div className="mb-3 md:mb-4">
            <h3 className="text-base md:text-lg font-semibold mb-4 text-center">
              Flashcard {currentFlashcardIndex + 1} of {selectedFlashcardGroup.flashcards.length}
            </h3>
            <div className="flashcard-container">
              <div className={`flashcard ${showAnswer ? 'flipped' : ''}`}>
                <div className="flashcard-front">
                  <p className="text-gray-300 text-sm md:text-base">{currentFlashcard.question}</p>
                </div>
                <div className="flashcard-back">
                  <p className="text-gray-300 text-sm md:text-base">{currentFlashcard.answer}</p>
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-center max-w-600 mx-auto">
              <button
                onClick={handleToggleAnswer}
                className="bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700"
              >
                {showAnswer ? 'Show Question' : 'Show Answer'}
              </button>
            </div>
            <div className="mt-4 flex justify-between max-w-600 mx-auto">
              <button
                onClick={handlePreviousFlashcard}
                disabled={currentFlashcardIndex === 0}
                className={`bg-gray-700 text-white py-2 px-4 rounded-lg hover:bg-gray-600 ${
                  currentFlashcardIndex === 0 ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                Previous
              </button>
              <button
                onClick={handleNextFlashcard}
                className="bg-gray-700 text-white py-2 px-4 rounded-lg hover:bg-gray-600"
              >
                Next
              </button>
            </div>
          </div>
        ) : (
          <p className="text-gray-400 text-sm md:text-base">Loading flashcard...</p>
        )}
      </div>

      <div className="mb-6">
        <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">Stored Flashcard Groups</h2>
        {folder.flashcardGroups.length === 0 ? (
          <p className="text-gray-400 text-sm md:text-base">No flashcard groups available. Generate a new group to start!</p>
        ) : (
          <div>
            <button
              onClick={() => setShowStoredFlashcards(!showStoredFlashcards)}
              className="bg-gray-800 p-3 md:p-4 rounded-lg flex items-center justify-between hover:bg-gray-700 text-sm md:text-base w-full mb-3"
            >
              <span>{showStoredFlashcards ? 'Hide Stored Flashcard Groups' : 'Show Stored Flashcard Groups'}</span>
              <span>{showStoredFlashcards ? '▼' : '▶'}</span>
            </button>
            {showStoredFlashcards && (
              <div className="space-y-3">
                {folder.flashcardGroups.map((group, index) => (
                  <div
                    key={group.id}
                    className="bg-gray-800 p-3 md:p-4 rounded-lg"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <button
                        onClick={() => handleSelectFlashcardGroup(group)}
                        className="text-left flex-1 text-base md:text-lg font-semibold hover:text-purple-400"
                      >
                        Flashcard Group {index + 1} (Created: {new Date(group.createdAt).toLocaleDateString()})
                      </button>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleToggleGroup(group.id)}
                          className="text-gray-400 hover:text-white"
                        >
                          {expandedGroups[group.id] ? 'Hide Flashcards' : 'Show Flashcards'}
                        </button>
                        <button
                          onClick={() => handleDeleteFlashcardGroup(group.id)}
                          className="bg-red-600 text-white py-1 px-3 rounded-lg hover:bg-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    {expandedGroups[group.id] && (
                      <div className="mt-2 space-y-3">
                        {group.flashcards.map((card, cIndex) => (
                          <div key={card.id} className="bg-gray-700 p-3 rounded-lg">
                            <p className="text-sm md:text-base font-semibold">
                              Flashcard {cIndex + 1}
                            </p>
                            <p className="text-gray-300 text-sm md:text-base">
                              <strong>Question:</strong> {card.question}
                            </p>
                            <p className="text-gray-300 text-sm md:text-base">
                              <strong>Answer:</strong> {card.answer}
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
          Ask questions about your flashcard groups, and DwenLite AI will provide answers based on the selected flashcard group.
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
                  {message.content.includes('DwenLite AI is typing...') || message.content.includes('DwenLite AI is searching the web...') ? (
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
              </div>
            ))}
          </div>
          {showFlashcardGroupPrompt && (
            <div className="mb-3 animate-fade-in">
              <select
                value={selectedFlashcardGroupId}
                onChange={(e) => setSelectedFlashcardGroupId(e.target.value)}
                className="w-full p-2 bg-gray-700 text-white rounded-lg"
              >
                <option value="">Select a flashcard group</option>
                {folder.flashcardGroups.map((group, index) => (
                  <option key={group.id} value={group.id}>
                    Flashcard Group {index + 1} (Created: {new Date(group.createdAt).toLocaleDateString()})
                  </option>
                ))}
              </select>
              <button
                onClick={handleFlashcardGroupSelection}
                className="mt-2 bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 w-full hover-scale"
              >
                Submit
              </button>
            </div>
          )}
          {!showFlashcardGroupPrompt && (
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

export default Flashcards;