import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, deleteDoc, addDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';

function DwenliteHelpdesk() {
  const navigate = useNavigate();
  const [passcode, setPasscode] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [chats, setChats] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const chatDisplayRef = useRef(null);

  const handlePasscodeSubmit = () => {
    if (passcode === '10203339') {
      setIsAuthenticated(true);
    } else {
      toast.error('Invalid passcode.');
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
      // Fetch all active chats
      const activeChatsQuery = query(collection(db, 'chats'), where('status', '==', 'active'));
      const unsubscribeActiveChats = onSnapshot(activeChatsQuery, (snapshot) => {
        const chatList = snapshot.docs.map(doc => ({
          chatId: doc.id,
          ...doc.data(),
        }));
        setChats(chatList);
        console.log('Active chats fetched:', chatList);
        if (chatList.length === 0) {
          toast('No active chats found.', { icon: 'ℹ️' });
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
        setChatHistory(historyList);
        console.log('Chat history fetched:', historyList);
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
        setChats(prev => prev.map(chat => ({
          ...chat,
          rating: ratings[chat.chatId] || null,
        })));
        setChatHistory(prev => prev.map(chat => ({
          ...chat,
          rating: ratings[chat.chatId] || null,
        })));
        console.log('Ratings fetched:', ratings);
      }, (error) => {
        console.error('Error fetching ratings:', error.code, error.message);
        toast.error(`Failed to load ratings: ${error.message}`);
      });

      return () => {
        unsubscribeActiveChats();
        unsubscribeHistory();
        unsubscribeRatings();
      };
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (selectedChat) {
      const chatDocRef = doc(db, 'chats', selectedChat.chatId);
      const unsubscribeMessages = onSnapshot(chatDocRef, (doc) => {
        if (doc.exists()) {
          setMessages(doc.data().messages || []);
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
    }
  }, [selectedChat]);

  const scrollToBottom = () => {
    if (chatDisplayRef.current) {
      chatDisplayRef.current.scrollTop = chatDisplayRef.current.scrollHeight;
    }
  };

  const handleJoinChat = async (chat) => {
    setSelectedChat(chat);
    setMessages(chat.messages || []);
    scrollToBottom();
    try {
      await updateDoc(doc(db, 'chats', chat.chatId), {
        agentId: auth.currentUser.uid,
        messages: [
          ...(chat.messages || []),
          {
            id: Date.now(),
            sender: 'dwenlite',
            content: 'An agent has joined the conversation.',
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

  const handleSendMessage = async () => {
    if (!input.trim() || !selectedChat) return;
    const agentMessage = {
      id: Date.now(),
      sender: 'agent',
      content: input.trim(),
      timestamp: new Date().toLocaleString(),
    };
    setMessages(prev => [...prev, agentMessage]);
    setInput('');
    try {
      await updateDoc(doc(db, 'chats', selectedChat.chatId), {
        messages: [...messages, agentMessage],
        lastMessageTime: serverTimestamp(),
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
      // Move chat to history before closing
      await addDoc(collection(db, 'chat_history'), {
        ...selectedChat,
        status: 'closed',
        closedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'chats', selectedChat.chatId), {
        status: 'closed',
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
      });
      setChats(prev => prev.filter(chat => chat.chatId !== selectedChat.chatId));
      setSelectedChat(null);
      setMessages([]);
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
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-8">Dwenlite Helpdesk</h1>
        <div className="flex flex-col md:flex-row gap-6">
          {/* Chat List */}
          <div className="w-full md:w-1/3 bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Active Chats</h2>
            {chats.length === 0 && <p className="text-gray-400">No active chats available.</p>}
            {chats.map(chat => (
              <div
                key={chat.chatId}
                className="p-4 bg-gray-700 rounded-lg mb-2 cursor-pointer hover:bg-gray-600"
                onClick={() => handleJoinChat(chat)}
              >
                <p><strong>User:</strong> {chat.username || 'Unknown'}</p>
                <p><small>Last Message: {chat.lastMessageTime?.toDate().toLocaleString() || 'N/A'}</small></p>
                {chat.needsAgent && <p><strong>Status:</strong> Awaiting Agent</p>}
                {chat.rating && <p><strong>Rating:</strong> {chat.rating} ★</p>}
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
                      {chat.rating && `, Rating: ${chat.rating} ★`}
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
                </div>
                <div className="flex gap-2 mt-4">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Type your message..."
                    className="flex-1 p-2 rounded-lg bg-gray-700 text-white text-sm border border-gray-600"
                  />
                  <button
                    onClick={handleSendMessage}
                    className="bg-purple-600 text-white py-1.5 px-3 rounded-lg hover:bg-purple-700 text-sm"
                  >
                    Send
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