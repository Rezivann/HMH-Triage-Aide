const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { nurseSessionSecret } = require('../config/env');

// Fans out queue/notification events to connected dashboards. Nurses connect
// with ?token=<nurse session JWT> - the same token nurseAuth.js validates on
// normal requests, just passed as a query param since WS handshakes don't
// carry custom headers as easily as fetch does.
const clients = new Set();

function attach(server) {
  const wss = new WebSocketServer({ server, path: '/dashboard/live' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');

    let nurse;
    try {
      nurse = jwt.verify(token, nurseSessionSecret);
    } catch (err) {
      ws.close(4401, 'invalid_nurse_session');
      return;
    }

    ws.nurse = { nurseId: nurse.nurseId, siteAccess: nurse.siteAccess || [] };
    clients.add(ws);

    ws.on('close', () => clients.delete(ws));
  });

  return wss;
}

// Called by jobs/escalationSweep.js. Scopes each event's queue entries to
// the connected nurse's siteAccess before sending, so one location's update
// never reaches another location's dashboard.
function broadcast(event) {
  for (const ws of clients) {
    if (ws.readyState !== ws.OPEN) continue;

    const scoped = event.queue
      ? { ...event, queue: event.queue.filter((s) => ws.nurse.siteAccess.includes(s.locationId)) }
      : event;

    ws.send(JSON.stringify(scoped));
  }
}

module.exports = { attach, broadcast };
