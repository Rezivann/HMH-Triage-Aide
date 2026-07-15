import { useEffect, useRef, useState } from 'react';
import { checkPhotoQuality } from './QualityCheck';
import WoundBoxSelector from './WoundBoxSelector';
import MotionCard from '../../../shared/components/MotionCard';
import MotionButton from '../../../shared/components/MotionButton';

// On-kiosk camera fallback for patients without a phone. Captures a still
// frame, runs the on-device quality check, then hands off to WoundBoxSelector
// (mandatory - there's no CV model to find the wound on its own, so this box
// is Claude's only spatial hint). The captured blob is base64-encoded before
// being handed to onCaptured - matches ml-service's imageRef (a plain
// base64 string, no data: URL prefix) all the way through
// kioskController.postPhoto.
const STEPS = { CAMERA: 'camera', WOUND_BOX: 'woundBox' };

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function PhotoCaptureFallback({ onCaptured }) {
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(false);
  const [capturedBlob, setCapturedBlob] = useState(null);
  const [step, setStep] = useState(STEPS.CAMERA);

  // Depends on `step`, not just mount-once - a retake returns to this same
  // component instance (step flips WOUND_BOX -> CAMERA), and without this
  // dependency the effect would never re-run: the video element that
  // remounts on retake would get srcObject = undefined forever, while the
  // original stream's tracks (attached to a now-gone video element) keep
  // running - camera indicator stays lit, but nothing is shown.
  useEffect(() => {
    if (step !== STEPS.CAMERA) return undefined;

    let stream;
    navigator.mediaDevices
      ?.getUserMedia({ video: true })
      .then((s) => {
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch((err) => setError(err.message));

    return () => stream?.getTracks().forEach((track) => track.stop());
  }, [step]);

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
    setStep(STEPS.WOUND_BOX);
  }

  // Same quality gate and step transition as a live capture - a photo picked
  // from camera roll/files is just a pre-existing Blob (File extends Blob),
  // so it flows through the rest of the component identically from here on.
  async function handleFileSelected(event) {
    const file = event.target.files[0];
    event.target.value = ''; // allow re-selecting the same file after a retake
    if (!file) return;

    setChecking(true);
    setError(null);

    const quality = await checkPhotoQuality(file);
    setChecking(false);

    if (!quality.passed) {
      setError('Photo quality check failed - please choose a different photo.');
      return;
    }

    setCapturedBlob(file);
    setStep(STEPS.WOUND_BOX);
  }

  function handleRetake() {
    setCapturedBlob(null);
    setStep(STEPS.CAMERA);
  }

  if (capturedBlob && step === STEPS.WOUND_BOX) {
    return (
      <WoundBoxSelector
        imageBlob={capturedBlob}
        onRetake={handleRetake}
        onConfirm={async ({ woundBox }) => {
          const imageBase64 = await blobToBase64(capturedBlob);
          // Must return (not fire-and-forget) - WoundBoxSelector awaits this
          // whole chain in its own try/catch, and without returning it here a
          // failure downstream (kioskController's capture_invalid, ml-service
          // down, etc.) becomes an unhandled rejection instead of a message
          // the patient can see, and WoundBoxSelector's "Analyzing..." state
          // never resets since its own await already resolved.
          return onCaptured({ imageBase64, woundBox });
        }}
      />
    );
  }

  return (
    <MotionCard>
      {error && <p role="alert">{error}</p>}
      <video ref={videoRef} autoPlay playsInline muted />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelected}
        style={{ display: 'none' }}
      />
      <div className="row">
        <MotionButton type="button" className="btn-primary" onClick={handleCapture} disabled={checking}>
          {checking ? 'Checking...' : 'Capture Photo'}
        </MotionButton>
        <MotionButton type="button" onClick={() => fileInputRef.current?.click()} disabled={checking}>
          Upload from camera roll / files
        </MotionButton>
      </div>
    </MotionCard>
  );
}
