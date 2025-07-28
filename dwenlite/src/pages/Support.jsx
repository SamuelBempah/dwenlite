import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { auth, db } from '../firebase';
import { collection, addDoc, doc, onSnapshot, updateDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import toast from 'react-hot-toast';

function Support() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [isConversationEnded, setIsConversationEnded] = useState(false);
  const [chatId, setChatId] = useState(null);
  const [agentJoined, setAgentJoined] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [rating, setRating] = useState(0);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const chatDisplayRef = useRef(null);
  const audioRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Predefined responses for Dwenlite features
  const predefinedResponses = {
    folder: 'In Dwenlite, you can create folders to organize your study materials. Go to the dashboard, enter a folder name in the "New folder name" field, and click "Create Folder" to get started. Is that all?',
    upload: 'You can upload PDF, PPTX, TXT, DOCX, audio, or video files to a folder. On the dashboard, select a folder, then use the "Audio Upload", "Video Upload", or "Document Upload" buttons to add your files. Is that all?',
    notes: 'Dwenlite generates concise study notes from your uploaded files. Select a folder, click "Generate Notes" in the notes section, and the AI will create a summary based on your latest document, audio, or video. Is that all?',
    quizzes: 'To generate quizzes, select a folder and go to the quizzes section. Click "Generate Quiz" to create interactive questions from your uploaded study materials. Is that all?',
    flashcards: 'Dwenlite can create flashcards for quick review. In a folder, navigate to the flashcards section and click "Generate Flashcards" to produce study cards from your uploaded content. Is that all?',
    agent: 'An agent will join your chat shortly. Please wait.',
  };

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(async user => {
      if (user) {
        setCurrentUser(user);
        // Check for existing active chat
        const chatsQuery = query(
          collection(db, 'chats'),
          where('userId', '==', user.uid),
          where('status', '==', 'active')
        );
        const querySnapshot = await getDocs(chatsQuery);
        if (!querySnapshot.empty) {
          const chatDoc = querySnapshot.docs[0];
          setChatId(chatDoc.id);
          setMessages(chatDoc.data().messages || []);
          setAgentJoined(!!chatDoc.data().agentId);
          setIsConversationEnded(chatDoc.data().status === 'closed');
        } else {
          const chatDoc = await addDoc(collection(db, 'chats'), {
            userId: user.uid,
            username: user.displayName || 'User',
            messages: [{
              id: Date.now(),
              sender: 'dwenlite',
              content: 'Welcome to Dwenlite Support! How can I assist you today? Type your query or ask for an agent.',
              timestamp: new Date().toLocaleString(),
            }],
            status: 'active',
            needsAgent: false,
            lastMessageTime: serverTimestamp(),
            isUserTyping: false,
            isAgentTyping: false,
          });
          setChatId(chatDoc.id);
          setMessages([{
            id: Date.now(),
            sender: 'dwenlite',
            content: 'Welcome to Dwenlite Support! How can I assist you today? Type your query or ask for an agent.',
            timestamp: new Date().toLocaleString(),
          }]);
        }
      } else {
        toast.error('Please log in to access support.');
        navigate('/login');
      }
    });

    return () => unsubscribeAuth();
  }, [navigate]);

  useEffect(() => {
    if (chatId) {
      const chatDocRef = doc(db, 'chats', chatId);
      const unsubscribeChat = onSnapshot(chatDocRef, (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          setMessages(data.messages || []);
          setAgentJoined(!!data.agentId);
          setIsConversationEnded(data.status === 'closed');
          setIsTyping(data.isAgentTyping || false);
          if (data.status === 'closed' && !showRating) {
            setShowRating(true);
          }
        } else {
          console.error('Chat document not found:', chatId);
          toast.error('Chat session not found. Please try again.');
        }
      }, (error) => {
        console.error('Error fetching chat:', error);
        toast.error('Failed to load chat.');
      });
      return () => unsubscribeChat();
    }
  }, [chatId, showRating]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isChatOpen) {
        setIsChatOpen(true);
        playAlertSound();
        scrollToBottom();
      }
    }, 10000);
    return () => clearTimeout(timer);
  }, [isChatOpen]);

  const scrollToBottom = () => {
    if (chatDisplayRef.current) {
      chatDisplayRef.current.scrollTop = chatDisplayRef.current.scrollHeight;
    }
  };

  const playAlertSound = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(err => {
        console.error('Audio play failed:', err);
        setTimeout(() => audioRef.current.play().catch(e => console.error('Retry failed:', e)), 100);
      });
    }
  };

  const endConversation = async (message) => {
    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'dwenlite',
        content: message,
        timestamp: new Date().toLocaleString(),
      }]);
      updateDoc(doc(db, 'chats', chatId), {
        messages: [...messages, {
          id: Date.now(),
          sender: 'dwenlite',
          content: message,
          timestamp: new Date().toLocaleString(),
        }],
        status: 'closed',
        lastMessageTime: serverTimestamp(),
        isUserTyping: false,
        isAgentTyping: false,
      });
      setIsConversationEnded(true);
      playAlertSound();
      scrollToBottom();
    }, 3000);
  };

  const handleTyping = async (value) => {
    setInput(value);
    if (!chatId || isConversationEnded) return;

    const isTypingNow = !!value.trim();

    if (isTypingNow) {
      try {
        await updateDoc(doc(db, 'chats', chatId), {
          isUserTyping: true,
        });
      } catch (error) {
        console.error('Error updating user typing status:', error);
      }
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(async () => {
      if (isTypingNow) {
        try {
          await updateDoc(doc(db, 'chats', chatId), {
            isUserTyping: false,
          });
        } catch (error) {
          console.error('Error clearing user typing status:', error);
        }
      }
    }, 2000);
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !currentUser || isConversationEnded) return;

    const userMessage = {
      id: Date.now(),
      sender: 'user',
      content: input.trim(),
      timestamp: new Date().toLocaleString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    await updateDoc(doc(db, 'chats', chatId), {
      messages: [...messages, userMessage],
      lastMessageTime: serverTimestamp(),
      isUserTyping: false,
    }).catch(error => {
      console.error('Error updating chat:', error);
      toast.error('Failed to send message.');
    });
    scrollToBottom();

    if (input.toLowerCase().includes("that's all") && !agentJoined) {
      endConversation('Thank you for using Dwenlite Support! Goodbye.');
      return;
    }

    if (!agentJoined) {
      setTimeout(async () => {
        setIsTyping(true);

        const lowercaseInput = input.toLowerCase();
        let responseText = null;

        if (lowercaseInput.includes('folder') || lowercaseInput.includes('create folder')) {
          responseText = predefinedResponses.folder;
        } else if (lowercaseInput.includes('upload') || lowercaseInput.includes('document') || lowercaseInput.includes('audio') || lowercaseInput.includes('video')) {
          responseText = predefinedResponses.upload;
        } else if (lowercaseInput.includes('notes') || lowercaseInput.includes('generate notes')) {
          responseText = predefinedResponses.notes;
        } else if (lowercaseInput.includes('quiz') || lowercaseInput.includes('quizzes')) {
          responseText = predefinedResponses.quizzes;
        } else if (lowercaseInput.includes('flashcard') || lowercaseInput.includes('flashcards')) {
          responseText = predefinedResponses.flashcards;
        } else if (lowercaseInput.includes('human') || lowercaseInput.includes('agent')) {
          responseText = predefinedResponses.agent;
          await updateDoc(doc(db, 'chats', chatId), {
            needsAgent: true,
            lastMessageTime: serverTimestamp(),
          }).catch(error => {
            console.error('Error requesting agent:', error);
            toast.error('Failed to request agent.');
          });
        }

        if (responseText) {
          setTimeout(() => {
            const botMessage = {
              id: Date.now(),
              sender: 'dwenlite',
              content: responseText,
              timestamp: new Date().toLocaleString(),
            };
            setMessages(prev => [...prev, botMessage]);
            updateDoc(doc(db, 'chats', chatId), {
              messages: [...messages, userMessage, botMessage],
              lastMessageTime: serverTimestamp(),
              isUserTyping: false,
            }).catch(error => {
              console.error('Error saving bot message:', error);
              toast.error('Failed to save response.');
            });
            setIsTyping(false);
            playAlertSound();
            scrollToBottom();
          }, 3000);
          return;
        }

        try {
          const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY;
          if (!apiKey) {
            throw new Error('DeepSeek API key not found.');
          }

          const prompt = `You are a support assistant for Dwenlite, an AI study companion that helps users create folders to organize study materials, upload documents (PDF, PPTX, TXT, DOCX), audio, and videos, and generate notes, quizzes, and flashcards from them. Provide a concise, helpful response to the following user query: "${input}". Keep the response under 100 words and relevant to Dwenlite's features. If the user asks for a human agent, instruct them to type "agent". End your response with: "Is that all?"`;

          const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'deepseek-chat',
              messages: [
                { role: 'system', content: 'You are a helpful assistant for Dwenlite support.' },
                { role: 'user', content: prompt },
              ],
              max_tokens: 500,
              temperature: 0.7,
            }),
          });

          if (!response.ok) {
            throw new Error(`DeepSeek API request failed: ${response.status}`);
          }

          const data = await response.json();
          const generatedText = data.choices?.[0]?.message?.content?.trim();
          if (!generatedText) {
            throw new Error('No response from DeepSeek API.');
          }

          setTimeout(() => {
            const botMessage = {
              id: Date.now(),
              sender: 'dwenlite',
              content: generatedText,
              timestamp: new Date().toLocaleString(),
            };
            setMessages(prev => [...prev, botMessage]);
            updateDoc(doc(db, 'chats', chatId), {
              messages: [...messages, userMessage, botMessage],
              lastMessageTime: serverTimestamp(),
              isUserTyping: false,
            }).catch(error => {
              console.error('Error saving bot message:', error);
              toast.error('Failed to save response.');
            });
            setIsTyping(false);
            playAlertSound();
            scrollToBottom();
          }, 3000);
        } catch (err) {
          setTimeout(() => {
            const errorMessage = {
              id: Date.now(),
              sender: 'dwenlite',
              content: 'Sorry, I encountered an error. Please try again or type "agent" for assistance. Is that all?',
              timestamp: new Date().toLocaleString(),
            };
            setMessages(prev => [...prev, errorMessage]);
            updateDoc(doc(db, 'chats', chatId), {
              messages: [...messages, userMessage, errorMessage],
              lastMessageTime: serverTimestamp(),
              isUserTyping: false,
            }).catch(error => {
              console.error('Error saving error message:', error);
              toast.error('Failed to save response.');
            });
            setIsTyping(false);
            playAlertSound();
            scrollToBottom();
          }, 3000);
          toast.error(err.message);
        }
      }, 2000);
    }
  };

  const handleRatingSubmit = async () => {
    try {
      await addDoc(collection(db, 'ratings'), {
        userId: currentUser.uid,
        chatId,
        rating,
        timestamp: serverTimestamp(),
      });
      await addDoc(collection(db, 'chat_history'), {
        userId: currentUser.uid,
        username: currentUser.displayName || 'User',
        messages,
        status: 'closed',
        closedAt: serverTimestamp(),
      });
      setRatingSubmitted(true);
      setShowRating(false);
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'dwenlite',
        content: 'Thank you for your feedback!',
        timestamp: new Date().toLocaleString(),
      }]);
      await updateDoc(doc(db, 'chats', chatId), {
        messages: [...messages, {
          id: Date.now(),
          sender: 'dwenlite',
          content: 'Thank you for your feedback!',
          timestamp: new Date().toLocaleString(),
        }],
        lastMessageTime: serverTimestamp(),
        isUserTyping: false,
        isAgentTyping: false,
      });
      scrollToBottom();
    } catch (err) {
      console.error('Error submitting rating:', err);
      toast.error('Failed to submit rating. Please try again.');
    }
  };

  const handleStartNewChat = async () => {
    try {
      const chatDoc = await addDoc(collection(db, 'chats'), {
        userId: currentUser.uid,
        username: currentUser.displayName || 'User',
        messages: [{
          id: Date.now(),
          sender: 'dwenlite',
          content: 'Welcome to Dwenlite Support! How can I assist you today? Type your query or ask for an agent.',
          timestamp: new Date().toLocaleString(),
        }],
        status: 'active',
        needsAgent: false,
        lastMessageTime: serverTimestamp(),
        isUserTyping: false,
        isAgentTyping: false,
      });
      setChatId(chatDoc.id);
      setMessages([{
        id: Date.now(),
        sender: 'dwenlite',
        content: 'Welcome to Dwenlite Support! How can I assist you today? Type your query or ask for an agent.',
        timestamp: new Date().toLocaleString(),
      }]);
      setIsConversationEnded(false);
      setRatingSubmitted(false);
      setShowRating(false);
      setAgentJoined(false);
      setRating(0);
      scrollToBottom();
    } catch (err) {
      console.error('Error starting new chat:', err);
      toast.error('Failed to start new chat. Please try again.');
    }
  };

  if (!currentUser) {
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
    <div className="min-h-screen bg-gray-900 text-white flex flex-col md:flex-row">
      <div className="w-full md:w-64 bg-gray-800 p-6 flex flex-col justify-between">
        <div>
          <div className="flex items-center mb-8">
            <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center text-xl">
              {currentUser.displayName?.charAt(0) || 'U'}
            </div>
            <span className="ml-3 text-lg font-semibold">{currentUser.displayName || 'User'}</span>
          </div>
          <nav>
            <Link to="/dashboard" className="flex items-center mb-4 text-purple-400 text-base">
              <span className="mr-2">🏠</span> Dashboard
            </Link>
            <Link to="/support" className="flex items-center mb-4 text-white bg-gray-700 p-2 rounded-lg">
              <span className="mr-2">💬</span> Support
            </Link>
          </nav>
        </div>
        <button
          onClick={() => auth.signOut().then(() => navigate('/login'))}
          className="bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 text-base"
        >
          Logout
        </button>
      </div>

      <div className="flex-1 p-8">
        <h1 className="text-3xl font-bold mb-8">Support</h1>
        <div className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Live Chat Support</h2>
          <p className="text-gray-400 mb-4">Click the chat button in the bottom-right corner to start a conversation with our AI-powered support bot or request a human agent by typing "agent".</p>
        </div>
      </div>

      <button
        onClick={() => {
          setIsChatOpen(!isChatOpen);
          if (!isChatOpen) {
            playAlertSound();
            setTimeout(scrollToBottom, 0);
          }
        }}
        className="fixed bottom-5 right-5 w-14 h-14 bg-gradient-to-r from-yellow-400 to-red-500 rounded-full flex items-center justify-center shadow-lg hover:bg-gradient-to-l transition-all duration-1000 z-50"
      >
        <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
        </svg>
        <span className="absolute top-[-40px] opacity-0 bg-orange-400 text-white text-xs px-2 py-1 rounded-lg transition-opacity duration-500 pointer-events-none">Chat</span>
      </button>

      {isChatOpen && (
        <div className="fixed bottom-20 right-5 max-w-sm w-full bg-gray-800 rounded-lg shadow-lg overflow-hidden z-50">
          <div className="flex flex-col h-[400px]">
            <div className="px-4 py-3 border-b border-gray-700">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-white">Dwenlite Support</h2>
                <div className="bg-green-500 text-white text-xs px-2 py-1 rounded-full">{agentJoined ? 'Agent Online' : 'Online'}</div>
              </div>
            </div>
            <div ref={chatDisplayRef} className="flex-1 p-3 overflow-y-auto flex flex-col space-y-2">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`max-w-xs rounded-lg px-3 py-1.5 text-sm ${
                    msg.sender === 'user'
                      ? 'self-end bg-purple-600 text-white'
                      : msg.sender === 'agent'
                      ? 'self-start bg-blue-600 text-white'
                      : 'self-start bg-gray-700 text-white'
                  }`}
                >
                  <strong>{msg.sender === 'user' ? 'You' : msg.sender === 'agent' ? 'Agent' : 'DwenLite Support AI'}:</strong> {msg.content}
                  <small className="block text-xs opacity-75">{msg.timestamp}</small>
                </div>
              ))}
              {(isTyping && agentJoined) && (
                <div className="flex items-center px-3 py-2 text-gray-400 text-sm">
                  <span>Agent is typing</span>
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full mx-1 animate-blink"></span>
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full mx-1 animate-blink delay-200"></span>
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full mx-1 animate-blink delay-400"></span>
                </div>
              )}
              {(isTyping && !agentJoined) && (
                <div className="flex items-center px-3 py-2 text-gray-400 text-sm">
                  <span>DwenLite Support AI is typing</span>
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full mx-1 animate-blink"></span>
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full mx-1 animate-blink delay-200"></span>
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full mx-1 animate-blink delay-400"></span>
                </div>
              )}
            </div>
            {showRating && !ratingSubmitted && (
              <div className="px-3 py-2 border-t border-gray-700">
                <div className="text-white text-sm mb-2">Rate your experience:</div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      onClick={() => setRating(star)}
                      className={`text-2xl ${rating >= star ? 'text-yellow-400' : 'text-gray-400'}`}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleRatingSubmit}
                  className="bg-purple-600 text-white py-1 px-3 rounded-lg hover:bg-purple-700 text-sm mt-2"
                  disabled={rating === 0}
                >
                  Submit Rating
                </button>
              </div>
            )}
            {ratingSubmitted && (
              <div className="px-3 py-2 border-t border-gray-700">
                <button
                  onClick={handleStartNewChat}
                  className="bg-purple-600 text-white py-1 px-3 rounded-lg hover:bg-purple-700 text-sm"
                >
                  Start New Chat
                </button>
              </div>
            )}
            {!showRating && !ratingSubmitted && (
              <div className="px-3 py-2 border-t border-gray-700">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => handleTyping(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Type your message..."
                    className={`flex-1 p-2 rounded-lg bg-gray-700 text-white text-sm border border-gray-600 ${
                      isConversationEnded ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    disabled={isConversationEnded}
                  />
                  <button
                    onClick={handleSendMessage}
                    className={`bg-purple-600 text-white py-1.5 px-3 rounded-lg hover:bg-purple-700 text-sm ${
                      isConversationEnded ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    disabled={isConversationEnded}
                  >
                    Send
                  </button>
                </div>
                <div className="text-gray-500 text-xs mt-2 text-center">Made by Samuel Bempah</div>
                {isConversationEnded && !showRating && (
                  <div className="text-gray-500 text-xs mt-2 text-center">
                    The conversation has ended. No messages can be sent until page reload.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <audio ref={audioRef} preload="auto" src="https://paysub.great-site.net/ping.mp3" />
    </div>
  );
}

export default Support;