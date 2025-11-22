// Helper to parse tee time email body from Resend
// Returns: { action, dateStr, timeStr, holes, players, course, rawLines }
function parseTeeTimeEmail(bodyText, subject) {
  const result = {
    action: null,
    dateStr: null,
    timeStr: null,
    holes: null,
    players: null,
    course: subject || null,
    rawLines: []
  };
  if (!bodyText) return result;
  const lines = bodyText.replace(/\r\n?/g, '\n').split('\n').map(l => l.trim());
  result.rawLines = lines;
  // Find action from first non-empty line
  const firstLine = lines.find(l => l.length > 0) || '';
  if (/created/i.test(firstLine)) result.action = 'CREATE';
  else if (/cancelled|canceled/i.test(firstLine)) result.action = 'CANCEL';
  else if (/modified|changed|updated/i.test(firstLine)) result.action = 'MODIFY';
  else {
    console.warn('[parseTeeTimeEmail] Unknown action:', firstLine);
    return null;
  }
  for (const line of lines) {
    if (/^date:/i.test(line)) result.dateStr = line.replace(/^date:/i, '').trim();
    if (/^time:/i.test(line)) result.timeStr = line.replace(/^time:/i, '').trim();
    if (/^holes:/i.test(line)) {
      const n = parseInt(line.replace(/^holes:/i, '').trim(), 10);
      if (!isNaN(n)) result.holes = n;
    }
    if (/^players:/i.test(line)) {
      const n = parseInt(line.replace(/^players:/i, '').trim(), 10);
      if (!isNaN(n)) result.players = n;
    }
    // Optionally: parse course name after "Golf Club Details"
    // Not required for now, as subject is used for course
  }
  return result;
}

module.exports = { parseTeeTimeEmail };
