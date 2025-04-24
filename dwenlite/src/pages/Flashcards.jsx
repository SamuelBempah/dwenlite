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
  const [expandedGroups, setExpandedGroups] = useState({}); // Track which groups are expanded

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

      const context = latestDocument?.extractedText || folder.name;
      let prompt = `Generate 40 flashcards based on the following content: "${context}". For each flashcard, provide a question and answer. Format as a JSON array: [{ "question": "...", "answer": "..." }, ...]. Return only the JSON array string, without any markdown, code block markers (like \`\`\`json), or additional text. Ensure the output is valid JSON.`;
      
      if (retry) {
        prompt = `You previously failed to return valid JSON. Generate 40 flashcards based on the following content: "${context}". For each flashcard, provide a question and answer. Format as a JSON array: [{ "question": "...", "answer": "..." }, ...]. Return ONLY the JSON array string. Do NOT include markdown, code block markers (like \`\`\`json), or any additional text before or after the JSON. The output MUST be valid JSON, parsable by JSON.parse().`;
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
        console.error('Axios error:', {
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
          throw new Error(`API request failed: ${err.message}`);
        }
      });

      let generatedText;
      if (response.data.choices?.[0]?.message?.content) {
        generatedText = response.data.choices[0].message.content.trim();
      } else if (response.data.choices?.[0]?.text) {
        generatedText = response.data.choices[0].text.trim();
      } else {
        throw new Error('Invalid API response: No generated content found in response.');
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
        if (!retry) {
          console.log('Retrying API call with stricter prompt...');
          return await generateContent(true);
        }
        console.warn('Falling back to default flashcard due to repeated parsing failure.');
        flashcards = [
          {
            question: 'What is the capital of France?',
            answer: 'Paris',
          },
        ];
      }

      if (!Array.isArray(flashcards)) {
        throw new Error('API response must be a JSON array.');
      }

      while (flashcards.length < 40) {
        flashcards.push({
          question: `Sample question ${flashcards.length + 1}`,
          answer: `Sample answer ${flashcards.length + 1}`,
        });
      }

      flashcards = flashcards.slice(0, 40);

      return flashcards.map(flashcard => ({
        id: Date.now().toString() + Math.random().toString(36).substring(2),
        ...flashcard,
      }));
    } catch (err) {
      console.error('Error generating flashcards:', err);
      throw new Error(err.message);
    }
  };

  const handleRegenerateFlashcards = async () => {
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

  const handleNextFlashcard = () => {
    setShowAnswer(false);
    setCurrentFlashcardIndex(prev => prev + 1);
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
        <button
          onClick={handleRegenerateFlashcards}
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
              <span>Regenerate Flashcards</span>
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
          <p className="text-gray-400 text-sm md:text-base">You've reviewed all flashcards in this group! Select another to continue.</p>
        ) : currentFlashcard ? (
          <div className="bg-gray-800 p-3 md:p-4 rounded-lg mb-3 md:mb-4">
            <h3 className="text-base md:text-lg font-semibold mb-2">
              Flashcard {currentFlashcardIndex + 1} of {selectedFlashcardGroup.flashcards.length}: {currentFlashcard.question}
            </h3>
            {showAnswer && (
              <p className="text-gray-300 text-sm md:text-base mb-4">{currentFlashcard.answer}</p>
            )}
            <button
              onClick={() => setShowAnswer(!showAnswer)}
              className="bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 mr-2"
            >
              {showAnswer ? 'Hide Answer' : 'Show Answer'}
            </button>
            <button
              onClick={handleNextFlashcard}
              className="bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700"
            >
              Next Flashcard
            </button>
          </div>
        ) : (
          <p className="text-gray-400 text-sm md:text-base">Loading flashcard...</p>
        )}
      </div>

      <div className="mb-6">
        <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">Stored Flashcard Groups</h2>
        {folder.flashcardGroups?.length === 0 ? (
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
                        {group.flashcards.map((flashcard, fIndex) => (
                          <div key={flashcard.id} className="bg-gray-700 p-3 rounded-lg">
                            <h4 className="text-sm md:text-base font-semibold">
                              Flashcard {fIndex + 1}: {flashcard.question}
                            </h4>
                            <p className="text-gray-300 text-sm md:text-base mt-1">
                              Answer: {flashcard.answer}
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
    </div>
  );
}

export default Flashcards;