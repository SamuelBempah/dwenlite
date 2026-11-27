import React from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, PenTool, HelpCircle, Coins, X, Home, BarChart3 } from 'lucide-react';
import { useIsOwner, useIsAdmin } from '../lib/homeClient';

const TeacherSidebar = ({ isOpen, onClose }) => {
  const isOwner = useIsOwner();
  const isAdmin = useIsAdmin();
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-[70] backdrop-blur-sm"
          />
          <motion.div
            id="ai-teacher-sidebar"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 left-0 h-full w-72 bg-[#1A1A1D] border-r border-gray-800 shadow-2xl z-[80] flex flex-col"
          >
            <div className="p-6 flex justify-between items-center border-b border-gray-800">
              <h2 className="text-xl font-bold text-white tracking-wide">DwenLite Hub</h2>
              <button onClick={onClose} className="text-gray-400 hover:text-white transition">
                <X size={24} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto py-6 px-4 flex flex-col gap-2">
              <Link to="/dashboard" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-800 text-gray-300 hover:text-white transition group">
                <BookOpen size={20} className="text-blue-400 group-hover:scale-110 transition" />
                <span className="font-medium">Library</span>
              </Link>
              <Link to="/exams-preparation" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-800 text-gray-300 hover:text-white transition group">
                <PenTool size={20} className="text-purple-400 group-hover:scale-110 transition" />
                <span className="font-medium">Exams Preparation</span>
              </Link>
              {isOwner && (
                <Link to="/dwenlite-home" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-800 text-gray-300 hover:text-white transition group">
                  <Home size={20} className="text-violet-400 group-hover:scale-110 transition" />
                  <span className="font-medium">Dwenlite Home</span>
                </Link>
              )}
              {isAdmin && (
                <Link to="/admin-usage" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-800 text-gray-300 hover:text-white transition group">
                  <BarChart3 size={20} className="text-sky-400 group-hover:scale-110 transition" />
                  <span className="font-medium">Usage & admins</span>
                </Link>
              )}
              <Link to="/support" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-800 text-gray-300 hover:text-white transition group">
                <HelpCircle size={20} className="text-green-400 group-hover:scale-110 transition" />
                <span className="font-medium">Support</span>
              </Link>
              <Link to="/buy-coins" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-800 text-gray-300 hover:text-white transition group">
                <Coins size={20} className="text-yellow-400 group-hover:scale-110 transition" />
                <span className="font-medium">Buy G-Coins</span>
              </Link>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default TeacherSidebar;
