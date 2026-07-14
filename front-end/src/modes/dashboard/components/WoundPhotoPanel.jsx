import { useRef, useState } from 'react';
import MotionCard from '../../../shared/components/MotionCard';
import MotionButton from '../../../shared/components/MotionButton';

// Nurse-facing photo + findings view. The box is drawn as an SVG layer on
// top of the <img>, toggled on/off client-side - never baked into the photo
// itself (same "never alter the actual pixels" principle ml-service's
// vision_llm_client.py follows for Claude - here it's for a human's own
// inspection, but the reasoning not to touch the source image still holds).
// There's no CV segmentation model in this pipeline - woundBox is exactly
// what the patient drew (WoundBoxSelector.jsx), not a computed mask.
//
// The SVG's viewBox is set to the image's own natural pixel dimensions (read
// once on load), so the box (in that same original pixel coordinate space -
// see back-end's AcuityScore.woundBox) lines up correctly regardless of how
// large the image actually renders on screen.
export default function WoundPhotoPanel({ imageBase64, woundType, findings, woundBox }) {
  const imgRef = useRef(null);
  const [showBox, setShowBox] = useState(false);
  const [naturalSize, setNaturalSize] = useState(null);

  if (!imageBase64) return null;

  function handleImageLoad() {
    setNaturalSize({ width: imgRef.current.naturalWidth, height: imgRef.current.naturalHeight });
  }

  const hasBox = naturalSize && woundBox;

  return (
    <MotionCard>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>Wound photo</h3>
        {hasBox && (
          <MotionButton type="button" onClick={() => setShowBox((prev) => !prev)}>
            {showBox ? 'Hide box' : 'Show box'}
          </MotionButton>
        )}
      </div>

      <div style={{ position: 'relative', display: 'inline-block' }}>
        <img
          ref={imgRef}
          src={`data:image/jpeg;base64,${imageBase64}`}
          alt="Captured wound"
          onLoad={handleImageLoad}
          style={{ maxWidth: '100%', display: 'block' }}
        />
        {showBox && hasBox && (
          <svg
            viewBox={`0 0 ${naturalSize.width} ${naturalSize.height}`}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          >
            <rect
              x={woundBox.x}
              y={woundBox.y}
              width={woundBox.width}
              height={woundBox.height}
              fill="rgba(69, 212, 160, 0.15)"
              stroke="#45d4a0"
              strokeWidth={Math.max(2, naturalSize.width * 0.004)}
            />
          </svg>
        )}
      </div>

      {(woundType || findings) && (
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {woundType && <span className="badge badge--accent">{woundType}</span>}
          {findings?.stage && <span className="badge badge--accent">Stage: {findings.stage}</span>}
          {findings?.bleeding && <span className="badge badge--warning">Bleeding</span>}
          {findings?.boneVisible && <span className="badge badge--warning">Bone visible</span>}
          {findings?.deformity && <span className="badge badge--warning">Deformity</span>}
          {findings?.hardFlags?.map((flag) => (
            <span key={flag} className="badge badge--warning">
              {flag}
            </span>
          ))}
        </div>
      )}
    </MotionCard>
  );
}
