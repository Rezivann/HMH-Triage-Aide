import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import MotionCard from '../../../shared/components/MotionCard';
import MotionButton from '../../../shared/components/MotionButton';

// Shown after NailBoxSelector, before the photo is submitted. Mandatory -
// no skip button, unlike the nail box - MedSAM (ml-service's
// wound_segmentation.py) was fine-tuned exclusively on box prompts and
// degrades to near-zero performance with a point or no prompt at all, so
// there's no fallback path here the way there is for the nail's scale
// factor. This box only tells MedSAM roughly where to look; the mask it
// actually returns (and the resulting area/crop) comes from its own
// segmentation, not from this box's exact edges.
const MIN_BOX_SIZE = 20; // displayed pixels - rejects an accidental tap

export default function WoundBoxSelector({ imageBlob, onConfirm, onRetake }) {
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

    // Displayed (CSS) pixels -> the image's actual pixel resolution, same
    // conversion NailBoxSelector does - MedSAM needs the box in the same
    // coordinate space as the full-resolution image bytes being uploaded.
    const scaleX = img.naturalWidth / img.clientWidth;
    const scaleY = img.naturalHeight / img.clientHeight;

    onConfirm({
      woundBox: {
        x: Math.round(box.x * scaleX),
        y: Math.round(box.y * scaleY),
        width: Math.round(box.width * scaleX),
        height: Math.round(box.height * scaleY),
      },
    });
  }

  return (
    <MotionCard>
      <p>Now draw a box around the entire wound, with a little room around the edges.</p>

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

      <div className="row">
        <MotionButton type="button" onClick={onRetake}>
          Retake photo
        </MotionButton>
        <MotionButton type="button" className="btn-primary" onClick={handleConfirm} disabled={!hasValidBox}>
          Confirm wound area
        </MotionButton>
      </div>
    </MotionCard>
  );
}
