import { AnimatePresence, MotionConfig, motion } from 'framer-motion';

// Everything here animates only transform and opacity, which the browser runs on the graphics chip at the screen's own refresh rate
// (60, 90 or 120 per second). Springs keep the motion natural, and users who ask for reduced motion get none (MotionConfig).
export const spring = { type: 'spring', stiffness: 520, damping: 34, mass: 0.7 };
export const soft = { type: 'spring', stiffness: 240, damping: 24, mass: 0.9 };

export function Motion({ children }) { return <MotionConfig reducedMotion="user">{children}</MotionConfig>; }

const HOVER = {
  spin: { rotate: -200 }, tilt: { rotate: -22 }, clock: { rotate: -45 }, pulse: { scale: 1.28 }, slide: { x: 3 }, fly: { x: 3, y: -3 }, wiggle: { rotate: [0, -14, 12, -8, 0] }, pop: { scale: 1.2 },
};

// A round icon button whose icon moves when you hover or press it.
export function IconBtn({ icon: Icon, anim = 'pop', size = 16, className = '', children, ...props }) {
  return (
    <motion.button whileHover="hover" whileTap={{ scale: 0.86 }} initial="rest" animate="rest" transition={spring} className={`inline-flex items-center justify-center ${className}`} {...props}>
      <motion.span style={{ display: 'inline-flex' }} variants={{ rest: { rotate: 0, scale: 1, x: 0, y: 0 }, hover: HOVER[anim] || HOVER.pop }} transition={anim === 'wiggle' ? { duration: 0.5 } : spring}>
        <Icon size={size} />
      </motion.span>
      {children}
    </motion.button>
  );
}

// A button that presses in.
export const Tap = ({ children, ...props }) => <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.94 }} transition={spring} {...props}>{children}</motion.button>;

// Things slide up and fade in as they arrive.
export const Appear = ({ children, delay = 0, y = 12, className = '', ...props }) => (
  <motion.div initial={{ opacity: 0, y, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ ...spring, delay }} className={className} {...props}>{children}</motion.div>
);

// Opens and closes smoothly.
export const Collapse = ({ open, children }) => (
  <AnimatePresence initial={false}>
    {open && <motion.div key="c" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ ...soft, opacity: { duration: 0.15 } }} style={{ overflow: 'hidden' }}>{children}</motion.div>}
  </AnimatePresence>
);

// Icons that draw themselves (plain CSS, see index.css, so they always animate).
export function AnimatedCheck({ size = 15, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={`dw-pop ${className}`}>
      <path className="dw-draw" pathLength="1" d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
export function AnimatedX({ size = 15, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className={`dw-pop ${className}`}>
      <path className="dw-draw" pathLength="1" d="M6 6l12 12" />
      <path className="dw-draw dw-draw-2" pathLength="1" d="M18 6L6 18" />
    </svg>
  );
}
export function Spinner({ size = 15, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className={`dw-spin ${className}`} role="status" aria-label="Working">
      <path d="M21 12a9 9 0 1 1-6.2-8.55" />
    </svg>
  );
}

// A dimmed backdrop and a panel that springs up from below.
export function Sheet({ onClose, className = '', z = 'z-[90]', children }) {
  return (
    <motion.div className={`fixed inset-0 ${z} flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} onClick={onClose}>
      <motion.div className={className} initial={{ y: 70, opacity: 0, scale: 0.97 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 50, opacity: 0, scale: 0.98 }} transition={spring} onClick={(e) => e.stopPropagation()}>{children}</motion.div>
    </motion.div>
  );
}
export { AnimatePresence, motion };
