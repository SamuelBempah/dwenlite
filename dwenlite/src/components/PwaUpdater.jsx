import React, { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Loader2 } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import logo from '../assets/react.png';

export default function PwaUpdater() {
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSimulation, setIsSimulation] = useState(false);
  const location = useLocation();

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      if (r) {
        // Check for updates every 15 minutes to ensure users don't get stuck on old versions
        setInterval(() => {
          r.update();
        }, 15 * 60 * 1000);
        
        // Save registration to window so we can trigger it manually on route change
        window.swRegistration = r;
      }
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  // Check for updates on every route change
  useEffect(() => {
    if (window.swRegistration) {
      window.swRegistration.update();
    }
  }, [location.pathname]);

  useEffect(() => {
    if (needRefresh) {
      setIsUpdating(true);
      // Wait a moment so the user can read the text before reloading
      const timer = setTimeout(() => {
        updateServiceWorker(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [needRefresh, updateServiceWorker]);

  const triggerSimulation = () => {
    if (isUpdating) return;
    setIsUpdating(true);
    setIsSimulation(true);
    setTimeout(() => {
      setIsUpdating(false);
      setIsSimulation(false);
    }, 4000);
  };

  return (
    <>
      {import.meta.env.DEV && (
        <button
          onClick={triggerSimulation}
          className="fixed bottom-4 left-4 z-[999999] bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs px-4 py-2 rounded-full shadow-2xl transition-transform hover:scale-105 active:scale-95"
        >
          Simulate Update UI
        </button>
      )}

      <AnimatePresence>
        {isUpdating && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-[99999] bg-[#1a1a24] border border-white/10 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden"
          >
            <div className="flex items-center p-4">
              <div className="flex-shrink-0 bg-white/5 p-2 rounded-xl mr-4 border border-white/10 relative">
                <img src={logo} alt="DwenLite Logo" className="w-8 h-8 object-contain relative z-10" />
                <div className="absolute inset-0 bg-purple-500/20 blur-xl rounded-full" />
              </div>
              <div className="flex-1">
                <h3 className="text-white font-bold text-sm sm:text-base tracking-wide flex items-center gap-2">
                  Update Available
                  <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                </h3>
                <p className="text-gray-400 text-xs sm:text-sm mt-1">
                  Applying new features...
                </p>
                {isSimulation && (
                  <p className="text-pink-400 text-[10px] mt-1 italic animate-pulse">
                    (Simulation Mode)
                  </p>
                )}
              </div>
            </div>
            {/* Progress bar effect */}
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: "100%" }}
              transition={{ duration: isSimulation ? 4 : 3, ease: "linear" }}
              className="h-1 bg-gradient-to-r from-purple-500 to-pink-500 w-full"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
