const mongoose = require('mongoose');
const { databaseUrl } = require('../config/env');

// Called once at server startup (server.js) - every model file already calls
// mongoose.model() at require time, so importing services/SessionStore.js
// anywhere registers the schemas; this just opens the actual connection.
async function connectDb() {
  await mongoose.connect(databaseUrl);
}

module.exports = { connectDb };
