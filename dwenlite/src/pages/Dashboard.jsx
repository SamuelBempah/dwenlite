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
  const [isGhanaianUser, setIsGhanaianUser] = useState(false);
  const [currency, setCurrency] = useState({ symbol: '₵', code: 'GHS', rate: 1 });
  const [ratingStats, setRatingStats] = useState({ average: 0, count: 0 });

  const folderInputRef = useRef(null);
  const createButtonRef = useRef(null);
  const sidebarRef = useRef(null);
  const uploadSectionRef = useRef(null);
  const foldersSectionRef = useRef(null);
  const bundleEventRef = useRef(null);

  const currencyMap = {
    US: { symbol: '$', code: 'USD', rate: 0.064 },
    GB: { symbol: '£', code: 'GBP', rate: 0.049 },
    EU: { symbol: '€', code: 'EUR', rate: 0.059 },
    GH: { symbol: '₵', code: 'GHS', rate: 1 },
    NG: { symbol: '₦', code: 'NGN', rate: 103.45 },
  };

  const tutorialSteps = [
    {
      title: "Welcome to the Dashboard!",
      description: "This is your main hub for managing folders and uploads. Let's take a quick tour to get you started.",
      highlightRef: null,
    },
    {
      title: "Navigation",
      description: "On desktop, use the sidebar for navigation. On mobile, use the bottom navigation bar to access dashboard, support, and more.",
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
      title: "Educational Bundles",
      description: "Check out our limited-time educational bundles to enhance your study experience with premium resources! (Available for Ghanaian users only)",
      highlightRef: isGhanaianUser ? bundleEventRef : null,
    },
    {
      title: "Manage Folders",
      description: "Your folders are listed here. Click a folder to view its contents, or use the menu to edit/delete. Check your G_COINS balance and ratings above to generate and evaluate notes.",
      highlightRef: foldersSectionRef,
    },
    {
      title: "You're All Set!",
      description: "That's it! You can now create folders, upload content, manage your study materials, and rate your generated notes. Close this to continue.",
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
        fetchRatingStats();
        if (!localStorage.getItem('tutorialCompleted')) {
          setShowTutorial(true);
        }
        fetch('https://ipapi.co/json/')
          .then(response => response.json())
          .then(data => {
            console.log('Geolocation data:', data);
            const countryCode = data.country_code || 'GH';
            const currencyInfo = currencyMap[countryCode] || currencyMap['GH'];
            setCurrency(currencyInfo);
            const isGhanaian = countryCode === 'GH';
            setIsGhanaianUser(isGhanaian);
            console.log('Currency set:', currencyInfo, 'Is Ghanaian:', isGhanaian);
            if (isGhanaian) {
              setShowAdNotice(true);
            }
          })
          .catch(err => {
            console.error('Geolocation error:', err);
            setCurrency(currencyMap['GH']);
            setIsGhanaianUser(true);
            setShowAdNotice(true);
          });
      } else {
        navigate('/login');
      }
    });
    return unsubscribe;
  }, [navigate]);

  const fetchUserGCoins = async (userId) => {
    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      let userData = userSnap.exists() ? userSnap.data() : { gCoins: 30, lastCoinDrop: null };

      const today = new Date().toDateString();
      const lastCoinDrop = userData.lastCoinDrop ? new Date(userData.lastCoinDrop).toDateString() : null;

      let newGCoins = userData.gCoins || 30;

      if (newGCoins <= 30 && (!lastCoinDrop || lastCoinDrop !== today)) {
        newGCoins = Math.min(newGCoins + 3, 30);
        await setDoc(userRef, { 
          gCoins: newGCoins, 
          lastCoinDrop: new Date().toISOString() 
        }, { merge: true });
        if (userData.gCoins !== newGCoins) {
          setGCoinsAnimating(true);
          setTimeout(() => setGCoinsAnimating(false), 1000);
          toast.success('You received 3 G_COINS for today!');
        }
      }

      setGCoins(newGCoins);
    } catch (err) {
      console.error('Fetch user G_COINS error:', err);
      toast.error('Failed to fetch G_COINS. Please try again.');
    }
  };

  const fetchRatingStats = async () => {
    try {
      const ratingsQuery = query(collection(db, 'ratings'));
      const ratingsSnapshot = await getDocs(ratingsQuery);
      const ratings = ratingsSnapshot.docs.map(doc => doc.data().rating);
      const count = ratings.length;
      const average = count > 0 ? (ratings.reduce((sum, rating) => sum + rating, 0) / count).toFixed(1) : 0;
      setRatingStats({ average, count });
    } catch (err) {
      console.error('Fetch rating stats error:', err);
      toast.error('Failed to fetch rating statistics.');
    }
  };

  useEffect(() => {
    const endDate = new Date('2025-08-31T23:59:59Z');
    const updateCountdown = () => {
      const now = new Date();
      const timeLeft = endDate - now;
      if (timeLeft <= 0) {
        setCountdown('Offer Ended');
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

  const handleBuyGCoins = () => {
    setUpgradeLoading(true);
    navigate('/buy-coins');
    setTimeout(() => {
      setUpgradeLoading(false);
    }, 1000);
  };

  const handleBuyBundle = () => {
    setUpgradeLoading(true);
    navigate('/buy-bundles');
    setTimeout(() => {
      setUpgradeLoading(false);
    }, 1000);
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

  if (!currentUser) return null;

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col md:flex-row relative">
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
          @keyframes fadeInScale {
            0% { opacity: 0; transform: scale(0.8); }
            100% { opacity: 1; transform: scale(1); }
          }
          @keyframes slideUp {
            0% { transform: translateY(100%); opacity: 0; }
            100% { transform: translateY(0); opacity: 1; }
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
          .ad-notice-enter {
            animation: fadeInScale 0.3s ease-out forwards;
          }
          .bottom-nav-enter {
            animation: slideUp 0.3s ease-out forwards;
          }
          .bottom-nav-icon {
            transition: transform 0.2s ease, color 0.2s ease;
          }
          .bottom-nav-icon:hover {
            transform: scale(1.2);
            color: #d1d5db;
          }
          .bottom-nav {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            z-index: 20;
          }
          .rating-stars {
            display: inline-flex;
            align-items: center;
          }
          .rating-star {
            color: #facc15;
            margin-right: 2px;
          }
          .rating-text {
            font-size: 0.9rem;
            color: #d1d5db;
          }
        `}
      </style>

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

      <div
        ref={sidebarRef}
        className={`hidden md:block w-64 bg-gray-800 p-6 flex flex-col justify-between ${
          tutorialStep === 1 ? 'ring-4 ring-purple-500' : ''
        }`}
      >
        <div>
          <div className="flex items-center mb-8">
            <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center text-xl">
              {currentUser.displayName?.charAt(0) || 'U'}
            </div>
            <span className="ml-3 text-lg font-semibold">
              {currentUser.displayName || 'User'}
            </span>
          </div>
          <nav>
            <Link
              to="/dashboard"
              className="flex items-center mb-4 text-purple-400 text-base"
            >
              <span className="mr-2">🏠</span> Dashboard
            </Link>
            <Link
              to="/community-support"
              className="flex items-center mb-4 text-purple-400 text-base"
            >
              <span className="mr-2">💬</span> Support
            </Link>
            <button
              onClick={handleBuyGCoins}
              className="flex items-center mb-4 text-purple-400 text-base"
            >
              <span className="mr-2">💰</span> Buy G_COINS
            </button>
          </nav>
        </div>
      </div>

      <div className="flex-1 p-4 md:p-8">
        <div className="flex justify-between items-center mb-6 md:mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
            <p className={`text-sm md:text-base mt-2 ${gCoinsAnimating ? 'coins-deduct' : ''}`}>
              💰 G_COINS: {gCoins}
            </p>
            <div className="rating-stars mt-2">
              <span className="rating-text">
                AI Rating: {ratingStats.average} ({ratingStats.count} reviews)
              </span>
              <div className="flex items-center ml-2">
                {[1, 2, 3, 4, 5].map(star => (
                  <svg
                    key={star}
                    className={`w-4 h-4 rating-star ${star <= Math.round(ratingStats.average) ? 'filled' : ''}`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
            </div>
          </div>
          <div className="hidden md:block">
            <button
              onClick={handleBuyGCoins}
              disabled={upgradeLoading}
              className={`bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 mr-2 hover-scale ${
                upgradeLoading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {upgradeLoading ? (
                <span className="flex items-center">
                  <svg
                    className="animate-spin h-5 w-5 mr-2 text-white"
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
                  Processing...
                </span>
              ) : (
                'Buy G_COINS'
              )}
            </button>
            <button
              onClick={handleLogout}
              disabled={logoutLoading}
              className={`bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 hover-scale ${
                logoutLoading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {logoutLoading ? (
                <span className="flex items-center">
                  <svg
                    className="animate-spin h-5 w-5 mr-2 text-white"
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
                  Logging out...
                </span>
              ) : (
                'Logout'
              )}
            </button>
          </div>
        </div>

        {showAdNotice && isGhanaianUser && (
          <div
            ref={bundleEventRef}
            className={`bg-gray-800 p-4 rounded-lg mb-6 ad-notice-enter ${
              tutorialStep === 5 ? 'ring-4 ring-purple-500' : ''
            }`}
          >
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-semibold">Limited-Time Offer!</h2>
                <p className="text-gray-300">
                  Get our Educational Bundles for All Networks Starting from {currency.symbol}
                  {(4 * currency.rate).toFixed(2)} {currency.code}. Offer ends in{' '}
                  <span className="text-purple-400">{countdown}</span>.
                </p>
              </div>
              <button
                onClick={handleBuyBundle}
                className="bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 hover-scale"
              >
                Buy Now
              </button>
            </div>
          </div>
        )}

        <div
          ref={uploadSectionRef}
          className={`mb-6 md:mb-8 ${tutorialStep === 2 ? 'ring-4 ring-purple-500' : ''}`}
        >
          <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">Upload Content</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              onClick={handleAudioClick}
              disabled={audioLoading}
              className={`bg-gray-800 p-4 rounded-lg flex items-center justify-between hover:bg-gray-700 hover-scale ${
                audioLoading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {audioLoading ? (
                <span className="flex items-center">
                  <svg
                    className="animate-spin h-5 w-5 mr-2 text-white"
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
                  Processing...
                </span>
              ) : (
                <>
                  <span>Upload Audio</span>
                  <span>🎙️</span>
                </>
              )}
            </button>
            <button
              onClick={handleYoutubeClick}
              disabled={youtubeLoading}
              className={`bg-gray-800 p-4 rounded-lg flex items-center justify-between hover:bg-gray-700 hover-scale ${
                youtubeLoading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {youtubeLoading ? (
                <span className="flex items-center">
                  <svg
                    className="animate-spin h-5 w-5 mr-2 text-white"
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
                  Processing...
                </span>
              ) : (
                <>
                  <span>Upload Video</span>
                  <span>🎥</span>
                </>
              )}
            </button>
            <button
              onClick={handleDocumentClick}
              disabled={documentLoading}
              className={`bg-gray-800 p-4 rounded-lg flex items-center justify-between hover:bg-gray-700 hover-scale ${
                documentLoading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {documentLoading ? (
                <span className="flex items-center">
                  <svg
                    className="animate-spin h-5 w-5 mr-2 text-white"
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
                  Processing...
                </span>
              ) : (
                <>
                  <span>Upload Document</span>
                  <span>📄</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div
          ref={folderInputRef}
          className={`mb-6 md:mb-8 ${tutorialStep === 3 ? 'ring-4 ring-purple-500' : ''}`}
        >
          <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">Create New Folder</h2>
          <div className="flex items-center">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Enter folder name"
              className="flex-1 p-2 bg-gray-700 text-white rounded-l-lg focus:outline-none"
              disabled={createFolderLoading}
            />
            <button
              ref={createButtonRef}
              onClick={handleCreateFolder}
              disabled={createFolderLoading}
              className={`bg-purple-600 text-white py-2 px-4 rounded-r-lg hover:bg-purple-700 hover-scale ${
                createFolderLoading ? 'opacity-50 cursor-not-allowed' : ''
              } ${tutorialStep === 4 ? 'pulse-glow' : ''}`}
            >
              {createFolderLoading ? (
                <span className="flex items-center">
                  <svg
                    className="animate-spin h-5 w-5 mr-2 text-white"
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
                  Creating...
                </span>
              ) : (
                'Create'
              )}
            </button>
          </div>
        </div>

        <div
          ref={foldersSectionRef}
          className={`mb-6 md:mb-8 ${tutorialStep === 6 ? 'ring-4 ring-purple-500' : ''}`}
        >
          <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">Your Folders</h2>
          {foldersLoading ? (
            <div className="flex items-center justify-center">
              <svg
                className="animate-spin h-5 w-5 mr-3 text-white"
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
              Loading folders...
            </div>
          ) : folders.length === 0 ? (
            <p className="text-gray-400">No folders found. Create a new folder to get started!</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  className="bg-gray-800 p-4 rounded-lg relative hover-scale"
                >
                  <div className="flex justify-between items-center">
                    {editFolderId === folder.id ? (
                      <div className="flex-1 flex items-center">
                        <input
                          type="text"
                          value={editFolderName}
                          onChange={(e) => setEditFolderName(e.target.value)}
                          className="flex-1 p-2 bg-gray-700 text-white rounded-l-lg focus:outline-none"
                          disabled={editLoading}
                        />
                        <button
                          onClick={() => handleEditFolder(folder.id)}
                          disabled={editLoading}
                          className={`bg-purple-600 text-white py-2 px-4 rounded-r-lg hover:bg-purple-700 hover-scale ${
                            editLoading ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        >
                          {editLoading ? (
                            <span className="flex items-center">
                              <svg
                                className="animate-spin h-5 w-5 mr-2 text-white"
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
                              Saving...
                            </span>
                          ) : (
                            'Save'
                          )}
                        </button>
                      </div>
                    ) : (
                      <>
                        <Link
                          to={`/folder/${folder.id}`}
                          className="text-lg font-semibold hover:text-purple-400 flex-1"
                        >
                          {folder.name}
                        </Link>
                        <button
                          onClick={() => {
                            toggleDropdown(folder.id);
                            setEditFolderName(folder.name);
                          }}
                          className="text-gray-400 hover:text-white"
                        >
                          ⋮
                        </button>
                      </>
                    )}
                  </div>
                  {dropdownOpen === folder.id && (
                    <div className="absolute right-0 mt-2 w-48 bg-gray-700 rounded-lg shadow-lg z-10">
                      <button
                        onClick={() => {
                          setEditFolderId(folder.id);
                          setDropdownOpen(null);
                        }}
                        className="block w-full text-left px-4 py-2 text-white hover:bg-gray-600"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteFolder(folder.id)}
                        disabled={deleteLoading}
                        className={`block w-full text-left px-4 py-2 text-white hover:bg-gray-600 ${
                          deleteLoading ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        {deleteLoading ? (
                          <span className="flex items-center">
                            <svg
                              className="animate-spin h-5 w-5 mr-2 text-white"
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
                            Deleting...
                          </span>
                        ) : (
                          'Delete'
                        )}
                      </button>
                    </div>
                  )}
                  <p className="text-gray-400 text-sm mt-2">
                    Created: {folder.createdAt}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div
        className={`md:hidden bottom-nav bg-gray-800 p-4 flex justify-around items-center bottom-nav-enter`}
      >
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
          to="/community-support"
          className="text-purple-400 bottom-nav-icon"
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
        <button
          onClick={handleBuyGCoins}
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
        </button>
        <button
          onClick={handleLogout}
          disabled={logoutLoading}
          className={`text-purple-400 bottom-nav-icon ${logoutLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
          title="Logout"
        >
          {logoutLoading ? (
            <svg
              className="animate-spin h-6 w-6 text-white"
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
          ) : (
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
          )}
        </button>
      </div>
    </div>
  );
}

export default Dashboard;