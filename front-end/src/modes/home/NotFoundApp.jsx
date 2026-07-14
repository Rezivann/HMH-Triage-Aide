import { useNavigate } from 'react-router-dom';
import PageShell from '../../shared/components/PageShell';
import MotionButton from '../../shared/components/MotionButton';

// Catch-all for any URL that doesn't match a real route (see router.jsx's
// path: '*') - a blank screen on a kiosk/dashboard device reads as "the app
// crashed", so this gives a clear, styled way back instead of nothing.
export default function NotFoundApp() {
  const navigate = useNavigate();

  return (
    <PageShell className="hero-glow">
      <div
        style={{
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-4)',
        }}
      >
        <h1 className="hero-heading">404</h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-lg)', maxWidth: '26rem' }}>
          This page doesn't exist. If you followed a link or scanned a code to get here, it may be out of date.
        </p>
        <MotionButton type="button" className="btn-primary" onClick={() => navigate('/')}>
          Back to home
        </MotionButton>
      </div>
    </PageShell>
  );
}
