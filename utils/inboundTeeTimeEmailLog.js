function normalizeInboundEmailReceivedAt(email = {}, eventData = {}) {
  const candidate = email.created_at
    || email.createdAt
    || eventData.created_at
    || eventData.createdAt
    || Date.now();
  const value = new Date(candidate);
  return Number.isNaN(value.getTime()) ? new Date() : value;
}

function extractTtid(rawLines = []) {
  for (const rawLine of rawLines) {
    const line = String(rawLine || '').trim();
    const match = line.match(/^ttid:\s*(.+)$/i);
    if (match && match[1]) return match[1].trim();
  }
  return '';
}

function buildInboundTeeTimeEmailLogEntry({
  groupSlug = 'main',
  parsed = {},
  facility = '',
  email = {},
  eventData = {},
  normalizedDate = '',
  normalizedTime = '',
  generatedTeeTimes = [],
} = {}) {
  return {
    groupSlug: String(groupSlug || 'main').trim().toLowerCase() || 'main',
    sourceEmailId: String(eventData.email_id || email.id || '').trim(),
    sourceEventId: String(eventData.id || '').trim(),
    action: String(parsed.action || 'create').trim().toLowerCase() || 'create',
    sourceEmail: String(email.from || '').trim(),
    subject: String(email.subject || '').trim(),
    course: String(facility || parsed.course || email.subject || '').trim(),
    facility: String(facility || '').trim(),
    teeDateISO: String(normalizedDate || '').trim(),
    teeTime: String(normalizedTime || '').trim(),
    teeTimes: Array.isArray(generatedTeeTimes) ? generatedTeeTimes.map((value) => String(value || '').trim()).filter(Boolean) : [],
    rawDateStr: String(parsed.dateStr || '').trim(),
    rawTimeStr: String(parsed.timeStr || '').trim(),
    golferCount: Number(parsed.players) > 0 ? Number(parsed.players) : 0,
    holes: Number(parsed.holes) > 0 ? Number(parsed.holes) : 0,
    ttid: extractTtid(parsed.rawLines || []),
    processingResult: 'received',
    processingNote: '',
    matchedEventId: '',
    createdEventId: '',
    emailReceivedAt: normalizeInboundEmailReceivedAt(email, eventData),
    loggedAt: new Date(),
  };
}

function buildInboundTeeTimeEmailLogResultUpdate({
  processingResult = '',
  processingNote = '',
  matchedEventId = '',
  createdEventId = '',
} = {}) {
  const update = {
    loggedAt: new Date(),
  };
  if (processingResult) update.processingResult = String(processingResult).trim().toLowerCase();
  if (processingNote !== undefined) update.processingNote = String(processingNote || '').trim();
  if (matchedEventId !== undefined) update.matchedEventId = String(matchedEventId || '').trim();
  if (createdEventId !== undefined) update.createdEventId = String(createdEventId || '').trim();
  return update;
}

module.exports = {
  buildInboundTeeTimeEmailLogEntry,
  buildInboundTeeTimeEmailLogResultUpdate,
  extractTtid,
  normalizeInboundEmailReceivedAt,
};
