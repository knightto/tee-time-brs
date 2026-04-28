require('dotenv').config();
const mongoose = require('mongoose');

const EVENT_NAME = 'Plastered "Open"';
const START_DATE = new Date('2026-06-19');

const secondaryUri = String(process.env.MONGO_URI_SECONDARY || '').trim();
const secondaryDb = process.env.MONGO_DB_SECONDARY || undefined;

if (!secondaryUri) {
  console.error('Missing MONGO_URI_SECONDARY in environment');
  process.exit(1);
}

const ledgerItems = [
  {
    type: 'income',
    category: 'raffle_income',
    label: 'Seeded raffle ticket income',
    amount: 100,
    paidBy: 'Raffle cash box',
    notes: 'Seed item for Plastered Open fee-management ledger.',
  },
  {
    type: 'expense',
    category: 'raffle_purchase',
    label: 'Seeded raffle prize purchase',
    amount: 45,
    paidTo: 'Prize supplier',
    notes: 'Seed item for raffle purchase tracking.',
  },
  {
    type: 'expense',
    category: 'outing_expense',
    label: 'Seeded outing supplies',
    amount: 25,
    paidTo: 'Outing supplies',
    notes: 'Seed item for general expense tracking.',
  },
];

async function main() {
  const conn = await mongoose.createConnection(secondaryUri, { dbName: secondaryDb }).asPromise();
  try {
    const BlueRidgeOuting = conn.model('BlueRidgeOuting', require('../models/BlueRidgeOuting').schema);
    const BlueRidgeOutingLedgerEntry = conn.model(
      'BlueRidgeOutingLedgerEntry',
      require('../models/BlueRidgeOutingLedgerEntry').schema
    );

    const event = await BlueRidgeOuting.findOne({ name: EVENT_NAME, startDate: START_DATE });
    if (!event) throw new Error(`Could not find ${EVENT_NAME} on ${START_DATE.toISOString().slice(0, 10)}`);

    const results = [];
    for (const item of ledgerItems) {
      const updated = await BlueRidgeOutingLedgerEntry.findOneAndUpdate(
        { eventId: event._id, label: item.label },
        {
          $set: {
            ...item,
            eventId: event._id,
            occurredAt: new Date('2026-04-28T12:00:00-04:00'),
          },
        },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );
      results.push({
        id: String(updated._id),
        type: updated.type,
        category: updated.category,
        label: updated.label,
        amount: updated.amount,
      });
    }

    console.log(JSON.stringify({
      ok: true,
      eventId: String(event._id),
      eventName: event.name,
      ledgerItems: results,
    }, null, 2));
  } finally {
    await conn.close();
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
