import { useState } from 'react';
import { useDashboardAuth } from './hooks/useDashboardAuth';
import { useQueueSocket } from './hooks/useQueueSocket';
import QueueList from './components/QueueList';
import CaseDetail from './components/CaseDetail';
import AcuityPolicyPanel from './components/AcuityPolicyPanel';

export default function DashboardApp() {
  const { nurseId, isAuthenticated, login, error: authError } = useDashboardAuth();
  const { queue, error: queueError, refetch } = useQueueSocket();
  const [selected, setSelected] = useState(null);
  const [idInput, setIdInput] = useState('');
  const [showPolicy, setShowPolicy] = useState(false);

  if (!isAuthenticated) {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          login(idInput, ['loc-1']);
        }}
      >
        <input value={idInput} onChange={(event) => setIdInput(event.target.value)} placeholder="Nurse ID" />
        <button type="submit">Log in (dev)</button>
        {authError && <p role="alert">{authError.message}</p>}
      </form>
    );
  }

  return (
    <div>
      <h1>Dashboard - {nurseId}</h1>
      {queueError && <p role="alert">{queueError.message}</p>}
      <QueueList queue={queue} onSelect={setSelected} />
      <CaseDetail sessionId={selected} onClose={() => setSelected(null)} onChanged={refetch} />

      <button type="button" onClick={() => setShowPolicy((prev) => !prev)}>
        {showPolicy ? 'Hide acuity policy' : 'Acuity policy'}
      </button>
      {showPolicy && <AcuityPolicyPanel />}
    </div>
  );
}
