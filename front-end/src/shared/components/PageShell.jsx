import { motion } from 'framer-motion';
import { fadeUp } from '../motion';

// Drop-in replacement for <div className="shell"> with a consistent
// page-enter animation, used at the root of every top-level route.
export default function PageShell({ children, wide = false, className = '' }) {
  return (
    <motion.div
      className={`shell ${wide ? 'shell--wide' : ''} ${className}`.trim()}
      variants={fadeUp}
      initial="hidden"
      animate="visible"
    >
      {children}
    </motion.div>
  );
}
