const mongoose = require('mongoose');
const secondaryUri = process.env.MONGO_URI_SECONDARY;
let secondaryConn = null;

function initSecondaryConn() {
  if (secondaryConn || !secondaryUri) return secondaryConn;
  secondaryConn = mongoose.createConnection(secondaryUri, {
    // useNewUrlParser/useUnifiedTopology are no-ops on driver >=4
    dbName: process.env.MONGO_DB_SECONDARY || undefined,
  });
  secondaryConn.once('open', () => console.log('Secondary MongoDB connection for Myrtle Trip initialized.'));
  secondaryConn.on('error', (err) => console.error('Secondary Mongo connection error:', err));
  return secondaryConn;
}

function getSecondaryConn() {
  return secondaryConn;
}

module.exports = { initSecondaryConn, getSecondaryConn };
