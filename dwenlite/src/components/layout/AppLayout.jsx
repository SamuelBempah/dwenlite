import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { auth, db } from '../../firebase';
import StreakChip from '../StreakChip';
import { doc, getDoc } from 'firebase/firestore';
import { 
  Menu, X, LayoutDashboard, GraduationCap, 
  HelpCircle, Coins, LogOut, User, Sparkles
} from 'lucide-react';

const AppLayout = ({ children }) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [gCoins, setGCoins] = useState(0);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => {
      setCurrentUser(user);
    });
    return unsubscribe;
  }, []);

  // Close drawer on route change
  useEffect(() => {
    setIsDrawerOpen(false);
  }, [location.pathname]);

  // Fetch G-Coins
  useEffect(() => {
    if (currentUser?.uid) {
      getDoc(doc(db, 'users', currentUser.uid)).then(snap => {
        if (snap.exists()) setGCoins(snap.data().gCoins || 0);
      }).catch(console.error);
    }
  }, [currentUser]);

  const handleLogout = () => {
    setLogoutLoading(true);
    setTimeout(() => {
      auth.signOut().then(() => navigate('/login'));
    }, 1000);
  };

  const NavItem = ({ icon, label, to, active }) => (
    <Link 
      to={to} 
      className={`flex items-center gap-3 p-3 rounded-xl transition-all font-medium ${
        active || location.pathname === to
          ? 'bg-purple-600/20 text-purple-400' 
          : 'text-slate-400 hover:bg-white/5 hover:text-white'
      }`}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );

  return (
    <div className="min-h-screen bg-[#09090b] text-white font-sans selection:bg-purple-500 selection:text-white overflow-hidden relative flex flex-col">
      {/* Dynamic Background */}
      <div className="fixed inset-0 z-0 opacity-20 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-64 h-64 md:w-96 md:h-96 bg-purple-600 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-64 h-64 md:w-96 md:h-96 bg-indigo-600 rounded-full blur-[100px]" />
      </div>

      {/* Global Header */}
      <header className="relative z-40 bg-[#09090b]/80 backdrop-blur-xl border-b border-white/5 px-4 h-16 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsDrawerOpen(true)}
            className="p-2 -ml-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Menu size={24} />
          </button>
          <Link to="/dashboard" className="font-bold text-xl tracking-tight hidden sm:block">
            DwenLite
          </Link>
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          <StreakChip />
          <Link to="/buy-coins" className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-full border border-white/10 hover:border-yellow-500/50 transition-colors group">
            <Coins size={14} className="text-yellow-400 group-hover:animate-bounce" />
            <span className="text-sm font-bold text-white">{gCoins}</span>
          </Link>
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center font-bold text-sm shadow-lg shadow-purple-500/30 cursor-pointer">
            {currentUser?.displayName?.[0] || 'S'}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 overflow-y-auto w-full flex flex-col">
        {children}
      </main>

      {/* Navigation Drawer Overlay */}
      <AnimatePresence>
        {isDrawerOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDrawerOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            />
            <motion.aside 
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 left-0 h-full w-[280px] bg-[#121217] border-r border-white/5 z-50 flex flex-col shadow-2xl"
            >
              <div className="p-4 flex items-center justify-between border-b border-white/5">
                <div className="font-bold text-xl tracking-tight bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                  DwenLite
                </div>
                <button 
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-4 flex-1 overflow-y-auto space-y-6">
                <nav className="space-y-1">
                  <NavItem icon={<LayoutDashboard size={20} />} label="Dashboard" to="/dashboard" />
                  <NavItem icon={<GraduationCap size={20} />} label="AI Teacher" to="/ai-teacher" />
                  <NavItem icon={<Sparkles size={20} />} label="Exams Prep" to="/exams-preparation" />
                  <NavItem icon={<HelpCircle size={20} />} label="Support" to="/community-support" />
                </nav>

                <div className="pt-4 border-t border-white/5 space-y-1">
                  <NavItem icon={<Coins size={20} className="text-yellow-400" />} label="Buy G_COINS" to="/buy-coins" />
                  <NavItem icon={<User size={20} />} label="Account Info" to="/reports" />
                </div>
              </div>

              <div className="p-4 border-t border-white/5">
                <button 
                  onClick={handleLogout} 
                  disabled={logoutLoading}
                  className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all text-sm font-medium"
                >
                  {logoutLoading ? <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin"/> : <LogOut size={16} />}
                  Sign Out
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AppLayout;
