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

const isMaintenanceWindow = () => {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  return day === 6 && hour >= 12 && hour < 15;
};

const MaintenanceRoute = ({ component: Component, ...rest }) => {
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
  return (
    <ErrorBoundary>
      <Router>
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        <Routes>
          <Route path="/" element={<MaintenanceRoute component={Welcome} />} />
          <Route path="/login" element={<MaintenanceRoute component={Login} />} />
          <Route path="/signup" element={<MaintenanceRoute component={Signup} />} />
          <Route path="/verify-email" element={<MaintenanceRoute component={VerifyEmail} />} />
          <Route path="/dashboard" element={<MaintenanceRoute component={Dashboard} />} />
          <Route path="/folder/:folderId" element={<MaintenanceRoute component={ViewFolder} />} />
          <Route path="/folder/:folderId/notes" element={<MaintenanceRoute component={Notes} />} />
          <Route path="/folder/:folderId/quizzes" element={<MaintenanceRoute component={Quizzes} />} />
          <Route path="/folder/:folderId/flashcards" element={<MaintenanceRoute component={Flashcards} />} />
          <Route path="/folder/:folderId/podcast" element={<MaintenanceRoute component={Podcast} />} />
          <Route path="/delete-account" element={<MaintenanceRoute component={DeleteAccount} />} />
          <Route path="/support-me" element={<MaintenanceRoute component={SupportMe} />} />
          <Route path="/dwenlite-download" element={<MaintenanceRoute component={DwenLiteDownload} />} />
          <Route path="/terms" element={<MaintenanceRoute component={Terms} />} />
          <Route path="/reset-password" element={<MaintenanceRoute component={ResetPassword} />} />
          <Route path="/support" element={<MaintenanceRoute component={Support} />} />
          <Route path="/exams-preparation" element={<MaintenanceRoute component={ExamsPreparation} />} />
          <Route path="/maintenance" element={<Maintenance />} />
          <Route path="*" element={isMaintenanceWindow() ? <Maintenance /> : <NotFound />} />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}

export default App;