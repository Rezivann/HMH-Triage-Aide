import { useEffect, useRef, useState } from 'react';

// Shown after capture, before the photo is submitted. The kiosk instructs
// the patient to point at their wound with one extended finger (not the
// thumb) - that's the nail SAM segments, always. Deliberately not toenails:
// which toe (big/middle/pinky) varies enough in width to need its own
// identification step, and a non-thumb finger is already free since pointing
// at the wound is how the patient frames the shot anyway - no extra gesture
// to teach. SAM (ml-service's nail_segmentation.py) can't find "the nail" in
// a photo on its own - it's a promptable segmenter, not a classifier - so
// the patient draws the box that becomes SAM's prompt.
const MIN_BOX_SIZE = 20; // displayed pixels - rejects an accidental tap

export default function NailBoxSelector({ imageBlob, onConfirm, onRetake, onSkip }) {
  const imgRef = useRef(null);
  const containerRef = useRef(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [box, setBox] = useState(null); // displayed (CSS) pixels, converted to image pixels on confirm
  const [drawStart, setDrawStart] = useState(null);

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

  function handleConfirm() {
    const img = imgRef.current;

    // Displayed (CSS) pixels -> the image's actual pixel resolution. SAM
    // needs the box in the same coordinate space as the full-resolution
    // image bytes being uploaded, not whatever size it happens to render at
    // on this particular kiosk screen.
    const scaleX = img.naturalWidth / img.clientWidth;
    const scaleY = img.naturalHeight / img.clientHeight;

    onConfirm({
      nailBox: {
        x: Math.round(box.x * scaleX),
        y: Math.round(box.y * scaleY),
        width: Math.round(box.width * scaleX),
        height: Math.round(box.height * scaleY),
      },
    });
  }

  return (
    <div>
      <p>
        Point at your wound with one finger - not your thumb - then draw a box tightly around that finger's nail
        only, not the surrounding skin.
      </p>

      <div
        ref={containerRef}
        style={{ position: 'relative', display: 'inline-block', touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {imageUrl && <img ref={imgRef} src={imageUrl} alt="Captured wound photo" draggable={false} />}
        {box && (
          <div
            style={{
              position: 'absolute',
              left: box.x,
              top: box.y,
              width: box.width,
              height: box.height,
              border: '2px solid red',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>

      <div>
        <button type="button" onClick={onRetake}>
          Retake photo
        </button>
        <button type="button" onClick={handleConfirm} disabled={!hasValidBox}>
          Confirm nail selection
        </button>
      </div>

      {/* Skips scale calibration entirely rather than blocking submission -
          ml-service falls back to a rough population-average scale estimate
          (config.py's FALLBACK_SCALE_MM_PER_PIXEL) and marks the resulting
          measurement low-confidence, which routes this patient into the
          auto-floor safety valve instead of trusting a fabricated number. */}
      <p>
        <button type="button" onClick={() => onSkip()}>
          I can't point at the wound
        </button>
      </p>
    </div>
  );
}
