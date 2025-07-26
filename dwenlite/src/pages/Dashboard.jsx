import { Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { auth, db } from '../firebase';
import { collection, addDoc, query, where, getDocs, updateDoc, deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';

function Dashboard() {
  const navigate = useNavigate();
  const [folders, setFolders] = useState([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [createFolderLoading, setCreateFolderLoading] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(null);
  const [editFolderId, setEditFolderId] = useState(null);
  const [editFolderName, setEditFolderName] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [countdown, setCountdown] = useState('');
  const [showAdNotice, setShowAdNotice] = useState(false);
  const [gCoins, setGCoins] = useState(0);
  const [gCoinsAnimating, setGCoinsAnimating] = useState(false);

  const folderInputRef = useRef(null);
  const createButtonRef = useRef(null);
  const sidebarRef = useRef(null);
  const uploadSectionRef = useRef(null);
  const foldersSectionRef = useRef(null);
  const examEventRef = useRef(null);

  const tutorialSteps = [
    {
      title: "Welcome to the Dashboard!",
      description: "This is your main hub for managing folders and uploads. Let's take a quick tour to get you started.",
      highlightRef: null,
    },
    {
      title: "Sidebar Navigation",
      description: "The sidebar shows your profile and navigation links. Use it to access the dashboard and other features.",
      highlightRef: sidebarRef,
    },
    {
      title: "Upload Options",
      description: "Use these buttons to upload audio, video, or documents. First, you'll need to create or select a folder.",
      highlightRef: uploadSectionRef,
    },
    {
      title: "Create a Folder",
      description: "Enter a name for your new folder here. Folders help organize your notes, quizzes, and flashcards.",
      highlightRef: folderInputRef,
    },
    {
      title: "Confirm Folder Creation",
      description: "Click this button to create your folder. It will appear in the list below.",
      highlightRef: createButtonRef,
    },
    {
      title: "Exam Preparation Event",
      description: "Join our limited-time exam preparation event to get ready for your exams with custom quizzes and reviews!",
      highlightRef: examEventRef,
    },
    {
      title: "Manage Folders",
      description: "Your folders are listed here. Click a folder to view its contents, or use the menu to edit/delete. Check your G_COINS balance above to generate notes.",
      highlightRef: foldersSectionRef,
    },
    {
      title: "You're All Set!",
      description: "That's it! You can now create folders, upload content, and manage your study materials. Use G_COINS to generate notes in folders. Close this to continue.",
      highlightRef: null,
    },
  ];

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => {
      if (user) {
        console.log('Authenticated user UID:', user.uid);
        setCurrentUser(user);
        fetchFolders(user.uid);
        fetchUserGCoins(user.uid);
        if (!localStorage.getItem('tutorialCompleted')) {
          setShowTutorial(true);
        }
        if (!sessionStorage.getItem('adNoticeShown')) {
          setShowAdNotice(true);
          sessionStorage.setItem('adNoticeShown', 'true');
        }
      } else {
        navigate('/login');
      }
    });
    return unsubscribe;
  }, [navigate]);

  // Fetch user G_COINS
  const fetchUserGCoins = async (userId) => {
    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        setGCoins(userSnap.data().gCoins || 0);
      } else {
        // Initialize user with default G_COINS
        await setDoc(userRef, { gCoins: 30 });
        setGCoins(30);
      }
    } catch (err) {
      console.error('Fetch user G_COINS error:', err);
      toast.error('Failed to fetch G_COINS. Please try again.');
    }
  };

  // Countdown timer for exam season (set to end on July 31, 2025)
  useEffect(() => {
    const endDate = new Date('2025-07-31T23:59:59Z');
    const updateCountdown = () => {
      const now = new Date();
      const timeLeft = endDate - now;
      if (timeLeft <= 0) {
        setCountdown('Event Ended');
        return;
      }
      const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
      const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
      setCountdown(`${days}d ${hours}h ${minutes}m ${seconds}s`);
    };
    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchFolders = async (userId) => {
    setFoldersLoading(true);
    try {
      const q = query(collection(db, 'folders'), where('user_id', '==', userId));
      const querySnapshot = await getDocs(q);
      const userFolders = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFolders(userFolders);
      console.log('Fetched folders:', userFolders);
    } catch (err) {
      toast.error('Failed to fetch folders. Please try again.');
      console.error('Fetch folders error:', err);
    } finally {
      setTimeout(() => {
        setFoldersLoading(false);
      }, 1500);
    }
  };

  const getFriendlyErrorMessage = (errorCode) => {
    switch (errorCode) {
      case 'permission-denied':
        return 'You do not have permission to perform this action. Please contact support.';
      case 'unavailable':
        return 'Network error. Please check your internet connection and try again.';
      case 'deadline-exceeded':
        return 'The operation took too long. Please try again.';
      default:
        return 'An unexpected error occurred. Please try again.';
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName || !currentUser) {
      toast.error('Folder name is required');
      return;
    }
    setCreateFolderLoading(true);
    try {
      const newFolder = {
        user_id: currentUser.uid,
        name: newFolderName,
        createdAt: new Date().toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        }),
        notes: [],
        quizzes: [],
        flashcards: [],
        documents: [],
      };
      console.log('Creating folder with data:', newFolder);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('deadline-exceeded')), 10000);
      });
      await Promise.race([
        addDoc(collection(db, 'folders'), newFolder),
        timeoutPromise,
      ]);
      setTimeout(() => {
        toast.success('Folder created successfully!');
        setNewFolderName('');
        setCreateFolderLoading(false);
        fetchFolders(currentUser.uid);
      }, 3000);
    } catch (err) {
      const errorCode = err.code || err.message;
      console.error('Create folder error details:', err);
      toast.error(getFriendlyErrorMessage(errorCode));
      setCreateFolderLoading(false);
    }
  };

  const handleEditFolder = async (folderId) => {
    if (!currentUser) {
      toast.error('User not authenticated. Please log in again.');
      navigate('/login');
      return;
    }
    if (!editFolderName) {
      toast.error('Folder name cannot be empty');
      return;
    }
    console.log('Editing folder with ID:', folderId, 'User UID:', currentUser.uid);
    setEditLoading(true);
    try {
      const folderRef = doc(db, 'folders', folderId);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('deadline-exceeded')), 10000);
      });
      await Promise.race([
        updateDoc(folderRef, { name: editFolderName }),
        timeoutPromise,
      ]);
      setTimeout(() => {
        toast.success('Folder updated successfully!');
        setEditFolderId(null);
        setEditFolderName('');
        setEditLoading(false);
        setDropdownOpen(null);
        fetchFolders(currentUser.uid);
      }, 2000);
    } catch (err) {
      const errorCode = err.code || err.message;
      console.error('Edit folder error details:', err);
      toast.error(getFriendlyErrorMessage(errorCode));
      setEditLoading(false);
    }
  };

  const handleDeleteFolder = async (folderId) => {
    if (!currentUser) {
      toast.error('User not authenticated. Please log in again.');
      navigate('/login');
      return;
    }
    if (!window.confirm('Are you sure you want to delete this folder?')) {
      return;
    }
    console.log('Deleting folder with ID:', folderId, 'User UID:', currentUser.uid);
    setDeleteLoading(true);
    try {
      const folderRef = doc(db, 'folders', folderId);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('deadline-exceeded')), 10000);
      });
      await Promise.race([
        deleteDoc(folderRef),
        timeoutPromise,
      ]);
      setTimeout(() => {
        toast.success('Folder deleted successfully!');
        setDeleteLoading(false);
        setDropdownOpen(null);
        fetchFolders(currentUser.uid);
      }, 2000);
    } catch (err) {
      const errorCode = err.code || err.message;
      console.error('Delete folder error details:', err);
      toast.error(getFriendlyErrorMessage(errorCode));
      setDeleteLoading(false);
    }
  };

  const handleUpgrade = () => {
    setUpgradeLoading(true);
    navigate('/support-me');
    setTimeout(() => {
      setUpgradeLoading(false);
    }, 1000);
  };

  const handleBuyGCoins = () => {
    navigate('/buy-coins');
  };

  const handleLogout = () => {
    setLogoutLoading(true);
    setTimeout(() => {
      auth.signOut()
        .then(() => {
          toast.success('Logged out successfully!');
          navigate('/login');
        })
        .catch((err) => {
          toast.error('Failed to log out. Please try again.');
          console.error('Logout error:', err);
        })
        .finally(() => {
          setLogoutLoading(false);
        });
    }, 3000);
  };

  const handleAudioClick = () => {
    setAudioLoading(true);
    setTimeout(() => {
      setAudioLoading(false);
      toast.success('Create Or Select A Folder To Upload Audio!');
    }, 3000);
  };

  const handleYoutubeClick = () => {
    setYoutubeLoading(true);
    setTimeout(() => {
      setYoutubeLoading(false);
      toast.success('Create Or Select A Folder To Upload Video!');
    }, 3000);
  };

  const handleDocumentClick = () => {
    setDocumentLoading(true);
    setTimeout(() => {
      setDocumentLoading(false);
      toast.success('Create Or Select A Folder To Upload Document!');
    }, 3000);
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const toggleDropdown = (folderId) => {
    setDropdownOpen(dropdownOpen === folderId ? null : folderId);
  };

  const handleNextStep = () => {
    if (tutorialStep < tutorialSteps.length - 1) {
      setTutorialStep(tutorialStep + 1);
    } else {
      setShowTutorial(false);
      localStorage.setItem('tutorialCompleted', 'true');
    }
  };

  const handlePrevStep = () => {
    if (tutorialStep > 0) {
      setTutorialStep(tutorialStep - 1);
    }
  };

  const handleCloseAdNotice = () => {
    setShowAdNotice(false);
  };

  if (!currentUser) return null;

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col md:flex-row">
      <style>
        {`
          @keyframes pulseGlow {
            0% { box-shadow: 0 0 0 0 rgba(147, 51, 234, 0.7); }
            70% { box-shadow: 0 0 0 10px rgba(147, 51, 234, 0); }
            100% { box-shadow: 0 0 0 0 rgba(147, 51, 234, 0); }
          }
          @keyframes coinsDeduction {
            0% { transform: translateY(0); opacity: 1; }
            50% { transform: translateY(-20px); opacity: 0.5; }
            100% { transform: translateY(-40px); opacity: 0; }
          }
          .pulse-glow {
            animation: pulseGlow 2s infinite;
          }
          .coins-deduct {
            animation: coinsDeduction 1s ease-out forwards;
          }
          .hover-scale {
            transition: transform 0.2s ease;
          }
          .hover-scale:hover {
            transform: scale(1.05);
          }
          @keyframes fadeInScale {
            0% { opacity: 0; transform: scale(0.8); }
            100% { opacity: 1; transform: scale(1); }
          }
          .ad-notice-enter {
            animation: fadeInScale 0.3s ease-out forwards;
          }
        `}
      </style>

        {/* Mobile Sidebar Toggle Button */}
      <button
        onClick={toggleSidebar}
        className="md:hidden p-4 bg-gray-800 text-white flex items-center justify-between"
      >
        <span>{isSidebarOpen ? 'Close Menu' : 'Open Menu'}</span>
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
            d={isSidebarOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'}
          />
        </svg>
      </button>

      {/* Tutorial Modal */}
      {showTutorial && (
        <div className={`fixed inset-0 bg-black bg-opacity-50 flex justify-center z-50 px-4 ${
          tutorialStep === 3 || tutorialStep === 4 || tutorialStep === 5 || tutorialStep === 6 ? 'items-start pt-4' : 'items-center'
        }`}>
          <div className="bg-gray-800 p-4 sm:p-6 rounded-lg w-full max-w-sm sm:max-w-md">
            <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4">{tutorialSteps[tutorialStep].title}</h2>
            <p className="text-gray-300 text-sm sm:text-base mb-4 sm:mb-6">{tutorialSteps[tutorialStep].description}</p>
            <div className="flex justify-between items-center">
              <button
                onClick={handlePrevStep}
                disabled={tutorialStep === 0}
                className={`py-1 px-3 sm:py-2 sm:px-4 rounded-lg text-xs sm:text-sm ${
                  tutorialStep === 0
                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    : 'bg-purple-600 text-white hover:bg-purple-700'
                }`}
              >
                Previous
              </button>
              <span className="text-gray-400 text-xs sm:text-sm">
                {tutorialStep + 1} / {tutorialSteps.length}
              </span>
              <button
                onClick={handleNextStep}
                className="bg-purple-600 text-white py-1 px-3 sm:py-2 sm:px-4 rounded-lg hover:bg-purple-700 text-xs sm:text-sm"
              >
                {tutorialStep === tutorialSteps.length - 1 ? 'Finish' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div
        ref={sidebarRef}
        className={`w-full md:w-64 bg-gray-800 p-4 md:p-6 flex flex-col justify-between absolute md:static z-10 transition-transform duration-300 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0 ${tutorialStep === 1 ? 'ring-4 ring-purple-500' : ''}`}
      >
        <div className="relative">
          <button
            onClick={toggleSidebar}
            className="md:hidden absolute top-0 right-0 p-2 text-gray-400 hover:text-white"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
          <div className="flex items-center mb-6 md:mb-8">
            <div className="w-8 h-8 md:w-10 md:h-10 bg-purple-600 rounded-full flex items-center justify-center text-lg md:text-xl">
              {currentUser.displayName?.charAt(0) || 'U'}
            </div>
            <span className="ml-2 md:ml-3 text-base md:text-lg font-semibold">
              {currentUser.displayName || 'User'}
            </span>
          </div>
          <nav>
            <Link
              to="/dashboard"
              className="flex items-center mb-3 md:mb-4 text-purple-400 text-sm md:text-base"
            >
              <span className="mr-2">🏠</span> Dashboard
            </Link>
            <Link
              to="/support"
              className="flex items-center mb-3 md:mb-4 text-purple-400 text-sm md:text-base"
            >
              <span className="mr-2">💬</span> Support
            </Link>
            <button
              onClick={handleBuyGCoins}
              className="flex items-center mb-3 md:mb-4 text-purple-400 text-sm md:text-base"
            >
              <span className="mr-2">💰</span> Buy G_COINS
            </button>
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-4 md:p-8">
        <div className="flex justify-between items-center mb-6 md:mb-8">
          <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setShowTutorial(true)}
              className="text-purple-400 hover:text-purple-300 text-sm md:text-base"
            >
              Show Tutorial
            </button>
            <button
              onClick={handleLogout}
              disabled={logoutLoading}
              className={`text-gray-400 hover:text-white text-sm md:text-base ${
                logoutLoading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {logoutLoading ? (
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
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Loading...
                </span>
              ) : (
                'Logout'
              )}
            </button>
          </div>
        </div>
        <div ref={uploadSectionRef} className={`mb-6 md:mb-8 ${tutorialStep === 2 ? 'ring-4 ring-purple-500' : ''}`}>
          <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">Try Now For Free!</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
            <button
              onClick={handleAudioClick}
              disabled={audioLoading}
              className={`bg-gray-800 p-3 md:p-4 rounded-lg flex items-center justify-between hover:bg-gray-700 text-sm md:text-base ${
                audioLoading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {audioLoading ? (
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
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Loading...
                </span>
              ) : (
                <>
                  <span>Audio Upload</span>
                  <span>➔</span>
                </>
              )}
            </button>
            <button
              onClick={handleYoutubeClick}
              disabled={youtubeLoading}
              className={`bg-gray-800 p-3 md:p-4 rounded-lg flex items-center justify-between hover:bg-gray-700 text-sm md:text-base ${
                youtubeLoading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {youtubeLoading ? (
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
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Loading...
                </span>
              ) : (
                <>
                  <span>Video Upload</span>
                  <span>➔</span>
                </>
              )}
            </button>
            <button
              onClick={handleDocumentClick}
              disabled={documentLoading}
              className={`bg-gray-800 p-3 md:p-4 rounded-lg flex items-center justify-between hover:bg-gray-700 text-sm md:text-base ${
                documentLoading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {documentLoading ? (
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
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Loading...
                </span>
              ) : (
                <>
                  <span>Document Upload</span>
                  <span>➔</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Examination Preparation Event */}
        <div ref={examEventRef} className={`mb-6 md:mb-8 pulse-glow ${tutorialStep === 5 ? 'ring-4 ring-purple-500' : ''}`}>
          <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4 text-purple-400">🏆 Limited-Time Exam Season Event!</h2>
          <div className="bg-gray-800 p-4 md:p-6 rounded-lg">
            <p className="text-gray-300 text-sm md:text-base mb-3">
              It's examination season! Prepare for your exams with our new Exam Preparation feature. Upload your notes, tackle custom quizzes, reviews, and practice questions to excel in your tests. You can also set up meetings with your colleagues through <em><strong>DwenConnect</strong></em> to collaborate and discuss strategies for this exam season.
            </p>
            <p className="text-yellow-400 text-sm md:text-base font-semibold mb-3">
              Event Expires In: {countdown}
            </p>
            {folders.length > 0 ? (
              <Link
                to="/exams-preparation"
                className="inline-block bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 hover-scale text-sm md:text-base"
              >
                Start Exam Preparation
              </Link>
            ) : (
              <p className="text-gray-400 text-sm md:text-base">
                Create a folder to start your exam preparation!
              </p>
            )}
          </div>
        </div>

        <div ref={foldersSectionRef} className={tutorialStep === 6 ? 'ring-4 ring-purple-500' : ''}>
          <div className="flex justify-between items-center mb-3 md:mb-4">
            <h2 className="text-lg md:text-xl font-semibold">All Folders</h2>
            <div className="flex items-center space-x-3">
              <p className={`text-sm md:text-base ${gCoinsAnimating ? 'coins-deduct' : ''}`}>
                💰 G_COINS: {gCoins}
              </p>
              <button
                onClick={handleBuyGCoins}
                className="bg-purple-600 text-white py-1 px-3 rounded-lg hover:bg-purple-700 text-sm md:text-base hover-scale"
              >
                Buy G_COINS
              </button>
            </div>
          </div>
          <div className={`flex flex-col sm:flex-row items-center mb-4 gap-3 ${tutorialStep === 3 || tutorialStep === 4 ? 'ring-4 ring-purple-500' : ''}`}>
            <input
              ref={folderInputRef}
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="New folder name"
              className="p-2 rounded-lg bg-gray-700 text-white w-full sm:w-auto"
            />
            <button
              ref={createButtonRef}
              onClick={handleCreateFolder}
              disabled={createFolderLoading}
              className={`bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 text-sm md:text-base w-full sm:w-auto ${
                createFolderLoading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {createFolderLoading ? (
                <span className="flex items-center justify-center">
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
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Creating Folder...
                </span>
              ) : (
                'Create Folder'
              )}
            </button>
          </div>
          {foldersLoading ? (
            <div className="min-h-[200px] flex items-center justify-center">
              <div className="flex items-center">
                <svg className="animate-spin h-5 w-5 mr-3 text-white" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Fetching Your Folders...
              </div>
            </div>
          ) : folders.length === 0 ? (
            <p className="text-gray-400 text-sm md:text-base">
              No folders yet. Create one to start!
            </p>
          ) : (
            folders.map((folder) => (
              <div
                key={folder.id}
                className="bg-gray-800 p-3 md:p-4 rounded-lg mb-3 md:mb-4 flex items-center justify-between relative"
              >
                {editFolderId === folder.id ? (
                  <div className="flex items-center space-x-3 w-full">
                    <input
                      type="text"
                      value={editFolderName}
                      onChange={(e) => setEditFolderName(e.target.value)}
                      placeholder="Edit folder name"
                      className="p-2 rounded-lg bg-gray-700 text-white flex-1"
                    />
                    <button
                      onClick={() => handleEditFolder(folder.id)}
                      disabled={editLoading}
                      className={`bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 text-sm ${
                        editLoading ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      {editLoading ? (
                        <span className="flex items-center">
                          <svg className="animate-spin h-4 w-4 mr-2 text-white" viewBox="0 0 24 24">
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                              fill="none"
                            />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          Saving...
                        </span>
                      ) : (
                        'Save'
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setEditFolderId(null);
                        setEditFolderName('');
                      }}
                      className="text-gray-400 hover:text-white text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <Link to={`/folder/${folder.id}`} className="flex-1">
                      <div className="hover:bg-gray-700 p-2 rounded-lg transition-colors">
                        <h3 className="text-base md:text-lg font-semibold">{folder.name}</h3>
                        <p className="text-gray-400 text-sm">Created on {folder.createdAt}</p>
                      </div>
                    </Link>
                    <div className="relative">
                      <button
                        onClick={() => toggleDropdown(folder.id)}
                        className="text-gray-400 hover:text-white text-xl"
                      >
                        ⋯
                      </button>
                      {dropdownOpen === folder.id && (
                        <div className="absolute right-0 mt-2 w-32 bg-gray-700 rounded-lg shadow-lg z-10">
                          <button
                            onClick={() => {
                              setEditFolderId(folder.id);
                              setEditFolderName(folder.name);
                              setDropdownOpen(null);
                            }}
                            className="block w-full text-left px-4 py-2 text-sm text-white hover:bg-gray-600 rounded-t-lg"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteFolder(folder.id)}
                            disabled={deleteLoading}
                            className={`block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-600 rounded-b-lg ${
                              deleteLoading ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                          >
                            {deleteLoading ? (
                              <span className="flex items-center">
                                <svg className="animate-spin h-4 w-4 mr-2 text-red-400" viewBox="0 0 24 24">
                                  <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                    fill="none"
                                  />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                </svg>
                                Deleting...
                              </span>
                            ) : (
                              'Delete'
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;