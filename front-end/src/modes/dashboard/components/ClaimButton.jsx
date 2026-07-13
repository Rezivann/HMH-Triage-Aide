import { useState } from 'react';
import { motion } from 'framer-motion';
import MotionButton from '../../../shared/components/MotionButton';
import { dashboardRequest } from '../../../shared/api/apiClient';

export default function ClaimButton({ sessionId, claimedBy, onClaimed }) {
  const [claiming, setClaiming] = useState(false);

  async function handleClaim() {
    setClaiming(true);
    try {
      await dashboardRequest(`/dashboard/claim/${sessionId}`, { method: 'POST' });
      onClaimed?.();
    } finally {
      setClaiming(false);
    }
  }

  if (claimedBy)
    return (
      <motion.span
        className="status-pill status-pill--success"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      >
        Claimed by {claimedBy}
      </motion.span>
    );

  return (
    <MotionButton type="button" className="btn-primary" onClick={handleClaim} disabled={claiming}>
      {claiming ? 'Claiming...' : 'Claim'}
    </MotionButton>
  );
}
