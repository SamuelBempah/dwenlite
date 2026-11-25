import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { auth, db } from '../firebase';
import { collection, addDoc, doc, onSnapshot, updateDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import toast from 'react-hot-toast';
import axios from 'axios'; // Import axios
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, ChevronDown, ChevronUp, User, Calendar, 
  MessageCircle, Send, X, Star, LifeBuoy, LogOut, 
  ArrowLeft, Coins, LayoutDashboard, Sparkles, CheckCircle
} from 'lucide-react';

const CommunitySupport = () => {
  const navigate = useNavigate();
  
  // --- BLOG DATA ---
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
| US Dollar | USD | $ | 0.064 USD |
| British Pound | GBP | £ | 0.049 GBP |
| Euro | EUR | € | 0.059 EUR |
| Nigerian Naira | NGN | ₦ | 103.45 NGN |
| Australian Dollar | AUD | $ | 0.096 AUD |
| Canadian Dollar | CAD | $ | 0.087 CAD |
| Japanese Yen | JPY | ¥ | 9.50 JPY |
| Indian Rupee | INR | ₹ | 5.36 INR |
| South African Rand | ZAR | R | 1.15 ZAR |

### Examples
- To buy 5 G_COINS (equivalent to ₵5 GHS):
  - In USD: ₵5 × 0.064 = ~$0.32
  - In GBP: ₵5 × 0.049 = ~£0.25
  - In EUR: ₵5 × 0.059 = ~€0.30
  - In NGN: ₵5 × 103.45 = ~₦517.25
  - In AUD: ₵5 × 0.096 = ~$0.48
  - In CAD: ₵5 × 0.087 = ~$0.44
  - In JPY: ₵5 × 9.50 = ~¥47.50
  - In INR: ₵5 × 5.36 = ~₹26.80
  - In ZAR: ₵5 × 1.15 = ~R5.75
- For a custom purchase of ₵50 GHS (~50 G_COINS):
  - In USD: ₵50 × 0.064 = ~$3.20
  - In GBP: ₵50 × 0.049 = ~£2.45
  - In EUR: ₵50 × 0.059 = ~€2.95
  - In NGN: ₵50 × 103.45 = ~₦5,172.50
  - In AUD: ₵50 × 0.096 = ~$4.80
  - In CAD: ₵50 × 0.087 = ~$4.35
  - In JPY: ₵50 × 9.50 = ~¥475.00
  - In INR: ₵50 × 5.36 = ~₹268.00
  - In ZAR: ₵50 × 1.15 = ~R57.50

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
    {
      id: 6,
      title: "Available Versions of DwenLite: Android, PC, and Web",
      content: `
# Available Versions of DwenLite: Android, PC, and Web

DwenLite is designed to support your learning journey across multiple platforms, ensuring flexibility and accessibility. Below, we outline the available versions of DwenLite—Android, PC, and Web—to help you choose the best platform for your needs.

## DwenLite on Android
The DwenLite Android app is available for devices running **Android 7.0 (Nougat) or higher**. It offers a mobile-optimized experience, allowing you to:
- Create and manage folders for organizing study materials.
- Upload audio, video, or documents to generate notes, quizzes, or flashcards using G_COINS.
- Participate in the Exam Preparation Event (until July 31, 2025) to create custom quizzes and collaborate via DwenConnect.
- Receive daily G_COINS drops and purchase additional coins via Paystack.

**How to Get It**: Download the DwenLite app from the [Google Play Store](https://play.google.com/store/apps/details?id=co.median.android.pkmzbk). Or visit the Google Play Store, Search for "DwenLite" and install it on your Android phone or tablet.

## DwenLite on PC
DwenLite is accessible on PC through a web-based application, compatible with Windows, macOS, and Linux. The PC version provides a larger screen for managing complex study materials and is ideal for:
- Generating detailed notes from uploaded content.
- Creating and reviewing quizzes and flashcards.
- Managing multiple folders with a clear, desktop-optimized interface.
- Accessing DwenConnect for collaboration with peers.

**System Requirements**:
- A modern web browser (e.g., Chrome, Firefox, Edge, or Safari).
- Internet connection for full functionality.
- No specific hardware requirements beyond a standard PC or laptop.

**How to Get It**: Visit [DwenLite's website](https://www.dwenlite.space/dwenlite-download) using your browser and download whichever version you prefer.

## DwenLite on Web
The web version of DwenLite is platform-agnostic, meaning it works on any device with a modern browser, including Chromebooks, tablets, or even smartphones. It mirrors the PC experience but offers additional flexibility:
- Access DwenLite from any device without installing software.
- Sync your folders, notes, quizzes, and flashcards across devices using your DwenLite account.
- Purchase G_COINS via Paystack and use them for generating study materials.
- Collaborate seamlessly with DwenConnect for group study sessions.

**How to Get It**: Navigate to [DwenLite's website](https://www.dwenlite.space) on any browser, log in, and start studying. No downloads or installations are required.

## Choosing the Right Version
- **Android**: Best for mobile users who want to study on the go or upload content directly from their phone or tablet.
- **PC**: Ideal for users who prefer a larger screen and more robust interface for managing study materials or creating detailed notes and quizzes.
- **Web**: Perfect for users who need flexibility across multiple devices or don’t want to install an app.

## Notes
- **Cross-Platform Sync**: Your DwenLite account syncs your folders, G_COINS balance, and study materials across all versions (Android, PC, Web).
- **Minimum Requirements**: Ensure your Android device runs at least Android 7.0. For PC and Web, a stable internet connection and modern browser are sufficient.
- **Feature Parity**: All versions offer the same core features (folder management, content uploads, note/quiz/flashcard generation, DwenConnect), though the interface may vary slightly.

For further assistance or to report issues with any version, contact our support team via the [Chat](/support) link. Start exploring DwenLite on your preferred platform today!
`,
      author: "DwenLite Support",
      date: "2025-08-03",
    },
    {
      id: 7,
      title: "Buying Data Bundles with G_COINS",
      content: `
# Buying Data Bundles with G_COINS

This guide explains how to purchase data bundles using G_COINS on DwenLite, including selecting networks, choosing bundles, and understanding the Fire Sale event.

## Overview
DwenLite allows users to buy non-expiry data bundles for MTN, AirtelTigo, and Telecel networks using premium G_COINS. These bundles can be credited to a Ghanaian phone number of your choice, provided it’s not a data-only SIM.

## How to Buy Data Bundles
1. **Navigate to Bundles**: From the Dashboard, click the “Buy Bundles” link to access the Bundles page.
2. **Enter Phone Number**: Input a valid Ghanaian phone number (e.g., +233XXXXXXXXX) in the provided field. Ensure it’s correct, as no refunds are allowed.
3. **Select Network**: Choose your network (MTN, AirtelTigo, or Telecel) by clicking the corresponding button.
4. **Select Bundle**: Pick a bundle from the list (e.g., 1GB, 5GB, etc.). The cost in premium G_COINS is displayed. Ensure you have enough premium G_COINS in your balance.
5. **Confirm Purchase**: Click “Buy Bundle” to open a confirmation modal. Verify the details (bundle, network, G_COINS cost) and click “Confirm” to complete the purchase.
6. **Processing Time**:
   - MTN: 30 minutes to 1 hour.
   - AirtelTigo and Telecel: Instant.

## Fire Sale Event
- **What is it?**: From 8:00 PM to 8:30 PM daily, DwenLite offers a 50% discount on 1GB to 5GB bundles across all networks.
- **How to Spot It**: A “FIRE SALE ALERT” banner appears at the top of the Bundles page during this time.
- **Example**: A 1GB MTN bundle, normally 5 G_COINS, costs 3 G_COINS during the Fire Sale.

## Operating Hours
- **Open**: 8:00 AM to 9:00 PM daily.
- **Closed**: 9:00 PM to 8:00 AM. During this time, purchases are disabled, and a “Closed” notice is displayed.

## Important Notes
- **Premium G_COINS Required**: Only premium G_COINS (purchased via Paystack) can be used for bundles. Free G_COINS from daily drops are not eligible.
- **No Refunds**: Ensure the phone number and bundle details are correct before confirming.
- **Purchase History**: View your past purchases, including bundle details and status (Pending, Processing, Completed), in the “Purchase History” section on the Bundles page.
- **Insufficient G_COINS**: If you lack premium G_COINS, click “Buy More G_COINS” to purchase more via Paystack.

## Troubleshooting
- **Invalid Phone Number**: Ensure the number starts with +233 and has 9 digits (e.g., +233123456789).
- **Purchase Failed**: Check your premium G_COINS balance and internet connection. Try again or contact support.
- **Bundle Not Credited**: Wait for the processing time (up to 1 hour for MTN). If it’s still not credited, contact support.

For further assistance, reach out to our team via the [Chat](/support] link or check the [Community Support](/community-support) page for more articles.

Happy browsing with DwenLite!
`,
      author: "DwenLite Support",
      date: "2025-08-01",
    },
  ]);

  const [searchQuery, setSearchQuery] = useState('');
  const [openBlogId, setOpenBlogId] = useState(null);
  const [hasNewMessage, setHasNewMessage] = useState(false);

  // Chat State
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

  // --- LOGIC: FILTERING & FORMATTING ---
  const filteredBlogs = blogs.filter(blog =>
    blog.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    blog.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleBlogContent = (blogId) => {
    setOpenBlogId(openBlogId === blogId ? null : blogId);
  };

  marked.setOptions({ breaks: true, gfm: true });

  const renderMarkdown = (content) => {
    const html = marked(content);
    return DOMPurify.sanitize(html);
  };

  // --- LOGIC: CHAT & AUTH ---
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
              setHasNewMessage(true);
              playAlertSound();
              scrollToBottom();
            }
          }
          prevMessagesRef.current = newMessages;
          setMessages(newMessages);
          setAgentJoined(!!data.agentId);
          setIsConversationEnded(data.status === 'closed');
          setIsTyping(data.isAgentTyping || false);
          if (data.status === 'closed' && !showRating) setShowRating(true);
        }
      });
      return () => unsubscribeChat();
    }
  }, [chatId, showRating]);

  const scrollToBottom = () => {
    if (chatDisplayRef.current) chatDisplayRef.current.scrollTop = chatDisplayRef.current.scrollHeight;
  };

  const playAlertSound = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  };

  const endConversation = async (message) => {
    setTimeout(() => {
      setMessages(prev => [...prev, { id: Date.now(), sender: 'dwenlite', content: message, timestamp: new Date().toLocaleString() }]);
      updateDoc(doc(db, 'chats', chatId), {
        messages: [...messages, { id: Date.now(), sender: 'dwenlite', content: message, timestamp: new Date().toLocaleString() }],
        status: 'closed',
        lastMessageTime: serverTimestamp(),
        isUserTyping: false, isAgentTyping: false,
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
      try { await updateDoc(doc(db, 'chats', chatId), { isUserTyping: true }); } catch {}
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(async () => {
      if (isTypingNow) {
        try { await updateDoc(doc(db, 'chats', chatId), { isUserTyping: false }); } catch {}
      }
    }, 2000);
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !currentUser || isConversationEnded) return;
    const userMessage = { id: Date.now(), sender: 'user', content: input.trim(), timestamp: new Date().toLocaleString() };
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
        if (lowercaseInput.includes('folder') || lowercaseInput.includes('create folder')) responseText = predefinedResponses.folder;
        else if (lowercaseInput.includes('upload') || lowercaseInput.includes('document')) responseText = predefinedResponses.upload;
        else if (lowercaseInput.includes('notes') || lowercaseInput.includes('generate notes')) responseText = predefinedResponses.notes;
        else if (lowercaseInput.includes('quiz')) responseText = predefinedResponses.quizzes;
        else if (lowercaseInput.includes('flashcard')) responseText = predefinedResponses.flashcards;
        else if (lowercaseInput.includes('human') || lowercaseInput.includes('agent')) {
          responseText = predefinedResponses.agent;
          await updateDoc(doc(db, 'chats', chatId), { needsAgent: true, lastMessageTime: serverTimestamp() }).catch(() => {});
        }
        
        if (responseText) {
          setTimeout(() => {
            const botMessage = { id: Date.now(), sender: 'dwenlite', content: responseText, timestamp: new Date().toLocaleString() };
            setMessages(prev => [...prev, botMessage]);
            updateDoc(doc(db, 'chats', chatId), {
              messages: [...messages, userMessage, botMessage], lastMessageTime: serverTimestamp(), isUserTyping: false,
            }).catch(() => {});
            setIsTyping(false);
            playAlertSound();
            scrollToBottom();
          }, 3000);
          return;
        }

        // --- FIXED: USE CLOUD FUNCTION PROXY ---
        try {
          const functionUrl = 'https://us-central1-leumas-decipher-softwares.cloudfunctions.net/generateNotesProxy';
          const prompt = `You are a support assistant for Dwenlite. Provide a concise response to: "${input}". End with: "Is that all?"`;
          
          const response = await axios.post(functionUrl, { prompt });
          
          let generatedText;
          if (response.data.choices?.[0]?.message?.content) generatedText = response.data.choices[0].message.content.trim();
          else if (response.data.choices?.[0]?.text) generatedText = response.data.choices[0].text.trim();
          else throw new Error('No answer found.');

          setTimeout(() => {
            const botMessage = { id: Date.now(), sender: 'dwenlite', content: generatedText, timestamp: new Date().toLocaleString() };
            setMessages(prev => [...prev, botMessage]);
            updateDoc(doc(db, 'chats', chatId), { messages: [...messages, userMessage, botMessage], lastMessageTime: serverTimestamp(), isUserTyping: false }).catch(() => {});
            setIsTyping(false);
            playAlertSound();
            scrollToBottom();
          }, 3000);
        } catch (err) {
          console.error("Chat API Error:", err);
          setTimeout(() => {
            const errorMessage = { id: Date.now(), sender: 'dwenlite', content: 'Sorry, I encountered an error connecting to the server. Please try again or type "agent".', timestamp: new Date().toLocaleString() };
            setMessages(prev => [...prev, errorMessage]);
            updateDoc(doc(db, 'chats', chatId), { messages: [...messages, userMessage, errorMessage], lastMessageTime: serverTimestamp(), isUserTyping: false }).catch(() => {});
            setIsTyping(false);
            scrollToBottom();
          }, 3000);
        }
      }, 2000);
    }
  };

  const handleRatingSubmit = async () => {
    try {
      await addDoc(collection(db, 'ratings'), { userId: currentUser.uid, chatId, rating, timestamp: serverTimestamp() });
      await addDoc(collection(db, 'chat_history'), { userId: currentUser.uid, username: currentUser.displayName || 'User', messages, status: 'closed', closedAt: serverTimestamp() });
      setRatingSubmitted(true);
      setShowRating(false);
      const thanksMsg = { id: Date.now(), sender: 'dwenlite', content: 'Thank you for your feedback!', timestamp: new Date().toLocaleString() };
      setMessages(prev => [...prev, thanksMsg]);
      await updateDoc(doc(db, 'chats', chatId), { messages: [...messages, thanksMsg], lastMessageTime: serverTimestamp() });
      scrollToBottom();
    } catch {}
  };

  const handleStartNewChat = async () => {
    try {
      const chatDoc = await addDoc(collection(db, 'chats'), {
        userId: currentUser.uid, username: currentUser.displayName || 'User',
        messages: [{ id: Date.now(), sender: 'dwenlite', content: 'Welcome to Dwenlite Support! How can I assist you today?', timestamp: new Date().toLocaleString() }],
        status: 'active', needsAgent: false, lastMessageTime: serverTimestamp(), isUserTyping: false, isAgentTyping: false,
      });
      setChatId(chatDoc.id);
      setMessages([{ id: Date.now(), sender: 'dwenlite', content: 'Welcome to Dwenlite Support! How can I assist you today?', timestamp: new Date().toLocaleString() }]);
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
    } catch (err) { toast.error('Failed to log out.'); }
  };

  if (!currentUser) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
       <div className="w-10 h-10 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <>
        
        {/* HEADER */}
        <header className="bg-slate-900/80 backdrop-blur-md sticky top-0 z-30 p-4 border-b border-white/5 flex justify-between items-center">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-purple-600 rounded-lg">
                <LifeBuoy size={20} className="text-white" />
             </div>
             <span className="text-xl font-bold">Community Support</span>
          </div>
          <nav className="flex items-center gap-3">
            <Link
              to="/dashboard"
              className="hidden md:flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-white/10 text-white py-2 px-4 rounded-lg transition-colors text-sm"
            >
              <ArrowLeft size={16} /> Dashboard
            </Link>
            <button
              onClick={handleLogout}
              className="hidden md:flex items-center gap-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 px-3 py-2 rounded-lg transition-colors"
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </nav>
        </header>

        {/* HERO SECTION */}
        <div className="relative bg-gradient-to-r from-slate-900 via-purple-900/20 to-slate-900 p-8 sm:p-12 text-center border-b border-white/5">
           <div className="absolute inset-0 bg-[url('/community.jpg')] bg-cover bg-center opacity-10 mix-blend-overlay" />
           <div className="relative z-10 max-w-3xl mx-auto">
             <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-semibold mb-4">
               <Sparkles size={12} /> Help Center
             </div>
             <h1 className="text-3xl sm:text-4xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-white to-purple-200">
               How can we help you today?
             </h1>
             <p className="text-slate-400 text-lg">
               Explore guides, troubleshoot issues, or chat with our AI support.
             </p>
           </div>
        </div>

        {/* MAIN CONTENT */}
        <div className="max-w-4xl mx-auto p-4 sm:p-8 w-full pb-24">
          
          {/* Search Bar */}
          <div className="mb-8 relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="text-slate-500 group-focus-within:text-purple-400 transition-colors" size={20} />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for articles, guides, and tutorials..."
              className="w-full pl-12 pr-4 py-4 rounded-xl bg-slate-800/50 border border-white/10 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 text-white placeholder-slate-500 outline-none transition-all shadow-lg shadow-purple-900/5"
            />
          </div>

          {/* Articles List */}
          <div className="space-y-4">
             <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-300 mb-4">
                <LayoutDashboard size={18} /> Knowledge Base
             </h2>
             
             {filteredBlogs.length === 0 ? (
               <div className="text-center py-12 border border-dashed border-slate-700 rounded-xl">
                 <Search size={48} className="mx-auto text-slate-600 mb-4" />
                 <p className="text-slate-400">No articles found matching your search.</p>
               </div>
             ) : (
               filteredBlogs.map(b => (
                 <motion.div 
                   layout
                   key={b.id} 
                   className={`bg-slate-800/40 backdrop-blur-sm border ${openBlogId === b.id ? 'border-purple-500/30 bg-slate-800/80' : 'border-white/5'} rounded-xl overflow-hidden transition-all duration-300`}
                 >
                   <div
                     onClick={() => toggleBlogContent(b.id)}
                     className="p-5 cursor-pointer flex justify-between items-start gap-4"
                   >
                     <div>
                       <h3 className={`text-lg font-semibold mb-2 ${openBlogId === b.id ? 'text-purple-300' : 'text-white'}`}>
                         {b.title}
                       </h3>
                       <div className="flex items-center gap-4 text-xs text-slate-500">
                         <span className="flex items-center gap-1"><User size={12} /> {b.author}</span>
                         <span className="flex items-center gap-1"><Calendar size={12} /> {b.date}</span>
                         {openBlogId === b.id && <span className="flex items-center gap-1 text-green-400"><CheckCircle size={12} /> Verified</span>}
                       </div>
                     </div>
                     <div className={`p-2 rounded-full ${openBlogId === b.id ? 'bg-purple-500/20 text-purple-300' : 'bg-slate-700/50 text-slate-400'}`}>
                        {openBlogId === b.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                     </div>
                   </div>

                   <AnimatePresence>
                     {openBlogId === b.id && (
                       <motion.div 
                         initial={{ height: 0, opacity: 0 }}
                         animate={{ height: 'auto', opacity: 1 }}
                         exit={{ height: 0, opacity: 0 }}
                         className="border-t border-white/5 bg-slate-900/30 px-6 py-6"
                       >
                         <div
                           className="prose prose-invert prose-sm max-w-none 
                           prose-headings:text-purple-200 prose-headings:font-bold
                           prose-a:text-purple-400 hover:prose-a:text-purple-300
                           prose-strong:text-white
                           prose-code:text-purple-300 prose-code:bg-purple-900/20 prose-code:px-1 prose-code:rounded
                           prose-blockquote:border-l-purple-500 prose-blockquote:bg-purple-900/10 prose-blockquote:py-1 prose-blockquote:px-4"
                           dangerouslySetInnerHTML={{ __html: renderMarkdown(b.content) }}
                         />
                       </motion.div>
                     )}
                   </AnimatePresence>
                 </motion.div>
               ))
             )}
          </div>
        </div>


      {/* CHAT BUBBLE */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => {
          setIsChatOpen(!isChatOpen);
          setHasNewMessage(false);
          if (!isChatOpen) { playAlertSound(); setTimeout(scrollToBottom, 0); }
        }}
        className={`fixed bottom-20 md:bottom-8 right-4 md:right-8 w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center shadow-2xl z-50 transition-all ${
           hasNewMessage 
           ? 'bg-purple-600 shadow-[0_0_20px_rgba(147,51,234,0.6)] animate-pulse' 
           : 'bg-gradient-to-tr from-purple-600 to-indigo-600 border border-white/10'
        }`}
      >
        {isChatOpen ? <X className="text-white" size={28} /> : <MessageCircle className="text-white" size={28} />}
        
        {!isChatOpen && hasNewMessage && (
           <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-slate-900" />
        )}
      </motion.button>

      {/* CHAT WINDOW */}
      <AnimatePresence>
        {isChatOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 right-4 md:right-8 w-[calc(100%-2rem)] md:w-96 h-[min(500px,70dvh)] bg-slate-800/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden"
          >
            {/* Chat Header */}
            <div className="p-4 border-b border-white/5 bg-slate-900/50 flex justify-between items-center">
              <div>
                 <h3 className="font-bold text-white flex items-center gap-2">
                    DwenLite Assistant
                    {agentJoined && <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded border border-blue-500/30">Human Agent</span>}
                 </h3>
                 <p className="text-xs text-slate-400">{agentJoined ? 'Live support active' : 'AI-powered help'}</p>
              </div>
              <div className={`w-2 h-2 rounded-full ${agentJoined ? 'bg-blue-500' : 'bg-green-500'} animate-pulse`} />
            </div>

            {/* Chat Messages */}
            <div ref={chatDisplayRef} className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
              {messages.map(msg => (
                <div key={msg.id} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                   <div 
                      className={`max-w-[85%] p-3 rounded-2xl text-sm ${
                        msg.sender === 'user' 
                        ? 'bg-purple-600 text-white rounded-br-none' 
                        : msg.sender === 'agent'
                           ? 'bg-blue-600 text-white rounded-bl-none'
                           : 'bg-slate-700 text-slate-200 rounded-bl-none'
                      }`}
                   >
                      {msg.content}
                   </div>
                   <span className="text-[10px] text-slate-500 mt-1 px-1">{msg.timestamp.split(',')[1]}</span>
                </div>
              ))}
              
              {isTyping && (
                 <div className="flex items-center gap-1 p-2 bg-slate-700/50 rounded-xl w-fit rounded-bl-none">
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-100" />
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-200" />
                 </div>
              )}
            </div>

            {/* Chat Footer */}
            <div className="p-3 bg-slate-900/50 border-t border-white/5">
               {showRating && !ratingSubmitted ? (
                  <div className="text-center p-2">
                     <p className="text-sm text-slate-300 mb-3">How was your experience?</p>
                     <div className="flex justify-center gap-2 mb-4">
                        {[1, 2, 3, 4, 5].map(star => (
                           <button key={star} onClick={() => setRating(star)} className="focus:outline-none transition-transform hover:scale-110">
                              <Star size={24} className={rating >= star ? 'fill-yellow-400 text-yellow-400' : 'text-slate-600'} />
                           </button>
                        ))}
                     </div>
                     <button onClick={handleRatingSubmit} disabled={rating === 0} className="w-full bg-purple-600 hover:bg-purple-500 py-2 rounded-lg text-sm font-bold disabled:opacity-50">
                        Submit Feedback
                     </button>
                  </div>
               ) : ratingSubmitted ? (
                  <button onClick={handleStartNewChat} className="w-full bg-slate-700 hover:bg-slate-600 py-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2">
                     <MessageCircle size={16} /> Start New Chat
                  </button>
               ) : (
                  <div className="flex gap-2">
                     <input 
                        value={input}
                        onChange={(e) => handleTyping(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                        disabled={isConversationEnded}
                        placeholder={isConversationEnded ? "Chat ended." : "Type a message..."}
                        className="flex-1 bg-slate-800 border border-slate-600 rounded-xl px-4 py-2 text-sm focus:border-purple-500 outline-none transition-all disabled:opacity-50"
                     />
                     <button 
                        onClick={handleSendMessage}
                        disabled={isConversationEnded || !input.trim()}
                        className="bg-purple-600 hover:bg-purple-500 text-white p-2.5 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                     >
                        <Send size={18} />
                     </button>
                  </div>
               )}
               {isConversationEnded && !showRating && !ratingSubmitted && (
                  <p className="text-[10px] text-center text-slate-500 mt-2">Session closed.</p>
               )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <audio ref={audioRef} preload="auto" src="/ping.mp3" />
    </>
  );
};

export default CommunitySupport;