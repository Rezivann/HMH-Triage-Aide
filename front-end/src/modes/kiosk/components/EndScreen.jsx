// Final kiosk screen. The brief calls for two QR codes here (photo-session
// confirmation + tracker link) - only the tracker link is wireable today,
// since the photo-session confirmation depends on the mobile capture route
// that PhotoCaptureQR.jsx also flags as not yet built.
//
// TODO: render an actual QR code (e.g. via a qrcode library) once one is
// added as a dependency - this shows the raw URL until then.
export default function EndScreen({ sessionId, trackUrl }) {
  return (
    <div>
      <h2>You're all set</h2>
      <p>Scan the code below to track your status:</p>
      <pre>{trackUrl}</pre>
      <p>Session reference: {sessionId}</p>
    </div>
  );
}
