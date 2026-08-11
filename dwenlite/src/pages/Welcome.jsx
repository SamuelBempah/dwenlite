import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AITeacherBackground from '../components/AITeacherBackground';
import { Mic, Play, FileText, Video, LayoutDashboard } from 'lucide-react';
import { motion } from 'framer-motion';
import logo from '../assets/react.png';
import { auth } from '../firebase';

function Welcome() {
  const navigate = useNavigate();
  const [startLoading, setStartLoading] = useState(false);
  const [signInLoading, setSignInLoading] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => {
      setIsAuthenticated(!!user);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const triggerExitAnimation = (path) => {
    setIsExiting(true);
    setTimeout(() => {
      navigate(path);
    }, 3200);
  };

  const handleStartClick = (e) => {
    e.preventDefault();
    if (isExiting) return;
    setStartLoading(true);
    triggerExitAnimation('/signup');
  };

  const handleSignInClick = (e) => {
    e.preventDefault();
    if (isExiting) return;
    setSignInLoading(true);
    triggerExitAnimation('/login');
  };

  const handleContinueClick = (e) => {
    e.preventDefault();
    if (isExiting) return;
    triggerExitAnimation('/ai-teacher');
  };

  return (
    <div className="relative min-h-[100dvh] flex flex-col bg-[#09090b] overflow-hidden text-white font-sans">
      
      <AITeacherBackground exitAnimation={isExiting} />

      <motion.div 
        className="absolute inset-0 flex flex-col pointer-events-none"
        animate={{ opacity: isExiting ? 0 : 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/10 to-[#09090b]" />

        <div className="relative z-10 flex flex-col items-center pt-16 px-6 pointer-events-auto">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="flex flex-col items-center text-center"
          >
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500/20 to-purple-600/20 rounded-2xl flex items-center justify-center mb-4 shadow-[0_0_40px_rgba(59,130,246,0.3)] border border-white/10 p-2">
              <img src={logo} alt="DwenLite Logo" className="w-full h-full object-contain drop-shadow-[0_0_15px_rgba(96,165,250,0.8)]" />
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-blue-100 to-blue-400 bg-clip-text text-transparent mb-3 drop-shadow-sm">
              DwenLite Teacher
            </h1>
            <p className="text-lg md:text-xl text-gray-400 max-w-md font-medium leading-relaxed">
              Your interactive AI teacher. Let's learn together through engaging, real-time conversations.
            </p>
          </motion.div>
        </div>

        <div className="flex-grow" />

        <motion.div 
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 200, delay: 0.2 }}
          className="relative z-20 w-full mt-auto pointer-events-auto"
        >
          <div className="bg-[#18181b]/90 backdrop-blur-xl border-t border-white/10 rounded-t-[2.5rem] p-6 sm:p-8 pb-8 sm:pb-10 shadow-[0_-20px_50px_rgba(0,0,0,0.5)] max-w-3xl mx-auto">
            
            <div className="w-12 h-1.5 bg-gray-700 rounded-full mx-auto mb-6" />

            <div className="flex flex-col gap-3 min-h-[144px] justify-center">
              {isAuthLoading ? (
                <div className="flex justify-center items-center py-6">
                  <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : isAuthenticated ? (
                <Link
                  to="/ai-teacher"
                  onClick={handleContinueClick}
                  className={`relative overflow-hidden w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-lg flex items-center justify-center transition-all shadow-[0_0_30px_rgba(37,99,235,0.3)] active:scale-[0.98] ${isExiting ? 'opacity-70 pointer-events-none' : 'hover:bg-blue-500'}`}
                >
                  <span className="flex items-center gap-2">
                    <Play size={20} className="fill-current" /> Continue
                  </span>
                </Link>
              ) : (
                <>
                  <Link
                    to="/signup"
                    onClick={handleStartClick}
                    className={`relative overflow-hidden w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-lg flex items-center justify-center transition-all shadow-[0_0_30px_rgba(37,99,235,0.3)] active:scale-[0.98] ${(startLoading || isExiting) ? 'opacity-70 pointer-events-none' : 'hover:bg-blue-500'}`}
                  >
                    {startLoading ? (
                      <span className="flex items-center gap-2">
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Loading...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Play size={20} className="fill-current" /> Start Studying Free
                      </span>
                    )}
                  </Link>
                  
                  <Link
                    to="/login"
                    onClick={handleSignInClick}
                    className={`w-full bg-transparent text-gray-300 py-4 rounded-2xl font-semibold text-lg flex items-center justify-center transition-all border border-gray-700 active:scale-[0.98] ${(signInLoading || isExiting) ? 'opacity-70 pointer-events-none' : 'hover:bg-gray-800 hover:text-white'}`}
                  >
                    {signInLoading ? 'Please wait...' : 'I already have an account'}
                  </Link>
                </>
              )}
            </div>

            <p className="text-center text-xs text-gray-500 font-medium mt-8">
              Developed & Published By <a href="https://sbmindtechnologies.com" className="text-gray-400 hover:text-blue-400 transition-colors">SBMind Technologies</a> • © 2025
            </p>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

export default Welcome;