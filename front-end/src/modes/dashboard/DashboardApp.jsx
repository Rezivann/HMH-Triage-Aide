import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useDashboardAuth } from './hooks/useDashboardAuth';
import { useQueueSocket } from './hooks/useQueueSocket';
import QueueList from './components/QueueList';
import CaseDetail from './components/CaseDetail';
import AcuityPolicyPanel from './components/AcuityPolicyPanel';
import PageShell from '../../shared/components/PageShell';
import MotionCard from '../../shared/components/MotionCard';
import MotionButton from '../../shared/components/MotionButton';
import { fadeUp } from '../../shared/motion';

export default function DashboardApp() {
  const { nurseId, isAuthenticated, login, error: authError } = useDashboardAuth();
  const { queue, error: queueError, refetch } = useQueueSocket();
  const [selected, setSelected] = useState(null);
  const [idInput, setIdInput] = useState('');
  const [showPolicy, setShowPolicy] = useState(false);

  if (!isAuthenticated) {
    return (
      <PageShell>
        <MotionCard style={{ maxWidth: 400, margin: '0 auto' }}>
          <h1>Nurse dashboard</h1>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              login(idInput, ['loc-1']);
            }}
          >
            <input value={idInput} onChange={(event) => setIdInput(event.target.value)} placeholder="Nurse ID" />
            <MotionButton type="submit" className="btn-primary" style={{ marginTop: 'var(--space-3)' }}>
              Log in (dev)
            </MotionButton>
            {authError && <p role="alert">{authError.message}</p>}
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
        <MotionButton type="button" onClick={() => setShowPolicy((prev) => !prev)}>
          {showPolicy ? 'Hide acuity policy' : 'Acuity policy'}
        </MotionButton>
      </motion.div>

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
