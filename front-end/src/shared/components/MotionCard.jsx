import { motion } from 'framer-motion';
import { fadeUp } from '../motion';

// Drop-in replacement for <div className="card"> with a consistent entrance
// animation - used across all three modes so every card in the app enters
// the same way instead of each screen inventing its own.
//
// inheritMotion: when this card is one item in a parent's staggerContainer
// (e.g. HomeApp's list of entry points), it must NOT set its own
// initial/animate - that would start its own independent animation instead
// of participating in the parent's staggered sequence. Pass inheritMotion
// when nesting under a stagger parent; omit it for a standalone card.
export default function MotionCard({ children, className = '', as = 'div', inheritMotion = false, ...props }) {
  const MotionTag = motion[as];
  const ownMotionProps = inheritMotion ? {} : { initial: 'hidden', animate: 'visible' };
  return (
    <MotionTag className={`card ${className}`.trim()} variants={fadeUp} {...ownMotionProps} {...props}>
      {children}
    </MotionTag>
  );
}
