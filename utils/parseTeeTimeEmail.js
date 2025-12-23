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

  // Detect action based on reservation text
  const joined = lines.join(' ').toLowerCase();
  if (joined.includes('your reservation has been booked')) result.action = 'CREATE';
  else if (joined.includes('your reservation was cancelled')) result.action = 'CANCEL';
  else if (
    joined.includes('reservation has been updated') ||
    joined.includes('has been updated') ||
    joined.includes('reservation has been modified') ||
    joined.includes('player added') ||
    joined.includes('added to your reservation') ||
    joined.includes('player removed') ||
    joined.includes('removed from your reservation')
  ) {
    result.action = 'UPDATE';
  }

  // Fallback: derive action from subject line keywords
  const subj = (subject || '').toLowerCase();
  if (!result.action && subj.includes('reservation was cancelled')) result.action = 'CANCEL';
  if (!result.action && subj.includes('tee time reservation confirmation')) result.action = 'CREATE';
  if (!result.action && (
    subj.includes('reservation update') ||
    subj.includes('reservation was updated') ||
    subj.includes('player added') ||
    subj.includes('player removed') ||
    subj.includes('reservation modified')
  )) {
    result.action = 'UPDATE';
  }

  // Extract details from DETAILS section
  let detailsIdx = lines.findIndex(l => /^details\b/i.test(l));
  if (detailsIdx === -1) {
    // Try to find a line that just says 'Details'
    detailsIdx = lines.findIndex(l => l.toLowerCase() === 'details');
  }
  if (detailsIdx !== -1) {
    for (let i = detailsIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (/^date:/i.test(line)) result.dateStr = line.replace(/^date:/i, '').trim();
      else if (/^time:/i.test(line)) result.timeStr = line.replace(/^time:/i, '').trim();
      else if (/^holes:/i.test(line)) {
        const n = parseInt(line.replace(/^holes:/i, '').trim(), 10);
        if (!isNaN(n)) result.holes = n;
      } else if (/^players:/i.test(line)) {
        const n = parseInt(line.replace(/^players:/i, '').trim(), 10);
        if (!isNaN(n)) result.players = n;
      } else if (!line) {
        // Stop at first blank line after details
        break;
      }
    }
  }

  // Fallback: try to extract details from anywhere if not found in DETAILS section
  if (!result.dateStr || !result.timeStr || !result.holes || !result.players) {
    for (const line of lines) {
      if (!result.dateStr && /^date:/i.test(line)) result.dateStr = line.replace(/^date:/i, '').trim();
      if (!result.timeStr && /^time:/i.test(line)) result.timeStr = line.replace(/^time:/i, '').trim();
      if (!result.holes && /^holes:/i.test(line)) {
        const n = parseInt(line.replace(/^holes:/i, '').trim(), 10);
        if (!isNaN(n)) result.holes = n;
      }
      if (!result.players && /^players:/i.test(line)) {
        const n = parseInt(line.replace(/^players:/i, '').trim(), 10);
        if (!isNaN(n)) result.players = n;
      }
    }
  }

  if (!result.action && result.dateStr && result.timeStr && result.holes && result.players) {
    // If details exist but we don't see a clear create/cancel keyword,
    // treat it as an update to avoid accidentally creating duplicate events.
    result.action = 'UPDATE';
  }
  if (!result.action) {
    console.warn('[parseTeeTimeEmail] Unknown action and insufficient reservation details:', lines[0]);
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
