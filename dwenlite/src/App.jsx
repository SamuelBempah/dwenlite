import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
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
  const hour = now.getHours();
  return hour >= 22 || hour < 0;
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

function App() {
  const [isAdBlockDetected, setIsAdBlockDetected] = useState(false);
  const location = useLocation();

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
  }, [location]); // Re-run ad block detection on every route change

  return (
    <ErrorBoundary>
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
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
    </ErrorBoundary>
  );
}

export default function AppWrapper() {
  return (
    <Router>
      <App />
    </Router>
  );
}