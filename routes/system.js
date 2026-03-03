const express = require('express');

function buildSystemRouter({ mongoose, getSecondaryConn, getFeatures, port }) {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    let secondaryState = null;
    try {
      const secondaryConn = getSecondaryConn();
      secondaryState = secondaryConn ? secondaryConn.readyState : null;
    } catch {
      secondaryState = null;
    }
    const features = getFeatures();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      config: {
        mongoConnected: mongoose.connection.readyState === 1,
        secondaryMongoConnected: secondaryState === 1,
        hasResendKey: features.hasResendKey,
        hasResendFrom: features.hasResendFrom,
        hasSubscriberModel: features.hasSubscriberModel,
        hasHandicapModels: features.hasHandicapModels,
        port,
        nodeEnv: process.env.NODE_ENV || 'development',
      },
    });
  });

  router.get('/ready', (_req, res) => {
    const primaryReady = mongoose.connection.readyState === 1;
    const secondary = getSecondaryConn();
    const secondaryReady = secondary ? secondary.readyState === 1 : false;
    if (!primaryReady || !secondaryReady) {
      return res.status(503).json({
        ready: false,
        primaryReady,
        secondaryReady,
      });
    }
    return res.json({
      ready: true,
      primaryReady,
      secondaryReady,
    });
  });

  return router;
}

module.exports = { buildSystemRouter };
