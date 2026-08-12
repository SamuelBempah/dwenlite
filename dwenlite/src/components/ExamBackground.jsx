import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, CheckCircle2, GraduationCap, Edit3, BookOpen, BrainCircuit } from 'lucide-react';

const ICONS = [FileText, CheckCircle2, GraduationCap, Edit3, BookOpen, BrainCircuit];

const ExamBackground = ({ exitAnimation }) => {
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    // Generate 18 floating elements
    const newParticles = Array.from({ length: 18 }).map((_, i) => ({
      id: i,
      x: Math.random() * 100, // percentage
      y: Math.random() * 100, // percentage
      size: Math.random() * 30 + 30, // 30 to 60px
      iconIndex: Math.floor(Math.random() * ICONS.length),
      duration: Math.random() * 30 + 30, // 30 to 60s
      delay: Math.random() * -30, // random start position in time
    }));
    setParticles(newParticles);
  }, []);

  return (
    <div className={`fixed inset-0 pointer-events-none overflow-hidden transition-opacity duration-1000 ${exitAnimation ? 'opacity-0' : 'opacity-100'}`}>
      {/* Base deep background */}
      <div className="absolute inset-0 bg-[#09090b]" />
      
      {/* Subtle radial gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent blur-3xl opacity-50" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[70%] h-[70%] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-900/20 via-transparent to-transparent blur-3xl opacity-50" />

      {/* Floating Icons */}
      {particles.map(p => {
        const Icon = ICONS[p.iconIndex];
        return (
          <motion.div
            key={p.id}
            initial={{ x: `${p.x}vw`, y: `${p.y}vh`, opacity: 0 }}
            animate={{ 
              y: [`${p.y}vh`, `${(p.y - 40) % 100}vh`], 
              x: [`${p.x}vw`, `${(p.x + 20) % 100}vw`],
              rotate: [0, 360],
              opacity: [0, 0.03, 0.05, 0.03, 0] 
            }}
            transition={{
              duration: p.duration,
              repeat: Infinity,
              ease: "linear",
              delay: p.delay
            }}
            className="absolute text-white"
            style={{ width: p.size, height: p.size }}
          >
            <Icon size={p.size} strokeWidth={1} />
          </motion.div>
        );
      })}
      
      {/* Grid Overlay */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }}
      />
      
      {/* Edge shadow for seamless blending */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#09090b]/80" />
      <div className="absolute inset-0 bg-gradient-to-t from-transparent via-transparent to-[#09090b]/80" />
    </div>
  );
};

export default ExamBackground;
