import MotionButton from '../../../shared/components/MotionButton';

// First screen a patient sees at the kiosk - deliberately gates the
// conversation behind a real tap (rather than starting the chat the instant
// the page loads) so the safety warning below is guaranteed to be seen
// first, not something that could scroll by unread while intake is already
// underway. The session itself is already being created in the background
// by the time this renders (see useKioskSession) - pressing Start just
// reveals the conversation, it doesn't trigger the request.
export default function KioskLanding({ onStart }) {
  return (
    <>
      <p className="alert-banner" role="alert">
        If you are bleeding severely or have a life-threatening injury, go to the front desk immediately.
      </p>
      <MotionButton
        type="button"
        className="btn-primary"
        onClick={onStart}
        style={{
          width: '100%',
          fontSize: 'var(--text-xl)',
          padding: '1.75rem',
        }}
      >
        Start
      </MotionButton>
    </>
  );
}
