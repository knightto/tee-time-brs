// Parse a single handicap value; supports "+1.2" => -1.2
function parseHandicapValue(indexStr, rawStr) {
  const primary = indexStr !== undefined && indexStr !== null && indexStr !== '' ? String(indexStr).trim() : '';
  const fallback = rawStr !== undefined && rawStr !== null && rawStr !== '' ? String(rawStr).trim() : '';
  const valueStr = primary || fallback;
  if (!valueStr) return { error: 'handicap_index missing' };
  let normalized = valueStr;
  if (normalized.startsWith('+')) normalized = '-' + normalized.slice(1);
  const num = Number(normalized);
  if (Number.isNaN(num)) return { error: `handicap_index not numeric: ${valueStr}` };
  if (num < -15 || num > 54) return { error: `handicap_index out of range: ${num}` };
  return { value: num };
}

// Minimal CSV parser supporting quotes, commas, and newlines in quotes
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        field += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (char === ',') {
        row.push(field);
        field = '';
        i++;
        continue;
      }
      if (char === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        i++;
        continue;
      }
      if (char === '\r') {
        i++;
        continue;
      }
      field += char;
      i++;
    }
  }
  row.push(field);
  rows.push(row);
  return rows;
}

function normalizeHeader(name = '') {
  return String(name).trim().toLowerCase();
}

function mapRow(headers, values) {
  const obj = {};
  headers.forEach((h, idx) => {
    obj[h] = values[idx] !== undefined ? values[idx] : '';
  });
  return obj;
}

function validateRow(rawObj, rowNumber, importDate) {
  const errors = [];
  const out = {};
  const ghin = String(rawObj.ghin || '').trim();
  if (!ghin) errors.push('ghin required');
  out.ghin = ghin;

  const firstName = String(rawObj.first_name || '').trim();
  const lastName = String(rawObj.last_name || '').trim();
  if (!firstName) errors.push('first_name required');
  if (!lastName) errors.push('last_name required');
  out.firstName = firstName;
  out.lastName = lastName;

  const parsedHcp = parseHandicapValue(rawObj.handicap_index, rawObj.handicap_index_raw);
  if (parsedHcp.error) errors.push(parsedHcp.error);
  out.handicapIndex = parsedHcp.value;

  const asOfStr = String(rawObj.as_of_date || '').trim();
  let asOfDate = importDate;
  if (asOfStr) {
    const d = new Date(asOfStr);
    if (isNaN(d)) errors.push('as_of_date invalid');
    else asOfDate = d;
  }
  out.asOfDate = asOfDate;

  out.notes = String(rawObj.notes || '').trim();
  out.clubId = String(rawObj.club_id || rawObj.clubId || '').trim();
  out.clubName = String(rawObj.club_name || '').trim();
  return { errors, row: out };
}

async function importHandicapsFromCsv({
  csvText,
  clubId,
  dryRun = false,
  importedBy = null,
  fileName = '',
  models
}) {
  const { Golfer, HandicapSnapshot, ImportBatch } = models;
  const parsedRows = parseCsv(csvText || '');
  if (!parsedRows.length) return { rowCount: 0, successCount: 0, errorCount: 1, errors: [{ rowNumber: 1, message: 'Empty file' }] };
  const headerRow = parsedRows[0].map(normalizeHeader);
  const headers = ['club_id','club_name','ghin','first_name','last_name','handicap_index_raw','handicap_index','as_of_date','notes'];
  const missing = headers.filter(h => !headerRow.includes(h));
  if (missing.length) {
    return { rowCount: 0, successCount: 0, errorCount: 1, errors: [{ rowNumber: 1, message: 'Missing headers: ' + missing.join(', ') }] };
  }
  const importDate = new Date();
  let rowCount = 0, successCount = 0, errorCount = 0;
  const errors = [];
  const validRows = [];
  for (let i = 1; i < parsedRows.length; i++) {
    const values = parsedRows[i];
    if (values.length === 1 && values[0].trim() === '') continue; // skip blank lines
    const obj = mapRow(headerRow, values);
    rowCount++;
    const { errors: rowErrors, row } = validateRow(obj, i + 1, importDate);
    // enforce clubId from URL if provided
    if (clubId) row.clubId = clubId;
    if (!row.clubId) rowErrors.push('club_id required');
    if (rowErrors.length) {
      errorCount++;
      errors.push({ rowNumber: i + 1, ghin: row.ghin, message: rowErrors.join('; '), rawRow: obj });
      continue;
    }
    validRows.push({ ...row, rowNumber: i + 1 });
  }

  if (dryRun) {
    return { rowCount, successCount: validRows.length, errorCount, errors };
  }

  const batch = await ImportBatch.create({
    clubId,
    importedBy,
    fileName,
    rowCount,
    successCount: 0,
    errorCount
  });

  for (const row of validRows) {
    try {
      const existing = await Golfer.findOne({ clubId: row.clubId, ghin: row.ghin });
      let golfer = existing;
      if (!golfer) {
        golfer = await Golfer.create({
          clubId: row.clubId,
          ghin: row.ghin,
          firstName: row.firstName,
          lastName: row.lastName,
          active: true
        });
      } else {
        golfer.firstName = row.firstName;
        golfer.lastName = row.lastName;
        await golfer.save();
      }
      await HandicapSnapshot.create({
        golferId: golfer._id,
        handicapIndex: row.handicapIndex,
        asOfDate: row.asOfDate,
        importedAt: importDate,
        importBatchId: batch._id,
        source: 'manual_csv'
      });
      successCount++;
    } catch (err) {
      errorCount++;
      errors.push({ rowNumber: row.rowNumber, ghin: row.ghin, message: err.message });
    }
  }

  batch.successCount = successCount;
  batch.errorCount = errorCount;
  batch.errorsJson = errors.slice(0, 200);
  await batch.save();

  return {
    importBatchId: batch._id,
    rowCount,
    successCount,
    errorCount,
    errors: errors.slice(0, 200)
  };
}

module.exports = {
  importHandicapsFromCsv,
  parseHandicapValue,
  parseCsv,
  validateRow
};
