import { AnimatePresence, motion } from 'framer-motion';
import AutoFloorBadge from './AutoFloorBadge';

export default function QueueList({ queue, onSelect }) {
  if (queue.length === 0) return <p>No patients in the queue.</p>;

  return (
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Session</th>
          <th>Score</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <AnimatePresence initial={false}>
          {queue.map((session) => (
            // layout animates a row sliding to its new position when the
            // queue re-sorts (scores decay over time) - the interactive
            // signal that this is a live-ranked queue, not a static table.
            <motion.tr
              key={session.sessionId}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ layout: { duration: 0.4, ease: [0.16, 1, 0.3, 1] }, opacity: { duration: 0.2 } }}
              onClick={() => onSelect(session.sessionId)}
              whileHover={{ backgroundColor: 'var(--color-surface-2)' }}
            >
              <td className="tabular-nums">{session.position}</td>
              <td className="tabular-nums">{session.sessionId}</td>
              <td className="tabular-nums">{session.effectiveScore?.toFixed(1)}</td>
              <td>
                <AutoFloorBadge autoFloor={session.autoFloor} floorEffective={session.floorEffective} />
              </td>
            </motion.tr>
          ))}
        </AnimatePresence>
      </tbody>
    </table>
  );
}
