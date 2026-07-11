import { useState } from 'react';
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

  if (claimedBy) return <p>Claimed by {claimedBy}</p>;

  return (
    <button type="button" onClick={handleClaim} disabled={claiming}>
      {claiming ? 'Claiming...' : 'Claim'}
    </button>
  );
}
