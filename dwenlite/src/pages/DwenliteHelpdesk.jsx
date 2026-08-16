import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, deleteDoc, addDoc, getDoc, getDocs } from 'firebase/firestore';
import toast from 'react-hot-toast';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

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
  const [users, setUsers] = useState([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userActivityLogs, setUserActivityLogs] = useState([]);
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

  const rewriteText = async (text) => {
    const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY;
    if (!apiKey) {
      console.error('Dwenlite Agent Assistant API key is missing or undefined.');
      toast.error('Dwenlite Agent Assistant is unavailable. Please check configuration.');
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
        throw new Error('No valid response from Dwenlite Agent Assistant');
      }
    } catch (error) {
      console.error('Error rewriting text with Dwenlite Agent Assistant:', error.message);
      toast.error(`Dwenlite Agent Assistant failed to rewrite message: ${error.message}`);
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
        ? 'No response received from server. Check if server is running.'
        : error.message;
      console.error('Error sending Awaiting Agent SMS for chat:', chat.chatId, 'Error:', errorMessage);
      toast.error(`Failed to send Awaiting Agent SMS: ${errorMessage}`);
    }
  };

  const fetchUserDetails = async (userId) => {
    try {
      console.log('Fetching user details for userId:', userId);
      const userDocRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userDocRef);
      let userData = { username: 'Unknown' };
      if (userDoc.exists()) {
        userData = userDoc.data();
        console.log('User data from users collection:', userData);
      } else {
        console.log('User document not found in users collection for userId:', userId);
      }

      const foldersQuery = query(collection(db, 'folders'), where('user_id', '==', userId));
      const foldersSnapshot = await getDocs(foldersQuery);
      const folders = foldersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      console.log('Folders fetched for userId:', userId, 'Folders:', folders);

      let username = userData.username || 'Unknown';
      if (username === 'Unknown') {
        console.log('No username in users collection, checking chats collection for userId:', userId);
        const chatsQuery = query(collection(db, 'chats'), where('userId', '==', userId));
        const chatsSnapshot = await getDocs(chatsQuery);
        if (!chatsSnapshot.empty) {
          const chatData = chatsSnapshot.docs[0].data();
          username = chatData.username || 'Unknown';
          console.log('Username from chats collection:', username);
        } else {
          console.log('No chats found for userId:', userId);
        }
      }

      if (username === 'Unknown' && auth.currentUser && auth.currentUser.uid === userId) {
        username = auth.currentUser.displayName || 'Unknown';
        console.log('Username from Firebase Auth displayName:', username);
      }

      return { ...userData, folders, id: userId, username };
    } catch (error) {
      console.error('Error fetching user details for userId:', userId, 'Error:', error.message);
      toast.error(`Failed to fetch user details: ${error.message}`);
      return null;
    }
  };

  const handleSelectUser = async (userId) => {
    const userDetails = await fetchUserDetails(userId);
    if (userDetails) {
      setSelectedUser(userDetails);
      const logsQuery = query(collection(db, 'user_activity_logs'), where('userId', '==', userId));
      const unsubscribeLogs = onSnapshot(logsQuery, (snapshot) => {
        const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setUserActivityLogs(logs);
        console.log('User activity logs fetched for userId:', userId, 'Logs:', logs);
      }, (error) => {
        console.error('Error fetching user activity logs for userId:', userId, 'Error:', error.message);
        toast.error(`Failed to load user activity logs: ${error.message}`);
      });
      return () => unsubscribeLogs();
    }
  };

  const handleUpdateUser = async (userId, updatedData) => {
    try {
      console.log('Updating user:', userId, 'with data:', updatedData);
      await updateDoc(doc(db, 'users', userId), {
        ...updatedData,
        lastUpdated: serverTimestamp(),
      });
      console.log(`User ${userId} updated successfully`);
      toast.success('User details updated successfully.');
      setSelectedUser(prev => ({ ...prev, ...updatedData }));
    } catch (err) {
      console.error('Error updating user:', userId, 'Error:', err.code, err.message);
      toast.error(`Failed to update user: ${err.message}`);
    }
  };

  const handleDeleteUser = async (userId) => {
    try {
      console.log('Deleting user:', userId);
      await deleteDoc(doc(db, 'users', userId));
      setUsers(prev => prev.filter(user => user.id !== userId));
      setSelectedUser(null);
      console.log(`User ${userId} deleted successfully`);
      toast.success('User deleted successfully.');
    } catch (err) {
      console.error('Error deleting user:', userId, 'Error:', err.code, err.message);
      toast.error(`Failed to delete user: ${err.message}`);
    }
  };

  const handleUserStatusChange = async (userId, newStatus) => {
    try {
      console.log('Updating user status for userId:', userId, 'New status:', newStatus);
      await updateDoc(doc(db, 'users', userId), {
        status: newStatus,
        lastUpdated: serverTimestamp(),
      });
      console.log(`User ${userId} status updated to ${newStatus}`);
      toast.success(`User status updated to ${newStatus}.`);
      setSelectedUser(prev => ({ ...prev, status: newStatus }));
    } catch (err) {
      console.error('Error updating user status for userId:', userId, 'Error:', err.code, err.message);
      toast.error(`Failed to update user status: ${err.message}`);
    }
  };

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => {
      if (!user) {
        console.log('No authenticated user, redirecting to login');
        toast.error('Please log in to access the helpdesk.');
        navigate('/login');
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (isAuthenticated) {
      const usersQuery = query(collection(db, 'users'));
      const unsubscribeUsers = onSnapshot(usersQuery, async (snapshot) => {
        setIsLoadingUsers(true);
        const allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log('Raw users fetched from users collection:', allUsers);
        
        const updatedUsers = await Promise.all(allUsers.map(async user => {
          let username = user.username || 'Unknown';
          if (username === 'Unknown') {
            console.log('No username for userId:', user.id, 'Checking chats collection');
            const chatsQuery = query(collection(db, 'chats'), where('userId', '==', user.id));
            const chatsSnapshot = await getDocs(chatsQuery);
            if (!chatsSnapshot.empty) {
              const chatData = chatsSnapshot.docs[0].data();
              username = chatData.username || 'Unknown';
              console.log('Username from chats for userId:', user.id, 'Username:', username);
            } else {
              console.log('No chats found for userId:', user.id);
            }
          }
          if (username === 'Unknown' && auth.currentUser && auth.currentUser.uid === user.id) {
            username = auth.currentUser.displayName || 'Unknown';
            console.log('Username from Firebase Auth for userId:', user.id, 'Username:', username);
          }
          return { ...user, username };
        }));
        setUsers(updatedUsers);
        console.log('Updated users with usernames:', updatedUsers);
        setIsLoadingUsers(false);
        if (updatedUsers.length === 0) {
          toast('No users available.', { icon: 'ℹ️' });
        }
      }, (error) => {
        console.error('Error fetching users:', error.code, error.message);
        toast.error(`Failed to load users: ${error.message}`);
        setIsLoadingUsers(false);
      });

      try {
        const activeChatsQuery = query(collection(db, 'chats'), where('status', '==', 'active'));
        const unsubscribeActiveChats = onSnapshot(activeChatsQuery, (snapshot) => {
          const chatList = snapshot.docs.map(doc => ({
            chatId: doc.id,
            ...doc.data(),
          }));
          console.log('Active chats fetched:', chatList.map(c => ({ chatId: c.chatId, username: c.username })));
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
          unsubscribeUsers();
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
      console.log('Deleting chat from history:', chatId);
      await deleteDoc(doc(db, 'chat_history', chatId));
      setChatHistory(prev => prev.filter(chat => chat.chatId !== chatId));
      console.log('Chat deleted from history:', chatId);
      toast.success('Chat deleted successfully.');
    } catch (err) {
      console.error('Error deleting chat:', chatId, 'Error:', err.code, err.message);
      toast.error(`Failed to delete chat: ${err.message}`);
    }
  };

  const handleStatusChange = async (purchaseId, newStatus) => {
    try {
      console.log('Updating purchase status for purchaseId:', purchaseId, 'New status:', newStatus);
      await updateDoc(doc(db, 'purchases', purchaseId), {
        status: newStatus,
        lastUpdated: serverTimestamp(),
      });
      console.log(`Purchase ${purchaseId} status updated to ${newStatus}`);
      toast.success(`Purchase status updated to ${newStatus}.`);
    } catch (err) {
      console.error('Error updating purchase status:', purchaseId, 'Error:', err.code, err.message);
      toast.error(`Failed to update purchase status: ${err.message}`);
    }
  };

  const handleReportStatusChange = async (reportId, newStatus) => {
    try {
      console.log('Updating report status for reportId:', reportId, 'New status:', newStatus);
      await updateDoc(doc(db, 'data_reports', reportId), {
        status: newStatus,
        lastUpdated: serverTimestamp(),
      });
      console.log(`Report ${reportId} status updated to ${newStatus}`);
      toast.success(`Report status updated to ${newStatus}.`);
    } catch (err) {
      console.error('Error updating report status:', reportId, 'Error:', err.code, err.message);
      toast.error(`Failed to update report status: ${err.message}`);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-white bg-opacity-10 backdrop-blur-lg p-8 rounded-xl shadow-2xl w-full max-w-md"
        >
          <h2 className="text-2xl font-bold text-white mb-6 text-center">Admin Login</h2>
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Enter passcode"
            className="w-full p-3 rounded-lg bg-gray-700 bg-opacity-50 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
          />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handlePasscodeSubmit}
            className="mt-4 w-full bg-purple-600 text-white py-3 rounded-lg hover:bg-purple-700 transition-colors"
          >
            Submit
          </motion.button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 w-full">
        <motion.h1
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="text-3xl md:text-4xl font-bold mb-8 text-center"
        >
          Dwenlite HelpDesk Dashboard
        </motion.h1>
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left Panel */}
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="w-full lg:w-1/3 bg-white bg-opacity-10 backdrop-blur-lg p-6 rounded-xl shadow-xl overflow-y-auto max-h-[calc(100vh-120px)]"
          >
            <h2 className="text-xl font-semibold mb-4">Users ({users.length})</h2>
            {isLoadingUsers ? (
              <p className="text-gray-400">Loading users...</p>
            ) : users.length === 0 ? (
              <p className="text-gray-400">No users available.</p>
            ) : (
              <AnimatePresence>
                {users.map(user => (
                  <motion.div
                    key={user.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="p-4 bg-white bg-opacity-5 rounded-lg mb-3 cursor-pointer hover:bg-opacity-10 transition-all"
                    onClick={() => handleSelectUser(user.id)}
                  >
                    <p className="text-sm"><strong>User ID:</strong> {user.id.slice(0, 8)}...</p>
                    <p className="text-sm"><strong>Username:</strong> {user.username || 'Unknown'}</p>
                    <p className="text-sm"><strong>G_COINS:</strong> {user.gCoins || 0}</p>
                    <p className="text-sm"><strong>Status:</strong> {user.status || 'Active'}</p>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
            <h2 className="text-xl font-semibold mb-4 mt-8">Active Chats</h2>
            {chats.length === 0 && <p className="text-gray-400">No active chats available.</p>}
            <AnimatePresence>
              {chats.map(chat => (
                <motion.div
                  key={chat.chatId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className={`p-4 bg-white bg-opacity-5 rounded-lg mb-3 ${
                    !chat.agentId ? 'cursor-pointer hover:bg-opacity-10' : 'opacity-50 cursor-not-allowed'
                  } transition-all`}
                  onClick={() => !chat.agentId && handleJoinChat(chat)}
                >
                  <p className="text-sm"><strong>User:</strong> {chat.username || 'Unknown'}</p>
                  <p className="text-xs text-gray-400">Last: {chat.lastMessageTime?.toDate().toLocaleString() || 'N/A'}</p>
                  {chat.needsAgent && !chat.agentId && <p className="text-sm text-yellow-400"><strong>Status:</strong> Awaiting Agent</p>}
                  {!chat.needsAgent && chat.agentId && <p className="text-sm text-green-400"><strong>Status:</strong> Agent Assigned</p>}
                  {chat.rating && <p className="text-sm"><strong>Rating:</strong> {chat.rating}/5</p>}
                </motion.div>
              ))}
            </AnimatePresence>
            <h2 className="text-xl font-semibold mb-4 mt-8">Chat History</h2>
            {chatHistory.length === 0 && <p className="text-gray-400">No chat history available.</p>}
            <AnimatePresence>
              {chatHistory.map(chat => (
                <motion.div
                  key={chat.chatId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="p-4 bg-white bg-opacity-5 rounded-lg mb-3 flex justify-between items-center"
                >
                  <div>
                    <p className="text-sm"><strong>User:</strong> {chat.username || 'Unknown'}</p>
                    <p className="text-xs text-gray-400">
                      Closed: {chat.closedAt?.toDate().toLocaleString() || 'N/A'}
                      {typeof chat.rating === 'number' && `, ${chat.rating}/5`}
                    </p>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleDeleteChat(chat.chatId)}
                    className="bg-red-500 text-white py-1 px-2 rounded-lg text-sm"
                  >
                    Delete
                  </motion.button>
                </motion.div>
              ))}
            </AnimatePresence>
            <h2 className="text-xl font-semibold mb-4 mt-8">Purchases</h2>
            {isLoadingPurchases ? (
              <p className="text-gray-400">Loading purchases...</p>
            ) : purchases.length === 0 ? (
              <p className="text-gray-400">No purchases available.</p>
            ) : (
              <AnimatePresence>
                {purchases.map(purchase => (
                  <motion.div
                    key={purchase.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="p-4 bg-white bg-opacity-5 rounded-lg mb-3"
                  >
                    <p className="text-sm"><strong>User ID:</strong> {purchase.userId.slice(0, 8)}...</p>
                    <p className="text-sm"><strong>Bundle:</strong> {purchase.bundleName} ({purchase.network})</p>
                    <p className="text-sm"><strong>Phone:</strong> {purchase.phoneNumber}</p>
                    <p className="text-sm"><strong>Cost:</strong> {purchase.gCoins} G_COINS</p>
                    <p className="text-sm"><strong>Purchased:</strong> {new Date(purchase.timestamp.toDate()).toLocaleString()}</p>
                    <div className="flex items-center mt-2">
                      <strong className="text-sm">Status:</strong>
                      <select
                        value={purchase.status}
                        onChange={(e) => handleStatusChange(purchase.id, e.target.value)}
                        className="ml-2 p-1 bg-gray-700 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      >
                        <option value="Pending">Pending</option>
                        <option value="Processing">Processing</option>
                        <option value="Completed">Completed</option>
                      </select>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
            <h2 className="text-xl font-semibold mb-4 mt-8">Data Reports</h2>
            {isLoadingReports ? (
              <p className="text-gray-400">Loading reports...</p>
            ) : reports.length === 0 ? (
              <p className="text-gray-400">No data reports available.</p>
            ) : (
              <AnimatePresence>
                {reports.map(report => (
                  <motion.div
                    key={report.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="p-4 bg-white bg-opacity-5 rounded-lg mb-3"
                  >
                    <p className="text-sm"><strong>User:</strong> {report.userName || report.userId}</p>
                    <p className="text-sm"><strong>Network:</strong> {report.reportType}</p>
                    <p className="text-sm"><strong>Bundle:</strong> {report.gig}</p>
                    <p className="text-sm"><strong>Phone:</strong> {report.phoneNumber}</p>
                    <p className="text-sm"><strong>Date:</strong> {report.date}</p>
                    <p className="text-sm"><strong>Time:</strong> {report.time}</p>
                    <p className="text-sm"><strong>Screenshot:</strong> <a href={report.screenshotURL} target="_blank" rel="noopener noreferrer" className="text-purple-300 hover:underline">View</a></p>
                    <p className="text-sm"><strong>Submitted:</strong> {new Date(report.timestamp.toDate()).toLocaleString()}</p>
                    <div className="flex items-center mt-2">
                      <strong className="text-sm">Status:</strong>
                      <select
                        value={report.status}
                        onChange={(e) => handleReportStatusChange(report.id, e.target.value)}
                        className="ml-2 p-1 bg-gray-700 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      >
                        <option value="Pending">Pending</option>
                        <option value="Processing">Processing</option>
                        <option value="Completed">Completed</option>
                      </select>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </motion.div>
          {/* Right Panel */}
          <motion.div
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="w-full lg:w-2/3 bg-white bg-opacity-10 backdrop-blur-lg p-6 rounded-xl shadow-xl"
          >
            {selectedUser ? (
              <AnimatePresence>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <h2 className="text-xl font-semibold mb-4">User Details: {selectedUser.username || 'Unknown'}</h2>
                  <div className="p-4 bg-white bg-opacity-5 rounded-lg mb-4">
                    <p className="text-sm"><strong>User ID:</strong> {selectedUser.id}</p>
                    <p className="text-sm"><strong>Username:</strong> {selectedUser.username || 'Unknown'}</p>
                    <p className="text-sm"><strong>Email:</strong> {selectedUser.email || 'N/A'}</p>
                    <div className="flex items-center mt-2">
                      <strong className="text-sm">G_COINS:</strong>
                      <input
                        type="number"
                        value={selectedUser.gCoins || 0}
                        onChange={(e) => handleUpdateUser(selectedUser.id, { gCoins: parseInt(e.target.value) || 0 })}
                        className="ml-2 p-1 bg-gray-700 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div className="flex items-center mt-2">
                      <strong className="text-sm">Status:</strong>
                      <select
                        value={selectedUser.status || 'Active'}
                        onChange={(e) => handleUserStatusChange(selectedUser.id, e.target.value)}
                        className="ml-2 p-1 bg-gray-700 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      >
                        <option value="Active">Active</option>
                        <option value="Suspended">Suspended</option>
                      </select>
                    </div>
                    <p className="text-sm mt-2"><strong>Folders:</strong></p>
                    {selectedUser.folders && selectedUser.folders.length > 0 ? (
                      selectedUser.folders.map(folder => (
                        <div key={folder.id} className="ml-4 text-sm">
                          <p><strong>Name:</strong> {folder.name}</p>
                          <p><strong>Files:</strong> {folder.files?.length || 0}</p>
                        </div>
                      ))
                    ) : (
                      <p className="ml-4 text-gray-400 text-sm">No folders available.</p>
                    )}
                    <div className="flex gap-2 mt-4">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleDeleteUser(selectedUser.id)}
                        className="bg-red-500 text-white py-1.5 px-3 rounded-lg text-sm"
                      >
                        Delete User
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setSelectedUser(null)}
                        className="bg-gray-600 text-white py-1.5 px-3 rounded-lg text-sm"
                      >
                        Back to Chat
                      </motion.button>
                    </div>
                  </div>
                  <h2 className="text-xl font-semibold mb-4">User Activity Logs</h2>
                  {userActivityLogs.length === 0 ? (
                    <p className="text-gray-400">No activity logs available.</p>
                  ) : (
                    <AnimatePresence>
                      {userActivityLogs.map(log => (
                        <motion.div
                          key={log.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="p-4 bg-white bg-opacity-5 rounded-lg mb-2"
                        >
                          <p className="text-sm"><strong>Action:</strong> {log.action}</p>
                          <p className="text-sm"><strong>Timestamp:</strong> {new Date(log.timestamp.toDate()).toLocaleString()}</p>
                          <p className="text-sm"><strong>Details:</strong> {log.details || 'N/A'}</p>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  )}
                </motion.div>
              </AnimatePresence>
            ) : selectedChat ? (
              <AnimatePresence>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <h2 className="text-xl font-semibold mb-4">Chat with {selectedChat.username || 'Unknown'}</h2>
                  <div
                    ref={chatDisplayRef}
                    className="flex-1 p-4 overflow-y-auto flex flex-col space-y-3 h-[500px] bg-white bg-opacity-5 rounded-lg"
                  >
                    <AnimatePresence>
                      {messages.map(msg => (
                        <motion.div
                          key={msg.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${
                            msg.sender === 'user'
                              ? 'self-end bg-purple-500 text-white'
                              : msg.sender === 'agent'
                              ? 'self-start bg-blue-500 text-white'
                              : 'self-start bg-gray-600 text-white'
                          }`}
                        >
                          <strong>{msg.sender === 'user' ? selectedChat.username || 'User' : msg.sender === 'agent' ? 'You' : 'DwenLite Support AI'}:</strong> {msg.content}
                          <small className="block text-xs opacity-75">{msg.timestamp || 'N/A'}</small>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    {(isAgentTyping || isUserTyping) && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center px-3 py-2 text-gray-400 text-sm"
                      >
                        <span>{isAgentTyping ? 'Agent is typing' : 'User is typing'}</span>
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full mx-1 animate-pulse"></span>
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full mx-1 animate-pulse delay-200"></span>
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full mx-1 animate-pulse delay-400"></span>
                      </motion.div>
                    )}
                  </div>
                  {rewrittenText && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-4 p-3 bg-white bg-opacity-5 rounded-lg"
                    >
                      <p className="text-sm"><strong>Rewritten Message:</strong> {rewrittenText}</p>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setRewrittenText('')}
                        className="mt-2 bg-gray-600 text-white py-1 px-2 rounded-lg text-sm"
                      >
                        Clear Preview
                      </motion.button>
                    </motion.div>
                  )}
                  <div className="flex flex-col sm:flex-row gap-2 mt-4">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => handleTyping(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                      placeholder="Type your message..."
                      className="flex-1 p-3 rounded-lg bg-gray-700 text-white text-sm border border-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <div className="flex gap-2">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleRewriteText}
                        disabled={isRewriting}
                        className={`bg-yellow-500 text-white py-2 px-3 rounded-lg text-sm ${isRewriting ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {isRewriting ? 'Rewriting...' : 'Rewrite'}
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleSendMessage}
                        className="bg-purple-500 text-white py-2 px-3 rounded-lg text-sm"
                      >
                        Send
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleLeaveChat}
                        className="bg-orange-500 text-white py-2 px-3 rounded-lg text-sm"
                      >
                        Leave
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleCloseChat}
                        className="bg-red-500 text-white py-2 px-3 rounded-lg text-sm"
                      >
                        Close
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="text-center"
              >
                <h2 className="text-xl font-semibold mb-4">Select a User</h2>
                {isLoadingUsers ? (
                  <p className="text-gray-400">Loading users...</p>
                ) : users.length === 0 ? (
                  <p className="text-gray-400">No users available.</p>
                ) : (
                  <motion.select
                    onChange={(e) => handleSelectUser(e.target.value)}
                    className="w-full max-w-md p-3 rounded-lg bg-gray-700 text-white text-sm border border-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">Select a user</option>
                    {users.map(user => (
                      <option key={user.id} value={user.id}>
                        {user.username || 'Unknown'} ({user.id.slice(0, 8)}...)
                      </option>
                    ))}
                  </motion.select>
                )}
              </motion.div>
            )}
          </motion.div>
        </div>
    </div>
  );
}

export default DwenliteHelpdesk;