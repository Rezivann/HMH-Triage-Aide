// Shared Framer Motion variants - one place to tune the app's motion feel
// rather than repeating easing/duration objects in every component. Every
// page uses these same three, so the app reads as one system in motion, not
// a different animation style per screen.

const EASE_OUT = [0.16, 1, 0.3, 1];

export const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE_OUT } },
};

export const fadeUpSmall = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE_OUT } },
};

// Stagger a list of fadeUpSmall children - apply this to the parent
// (initial="hidden" animate="visible") and fadeUpSmall to each child.
export const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

export const springy = { type: 'spring', stiffness: 400, damping: 25 };
