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

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        <Routes>
          <Route path="/" element={<Welcome />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/folder/:folderId" element={<ViewFolder />} />
          <Route path="/folder/:folderId/notes" element={<Notes />} />
          <Route path="/folder/:folderId/quizzes" element={<Quizzes />} />
          <Route path="/folder/:folderId/flashcards" element={<Flashcards />} />
          <Route path="/folder/:folderId/podcast" element={<Podcast />} />
          <Route path="/support-me" element={<SupportMe />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/support" element={<Support />} />
          <Route path="*" element={<Navigate to="/404.html" replace />} />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}

export default App;