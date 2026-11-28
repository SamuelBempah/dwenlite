import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Welcome from './pages/Welcome';
import Login from './pages/Login';
import Signup from './pages/Signup';
import VerifyEmail from './pages/VerifyEmail';
import Notes from './pages/Notes';
import Quizzes from './pages/Quizzes';
import Flashcards from './pages/Flashcards';
import Dashboard from './pages/Dashboard';
import ViewFolder from './pages/ViewFolder';
import Terms from './pages/Terms';
import ResetPassword from './pages/ResetPassword';
import ErrorBoundary from './ErrorBoundary';
import { Toaster } from 'react-hot-toast';
import Support from './pages/Support';
import Podcast from './pages/Podcast';
import DeleteAccount from './pages/DeleteAccount';
import DwenLiteDownload from './pages/DwenLiteDownload';
import ExamsPreparation from './pages/ExamsPreparation';
import BuyCoins from './pages/BuyCoins';
import DwenliteHelpdesk from './pages/DwenliteHelpdesk';
import CommunitySupport from './pages/CommunitySupport';
import Bundles from './pages/Bundles';
import Reports from './pages/Reports';
import AITeacher from './pages/AITeacher';
import AdminUsage from './pages/AdminUsage';
import DwenliteHome from './pages/DwenliteHome';

import AppLayout from './components/layout/AppLayout';
import PwaInstallPrompt from './components/PwaInstallPrompt';
import ReleaseNotesModal from './components/ReleaseNotesModal';
import PwaUpdater from './components/PwaUpdater';
import UploadTray from './components/UploadTray';

const GuardedRoute = ({ component: Component, setShowBanPopup, isAuthenticated, isAccountDisabled, ...rest }) => {
  const location = useLocation();
  const hasVisitedAI = sessionStorage.getItem('aiTeacherVisited');

  if (isAuthenticated && isAccountDisabled) {
    console.log('Redirecting to login due to disabled account');
    return <Navigate to="/login" replace state={{ reason: 'account_disabled' }} />;
  }

  const publicRoutes = ['/', '/login', '/signup', '/verify-email', '/reset-password', '/terms', '/ai-teacher', '/dwenlite-download'];
  
  if (!hasVisitedAI && !publicRoutes.includes(location.pathname)) {
    console.log('Redirecting to AI Teacher (mandatory first stop)');
    return <Navigate to="/ai-teacher" replace />;
  }

  if (publicRoutes.includes(location.pathname)) {
    return <Component {...rest} setShowBanPopup={setShowBanPopup} />;
  }

  return (
    <AppLayout>
      <Component {...rest} setShowBanPopup={setShowBanPopup} />
    </AppLayout>
  );
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

function AppContent() {
  const [showBanPopup, setShowBanPopup] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAccountDisabled, setIsAccountDisabled] = useState(false);
  const location = useLocation();

  useEffect(() => {
    // Dynamic theme color based on page for PWA
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      if (location.pathname === '/') {
        metaThemeColor.setAttribute('content', '#09090b'); // Welcome page color
      } else {
        metaThemeColor.setAttribute('content', '#1f2937'); // Main app layout color
      }
    }
  }, [location.pathname]);

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

    fetchUserStatus();
  }, []);

  return (
    <>
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      <BanPopup isOpen={showBanPopup} onClose={() => setShowBanPopup(false)} />
      <PwaUpdater />
      <UploadTray />
      <PwaInstallPrompt />
      <ReleaseNotesModal />
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
        <Route path="/" element={<GuardedRoute component={Welcome} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
        <Route path="/login" element={<GuardedRoute component={Login} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
        <Route path="/signup" element={<GuardedRoute component={Signup} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
        <Route path="/verify-email" element={<GuardedRoute component={VerifyEmail} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
        <Route path="/dashboard" element={<GuardedRoute component={Dashboard} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
        <Route path="/folder/:folderId" element={<GuardedRoute component={ViewFolder} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
        <Route path="/folder/:folderId/notes" element={<GuardedRoute component={Notes} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
        <Route path="/folder/:folderId/quizzes" element={<GuardedRoute component={Quizzes} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
        <Route path="/folder/:folderId/flashcards" element={<GuardedRoute component={Flashcards} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
        <Route path="/folder/:folderId/podcast" element={<GuardedRoute component={Podcast} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
        <Route path="/delete-account" element={<GuardedRoute component={DeleteAccount} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
        <Route path="/dwenlite-download" element={<GuardedRoute component={DwenLiteDownload} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
        <Route path="/terms" element={<GuardedRoute component={Terms} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
        <Route path="/reset-password" element={<GuardedRoute component={ResetPassword} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
        <Route path="/support" element={<GuardedRoute component={Support} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
        <Route path="/buy-coins" element={<GuardedRoute component={BuyCoins} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
        <Route path="/buy-bundles" element={<GuardedRoute component={Bundles} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
        <Route path="/community-support" element={<GuardedRoute component={CommunitySupport} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
        <Route path="/dwenlite-helpdesk" element={<GuardedRoute component={DwenliteHelpdesk} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
        <Route path="/exams-preparation" element={<GuardedRoute component={ExamsPreparation} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
        <Route path="/reports" element={<GuardedRoute component={Reports} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
        <Route path="/ai-teacher" element={<GuardedRoute component={AITeacher} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
        <Route path="/dwenlite-home" element={<GuardedRoute component={DwenliteHome} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
        <Route path="/admin-usage" element={<GuardedRoute component={AdminUsage} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <AppContent />
      </Router>
    </ErrorBoundary>
  );
}

export default App;