const express = require('express');
const MastersPool = require('../models/MastersPool');
const MastersPoolEntry = require('../models/MastersPoolEntry');
const MastersPoolAuditLog = require('../models/MastersPoolAuditLog');
const {
  buildDefaultPoolPayload,
  buildMockRoundResults,
  buildPoolComputedState,
  buildPoolSummary,
  normalizeEntryPicks,
  normalizeGolfers,
  normalizeRoundResults,
  normalizeTiers,
  slugify,
  upsertRoundResult,
  validateEntrySubmission,
} = require('../services/mastersPoolService');
const { buildOfficial2026Field } = require('../services/masters2026Field');

const router = express.Router();
const SITE_ADMIN_WRITE_CODE = process.env.SITE_ADMIN_WRITE_CODE || '1986';

function isAdmin(req) {
  const code = req.headers['x-admin-code'] || req.query.code || (req.body && (req.body.code || req.body.adminCode));
  return Boolean(SITE_ADMIN_WRITE_CODE && code && code === SITE_ADMIN_WRITE_CODE);
}

function truncateValue(value, maxLen = 240) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.length > maxLen ? `${value.slice(0, maxLen)}...` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => truncateValue(item, maxLen));
  if (typeof value === 'object') {
    const out = {};
    Object.keys(value).slice(0, 40).forEach((key) => {
      out[key] = truncateValue(value[key], maxLen);
    });
    return out;
  }
  return String(value);
}

async function writeAudit(req, pool, action, summary, details = {}) {
  if (!pool) return;
  try {
    await MastersPoolAuditLog.create({
      poolId: pool._id,
      action,
      actor: isAdmin(req) ? 'admin' : 'public',
      method: String(req.method || ''),
      route: String(req.originalUrl || req.path || ''),
      summary,
      details: truncateValue(details),
      timestamp: new Date(),
    });
  } catch (_error) {
    // Audit logging should not break pool updates.
  }
}

async function loadPool(poolId) {
  const pool = await MastersPool.findById(poolId);
  if (!pool) return null;
  const entries = await MastersPoolEntry.find({ poolId: pool._id }).sort({ submittedAt: 1 });
  return { pool, entries };
}

async function findPreferredSeasonPool(season) {
  const pools = await MastersPool.find({ season }).sort({ createdAt: -1 }).lean();
  if (!pools.length) return null;
  return pools.find((pool) => pool.status === 'live')
    || pools.find((pool) => pool.status === 'complete')
    || pools[0];
}

async function refreshComputed(pool) {
  const entries = await MastersPoolEntry.find({ poolId: pool._id }).sort({ submittedAt: 1 });
  pool.computed = buildPoolComputedState(pool.toObject ? pool.toObject() : pool, entries.map((entry) => entry.toObject ? entry.toObject() : entry));
  pool.markModified('computed');
  await pool.save();
  return { pool, entries };
}

function sendError(res, error) {
  const message = error && error.message ? error.message : 'Request failed';
  if (/not found/i.test(message)) return res.status(404).json({ error: message });
  if (/required|missing|locked|invalid/i.test(message)) return res.status(400).json({ error: message });
  return res.status(500).json({ error: message });
}

router.get('/', async (_req, res) => {
  try {
    const pools = await MastersPool.find().sort({ createdAt: -1 });
    const summaries = await Promise.all(
      pools.map(async (pool) => {
        const entries = await MastersPoolEntry.find({ poolId: pool._id }).sort({ submittedAt: 1 });
        return buildPoolSummary(
          pool.toObject ? pool.toObject() : pool,
          entries.map((entry) => (entry.toObject ? entry.toObject() : entry))
        );
      })
    );
    return res.json({
      pools: summaries.map((summary) => ({
        id: summary.pool._id,
        name: summary.pool.name,
        slug: summary.pool.slug,
        season: summary.pool.season,
        status: summary.pool.status,
        poolFormat: summary.pool.poolFormat,
        isLocked: summary.pool.isLocked,
        entryFee: summary.pool.entryFee,
        expectedEntrants: summary.pool.expectedEntrants,
        totalEntries: summary.payouts.totalEntries,
        totalPot: summary.payouts.totalPot,
        latestCompletedRound: summary.bracket.latestCompletedRound,
      })),
    });
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/field/current', async (_req, res) => res.json({
  season: 2026,
  source: 'Official 2026 Masters Tournament Invitees PDF',
  qualifiedAsOf: '2026-04-05',
  tiers: normalizeTiers([], buildOfficial2026Field()),
  golfers: buildOfficial2026Field(),
}));

router.get('/season/:season/latest', async (req, res) => {
  try {
    const season = Number(req.params.season);
    if (!Number.isFinite(season)) return res.status(400).json({ error: 'Valid season is required' });
    const pool = await findPreferredSeasonPool(season);
    if (!pool) return res.status(404).json({ error: 'No pool found for that season' });
    return res.json({
      id: String(pool._id),
      name: pool.name,
      slug: pool.slug,
      season: pool.season,
      status: pool.status,
    });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin code required' });
  try {
    const payload = buildDefaultPoolPayload(req.body || {});
    if (!payload.name) throw new Error('Pool name is required');
    if (!payload.golfers.length) payload.golfers = buildOfficial2026Field();
    if (!payload.roundResults.length) payload.roundResults = normalizeRoundResults([]);
    payload.slug = slugify(payload.slug || payload.name);
    const pool = await MastersPool.create(payload);
    await refreshComputed(pool);
    await writeAudit(req, pool, 'pool_create', 'Masters pool created', {
      name: pool.name,
      slug: pool.slug,
      golferCount: pool.golfers.length,
    });
    const bundle = await loadPool(pool._id);
    return res.status(201).json(buildPoolSummary(bundle.pool.toObject(), []));
  } catch (error) {
    if (error && error.code === 11000) return res.status(409).json({ error: 'Pool slug already exists' });
    return sendError(res, error);
  }
});

router.post('/seed-demo', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin code required' });
  try {
    const field = buildOfficial2026Field();
    const pool = await MastersPool.create(buildDefaultPoolPayload({
      name: req.body && req.body.name ? req.body.name : `Masters Demo Pool ${new Date().getFullYear()}`,
      slug: req.body && req.body.slug ? req.body.slug : `masters-demo-${Date.now()}`,
      season: req.body && req.body.season ? req.body.season : new Date().getFullYear(),
      golfers: field,
      roundResults: buildMockRoundResults(field),
      status: 'live',
      expectedEntrants: 16,
    }));
    await refreshComputed(pool);
    await writeAudit(req, pool, 'pool_seed_demo', 'Demo Masters pool seeded', {
      golferCount: field.length,
      poolFormat: pool.poolFormat,
    });
    const bundle = await loadPool(pool._id);
    return res.status(201).json(buildPoolSummary(bundle.pool.toObject(), []));
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/:poolId', async (req, res) => {
  try {
    const bundle = await loadPool(req.params.poolId);
    if (!bundle) return res.status(404).json({ error: 'Pool not found' });
    return res.json(buildPoolSummary(
      bundle.pool.toObject ? bundle.pool.toObject() : bundle.pool,
      bundle.entries.map((entry) => (entry.toObject ? entry.toObject() : entry))
    ));
  } catch (error) {
    return sendError(res, error);
  }
});

router.put('/:poolId', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin code required' });
  try {
    const bundle = await loadPool(req.params.poolId);
    if (!bundle) return res.status(404).json({ error: 'Pool not found' });
    const next = req.body || {};
    if (next.name !== undefined) bundle.pool.name = String(next.name || '').trim();
    if (next.slug !== undefined) bundle.pool.slug = slugify(next.slug || bundle.pool.name);
    if (next.status !== undefined) bundle.pool.status = String(next.status || '').trim().toLowerCase();
    if (next.accessCode !== undefined) bundle.pool.accessCode = String(next.accessCode || '').trim();
    if (next.entryFee !== undefined) bundle.pool.entryFee = Number(next.entryFee) || 0;
    if (next.expectedEntrants !== undefined) bundle.pool.expectedEntrants = Math.max(0, Number(next.expectedEntrants) || 0);
    if (next.lockReason !== undefined) bundle.pool.lockReason = String(next.lockReason || '').trim();
    if (next.payouts !== undefined) bundle.pool.payouts = next.payouts;
    if (next.scoringRules !== undefined) bundle.pool.scoringRules = next.scoringRules;
    if (next.tiers !== undefined) bundle.pool.tiers = normalizeTiers(next.tiers, next.golfers || bundle.pool.golfers);
    if (next.tierRules !== undefined) bundle.pool.tierRules = next.tierRules;
    if (next.lineupRules !== undefined) bundle.pool.lineupRules = next.lineupRules;
    if (next.dataSource !== undefined) bundle.pool.dataSource = next.dataSource;
    if (next.golfers !== undefined) bundle.pool.golfers = normalizeGolfers(next.golfers, next.tiers || bundle.pool.tiers);
    if (next.roundResults !== undefined) bundle.pool.roundResults = normalizeRoundResults(next.roundResults);
    bundle.pool.markModified('payouts');
    bundle.pool.markModified('scoringRules');
    bundle.pool.markModified('tiers');
    bundle.pool.markModified('tierRules');
    bundle.pool.markModified('lineupRules');
    bundle.pool.markModified('dataSource');
    bundle.pool.markModified('golfers');
    bundle.pool.markModified('roundResults');
    await bundle.pool.save();
    await refreshComputed(bundle.pool);
    await writeAudit(req, bundle.pool, 'pool_update', 'Masters pool updated', {
      fields: Object.keys(next),
    });
    const refreshed = await loadPool(bundle.pool._id);
    return res.json(buildPoolSummary(refreshed.pool.toObject(), refreshed.entries.map((entry) => entry.toObject())));
  } catch (error) {
    return sendError(res, error);
  }
});

router.delete('/:poolId', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin code required' });
  try {
    const pool = await MastersPool.findById(req.params.poolId);
    if (!pool) return res.status(404).json({ error: 'Pool not found' });
    await MastersPoolEntry.deleteMany({ poolId: pool._id });
    await MastersPoolAuditLog.deleteMany({ poolId: pool._id });
    await MastersPool.deleteOne({ _id: pool._id });
    return res.json({
      ok: true,
      deletedPoolId: String(pool._id),
      deletedPoolName: pool.name,
    });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/:poolId/lock', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin code required' });
  try {
    const bundle = await loadPool(req.params.poolId);
    if (!bundle) return res.status(404).json({ error: 'Pool not found' });
    bundle.pool.isLocked = true;
    bundle.pool.lockedAt = new Date();
    if (req.body && req.body.lockReason) bundle.pool.lockReason = String(req.body.lockReason).trim();
    await bundle.pool.save();
    await writeAudit(req, bundle.pool, 'pool_lock', 'Masters pool locked', { lockReason: bundle.pool.lockReason });
    const refreshed = await loadPool(bundle.pool._id);
    return res.json(buildPoolSummary(refreshed.pool.toObject(), refreshed.entries.map((entry) => entry.toObject())));
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/:poolId/unlock', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin code required' });
  try {
    const bundle = await loadPool(req.params.poolId);
    if (!bundle) return res.status(404).json({ error: 'Pool not found' });
    bundle.pool.isLocked = false;
    bundle.pool.lockedAt = null;
    await bundle.pool.save();
    await writeAudit(req, bundle.pool, 'pool_unlock', 'Masters pool unlocked');
    const refreshed = await loadPool(bundle.pool._id);
    return res.json(buildPoolSummary(refreshed.pool.toObject(), refreshed.entries.map((entry) => entry.toObject())));
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/:poolId/recalculate', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin code required' });
  try {
    const bundle = await loadPool(req.params.poolId);
    if (!bundle) return res.status(404).json({ error: 'Pool not found' });
    await refreshComputed(bundle.pool);
    await writeAudit(req, bundle.pool, 'pool_recalculate', 'Masters pool recalculated');
    const refreshed = await loadPool(bundle.pool._id);
    return res.json(buildPoolSummary(refreshed.pool.toObject(), refreshed.entries.map((entry) => entry.toObject())));
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/:poolId/leaderboard', async (req, res) => {
  try {
    const bundle = await loadPool(req.params.poolId);
    if (!bundle) return res.status(404).json({ error: 'Pool not found' });
    const summary = buildPoolSummary(bundle.pool.toObject(), bundle.entries.map((entry) => entry.toObject()));
    return res.json({
      pool: summary.pool,
      leaderboard: summary.leaderboard,
      payouts: summary.payouts,
    });
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/:poolId/bracket', async (req, res) => {
  try {
    const bundle = await loadPool(req.params.poolId);
    if (!bundle) return res.status(404).json({ error: 'Pool not found' });
    const summary = buildPoolSummary(bundle.pool.toObject(), bundle.entries.map((entry) => entry.toObject()));
    return res.json({
      pool: summary.pool,
      bracket: summary.bracket,
      payouts: summary.payouts,
    });
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/:poolId/entries', async (req, res) => {
  try {
    const bundle = await loadPool(req.params.poolId);
    if (!bundle) return res.status(404).json({ error: 'Pool not found' });
    const summary = buildPoolSummary(bundle.pool.toObject(), bundle.entries.map((entry) => entry.toObject()));
    return res.json({
      entries: summary.leaderboard.map((row) => ({
        id: row.id,
        entrantName: row.entrantName,
        email: row.email,
        submittedAt: row.submittedAt,
        totalPoints: row.totalPoints,
        sundayPoints: row.sundayPoints,
        madeCutCount: row.madeCutCount,
        bestSingleGolferFinish: row.bestSingleGolferFinish,
        roundTotals: row.roundTotals,
        golferBreakdown: row.golferBreakdown,
      })),
    });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/:poolId/join', async (req, res) => {
  try {
    const bundle = await loadPool(req.params.poolId);
    if (!bundle) return res.status(404).json({ error: 'Pool not found' });
    const validation = validateEntrySubmission(bundle.pool.toObject(), req.body || {});
    if (!validation.ok) return res.status(400).json({ error: validation.errors.join(' ') });

    const entry = await MastersPoolEntry.create({
      poolId: bundle.pool._id,
      entrantName: String(req.body.entrantName || '').trim(),
      email: String(req.body.email || '').trim().toLowerCase(),
      entryFeeSnapshot: Number(bundle.pool.entryFee) || 0,
      picks: normalizeEntryPicks(validation.picks),
      predictedWinningScoreToPar: req.body.predictedWinningScoreToPar !== undefined && req.body.predictedWinningScoreToPar !== null
        ? Number(req.body.predictedWinningScoreToPar)
        : null,
      submittedAt: new Date(),
    });
    await refreshComputed(bundle.pool);
    await writeAudit(req, bundle.pool, 'entry_create', 'Tier picks submitted', {
      entrantName: entry.entrantName,
      entryId: entry._id,
    });
    const refreshed = await loadPool(bundle.pool._id);
    const summary = buildPoolSummary(refreshed.pool.toObject(), refreshed.entries.map((row) => row.toObject()));
    return res.status(201).json({
      entryId: String(entry._id),
      pool: summary.pool,
      leaderboard: summary.leaderboard,
    });
  } catch (error) {
    return sendError(res, error);
  }
});

router.put('/:poolId/entries/:entryId', async (req, res) => {
  try {
    const bundle = await loadPool(req.params.poolId);
    if (!bundle) return res.status(404).json({ error: 'Pool not found' });
    if (bundle.pool.isLocked) return res.status(400).json({ error: 'Pool is locked' });
    const validation = validateEntrySubmission(bundle.pool.toObject(), req.body || {});
    if (!validation.ok) return res.status(400).json({ error: validation.errors.join(' ') });
    const entry = await MastersPoolEntry.findOne({ _id: req.params.entryId, poolId: bundle.pool._id });
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    entry.entrantName = String(req.body.entrantName || '').trim();
    entry.email = String(req.body.email || '').trim().toLowerCase();
    entry.picks = normalizeEntryPicks(validation.picks);
    entry.predictedWinningScoreToPar = req.body.predictedWinningScoreToPar !== undefined && req.body.predictedWinningScoreToPar !== null
      ? Number(req.body.predictedWinningScoreToPar)
      : null;
    entry.submittedAt = new Date();
    await entry.save();
    await refreshComputed(bundle.pool);
    await writeAudit(req, bundle.pool, 'entry_update', 'Tier picks updated', {
      entrantName: entry.entrantName,
      entryId: entry._id,
    });
    return res.json({ ok: true, entryId: String(entry._id) });
  } catch (error) {
    return sendError(res, error);
  }
});

router.put('/:poolId/rounds/:roundNumber', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin code required' });
  try {
    const bundle = await loadPool(req.params.poolId);
    if (!bundle) return res.status(404).json({ error: 'Pool not found' });
    bundle.pool.roundResults = upsertRoundResult(
      bundle.pool.toObject ? bundle.pool.toObject() : bundle.pool,
      req.params.roundNumber,
      req.body && req.body.golfers ? req.body.golfers : [],
      {
        status: req.body && req.body.status ? req.body.status : 'complete',
        actualWinningScoreToPar: req.body && req.body.actualWinningScoreToPar,
      }
    );
    bundle.pool.markModified('roundResults');
    await bundle.pool.save();
    await refreshComputed(bundle.pool);
    await writeAudit(req, bundle.pool, 'round_update', 'Masters round results updated', {
      round: Number(req.params.roundNumber),
      golferCount: Array.isArray(req.body && req.body.golfers) ? req.body.golfers.length : 0,
    });
    const refreshed = await loadPool(bundle.pool._id);
    return res.json(buildPoolSummary(refreshed.pool.toObject(), refreshed.entries.map((entry) => entry.toObject())));
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/:poolId/audit-log', async (req, res) => {
  try {
    const bundle = await loadPool(req.params.poolId);
    if (!bundle) return res.status(404).json({ error: 'Pool not found' });
    const rows = await MastersPoolAuditLog.find({ poolId: bundle.pool._id }).sort({ timestamp: 1 }).limit(500).lean();
    return res.json({ rows });
  } catch (error) {
    return sendError(res, error);
  }
});

module.exports = router;
