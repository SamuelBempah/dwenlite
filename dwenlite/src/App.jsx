import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
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
import AdBlockDetected from './pages/AdBlockDetected';

const isMaintenanceWindow = () => {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  return day === 6 && hour >= 12 && hour < 15;
};

const MaintenanceRoute = ({ component: Component, isAdBlockDetected, ...rest }) => {
  if (isAdBlockDetected) {
    return <AdBlockDetected />;
  }
  return isMaintenanceWindow() ? <Maintenance /> : <Component {...rest} />;
};

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

function AdNotice({ onClose }) {
  return (
    <div className="fixed top-0 left-0 right-0 bg-purple-600 text-white px-4 py-3 flex flex-col sm:flex-row justify-between items-center gap-2 sm:gap-4 animate-slide-in z-50">
      <div className="flex-1 text-center text-xs sm:text-sm">
        <p>
          Are the ads annoying? We know that, but we need to make our money somehow. Prefer an ad-free experience? Download our Windows desktop version!
        </p>
      </div>
      <div className="flex items-center justify-center gap-2 sm:gap-4">
        <Link
          to="/dwenlite-download"
          className="bg-white text-purple-600 py-1 px-2 sm:px-3 sm:py-1.5 text-xs sm:text-sm rounded-lg hover:bg-gray-200"
        >
          Download Now
        </Link>
        <button
          onClick={onClose}
          className="text-white hover:text-gray-200 focus:outline-none"
        >
          <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function App() {
  const [isAdBlockDetected, setIsAdBlockDetected] = useState(false);
  const [showNotice, setShowNotice] = useState(true);
  const [isNativefier, setIsNativefier] = useState(false);

  useEffect(() => {
    // Detect Nativefier by checking userAgent
    const userAgent = navigator.userAgent.toLowerCase();
    const isNative = userAgent.includes('nativefier');
    setIsNativefier(isNative);
  }, []);

  useEffect(() => {
    const detectAdBlock = async () => {
      try {
        const response = await fetch('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js', {
          method: 'HEAD',
          mode: 'no-cors',
        });
        setIsAdBlockDetected(false);
      } catch (err) {
        setIsAdBlockDetected(true);
      }
    };

    detectAdBlock();
  }, []);

  useEffect(() => {
    if (isAdBlockDetected || isNativefier) return; // Don't show notice if ad blocker or Nativefier is detected

    const showNoticeTimer = setInterval(() => {
      setShowNotice(true);
    }, 5 * 60 * 1000); // Show every 5 minutes

    return () => clearInterval(showNoticeTimer);
  }, [isAdBlockDetected, isNativefier]);

  const handleCloseNotice = () => {
    setShowNotice(false);
  };

  return (
    <ErrorBoundary>
      <Router>
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        {!isAdBlockDetected && !isNativefier && showNotice && <AdNotice onClose={handleCloseNotice} />}
        <Routes>
          <Route path="/" element={<MaintenanceRoute component={Welcome} isAdBlockDetected={isAdBlockDetected} />} />
          <Route path="/login" element={<MaintenanceRoute component={Login} isAdBlockDetected={isAdBlockDetected} />} />
          <Route path="/signup" element={<MaintenanceRoute component={Signup} isAdBlockDetected={isAdBlockDetected} />} />
          <Route path="/verify-email" element={<MaintenanceRoute component={VerifyEmail} isAdBlockDetected={isAdBlockDetected} />} />
          <Route path="/dashboard" element={<MaintenanceRoute component={Dashboard} isAdBlockDetected={isAdBlockDetected} />} />
          <Route path="/folder/:folderId" element={<MaintenanceRoute component={ViewFolder} isAdBlockDetected={isAdBlockDetected} />} />
          <Route path="/folder/:folderId/notes" element={<MaintenanceRoute component={Notes} isAdBlockDetected={isAdBlockDetected} />} />
          <Route path="/folder/:folderId/quizzes" element={<MaintenanceRoute component={Quizzes} isAdBlockDetected={isAdBlockDetected} />} />
          <Route path="/folder/:folderId/flashcards" element={<MaintenanceRoute component={Flashcards} isAdBlockDetected={isAdBlockDetected} />} />
          <Route path="/folder/:folderId/podcast" element={<MaintenanceRoute component={Podcast} isAdBlockDetected={isAdBlockDetected} />} />
          <Route path="/delete-account" element={<MaintenanceRoute component={DeleteAccount} isAdBlockDetected={isAdBlockDetected} />} />
          <Route path="/support-me" element={<MaintenanceRoute component={SupportMe} isAdBlockDetected={isAdBlockDetected} />} />
          <Route path="/dwenlite-download" element={<MaintenanceRoute component={DwenLiteDownload} isAdBlockDetected={isAdBlockDetected} />} />
          <Route path="/terms" element={<MaintenanceRoute component={Terms} isAdBlockDetected={isAdBlockDetected} />} />
          <Route path="/reset-password" element={<MaintenanceRoute component={ResetPassword} isAdBlockDetected={isAdBlockDetected} />} />
          <Route path="/support" element={<MaintenanceRoute component={Support} isAdBlockDetected={isAdBlockDetected} />} />
          <Route path="/exams-preparation" element={<MaintenanceRoute component={ExamsPreparation} isAdBlockDetected={isAdBlockDetected} />} />
          <Route path="/maintenance" element={<Maintenance />} />
          <Route
            path="*"
            element={
              isAdBlockDetected ? <AdBlockDetected /> : isMaintenanceWindow() ? <Maintenance /> : <NotFound />
            }
          />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}

export default App;