import { useEffect, useRef, useState } from 'react';
import { checkPhotoQuality } from './QualityCheck';

// On-kiosk camera fallback for patients without a phone. Captures a still
// frame and runs the on-device quality check, then hands off to the parent
// to submit. Actual image upload to the CV pipeline isn't wired up yet -
// POST /kiosk/photo doesn't accept image bytes until CvServiceClient and
// ml-service exist for real (see back-end/src/services/CvServiceClient.js).
export default function PhotoCaptureFallback({ onCaptured }) {
  const videoRef = useRef(null);
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(false);

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

    onCaptured(blob);
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
