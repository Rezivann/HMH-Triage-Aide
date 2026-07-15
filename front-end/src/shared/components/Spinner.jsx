import { motion } from 'framer-motion';

// Small inline spinner for "waiting on a slow backend call" moments (Claude
// vision analysis, CV pipeline, etc.) where a button-text change alone isn't
// enough to read as "actively working", not just disabled.
export default function Spinner({ size = 20 }) {
  return (
    <motion.span
      className="spinner"
      style={{ width: size, height: size }}
      animate={{ rotate: 360 }}
      transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
      aria-hidden="true"
    />
  );
}
