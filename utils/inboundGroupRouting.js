function sanitizeGroupSlugToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function splitEmailParts(address = '') {
  const normalized = String(address || '').trim().toLowerCase();
  const atIndex = normalized.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === normalized.length - 1) {
    return { localPart: '', domain: '', normalized };
  }
  return {
    localPart: normalized.slice(0, atIndex),
    domain: normalized.slice(atIndex + 1),
    normalized,
  };
}

function parseGroupSlugFromInboundAddress(address = '', baseAddress = '') {
  const target = splitEmailParts(address);
  const base = splitEmailParts(baseAddress);
  if (!target.localPart || !base.localPart) return '';
  if (target.domain !== base.domain) return '';
  if (target.localPart === base.localPart) return '';
  const prefix = `${base.localPart}+`;
  if (!target.localPart.startsWith(prefix)) return '';
  return sanitizeGroupSlugToken(target.localPart.slice(prefix.length));
}

function isAllowedInboundRecipient(address = '', baseAddress = '') {
  const target = splitEmailParts(address);
  const base = splitEmailParts(baseAddress);
  if (!target.normalized || !base.normalized) return false;
  if (target.normalized === base.normalized) return true;
  return Boolean(parseGroupSlugFromInboundAddress(target.normalized, base.normalized));
}

function parseGroupSlugFromSubject(subject = '') {
  const text = String(subject || '').trim();
  if (!text) return '';
  const tagged = text.match(/\[\s*group\s*:\s*([a-z0-9-]+)\s*\]/i);
  if (tagged && tagged[1]) return sanitizeGroupSlugToken(tagged[1]);
  return '';
}

function collectRecipientAddresses(value) {
  if (Array.isArray(value)) return value.flatMap((entry) => collectRecipientAddresses(entry));
  if (!value) return [];
  if (typeof value === 'string') return [value];
  if (typeof value === 'object') {
    if (typeof value.email === 'string') return [value.email];
    if (typeof value.address === 'string') return [value.address];
    if (typeof value.value === 'string') return [value.value];
  }
  return [];
}

function inferInboundGroupRouting(input = {}) {
  const baseAddress = String(input.baseAddress || '').trim().toLowerCase();
  const addresses = [
    ...collectRecipientAddresses(input.eventTo),
    ...collectRecipientAddresses(input.emailTo),
  ];

  for (const address of addresses) {
    const slug = parseGroupSlugFromInboundAddress(address, baseAddress);
    if (slug) {
      return { groupSlug: slug, source: 'recipient-alias', marker: String(address || '').trim() };
    }
  }

  const subjectSlug = parseGroupSlugFromSubject(input.subject);
  if (subjectSlug) {
    return { groupSlug: subjectSlug, source: 'subject-tag', marker: String(input.subject || '').trim() };
  }

  return { groupSlug: '', source: 'default', marker: '' };
}

module.exports = {
  sanitizeGroupSlugToken,
  parseGroupSlugFromInboundAddress,
  parseGroupSlugFromSubject,
  isAllowedInboundRecipient,
  inferInboundGroupRouting,
};
