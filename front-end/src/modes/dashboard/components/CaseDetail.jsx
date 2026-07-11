import { useEffect, useState } from 'react';
import { dashboardRequest } from '../../../shared/api/apiClient';
import ClaimButton from './ClaimButton';
import OverrideModal from './OverrideModal';

export default function CaseDetail({ sessionId, onClose, onChanged }) {
  const [session, setSession] = useState(null);

  useEffect(() => {
    if (!sessionId) {
      setSession(null);
      return;
    }
    dashboardRequest(`/dashboard/session/${sessionId}`).then(setSession);
  }, [sessionId]);

  if (!sessionId || !session) return null;

  function refresh() {
    dashboardRequest(`/dashboard/session/${sessionId}`).then(setSession);
    onChanged?.();
  }

  return (
    <div>
      <button type="button" onClick={onClose}>
        Close
      </button>
      <h2>{session.sessionId}</h2>
      <p>Status: {session.status}</p>
      <ul>
        {session.messages.map((message, index) => (
          <li key={index}>
            {message.role}: {message.text}
          </li>
        ))}
      </ul>
      <ClaimButton sessionId={sessionId} claimedBy={session.claimedBy} onClaimed={refresh} />
      <OverrideModal sessionId={sessionId} onOverridden={refresh} />
    </div>
  );
}
