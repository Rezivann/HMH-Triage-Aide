import { useState } from 'react';
import { useParams } from 'react-router-dom';
import PhotoCaptureFallback from './components/PhotoCaptureFallback';
import CriticalAlert from './components/CriticalAlert';
import PageShell from '../../shared/components/PageShell';
import MotionCard from '../../shared/components/MotionCard';
import { mobileCaptureRequest } from '../../shared/api/apiClient';

// The page a patient's own phone lands on after scanning PhotoCaptureQR's
// code. photoToken is a short-lived, single-session-scoped JWT (minted at
// session creation - see kioskController.createSession, verified by
// photoAuth.js) - it's the only credential this page ever has, deliberately
// never the kiosk device's own long-lived x-kiosk-api-key. Reuses
// PhotoCaptureFallback wholesale for the actual camera + wound box-selection
// flow - identical UI to the on-kiosk fallback path, just a different
// submission target and no session step afterward (the kiosk screen
// advances on its own once PhotoCaptureQR's polling sees this land).
export default function MobileCaptureApp() {
  const { photoToken } = useParams();
  const [submitted, setSubmitted] = useState(false);
  // Set when the submission itself comes back force_escalated (hardFlag
  // category or critical acuity score) - this is the one path where "tell
  // them on their phone" is literal, since the phone is the device the
  // patient is actually looking at right now.
  const [escalated, setEscalated] = useState(false);
  const [error, setError] = useState(null);

  async function handleCaptured({ imageBase64, woundBox }) {
    setError(null);
    try {
      const data = await mobileCaptureRequest(`/mobile-capture/${photoToken}/photo`, {
        method: 'POST',
        body: { imageBase64, woundBox },
      });
      if (data?.escalated) setEscalated(true);
      setSubmitted(true);
    } catch (err) {
      setError(err);
    }
  }

  if (submitted) {
    return (
      <PageShell>
        {escalated ? (
          <CriticalAlert />
        ) : (
          <MotionCard>
            <p>Photo submitted - you can put your phone away and return to the kiosk.</p>
          </MotionCard>
        )}
      </PageShell>
    );
  }

  return (
    <PageShell>
      <h1>LLMTriage</h1>
      {error && <p role="alert">Could not submit photo: {error.message}. Please try again.</p>}
      <PhotoCaptureFallback onCaptured={handleCaptured} />
    </PageShell>
  );
}
