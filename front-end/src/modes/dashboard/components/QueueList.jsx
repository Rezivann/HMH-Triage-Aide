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
        {queue.map((session) => (
          <tr key={session.sessionId} onClick={() => onSelect(session.sessionId)}>
            <td>{session.position}</td>
            <td>{session.sessionId}</td>
            <td>{session.effectiveScore?.toFixed(1)}</td>
            <td>
              <AutoFloorBadge autoFloor={session.autoFloor} floorEffective={session.floorEffective} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
