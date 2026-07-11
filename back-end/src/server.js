const http = require('http');
const app = require('./app');
const { port } = require('./config/env');
const dashboardSocket = require('./websocket/dashboardSocket');
const escalationSweep = require('./jobs/escalationSweep');

// Not calling connectDb() yet - controllers still read/write through
// controllers/fakeSessionStore.js, not models/. Wire it in once that swap
// happens, so the server doesn't require a running Mongo instance to boot
// during this phase.
const server = http.createServer(app);

dashboardSocket.attach(server);
escalationSweep.setBroadcaster(dashboardSocket.broadcast);
escalationSweep.start();

server.listen(port, () => {
  console.log(`[server] listening on port ${port}`);
});
