const COPY = {
  waiting: "You're in the queue. We'll let you know as your turn approaches.",
  next: "You're next.",
  with_nurse: 'A nurse is with you now.',
};

// Shows this patient's own queue position - never a score, findings, or any
// other patient's data (the backend enforces that boundary too; see
// trackController.js).
export default function StatusBand({ status, position }) {
  if (!status) return <p>Loading your status...</p>;

  return (
    <div>
      <p>{COPY[status] ?? 'Checking your status...'}</p>
      {position != null && <p>Position in queue: {position}</p>}
      <p>Your position may shift as other patients' medical urgency is assessed.</p>
    </div>
  );
}
