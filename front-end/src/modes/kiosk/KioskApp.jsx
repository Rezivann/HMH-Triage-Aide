import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useKioskSession } from './hooks/useKioskSession';
import ConversationView from './components/ConversationView';
import PhotoCaptureQR from './components/PhotoCaptureQR';
import PhotoCaptureFallback from './components/PhotoCaptureFallback';
import EndScreen from './components/EndScreen';
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
    submitPhoto,
    submitWithoutPhoto,
    intakeStatus,
  } = useKioskSession();
  const [step, setStep] = useState(STEPS.CONVERSATION);
  const [usingFallback, setUsingFallback] = useState(false);

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

  function handlePhoneSubmitted() {
    // The phone already called POST /mobile-capture/:photoToken/photo by the
    // time PhotoCaptureQR's polling sees the status flip - nothing left to submit.
    setStep(STEPS.END);
  }

  async function handleFallbackCaptured({ imageBase64, nailBox, woundBox }) {
    await submitPhoto({ imageBase64, nailBox, woundBox });
    setStep(STEPS.END);
  }

  async function handleSubmitWithoutPhoto() {
    await submitWithoutPhoto();
    setStep(STEPS.END);
  }

  const trackUrl = trackToken ? `${window.location.origin}/track/${trackToken}` : null;

  return (
    <PageShell>
      <motion.h1 variants={fadeUp} initial="hidden" animate="visible">
        LLMTriage
      </motion.h1>

      <AnimatePresence mode="wait">
        {step === STEPS.CONVERSATION && (
          <motion.div key="conversation" variants={fadeUp} initial="hidden" animate="visible" exit="hidden">
            <ConversationView
              messages={messages}
              onSend={sendMessage}
              onContinue={() => setStep(STEPS.PHOTO)}
              onSubmitWithoutPhoto={handleSubmitWithoutPhoto}
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
            <PhotoCaptureFallback onCaptured={handleFallbackCaptured} />
          </motion.div>
        )}

        {step === STEPS.END && (
          <motion.div key="end" variants={fadeUp} initial="hidden" animate="visible" exit="hidden">
            <EndScreen sessionId={sessionId} trackUrl={trackUrl} />
          </motion.div>
        )}
      </AnimatePresence>
    </PageShell>
  );
}
