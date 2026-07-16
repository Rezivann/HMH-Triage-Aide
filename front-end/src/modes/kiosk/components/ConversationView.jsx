import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import MotionCard from '../../../shared/components/MotionCard';
import MotionButton from '../../../shared/components/MotionButton';
import { fadeUpSmall } from '../../../shared/motion';

const SpeechRecognitionCtor =
  typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
const canRecordAudio =
  typeof window !== 'undefined' && !!window.MediaRecorder && !!navigator.mediaDevices?.getUserMedia;

// Browser-native stand-in for what Cisco Webex AI Agent Studio's voice
// channel does for real (see back-end's voiceRoutes.js/voiceAuth.js) - mic
// in via SpeechRecognition, feeding the exact same onSend/sendMessage path a
// typed turn already uses. Text-to-speech was dropped (sounded too robotic
// to be worth it) - the assistant's reply is only ever shown as text, same
// as the typed-conversation path.
//
// SpeechRecognition doesn't exist on every browser (Webex Desk's RoomOS
// browser has none) - onTranscribe is the fallback for those: record raw
// audio with MediaRecorder and send it to the backend's Whisper-backed
// /kiosk/transcribe instead of transcribing client-side. Claude has no
// audio-input modality, so this can't just be routed through LlmService.
export default function ConversationView({ messages, onSend, onTranscribe, onContinue, sending, intakeStatus }) {
  const [draft, setDraft] = useState('');
  const [voiceMode, setVoiceMode] = useState(false);
  const [listening, setListening] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState(null);
  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const lastHeardIndexRef = useRef(-1);
  // Plain refs, not just the voiceMode/gotResult state - onend/onerror are
  // closures created once per recognition instance, so they'd otherwise see
  // whatever voiceMode was at the moment startListening() was called, not
  // its latest value (a React state variable isn't a live binding inside an
  // event handler captured earlier).
  const voiceModeRef = useRef(false);
  const gotResultRef = useRef(false);
  // Caps the auto-restart-on-no-result loop - without this, a persistent
  // failure to actually capture audio (e.g. the mic hardware race below, on
  // a device/browser where the delay isn't enough) would restart forever,
  // silently flashing Listening/Waiting rather than ever telling the
  // patient something's actually wrong.
  const consecutiveNoResultsRef = useRef(0);
  const MAX_CONSECUTIVE_NO_RESULTS = 3;

  function setVoiceModeAndRef(value) {
    voiceModeRef.current = value;
    setVoiceMode(value);
  }

  // Fatal error codes need the patient to actually do something (grant
  // permission, check their mic) - everything else (no-speech, aborted,
  // network) is exactly the kind of transient hiccup mobile's more
  // aggressive pause-detection causes constantly, and should just resume
  // listening rather than reading as "voice is broken."
  const FATAL_SPEECH_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'audio-capture']);

  function startListening() {
    if (!SpeechRecognitionCtor) return;
    setVoiceError(null);
    gotResultRef.current = false;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      gotResultRef.current = true;
      consecutiveNoResultsRef.current = 0;
      const transcript = event.results[event.results.length - 1][0].transcript.trim();
      if (transcript) onSend(transcript);
    };
    recognition.onend = () => {
      setListening(false);
      // Mobile browsers routinely end recognition mid-sentence on a brief
      // pause, with no error and no result at all - previously this just
      // went silent, stuck on "Waiting..." until the patient noticed and
      // manually stopped/restarted. Auto-restart instead, as long as voice
      // mode is still on (a real error or Stop already turned it off) and
      // we haven't already failed several times in a row.
      if (!gotResultRef.current && voiceModeRef.current) {
        consecutiveNoResultsRef.current += 1;
        if (consecutiveNoResultsRef.current > MAX_CONSECUTIVE_NO_RESULTS) {
          setVoiceError("Having trouble hearing you - please try typing instead, or tap Start Talking to try again.");
          setVoiceModeAndRef(false);
          consecutiveNoResultsRef.current = 0;
          return;
        }
        setTimeout(() => {
          if (voiceModeRef.current) startListening();
        }, 300);
      }
    };
    recognition.onerror = (event) => {
      // event.error is one of SpeechRecognition's fixed error codes -
      // surfaced to the console since this was previously failing
      // completely silently either way.
      console.error('SpeechRecognition error:', event.error);
      if (FATAL_SPEECH_ERRORS.has(event.error)) {
        setVoiceError(
          event.error === 'audio-capture'
            ? 'No microphone could be found. Please check your device and try again.'
            : 'Microphone access was denied. Please allow microphone access for this site and try again.'
        );
        setVoiceModeAndRef(false);
      }
      setListening(false);
      // onend always fires right after onerror, and will see the
      // just-updated voiceModeRef - no separate restart logic needed here.
    };

    recognitionRef.current = recognition;

    // Called directly and synchronously - no getUserMedia priming step
    // beforehand. That priming (grab a stream just to force a permission
    // prompt, then stop it and start recognition separately) was meant for
    // embedded browsers that don't reliably prompt on their own, but on real
    // mobile Chrome it caused exactly the reported bug: the getUserMedia
    // stream release raced against SpeechRecognition's own mic acquisition,
    // AND any delay in between (needed to dodge that race) pushed
    // recognition.start() outside the original tap's user-activation window
    // - Chrome then silently denied it, showing as "access allowed" (the
    // getUserMedia prompt succeeded) immediately followed by "microphone
    // access denied" (the delayed, no-longer-gesture-backed recognition.start()
    // call failing). Calling it directly, in the same tick as the tap that
    // triggered it, avoids both problems at once.
    try {
      recognition.start();
      setListening(true);
    } catch (err) {
      console.error('SpeechRecognition failed to start:', err.name, err.message);
      setVoiceError(`Could not start listening: ${err.message}`);
      setVoiceModeAndRef(false);
    }
  }

  function handleStartVoice() {
    setVoiceModeAndRef(true);
    // First turn has no assistant reply to wait for - start listening the
    // moment voice mode begins, same as a patient walking up and just
    // starting to talk.
    startListening();
  }

  function handleStopVoice() {
    setVoiceModeAndRef(false);
    recognitionRef.current?.stop();
    setListening(false);
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // Push-to-talk fallback for browsers with no SpeechRecognition - one
  // record/stop cycle per turn (no hands-free auto-continuation like the
  // SpeechRecognition path above, since there's no "recognition ended"
  // signal to resume on).
  async function startRecording() {
    setVoiceError(null);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error('Microphone permission request failed:', err.name, err.message);
      setVoiceError(
        err.name === 'NotAllowedError'
          ? 'Microphone access was denied. Please allow microphone access for this site and try again.'
          : `Could not access the microphone: ${err.message}`
      );
      return;
    }

    const recorder = new MediaRecorder(stream);
    audioChunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunksRef.current.push(event.data);
    };
    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      setTranscribing(true);
      try {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
        const audioBase64 = await blobToBase64(blob);
        const transcript = await onTranscribe(audioBase64, recorder.mimeType);
        if (transcript?.trim()) onSend(transcript.trim());
      } catch (err) {
        console.error('Transcription failed:', err.message);
        setVoiceError(`Could not transcribe that recording: ${err.message}. Please try again.`);
      } finally {
        setTranscribing(false);
      }
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    setRecording(true);
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
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
  // for, so stop cleanly rather than leaving the mic hot. voiceModeRef must
  // clear too, not just the recognition itself - stop() fires onend just
  // like a natural pause does, and onend's own auto-restart-on-no-result
  // logic would otherwise kick back in right after this intentional stop.
  useEffect(() => {
    if (intakeStatus !== 'asking') {
      voiceModeRef.current = false;
      recognitionRef.current?.stop();
    }
  }, [intakeStatus]);

  useEffect(() => {
    return () => {
      voiceModeRef.current = false;
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

      {voiceError && <p role="alert">{voiceError}</p>}

      {!SpeechRecognitionCtor && !canRecordAudio && (
        // Visible instead of just hiding the button - "nothing renders" and
        // "renders but voice input is unsupported" look identical to a user
        // with no way to check devtools (e.g. on locked-down kiosk
        // hardware), so this makes the actual cause checkable on-device.
        <p className="status-pill status-pill--neutral" style={{ fontSize: '0.8rem' }}>
          Voice input unavailable: this browser has no SpeechRecognition or microphone access API.
        </p>
      )}

      {!SpeechRecognitionCtor && canRecordAudio && onTranscribe && (
        <div className="row">
          {transcribing ? (
            <p className="status-pill status-pill--neutral">Transcribing...</p>
          ) : !recording ? (
            <MotionButton type="button" className="btn-primary" onClick={startRecording} disabled={sending}>
              🎙️ Record & Send
            </MotionButton>
          ) : (
            <>
              <motion.p
                className="status-pill status-pill--accent"
                animate={{ opacity: [1, 0.55, 1] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
              >
                🔴 Recording...
              </motion.p>
              <MotionButton type="button" onClick={stopRecording}>
                Stop & Send
              </MotionButton>
            </>
          )}
        </div>
      )}

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
