import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { dashboardRequest } from '../../../shared/api/apiClient';
import ClaimButton from './ClaimButton';
import OverrideModal from './OverrideModal';
import WoundPhotoPanel from './WoundPhotoPanel';
import MotionButton from '../../../shared/components/MotionButton';
import { fadeUp } from '../../../shared/motion';

// Mounted/unmounted by the parent (DashboardApp) wrapping this in
// AnimatePresence based on `selected` - so this component's own exit
// animation runs on close, rather than just disappearing.
export default function CaseDetail({ sessionId, onClose, onChanged }) {
  const [session, setSession] = useState(null);

  useEffect(() => {
    dashboardRequest(`/dashboard/session/${sessionId}`).then(setSession);
  }, [sessionId]);

  if (!session) return null;

  function refresh() {
    dashboardRequest(`/dashboard/session/${sessionId}`).then(setSession);
    onChanged?.();
  }

  return (
    <motion.div className="card" variants={fadeUp} initial="hidden" animate="visible" exit="hidden">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 className="tabular-nums" style={{ margin: 0 }}>
          {session.sessionId}
        </h2>
        <MotionButton type="button" onClick={onClose}>
          Close
        </MotionButton>
      </div>
      <p className="status-pill status-pill--neutral">Status: {session.status}</p>

      <WoundPhotoPanel
        imageBase64={session.imageBase64}
        woundType={session.woundType}
        findings={session.findings}
        boundaryCoords={session.boundaryCoords}
      />

      <ul>
        {session.messages.map((message, index) => (
          <li key={index}>
            {message.role}: {message.text}
          </li>
        ))}
      </ul>
      <div className="row">
        <ClaimButton sessionId={sessionId} claimedBy={session.claimedBy} onClaimed={refresh} />
      </div>
      <OverrideModal sessionId={sessionId} onOverridden={refresh} />
    </motion.div>
  );
}
