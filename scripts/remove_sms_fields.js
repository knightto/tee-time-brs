// Migration script: Remove SMS fields from existing subscribers
require('dotenv').config();
const mongoose = require('mongoose');

async function migrate() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected!');
    
    const db = mongoose.connection.db;
    const collection = db.collection('subscribers');
    
    // Get count before
    const beforeCount = await collection.countDocuments();
    console.log(`Found ${beforeCount} subscribers`);
    
    // Remove SMS-only fields from all documents
    const result = await collection.updateMany(
      {},
      {
        $unset: {
          phone: "",
          carrier: "",
          subscriptionType: ""
        }
      }
    );
    
    console.log(`Updated ${result.modifiedCount} documents`);
    console.log('Migration complete!');
    
    // Show sample of migrated data
    const sample = await collection.findOne({});
    console.log('Sample document after migration:', JSON.stringify(sample, null, 2));
    
    await mongoose.disconnect();
    console.log('Disconnected');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
