import { useParams } from 'react-router-dom';
import { useTrackerStatus } from './hooks/useTrackerStatus';
import StatusBand from './components/StatusBand';
import PageShell from '../../shared/components/PageShell';

export default function TrackApp() {
  const { sessionToken } = useParams();
  const { status, position, error } = useTrackerStatus(sessionToken);

  if (error) {
    return (
      <PageShell>
        <p role="alert">Could not load your status. Please rescan the code at the kiosk.</p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <h1>Your Status</h1>
      <StatusBand status={status} position={position} />
    </PageShell>
  );
}
