import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import MotionCard from '../../../shared/components/MotionCard';
import MotionButton from '../../../shared/components/MotionButton';
import { fadeUpSmall } from '../../../shared/motion';

const SpeechRecognitionCtor =
  typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

// Browser-native stand-in for what Cisco Webex AI Agent Studio's voice
// channel does for real (see back-end's voiceRoutes.js/voiceAuth.js) - mic
// in via SpeechRecognition, feeding the exact same onSend/sendMessage path a
// typed turn already uses. Text-to-speech was dropped (sounded too robotic
// to be worth it) - the assistant's reply is only ever shown as text, same
// as the typed-conversation path.
export default function ConversationView({ messages, onSend, onContinue, sending, intakeStatus }) {
  const [draft, setDraft] = useState('');
  const [voiceMode, setVoiceMode] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const lastHeardIndexRef = useRef(-1);

  function startListening() {
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1][0].transcript.trim();
      if (transcript) onSend(transcript);
    };
    // Recognition stops itself after a pause in speech (one turn) - this
    // just clears the "listening" indicator, not an error state. Resuming
    // for the next turn happens once the assistant's reply arrives (see the
    // effect below), not from here, so it doesn't restart mid-request.
    recognition.onend = () => setListening(false);
    recognition.onerror = (event) => {
      // event.error is one of SpeechRecognition's fixed error codes
      // (no-speech, audio-capture, not-allowed, network, etc) - surfaced to
      // the console since this was previously failing completely silently.
      console.error('SpeechRecognition error:', event.error);
      setListening(false);
    };

    recognitionRef.current = recognition;

    // Some embedded/kiosk-mode Chromium browsers (seen on Webex Desk
    // hardware) never surface the native mic permission prompt when
    // SpeechRecognition.start() is called directly - getUserMedia() is a
    // more reliably-honored trigger for that same permission prompt across
    // browsers. The stream itself isn't used (SpeechRecognition opens its
    // own), it's purely to force the prompt before recognition tries to run.
    navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((stream) => {
        stream.getTracks().forEach((track) => track.stop());
        recognition.start();
        setListening(true);
      })
      .catch((err) => {
        console.error('Microphone permission request failed:', err.name, err.message);
      });
  }

  function handleStartVoice() {
    setVoiceMode(true);
    // First turn has no assistant reply to wait for - start listening the
    // moment voice mode begins, same as a patient walking up and just
    // starting to talk.
    startListening();
  }

  function handleStopVoice() {
    setVoiceMode(false);
    recognitionRef.current?.stop();
    setListening(false);
  }

  // Resumes listening for the patient's next turn as soon as the
  // assistant's reply arrives - the actual back-and-forth loop, now that
  // there's no speech playback to wait for first. Guarded by
  // lastHeardIndexRef so a reply never triggers this more than once across
  // re-renders.
  useEffect(() => {
    if (!voiceMode || messages.length === 0 || intakeStatus !== 'asking') return;
    const lastIndex = messages.length - 1;
    if (lastIndex === lastHeardIndexRef.current) return;
    const last = messages[lastIndex];
    if (last.role !== 'assistant') return;

    lastHeardIndexRef.current = lastIndex;
    startListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, voiceMode, intakeStatus]);

  // Intake wrapped up (or the screen changed away) - nothing left to listen
  // for, so stop cleanly rather than leaving the mic hot.
  useEffect(() => {
    if (intakeStatus !== 'asking') {
      recognitionRef.current?.stop();
    }
  }, [intakeStatus]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  function handleSubmit(event) {
    event.preventDefault();
    if (!draft.trim()) return;
    onSend(draft.trim());
    setDraft('');
  }

  return (
    <MotionCard>
      <ul style={{ gap: 'var(--space-3)' }}>
        <AnimatePresence initial={false}>
          {messages.map((message, index) => {
            const isPatient = message.role === 'patient';
            return (
              <motion.li
                key={index}
                variants={fadeUpSmall}
                initial="hidden"
                animate="visible"
                style={{
                  display: 'flex',
                  justifyContent: isPatient ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    maxWidth: '80%',
                    padding: '0.75rem 1.125rem',
                    borderRadius: isPatient ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    background: isPatient ? 'var(--color-accent-soft)' : 'var(--color-surface-2)',
                    color: isPatient ? 'var(--color-accent-hover)' : 'var(--color-text)',
                    border: `1px solid ${isPatient ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  }}
                >
                  {message.text}
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      <form onSubmit={handleSubmit} className="row">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Describe what's wrong..."
          disabled={sending}
          style={{ flex: 1 }}
        />
        <MotionButton type="submit" className="btn-primary" disabled={sending || !draft.trim()}>
          Send
        </MotionButton>
      </form>

      {SpeechRecognitionCtor && (
        <div className="row">
          {!voiceMode ? (
            <MotionButton type="button" className="btn-primary" onClick={handleStartVoice}>
              🎤 Start Talking
            </MotionButton>
          ) : (
            <>
              <motion.p
                className={`status-pill ${listening ? 'status-pill--accent' : 'status-pill--neutral'}`}
                animate={listening ? { opacity: [1, 0.55, 1] } : { opacity: 1 }}
                transition={{ duration: 1.2, repeat: listening ? Infinity : 0, ease: 'easeInOut' }}
              >
                {listening ? '🎤 Listening...' : 'Waiting...'}
              </motion.p>
              <MotionButton type="button" onClick={handleStopVoice}>
                Stop
              </MotionButton>
            </>
          )}
        </div>
      )}

      <AnimatePresence>
        {intakeStatus === 'ready_for_photo' && (
          <motion.div key="ready-for-photo" variants={fadeUpSmall} initial="hidden" animate="visible" exit="hidden">
            <MotionButton type="button" className="btn-primary" onClick={onContinue}>
              Continue to photo
            </MotionButton>
          </motion.div>
        )}

        {intakeStatus === 'ready_no_photo' && (
          <motion.div key="ready-no-photo" variants={fadeUpSmall} initial="hidden" animate="visible" exit="hidden">
            {/* Auto-submitted by KioskApp - this is feedback, not a button to
                press (a voice-only patient has no way to tap anything). */}
            <p className="status-pill status-pill--neutral">Wrapping up...</p>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionCard>
  );
}
