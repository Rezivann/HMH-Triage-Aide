import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import MotionCard from '../../../shared/components/MotionCard';
import MotionButton from '../../../shared/components/MotionButton';
import { fadeUpSmall } from '../../../shared/motion';

export default function ConversationView({ messages, onSend, onContinue, onSubmitWithoutPhoto, sending, intakeStatus }) {
  const [draft, setDraft] = useState('');

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
            <MotionButton type="button" className="btn-primary" onClick={onSubmitWithoutPhoto}>
              Submit
            </MotionButton>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionCard>
  );
}
