import { motion, spring } from './motion';

// The Dwenlite logo, used wherever Home shows an icon.
export default function DwenLogo({ size = 28, working = false, className = '' }) {
  return (
    <motion.span
      className={`inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-lg bg-white ${className}`}
      style={{ width: size, height: size }}
      animate={working ? { scale: [1, 1.1, 1] } : { scale: 1 }}
      transition={working ? { repeat: Infinity, duration: 1.4, ease: 'easeInOut' } : spring}
    >
      <img src="/pwa-192x192.png" alt="" width={size} height={size} draggable="false" className="h-full w-full object-contain p-[6%]" />
    </motion.span>
  );
}
