// HIPAA audit trail. Runs after kioskAuth/nurseAuth/trackAuth, so it infers the
// actor from whichever of req.kiosk/req.nurse/req.track that middleware set -
// this file doesn't need to know which route it's mounted on.
//
// Writes a structured line to stdout for now; swap this for a durable,
// tamper-evident sink before handling real patient data.
function auditLog(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const actor = req.kiosk
      ? { type: 'kiosk', id: req.kiosk.kioskId, locationId: req.kiosk.locationId }
      : req.nurse
      ? { type: 'nurse', id: req.nurse.nurseId }
      : req.track
      ? { type: 'track', id: req.track.sessionId }
      : { type: 'anonymous', id: null };

    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        actorType: actor.type,
        actorId: actor.id,
        locationId: actor.locationId ?? null,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - start,
      })
    );
  });

  next();
}

module.exports = auditLog;
