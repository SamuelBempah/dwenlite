import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { db, auth } from '../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { arrayUnion } from 'firebase/firestore';
import toast from 'react-hot-toast';
import axios from 'axios';
import jsPDF from 'jspdf';

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
      const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY;
      if (!apiKey) {
        throw new Error('DwenLite API key not found. Please set VITE_DWENLITE_API_KEY in your .env file.');
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

      const prompt = `Generate comprehensive and well-organized study notes based on the following content: "${context}". Structure the notes with clear headings, subheadings, and bullet points where appropriate to enhance readability and understanding. Ensure the notes are detailed, covering key concepts, definitions, and examples. Do not include any introductory or concluding statements such as "Here are the notes" or "Let me know if you need modifications." Do not use asterisks (*) for bullet points; use plain text indentation for lists if needed. Format the output as plain text suitable for rendering in a React component.`;

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
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      ).catch(err => {
        console.error('DwenLite API error:', {
          status: err.response?.status,
          statusText: err.response?.statusText,
          data: err.response?.data,
          message: err.message,
        });
        if (err.response?.status === 401) {
          throw new Error('Invalid DwenLite API key. Please check your API key in the .env file.');
        } else if (err.response?.status === 429) {
          throw new Error('Rate limit exceeded. Please wait a few minutes and try again.');
        } else if (err.response?.status === 404) {
          throw new Error('DwenLite API endpoint not found. The endpoint may have changed.');
        } else {
          throw new Error(`DwenLite API request failed: ${err.message}`);
        }
      });

      let generatedText;
      if (response.data.choices?.[0]?.message?.content) {
        generatedText = response.data.choices[0].message.content.trim();
      } else if (response.data.choices?.[0]?.text) {
        generatedText = response.data.choices[0].text.trim();
      } else {
        throw new Error('Invalid DwenLite API response: No generated content found.');
      }

      // Replace asterisks used as bullet points with a bullet symbol (•)
      generatedText = generatedText.replace(/^\* /gm, '• ');

      return { 
        id: Date.now().toString(), 
        content: generatedText,
        createdAt: new Date().toISOString()
      };
    } catch (err) {
      console.error('Error generating notes:', err);
      throw new Error(err.message);
    }
  };

  const handleGenerateNotes = async () => {
    setNotesLoading(true);
    try {
      const newNote = await generateContent();
      
      const folderRef = doc(db, 'folders', folderId);
      await updateDoc(folderRef, {
        notes: arrayUnion(newNote),
      });

      setFolder(prev => ({
        ...prev,
        notes: [...prev.notes, newNote],
      }));
      toast.success('Notes generated successfully!');
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

      toast.success('Note deleted successfully!');
    } catch (err) {
      console.error('Delete note error:', err);
      toast.error('Failed to delete note. Please try again.');
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
    if (!selectedNoteId) {
      toast.error('Please select a note.');
      return;
    }

    const selectedNote = folder.notes.find(note => note.id === selectedNoteId);
    if (!selectedNote) {
      toast.error('Selected note not found.');
      return;
    }

    const lastQuestion = chatHistory.findLast(item => item.type === 'user')?.content;
    if (!lastQuestion) {
      toast.error('No question found to process.');
      return;
    }

    setShowNotePrompt(false);
    await processQuestion(lastQuestion, selectedNote);
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

      const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY;
      if (!apiKey) {
        throw new Error('DwenLite API key not found. Please set VITE_DWENLITE_API_KEY in your .env file.');
      }

      const prompt = `You are DwenLite AI, an assistant that answers questions based on provided notes. Here is the content of the note:\n\n${note.content}\n\nQuestion: ${question}\n\nProvide a clear, concise, and accurate answer based on the note. If the question cannot be answered from the note, state so and provide a brief explanation. Format the answer as plain text suitable for rendering in a React component.`;

      setChatHistory(prev => [
        ...prev,
        { type: 'system  system', content: 'DwenLite AI is typing...' },
      ]);

      await new Promise(resolve => setTimeout(resolve, 1000));

      const response = await axios.post(
        'https://api.deepseek.com/v1/chat/completions',
        {
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'You are DwenLite AI, a helpful assistant for answering questions based on notes.' },
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
      ).catch(err => {
        console.error('DwenLite API error:', {
          status: err.response?.status,
          statusText: err.response?.statusText,
          data: err.response?.data,
          message: err.message,
        });
        if (err.response?.status === 401) {
          throw new Error('Invalid DwenLite API key. Please check your API key in the .env file.');
        } else if (err.response?.status === 429) {
          throw new Error('Rate limit exceeded. Please wait a few minutes and try again.');
        } else if (err.response?.status === 404) {
          throw new Error('DwenLite API endpoint not found. The endpoint may have changed.');
        } else {
          throw new Error(`DwenLite API request failed: ${err.message}`);
        }
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
            className="mt-4 inline-block bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700"
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
        <h1 className="text-2xl md:text-3xl font-bold">{folder.name} - Notes</h1>
        <Link
          to={`/folder/${folderId}`}
          className="bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 text-sm md:text-base"
        >
          Back to Folder
        </Link>
      </div>

      <div className="mb-6 md:mb-8">
        <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">Generate Notes</h2>
        <p className="text-gray-400 text-sm md:text-base mb-3 md:mb-4">
          Note generation typically takes 1-5 Minutes. Processing time may vary based on server load and document size.
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
              <span>Generate Notes</span>
              <span>➔</span>
            </>
          )}
        </button>
      </div>

      <div className="mb-6">
        <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">Stored Notes</h2>
        {folder.notes?.length === 0 ? (
          <p className="text-gray-400 text-sm md:text-base">No notes available in this folder.</p>
        ) : (
          <div>
            <button
              onClick={() => setShowStoredNotes(!showStoredNotes)}
              className="bg-gray-800 p-3 md:p-4 rounded-lg flex items-center justify-between hover:bg-gray-700 text-sm md:text-base w-full mb-3"
            >
              <span>{showStoredNotes ? 'Hide Stored Notes' : 'Show Stored Notes'}</span>
              <span>{showStoredNotes ? '▼' : '▶'}</span>
            </button>
            {showStoredNotes && (
              <div className="space-y-3">
                {folder.notes.map((note, index) => (
                  <div
                    key={note.id}
                    className="bg-gray-800 p-3 md:p-4 rounded-lg"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <button
                        onClick={() => handleToggleGroup(note.id)}
                        className="text-left flex-1 text-base md:text-lg font-semibold hover:text-purple-400"
                      >
                        Notes {index + 1} (Created: {new Date(note.createdAt).toLocaleDateString()})
                      </button>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleToggleGroup(note.id)}
                          className="text-gray-400 hover:text-white"
                        >
                          {expandedGroups[note.id] ? 'Hide Notes' : 'Show Notes'}
                        </button>
                        <button
                          onClick={() => handleDownloadPDF(note)}
                          className="bg-blue-600 text-white py-1 px-3 rounded-lg hover:bg-blue-700"
                        >
                          Download PDF
                        </button>
                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          className="bg-red-600 text-white py-1 px-3 rounded-lg hover:bg-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    {expandedGroups[note.id] && (
                      <div className="mt-2">
                        <p className="text-gray-300 text-sm md:text-base whitespace-pre-wrap">{note.content}</p>
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
          {showNotePrompt && (
            <div className="mb-3 animate-fade-in">
              <select
                value={selectedNoteId}
                onChange={(e) => setSelectedNoteId(e.target.value)}
                className="w-full p-2 bg-gray-700 text-white rounded-lg"
              >
                <option value="">Select a note</option>
                {folder.notes.map((note, index) => (
                  <option key={note.id} value={note.id}>
                    Note {index + 1} (Created: {new Date(note.createdAt).toLocaleDateString()})
                  </option>
                ))}
              </select>
              <button
                onClick={handleNoteSelection}
                className="mt-2 bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 w-full hover-scale"
              >
                Submit
              </button>
            </div>
          )}
          {!showNotePrompt && (
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

export default Notes;