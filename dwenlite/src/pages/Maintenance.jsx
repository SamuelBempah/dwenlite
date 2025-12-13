import React from 'react';
import { motion } from 'framer-motion';
import { Settings, Clock, Wrench } from 'lucide-react';

const Maintenance = () => {
  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center relative overflow-hidden font-sans selection:bg-purple-500 selection:text-white">
      
      {/* Background Ambience */}
      <div className="fixed inset-0 z-0 opacity-30 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-purple-900/40 to-transparent" />
        <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-indigo-600 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 p-4 w-full flex justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "out" }}
          className="max-w-lg w-full bg-slate-800/40 backdrop-blur-xl border border-white/10 rounded-3xl p-8 md:p-12 text-center shadow-2xl shadow-purple-900/20"
        >
          {/* Animated Icon Graphic */}
          <div className="relative w-32 h-32 mx-auto mb-8 flex items-center justify-center">
            {/* Outer Glow */}
            <div className="absolute inset-0 bg-purple-500/20 rounded-full blur-2xl animate-pulse" />
            
            {/* Big Gear */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
              className="relative z-10"
            >
              <Settings size={80} className="text-purple-400" />
            </motion.div>

            {/* Small Gear */}
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
              className="absolute bottom-0 right-2 z-10 bg-slate-900 rounded-full p-0.5 border-4 border-slate-800"
            >
              <Settings size={40} className="text-indigo-400" />
            </motion.div>

             {/* Floating Wrench */}
             <motion.div
              animate={{ y: [0, -5, 0], rotate: [0, 5, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="absolute top-0 left-0 z-20 text-slate-300 drop-shadow-lg"
            >
              <Wrench size={28} />
            </motion.div>
          </div>

          <h1 className="text-3xl md:text-4xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
            Weekly Maintenance
          </h1>
          
          <p className="text-slate-400 text-lg mb-8 leading-relaxed">
            We are currently tuning up the engine to serve you better. 
            The platform is temporarily unavailable.
          </p>

          {/* Schedule Info Card */}
          <div className="bg-slate-900/50 border border-white/5 rounded-xl p-4 flex items-center justify-center gap-4 mb-8">
            <div className="p-2.5 bg-yellow-500/10 rounded-lg shrink-0">
              <Clock className="text-yellow-400" size={24} />
            </div>
            <div className="text-left">
              <p className="text-xs text-slate-500 uppercase tracking-wider font-bold mb-0.5">Scheduled Downtime</p>
              <p className="text-slate-200 font-medium">Saturdays, 12:00 PM - 3:00 PM</p>
            </div>
          </div>

          {/* Status Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            </span>
            System Offline
          </div>

        </motion.div>
      </div>

      {/* Footer / Copyright */}
      <div className="absolute bottom-6 w-full text-center p-4">
        <p className="text-slate-600 text-xs uppercase tracking-widest">
           DwenLite Technologies &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
};

export default Maintenance;