import MotionCard from '../../../shared/components/MotionCard';

// Shown in place of the normal end-of-intake screen whenever a session comes
// back force_escalated - either a hardFlag category (ReviewRoutingService.
// forceEscalate) or a critical acuity score (isCriticalScore) tripped it.
// Rendered from three places depending on how the patient was interacting
// at the moment escalation happened: KioskApp (typed/voice or kiosk-camera
// fallback), MobileCaptureApp (their own phone, if that's what they used to
// take the photo), and PhotoCaptureQR's poll (phone submitted, kiosk screen
// picks it up).
export default function CriticalAlert() {
  return (
    <MotionCard>
      <p className="alert-banner alert-banner--large" role="alert">
        ⚠ Please go to the front desk immediately.
      </p>
      <p style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
        Your case needs immediate attention - a staff member is expecting you now.
      </p>
    </MotionCard>
  );
}
