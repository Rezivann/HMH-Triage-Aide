// Rejects a positionFloor override attempt if another session already holds
// that exact floor value - callers must surface this as a named conflict
// (which session), never silently overwrite the existing floor.
function pinConflictCheck(sessions, { sessionId, floorPosition }) {
  const conflict = sessions.find(
    (s) => s.sessionId !== sessionId && s.override?.type === 'positionFloor' && s.override?.value === floorPosition
  );

  return conflict ? { conflict: true, conflictingSessionId: conflict.sessionId } : { conflict: false };
}

module.exports = { pinConflictCheck };
