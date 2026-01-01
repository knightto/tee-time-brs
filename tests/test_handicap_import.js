const assert = require('assert');
const { importHandicapsFromCsv, parseHandicapValue } = require('../services/handicapImportService');

function createFakeModel() {
  let idCounter = 1;
  const data = [];
  return {
    data,
    async findOne(query) {
      return data.find((d) => Object.keys(query).every((k) => {
        const val = query[k];
        if (val && val.$in) return val.$in.some((x) => String(x) === String(d[k]));
        return String(d[k]) === String(val);
      })) || null;
    },
    async create(doc) {
      const obj = { ...doc, _id: String(idCounter++) };
      obj.save = async () => obj;
      data.push(obj);
      return obj;
    },
    async find(query = {}) {
      const out = data.filter((d) => Object.keys(query).every((k) => {
        const val = query[k];
        if (val && val.$in) return val.$in.some((x) => String(x) === String(d[k]));
        return String(d[k]) === String(val);
      }));
      out.sort = function(sortObj) {
        const [key, dir] = Object.entries(sortObj)[0];
        return [...out].sort((a, b) => dir < 0 ? b[key] - a[key] : a[key] - b[key]);
      };
      out.lean = async () => out;
      return out;
    },
    async findById(id) {
      const found = data.find((d) => String(d._id) === String(id));
      if (!found) return null;
      found.save = async () => found;
      return found;
    },
    async findByIdAndDelete(id) {
      const idx = data.findIndex((d) => String(d._id) === String(id));
      if (idx === -1) return null;
      const [removed] = data.splice(idx, 1);
      return removed;
    },
    async findOneAndDelete(query) {
      const idx = data.findIndex((d) => Object.keys(query).every((k) => String(d[k]) === String(query[k])));
      if (idx === -1) return null;
      const [removed] = data.splice(idx, 1);
      return removed;
    }
  };
}

async function runTests() {
  // dry run
  {
    const csv = 'club_id,club_name,ghin,first_name,last_name,handicap_index_raw,handicap_index,as_of_date,notes\nc1,Club,12345,Tommy,Knight,,12.3,2024-12-01,\n';
    const Golfer = createFakeModel();
    const HandicapSnapshot = createFakeModel();
    const ImportBatch = createFakeModel();
    const res = await importHandicapsFromCsv({ csvText: csv, clubId: 'c1', dryRun: true, models: { Golfer, HandicapSnapshot, ImportBatch } });
    assert.strictEqual(res.successCount, 1, 'dryRun should count success');
    assert.strictEqual(HandicapSnapshot.data.length, 0, 'dryRun should not create snapshots');
  }

  // import upsert + snapshot
  {
    const csv = 'club_id,club_name,ghin,first_name,last_name,handicap_index_raw,handicap_index,as_of_date,notes\nc1,Club,99999,Sam,Player,,10.1,2024-12-02,\n';
    const Golfer = createFakeModel();
    const HandicapSnapshot = createFakeModel();
    const ImportBatch = createFakeModel();
    const res = await importHandicapsFromCsv({ csvText: csv, clubId: 'c1', dryRun: false, models: { Golfer, HandicapSnapshot, ImportBatch } });
    assert.strictEqual(res.successCount, 1, 'import should succeed');
    assert.strictEqual(Golfer.data.length, 1, 'golfer created');
    assert.strictEqual(HandicapSnapshot.data.length, 1, 'snapshot created');
  }

  // plus handicap parsing
  {
    const parsed = parseHandicapValue('', '+1.2');
    assert.strictEqual(parsed.value, -1.2, 'plus handicap should become negative');
  }

  // invalid rows
  {
    const csv = 'club_id,club_name,ghin,first_name,last_name,handicap_index_raw,handicap_index,as_of_date,notes\nc1,Club,,No,Ghin,,10.1,2024-12-02,\n';
    const res = await importHandicapsFromCsv({ csvText: csv, clubId: 'c1', dryRun: true, models: { Golfer: createFakeModel(), HandicapSnapshot: createFakeModel(), ImportBatch: createFakeModel() } });
    assert.strictEqual(res.errorCount, 1, 'missing ghin should error');
    assert.ok(res.errors[0].rowNumber === 2, 'error row number should be 2');
  }

  // latest snapshot selection logic sample
  {
    const snaps = [
      { golferId: '1', handicapIndex: 5, asOfDate: new Date('2024-01-01'), importedAt: new Date('2024-01-01T10:00:00Z') },
      { golferId: '1', handicapIndex: 4.5, asOfDate: new Date('2024-02-01'), importedAt: new Date('2024-02-01T09:00:00Z') }
    ];
    const latest = snaps.sort((a, b) => {
      if (b.asOfDate.getTime() !== a.asOfDate.getTime()) return b.asOfDate - a.asOfDate;
      return b.importedAt - a.importedAt;
    })[0];
    assert.strictEqual(latest.handicapIndex, 4.5, 'latest snapshot should use newest as_of_date');
  }

  console.log('test_handicap_import.js passed');
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
