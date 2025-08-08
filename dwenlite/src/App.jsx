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
  const isMaintenance = day === 6 && hour >= 12 && hour < 15;
  console.log(`Maintenance check: Day=${day}, Hour=${hour}, IsMaintenance=${isMaintenance}`);
  return isMaintenance;
};

const MaintenanceRoute = ({ component: Component, isGhana, setShowBanPopup, isAuthenticated, isAccountDisabled, ...rest }) => {
  if (!isGhana) {
    console.log('Showing Region Not Supported page');
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
          <a
            href="mailto:info@dwenlite.space"
            className="text-purple-600 hover:underline"
          >
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
  const [isGhana, setIsGhana] = useState(true); // Default to true to avoid false positives
  const [showBanPopup, setShowBanPopup] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAccountDisabled, setIsAccountDisabled] = useState(false);

  useEffect(() => {
    const fetchLocationAndUserStatus = async () => {
      try {
        // Try primary geolocation API
        let locationData = null;
        try {
          const locationResponse = await fetch('https://ipapi.co/json/');
          if (!locationResponse.ok) {
            throw new Error(`IP API response status: ${locationResponse.status}`);
          }
          locationData = await locationResponse.json();
          console.log('Primary IP API response:', locationData);
        } catch (primaryError) {
          console.error('Primary IP API failed:', primaryError);
          // Fallback to alternative geolocation API
          const fallbackResponse = await fetch('https://api.ipgeolocation.io/ipgeo?apiKey=your_api_key');
          if (!fallbackResponse.ok) {
            throw new Error(`Fallback API response status: ${fallbackResponse.status}`);
          }
          locationData = await fallbackResponse.json();
          console.log('Fallback IP API response:', locationData);
        }

        // Check country name (case-insensitive)
        const countryName = locationData.country_name || locationData.country;
        const isGhanaDetected = countryName && countryName.toLowerCase() === 'ghana';
        setIsGhana(isGhanaDetected);
        console.log(`Country detected: ${countryName}, isGhana: ${isGhanaDetected}`);

        // Check authentication status
        // Replace with your actual auth check (e.g., Firebase, Auth0, or JWT validation)
        const authToken = localStorage.getItem('authToken');
        if (authToken) {
          setIsAuthenticated(true);
          console.log('User is authenticated');
          // Fetch user account status
          // Replace with your actual API endpoint
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
        console.error('Error in location/user status fetch:', error);
        setIsGhana(true); // Default to allowing access to avoid blocking legitimate users
      }
    };
    fetchLocationAndUserStatus();
  }, []);

  return (
    <ErrorBoundary>
      <Router>
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        <BanPopup isOpen={showBanPopup} onClose={() => setShowBanPopup(false)} />
        <Routes>
          <Route path="/" element={<MaintenanceRoute component={Welcome} isGhana={isGhana} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/login" element={<MaintenanceRoute component={Login} isGhana={isGhana} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/signup" element={<MaintenanceRoute component={Signup} isGhana={isGhana} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/verify-email" element={<MaintenanceRoute component={VerifyEmail} isGhana={isGhana} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/dashboard" element={<MaintenanceRoute component={Dashboard} isGhana={isGhana} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/folder/:folderId" element={<MaintenanceRoute component={ViewFolder} isGhana={isGhana} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/folder/:folderId/notes" element={<MaintenanceRoute component={Notes} isGhana={isGhana} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/folder/:folderId/quizzes" element={<MaintenanceRoute component={Quizzes} isGhana={isGhana} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/folder/:folderId/flashcards" element={<MaintenanceRoute component={Flashcards} isGhana={isGhana} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/folder/:folderId/podcast" element={<MaintenanceRoute component={Podcast} isGhana={isGhana} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />}

/>
          <Route path="/delete-account" element={<MaintenanceRoute component={DeleteAccount} isGhana={isGhana} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/support-me" element={<MaintenanceRoute component={SupportMe} isGhana={isGhana} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/dwenlite-download" element={<MaintenanceRoute component={DwenLiteDownload} isGhana={isGhana} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/terms" element={<MaintenanceRoute component={Terms} isGhana={isGhana} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/reset-password" element={<MaintenanceRoute component={ResetPassword} isGhana={isGhana} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/support" element={<MaintenanceRoute component={Support} isGhana={isGhana} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/buy-coins" element={<MaintenanceRoute component={BuyCoins} isGhana={isGhana} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/buy-bundles" element={<MaintenanceRoute component={Bundles} isGhana={isGhana} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/community-support" element={<MaintenanceRoute component={CommunitySupport} isGhana={isGhana} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/dwenlite-helpdesk" element={<MaintenanceRoute component={DwenliteHelpdesk} isGhana={isGhana} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/exams-preparation" element={<MaintenanceRoute component={ExamsPreparation} isGhana={isGhana} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/reports" element={<MaintenanceRoute component={Reports} isGhana={isGhana} setShowBanPopup={setShowBanPopup} isAuthenticated={isAuthenticated} isAccountDisabled={isAccountDisabled} />} />
          <Route path="/maintenance" element={<Maintenance />} />
          <Route path="*" element={isMaintenanceWindow() ? <Maintenance /> : <NotFound />} />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}

export default App;