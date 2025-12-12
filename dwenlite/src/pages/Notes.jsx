import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { db, auth } from '../firebase';
import { doc, getDoc, updateDoc, addDoc, collection, setDoc, query, where, getDocs } from 'firebase/firestore';
import { arrayUnion } from 'firebase/firestore';
import toast from 'react-hot-toast';
import axios from 'axios';
import jsPDF from 'jspdf';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

function Notes() {
  const { folderId } = useParams();
  const navigate = useNavigate();
  const [folder, setFolder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notesLoading, setNotesLoading] = useState(false);
  const [showStoredNotes, setShowStoredNotes] = useState(false);
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

  // Configure marked to match CommunitySupport.jsx
  marked.setOptions({
    breaks: true,
    gfm: true,
  });

  // Render Markdown content with sanitization
  const renderMarkdown = (content) => {
    const html = marked(content);
    return DOMPurify.sanitize(html);
  };

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
      // --- CORS FIX ---
      // IMPORTANT: Replace 'YOUR_PROJECT_ID' below with your actual Firebase Project ID.
      // You can find this in Firebase Console -> Project Overview -> Project Settings.
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

      const prompt = `Generate comprehensive and well-organized study notes based on the following content: "${context}". Structure the notes with clear headings, subheadings, and bullet points where appropriate to enhance readability and understanding. Ensure the notes are detailed, covering key concepts, definitions, and examples. Do not include any introductory or concluding statements such as "Here are the notes" or "Let me know if you need modifications." Do not use asterisks (*) for bullet points; use plain text indentation for lists if needed. Format the output as plain text suitable for rendering in a React component.`;

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
             throw new Error('Backend function not found. Did you deploy "generateNotesProxy"?');
          } else if (err.response?.status === 500) {
             throw new Error(`Server Error: ${err.response?.data?.details || err.message}`);
          } else {
             throw new Error(`Generation failed: ${err.message}`);
          }
        });

      let generatedText;
      // Handle the structure returned by the proxy (which returns response.data from DeepSeek)
      if (response.data.choices?.[0]?.message?.content) {
        generatedText = response.data.choices[0].message.content.trim();
      } else if (response.data.choices?.[0]?.text) {
        generatedText = response.data.choices[0].text.trim();
      } else {
        throw new Error('Invalid API response: No generated content found.');
      }

      generatedText = generatedText.replace(/^\* /gm, '• ');

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
    if (!auth.currentUser) {
      toast.error('Please log in to generate notes.');
      return;
    }

    if (gCoins < 3) {
      toast.error(
        <div>
          Insufficient G_COINS. You need 3 G_COINS to generate notes.{' '}
          <Link to="/buy-coins" className="underline text-purple-400 hover:text-purple-300">
            Buy more G_COINS
          </Link>.
        </div>,
        { duration: 5000 }
      );
      return;
    }

    setNotesLoading(true);
    try {
      const newNote = await generateContent();
      
      const folderRef = doc(db, 'folders', folderId);
      await updateDoc(folderRef, {
        notes: arrayUnion(newNote),
      });

      await deductGCoins(auth.currentUser.uid, 3);

      setFolder(prev => ({
        ...prev,
        notes: [...prev.notes, newNote],
      }));
      setRatings(prev => ({
        ...prev,
        [newNote.id]: newNote.rating,
      }));
      setHasRated(prev => ({
        ...prev,
        [newNote.id]: false,
      }));
      toast.success('Notes generated successfully! 3 G_COINS deducted.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setNotesLoading(false);
    }
  };

  const handleDeleteNote = async (noteId) => {
    try {
      const updatedNotes = folder.notes.filter(note => note.id !== noteId);
      const folderRef = doc(db, 'folders', folderId);
      await updateDoc(folderRef, {
        notes: updatedNotes,
      });

      setFolder(prev => ({
        ...prev,
        notes: updatedNotes,
      }));
      setRatings(prev => {
        const newRatings = { ...prev };
        delete newRatings[noteId];
        return newRatings;
      });
      setHasRated(prev => {
        const newHasRated = { ...prev };
        delete newHasRated[noteId];
        return newHasRated;
      });

      toast.success('Note deleted successfully!');
    } catch (err) {
      console.error('Delete note error:', err);
      toast.error('Failed to delete note. Please try again.');
    }
  };

  const handleRateNote = async (noteId, rating) => {
    if (!auth.currentUser) {
      toast.error('Please log in to rate notes.');
      return;
    }

    if (hasRated[noteId]) {
      toast.error('You have already rated this note.');
      return;
    }

    setRatingLoading(prev => ({ ...prev, [noteId]: true }));
    try {
      const folderRef = doc(db, 'folders', folderId);
      const updatedNotes = folder.notes.map(note => 
        note.id === noteId ? { ...note, rating } : note
      );

      await updateDoc(folderRef, {
        notes: updatedNotes,
      });

      setFolder(prev => ({
        ...prev,
        notes: updatedNotes,
      }));
      setRatings(prev => ({
        ...prev,
        [noteId]: rating,
      }));
      setHasRated(prev => ({
        ...prev,
        [noteId]: true,
      }));

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
    setExpandedGroups(prev => ({
      ...prev,
      [noteId]: !prev[noteId],
    }));
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
      const splitText = doc.splitTextToSize(note.content, maxWidth);
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
      if (!user) {
        toast.error('You must be logged in to report content.');
        return;
      }

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
      console.error('Error reporting content:', {
        message: err.message,
        code: err.code,
        details: err.details,
      });
      toast.error(`Failed to report content: ${err.message}. Please try again.`);
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
    console.log('handleNoteSelection called with selectedNoteId:', selectedNoteId);
    if (!selectedNoteId) {
      toast.error('Please select a note.');
      return;
    }

    const selectedNote = folder.notes.find(note => note.id === selectedNoteId);
    if (!selectedNote) {
      console.error('Selected note not found for ID:', selectedNoteId);
      toast.error('Selected note not found.');
      return;
    }

    const lastQuestion = chatHistory.findLast(item => item.type === 'user')?.content;
    if (!lastQuestion) {
      console.error('No last question found in chatHistory:', chatHistory);
      toast.error('No question found to process.');
      return;
    }

    setShowNotePrompt(false);
    try {
      await processQuestion(lastQuestion, selectedNote);
    } catch (err) {
      console.error('Error processing question in handleNoteSelection:', err);
      toast.error('Failed to process question. Please try again.');
    }
  };

  const processQuestion = async (question, note) => {
    setChatLoading(true);
    try {
      const noteIndex = folder.notes.findIndex(n => n.id === note.id) + 1;
      setChatHistory(prev => [
        ...prev,
        { type: 'system', content: `DwenLite AI is reading Note ${noteIndex}...` },
      ]);

      await new Promise(resolve => setTimeout(resolve, 1500));

      // --- CORS FIX for Chat ---
      // Re-using the same functionUrl as generateContent
      // IMPORTANT: Ensure your backend function can handle "prompt" for notes AND questions.
      // Or create a separate function for chat.
      const functionUrl = 'https://us-central1-leumas-decipher-softwares.cloudfunctions.net/generateNotesProxy';

      const prompt = `You are DwenLite AI, an assistant that answers questions based on provided notes. Here is the content of the note:\n\n${note.content}\n\nQuestion: ${question}\n\nProvide a clear, concise, and accurate answer based on the note. If the question cannot be answered from the note, state so and provide a brief explanation. Format the answer as plain text suitable for rendering in a React component.`;

      setChatHistory(prev => [
        ...prev,
        { type: 'system', content: 'DwenLite AI is typing...' },
      ]);

      await new Promise(resolve => setTimeout(resolve, 1000));

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
        throw new Error('Invalid DwenLite API response: No answer found.');
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
            className={`bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 ${notesLoading ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
          >
            Back to Dashboard
          </Link>
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
          .prose {
            color: #d1d5db;
          }
          .prose h1 {
            font-size: 1.25rem;
            font-weight: 700;
            margin-bottom: 1rem;
            color: #ffffff;
          }
          .prose h2 {
            font-size: 1.125rem;
            font-weight: 600;
            margin-bottom: 0.75rem;
            color: #e5e7eb;
          }
          .prose h3 {
            font-size: 1rem;
            font-weight: 600;
            margin-bottom: 0.5rem;
            color: #e5e7eb;
          }
          .prose p {
            margin-bottom: 0.75rem;
          }
          .prose a {
            color: #a78bfa;
            text-decoration: underline;
          }
          .prose a:hover {
            color: #c4b5fd;
          }
          .prose table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 1rem;
          }
          .prose th, .prose td {
            border: 1px solid #4b5563;
            padding: 0.5rem;
            text-align: left;
          }
          .prose th {
            background: #374151;
            font-weight: 600;
          }
          .prose td {
            background: #1f2937;
          }
          .prose ul,
          .prose ol {
            margin-bottom: 0.75rem;
            padding-left: 1.5rem;
          }
          .prose li {
            margin-bottom: 0.25rem;
            list-style-type: disc;
          }
          .prose ol li {
            list-style-type: decimal;
          }
          .prose strong {
            font-weight: 700;
            color: #ffffff;
          }
          .prose em {
            font-style: italic;
          }
          .prose code {
            background: #1f2937;
            padding: 0.2rem 0.4rem;
            border-radius: 0.25rem;
            font-family: 'Courier New', Courier, monospace;
          }
          .prose pre {
            background: #1f2937;
            padding: 1rem;
            border-radius: 0.5rem;
            overflow-x: auto;
          }
          .prose blockquote {
            border-left: 4px solid #a78bfa;
            padding-left: 1rem;
            margin: 0.75rem 0;
            font-style: italic;
          }
        `}
      </style>

      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-bold">{folder.name} - Notes</h1>
        <div className="mt-2 flex items-center space-x-3">
          <Link
            to={`/folder/${folderId}`}
            className={`bg-purple-600 text-white py-1 px-3 rounded-md hover:bg-purple-700 text-xs md:text-sm ${notesLoading ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
          >
            Back to Folder
          </Link>
          <p className={`text-sm md:text-base ml-2 ${gCoinsAnimating ? 'coins-deduct' : ''}`}>
            💰 G_COINS: {gCoins}
          </p>
        </div>
      </div>

      <div className="mb-6 md:mb-8">
        <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">Generate Notes</h2>
        <p className="text-gray-400 text-sm md:text-base mb-3 md:mb-4">
          Note generation typically takes 1-5 minutes and costs 3 G_COINS. Processing time may vary based on server load and document size.
        </p>
        <button
          onClick={handleGenerateNotes}
          disabled={notesLoading}
          className={`bg-gray-800 p-3 md:p-4 rounded-lg flex items-center justify-between hover:bg-gray-700 text-sm md:text-base w-full ${notesLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {notesLoading ? (
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
              Generating Notes...
            </span>
          ) : (
            <>
              <span>Generate Notes (3 G_COINS)</span>
              <span>➔</span>
            </>
          )}
        </button>
      </div>

      <div className="mb-6">
        <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">Stored Notes</h2>
        {folder.notes?.length === 0 ? (
          <p className="text-gray-400 text-sm">No notes available in this folder. Generate a new note to start!</p>
        ) : (
          <div>
            <button
              onClick={() => setShowStoredNotes(!showStoredNotes)}
              className={`bg-gray-800 p-3 rounded-lg flex items-center justify-between hover:bg-gray-700 text-sm w-full mb-3 ${notesLoading ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
              disabled={notesLoading}
            >
              <span>{showStoredNotes ? 'Hide Stored Notes' : 'Show Stored Notes'}</span>
              <span>{showStoredNotes ? '▼' : '▶'}</span>
            </button>
            {showStoredNotes && (
              <div className="space-y-3">
                {folder.notes.map((note, index) => (
                  <div
                    key={note.id}
                    className="bg-gray-800 p-3 sm:p-4 rounded-lg"
                  >
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-2 space-y-2 sm:space-y-0">
                      <button
                        onClick={() => handleToggleGroup(note.id)}
                        className={`text-left flex-1 text-sm sm:text-base font-semibold hover:text-purple-400 ${notesLoading ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
                        disabled={notesLoading}
                      >
                        Note {index + 1} (Created: {new Date(note.createdAt).toLocaleDateString()})
                      </button>
                      <div className="flex items-center space-x-2 sm:space-x-3">
                        <div className={`star-rating ${hasRated[note.id] ? 'disabled' : ''}`}>
                          {[1, 2, 3, 4, 5].map(star => (
                            <svg
                              key={star}
                              onClick={() => !hasRated[note.id] && handleRateNote(note.id, star)}
                              className={`w-4 h-4 sm:w-5 sm:h-5 star ${ratings[note.id] >= star ? 'filled' : ''}`}
                              fill="currentColor"
                              viewBox="0 0 20 20"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                          ))}
                        </div>
                        {ratingLoading[note.id] && (
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
                          onClick={() => handleToggleGroup(note.id)}
                          className={`text-gray-400 hover:text-white text-sm sm:text-base ${notesLoading ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
                          disabled={notesLoading}
                        >
                          {expandedGroups[note.id] ? 'Hide Notes' : 'Show Notes'}
                        </button>
                        <button
                          onClick={() => handleDownloadPDF(note)}
                          className={`bg-blue-600 text-white py-1 px-3 sm:px-4 rounded-lg hover:bg-blue-700 text-sm ${notesLoading ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
                          disabled={notesLoading}
                        >
                          Download PDF
                        </button>
                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          className={`bg-red-600 text-white py-1 px-3 sm:px-4 rounded-lg hover:bg-red-700 text-sm ${notesLoading ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
                          disabled={notesLoading}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    {expandedGroups[note.id] && (
                      <div className="mt-2 prose prose-invert max-w-none">
                        <div
                          className="text-gray-300 text-sm sm:text-base break-words"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(note.content) }}
                        />
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
          Ask questions about your notes, and DwenLite AI will provide answers based on the selected note.
        </p>
        <div className={`bg-gray-800 p-3 md:p-4 rounded-lg ${chatLoading ? 'pulse-container' : ''}`}>
          <div className="mb-3 max-h-96 overflow-y-auto">
            {chatHistory.map((message, index) => (
              <div
                key={index}
                className={`mb-2 relative ${message.type === 'user' ? 'text-right' : 'text-left'} ${
                  message.type === 'user' ? 'animate-slide-in-right' : 'animate-slide-in-left'
                }`}
              >
                <span
                  className={`inline-block p-2 rounded-lg text-sm md:text-base ${
                    message.type === 'user'
                      ? 'bg-purple-600'
                      : message.type === 'ai'
                      ? 'bg-gray-700'
                      : 'text-gray-400 italic typing-dots'
                  }`}
                >
                  {message.content.includes('DwenLite AI is typing...') || message.content.includes('DwenLite AI is reading Note...') ? (
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
                    className={`absolute top-0 right-0 text-red-500 hover:text-red-400 text-xs p-1 ${notesLoading ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
                    disabled={notesLoading}
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
                      disabled={reportLoading || !reportReason.trim() || notesLoading}
                      className={`mt-2 bg-red-600 text-white py-1 px-3 rounded-lg hover:bg-red-700 text-sm ${
                        reportLoading || !reportReason.trim() || notesLoading ? 'opacity-50 cursor-not-allowed' : ''
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
          {showNotePrompt && (
            <div className="mb-3 animate-fade-in">
              <select
                value={selectedNoteId}
                onChange={(e) => {
                  console.log('Selected note ID changed to:', e.target.value);
                  setSelectedNoteId(e.target.value);
                }}
                className="w-full p-2 bg-gray-700 text-white rounded-lg text-sm"
                disabled={notesLoading}
              >
                <option value="">Select a note</option>
                {folder.notes.map((note, index) => (
                  <option key={note.id} value={note.id}>
                    Note {index + 1} (Created: {new Date(note.createdAt).toLocaleDateString()})
                  </option>
                ))}
              </select>
              {typeof handleNoteSelection === 'function' ? (
                <button
                  onClick={() => {
                    console.log('Note selection button clicked');
                    handleNoteSelection();
                  }}
                  className={`mt-2 bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 w-full hover-scale text-sm ${notesLoading ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
                  disabled={notesLoading}
                >
                  Submit
                </button>
              ) : (
                <p className="text-red-500 mt-2">
                  Error: Note selection is unavailable. Please refresh the page.
                </p>
              )}
            </div>
          )}
          {!showNotePrompt && (
            <form onSubmit={handleChatSubmit} className="flex items-center">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask DwenLite AI a question..."
                className="flex-1 p-2 bg-gray-700 text-white rounded-l-lg focus:outline-none text-sm"
                disabled={chatLoading || notesLoading}
              />
              <button
                type="submit"
                disabled={chatLoading || notesLoading}
                className={`bg-purple-600 text-white py-2 px-4 rounded-r-lg hover:bg-purple-700 hover-scale text-sm ${
                  chatLoading || notesLoading ? 'opacity-50 cursor-not-allowed' : ''
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

export default Notes;