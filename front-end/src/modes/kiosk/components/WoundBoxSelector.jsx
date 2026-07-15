import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import MotionCard from '../../../shared/components/MotionCard';
import MotionButton from '../../../shared/components/MotionButton';
import Spinner from '../../../shared/components/Spinner';
import { describePhotoSubmitError } from '../../../shared/api/apiClient';

// Shown right after capture, before the photo is submitted - the only
// box-draw step now (no nail-box step; this pipeline no longer estimates
// wound area in real-world units, so there's no scale reference to
// capture). Mandatory, no skip button - there's no CV segmentation model to
// find the wound on its own, so this box is the only spatial hint
// vision_llm_client.py has for where to crop and what to tell Claude.
const MIN_BOX_SIZE = 20; // displayed pixels - rejects an accidental tap

export default function WoundBoxSelector({ imageBlob, onConfirm, onRetake }) {
  const imgRef = useRef(null);
  const containerRef = useRef(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [box, setBox] = useState(null); // displayed (CSS) pixels, converted to image pixels on confirm
  const [drawStart, setDrawStart] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const url = URL.createObjectURL(imageBlob);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageBlob]);

  function getRelativePoint(event) {
    const rect = containerRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function handlePointerDown(event) {
    const point = getRelativePoint(event);
    setDrawStart(point);
    setBox({ x: point.x, y: point.y, width: 0, height: 0 });
  }

  function handlePointerMove(event) {
    if (!drawStart) return;
    const point = getRelativePoint(event);
    setBox({
      x: Math.min(drawStart.x, point.x),
      y: Math.min(drawStart.y, point.y),
      width: Math.abs(point.x - drawStart.x),
      height: Math.abs(point.y - drawStart.y),
    });
  }

  function handlePointerUp() {
    setDrawStart(null);
  }

  const hasValidBox = box && box.width >= MIN_BOX_SIZE && box.height >= MIN_BOX_SIZE;

  // onConfirm ultimately calls all the way through to KioskController's
  // /kiosk/photo (capture-quality rejection, ml-service down, etc.) - this
  // is the one place in the chain that awaits it, so it's the one place
  // that needs to catch a failure. Without this, a rejection here was an
  // uncaught promise rejection with zero user-visible feedback: the patient
  // just saw nothing happen, with no indication they needed to retake.
  async function handleConfirm() {
    const img = imgRef.current;

    // Displayed (CSS) pixels -> the image's actual pixel resolution - the
    // backend needs the box in the same coordinate space as the
    // full-resolution image bytes being uploaded.
    const scaleX = img.naturalWidth / img.clientWidth;
    const scaleY = img.naturalHeight / img.clientHeight;

    setSubmitting(true);
    setError(null);
    try {
      await onConfirm({
        woundBox: {
          x: Math.round(box.x * scaleX),
          y: Math.round(box.y * scaleY),
          width: Math.round(box.width * scaleX),
          height: Math.round(box.height * scaleY),
        },
      });
      // No setSubmitting(false) on success - the parent moves on to a
      // different screen entirely, so there's nothing left to re-enable.
    } catch (err) {
      setError(describePhotoSubmitError(err));
      setSubmitting(false);
    }
  }

  return (
    <MotionCard>
      <p>Draw a box around the entire wound, with a little room around the edges.</p>

      <div
        ref={containerRef}
        style={{ position: 'relative', display: 'inline-block', touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {imageUrl && <img ref={imgRef} src={imageUrl} alt="Captured wound photo" draggable={false} />}
        {box && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{
              opacity: 1,
              scale: 1,
              boxShadow: hasValidBox
                ? ['0 0 0 0 rgba(157,107,255,0.5)', '0 0 0 6px rgba(157,107,255,0)']
                : '0 0 0 1px rgba(0,0,0,0.6)',
            }}
            transition={hasValidBox ? { duration: 1.4, repeat: Infinity, ease: 'easeOut' } : { duration: 0.15 }}
            style={{
              position: 'absolute',
              left: box.x,
              top: box.y,
              width: box.width,
              height: box.height,
              border: '3px solid #c9a6ff',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>

      {error && <p role="alert">{error}</p>}

      <div className="row" style={{ alignItems: 'center' }}>
        <MotionButton type="button" onClick={onRetake} disabled={submitting}>
          Retake photo
        </MotionButton>
        {submitting ? (
          <span className="row" style={{ alignItems: 'center', gap: 'var(--space-2)' }}>
            <Spinner />
            Analyzing photo...
          </span>
        ) : (
          <MotionButton type="button" className="btn-primary" onClick={handleConfirm} disabled={!hasValidBox}>
            Confirm wound area
          </MotionButton>
        )}
      </div>
    </MotionCard>
  );
}
