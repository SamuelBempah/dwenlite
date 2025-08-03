import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { auth, db } from '../firebase';
import { collection, addDoc, doc, onSnapshot, updateDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import toast from 'react-hot-toast';

const CommunitySupport = () => {
  const navigate = useNavigate();
  const [blogs, setBlogs] = useState([
    {
      id: 2,
      title: "Understanding Currency Conversion Rates for Buying G_COINS with Paystack",
      content: `
# Understanding Currency Conversion Rates for Buying G_COINS with Paystack

When purchasing G_COINS through our platform using Paystack, all transactions are processed in Ghanaian Cedi (GHS). These G_COINS can be used to generate notes, quizzes, and flashcards to enhance your study experience. For users in different countries or those curious about equivalent costs in other currencies, we provide approximate conversion rates to help you understand the value of your purchase. Below, we outline the conversion rates from GHS to supported currencies (USD, GBP, EUR, NGN) as of August 2025, based on our system's configuration, and explain how G_COINS can be used for notes, quizzes, and flashcards.

## Why GHS for Payments?
Paystack processes payments for Ghanaian businesses primarily in GHS, ensuring seamless transactions via mobile money or card. For international users, your bank or payment provider will convert your local currency to GHS at the time of payment, and Paystack will settle the exact GHS amount minus applicable fees.

## Conversion Rates
The following table shows approximate conversion rates from GHS to other currencies supported by our platform for reference when buying G_COINS. Note that these rates are approximations and actual rates may vary slightly due to market fluctuations or bank charges.

| Currency | Code | Symbol | Rate (1 GHS =) |
|----------|------|--------|----------------|
| US Dollar | USD | $ | 0.057 USD |
| British Pound | GBP | £ | 0.043 GBP |
| Euro | EUR | € | 0.052 EUR |
| Nigerian Naira | NGN | ₦ | 105.00 NGN |

### Examples
- To buy 5 G_COINS (equivalent to ₵5 GHS):
  - In USD: ₵5 × 0.057 = ~$0.29
  - In GBP: ₵5 × 0.043 = ~£0.22
  - In EUR: ₵5 × 0.052 = ~€0.26
  - In NGN: ₵5 × 105.00 = ~₦525.00
- For a custom purchase of ₵50 GHS (~50 G_COINS):
  - In USD: ₵50 × 0.057 = ~$2.85
  - In GBP: ₵50 × 0.043 = ~£2.15
  - In EUR: ₵50 × 0.052 = ~€2.60
  - In NGN: ₵50 × 105.00 = ~₦5,250.00

## Using G_COINS for Study Materials
Once purchased, G_COINS can be used within DwenLite to:
- **Generate Notes**: Convert uploaded audio, video, or documents into concise, organized notes for quick review.
- **Create Quizzes**: Generate custom quizzes to test your knowledge, perfect for exam preparation.
- **Build Flashcards**: Create flashcards for efficient memorization of key concepts or terms.

To use G_COINS, navigate to a folder in your Dashboard, upload content (audio, video, or document), and select the option to generate notes, quizzes, or flashcards. Each action will deduct the appropriate number of G_COINS from your balance.

## Important Notes
- **Payment Currency**: Regardless of your local currency, Paystack charges in GHS. Your bank or card provider will handle the conversion to GHS at their prevailing rate, which may differ slightly from the rates above.
- **Fees**: Paystack's transaction fees apply, and for international cards or domiciliary accounts (e.g., USD, GBP, EUR accounts in your country), fees are charged as per international transaction rates. Check [Paystack's pricing](https://paystack.com/rates) for details.
- **Rate Accuracy**: The rates provided are for reference only. For real-time rates, consult your bank or use a currency converter like [OANDA](https://www.oanda.com) or [Wise](https://wise.com).

## How to Buy G_COINS
1. Navigate to the "Buy G_COINS" page from your dashboard.
2. Select a predefined package (e.g., 5, 10, 25, or 50 G_COINS) or enter a custom amount.
3. Provide your payment email and complete the transaction via Paystack.
4. Your G_COINS will be credited upon successful payment, ready to be used for generating notes, quizzes, or flashcards.

For more details on supported currencies, transaction fees, or using G_COINS for notes, quizzes, and flashcards, visit [Paystack's support page](https://support.paystack.com) or our [G_COINS guide](/g-coins). If you need assistance, contact our support team via the [Chat](/support) link.

Happy learning with G_COINS!
`,
      author: "DwenLite Support",
      date: "2025-08-01",
    },
    {
      id: 3,
      title: "Getting Started with Folders in DwenLite",
      content: `
# Getting Started with Folders in DwenLite

Folders are the backbone of organizing your study materials in DwenLite. Whether you're managing notes, quizzes, or flashcards, folders help you keep everything in one place. This guide walks you through creating, editing, and deleting folders to streamline your learning experience.

## Creating a Folder
To start organizing your study materials:
1. On the Dashboard, locate the "Create Folder" section.
2. Enter a name for your folder in the input field (e.g., "Biology Notes" or "Math Quizzes").
3. Click the "Create Folder" button. Your new folder will appear in the "All Folders" list, ready to store notes, quizzes, flashcards, or documents.

**Tip**: Folder names should be descriptive to help you quickly find your materials later.

## Editing a Folder
Need to rename a folder? Here's how:
1. In the "All Folders" section, click the three-dot menu (⋯) next to the folder you want to edit.
2. Select "Edit" from the dropdown.
3. Update the folder name in the input field that appears.
4. Click "Save" to confirm changes or "Cancel" to discard them.

## Deleting a Folder
To remove a folder you no longer need:
1. Click the three-dot menu (⋯) next to the folder.
2. Select "Delete" from the dropdown.
3. Confirm the deletion in the pop-up prompt. Note that deleting a folder removes all its contents (notes, quizzes, flashcards, and documents), so proceed with caution.

## Organizing Your Study Materials
Each folder can store:
- **Notes**: Generated using G_COINS, perfect for summarizing uploaded audio, video, or documents.
- **Quizzes**: Custom quizzes to test your knowledge.
- **Flashcards**: Quick review tools for memorization.
- **Documents**: Uploaded files like PDFs or images for reference.

To add content, click on a folder to view its contents and use the upload options (Audio, Video, or Document) after selecting or creating a folder.

## Pro Tips
- **Use Descriptive Names**: Name folders based on subjects or topics (e.g., "Physics 101" or "Exam Prep 2025") for easy navigation.
- **Regularly Review**: Keep your folders tidy by deleting outdated ones.
- **Backup Important Content**: Before deleting a folder, ensure you've saved any critical notes or documents elsewhere.

For more help, reach out to our team via the [Chat](/support) link. Start organizing your study materials today!
`,
      author: "DwenLite Support",
      date: "2025-08-01",
    },
    {
      id: 4,
      title: "Maximize Your Exam Prep with DwenLite’s Event",
      content: `
# Maximize Your Exam Prep with DwenLite’s Event

Our limited-time Exam Preparation Event is here to help you ace your exams! Running until July 31, 2025, this feature lets you upload notes, create custom quizzes, and collaborate with peers using DwenConnect. Here's how to make the most of it.

## What is the Exam Preparation Event?
The Exam Preparation Event is a special feature on DwenLite designed to boost your study game. You can:
- Upload notes, audio, video, or documents to your folders.
- Generate custom quizzes and practice questions using G_COINS.
- Review flashcards for quick memorization.
- Collaborate with colleagues via DwenConnect to discuss strategies and share resources.

## Getting Started
1. **Create a Folder**: You need at least one folder to start. Go to the Dashboard, enter a folder name (e.g., "Exam Prep"), and click "Create Folder."
2. **Upload Content**: Select a folder and use the "Audio Upload," "Video Upload," or "Document Upload" buttons to add study materials. You'll need to create or select a folder first.
3. **Access Exam Prep**: If you have folders, click "Start Exam Preparation" in the Exam Preparation Event section on the Dashboard. This takes you to a dedicated page for generating quizzes and reviews.
4. **Use DwenConnect**: Set up virtual meetings with classmates or colleagues to collaborate on exam strategies. Share notes or quiz questions to enhance group study sessions.

## Event Deadline
The Exam Preparation Event runs until **July 31, 2025**. The countdown timer on the Dashboard shows the remaining time. Don't miss out—start preparing now!

## Tips for Success
- **Organize by Subject**: Create separate folders for each subject or exam to keep your materials structured.
- **Leverage G_COINS**: Use your G_COINS to generate notes or quizzes from uploaded content. You can earn more via daily drops or by purchasing them.
- **Collaborate Effectively**: Use DwenConnect to schedule regular study sessions with peers. Share practice questions to test each other.
- **Practice Regularly**: Generate quizzes daily to reinforce your learning and track progress.

## Need More G_COINS?
If you're running low on G_COINS, click "Buy G_COINS" on the Dashboard to purchase more via Paystack. These coins are essential for generating notes and quizzes during the event.

For any questions or assistance, contact our support team via the [Chat](/support) link. Get ready to excel in your exams with DwenLite!
`,
      author: "DwenLite Support",
      date: "2025-08-01",
    },
    {
      id: 5,
      title: "How to Earn and Use G_COINS Effectively",
      content: `
# How to Earn and Use G_COINS Effectively

G_COINS are the currency of DwenLite, powering your ability to generate notes, quizzes, and flashcards from uploaded content. This guide explains how to earn G_COINS and use them to enhance your study experience.

## Earning G_COINS
DwenLite offers a daily G_COINS drop to keep you studying:
- **Daily Drop**: Every day, you receive 3 G_COINS automatically, as long as your total is below the cap of 30 G_COINS. Check your Dashboard to see your current balance and any new coins added.
- **Purchasing G_COINS**: If you need more, click "Buy G_COINS" on the Dashboard to purchase additional coins via Paystack. Choose from predefined packages (5, 10, 25, or 50 G_COINS) or enter a custom amount.

**Note**: The daily drop only applies if you haven't reached the 30 G_COINS cap. Log in daily to maximize your free coins!

## Using G_COINS
G_COINS are used to generate study materials within your folders:
- **Notes**: Convert uploaded audio, video, or documents into concise notes. Perfect for summarizing lectures or readings.
- **Quizzes**: Create custom quizzes to test your knowledge. Great for exam prep, especially during the Exam Preparation Event.
- **Flashcards**: Generate flashcards for quick review and memorization.

To use G_COINS:
1. Navigate to a folder on the Dashboard.
2. Upload content (audio, video, or document) or select existing content.
3. Choose to generate notes, quizzes, or flashcards, which will deduct G_COINS from your balance.

## Managing Your G_COINS
- **Check Your Balance**: Your G_COINS balance is displayed in the "All Folders" section of the Dashboard. It updates automatically after daily drops or purchases.
- **Cap at 30**: Your G_COINS balance cannot exceed 30. If you're at the cap, the daily drop won't add more until you use some coins.
- **Animations**: When you receive new G_COINS (e.g., from the daily drop), you'll see a cool animation on the Dashboard to confirm the update.

## Tips for Effective Use
- **Prioritize High-Value Content**: Use G_COINS to generate notes from complex materials, like long lecture recordings or dense documents.
- **Plan Your Usage**: Since G_COINS are capped at 30, use them regularly to make room for daily drops.
- **Combine with Exam Prep**: During the Exam Preparation Event (until July 31, 2025), use G_COINS to generate quizzes and flashcards for focused study.

## Need More Help?
If you encounter issues with G_COINS or want to learn more about purchasing them, visit the [Buy G_COINS](/buy-coins) page or contact our support team via the [Chat](/support) link.

Start earning and using G_COINS to supercharge your learning today!
`,
      author: "DwenLite Support",
      date: "2025-08-01",
    },
  ]);
  const [searchQuery, setSearchQuery] = useState('');
  const [openBlogId, setOpenBlogId] = useState(null);
  const [hasNewMessage, setHasNewMessage] = useState(false); // New state for message highlight

  const filteredBlogs = blogs.filter(blog =>
    blog.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    blog.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleBlogContent = (blogId) => {
    setOpenBlogId(openBlogId === blogId ? null : blogId);
  };

  // Configure marked to ensure proper rendering
  marked.setOptions({
    breaks: true, // Treat line breaks as <br>
    gfm: true,   // Enable GitHub Flavored Markdown
  });

  // Render Markdown content with sanitization
  const renderMarkdown = (content) => {
    const html = marked(content);
    return DOMPurify.sanitize(html);
  };

  // Live Chat Bubble State and Logic (from Support.jsx, minimal version)
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
  const prevMessagesRef = useRef([]);

  // Predefined responses for Dwenlite features
  const predefinedResponses = {
    folder: 'In Dwenlite, you can create folders to organize your study materials. Go to the dashboard, enter a folder name in the "New folder name" field, and click "Create Folder" to get started. Is that all?',
    upload: 'You can upload PDF, PPTX, TXT, DOCX, audio, or video files to a folder. On the dashboard, select a folder, then use the "Audio Upload", "Video Upload", or "Document Upload" buttons to add your files. Is that all?',
    notes: 'Dwenlite generates concise study notes from your uploaded files. Select a folder, click "Generate Notes" in the notes section, and the AI will create a summary based on your latest document, audio, or video. Is that all?',
    quizzes: 'To generate quizzes, select a folder and go to the quizzes section. Click "Generate Quiz" to create interactive questions from your uploaded study materials. Is that all?',
    flashcards: 'Dwenlite can create flashcards for quick review. In a folder, navigate to the flashcards section and click "Generate Flashcards" to produce study cards from your uploaded content. Is that all?',
    agent: 'Your case has been forwarded to a human agent. Please wait. Note: Human agents are available Monday to Friday, 9am–8pm. Outside these hours, responses may be delayed, but our AI support is available 24/7.',
  };

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(async user => {
      if (user) {
        setCurrentUser(user);
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
      const unsubscribeChat = onSnapshot(chatDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const newMessages = data.messages || [];
          const prevMessages = prevMessagesRef.current;
          if (newMessages.length > prevMessages.length) {
            const latestMessage = newMessages[newMessages.length - 1];
            if (latestMessage.sender === 'dwenlite' || latestMessage.sender === 'agent') {
              setHasNewMessage(true); // Set highlight for new message
              playAlertSound();
              scrollToBottom();
            }
          }
          prevMessagesRef.current = newMessages;
          setMessages(newMessages);
          setAgentJoined(!!data.agentId);
          setIsConversationEnded(data.status === 'closed');
          setIsTyping(data.isAgentTyping || false);
          if (data.status === 'closed' && !showRating) {
            setShowRating(true);
          }
        }
      });
      return () => unsubscribeChat();
    }
  }, [chatId, showRating]);

  const scrollToBottom = () => {
    if (chatDisplayRef.current) {
      chatDisplayRef.current.scrollTop = chatDisplayRef.current.scrollHeight;
    }
  };

  const playAlertSound = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
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
      } catch {}
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
        } catch {}
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
    }).catch(() => {});
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
          }).catch(() => {});
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
            }).catch(() => {});
            setIsTyping(false);
            playAlertSound();
            scrollToBottom();
          }, 3000);
          return;
        }
        try {
          const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY;
          if (!apiKey) throw new Error('DeepSeek API key not found.');
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
          if (!response.ok) throw new Error(`DeepSeek API request failed: ${response.status}`);
          const data = await response.json();
          const generatedText = data.choices?.[0]?.message?.content?.trim();
          if (!generatedText) throw new Error('No response from DeepSeek API.');
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
            }).catch(() => {});
            setIsTyping(false);
            playAlertSound();
            scrollToBottom();
          }, 3000);
        } catch {
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
            }).catch(() => {});
            setIsTyping(false);
            playAlertSound();
            scrollToBottom();
          }, 3000);
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
    } catch {}
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
    } catch {}
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
      toast.success('Logged out successfully!');
      navigate('/login');
    } catch (err) {
      console.error('Logout error:', err);
      toast.error('Failed to log out. Please try again.');
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
      <style>
        {`
          .hover-scale {
            transition: transform 0.2s ease;
          }
          .hover-scale:hover {
            transform: scale(1.05);
          }
          .dropdown-transition {
            transition: max-height 0.3s ease, opacity 0.3s ease;
            max-height: 0;
            opacity: 0;
            overflow-y: auto;
            scrollbar-width: thin;
            scrollbar-color: #6b7280 #1f2937;
          }
          .dropdown-transition.open {
            max-height: 400px;
            opacity: 1;
          }
          .dropdown-transition::-webkit-scrollbar {
            width: 8px;
          }
          .dropdown-transition::-webkit-scrollbar-track {
            background: #1f2937;
          }
          .dropdown-transition::-webkit-scrollbar-thumb {
            background: #6b7280;
            border-radius: 4px;
          }
          .dropdown-transition::-webkit-scrollbar-thumb:hover {
            background: #9ca3af;
          }
          .check-icon {
            display: inline-block;
            vertical-align: middle;
            margin-left: 4px;
          }
          .prose {
            color: #d1d5db;
          }
          .prose h1 {
            font-size: 1.5rem;
            font-weight: 700;
            margin-bottom: 1rem;
            color: #ffffff;
          }
          .prose h2 {
            font-size: 1.25rem;
            font-weight: 600;
            margin-bottom: 0.75rem;
            color: #e5e7eb;
          }
          .prose h3 {
            font-size: 1.125rem;
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
          .animate-blink {
            animation: blink 1.4s infinite both;
          }
          @keyframes blink {
            0%, 80%, 100% { opacity: 0.2; }
            40% { opacity: 1; }
          }
          @keyframes slideUp {
            0% { transform: translateY(100%); opacity: 0; }
            100% { transform: translateY(0); opacity: 1; }
          }
          .bottom-nav {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            z-index: 20;
          }
          .bottom-nav-icon {
            transition: transform 0.2s ease, color 0.2s ease;
          }
          .bottom-nav-icon:hover {
            transform: scale(1.2);
            color: #d1d5db;
          }
          .bottom-nav-enter {
            animation: slideUp 0.3s ease-out forwards;
          }
          .active-nav {
            color: #9333ea !important;
            transform: scale(1.2);
          }
        `}
      </style>

      {/* Main Content */}
      <div className="flex-1">
        {/* Header */}
        <header className="bg-gray-800 p-4 sm:p-6 flex justify-between items-center">
          <div className="flex items-center">
            <span className="text-xl sm:text-2xl font-bold">DwenLite Community Support</span>
          </div>
          <nav className="flex items-center gap-3">
          </nav>
        </header>

        {/* Hero Section */}
        <div className="relative bg-gray-800 p-8 sm:p-12 text-center min-h-[280px] sm:min-h-[360px] flex flex-col justify-center">
          <h1 className="text-2xl sm:text-3xl font-bold mb-3 sm:mb-4 relative z-10">Explore Support Resources</h1>
          <img src="/community.jpg" alt="Community" className="absolute inset-0 w-full h-full object-cover opacity-30 min-h-[280px] sm:min-h-[360px]" />
          <div className="relative z-10">
            <p className="text-gray-300 text-base sm:text-lg max-w-2xl mx-auto">Discover solutions and insights from the DwenLite Support team to enhance your experience.</p>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-4xl mx-auto p-4 sm:p-8">
          {/* Search Bar */}
          <div className="mb-6 sm:mb-8">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search support articles..."
              className="w-full p-3 sm:p-4 rounded-lg bg-gray-700 text-white text-base sm:text-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
            />
          </div>

          {/* Latest Blogs */}
          <div className="bg-gray-800 p-4 sm:p-6 rounded-xl shadow-lg">
            <div className="flex justify-between items-center mb-4 sm:mb-6">
              <h2 className="text-lg sm:text-xl font-semibold">Support Articles</h2>
            </div>
            {filteredBlogs.length === 0 ? (
              <p className="text-gray-400 text-base sm:text-lg">No articles found.</p>
            ) : (
              filteredBlogs.map(b => (
                <div key={b.id} className="mb-4 sm:mb-6">
                  <div
                    onClick={() => toggleBlogContent(b.id)}
                    className="bg-gray-700 p-4 sm:p-5 rounded-lg hover:bg-gray-600 transition-colors cursor-pointer"
                  >
                    <h3 className="text-base sm:text-lg font-semibold">{b.title}</h3>
                    <p className="text-gray-400 text-sm sm:text-base">
                      Posted by {b.author}
                      <svg className="check-icon w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg> - {b.date}
                    </p>
                  </div>
                  <div className={`dropdown-transition ${openBlogId === b.id ? 'open' : ''} bg-gray-700 p-4 sm:p-5 rounded-b-lg mt-1`}>
                    <div
                      className="text-gray-300 text-base sm:text-lg prose prose-invert max-w-none"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(b.content) }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bottom Navigation for Mobile */}
      <div className="md:hidden bottom-nav bg-gray-800 p-4 flex justify-around items-center bottom-nav-enter">
        <Link
          to="/dashboard"
          className="text-purple-400 bottom-nav-icon"
          title="Dashboard"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
            />
          </svg>
        </Link>
        <Link
          to="/support"
          className="text-purple-400 bottom-nav-icon active-nav"
          title="Support"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2m-4 0H7a2 2 0 01-2-2v-6a2 2 0 012-2h2m4 0V6a2 2 0 00-2-2H7a2 2 0 00-2 2v2m4 8h6m-6 4H7a2 2 0 01-2-2v-6a2 2 0 012-2h2"
            />
          </svg>
        </Link>
        <Link
          to="/buy-coins"
          className="text-purple-400 bottom-nav-icon"
          title="Buy G_COINS"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </Link>
        <button
          onClick={handleLogout}
          className="text-purple-400 bottom-nav-icon"
          title="Logout"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M17 16l4-4m0 0l-4-4m4 4H7m5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h3a3 3 0 013 3v1"
            />
          </svg>
        </button>
      </div>

      {/* Live Chat Bubble */}
      <button
        onClick={() => {
          setIsChatOpen(!isChatOpen);
          setHasNewMessage(false); // Remove highlight when chat is opened
          if (!isChatOpen) {
            playAlertSound();
            setTimeout(scrollToBottom, 0);
          }
        }}
        className={`fixed bottom-4 right-4 w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-r from-yellow-400 to-red-500 rounded-full flex items-center justify-center shadow-lg hover:bg-gradient-to-l transition-all duration-1000 z-50 ${hasNewMessage ? 'border-2 border-purple-500 shadow-[0_0_10px_rgba(139,92,246,0.7)]' : ''}`}
      >
        <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
        </svg>
        <span className="absolute top-[-40px] opacity-0 bg-orange-400 text-white text-xs px-2 py-1 rounded-lg transition-opacity duration-500 pointer-events-none">
          Chat
        </span>
      </button>

      {/* Chat Window */}
      {isChatOpen && (
        <div className="fixed bottom-16 right-2 sm:right-5 w-[calc(100%-1rem)] sm:max-w-sm bg-gray-800 rounded-lg shadow-lg overflow-hidden z-50">
          <div className="flex flex-col h-[70vh] sm:h-[400px]">
            <div className="px-3 sm:px-4 py-2 sm:py-3 border-b border-gray-700">
              <div className="flex justify-between items-center">
                <h2 className="text-base sm:text-lg font-semibold text-white">Dwenlite Support</h2>
                <div className="bg-green-500 text-white text-xs px-2 py-1 rounded-full">
                  {agentJoined ? 'Agent Online' : 'Online'}
                </div>
              </div>
            </div>
            <div ref={chatDisplayRef} className="flex-1 p-3 overflow-y-auto flex flex-col space-y-2">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`max-w-[80%] rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm ${
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
                <div className="flex items-center px-2 sm:px-3 py-1 sm:py-2 text-gray-400 text-xs">
                  <span>Agent is typing</span>
                  <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-gray-400 rounded-full mx-1 animate-blink"></span>
                  <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-gray-400 rounded-full mx-1 animate-blink delay-200"></span>
                  <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-gray-400 rounded-full mx-1 animate-blink delay-400"></span>
                </div>
              )}
              {(isTyping && !agentJoined) && (
                <div className="flex items-center px-2 sm:px-3 py-1 sm:py-2 text-gray-400 text-xs">
                  <span>DwenLite Support AI is typing</span>
                  <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-gray-400 rounded-full mx-1 animate-blink"></span>
                  <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-gray-400 rounded-full mx-1 animate-blink delay-200"></span>
                  <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-gray-400 rounded-full mx-1 animate-blink delay-400"></span>
                </div>
              )}
            </div>
            {showRating && !ratingSubmitted && (
              <div className="px-2 sm:px-3 py-2 border-t border-gray-700">
                <div className="text-white text-xs sm:text-sm mb-2">Rate your experience:</div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      onClick={() => setRating(star)}
                      className={`text-xl sm:text-2xl ${rating >= star ? 'text-yellow-400' : 'text-gray-400'}`}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleRatingSubmit}
                  className="bg-purple-600 text-white py-1 px-3 rounded-lg hover:bg-purple-700 text-xs sm:text-sm mt-2"
                  disabled={rating === 0}
                >
                  Submit Rating
                </button>
              </div>
            )}
            {ratingSubmitted && (
              <div className="px-2 sm:px-3 py-2 border-t border-gray-700">
                <button
                  onClick={handleStartNewChat}
                  className="bg-purple-600 text-white py-1 px-3 rounded-lg hover:bg-purple-700 text-xs sm:text-sm"
                >
                  Start New Chat
                </button>
              </div>
            )}
            {!showRating && !ratingSubmitted && (
              <div className="px-2 sm:px-3 py-2 border-t border-gray-700">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => handleTyping(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Type your message..."
                    className={`flex-1 p-2 rounded-lg bg-gray-700 text-white text-xs sm:text-sm border border-gray-600 ${
                      isConversationEnded ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    disabled={isConversationEnded}
                  />
                  <button
                    onClick={handleSendMessage}
                    className={`bg-purple-600 text-white py-1.5 px-3 rounded-lg hover:bg-purple-700 text-xs sm:text-sm ${
                      isConversationEnded ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    disabled={isConversationEnded}
                  >
                    Send
                  </button>
                </div>
                <div className="text-gray-500 text-xs mt-2 text-center">Developed By SBMind Technologies</div>
                {isConversationEnded && !showRating && (
                  <div className="text-gray-500 text-xs mt-2 text-center">
                    The conversation has ended. Tap "Start New Chat" to begin a new session.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <audio ref={audioRef} preload="auto" src="/ping.mp3" />
    </div>
  );
};

export default CommunitySupport;