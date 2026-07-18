const http = require('http');
const app = require('./app');
const { port, nodeEnv } = require('./config/env');
const { connectDb } = require('./db/connect');
const dashboardSocket = require('./websocket/dashboardSocket');
const escalationSweep = require('./jobs/escalationSweep');

const server = http.createServer(app);

dashboardSocket.attach(server);
escalationSweep.setBroadcaster(dashboardSocket.broadcast);

connectDb()
  .then(() => {
    escalationSweep.start();
    server.listen(port, () => {
      console.log(`[server] listening on port ${port}`);
      console.log(`[server] nodeEnv=${JSON.stringify(nodeEnv)}`);
    });
  })
  .catch((err) => {
    console.error('[server] failed to connect to the database:', err.message);
    process.exit(1);
  });
