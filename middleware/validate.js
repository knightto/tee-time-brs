function validateBody(validator) {
  return (req, res, next) => {
    const err = validator(req.body || {});
    if (err) return res.status(400).json({ error: err });
    next();
  };
}

function validateCreateEvent(body) {
  if (!body || typeof body !== 'object') return 'body required';
  if (!String(body.course || '').trim()) return 'course required';
  if (!body.date) return 'date required';
  const isSeniorsEventOnly = String(body.groupSlug || '').trim().toLowerCase() === 'seniors'
    && String(body.seniorsRegistrationMode || '').trim().toLowerCase() === 'event-only';
  if (body.isTeamEvent) {
    if (!String(body.teamStartTime || '').trim()) return 'teamStartTime required for team events';
  } else if (!isSeniorsEventOnly) {
    if (!String(body.teeTime || '').trim()) return 'teeTime required for tee-time events';
  }
  return null;
}

function validateAddPlayer(body) {
  if (!String(body.name || '').trim()) return 'name required';
  if (body.asFifth !== undefined && typeof body.asFifth !== 'boolean') return 'asFifth must be boolean';
  return null;
}

module.exports = { validateBody, validateCreateEvent, validateAddPlayer };
