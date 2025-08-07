import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
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
  return day === 6 && hour >= 12 && hour < 15;
};

const MaintenanceRoute = ({ component: Component, isGhana, ...rest }) => {
  if (!isGhana) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Region Not Supported</h1>
          <p className="text-gray-400 mb-6">
            This application is currently available only in Ghana. We're working hard to scale globally soon!
          </p>
          <a
            href="https://sbmindtechnologies.com"
            className="bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700"
          >
            Visit Our Website
          </a>
        </div>
      </div>
    );
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
  const [isGhana, setIsGhana] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLocation = async () => {
      try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        setIsGhana(data.country_name === 'Ghana');
      } catch (error) {
        console.error('Error fetching location:', error);
        setIsGhana(false); // Default to restricted access on error
      } finally {
        setLoading(false);
      }
    };
    fetchLocation();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p>Hey There...</p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Router>
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        <Routes>
          <Route path="/" element={<MaintenanceRoute component={Welcome} isGhana={isGhana} />} />
          <Route path="/login" element={<MaintenanceRoute component={Login} isGhana={isGhana} />} />
          <Route path="/signup" element={<MaintenanceRoute component={Signup} isGhana={isGhana} />} />
          <Route path="/verify-email" element={<MaintenanceRoute component={VerifyEmail} isGhana={isGhana} />} />
          <Route path="/dashboard" element={<MaintenanceRoute component={Dashboard} isGhana={isGhana} />} />
          <Route path="/folder/:folderId" element={<MaintenanceRoute component={ViewFolder} isGhana={isGhana} />} />
          <Route path="/folder/:folderId/notes" element={<MaintenanceRoute component={Notes} isGhana={isGhana} />} />
          <Route path="/folder/:folderId/quizzes" element={<MaintenanceRoute component={Quizzes} isGhana={isGhana} />} />
          <Route path="/folder/:folderId/flashcards" element={<MaintenanceRoute component={Flashcards} isGhana={isGhana} />} />
          <Route path="/folder/:folderId/podcast" element={<MaintenanceRoute component={Podcast} isGhana={isGhana} />} />
          <Route path="/delete-account" element={<MaintenanceRoute component={DeleteAccount} isGhana={isGhana} />} />
          <Route path="/support-me" element={<MaintenanceRoute component={SupportMe} isGhana={isGhana} />} />
          <Route path="/dwenlite-download" element={<MaintenanceRoute component={DwenLiteDownload} isGhana={isGhana} />} />
          <Route path="/terms" element={<MaintenanceRoute component={Terms} isGhana={isGhana} />} />
          <Route path="/reset-password" element={<MaintenanceRoute component={ResetPassword} isGhana={isGhana} />} />
          <Route path="/support" element={<MaintenanceRoute component={Support} isGhana={isGhana} />} />
          <Route path="/buy-coins" element={<MaintenanceRoute component={BuyCoins} isGhana={isGhana} />} />
          <Route path="/buy-bundles" element={<MaintenanceRoute component={Bundles} isGhana={isGhana} />} />
          <Route path="/community-support" element={<MaintenanceRoute component={CommunitySupport} isGhana={isGhana} />} />
          <Route path="/dwenlite-helpdesk" element={<MaintenanceRoute component={DwenliteHelpdesk} isGhana={isGhana} />} />
          <Route path="/exams-preparation" element={<MaintenanceRoute component={ExamsPreparation} isGhana={isGhana} />} />
          <Route path="/reports" element={<MaintenanceRoute component={Reports} isGhana={isGhana} />} />
          <Route path="/maintenance" element={<Maintenance />} />
          <Route path="*" element={isMaintenanceWindow() ? <Maintenance /> : <NotFound />} />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}

export default App;