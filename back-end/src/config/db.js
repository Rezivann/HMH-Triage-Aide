const mongoose = require('mongoose');
const { databaseUrl, nodeEnv } = require('./env');

let connected = false;

async function connectDb() {
  if (connected) return mongoose.connection;

  mongoose.set('strictQuery', true);
  await mongoose.connect(databaseUrl);
  connected = true;

  if (nodeEnv !== 'test') {
    console.log(`[db] connected to ${databaseUrl}`);
  }

  return mongoose.connection;
}

async function disconnectDb() {
  if (!connected) return;
  await mongoose.disconnect();
  connected = false;
}

module.exports = { connectDb, disconnectDb };
