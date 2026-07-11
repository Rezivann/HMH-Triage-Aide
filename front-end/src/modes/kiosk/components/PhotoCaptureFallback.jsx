import { useEffect, useRef, useState } from 'react';
import { checkPhotoQuality } from './QualityCheck';
import NailBoxSelector from './NailBoxSelector';

// On-kiosk camera fallback for patients without a phone. Captures a still
// frame, runs the on-device quality check, then hands off to NailBoxSelector
// so the patient can box the nail of the finger they're pointing at the
// wound with (SAM's segmentation prompt) before anything is submitted.
// Actual image upload to the CV pipeline isn't wired up yet - POST
// /kiosk/photo doesn't accept image bytes until CvServiceClient and
// ml-service exist for real (see back-end/src/services/CvServiceClient.js) -
// nailBox is passed upward regardless so the wiring is ready once that lands.
export default function PhotoCaptureFallback({ onCaptured }) {
  const videoRef = useRef(null);
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(false);
  const [capturedBlob, setCapturedBlob] = useState(null);

  useEffect(() => {
    let stream;
    navigator.mediaDevices
      ?.getUserMedia({ video: true })
      .then((s) => {
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch((err) => setError(err.message));

    return () => stream?.getTracks().forEach((track) => track.stop());
  }, []);

  async function handleCapture() {
    setChecking(true);
    setError(null);

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg'));
    const quality = await checkPhotoQuality(blob);
    setChecking(false);

    if (!quality.passed) {
      setError('Photo quality check failed - please retake.');
      return;
    }

    setCapturedBlob(blob);
  }

  if (capturedBlob) {
    return (
      <NailBoxSelector
        imageBlob={capturedBlob}
        onRetake={() => setCapturedBlob(null)}
        onConfirm={({ nailBox }) => onCaptured({ blob: capturedBlob, nailBox })}
        onSkip={() => onCaptured({ blob: capturedBlob, nailBox: null })}
      />
    );
  }

  return (
    <div>
      {error && <p role="alert">{error}</p>}
      <video ref={videoRef} autoPlay playsInline muted />
      <button type="button" onClick={handleCapture} disabled={checking}>
        {checking ? 'Checking...' : 'Capture Photo'}
      </button>
    </div>
  );
}
