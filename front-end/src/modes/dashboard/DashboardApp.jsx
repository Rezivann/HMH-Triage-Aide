import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useDashboardAuth } from './hooks/useDashboardAuth';
import { useQueueSocket } from './hooks/useQueueSocket';
import { dashboardRequest } from '../../shared/api/apiClient';
import QueueList from './components/QueueList';
import CaseDetail from './components/CaseDetail';
import AcuityPolicyPanel from './components/AcuityPolicyPanel';
import PageShell from '../../shared/components/PageShell';
import MotionCard from '../../shared/components/MotionCard';
import MotionButton from '../../shared/components/MotionButton';
import { fadeUp, fadeUpSmall } from '../../shared/motion';

export default function DashboardApp() {
  const { nurseId, isAuthenticated, login, error: authError } = useDashboardAuth();
  const { queue, error: queueError, refetch } = useQueueSocket(isAuthenticated);
  const [selected, setSelected] = useState(null);
  const [idInput, setIdInput] = useState('');
  const [showPolicy, setShowPolicy] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function handleClearQueue() {
    setClearing(true);
    try {
      await dashboardRequest('/dashboard/clear-queue', { method: 'POST' });
      setConfirmingClear(false);
      refetch();
    } finally {
      setClearing(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <PageShell>
        <MotionCard style={{ maxWidth: 400, margin: '0 auto' }}>
          <h1>Nurse dashboard</h1>
          {authError && <p role="alert">{authError.message}</p>}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              login(idInput, ['loc-1']);
            }}
          >
            <input value={idInput} onChange={(event) => setIdInput(event.target.value)} placeholder="Nurse ID" />
            <MotionButton type="submit" className="btn-primary" style={{ marginTop: 'var(--space-3)' }}>
              Log in
            </MotionButton>
          </form>
        </MotionCard>
      </PageShell>
    );
  }

  return (
    <PageShell wide>
      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className="row"
        style={{ justifyContent: 'space-between' }}
      >
        <h1>Dashboard - {nurseId}</h1>
        <div className="row">
          <MotionButton type="button" onClick={() => setShowPolicy((prev) => !prev)}>
            {showPolicy ? 'Hide acuity policy' : 'Acuity policy'}
          </MotionButton>
          <MotionButton type="button" onClick={() => setConfirmingClear(true)}>
            Clear queue
          </MotionButton>
        </div>
      </motion.div>

      <AnimatePresence>
        {confirmingClear && (
          <motion.div variants={fadeUpSmall} initial="hidden" animate="visible" exit="hidden">
            <MotionCard style={{ borderColor: 'var(--color-danger)' }}>
              <p role="alert" style={{ margin: 0 }}>
                This will remove all {queue.length} patient{queue.length === 1 ? '' : 's'} currently in the queue.
                This cannot be undone.
              </p>
              <div className="row">
                <MotionButton
                  type="button"
                  className="btn-primary"
                  style={{ background: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
                  onClick={handleClearQueue}
                  disabled={clearing}
                >
                  {clearing ? 'Clearing...' : 'Yes, clear the queue'}
                </MotionButton>
                <MotionButton type="button" onClick={() => setConfirmingClear(false)} disabled={clearing}>
                  Cancel
                </MotionButton>
              </div>
            </MotionCard>
          </motion.div>
        )}
      </AnimatePresence>

      {queueError && <p role="alert">{queueError.message}</p>}

      <MotionCard>
        <QueueList queue={queue} onSelect={setSelected} />
      </MotionCard>

      <AnimatePresence>
        {selected && (
          <CaseDetail key={selected} sessionId={selected} onClose={() => setSelected(null)} onChanged={refetch} />
        )}
      </AnimatePresence>

      <AnimatePresence>{showPolicy && <AcuityPolicyPanel />}</AnimatePresence>
    </PageShell>
  );
}
