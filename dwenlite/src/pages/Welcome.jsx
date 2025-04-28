import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import welcomeVideo from '../videos/welcome.mp4'; // Adjust the path if needed

function Welcome() {
  const navigate = useNavigate();
  const [startLoading, setStartLoading] = useState(false);
  const [signInLoading, setSignInLoading] = useState(false);

  const handleStartClick = (e) => {
    e.preventDefault();
    setStartLoading(true);
    setTimeout(() => {
      setStartLoading(false);
      navigate('/signup');
    }, 3000); // 3-second delay
  };

  const handleSignInClick = (e) => {
    e.preventDefault();
    setSignInLoading(true);
    setTimeout(() => {
      setSignInLoading(false);
      navigate('/login');
    }, 3000); // 3-second delay
  };

  return (
    <div className="relative min-h-screen flex flex-col">
      {/* Background Video */}
      <video
        autoPlay
        muted
        loop
        playsInline
        className="absolute top-0 left-0 w-full h-full object-cover z-0"
      >
        <source src={welcomeVideo} type="video/mp4" />
        Your browser does not support the video tag.
      </video>

      {/* Overlay to improve text readability */}
      <div className="absolute top-0 left-0 w-full h-full bg-black/60 z-10"></div>

      {/* Main Content */}
      <div className="relative container mx-auto px-4 sm:px-6 py-12 sm:py-16 text-center flex-grow z-20">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-white mb-4 drop-shadow-[0_0_10px_rgba(147,51,234,0.5)]">
          DwenLite{' '}
          <span className="text-purple-400 bg-purple-950/50 px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm align-middle">
            Beta
          </span>
        </h1>
        <p className="text-lg sm:text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
          Transform your study materials into notes, quizzes, and flashcards with AI. We're in beta—join us to shape the future of learning!
        </p>
        <div className="flex flex-col sm:flex-row justify-center space-y-4 sm:space-y-0 sm:space-x-4 mb-12">
          <Link
            to="/signup"
            onClick={handleStartClick}
            className={`bg-purple-600 text-white px-6 py-3 sm:px-8 sm:py-3 rounded-full transition-all hover:bg-purple-500 text-base sm:text-lg ${startLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {startLoading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin h-5 w-5 mr-2 text-white" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Loading...
              </span>
            ) : (
              'Start for Free'
            )}
          </Link>
          <Link
            to="/login"
            onClick={handleSignInClick}
            className={`bg-cyan-500 text-white px-6 py-3 sm:px-8 sm:py-3 rounded-full transition-all hover:bg-cyan-400 text-base sm:text-lg ${signInLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {signInLoading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin h-5 w-5 mr-2 text-white" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Loading...
              </span>
            ) : (
              'Sign In'
            )}
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 max-w-3xl mx-auto">
          <div className="bg-indigo-800/50 p-4 sm:p-6 rounded-lg shadow-lg border border-purple-500/30">
            <h3 className="text-base sm:text-lg font-semibold text-white mb-2">Upload a Document</h3>
            <p className="text-gray-400 text-sm sm:text-base">.pdf, .docx, pptx, .txt</p>
          </div>
          <div className="bg-indigo-800/50 p-4 sm:p-6 rounded-lg shadow-lg border border-purple-500/30">
            <h3 className="text-base sm:text-lg font-semibold text-white mb-2">Upload A Video</h3>
            <p className="text-gray-400 text-sm sm:text-base">.mp4, .mov, .avi, .mkv, .webm</p>
          </div>
          <div className="bg-indigo-800/50 p-4 sm:p-6 rounded-lg shadow-lg border border-purple-500/30">
            <h3 className="text-base sm:text-lg font-semibold text-white mb-2">Upload An Audio</h3>
            <p className="text-gray-400 text-sm sm:text-base">.mp3, .wav, .m4a, .ogg, .flac</p>
          </div>
        </div>
      </div>
      <footer className="relative text-center py-4 text-gray-400 text-sm sm:text-base z-20">
        <p>Made With ❤️ By Samuel Bempah • DwenLite © 2025</p>
      </footer>
    </div>
  );
}

export default Welcome;