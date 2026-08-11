import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const EMOTION_EMOJIS = {
  happy: ['😊', '😄', '🤩', '🎉', '😁', '🥳', '😎'],
  close: ['🤔', '🧐', '💭', '🤨', '😉', '🤞'],
  lookRight: [], lookLeft: [], eyeRoll: [], think: []
};

const RANDOM_TEACHING_HANDS = ['👐', '🤲', '🤚', '🖐️', '🙌', '👇', '🤌', '🫰', '☝️', '✌️', '👆', '👌', '👋'];

const AITeacherBackground = ({ exitAnimation }) => {
  const [eyeEmotion, setEyeEmotion] = useState('center');
  const [currentEmoji, setCurrentEmoji] = useState(null);
  const [isBlinking, setIsBlinking] = useState(false);
  const [currentHand, setCurrentHand] = useState(null);
  const [speakerVolume, setSpeakerVolume] = useState(100); // Simulate some volume
  const [isZooming, setIsZooming] = useState(false);
  const [containerAnim, setContainerAnim] = useState({});
  const [isConcussed, setIsConcussed] = useState(false);
  const [isWavingActive, setIsWavingActive] = useState(false);

  const triggerEmotion = useCallback((emotionCat, duration = 3000) => {
    if (exitAnimation) return;
    const emojis = EMOTION_EMOJIS[emotionCat];
    if (emojis && emojis.length > 0) {
      const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
      setEyeEmotion('closed');
      setTimeout(() => {
        if (exitAnimation) return;
        setCurrentEmoji(randomEmoji);
        setEyeEmotion(emotionCat);
      }, 150);

      setTimeout(() => {
        if (exitAnimation) return;
        setCurrentEmoji(null);
        setEyeEmotion('closed');
        setTimeout(() => {
          if (exitAnimation) return;
          setEyeEmotion('center');
        }, 150);
      }, duration);
    } else {
      setEyeEmotion(emotionCat);
      setTimeout(() => {
        if (exitAnimation) return;
        setEyeEmotion('center');
      }, duration);
    }
  }, [exitAnimation]);

  // Exit Animation Sequence
  useEffect(() => {
    if (exitAnimation) {
      setCurrentEmoji(null);
      setEyeEmotion('center');
      setCurrentHand(null);
      setSpeakerVolume(0);
      
      // Sequence:
      // 1. Look center
      setEyeEmotion('center');
      setContainerAnim({});
      setIsConcussed(false);
      
      // 2. Blink multiple times
      let blinks = 0;
      const blinkInt = setInterval(() => {
        setIsBlinking(true);
        setTimeout(() => setIsBlinking(false), 150);
        blinks++;
        if (blinks >= 3) {
          clearInterval(blinkInt);
        }
      }, 400);

      // 3. Wave actively at us
      setTimeout(() => {
        setCurrentHand('👋');
        setIsWavingActive(true);
      }, 1500);

      // 4. Zoom in fast to the white eye
      setTimeout(() => {
        setIsWavingActive(false);
        setCurrentHand(null);
        setIsZooming(true);
      }, 2500);
    }
  }, [exitAnimation]);

  // Blinking Logic (only if not exiting)
  useEffect(() => {
    if (exitAnimation) return;
    if (eyeEmotion === 'closed' || eyeEmotion === 'sleep') return;
    const blinkInterval = setInterval(() => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 150);
    }, Math.random() * 4000 + 3000);

    return () => clearInterval(blinkInterval);
  }, [eyeEmotion, exitAnimation]);

  // Simulation Loop
  useEffect(() => {
    if (exitAnimation) return;
    const simulateTeaching = () => {
      const actions = ['happy', 'close', 'lookRight', 'lookLeft', 'think', 'eyeRoll', 'speak'];
      const action = actions[Math.floor(Math.random() * actions.length)];

      if (action === 'speak') {
        const hand = RANDOM_TEACHING_HANDS[Math.floor(Math.random() * RANDOM_TEACHING_HANDS.length)];
        setCurrentHand(hand);
        setSpeakerVolume(Math.random() * 150 + 50); // random volume pulse
        setTimeout(() => {
          if (exitAnimation) return;
          setCurrentHand(null);
          setSpeakerVolume(0);
        }, 3000);
      } else {
        triggerEmotion(action, 2500);
      }
    };

    const interval = setInterval(simulateTeaching, 4000);
    simulateTeaching(); // Start immediately

    return () => clearInterval(interval);
  }, [triggerEmotion, exitAnimation]);

  // Simulated Speaking Pulse
  useEffect(() => {
    if (exitAnimation) return;
    if (speakerVolume > 0) {
      const pulseInterval = setInterval(() => {
        setSpeakerVolume(Math.random() * 100 + 50);
      }, 200);
      return () => clearInterval(pulseInterval);
    }
  }, [speakerVolume, exitAnimation]);


  const getEyeAnimation = () => {
    if (currentEmoji) {
      const scale = 1 + (speakerVolume / 255) * 0.3;
      return { width: 64, height: 64, x: 0, y: 0, scale, borderRadius: '50%' };
    }

    if (eyeEmotion === 'closed') {
      return { height: 4, width: 64, y: 0, x: 0, opacity: 0.3, borderRadius: '10px' };
    }
    if (isBlinking) {
      return { height: 4, width: 64, y: 0, x: 0, opacity: 1, borderRadius: '10px', transition: { duration: 0.1 } };
    }
    
    let base = { width: 64, height: 64, x: 0, y: 0, opacity: 1, borderRadius: '50%' };
    
    switch (eyeEmotion) {
      case 'lookLeft': base.x = -30; break;
      case 'lookRight': base.x = 30; break;
      case 'lookUp': base.y = -30; break;
      case 'lookDown': base.y = 30; break;
      case 'lookUpLeft': base.x = -25; base.y = -25; break;
      case 'happy': 
        base.height = 70; 
        base.width = 70; 
        base.borderRadius = '30% 30% 50% 50%'; 
        base.y = -5;
        break;
      case 'eyeRoll':
        base.x = [0, -20, 0, 20, 0];
        base.y = [0, -20, -30, -20, 0];
        base.transition = { duration: 1.5, ease: "easeInOut" };
        break;
      case 'think':
        base.x = 20;
        base.y = -20;
        base.height = 50;
        base.width = 50;
        break;
      case 'center':
      default:
        break;
    }
    
    const isSpeaking = speakerVolume > 20;
    if (isSpeaking && !['lookLeft', 'lookRight', 'lookUpLeft'].includes(eyeEmotion)) {
       base.width = 64 + (speakerVolume / 255) * 30;
       base.height = 64 + (speakerVolume / 255) * 30;
    }
    return base;
  };

  const isSpeaking = speakerVolume > 20;
  const pulseScale = isSpeaking ? 1 + (speakerVolume / 255) * 0.7 : 1;
  const pulseOpacity = isSpeaking ? Math.min(1, 0.3 + (speakerVolume / 255)) : 0.5;

  return (
    <div className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden bg-[#09090b]">
      {/* Container for Avatar */}
      {/* On desktop, keep scale-100 and shift slightly. On mobile, scale-110. */}
      <div className="relative w-full h-full flex flex-col items-center justify-center pointer-events-none scale-110 md:scale-100 md:translate-y-[-5%]">
        
        {/* Pulses (Optimized with GPU transforms) */}
        <AnimatePresence>
          {isSpeaking && (
            <>
              <motion.div
                className="absolute rounded-full bg-blue-500 will-change-transform"
                style={{ width: 240, height: 240 }}
                animate={{ scale: pulseScale, opacity: pulseOpacity * 0.4 }}
                transition={{ duration: 0.1 }}
              />
              <motion.div
                className="absolute rounded-full bg-blue-400 will-change-transform"
                style={{ width: 240, height: 240 }}
                animate={{ scale: pulseScale + 0.3, opacity: pulseOpacity * 0.2 }}
                transition={{ duration: 0.1 }}
              />
            </>
          )}
          {!isSpeaking && (
            <>
              <motion.div
                className="absolute rounded-full bg-emerald-500 will-change-transform"
                style={{ width: 240, height: 240 }}
                animate={{ scale: [1, 1.15, 1], opacity: [0.1, 0.2, 0.1] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div
                className="absolute rounded-full bg-emerald-400 will-change-transform"
                style={{ width: 240, height: 240 }}
                animate={{ scale: [1, 1.3, 1], opacity: [0.05, 0.1, 0.05] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              />
            </>
          )}
        </AnimatePresence>

        <motion.div animate={containerAnim} className="relative flex flex-col items-center justify-center">
        {/* Avatar Circle (Removed heavy shadows for performance) */}
        <div className={`relative z-10 w-48 h-48 rounded-full flex items-center justify-center transition-colors duration-500 ${isZooming ? 'z-[100]' : 'overflow-hidden'} ${isSpeaking ? 'bg-blue-600' : 'bg-emerald-600'}`}>
          <AnimatePresence mode="wait">
              <motion.div
                key="eye-container"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={isConcussed ? { opacity: 1, scale: 1, rotate: [0, 15, -15, 10, -10, 0], transition: { duration: 1, repeat: Infinity } } : { opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center justify-center w-full h-full relative"
              >
              <motion.div
                className={`flex items-center justify-center relative ${isZooming ? 'bg-white z-[100]' : currentEmoji ? 'bg-transparent text-4xl overflow-hidden' : 'bg-white overflow-hidden'}`}
                animate={isZooming ? { scale: 100, borderRadius: '50%', width: 64, height: 64, x: 0, y: 0 } : getEyeAnimation()}
                transition={isZooming ? { duration: 0.6, ease: "easeIn" } : { duration: 0.3, type: 'spring' }}
              >
                {currentEmoji && !isZooming && <span className="relative z-10">{currentEmoji}</span>}
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Teaching Hand */}
        <motion.div 
          className="absolute z-20 pointer-events-none will-change-transform"
          style={{ top: '50%', left: '50%', marginLeft: '3rem', marginTop: '2rem' }}
          animate={{ y: [-5, 5, -5], rotate: [-2, 2, -2] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          <AnimatePresence mode="wait">
            {currentHand && (
              <motion.div
                key={currentHand}
                initial={{ y: 20, opacity: 0, scale: 0.8, rotate: -10 }}
                animate={isWavingActive ? { y: 0, opacity: 1, scale: 1, rotate: [0, -30, 30, -30, 30, -30, 30, 0], transition: { duration: 1, ease: "easeInOut" } } : { y: 0, opacity: 1, scale: 1, rotate: 0 }}
                exit={{ y: 20, opacity: 0, scale: 0.8, rotate: 10 }}
                transition={{ duration: 0.25 }}
                className="text-[70px] drop-shadow-xl"
              >
                {currentHand}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
        </motion.div>
      </div>
    </div>
  );
};

export default AITeacherBackground;
