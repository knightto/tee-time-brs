/**
 * Cleanup script for primary MongoDB: drops legacy collections that are now
 * stored in the secondary DB (Myrtle trip).
 *
 * Dry run (default): node scripts/cleanup_primary.js
 * Apply (drop collections): node scripts/cleanup_primary.js --apply
 *
 * Uses: MONGO_URI (required), MONGO_DB (optional)
 */
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');
const mongoUri = process.env.MONGO_URI;
const mongoDb = process.env.MONGO_DB || undefined;
const targets = ['trips', 'tripparticipants'];

if (!mongoUri) {
  console.error('Missing MONGO_URI env var. Aborting.');
  process.exit(1);
}

(async () => {
  try {
    await mongoose.connect(mongoUri, { dbName: mongoDb });
    const db = mongoose.connection.db;
    const dbName = db.databaseName;
    console.log(`Connected to primary DB: ${dbName}`);
    console.log(`Mode: ${APPLY ? 'APPLY (will drop collections)' : 'DRY RUN (no drops)'}`);

    const existing = await db.listCollections().toArray();
    const existingNames = new Set(existing.map((c) => c.name.toLowerCase()));
    const toDrop = targets.filter((t) => existingNames.has(t));

    if (!toDrop.length) {
      console.log('No target collections found to drop.');
      return;
    }

    console.log('Collections targeted for removal:', toDrop.join(', '));

    if (!APPLY) {
      console.log('Dry run complete. Re-run with --apply to drop these collections.');
      return;
    }

    for (const name of toDrop) {
      try {
        await db.dropCollection(name);
        console.log(`Dropped: ${name}`);
      } catch (err) {
        console.error(`Failed to drop ${name}:`, err.message);
      }
    }
    console.log('Cleanup finished.');
  } catch (err) {
    console.error('Cleanup error:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
})();
