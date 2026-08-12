import React, { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, CloudDownload } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const PwaUpdatePrompt = () => {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered: ', r);
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  useEffect(() => {
    if (needRefresh) {
      // Force refresh automatically after 3 seconds
      const timer = setTimeout(() => {
        updateServiceWorker(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [needRefresh, updateServiceWorker]);

  return (
    <AnimatePresence>
      {needRefresh && (
        <motion.div 
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-4 left-4 right-4 md:bottom-10 md:left-auto md:right-10 bg-slate-900 border border-purple-500 text-white p-5 rounded-2xl shadow-2xl z-[100] flex items-center gap-4 max-w-sm"
        >
          <div className="w-12 h-12 flex-shrink-0 bg-purple-500/20 rounded-xl flex items-center justify-center text-purple-400">
            <CloudDownload size={24} className="animate-bounce" />
          </div>
          <div className="flex-1">
            <h4 className="font-bold text-lg mb-1">Update Available</h4>
            <p className="text-sm text-slate-300">Applying new changes and refreshing automatically...</p>
          </div>
          <div>
            <RefreshCw size={20} className="text-slate-400 animate-spin" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PwaUpdatePrompt;
