import MotionCard from '../../../shared/components/MotionCard';

// Fake data for the demo - no real facility directory exists yet. Only
// driveTimeMinutes/queueTimeMinutes are made up; the current location's own
// queueTimeMinutes comes from the patient's real estimatedWaitMinutes (see
// TrackApp), so the one number that matters most to them isn't fake.
const FAKE_URGENT_CARES = [
  { name: 'Riverside Urgent Care', driveTimeMinutes: 8, queueTimeMinutes: 22 },
  { name: 'MedFirst Clinic - Downtown', driveTimeMinutes: 14, queueTimeMinutes: 10 },
  { name: 'QuickCare Family Health', driveTimeMinutes: 5, queueTimeMinutes: 35 },
  { name: 'Summit Urgent Care', driveTimeMinutes: 19, queueTimeMinutes: 6 },
];

export default function NearbyUrgentCareList({ currentWaitMinutes }) {
  const facilities = [
    {
      name: 'This location',
      driveTimeMinutes: 0,
      queueTimeMinutes: currentWaitMinutes ?? 0,
      isCurrent: true,
    },
    ...FAKE_URGENT_CARES,
  ]
    .map((facility) => ({ ...facility, totalWaitMinutes: facility.driveTimeMinutes + facility.queueTimeMinutes }))
    .sort((a, b) => a.totalWaitMinutes - b.totalWaitMinutes);

  return (
    <MotionCard>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
        Sorted by total estimated wait (drive time + queue time).
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Drive time</th>
              <th>Queue time</th>
              <th>Total wait</th>
            </tr>
          </thead>
          <tbody>
            {facilities.map((facility) => (
              <tr
                key={facility.name}
                style={
                  facility.isCurrent
                    ? {
                        background: 'var(--color-accent-soft)',
                        color: 'var(--color-accent-hover)',
                        border: '1px solid var(--color-accent)',
                      }
                    : undefined
                }
              >
                <td>{facility.isCurrent ? `${facility.name} (you are here)` : facility.name}</td>
                <td className="tabular-nums">{facility.driveTimeMinutes} min</td>
                <td className="tabular-nums">{facility.queueTimeMinutes} min</td>
                <td className="tabular-nums">{facility.totalWaitMinutes} min</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </MotionCard>
  );
}
