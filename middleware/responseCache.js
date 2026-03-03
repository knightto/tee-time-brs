const store = new Map();

function keyFor(req) {
  return `${req.method}:${req.originalUrl || req.url}`;
}

function cacheJson(ttlMs) {
  return function cacheMiddleware(req, res, next) {
    if (req.method !== 'GET') return next();
    const key = keyFor(req);
    const hit = store.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      res.setHeader('x-cache', 'HIT');
      return res.json(hit.payload);
    }

    const originalJson = res.json.bind(res);
    res.json = (payload) => {
      store.set(key, {
        expiresAt: Date.now() + ttlMs,
        payload,
      });
      res.setHeader('x-cache', 'MISS');
      return originalJson(payload);
    };
    next();
  };
}

function clearCacheByPrefix(prefix) {
  for (const key of store.keys()) {
    if (key.includes(prefix)) store.delete(key);
  }
}

module.exports = { cacheJson, clearCacheByPrefix };
