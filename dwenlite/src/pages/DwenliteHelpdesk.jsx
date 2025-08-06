import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, deleteDoc, addDoc, getDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import axios from 'axios';

function DwenliteHelpdesk() {
  const navigate = useNavigate();
  const [passcode, setPasscode] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [chats, setChats] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [rewrittenText, setRewrittenText] = useState('');
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const [isUserTyping, setIsUserTyping] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const [purchases, setPurchases] = useState([]);
  const [isLoadingPurchases, setIsLoadingPurchases] = useState(false);
  const [reports, setReports] = useState([]);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const chatDisplayRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const prevChatsRef = useRef([]);

  const handlePasscodeSubmit = () => {
    if (passcode === '10203339') {
      setIsAuthenticated(true);
    } else {
      toast.error('Invalid passcode.');
    }
  };

  // Function to rewrite text using DeepSeek API
  const rewriteText = async (text) => {
    const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY;
    if (!apiKey) {
      console.error('DeepSeek API key is missing or undefined.');
      toast.error('API key is missing. Please check your environment configuration.');
      return null;
    }

    try {
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: 'You are a professional customer support agent. Rewrite the following text to be concise, polite, clear, and professional, without adding introductory or concluding sentences.',
            },
            {
              role: 'user',
              content: text,
            },
          ],
          max_tokens: 200,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.message || 'Unknown error'}`);
      }

      const data = await response.json();
      if (data.choices && data.choices.length > 0 && data.choices[0].message.content) {
        return data.choices[0].message.content.trim();
      } else {
        throw new Error('No valid response from DeepSeek API');
      }
    } catch (error) {
      console.error('Error rewriting text with DeepSeek API:', error.message);
      toast.error(`Failed to rewrite message: ${error.message}`);
      return null;
    }
  };

  const handleRewriteText = async () => {
    if (!input.trim()) {
      toast.error('Please enter a message to rewrite.');
      return;
    }
    setIsRewriting(true);
    const rewritten = await rewriteText(input.trim());
    setIsRewriting(false);
    if (rewritten) {
      setRewrittenText(rewritten);
    }
  };

  // Function to send SMS when chat status changes to Awaiting Agent
  const sendAwaitingAgentSMS = async (chat) => {
    try {
      console.log('Sending SMS for chat:', { chatId: chat.chatId, username: chat.username });
      const message = `A new chat is awaiting an agent for user ${chat.username || 'Unknown'}.`;
      const response = await axios.post('https://sms-backend.fly.dev/send-sms', {
        message,
      }, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });
      console.log('Awaiting Agent SMS sent for chat:', chat.chatId, 'Response:', response.data);
      toast.success('Awaiting Agent SMS sent successfully.');
    } catch (error) {
      const errorMessage = error.response
        ? `Server responded with status ${error.response.status}: ${JSON.stringify(error.response.data)}`
        : error.request
        ? 'No response received from server. Check if server is running on http://localhost:3001.'
        : error.message;
      console.error('Error sending Awaiting Agent SMS for chat:', chat.chatId, 'Error:', errorMessage);
      toast.error(`Failed to send Awaiting Agent SMS: ${errorMessage}`);
    }
  };

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => {
      if (!user) {
        toast.error('Please log in to access the helpdesk.');
        navigate('/login');
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (isAuthenticated) {
      // Check if where is defined
      if (typeof where !== 'function') {
        console.error('Firestore "where" function is undefined. Check Firebase imports and SDK version.');
        toast.error('Firestore configuration error. Please contact support.');
        return;
      }

      // Fetch all active chats
      try {
        const activeChatsQuery = query(collection(db, 'chats'), where('status', '==', 'active'));
        const unsubscribeActiveChats = onSnapshot(activeChatsQuery, (snapshot) => {
          const chatList = snapshot.docs.map(doc => ({
            chatId: doc.id,
            ...doc.data(),
          }));
          console.log('Active chats fetched:', chatList.map(c => ({ chatId: c.chatId, username: c.username })));
          // Detect chats that newly transitioned to needsAgent: true and agentId: null
          const prevChats = prevChatsRef.current;
          chatList.forEach(chat => {
            const prevChat = prevChats.find(c => c.chatId === chat.chatId);
            if (chat.needsAgent && !chat.agentId && (!prevChat || !prevChat.needsAgent || prevChat.agentId)) {
              sendAwaitingAgentSMS(chat);
            }
          });
          prevChatsRef.current = chatList;
          setChats(chatList);
          if (chatList.length === 0) {
            toast('No active chats available.', { icon: 'ℹ️' });
          }
        }, (error) => {
          console.error('Error fetching active chats:', error.code, error.message);
          toast.error(`Failed to load active chats: ${error.message}`);
        });

        // Fetch chat history
        const historyQuery = query(collection(db, 'chat_history'));
        const unsubscribeHistory = onSnapshot(historyQuery, (snapshot) => {
          const historyList = snapshot.docs.map(doc => ({
            chatId: doc.id,
            ...doc.data(),
          }));
          const uniqueHistory = Array.from(
            new Map(historyList.map(chat => [chat.chatId, chat])).values()
          );
          setChatHistory(uniqueHistory);
          console.log('Chat history fetched (deduplicated):', uniqueHistory.map(c => ({ chatId: c.chatId, username: c.username })));
        }, (error) => {
          console.error('Error fetching chat history:', error.code, error.message);
          toast.error(`Failed to load chat history: ${error.message}`);
        });

        // Fetch ratings for all chats
        const ratingsQuery = query(collection(db, 'ratings'));
        const unsubscribeRatings = onSnapshot(ratingsQuery, (snapshot) => {
          const ratings = snapshot.docs.reduce((acc, doc) => ({
            ...acc,
            [doc.id]: doc.data().rating,
          }), {});
          console.log('Ratings fetched:', ratings);
          setChats(prev => prev.map(chat => ({
            ...chat,
            rating: ratings[chat.chatId] || null,
          })));
          setChatHistory(prev => {
            const updatedHistory = prev.map(chat => ({
              ...chat,
              rating: ratings[chat.chatId] || null,
            }));
            const uniqueHistory = Array.from(
              new Map(updatedHistory.map(chat => [chat.chatId, chat])).values()
            );
            console.log('Updated chat history with ratings (deduplicated):', uniqueHistory.map(c => ({ chatId: c.chatId, username: c.username })));
            return uniqueHistory;
          });
        }, (error) => {
          console.error('Error fetching ratings:', error.code, error.message);
          toast.error(`Failed to load ratings: ${error.message}`);
        });

        // Fetch all purchases
        const purchasesQuery = query(collection(db, 'purchases'));
        const unsubscribePurchases = onSnapshot(purchasesQuery, (snapshot) => {
          setIsLoadingPurchases(true);
          const allPurchases = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setPurchases(allPurchases);
          console.log('All purchases fetched:', allPurchases);
          setIsLoadingPurchases(false);
          if (allPurchases.length === 0) {
            toast('No purchases available.', { icon: 'ℹ️' });
          }
        }, (error) => {
          console.error('Error fetching all purchases:', error.code, error.message);
          toast.error(`Failed to load purchases: ${error.message}`);
          setIsLoadingPurchases(false);
        });

        // Fetch all data reports
        const reportsQuery = query(collection(db, 'data_reports'));
        const unsubscribeReports = onSnapshot(reportsQuery, (snapshot) => {
          setIsLoadingReports(true);
          const allReports = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setReports(allReports);
          console.log('All data reports fetched:', allReports);
          setIsLoadingReports(false);
          if (allReports.length === 0) {
            toast('No data reports available.', { icon: 'ℹ️' });
          }
        }, (error) => {
          console.error('Error fetching data reports:', error.code, error.message);
          toast.error(`Failed to load data reports: ${error.message}`);
          setIsLoadingReports(false);
        });

        return () => {
          unsubscribeActiveChats();
          unsubscribeHistory();
          unsubscribeRatings();
          unsubscribePurchases();
          unsubscribeReports();
        };
      } catch (error) {
        console.error('Error setting up Firestore listeners:', error.message);
        toast.error('Failed to initialize helpdesk data. Please try again.');
      }
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (selectedChat) {
      const chatDocRef = doc(db, 'chats', selectedChat.chatId);
      const unsubscribeMessages = onSnapshot(chatDocRef, (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          setMessages(data.messages || []);
          setIsUserTyping(data.isUserTyping || false);
          scrollToBottom();
        } else {
          console.error('Selected chat not found:', selectedChat.chatId);
          toast.error('Selected chat not found.');
          setSelectedChat(null);
        }
      }, (error) => {
        console.error('Error fetching messages:', error.code, error.message);
        toast.error(`Failed to load chat messages: ${error.message}`);
      });

      return () => unsubscribeMessages();
    } else {
      setMessages([]);
      setIsUserTyping(false);
    }
  }, [selectedChat]);

  const scrollToBottom = () => {
    if (chatDisplayRef.current) {
      chatDisplayRef.current.scrollTop = chatDisplayRef.current.scrollHeight;
    }
  };

  const handleJoinChat = async (chat) => {
    const chatDocRef = doc(db, 'chats', chat.chatId);
    const chatDoc = await getDoc(chatDocRef);
    if (!chatDoc.exists() || chatDoc.data().agentId) {
      toast.error('This chat is already being handled by another agent.');
      return;
    }

    setSelectedChat(chat);
    setMessages(chat.messages || []);
    setRewrittenText('');
    scrollToBottom();
    try {
      await updateDoc(chatDocRef, {
        agentId: auth.currentUser.uid,
        needsAgent: false,
        messages: [
          ...(chat.messages || []),
          {
            id: Date.now(),
            sender: 'dwenlite',
            content: 'Agent has joined this conversation.',
            timestamp: new Date().toLocaleString(),
          },
        ],
        lastMessageTime: serverTimestamp(),
      });
      console.log('Joined chat:', chat.chatId);
    } catch (err) {
      console.error('Error joining chat:', err.code, err.message);
      toast.error(`Failed to join chat: ${err.message}`);
    }
  };

  const handleLeaveChat = async () => {
    if (!selectedChat) {
      toast.error('No chat selected.');
      return;
    }
    try {
      await updateDoc(doc(db, 'chats', selectedChat.chatId), {
        agentId: null,
        needsAgent: true,
        messages: [
          ...messages,
          {
            id: Date.now(),
            sender: 'dwenlite',
            content: 'Agent has forwarded this conversation to another Agent, please wait.',
            timestamp: new Date().toLocaleString(),
          },
        ],
        lastMessageTime: serverTimestamp(),
        isAgentTyping: false,
      });
      await sendAwaitingAgentSMS(selectedChat);
      setSelectedChat(null);
      setMessages([]);
      setIsUserTyping(false);
      setRewrittenText('');
      console.log('Left chat:', selectedChat.chatId);
      toast.success('You have left the chat.');
    } catch (err) {
      console.error('Error leaving chat:', err.code, err.message);
      toast.error(`Failed to leave chat: ${err.message}`);
    }
  };

  const handleTyping = async (value) => {
    setInput(value);
    if (!selectedChat) return;

    const wasTyping = isAgentTyping;
    setIsAgentTyping(!!value.trim());

    if (value.trim() && !wasTyping) {
      try {
        await updateDoc(doc(db, 'chats', selectedChat.chatId), {
          isAgentTyping: true,
        });
      } catch (error) {
        console.error('Error updating agent typing status:', error.code, error.message);
      }
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(async () => {
      if (isAgentTyping) {
        setIsAgentTyping(false);
        try {
          await updateDoc(doc(db, 'chats', selectedChat.chatId), {
            isAgentTyping: false,
          });
        } catch (error) {
          console.error('Error clearing agent typing status:', error.code, error.message);
        }
      }
    }, 2000);
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !selectedChat) return;

    const messageContent = rewrittenText || input.trim();
    const agentMessage = {
      id: Date.now(),
      sender: 'agent',
      content: messageContent,
      timestamp: new Date().toLocaleString(),
    };
    setMessages(prev => [...prev, agentMessage]);
    setInput('');
    setRewrittenText('');
    setIsAgentTyping(false);
    try {
      await updateDoc(doc(db, 'chats', selectedChat.chatId), {
        messages: [...messages, agentMessage],
        lastMessageTime: serverTimestamp(),
        isAgentTyping: false,
      });
      console.log('Message sent:', agentMessage);
    } catch (error) {
      console.error('Error sending message:', error.code, error.message);
      toast.error(`Failed to send message: ${error.message}`);
    }
    scrollToBottom();
  };

  const handleCloseChat = async () => {
    if (!selectedChat) {
      toast.error('No chat selected.');
      return;
    }
    try {
      const historyDocRef = doc(db, 'chat_history', selectedChat.chatId);
      const historyDoc = await getDoc(historyDocRef);
      if (!historyDoc.exists()) {
        await addDoc(collection(db, 'chat_history'), {
          ...selectedChat,
          status: 'closed',
          closedAt: serverTimestamp(),
        });
      }

      await updateDoc(doc(db, 'chats', selectedChat.chatId), {
        status: 'closed',
        agentId: null,
        needsAgent: true,
        messages: [
          ...messages,
          {
            id: Date.now(),
            sender: 'dwenlite',
            content: 'The conversation has been closed by the agent. Please rate your experience.',
            timestamp: new Date().toLocaleString(),
          },
        ],
        lastMessageTime: serverTimestamp(),
        isAgentTyping: false,
        isUserTyping: false,
      });
      await sendAwaitingAgentSMS(selectedChat);
      setChats(prev => prev.filter(chat => chat.chatId !== selectedChat.chatId));
      setSelectedChat(null);
      setMessages([]);
      setIsUserTyping(false);
      setRewrittenText('');
      console.log('Chat closed and moved to history:', selectedChat.chatId);
      toast.success('Chat closed successfully.');
    } catch (err) {
      console.error('Error closing chat:', err.code, err.message);
      toast.error(`Failed to close chat: ${err.message}`);
    }
  };

  const handleDeleteChat = async (chatId) => {
    try {
      await deleteDoc(doc(db, 'chat_history', chatId));
      setChatHistory(prev => prev.filter(chat => chat.chatId !== chatId));
      console.log('Chat deleted from history:', chatId);
      toast.success('Chat deleted successfully.');
    } catch (err) {
      console.error('Error deleting chat:', err.code, err.message);
      toast.error(`Failed to delete chat: ${err.message}`);
    }
  };

  const handleStatusChange = async (purchaseId, newStatus) => {
    try {
      await updateDoc(doc(db, 'purchases', purchaseId), {
        status: newStatus,
        lastUpdated: serverTimestamp(),
      });
      console.log(`Purchase ${purchaseId} status updated to ${newStatus}`);
      toast.success(`Purchase status updated to ${newStatus}.`);
    } catch (err) {
      console.error('Error updating purchase status:', err.code, err.message);
      toast.error(`Failed to update purchase status: ${err.message}`);
    }
  };

  const handleReportStatusChange = async (reportId, newStatus) => {
    try {
      await updateDoc(doc(db, 'data_reports', reportId), {
        status: newStatus,
        lastUpdated: serverTimestamp(),
      });
      console.log(`Report ${reportId} status updated to ${newStatus}`);
      toast.success(`Report status updated to ${newStatus}.`);
    } catch (err) {
      console.error('Error updating report status:', err.code, err.message);
      toast.error(`Failed to update report status: ${err.message}`);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Enter Admin Passcode</h2>
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Enter passcode"
            className="p-2 rounded-lg bg-gray-700 text-white text-sm border border-gray-600 mb-4 w-full"
          />
          <button
            onClick={handlePasscodeSubmit}
            className="bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700"
          >
            Submit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <style>
        {`
          .animate-blink {
            animation: blink 1s step-end infinite;
          }
          .animate-blink.delay-200 {
            animation-delay: 0.2s;
          }
          .animate-blink.delay-400 {
            animation-delay: 0.4s;
          }
          @keyframes blink {
            50% { opacity: 0; }
          }
        `}
      </style>
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-8">Dwenlite Helpdesk</h1>
        <div className="flex flex-col md:flex-row gap-6">
          {/* Chat List, Purchases, and Reports */}
          <div className="w-full md:w-1/3 bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Active Chats</h2>
            {chats.length === 0 && <p className="text-gray-400">No active chats available.</p>}
            {chats.map(chat => (
              <div
                key={chat.chatId}
                className={`p-4 bg-gray-700 rounded-lg mb-2 ${
                  !chat.agentId ? 'cursor-pointer hover:bg-gray-600' : 'cursor-not-allowed opacity-50'
                }`}
                onClick={() => !chat.agentId && handleJoinChat(chat)}
              >
                <p><strong>User:</strong> {chat.username || 'Unknown'}</p>
                <p><small>Last Message: {chat.lastMessageTime?.toDate().toLocaleString() || 'N/A'}</small></p>
                {chat.needsAgent && !chat.agentId && <p><strong>Status:</strong> Awaiting Agent</p>}
                {!chat.needsAgent && chat.agentId && <p><strong>Status:</strong> Agent Assigned</p>}
                {chat.rating && <p><strong>Rating:</strong> {chat.rating}/5</p>}
              </div>
            ))}
            <h2 className="text-xl font-semibold mb-4 mt-8">Chat History</h2>
            {chatHistory.length === 0 && <p className="text-gray-400">No chat history available.</p>}
            {chatHistory.map(chat => (
              <div
                key={chat.chatId}
                className="p-4 bg-gray-700 rounded-lg mb-2 flex justify-between items-center"
              >
                <div>
                  <p><strong>User:</strong> {chat.username || 'Unknown'}</p>
                  <p>
                    <small>
                      Closed: {chat.closedAt?.toDate().toLocaleString() || 'N/A'}
                      {typeof chat.rating === 'number' && `, ${chat.rating}/5`}
                    </small>
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteChat(chat.chatId)}
                  className="bg-red-600 text-white py-1 px-2 rounded-lg hover:bg-red-700 text-sm"
                >
                  Delete
                </button>
              </div>
            ))}
            <h2 className="text-xl font-semibold mb-4 mt-8">All Purchases</h2>
            {isLoadingPurchases ? (
              <p className="text-gray-400">Loading purchases...</p>
            ) : purchases.length === 0 ? (
              <p className="text-gray-400">No purchases available.</p>
            ) : (
              purchases.map(purchase => (
                <div
                  key={purchase.id}
                  className="p-4 bg-gray-700 rounded-lg mb-2"
                >
                  <p><strong>User ID:</strong> {purchase.userId}</p>
                  <p><strong>Bundle:</strong> {purchase.bundleName} ({purchase.network})</p>
                  <p><strong>Phone:</strong> {purchase.phoneNumber}</p>
                  <p><strong>Cost:</strong> {purchase.gCoins} G_COINS</p>
                  <p><strong>Purchased:</strong> {new Date(purchase.timestamp.toDate()).toLocaleString()}</p>
                  <div className="flex items-center mt-2">
                    <strong>Status:</strong>
                    <select
                      value={purchase.status}
                      onChange={(e) => handleStatusChange(purchase.id, e.target.value)}
                      className="ml-2 p-1 bg-gray-600 text-white rounded-lg text-sm"
                    >
                      <option value="Pending">Pending</option>
                      <option value="Processing">Processing</option>
                      <option value="Completed">Completed</option>
                    </select>
                  </div>
                </div>
              ))
            )}
            <h2 className="text-xl font-semibold mb-4 mt-8">Data Bundle Reports</h2>
            {isLoadingReports ? (
              <p className="text-gray-400">Loading reports...</p>
            ) : reports.length === 0 ? (
              <p className="text-gray-400">No data reports available.</p>
            ) : (
              reports.map(report => (
                <div
                  key={report.id}
                  className="p-4 bg-gray-700 rounded-lg mb-2"
                >
                  <p><strong>User:</strong> {report.userName || report.userId}</p>
                  <p><strong>Network:</strong> {report.reportType}</p>
                  <p><strong>Bundle:</strong> {report.gig}</p>
                  <p><strong>Phone:</strong> {report.phoneNumber}</p>
                  <p><strong>Date:</strong> {report.date}</p>
                  <p><strong>Time:</strong> {report.time}</p>
                  <p><strong>Screenshot:</strong> <a href={report.screenshotURL} target="_blank" rel="noopener noreferrer" className="text-purple-300 hover:underline">View</a></p>
                  <p><strong>Submitted:</strong> {new Date(report.timestamp.toDate()).toLocaleString()}</p>
                  <div className="flex items-center mt-2">
                    <strong>Status:</strong>
                    <select
                      value={report.status}
                      onChange={(e) => handleReportStatusChange(report.id, e.target.value)}
                      className="ml-2 p-1 bg-gray-600 text-white rounded-lg text-sm"
                    >
                      <option value="Pending">Pending</option>
                      <option value="Processing">Processing</option>
                      <option value="Completed">Completed</option>
                    </select>
                  </div>
                </div>
              ))
            )}
          </div>
          {/* Chat Window */}
          <div className="w-full md:w-2/3 bg-gray-800 p-6 rounded-lg">
            {selectedChat ? (
              <>
                <h2 className="text-xl font-semibold mb-4">Chat with {selectedChat.username || 'Unknown'}</h2>
                <div ref={chatDisplayRef} className="flex-1 p-3 overflow-y-auto flex flex-col space-y-2 h-[400px] border border-gray-700 rounded-lg">
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
                      <strong>{msg.sender === 'user' ? selectedChat.username || 'User' : msg.sender === 'agent' ? 'You' : 'DwenLite Support AI'}:</strong> {msg.content}
                      <small className="block text-xs opacity-75">{msg.timestamp || 'N/A'}</small>
                    </div>
                  ))}
                  {isAgentTyping && (
                    <div className="flex items-center px-3 py-2 text-gray-400 text-sm">
                      <span>Agent is typing</span>
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full mx-1 animate-blink"></span>
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full mx-1 animate-blink delay-200"></span>
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full mx-1 animate-blink delay-400"></span>
                    </div>
                  )}
                  {isUserTyping && (
                    <div className="flex items-center px-3 py-2 text-gray-400 text-sm">
                      <span>User is typing</span>
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full mx-1 animate-blink"></span>
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full mx-1 animate-blink delay-200"></span>
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full mx-1 animate-blink delay-400"></span>
                    </div>
                  )}
                </div>
                {rewrittenText && (
                  <div className="mt-4 p-3 bg-gray-700 rounded-lg">
                    <p className="text-sm"><strong>Rewritten Message Preview:</strong> {rewrittenText}</p>
                    <button
                      onClick={() => setRewrittenText('')}
                      className="mt-2 bg-gray-600 text-white py-1 px-2 rounded-lg hover:bg-gray-500 text-sm"
                    >
                      Clear Preview
                    </button>
                  </div>
                )}
                <div className="flex gap-2 mt-4">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => handleTyping(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Type your message..."
                    className="flex-1 p-2 rounded-lg bg-gray-700 text-white text-sm border border-gray-600"
                  />
                  <button
                    onClick={handleRewriteText}
                    disabled={isRewriting}
                    className={`bg-yellow-600 text-white py-1.5 px-3 rounded-lg text-sm ${
                      isRewriting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-yellow-700'
                    }`}
                  >
                    {isRewriting ? 'Rewriting...' : 'Rewrite Text'}
                  </button>
                  <button
                    onClick={handleSendMessage}
                    className="bg-purple-600 text-white py-1.5 px-3 rounded-lg hover:bg-purple-700 text-sm"
                  >
                    Send
                  </button>
                  <button
                    onClick={handleLeaveChat}
                    className="bg-orange-600 text-white py-1.5 px-3 rounded-lg hover:bg-orange-700 text-sm"
                  >
                    Leave Chat
                  </button>
                  <button
                    onClick={handleCloseChat}
                    className="bg-red-600 text-white py-1.5 px-3 rounded-lg hover:bg-red-700 text-sm"
                  >
                    Close Chat
                  </button>
                </div>
              </>
            ) : (
              <p className="text-gray-400">Select a chat to start.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DwenliteHelpdesk;