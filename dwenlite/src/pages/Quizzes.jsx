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
    </div>
  );
}

export default Quizzes;