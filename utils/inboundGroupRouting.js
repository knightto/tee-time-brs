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
  if (/\bseniors\b/i.test(text)) return 'seniors';
  return '';
}

function decodeHtmlText(value = '') {
  return String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"');
}

function collectLeadBodyLines(input = {}) {
  const combined = [
    String(input.bodyText || ''),
    decodeHtmlText(input.bodyHtml || ''),
  ].filter(Boolean).join('\n');
  return combined
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => String(line || '').trim())
    .filter(Boolean)
    .slice(0, 6);
}

function parseGroupSlugFromLeadBody(input = {}) {
  const leadLines = collectLeadBodyLines(input);
  const markerLine = leadLines.find((line) => /\bseniors\b/i.test(line));
  if (markerLine) return { groupSlug: 'seniors', marker: markerLine };
  return { groupSlug: '', marker: '' };
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

  const bodyRouting = parseGroupSlugFromLeadBody(input);
  if (bodyRouting.groupSlug) {
    return { groupSlug: bodyRouting.groupSlug, source: 'body-lead-lines', marker: bodyRouting.marker };
  }

  return { groupSlug: '', source: 'default', marker: '' };
}

module.exports = {
  sanitizeGroupSlugToken,
  parseGroupSlugFromInboundAddress,
  parseGroupSlugFromSubject,
  parseGroupSlugFromLeadBody,
  isAllowedInboundRecipient,
  inferInboundGroupRouting,
};
