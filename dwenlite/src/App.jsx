import { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { guess } from 'web-audio-beat-detector';
import Welcome from './pages/Welcome';
import Login from './pages/Login';
import Signup from './pages/Signup';
import VerifyEmail from './pages/VerifyEmail';
import Notes from './pages/Notes';
import Quizzes from './pages/Quizzes';
import Flashcards from './pages/Flashcards';
import Dashboard from './pages/Dashboard';
import ViewFolder from './pages/ViewFolder';
import SupportMe from './pages/SupportMe';
import Terms from './pages/Terms';
import ResetPassword from './pages/ResetPassword';
import ErrorBoundary from './ErrorBoundary';
import { Toaster } from 'react-hot-toast';
import Support from './pages/Support';
import Podcast from './pages/Podcast';
import DeleteAccount from './pages/DeleteAccount';
import DwenLiteDownload from './pages/DwenLiteDownload';
import Maintenance from './pages/Maintenance';
import ExamsPreparation from './pages/ExamsPreparation';
import BuyCoins from './pages/BuyCoins';
import DwenliteHelpdesk from './pages/DwenliteHelpdesk';
import CommunitySupport from './pages/CommunitySupport';
import Bundles from './pages/Bundles';
import Reports from './pages/Reports';

const isMaintenanceWindow = () => {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  const isMaintenance = day === 6 && hour >= 12 && hour < 15;
  console.log(`Maintenance check: Day=${day}, Hour=${hour}, IsMaintenance=${isMaintenance}`);
  return isMaintenance;
};

const MaintenanceRoute = ({ component: Component, setShowBanPopup, isAuthenticated, isAccountDisabled, ...rest }) => {
  if (isAuthenticated && isAccountDisabled) {
    console.log('Redirecting to login due to disabled account');
    return <Navigate to="/login" replace state={{ reason: 'account_disabled' }} />;
  }
  return isMaintenanceWindow() ? <Maintenance /> : <Component {...rest} setShowBanPopup={setShowBanPopup} />;
};

function BanPopup({ isOpen, onClose }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full text-center">
        <h2 className="text-xl font-bold text-gray-800 mb-4">Account Banned</h2>
        <p className="text-gray-600 mb-6">
          This account has been banned for inappropriate behavior. If you think this is a mistake, please appeal by sending an email to{' '}
          <a href="mailto:info@dwenlite.space" className="text-purple-600 hover:underline">
            info@dwenlite.space
          </a>.
        </p>
        <button
          onClick={onClose}
          className="bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 transition"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">404 - Page Not Found</h1>
        <p className="text-gray-400 mb-6">The page you're looking for doesn't exist.</p>
        <a
          href="/dashboard"
          className="bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700"
        >
          Go to Dashboard
        </a>
      </div>
    </div>
  );
}

function App() {
  const [showBanPopup, setShowBanPopup] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAccountDisabled, setIsAccountDisabled] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [bpm, setBpm] = useState(120); // Default BPM
  const [position, setPosition] = useState({ x: window.innerWidth - 80, y: window.innerHeight - 80 }); // Initial position (bottom-right)
  const [isDragging, setIsDragging] = useState(false);
  const audioRef = useRef(null);
  const audioContextRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    const fetchUserStatus = async () => {
      try {
        const authToken = localStorage.getItem('authToken');
        if (authToken) {
          setIsAuthenticated(true);
          console.log('User is authenticated');
          try {
            const userResponse = await fetch('https://api.dwenlite.space/user/status', {
              headers: { Authorization: `Bearer ${authToken}` },
            });
            if (!userResponse.ok) {
              throw new Error('User status API failed');
            }
            const userData = await userResponse.json();
            console.log('User status:', userData);
            if (userData.isDisabled) {
              console.log('Account is disabled, logging out');
              setIsAccountDisabled(true);
              setShowBanPopup(true);
              localStorage.removeItem('authToken');
              setIsAuthenticated(false);
            } else {
              setIsAccountDisabled(false);
            }
          } catch (userError) {
            console.error('Error fetching user status:', userError);
            localStorage.removeItem('authToken');
            setIsAuthenticated(false);
            setIsAccountDisabled(false);
          }
        } else {
          console.log('No auth token found');
          setIsAuthenticated(false);
          setIsAccountDisabled(false);
        }
      } catch (error) {
        console.error('Error in user status fetch:', error);
        setIsAuthenticated(false);
        setIsAccountDisabled(false);
      }
    };

    const loadAndAnalyzeAudio = async () => {
      try {
        setIsAudioLoading(true);
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        const response = await fetch('/music.m4a');
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
        const { bpm } = await guess(audioBuffer);
        setBpm(bpm || 120); // Fallback to 120 BPM if detection fails
        console.log(`Detected BPM: ${bpm}`);
      } catch (error) {
        console.error('Error analyzing audio:', error);
        setBpm(120); // Fallback BPM
      } finally {
        setIsAudioLoading(false);
      }
    };

    fetchUserStatus();
    loadAndAnalyzeAudio();

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close().catch((error) => console.error('Error closing AudioContext:', error));
      }
    };
  }, []);

  const toggleAudio = () => {
    if (audioRef.current) {
      if (isAudioPlaying) {
        audioRef.current.pause();
        setIsAudioPlaying(false);
      } else {
        setIsAudioLoading(true);
        audioRef.current.play()
          .then(() => {
            setIsAudioPlaying(true);
            setIsAudioLoading(false);
          })
          .catch((error) => {
            console.error('Error playing audio:', error);
            setIsAudioLoading(false);
          });
      }
    }
  };

  const handleDragStart = (e) => {
    if (!isAudioLoading) {
      setIsDragging(true);
      e.preventDefault(); // Prevent default behavior like text selection
    }
  };

  const handleDragMove = (e) => {
    if (isDragging) {
      if (e.type === 'touchmove') {
        e.preventDefault(); // Prevent page scrolling
      }

      const buttonSize = 64; // Approximate size of the button (including padding)
      let clientX, clientY;

      if (e.type === 'touchmove') {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      const newX = Math.max(0, Math.min(clientX - buttonSize / 2, window.innerWidth - buttonSize));
      const newY = Math.max(0, Math.min(clientY - buttonSize / 2, window.innerHeight - buttonSize));
      setPosition({ x: newX, y: newY });
    }
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
      window.addEventListener('touchmove', handleDragMove, { passive: false });
      window.addEventListener('touchend', handleDragEnd);
    } else {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchmove', handleDragMove);
      window.removeEventListener('touchend', handleDragEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchmove', handleDragMove);
      window.removeEventListener('touchend', handleDragEnd);
    };
  }, [isDragging]);

  // Calculate animation duration based on BPM (seconds per beat)
  const beatDuration = 60 / bpm;

  return (
    <ErrorBoundary>
      <Router>
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        <BanPopup isOpen={showBanPopup} onClose={() => setShowBanPopup(false)} />
        <audio ref={audioRef} src="/music.m4a" loop />
        <div
          className={`fixed z-50 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          style={{ left: `${position.x}px`, top: `${position.y}px` }}
          ref={dragRef}
        >
          <button
            onClick={toggleAudio}
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
            className={`relative bg-gradient-to-r from-blue-400 via-purple-500 to-blue-600 text-white p-4 rounded-full hover:from-blue-500 hover:via-purple-600 hover:to-blue-700 transition-all duration-300 shadow-lg animate-float ${
              isAudioPlaying ? 'animate-pulse-sync' : ''
            } ${isAudioLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
            style={{
              backgroundSize: '200% 200%',
              animation: `gradientMove 5s ease infinite${isAudioPlaying ? `, pulseSync ${beatDuration}s ease-in-out infinite` : ''}`,
            }}
            aria-label={isAudioPlaying ? 'Pause Background Music' : 'Play Background Music'}
            disabled={isAudioLoading}
            role="button"
          >
            <span className="absolute inset-0 rounded-full bg-blue-300 opacity-20 animate-ripple"></span>
            {isAudioLoading ? (
              <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : isAudioPlaying ? (
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <rect x="6" y="4" width="4" height="16" rx="1"></rect>
                <rect x="14" y="4" width="4" height="16" rx="1"></rect>
              </svg>
            ) : (
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            )}
          </button>
        </div>
        <style jsx>{`
          @keyframes float {
            0%, 100% {
              transform: translateY(0) rotate(0deg);
            }
            50% {
              transform: translateY(-12px) rotate(2deg);
            }
          }
          @keyframes ripple {
            0% {
              transform: scale(1);
              opacity: 0.3;
            }
            100% {
              transform: scale(1.8);
              opacity: 0;
            }
          }
          @keyframes gradientMove {
            0% {
              background-position: 0% 50%;
            }
            50% {
              background-position: 100% 50%;
            }
            100% {
              background-position: 0% 50%;
            }
          }
          @keyframes pulseSync {
            0%, 100% {
              transform: scale(1) rotate(0deg);
              box-shadow: 0 0 15px rgba(59, 130, 246, 0.5), 0 0 30px rgba(147, 51, 234, 0.3);
            }
            50% {
              transform: scale(1.2) rotate(3deg);
              box-shadow: 0 0 25px rgba(59, 130, 246, 0.8), 0 0 40px rgba(147, 51, 234, 0.5);
            }
          }
          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
          .animate-float {
            animation: float 3.5s ease-in-out infinite;
          }
          .animate-ripple {
            animation: ripple 2.5s ease-out infinite;
          }
          .animate-pulse-sync {
            animation: pulseSync ${beatDuration}s ease-in-out infinite;
          }
          .animate-spin {
            animation: spin 1s linear infinite;
          }
        `}</style>
        <style jsx global>{`
          html, body {
            margin: 0;
            padding: 0;
            height: 100%;
            width: 100%;
            background-color: #1f2937;
            overscroll-behavior: none;
          }
          #root {
            min-height: 100vh;
            background-color: #1f2937;
          }
        `}</style>
        <Routes>
          <Route path="/" element={<MaintenanceRoute component={Welcome} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/login" element={<MaintenanceRoute component={Login} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/signup" element={<MaintenanceRoute component={Signup} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/verify-email" element={<MaintenanceRoute component={VerifyEmail} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/dashboard" element={<MaintenanceRoute component={Dashboard} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/folder/:folderId" element={<MaintenanceRoute component={ViewFolder} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/folder/:folderId/notes" element={<MaintenanceRoute component={Notes} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/folder/:folderId/quizzes" element={<MaintenanceRoute component={Quizzes} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/folder/:folderId/flashcards" element={<MaintenanceRoute component={Flashcards} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/folder/:folderId/podcast" element={<MaintenanceRoute component={Podcast} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/delete-account" element={<MaintenanceRoute component={DeleteAccount} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/support-me" element={<MaintenanceRoute component={SupportMe} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/dwenlite-download" element={<MaintenanceRoute component={DwenLiteDownload} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/terms" element={<MaintenanceRoute component={Terms} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/reset-password" element={<MaintenanceRoute component={ResetPassword} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/support" element={<MaintenanceRoute component={Support} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/buy-coins" element={<MaintenanceRoute component={BuyCoins} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/buy-bundles" element={<MaintenanceRoute component={Bundles} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/community-support" element={<MaintenanceRoute component={CommunitySupport} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/dwenlite-helpdesk" element={<MaintenanceRoute component={DwenliteHelpdesk} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/exams-preparation" element={<MaintenanceRoute component={ExamsPreparation} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/reports" element={<MaintenanceRoute component={Reports} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/maintenance" element={<Maintenance />} />
          <Route path="*" element={isMaintenanceWindow() ? <Maintenance /> : <NotFound />} />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}

export default App;