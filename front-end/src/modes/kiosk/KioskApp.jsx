import { useState } from 'react';
import { useKioskSession } from './hooks/useKioskSession';
import ConversationView from './components/ConversationView';
import PhotoCaptureQR from './components/PhotoCaptureQR';
import PhotoCaptureFallback from './components/PhotoCaptureFallback';
import EndScreen from './components/EndScreen';

const STEPS = { CONVERSATION: 'conversation', PHOTO: 'photo', END: 'end' };

export default function KioskApp() {
  const { sessionId, trackToken, status, error, messages, sendMessage, submitPhoto } = useKioskSession();
  const [step, setStep] = useState(STEPS.CONVERSATION);
  const [usingFallback, setUsingFallback] = useState(false);

  if (status === 'creating') return <p>Starting your session...</p>;
  if (status === 'error') return <p role="alert">Could not start a session: {error?.message}</p>;

  function handlePhoneSubmitted() {
    // The phone already called POST /kiosk/photo on this session by the time
    // PhotoCaptureQR's polling sees the status flip - nothing left to submit.
    setStep(STEPS.END);
  }

  async function handleFallbackCaptured({ nailBox }) {
    // blob itself still isn't uploaded (see PhotoCaptureFallback's header
    // comment) - nailBox goes through as an override now so the wiring is
    // in place once CvServiceClient actually sends image bytes.
    await submitPhoto({ nailBox });
    setStep(STEPS.END);
  }

  const trackUrl = trackToken ? `${window.location.origin}/track/${trackToken}` : null;

  return (
    <div>
      {step === STEPS.CONVERSATION && (
        <ConversationView messages={messages} onSend={sendMessage} onContinue={() => setStep(STEPS.PHOTO)} />
      )}

      {step === STEPS.PHOTO && !usingFallback && (
        <>
          <PhotoCaptureQR sessionId={sessionId} onPhoneSubmitted={handlePhoneSubmitted} />
          <button type="button" onClick={() => setUsingFallback(true)}>
            No phone? Use kiosk camera instead
          </button>
        </>
      )}

      {step === STEPS.PHOTO && usingFallback && <PhotoCaptureFallback onCaptured={handleFallbackCaptured} />}

      {step === STEPS.END && <EndScreen sessionId={sessionId} trackUrl={trackUrl} />}
    </div>
  );
}
