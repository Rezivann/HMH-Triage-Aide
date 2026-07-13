import { motion } from 'framer-motion';
import { springy } from '../motion';

// Drop-in replacement for <button> with a consistent press/hover feel - used
// across all three modes instead of repeating whileHover/whileTap on every
// button. Disabled buttons get no motion (nothing to react to).
export default function MotionButton({ children, disabled, ...props }) {
  return (
    <motion.button
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.03 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={springy}
      {...props}
    >
      {children}
    </motion.button>
  );
}
