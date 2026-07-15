import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useKioskSession } from './hooks/useKioskSession';
import KioskLanding from './components/KioskLanding';
import ConversationView from './components/ConversationView';
import PhotoCaptureQR from './components/PhotoCaptureQR';
import PhotoCaptureFallback from './components/PhotoCaptureFallback';
import EndScreen from './components/EndScreen';
import CriticalAlert from './components/CriticalAlert';
import PageShell from '../../shared/components/PageShell';
import MotionCard from '../../shared/components/MotionCard';
import MotionButton from '../../shared/components/MotionButton';
import { fadeUp } from '../../shared/motion';

const STEPS = { CONVERSATION: 'conversation', PHOTO: 'photo', END: 'end' };

export default function KioskApp() {
  const {
    sessionId,
    trackToken,
    photoToken,
    status,
    error,
    messages,
    sendMessage,
    transcribeAudio,
    submitPhoto,
    submitWithoutPhoto,
    intakeStatus,
  } = useKioskSession();
  const [landed, setLanded] = useState(false);
  const [step, setStep] = useState(STEPS.CONVERSATION);
  const [usingFallback, setUsingFallback] = useState(false);
  // Set once a submission comes back force_escalated (hardFlag category or
  // critical acuity score - see back-end's ReviewRoutingService) - swaps
  // EndScreen for CriticalAlert instead of the normal "you're all set" flow.
  const [escalated, setEscalated] = useState(false);
  const autoSubmittedRef = useRef(false);

  // No button, no waiting for a tap - a voice-only patient has no way to
  // press "Submit", and even for typed intake there's nothing left to
  // confirm once the LLM itself has already said it's ready to proceed.
  // Guarded by the ref (not just intakeStatus) so a re-render never fires
  // this a second time for the same conversation. Waits 5s before actually
  // leaving the conversation screen - without it, the assistant's final
  // message appears and the screen moves on to the QR/all-set page in the
  // same instant, too fast to actually read what it said.
  useEffect(() => {
    if (intakeStatus === 'ready_no_photo' && !autoSubmittedRef.current) {
      autoSubmittedRef.current = true;
      const timer = setTimeout(() => {
        handleSubmitWithoutPhoto();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [intakeStatus]);

  // The LLM already flagged this mid-conversation as very high risk (see
  // LlmService's "emergency" status) and the backend already force-escalated
  // the session (kioskController.postMessage) - nothing left to submit, and
  // no reason to wait: unlike ready_no_photo's 5s "let them read the wrap-up
  // message" delay, every second here is a second not walking to the front
  // desk.
  useEffect(() => {
    if (intakeStatus === 'emergency') {
      setEscalated(true);
      setStep(STEPS.END);
    }
  }, [intakeStatus]);

  // Landing (warning + Start button) renders immediately, before checking
  // session status - it must never be blocked on the background session
  // creation request finishing. The "Starting your session..."/error states
  // below only matter once the patient has actually pressed Start.
  if (!landed) {
    return (
      <PageShell>
        <motion.h1 variants={fadeUp} initial="hidden" animate="visible">
          HMH Triage Aide
        </motion.h1>
        <KioskLanding onStart={() => setLanded(true)} />
      </PageShell>
    );
  }

  if (status === 'creating')
    return (
      <PageShell>
        <p>Starting your session...</p>
      </PageShell>
    );
  if (status === 'error')
    return (
      <PageShell>
        <p role="alert">Could not start a session: {error?.message}</p>
      </PageShell>
    );

  function handlePhoneSubmitted(session) {
    // The phone already called POST /mobile-capture/:photoToken/photo by the
    // time PhotoCaptureQR's polling sees the status flip - nothing left to
    // submit, just reflect what that submission already decided.
    if (session?.status === 'force_escalated') setEscalated(true);
    setStep(STEPS.END);
  }

  async function handleFallbackCaptured({ imageBase64, woundBox }) {
    const data = await submitPhoto({ imageBase64, woundBox });
    if (data?.escalated) setEscalated(true);
    setStep(STEPS.END);
  }

  async function handleSubmitWithoutPhoto() {
    const data = await submitWithoutPhoto();
    if (data?.escalated) setEscalated(true);
    setStep(STEPS.END);
  }

  const trackUrl = trackToken ? `${window.location.origin}/track/${trackToken}` : null;

  return (
    <PageShell>
      <motion.h1 variants={fadeUp} initial="hidden" animate="visible">
        HMH Triage Aide
      </motion.h1>

      <AnimatePresence mode="wait">
        {step === STEPS.CONVERSATION && (
          <motion.div key="conversation" variants={fadeUp} initial="hidden" animate="visible" exit="hidden">
            <ConversationView
              messages={messages}
              onSend={sendMessage}
              onTranscribe={transcribeAudio}
              onContinue={() => setStep(STEPS.PHOTO)}
              intakeStatus={intakeStatus}
            />
          </motion.div>
        )}

        {step === STEPS.PHOTO && !usingFallback && (
          <motion.div key="photo-qr" variants={fadeUp} initial="hidden" animate="visible" exit="hidden">
            <MotionCard inheritMotion>
              <PhotoCaptureQR sessionId={sessionId} photoToken={photoToken} onPhoneSubmitted={handlePhoneSubmitted} />
              <MotionButton type="button" onClick={() => setUsingFallback(true)}>
                No phone? Use kiosk camera instead
              </MotionButton>
            </MotionCard>
          </motion.div>
        )}

        {step === STEPS.PHOTO && usingFallback && (
          <motion.div key="photo-fallback" variants={fadeUp} initial="hidden" animate="visible" exit="hidden">
            <PhotoCaptureFallback onCaptured={handleFallbackCaptured} testImagesEnabled />
          </motion.div>
        )}

        {step === STEPS.END && (
          <motion.div key="end" variants={fadeUp} initial="hidden" animate="visible" exit="hidden">
            {escalated ? <CriticalAlert /> : <EndScreen sessionId={sessionId} trackUrl={trackUrl} />}
          </motion.div>
        )}
      </AnimatePresence>
    </PageShell>
  );
}
