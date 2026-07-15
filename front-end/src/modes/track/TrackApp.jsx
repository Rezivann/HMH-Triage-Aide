import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useTrackerStatus } from './hooks/useTrackerStatus';
import StatusBand from './components/StatusBand';
import NearbyUrgentCareList from './components/NearbyUrgentCareList';
import TelehealthOption from './components/TelehealthOption';
import PageShell from '../../shared/components/PageShell';
import MotionCard from '../../shared/components/MotionCard';
import MotionButton from '../../shared/components/MotionButton';
import { fadeUpSmall } from '../../shared/motion';

export default function TrackApp() {
  const { sessionToken } = useParams();
  const { status, position, estimatedWaitMinutes, telehealthViable, error, leaveQueue } =
    useTrackerStatus(sessionToken);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [showOtherOptions, setShowOtherOptions] = useState(false);

  if (error) {
    return (
      <PageShell>
        <p role="alert">Could not load your status. Please rescan the code at the kiosk.</p>
      </PageShell>
    );
  }

  async function handleLeave() {
    setLeaving(true);
    try {
      await leaveQueue();
      setConfirmingLeave(false);
    } finally {
      setLeaving(false);
    }
  }

  // Leaving/other-urgent-care/telehealth only make sense while still
  // actually waiting - once a nurse has this patient (with_nurse) or they've
  // already left (left_queue), there's nothing left to opt out of.
  const stillActive = status === 'waiting' || status === 'next';

  return (
    <PageShell>
      <h1>Your Status</h1>
      <StatusBand status={status} position={position} estimatedWaitMinutes={estimatedWaitMinutes} />

      {stillActive && telehealthViable && <TelehealthOption />}

      {stillActive && (
        <>
          <div className="row">
            <MotionButton type="button" onClick={() => setShowOtherOptions((prev) => !prev)}>
              {showOtherOptions ? 'Hide other urgent cares' : 'See other urgent cares'}
            </MotionButton>
            <MotionButton type="button" onClick={() => setConfirmingLeave(true)}>
              Leave queue
            </MotionButton>
          </div>

          <AnimatePresence>
            {showOtherOptions && (
              <motion.div variants={fadeUpSmall} initial="hidden" animate="visible" exit="hidden">
                <NearbyUrgentCareList currentWaitMinutes={estimatedWaitMinutes} />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {confirmingLeave && (
              <motion.div variants={fadeUpSmall} initial="hidden" animate="visible" exit="hidden">
                <MotionCard style={{ borderColor: 'var(--color-danger)' }}>
                  <p role="alert" style={{ margin: 0 }}>
                    Are you sure you want to leave the queue? You'll need to check in again to be seen.
                  </p>
                  <div className="row">
                    <MotionButton
                      type="button"
                      className="btn-primary"
                      style={{ background: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
                      onClick={handleLeave}
                      disabled={leaving}
                    >
                      {leaving ? 'Leaving...' : 'Yes, leave the queue'}
                    </MotionButton>
                    <MotionButton type="button" onClick={() => setConfirmingLeave(false)} disabled={leaving}>
                      Cancel
                    </MotionButton>
                  </div>
                </MotionCard>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </PageShell>
  );
}
