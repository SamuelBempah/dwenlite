import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Zap, Star } from 'lucide-react';
import { auth } from '../firebase';
import logo from '../assets/react.png';

// UPDATE THIS VERSION STRING EVERY TIME YOU WANT THE MODAL TO SHOW AGAIN
const CURRENT_VERSION = 'v1.3.1';

export default function ReleaseNotesModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => {
      if (user) {
        setCurrentUser(user);
        const storageKey = `dwenlite_update_seen_${CURRENT_VERSION}_${user.uid}`;
        const hasSeen = localStorage.getItem(storageKey);
        
        if (!hasSeen) {
          const timer = setTimeout(() => setIsOpen(true), 1500);
          return () => clearTimeout(timer);
        }
      } else {
        setCurrentUser(null);
        setIsOpen(false);
      }
    });
    return unsubscribe;
  }, []);

  const handleClose = () => {
    if (currentUser) {
      const storageKey = `dwenlite_update_seen_${CURRENT_VERSION}_${currentUser.uid}`;
      localStorage.setItem(storageKey, 'true');
    }
    setIsOpen(false);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-lg bg-[#0f0f13] border border-white/10 rounded-3xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
          >
            {/* Header / Banner */}
            <div className="relative h-32 sm:h-40 bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 flex items-center justify-center overflow-hidden">
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-30 mix-blend-overlay"></div>
              <motion.div 
                initial={{ rotate: -10, scale: 0.8 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ delay: 0.2, type: 'spring' }}
                className="relative z-10 flex flex-col items-center"
              >
                <div className="bg-white p-2 w-16 h-16 rounded-2xl shadow-xl border border-white/40 mb-2 flex items-center justify-center">
                  <img src={logo} alt="DwenLite Logo" className="w-full h-full object-contain" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight drop-shadow-lg">
                  What's New!
                </h2>
              </motion.div>
              
              <button 
                onClick={handleClose}
                className="absolute top-4 right-4 bg-black/20 hover:bg-black/40 text-white p-2 rounded-full backdrop-blur-md transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 sm:p-8 overflow-y-auto overscroll-contain">
              <p className="text-gray-400 text-sm mb-6 text-center">
                Version {CURRENT_VERSION}
              </p>

              <div className="space-y-6">
                
                {/* Feature 1 */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0 mt-1">
                    <div className="w-10 h-10 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                      <Star size={20} />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">Introducing Dwenlite Vision Model</h3>
                    <p className="text-gray-400 text-sm leading-relaxed">
                      Our brand new proprietary Vision Model perfectly extracts handwritten and printed text from your images with stunning accuracy and speed.
                    </p>
                  </div>
                </div>

                {/* Feature 2 */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0 mt-1">
                    <div className="w-10 h-10 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                      <Zap size={20} />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">Dwenlite Cognitive Engine</h3>
                    <p className="text-gray-400 text-sm leading-relaxed">
                      Experience our upgraded Cognitive Engine! It intelligently generates notes, quizzes, and flashcards, and powers the AI Teacher for a smoother learning experience.
                    </p>
                  </div>
                </div>

                {/* Feature 3 */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0 mt-1">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                      <Sparkles size={20} />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">Dwenlite Agent Assistant & Data Processor</h3>
                    <p className="text-gray-400 text-sm leading-relaxed">
                      Our Helpdesk and Support are now powered by the new Dwenlite Agent Assistant and Data Processor, ensuring rapid, professional, and accurate support.
                    </p>
                  </div>
                </div>

              </div>

              {/* Action Button */}
              <div className="mt-8">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleClose}
                  className="w-full bg-white hover:bg-gray-100 text-black font-bold py-4 px-6 rounded-2xl transition-colors shadow-[0_0_20px_rgba(255,255,255,0.2)] text-base sm:text-lg"
                >
                  Awesome, let's go!
                </motion.button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
