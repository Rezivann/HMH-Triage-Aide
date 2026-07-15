import { useState } from 'react';
import { motion } from 'framer-motion';
import MotionCard from '../../../shared/components/MotionCard';
import MotionButton from '../../../shared/components/MotionButton';
import { fadeUpSmall } from '../../../shared/motion';

// LlmService's per-turn telehealthViable judgment (see LlmService.js,
// kioskController.postMessage) surfaced here - no real telehealth routing
// exists yet, so "selecting" it just shows the room to go to, same as the
// rest of this demo's fake-but-plausible stand-ins (see
// NearbyUrgentCareList.jsx).
export default function TelehealthOption() {
  const [selected, setSelected] = useState(false);

  return (
    <MotionCard>
      {selected ? (
        <motion.p
          className="status-banner status-banner--accent"
          variants={fadeUpSmall}
          initial="hidden"
          animate="visible"
        >
          Please proceed to Telehealth Room 1.
        </motion.p>
      ) : (
        <>
          <p>Based on what you described, a telehealth (video) visit may be an option instead of waiting here.</p>
          <MotionButton type="button" className="btn-primary" onClick={() => setSelected(true)}>
            Start telehealth visit instead
          </MotionButton>
        </>
      )}
    </MotionCard>
  );
}
