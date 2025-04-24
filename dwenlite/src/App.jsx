import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Welcome from './pages/Welcome';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Notes from './pages/Notes';
import Quizzes from './pages/Quizzes';
import Flashcards from './pages/Flashcards';
import Dashboard from './pages/Dashboard';
import ViewFolder from './pages/ViewFolder';
import SupportMe from './pages/SupportMe';
import Legal from './pages/Legal';
import ResetPassword from './pages/ResetPassword'; // Add this import
import ErrorBoundary from './ErrorBoundary';
import { Toaster } from 'react-hot-toast';

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        <Routes>
          <Route path="/" element={<Welcome />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/folder/:folderId" element={<ViewFolder />} />
          <Route path="/folder/:folderId/notes" element={<Notes />} />
          <Route path="/folder/:folderId/quizzes" element={<Quizzes />} />
          <Route path="/folder/:folderId/flashcards" element={<Flashcards />} />
          <Route path="/support-me" element={<SupportMe />} />
          <Route path="/legal" element={<Legal />} />
          <Route path="/reset-password" element={<ResetPassword />} /> {/* Add this route */}
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}

export default App;