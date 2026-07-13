import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import PageShell from '../../shared/components/PageShell';
import MotionCard from '../../shared/components/MotionCard';
import MotionButton from '../../shared/components/MotionButton';
import { fadeUp, fadeUpSmall, staggerContainer } from '../../shared/motion';

// Landing page at "/" - three entry points into the app: kiosk (patient
// intake device), dashboard (nurse queue view), and track (patient-facing
// status lookup, which needs a session token typed in since there's no QR
// code to scan on this screen).
export default function HomeApp() {
  const [sessionId, setSessionId] = useState('');
  const navigate = useNavigate();

  function handleTrackSubmit(event) {
    event.preventDefault();
    const trimmed = sessionId.trim();
    if (!trimmed) return;
    navigate(`/track/${trimmed}`);
  }

  return (
    <PageShell className="hero-glow">
      <motion.div variants={fadeUp} initial="hidden" animate="visible" style={{ textAlign: 'center' }}>
        <h1 className="hero-heading">LLMTriage</h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-lg)', maxWidth: '30rem', margin: '0 auto' }}>
          AI-assisted intake and acuity triage - pick where you're starting from.
        </p>
      </motion.div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
      >
        <Link to="/kiosk" style={{ textDecoration: 'none', display: 'block' }}>
          <MotionCard inheritMotion variants={fadeUpSmall} className="card--interactive" whileHover={{ y: -4 }}>
            <h2>Kiosk</h2>
            <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>
              Start a patient intake session on this device.
            </p>
          </MotionCard>
        </Link>

        <Link to="/dashboard" style={{ textDecoration: 'none', display: 'block' }}>
          <MotionCard inheritMotion variants={fadeUpSmall} className="card--interactive" whileHover={{ y: -4 }}>
            <h2>Dashboard</h2>
            <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>View the triage queue and nurse tools.</p>
          </MotionCard>
        </Link>

        <MotionCard inheritMotion variants={fadeUpSmall} as="form" onSubmit={handleTrackSubmit}>
          <h2>Track a session</h2>
          <div className="row">
            <input
              value={sessionId}
              onChange={(event) => setSessionId(event.target.value)}
              placeholder="Session ID"
              style={{ flex: 1 }}
            />
            <MotionButton type="submit" className="btn-primary" disabled={!sessionId.trim()}>
              Track
            </MotionButton>
          </div>
        </MotionCard>
      </motion.div>
    </PageShell>
  );
}
