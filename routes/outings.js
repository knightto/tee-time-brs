const express = require('express');
const { getSecondaryConn, initSecondaryConn } = require('../secondary-conn');
const fetch = global.fetch || require('node-fetch');

initSecondaryConn();

const router = express.Router();
const SITE_ADMIN_WRITE_CODE = process.env.SITE_ADMIN_WRITE_CODE || '2000';
const REGISTRATION_PAYMENT_STATUSES = new Set(['unpaid', 'pending', 'paid', 'refunded']);
const FEE_PAID_TO_VALUES = new Set(['', 'club', 'tommy', 'john']);
const LEDGER_TYPES = new Set(['income', 'expense']);
const LEDGER_CATEGORIES = new Set([
  'raffle_income',
  'fifty_fifty_income',
  'raffle_purchase',
  'outing_expense',
  'course_payment',
  'prize_pool',
  'tournament_fee',
  'sponsor_income',
  'other',
]);
const DEFAULT_PLASTERED_FEE_SCHEDULE = [
  { key: 'non_member_entry_fee', label: 'Non-member player entry fee', amount: 90, basis: 'per_player', category: 'income', enabled: true, notes: 'Amount collected from each player who is not a Blue Ridge Shadows golf club member.' },
  { key: 'member_entry_fee', label: 'Blue Ridge Shadows member entry fee', amount: 45, basis: 'per_player', category: 'income', enabled: true, notes: 'Amount collected from each Blue Ridge Shadows golf club member.' },
  { key: 'non_member_course_fee', label: 'Non-member course allocation', amount: 65, basis: 'per_player', category: 'course', enabled: true, notes: 'Amount owed to the course for each non-member player.' },
  { key: 'member_course_fee', label: 'Member food allocation', amount: 20, basis: 'per_player', category: 'course', enabled: true, notes: 'Amount owed to the course for member food.' },
  { key: 'prize_pool', label: 'Prize pool', amount: 25, basis: 'per_player', category: 'prize', enabled: true, notes: 'Amount reserved for player payouts.' },
  { key: 'tournament_fees', label: 'Tourney fees', amount: 0, basis: 'flat', category: 'tournament', enabled: true, notes: 'Optional tournament-side costs.' },
  { key: 'raffle_income', label: 'Raffle income', amount: 0, basis: 'flat', category: 'raffle', enabled: true, notes: 'Track actual raffle money in the ledger.' },
  { key: 'fifty_fifty_income', label: '50/50 raffle income', amount: 0, basis: 'flat', category: 'raffle', enabled: true, notes: 'Track actual 50/50 raffle money in the ledger.' },
  { key: 'raffle_purchases', label: 'Raffle purchases', amount: 0, basis: 'flat', category: 'expense', enabled: true, notes: 'Track actual raffle purchases in the ledger.' },
  { key: 'other_expenses', label: 'Other expenses', amount: 0, basis: 'flat', category: 'expense', enabled: true, notes: 'Food, supplies, signs, and other outing costs.' },
];
const PLASTERED_OPEN_ALERT_EMAILS = uniqueEmailList(
  String(process.env.PLASTERED_OPEN_ALERT_EMAILS || 'tommy.knight@gmail.com').split(',')
);

function getSecondaryModels() {
  const conn = getSecondaryConn();
  if (!conn) return {};
  return {
    BlueRidgeOuting: conn.model('BlueRidgeOuting', require('../models/BlueRidgeOuting').schema),
    BlueRidgeOutingAuditLog: conn.model('BlueRidgeOutingAuditLog', require('../models/BlueRidgeOutingAuditLog').schema),
    BlueRidgeOutingLedgerEntry: conn.model('BlueRidgeOutingLedgerEntry', require('../models/BlueRidgeOutingLedgerEntry').schema),
    BlueRidgeOutingMailingContact: conn.model('BlueRidgeOutingMailingContact', require('../models/BlueRidgeOutingMailingContact').schema),
    BlueRidgeOutingMessage: conn.model('BlueRidgeOutingMessage', require('../models/BlueRidgeOutingMessage').schema),
    BlueRidgeRegistration: conn.model('BlueRidgeRegistration', require('../models/BlueRidgeRegistration').schema),
    BlueRidgeTeam: conn.model('BlueRidgeTeam', require('../models/BlueRidgeTeam').schema),
    BlueRidgeTeamMember: conn.model('BlueRidgeTeamMember', require('../models/BlueRidgeTeamMember').schema),
    BlueRidgeWaitlist: conn.model('BlueRidgeWaitlist', require('../models/BlueRidgeWaitlist').schema),
  };
}

function waitForOpen(conn, timeoutMs = 5000) {
  return new Promise((resolve) => {
    if (!conn) return resolve(false);
    if (conn.readyState === 1) return resolve(true);
    const timer = setTimeout(() => resolve(conn.readyState === 1), timeoutMs);
    const onOpen = () => {
      clearTimeout(timer);
      resolve(true);
    };
    conn.once('open', onOpen);
  });
}

async function requireSecondaryConnection(res) {
  const conn = getSecondaryConn() || initSecondaryConn();
  if (!conn) {
    res.status(503).json({ error: 'Secondary database is unavailable (missing MONGO_URI_SECONDARY)' });
    return false;
  }
  if (conn.readyState !== 1) {
    const opened = await waitForOpen(conn, 5000);
    if (!opened) {
      res.status(503).json({ error: 'Secondary database is unavailable (connection timeout)' });
      return false;
    }
  }
  return true;
}

function isAdmin(req) {
  const code = req.headers['x-admin-code'] || req.query.code || (req.body && req.body.adminCode);
  return Boolean(SITE_ADMIN_WRITE_CODE && code && code === SITE_ADMIN_WRITE_CODE);
}

function badRequest(res, msg) {
  return res.status(400).json({ error: msg });
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function uniqueEmailList(values = []) {
  const seen = new Set();
  const out = [];
  (Array.isArray(values) ? values.flat(Infinity) : [values]).forEach((value) => {
    const email = normalizeEmail(value);
    if (!email || seen.has(email)) return;
    seen.add(email);
    out.push(email);
  });
  return out;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeEmailSubject(subject = '') {
  const raw = String(subject || '').trim();
  if (process.env.E2E_TEST_MODE === '1' && !/^THIS IS A TEST\b/i.test(raw)) {
    return `THIS IS A TEST - ${raw}`;
  }
  return raw;
}

function formatModeLabel(mode) {
  return String(mode || '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function routePath(req) {
  return String((req && (req.originalUrl || req.path || '')) || '').split('?')[0];
}

function auditActor(req) {
  return isAdmin(req) ? 'admin' : 'public';
}

function parseBool(val, fallback = false) {
  if (val === undefined || val === null || val === '') return fallback;
  if (typeof val === 'boolean') return val;
  const x = String(val).toLowerCase();
  return x === '1' || x === 'true' || x === 'yes' || x === 'y' || x === 'on';
}

function parseNum(val) {
  if (val === undefined || val === null || val === '') return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}

function parseMoneyAmount(val, fallback = 0) {
  if (val === undefined || val === null || val === '') return fallback;
  const n = Number(val);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Number(n.toFixed(2));
}

function slugKey(value, fallback = 'fee') {
  const key = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return key || fallback;
}

function normalizeFeeBasis(value) {
  const key = String(value || '').trim().toLowerCase();
  return ['per_player', 'per_team', 'flat'].includes(key) ? key : 'per_player';
}

function normalizeFeeCategory(value) {
  const key = String(value || '').trim().toLowerCase();
  return ['income', 'course', 'prize', 'tournament', 'raffle', 'expense', 'other'].includes(key) ? key : 'other';
}

function normalizeFeeScheduleItems(items = []) {
  const source = Array.isArray(items) ? items : [];
  return source
    .map((item, index) => {
      const label = String(item && item.label || '').trim();
      const key = slugKey(item && (item.key || label), `fee_${index + 1}`);
      return {
        key,
        label: label || key.replace(/_/g, ' '),
        amount: parseMoneyAmount(item && item.amount, 0),
        basis: normalizeFeeBasis(item && item.basis),
        category: normalizeFeeCategory(item && item.category),
        enabled: parseBool(item && item.enabled, true),
        notes: String(item && item.notes || '').trim().slice(0, 500),
      };
    })
    .filter((item) => item.label);
}

function feeScheduleForEvent(event) {
  const custom = normalizeFeeScheduleItems(event && event.feeSchedule || []);
  if (custom.length) return custom;
  if (isPlasteredOpenEvent(event)) return DEFAULT_PLASTERED_FEE_SCHEDULE.map((item) => ({ ...item }));
  const entryFee = parseMoneyAmount(event && event.entryFee, 0);
  return [
    { key: 'entry_fee', label: 'Player entry fee', amount: entryFee, basis: 'per_player', category: 'income', enabled: true, notes: 'Amount collected from each player.' },
  ];
}

function normalizeLedgerCategory(value) {
  const key = String(value || '').trim().toLowerCase();
  return LEDGER_CATEGORIES.has(key) ? key : 'other';
}

function coerceLedgerInput(body = {}) {
  const category = normalizeLedgerCategory(body.category);
  const inferredType = ['raffle_income', 'fifty_fifty_income', 'sponsor_income'].includes(category) ? 'income' : 'expense';
  const type = String(body.type || inferredType).trim().toLowerCase();
  return {
    type: LEDGER_TYPES.has(type) ? type : inferredType,
    category,
    label: String(body.label || '').trim(),
    amount: parseMoneyAmount(body.amount, 0),
    paidTo: String(body.paidTo || '').trim(),
    paidBy: String(body.paidBy || '').trim(),
    method: String(body.method || '').trim(),
    occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
    notes: String(body.notes || '').trim(),
  };
}

function dateOnlyKey(value) {
  const raw = String(value || '').trim();
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  if (match) return match[1];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function formatDateOnly(value) {
  const key = dateOnlyKey(value);
  if (!key) return '';
  return new Date(`${key}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC' });
}

function formatDateRange(startDate, endDate) {
  const startKey = dateOnlyKey(startDate);
  const endKey = dateOnlyKey(endDate);
  if (!startKey && !endKey) return '';
  if (!endKey || startKey === endKey) return formatDateOnly(startDate);
  return `${formatDateOnly(startDate)} - ${formatDateOnly(endDate)}`;
}

function isPlasteredOpenEvent(event) {
  return /plastered/i.test(String(event && event.name || ''));
}

function playerFeeBreakdown(member = {}, event = null) {
  const isClubMember = Boolean(member && member.isClubMember);
  if (isPlasteredOpenEvent(event)) {
    return {
      isClubMember,
      entryFee: isClubMember ? 45 : 90,
      courseFee: isClubMember ? 20 : 65,
      prizePool: 25,
    };
  }
  const entryFee = parseMoneyAmount(event && event.entryFee, 0);
  return {
    isClubMember,
    entryFee,
    courseFee: 0,
    prizePool: 0,
  };
}

function formatMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '$0';
  return amount % 1 === 0 ? `$${amount.toFixed(0)}` : `$${amount.toFixed(2)}`;
}

function siteUrl(pathname = '/') {
  const base = String(process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/+$/, '');
  if (!base) return pathname;
  return `${base}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

async function sendPlasteredOpenAlertEmail(subject, html) {
  return sendPlasteredOpenEmail(PLASTERED_OPEN_ALERT_EMAILS, subject, html);
}

async function sendPlasteredOpenEmail(to, subject, html, options = {}) {
  const recipients = uniqueEmailList(to);
  if (!recipients.length) return { ok: true, skipped: true, reason: 'no-recipients' };
  const normalizedSubject = normalizeEmailSubject(subject);
  const useBcc = Boolean(options.bcc && recipients.length > 1);
  const toAddress = useBcc ? (PLASTERED_OPEN_ALERT_EMAILS[0] || recipients[0]) : recipients;
  const bccRecipients = useBcc ? recipients.filter((email) => email !== toAddress) : [];
  if (process.env.E2E_TEST_MODE === '1') {
    return {
      ok: true,
      simulated: true,
      data: { to: toAddress, bcc: bccRecipients, subject: normalizedSubject, bytes: String(html || '').length },
    };
  }
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) {
    return { ok: false, disabled: true };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM,
        to: toAddress,
        ...(bccRecipients.length ? { bcc: bccRecipients } : {}),
        subject: normalizedSubject,
        html,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) {
      const text = await resp.text();
      return { ok: false, error: { message: `Resend HTTP ${resp.status}: ${text}` } };
    }
    return { ok: true, data: await resp.json() };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, error: { message: err && err.message ? err.message : String(err) } };
  }
}

function playersListHtml(players = []) {
  const list = summarizePlayers(players).filter((player) => player.name || player.email);
  if (!list.length) return '<li>No golfers listed.</li>';
  return list.map((player) => {
    const contact = [player.email, player.phone].filter(Boolean).join(' | ');
    return `<li><strong>${escapeHtml(player.name || 'Golfer')}</strong>${contact ? ` - ${escapeHtml(contact)}` : ''}</li>`;
  }).join('');
}

async function notifyPlasteredOpenRegistration(event, payload = {}) {
  if (!isPlasteredOpenEvent(event)) return;
  const action = String(payload.action || 'updated');
  const teamName = String(payload.teamName || '').trim();
  const subjectAction = action === 'created' ? 'New Signup' : action === 'cancelled' ? 'Signup Cancelled' : 'Signup Updated';
  const subject = `Plastered Open ${subjectAction}${teamName ? `: ${teamName}` : ''}`;
  const changes = Array.isArray(payload.changes) ? payload.changes.filter(Boolean) : [];
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.45;color:#1f2937;">
      <h2 style="margin:0 0 12px;">${escapeHtml(subject)}</h2>
      <p><strong>Event:</strong> ${escapeHtml(event && event.name || 'Plastered Open')}</p>
      <p><strong>Submitted by:</strong> ${escapeHtml(payload.submittedByName || '')}${payload.submittedByEmail ? ` (${escapeHtml(payload.submittedByEmail)})` : ''}</p>
      ${teamName ? `<p><strong>Team:</strong> ${escapeHtml(teamName)}</p>` : ''}
      <p><strong>Mode:</strong> ${escapeHtml(formatModeLabel(payload.mode || ''))}</p>
      <p><strong>Keg sponsorship:</strong> ${escapeHtml(formatMoney(payload.kegSponsorshipAmount || 0))}</p>
      ${payload.notes ? `<p><strong>Notes:</strong> ${escapeHtml(payload.notes)}</p>` : ''}
      ${changes.length ? `<h3>Changes</h3><ul>${changes.map((change) => `<li>${escapeHtml(change)}</li>`).join('')}</ul>` : ''}
      <h3>Golfers</h3>
      <ul>${playersListHtml(payload.players)}</ul>
      <p><a href="${escapeHtml(siteUrl('/plastered-open-registration-list.html'))}">Open full registration list</a></p>
    </div>
  `;
  const result = await sendPlasteredOpenAlertEmail(subject, html);
  if ((!result || !result.ok) && !(result && result.disabled)) {
    console.error('Plastered Open alert email failed', result && result.error ? result.error : result);
  }
}

function registrationPlayerCountForAudit(event, entry, explicitCount) {
  const direct = Number(explicitCount);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const mode = String(entry && entry.mode || '').toLowerCase();
  const exact = Number(event && event.teamSizeExact || 0);
  const fallbackTeamSize = Number(event && event.teamSizeMax || event && event.teamSizeMin || 2);
  if (mode === 'full_team' || mode === 'member_guest') return exact > 0 ? exact : Math.max(2, fallbackTeamSize);
  return 1;
}

function registrationAmountDueForAudit(event, entry, explicitCount) {
  const fee = Number(event && event.entryFee);
  if (!Number.isFinite(fee)) return 0;
  return Number((registrationPlayerCountForAudit(event, entry, explicitCount) * fee).toFixed(2));
}

async function getKegSponsorshipSummary(eventId, models) {
  const BlueRidgeRegistration = models && models.BlueRidgeRegistration;
  if (!BlueRidgeRegistration) return { totalAmount: 0, contributorCount: 0 };
  if (typeof BlueRidgeRegistration.aggregate !== 'function') {
    const registrations = await BlueRidgeRegistration.find({ eventId, status: 'registered' }).lean();
    return (Array.isArray(registrations) ? registrations : []).reduce((summary, entry) => {
      const amount = parseMoneyAmount(entry && entry.kegSponsorshipAmount, 0);
      if (amount > 0) {
        summary.totalAmount = Number((summary.totalAmount + amount).toFixed(2));
        summary.contributorCount += 1;
      }
      return summary;
    }, { totalAmount: 0, contributorCount: 0 });
  }
  const rows = await BlueRidgeRegistration.aggregate([
    {
      $match: {
        eventId,
        status: 'registered',
        kegSponsorshipAmount: { $gt: 0 },
      },
    },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$kegSponsorshipAmount' },
        contributorCount: { $sum: 1 },
      },
    },
  ]);
  const row = rows && rows[0] ? rows[0] : {};
  return {
    totalAmount: Number(Number(row.totalAmount || 0).toFixed(2)),
    contributorCount: Number(row.contributorCount || 0),
  };
}

function applyFeeScheduleItem(item, counts = {}) {
  const amount = parseMoneyAmount(item && item.amount, 0);
  const basis = normalizeFeeBasis(item && item.basis);
  const key = String(item && item.key || '').trim().toLowerCase();
  if (key.includes('non_member')) return Number((amount * Number(counts.nonMemberPlayers || 0)).toFixed(2));
  if (key.includes('member_')) return Number((amount * Number(counts.memberPlayers || 0)).toFixed(2));
  const multiplier = basis === 'per_player'
    ? Number(counts.players || 0)
    : basis === 'per_team'
      ? Number(counts.teams || 0)
      : 1;
  return Number((amount * multiplier).toFixed(2));
}

function ledgerTotals(entries = []) {
  return (Array.isArray(entries) ? entries : []).reduce((summary, entry) => {
    const amount = parseMoneyAmount(entry && entry.amount, 0);
    const type = String(entry && entry.type || '').toLowerCase() === 'income' ? 'income' : 'expense';
    if (type === 'income') summary.income = Number((summary.income + amount).toFixed(2));
    else summary.expense = Number((summary.expense + amount).toFixed(2));
    const category = normalizeLedgerCategory(entry && entry.category);
    summary.byCategory[category] = Number(((summary.byCategory[category] || 0) + amount).toFixed(2));
    summary.net = Number((summary.income - summary.expense).toFixed(2));
    return summary;
  }, { income: 0, expense: 0, net: 0, byCategory: {} });
}

function addAudienceRecipient(map, raw = {}, group = 'all') {
  const email = normalizeEmail(raw.email || raw.emailKey || raw.submittedByEmail || '');
  if (!email || !email.includes('@')) return;
  const existing = map.get(email) || {
    name: String(raw.name || raw.submittedByName || '').trim(),
    email,
    phone: String(raw.phone || raw.submittedByPhone || '').trim(),
    groups: [],
    paymentStatus: '',
    source: '',
  };
  const groupKey = String(group || '').trim().toLowerCase();
  if (groupKey && !existing.groups.includes(groupKey)) existing.groups.push(groupKey);
  if (!existing.name) existing.name = String(raw.name || raw.submittedByName || '').trim();
  if (!existing.phone) existing.phone = String(raw.phone || raw.submittedByPhone || '').trim();
  if (raw.paymentStatus && !existing.paymentStatus) existing.paymentStatus = String(raw.paymentStatus || '').toLowerCase();
  if (raw.source && !existing.source) existing.source = String(raw.source || '').toLowerCase();
  map.set(email, existing);
}

function audienceCounts(recipients = []) {
  const counts = { all: recipients.length };
  recipients.forEach((recipient) => {
    (recipient.groups || []).forEach((group) => {
      counts[group] = (counts[group] || 0) + 1;
    });
  });
  return counts;
}

function filterAudienceRecipients(recipients = [], audience = 'all') {
  const key = String(audience || 'all').trim().toLowerCase();
  if (key === 'all') return recipients;
  return recipients.filter((recipient) => Array.isArray(recipient.groups) && recipient.groups.includes(key));
}

async function buildCommunicationAudience(event, models) {
  const [members, registrations, waitlist, manualContacts, messages] = await Promise.all([
    models.BlueRidgeTeamMember.find({ eventId: event._id, status: 'active' }).lean(),
    models.BlueRidgeRegistration.find({ eventId: event._id, status: 'registered' }).sort({ createdAt: -1 }).lean(),
    models.BlueRidgeWaitlist.find({ eventId: event._id, status: 'active' }).sort({ createdAt: -1 }).lean(),
    models.BlueRidgeOutingMailingContact.find({ eventId: event._id, status: 'subscribed' }).sort({ createdAt: -1 }).lean(),
    models.BlueRidgeOutingMessage.find({ eventId: event._id }).sort({ sentAt: -1 }).limit(50).lean(),
  ]);
  const map = new Map();
  (Array.isArray(members) ? members : []).forEach((member) => {
    addAudienceRecipient(map, { ...member, source: 'registration' }, 'registered');
    const paidTo = normalizeFeePaidTo(member && member.feePaidTo);
    addAudienceRecipient(map, member, paidTo ? 'paid' : 'unpaid');
  });
  (Array.isArray(registrations) ? registrations : []).forEach((registration) => {
    addAudienceRecipient(map, { ...registration, source: 'registration' }, 'submitting');
    if (String(registration && registration.paymentStatus || '').toLowerCase() === 'paid') {
      addAudienceRecipient(map, registration, 'paid');
    }
    if (parseMoneyAmount(registration && registration.kegSponsorshipAmount, 0) > 0) {
      addAudienceRecipient(map, { ...registration, source: 'sponsor' }, 'sponsors');
    }
  });
  (Array.isArray(waitlist) ? waitlist : []).forEach((entry) => {
    addAudienceRecipient(map, { ...entry, source: 'waitlist' }, 'waitlist');
  });
  (Array.isArray(manualContacts) ? manualContacts : []).forEach((contact) => {
    addAudienceRecipient(map, { ...contact, source: contact.source || 'manual' }, 'manual');
    (Array.isArray(contact.tags) ? contact.tags : []).forEach((tag) => addAudienceRecipient(map, contact, tag));
  });
  const recipients = Array.from(map.values()).sort((a, b) => {
    const left = String(a.name || a.email || '');
    const right = String(b.name || b.email || '');
    return left.localeCompare(right);
  });
  return {
    event: { _id: event._id, name: event.name, startDate: event.startDate },
    recipients,
    counts: audienceCounts(recipients),
    manualContacts,
    messages,
    groups: [
      { key: 'all', label: 'Everyone' },
      { key: 'registered', label: 'Registered golfers' },
      { key: 'submitting', label: 'Signup owners' },
      { key: 'paid', label: 'Paid golfers' },
      { key: 'unpaid', label: 'Unpaid golfers' },
      { key: 'waitlist', label: 'Waitlist' },
      { key: 'sponsors', label: 'Sponsors' },
      { key: 'manual', label: 'Manual contacts' },
    ],
  };
}

function communicationEmailHtml(event, body) {
  const safeBody = escapeHtml(body).replace(/\n/g, '<br>');
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1f2937;">
      <h2 style="margin:0 0 12px;">${escapeHtml(event && event.name || 'Plastered Open')}</h2>
      <div>${safeBody}</div>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:18px 0;">
      <p style="font-size:13px;color:#6b7280;">You are receiving this because you are connected to the Plastered Open outing.</p>
    </div>
  `;
}

async function buildFeeManagementDetail(event, models) {
  const [members, teams, registrations, ledgerEntries] = await Promise.all([
    models.BlueRidgeTeamMember.find({ eventId: event._id, status: 'active' }).lean(),
    models.BlueRidgeTeam.find({ eventId: event._id, status: { $in: ['active', 'incomplete'] } }).lean(),
    models.BlueRidgeRegistration.find({ eventId: event._id, status: 'registered' }).lean(),
    models.BlueRidgeOutingLedgerEntry.find({ eventId: event._id }).sort({ occurredAt: -1, createdAt: -1 }).lean(),
  ]);
  const schedule = feeScheduleForEvent(event);
  const counts = {
    players: Array.isArray(members) ? members.length : 0,
    memberPlayers: (Array.isArray(members) ? members : []).filter((member) => Boolean(member && member.isClubMember)).length,
    nonMemberPlayers: (Array.isArray(members) ? members : []).filter((member) => !Boolean(member && member.isClubMember)).length,
    teams: Array.isArray(teams) ? teams.length : 0,
    paidPlayers: (Array.isArray(members) ? members : []).filter((member) => normalizeFeePaidTo(member && member.feePaidTo)).length,
    registrations: Array.isArray(registrations) ? registrations.length : 0,
  };
  const memberFeeRows = (Array.isArray(members) ? members : []).map((member) => ({
    member,
    ...playerFeeBreakdown(member, event),
    feePaidTo: normalizeFeePaidTo(member && member.feePaidTo),
  }));
  const entryFee = parseMoneyAmount(event && event.entryFee, isPlasteredOpenEvent(event) ? 90 : 0);
  const expectedEntryIncome = Number(memberFeeRows.reduce((sum, row) => sum + row.entryFee, 0).toFixed(2));
  const entryIncome = Number(memberFeeRows.reduce((sum, row) => sum + (row.feePaidTo ? row.entryFee : 0), 0).toFixed(2));
  const scheduleTotals = schedule.reduce((summary, item) => {
    if (!item.enabled) return summary;
    const total = applyFeeScheduleItem(item, counts);
    summary.items.push({ ...item, total });
    summary.byCategory[item.category] = Number(((summary.byCategory[item.category] || 0) + total).toFixed(2));
    return summary;
  }, { items: [], byCategory: {} });
  const courseDue = isPlasteredOpenEvent(event)
    ? Number(memberFeeRows.reduce((sum, row) => sum + row.courseFee, 0).toFixed(2))
    : Number(scheduleTotals.byCategory.course || 0);
  const prizePoolDue = isPlasteredOpenEvent(event)
    ? Number(memberFeeRows.reduce((sum, row) => sum + row.prizePool, 0).toFixed(2))
    : Number(scheduleTotals.byCategory.prize || 0);
  const tournamentFees = Number(scheduleTotals.byCategory.tournament || 0);
  const plannedExpenses = Number((courseDue + prizePoolDue + tournamentFees + Number(scheduleTotals.byCategory.expense || 0)).toFixed(2));
  const requestedPerPlayerAllocations = schedule
    .filter((item) => item.enabled && item.basis === 'per_player' && ['course', 'prize', 'tournament', 'expense'].includes(item.category))
    .reduce((sum, item) => Number((sum + parseMoneyAmount(item.amount, 0)).toFixed(2)), 0);
  const ledger = ledgerTotals(ledgerEntries);

  return {
    event: {
      _id: event._id,
      name: event.name,
      startDate: event.startDate,
      entryFee,
    },
    counts,
    feeSchedule: schedule,
    ledgerEntries,
    summary: {
      entryFee,
      memberEntryFee: isPlasteredOpenEvent(event) ? 45 : entryFee,
      nonMemberEntryFee: isPlasteredOpenEvent(event) ? 90 : entryFee,
      memberCourseFee: isPlasteredOpenEvent(event) ? 20 : 0,
      nonMemberCourseFee: isPlasteredOpenEvent(event) ? 65 : 0,
      prizePoolPerPlayer: isPlasteredOpenEvent(event) ? 25 : 0,
      expectedEntryIncome,
      entryIncome,
      unpaidEntryIncome: Number((expectedEntryIncome - entryIncome).toFixed(2)),
      courseDue,
      prizePoolDue,
      tournamentFees,
      plannedExpenses,
      plannedNet: Number((expectedEntryIncome - plannedExpenses).toFixed(2)),
      requestedPerPlayerAllocations,
      perPlayerVariance: isPlasteredOpenEvent(event) ? 0 : Number((entryFee - requestedPerPlayerAllocations).toFixed(2)),
      ledger,
    },
    scheduleTotals,
  };
}

function summarizePlayers(players = []) {
  return (Array.isArray(players) ? players : []).map((player) => ({
    name: String(player && player.name || '').trim(),
    email: normalizeEmail(player && (player.email || player.emailKey) || ''),
    phone: String(player && player.phone || '').trim(),
    isGuest: Boolean(player && player.isGuest),
    isClubMember: Boolean(player && player.isClubMember),
    feePaidTo: normalizeFeePaidTo(player && player.feePaidTo),
  }));
}

function normalizeFeePaidTo(value) {
  const key = String(value || '').trim().toLowerCase();
  return FEE_PAID_TO_VALUES.has(key) ? key : '';
}

function normalizeAuditDetailValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => normalizeAuditDetailValue(item));
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((out, key) => {
      out[key] = normalizeAuditDetailValue(value[key]);
      return out;
    }, {});
  }
  return value;
}

function buildAuditChangeSet(previousDoc, nextDoc, keys = []) {
  const prior = previousDoc && typeof previousDoc.toObject === 'function' ? previousDoc.toObject() : (previousDoc || {});
  const next = nextDoc && typeof nextDoc.toObject === 'function' ? nextDoc.toObject() : (nextDoc || {});
  return (Array.isArray(keys) ? keys : []).reduce((changes, key) => {
    const from = normalizeAuditDetailValue(prior[key]);
    const to = normalizeAuditDetailValue(next[key]);
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      changes[key] = { from, to };
    }
    return changes;
  }, {});
}

async function writeOutingAudit(models, payload = {}) {
  const BlueRidgeOutingAuditLog = models && models.BlueRidgeOutingAuditLog;
  if (!BlueRidgeOutingAuditLog || !payload.outingId || !payload.action) return null;
  try {
    return await BlueRidgeOutingAuditLog.create({
      outingId: payload.outingId,
      category: String(payload.category || 'event').trim().toLowerCase() || 'event',
      action: String(payload.action || '').trim(),
      actor: payload.actor === 'admin' ? 'admin' : 'public',
      method: String(payload.method || '').trim(),
      route: String(payload.route || '').trim(),
      summary: String(payload.summary || payload.action || '').trim(),
      details: payload.details && typeof payload.details === 'object' ? payload.details : {},
      timestamp: payload.timestamp instanceof Date ? payload.timestamp : new Date(),
    });
  } catch (error) {
    console.error('Outings audit write failed', error);
    return null;
  }
}

function buildRuleSummary(event) {
  const parts = [];
  const exact = Number(event.teamSizeExact || 0);
  if (exact > 0) parts.push(`Exact team size: ${exact}`);
  else parts.push(`Team size: ${event.teamSizeMin}-${event.teamSizeMax}`);
  parts.push(event.memberOnly ? 'Member-only event' : event.allowGuests ? 'Guests allowed' : 'No guests');
  if (event.allowSingles) parts.push('Singles allowed');
  if (event.allowSeekingPartner) parts.push('Seeking partner allowed');
  if (event.allowSeekingTeam) parts.push('Seeking team allowed');
  if (event.handicapRequired) {
    if (event.handicapMaxIndex !== undefined && event.handicapMaxIndex !== null) {
      parts.push(`Handicap required (max ${event.handicapMaxIndex})`);
    } else {
      parts.push('Handicap required');
    }
  }
  return parts.join(' | ');
}

async function getMetrics(eventId, models) {
  const { BlueRidgeRegistration, BlueRidgeTeam, BlueRidgeTeamMember, BlueRidgeWaitlist } = models;
  const [registrations, teams, players, waitlist] = await Promise.all([
    BlueRidgeRegistration.countDocuments({ eventId, status: 'registered' }),
    BlueRidgeTeam.countDocuments({ eventId, status: { $in: ['active', 'incomplete'] } }),
    BlueRidgeTeamMember.countDocuments({ eventId, status: 'active' }),
    BlueRidgeWaitlist.countDocuments({ eventId, status: 'active' }),
  ]);
  return { registrations, teams, players, waitlist };
}

function enrichEvent(event, metrics) {
  const e = event.toObject ? event.toObject() : event;
  const maxPlayers = e.maxPlayers || null;
  const maxTeams = e.maxTeams || null;
  return {
    ...e,
    dateLabel: formatDateRange(e.startDate, e.endDate),
    ruleSummary: buildRuleSummary(e),
    metrics,
    spotsRemainingPlayers: maxPlayers ? Math.max(0, maxPlayers - metrics.players) : null,
    spotsRemainingTeams: maxTeams ? Math.max(0, maxTeams - metrics.teams) : null,
  };
}

function validateOutingConfig(payload) {
  const teamSizeMin = parseNum(payload.teamSizeMin);
  const teamSizeMax = parseNum(payload.teamSizeMax);
  const teamSizeExact = parseNum(payload.teamSizeExact);
  if (teamSizeMin !== undefined && teamSizeMax !== undefined && teamSizeMin > teamSizeMax) {
    return 'teamSizeMin cannot exceed teamSizeMax';
  }
  if (teamSizeExact !== undefined) {
    if (teamSizeMin !== undefined && teamSizeExact < teamSizeMin) return 'teamSizeExact cannot be below teamSizeMin';
    if (teamSizeMax !== undefined && teamSizeExact > teamSizeMax) return 'teamSizeExact cannot exceed teamSizeMax';
  }
  return null;
}

function coerceOutingInput(body) {
  const out = {
    name: String(body.name || '').trim(),
    formatType: String(body.formatType || '').trim(),
    startDate: body.startDate ? new Date(body.startDate) : undefined,
    endDate: body.endDate ? new Date(body.endDate) : undefined,
    signupOpenAt: body.signupOpenAt ? new Date(body.signupOpenAt) : undefined,
    signupCloseAt: body.signupCloseAt ? new Date(body.signupCloseAt) : undefined,
    status: String(body.status || 'draft').toLowerCase(),
    teamSizeMin: parseNum(body.teamSizeMin),
    teamSizeMax: parseNum(body.teamSizeMax),
    teamSizeExact: parseNum(body.teamSizeExact),
    requirePartner: parseBool(body.requirePartner, false),
    maxTeams: parseNum(body.maxTeams),
    maxPlayers: parseNum(body.maxPlayers),
    allowSingles: parseBool(body.allowSingles, true),
    allowSeekingPartner: parseBool(body.allowSeekingPartner, true),
    allowSeekingTeam: parseBool(body.allowSeekingTeam, true),
    allowPartialTeamSignup: parseBool(body.allowPartialTeamSignup, true),
    allowFullTeamSignup: parseBool(body.allowFullTeamSignup, true),
    allowMemberGuestSignup: parseBool(body.allowMemberGuestSignup, false),
    allowCaptainSignup: parseBool(body.allowCaptainSignup, true),
    allowJoinExistingTeam: parseBool(body.allowJoinExistingTeam, true),
    allowGuests: parseBool(body.allowGuests, false),
    memberOnly: parseBool(body.memberOnly, true),
    handicapRequired: parseBool(body.handicapRequired, false),
    handicapMinIndex: parseNum(body.handicapMinIndex),
    handicapMaxIndex: parseNum(body.handicapMaxIndex),
    flights: body.flights ? String(body.flights).trim() : '',
    entryFee: parseNum(body.entryFee),
    registrationNotes: body.registrationNotes ? String(body.registrationNotes).trim() : '',
    cancellationPolicy: body.cancellationPolicy ? String(body.cancellationPolicy).trim() : '',
    autoWaitlist: parseBool(body.autoWaitlist, true),
  };

  Object.keys(out).forEach((k) => {
    if (out[k] === undefined) delete out[k];
  });
  return out;
}

function normalizePlayers(rawPlayers) {
  const players = Array.isArray(rawPlayers) ? rawPlayers : [];
  return players
    .map((p) => ({
      name: String((p && p.name) || '').trim(),
      email: normalizeEmail((p && p.email) || ''),
      phone: String((p && p.phone) || '').trim(),
      isGuest: Boolean(p && p.isGuest),
      isClubMember: Boolean(p && p.isClubMember),
      handicapIndex: parseNum(p && p.handicapIndex),
      isCaptain: Boolean(p && p.isCaptain),
    }))
    .filter((p) => p.name || p.email);
}

function validatePlayersShape(players) {
  if (!players.length) return 'At least one player is required';
  const seen = new Set();
  for (const p of players) {
    if (!p.name) return 'Each player requires a name';
    if (!p.email) return 'Each player requires an email';
    if (seen.has(p.email)) return `Duplicate email in signup payload: ${p.email}`;
    seen.add(p.email);
  }
  return null;
}

function validateModeAllowed(event, mode) {
  switch (mode) {
    case 'single':
      return event.allowSingles;
    case 'seeking_partner':
      return event.allowSeekingPartner;
    case 'seeking_team':
      return event.allowSeekingTeam;
    case 'partial_team':
      return event.allowPartialTeamSignup;
    case 'full_team':
      return event.allowFullTeamSignup;
    case 'member_guest':
      return event.allowMemberGuestSignup;
    case 'captain':
      return event.allowCaptainSignup;
    case 'join_team':
      return event.allowJoinExistingTeam;
    default:
      return false;
  }
}

function isSingleMode(mode) {
  return mode === 'single' || mode === 'seeking_partner' || mode === 'seeking_team';
}

function isTeamCreateMode(mode) {
  return mode === 'partial_team' || mode === 'full_team' || mode === 'member_guest' || mode === 'captain';
}

function validateRuleConstraints(event, mode, players, existingTeamSize = 0) {
  const exact = Number(event.teamSizeExact || 0);
  const minSize = Number(event.teamSizeMin || 1);
  const maxSize = Number(event.teamSizeMax || Math.max(minSize, 1));

  if (isSingleMode(mode) && players.length !== 1) return 'Single/partner/team-seeker modes require exactly one player';
  if (event.requirePartner && mode === 'single') return 'This event requires a partner (use Find a Partner)';

  if (mode === 'captain' && players.length !== 1) return 'Captain signup starts with one captain player';

  if (mode === 'full_team') {
    if (exact > 0 && players.length !== exact) return `This event requires exactly ${exact} players for full-team signup`;
    if (exact === 0 && players.length < minSize) return `This event requires at least ${minSize} players for team signup`;
  }

  if (mode === 'partial_team' && exact > 0 && players.length >= exact) {
    return `Partial-team signup must be smaller than ${exact} players`;
  }

  if (mode === 'member_guest') {
    const members = players.filter((p) => !p.isGuest).length;
    const guests = players.filter((p) => p.isGuest).length;
    if (!members || !guests) return 'Member + Guest signup requires at least one member and one guest';
  }

  if (mode === 'join_team') {
    const projected = existingTeamSize + players.length;
    if (exact > 0 && projected > exact) return `Team cannot exceed exact size ${exact}`;
    if (exact === 0 && projected > maxSize) return `Team cannot exceed max size ${maxSize}`;
  }

  if (event.memberOnly && players.some((p) => p.isGuest)) return 'This is a member-only event';
  if (!event.allowGuests && players.some((p) => p.isGuest)) return 'Guests are not allowed for this event';

  if (event.handicapRequired) {
    for (const p of players) {
      if (p.handicapIndex === undefined || p.handicapIndex === null || Number.isNaN(Number(p.handicapIndex))) {
        return `Handicap is required for ${p.name}`;
      }
      if (event.handicapMinIndex !== undefined && event.handicapMinIndex !== null && p.handicapIndex < event.handicapMinIndex) {
        return `Handicap for ${p.name} must be at least ${event.handicapMinIndex}`;
      }
      if (event.handicapMaxIndex !== undefined && event.handicapMaxIndex !== null && p.handicapIndex > event.handicapMaxIndex) {
        return `Handicap for ${p.name} cannot exceed ${event.handicapMaxIndex}`;
      }
    }
  }

  return null;
}

function assertSignupWindowOpen(event) {
  const now = Date.now();
  if (event.status !== 'open') return 'Signup is not open for this event';
  if (event.signupOpenAt && now < new Date(event.signupOpenAt).getTime()) return 'Signup has not opened yet';
  if (event.signupCloseAt && now > new Date(event.signupCloseAt).getTime()) return 'Signup deadline has passed';
  return null;
}

async function ensurePlayersNotRegistered(eventId, players, BlueRidgeTeamMember) {
  const emails = players.map((p) => p.email);
  const existing = await BlueRidgeTeamMember.find({
    eventId,
    status: 'active',
    emailKey: { $in: emails },
  })
    .select({ emailKey: 1 })
    .lean();
  if (existing.length) {
    const dupes = [...new Set(existing.map((x) => x.emailKey))];
    return `Player already registered for this event: ${dupes.join(', ')}`;
  }
  return null;
}

async function buildEventDetail(event, models, includeRegistrations = false) {
  const metrics = await getMetrics(event._id, models);
  const enriched = enrichEvent(event, metrics);
  enriched.kegSponsorshipSummary = await getKegSponsorshipSummary(event._id, models);
  const teams = await models.BlueRidgeTeam.find({ eventId: event._id, status: { $in: ['active', 'incomplete'] } })
    .sort({ name: 1 })
    .lean();

  const teamIds = teams.map((t) => t._id);
  const members = teamIds.length
    ? await models.BlueRidgeTeamMember.find({ teamId: { $in: teamIds }, status: 'active' }).lean()
    : [];

  const byTeam = new Map();
  for (const m of members) {
    const key = String(m.teamId);
    const list = byTeam.get(key) || [];
    list.push(m);
    byTeam.set(key, list);
  }

  enriched.teams = teams.map((t) => {
    const list = byTeam.get(String(t._id)) || [];
    const teamSize = list.length;
    const exact = Number(event.teamSizeExact || 0);
    const target = exact > 0 ? exact : Number(event.teamSizeMax || t.targetSize || 4);
    return {
      ...t,
      memberCount: teamSize,
      spotsOpen: Math.max(0, target - teamSize),
      canJoin: event.allowJoinExistingTeam && t.status !== 'cancelled' && (exact > 0 ? teamSize < exact : teamSize < Number(event.teamSizeMax || 4)),
      members: list,
    };
  });

  if (includeRegistrations) {
    enriched.registrations = await models.BlueRidgeRegistration.find({ eventId: event._id }).sort({ createdAt: -1 }).lean();
    enriched.waitlist = await models.BlueRidgeWaitlist.find({ eventId: event._id }).sort({ createdAt: -1 }).lean();
    enriched.members = await models.BlueRidgeTeamMember.find({ eventId: event._id, status: 'active' })
      .sort({ isCaptain: -1, createdAt: 1 })
      .lean();
  }

  return enriched;
}

async function maybeWriteTeamStatusAudit(models, req, event, team, previousStatus, nextStatus, reason, extraDetails = {}) {
  const before = String(previousStatus || '').trim().toLowerCase();
  const after = String(nextStatus || '').trim().toLowerCase();
  if (!team || !before || !after || before === after) return;
  await writeOutingAudit(models, {
    outingId: event && event._id,
    category: 'team',
    action: 'team_status_changed',
    actor: auditActor(req),
    method: req && req.method,
    route: routePath(req),
    summary: `Team ${team.name || 'team'} status changed from ${before} to ${after}`,
    details: {
      teamId: String(team && team._id || ''),
      teamName: team && team.name || '',
      from: before,
      to: after,
      reason: reason || '',
      ...extraDetails,
    },
  });
}

router.get('/', async (_req, res) => {
  try {
    if (!(await requireSecondaryConnection(res))) return;
    const models = getSecondaryModels();
    const outings = await models.BlueRidgeOuting.find({}).sort({ startDate: 1 }).lean();
    const payload = await Promise.all(
      outings.map(async (e) => {
        const metrics = await getMetrics(e._id, models);
        return enrichEvent(e, metrics);
      })
    );
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/plastered-open/sponsor-request', async (req, res) => {
  try {
    const name = String(req.body && req.body.name || '').trim();
    const email = normalizeEmail(req.body && req.body.email || '');
    const phone = String(req.body && req.body.phone || '').trim();
    const displayName = String(req.body && req.body.displayName || '').trim();
    const notes = String(req.body && req.body.notes || '').trim();
    const amount = parseMoneyAmount(req.body && req.body.amount, 0);

    if (!name || !email) return badRequest(res, 'name and email are required');
    if (!email.includes('@')) return badRequest(res, 'A valid email is required');

    let event = null;
    if (await requireSecondaryConnection(res)) {
      const models = getSecondaryModels();
      event = await models.BlueRidgeOuting.findOne({
        name: /plastered/i,
        startDate: new Date('2026-06-19'),
      }).lean();
    } else {
      return;
    }

    const subject = `Plastered Open Keg Sponsor Request: ${displayName || name}`;
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.45;color:#1f2937;">
        <h2 style="margin:0 0 12px;">Plastered Open Keg Sponsor Request</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        ${phone ? `<p><strong>Phone:</strong> ${escapeHtml(phone)}</p>` : ''}
        ${displayName ? `<p><strong>Sponsor name to display:</strong> ${escapeHtml(displayName)}</p>` : ''}
        <p><strong>Pledge amount:</strong> ${escapeHtml(formatMoney(amount))}</p>
        ${notes ? `<p><strong>Notes:</strong><br>${escapeHtml(notes).replace(/\n/g, '<br>')}</p>` : ''}
        ${event ? `<p><strong>Event:</strong> ${escapeHtml(event.name || 'Plastered Open')} (${escapeHtml(formatDateOnly(event.startDate))})</p>` : ''}
        <p><a href="${escapeHtml(siteUrl('/plastered-open-registration-list.html'))}">Open Plastered Open registration list</a></p>
      </div>
    `;

    const result = await sendPlasteredOpenAlertEmail(subject, html);
    if (!result || !result.ok) {
      const details = result && result.error && result.error.message
        ? result.error.message
        : 'Email delivery is not configured';
      return res.status(503).json({ error: 'Unable to send sponsor request email', details });
    }
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:eventId([0-9a-fA-F]{24})', async (req, res) => {
  try {
    if (!(await requireSecondaryConnection(res))) return;
    const models = getSecondaryModels();
    const event = await models.BlueRidgeOuting.findById(req.params.eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    const detail = await buildEventDetail(event, models, false);
    res.json(detail);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:eventId([0-9a-fA-F]{24})/status', async (req, res) => {
  try {
    if (!(await requireSecondaryConnection(res))) return;
    // This project has no per-user auth for outings yet, so status lookup is email-based.
    const email = normalizeEmail(req.query.email || '');
    if (!email) return badRequest(res, 'email is required');

    const models = getSecondaryModels();
    const eventId = req.params.eventId;

    const [activeMember, registration, waitlist] = await Promise.all([
      models.BlueRidgeTeamMember.findOne({ eventId, emailKey: email, status: 'active' }).lean(),
      models.BlueRidgeRegistration.findOne({ eventId, submittedByEmail: email, status: 'registered' }).lean(),
      models.BlueRidgeWaitlist.findOne({ eventId, emailKey: email, status: 'active' }).lean(),
    ]);

    let team = null;
    let teamMembers = [];
    let registrationMembers = [];

    if (registration) {
      const teamId = registration.teamId ? String(registration.teamId) : '';
      const detailPromises = [
        models.BlueRidgeTeamMember.find({ eventId, registrationId: registration._id, status: 'active' })
          .sort({ isCaptain: -1, createdAt: 1 })
          .lean(),
      ];
      if (teamId) {
        detailPromises.push(
          models.BlueRidgeTeam.findOne({ _id: teamId, eventId }).lean(),
          models.BlueRidgeTeamMember.find({ eventId, teamId, status: 'active' })
            .sort({ isCaptain: -1, createdAt: 1 })
            .lean()
        );
      }

      const detailPayload = await Promise.all(detailPromises);
      registrationMembers = detailPayload[0] || [];
      if (teamId) {
        team = detailPayload[1] || null;
        teamMembers = detailPayload[2] || [];
      }
    }

    res.json({
      isRegistered: Boolean(activeMember || registration),
      isWaitlisted: Boolean(waitlist),
      activeMember,
      registration,
      waitlist,
      team,
      teamMembers,
      registrationMembers,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:eventId([0-9a-fA-F]{24})/register', async (req, res) => {
  try {
    if (!(await requireSecondaryConnection(res))) return;
    const models = getSecondaryModels();
    const { BlueRidgeOuting, BlueRidgeRegistration, BlueRidgeTeam, BlueRidgeTeamMember } = models;

    const event = await BlueRidgeOuting.findById(req.params.eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const mode = String((req.body && req.body.mode) || '').trim();
    const notes = String((req.body && req.body.notes) || '').trim();
    const kegSponsorshipAmount = parseMoneyAmount(req.body && req.body.kegSponsorshipAmount, 0);
    const teamNameInput = String((req.body && req.body.teamName) || '').trim();
    const teamIdInput = String((req.body && req.body.teamId) || '').trim();
    const players = normalizePlayers(req.body && req.body.players);

    const signupWindowErr = assertSignupWindowOpen(event);
    if (signupWindowErr) return badRequest(res, signupWindowErr);
    if (!validateModeAllowed(event, mode)) return badRequest(res, `Signup mode '${mode}' is not allowed for this event`);

    const shapeErr = validatePlayersShape(players);
    if (shapeErr) return badRequest(res, shapeErr);

    let targetTeam = null;
    if (mode === 'join_team') {
      if (!teamIdInput) return badRequest(res, 'teamId is required when joining an existing team');
      targetTeam = await BlueRidgeTeam.findOne({ _id: teamIdInput, eventId: event._id, status: { $in: ['active', 'incomplete'] } });
      if (!targetTeam) return badRequest(res, 'Target team not found');
    }

    const dupesErr = await ensurePlayersNotRegistered(event._id, players, BlueRidgeTeamMember);
    if (dupesErr) return badRequest(res, dupesErr);

    const metrics = await getMetrics(event._id, models);
    const createsTeam = isTeamCreateMode(mode);
    if (createsTeam && event.maxTeams && metrics.teams >= event.maxTeams) {
      return res.status(409).json({ error: 'Event has reached max teams', canJoinWaitlist: true });
    }

    if (event.maxPlayers && metrics.players + players.length > event.maxPlayers) {
      return res.status(409).json({ error: 'Event is full', canJoinWaitlist: true });
    }

    let existingTeamSize = 0;
    if (mode === 'join_team' && targetTeam) {
      existingTeamSize = await BlueRidgeTeamMember.countDocuments({ teamId: targetTeam._id, status: 'active' });
    }

    const constraintsErr = validateRuleConstraints(event, mode, players, existingTeamSize);
    if (constraintsErr) return badRequest(res, constraintsErr);

    const submitter = players[0];
    let createdTeam = targetTeam;
    const previousTargetTeamStatus = targetTeam ? String(targetTeam.status || '') : '';

    if (createsTeam) {
      const exact = Number(event.teamSizeExact || 0);
      const defaultTarget = exact > 0 ? exact : Number(event.teamSizeMax || players.length || 4);
      const baseName = teamNameInput || `${submitter.name} Team`;
      let teamName = baseName;
      let tries = 0;
      while (tries < 3) {
        try {
          createdTeam = await BlueRidgeTeam.create({
            eventId: event._id,
            name: teamName,
            captainName: submitter.name,
            captainEmail: submitter.email,
            targetSize: defaultTarget,
            status: mode === 'captain' || mode === 'partial_team' ? 'incomplete' : 'active',
          });
          break;
        } catch (err) {
          if (err && err.code === 11000) {
            tries += 1;
            teamName = `${baseName} (${tries + 1})`;
            continue;
          }
          throw err;
        }
      }
      if (!createdTeam) return res.status(500).json({ error: 'Unable to create team' });
    }

    const registration = await BlueRidgeRegistration.create({
      eventId: event._id,
      mode,
      status: 'registered',
      teamId: createdTeam ? createdTeam._id : undefined,
      submittedByName: submitter.name,
      submittedByEmail: submitter.email,
      submittedByPhone: submitter.phone,
      notes,
      kegSponsorshipAmount,
    });

    const memberDocs = players.map((p, idx) => ({
      eventId: event._id,
      teamId: createdTeam ? createdTeam._id : undefined,
      registrationId: registration._id,
      name: p.name,
      email: p.email,
      emailKey: p.email,
      phone: p.phone,
      isGuest: Boolean(p.isGuest),
      isClubMember: Boolean(p.isClubMember),
      handicapIndex: p.handicapIndex,
      isCaptain: Boolean(p.isCaptain || idx === 0),
      status: 'active',
    }));

    await BlueRidgeTeamMember.insertMany(memberDocs, { ordered: true });

    let finalTeamStatus = '';
    if (createdTeam) {
      const teamCount = await BlueRidgeTeamMember.countDocuments({ teamId: createdTeam._id, status: 'active' });
      const exact = Number(event.teamSizeExact || 0);
      const fullThreshold = exact > 0 ? exact : Number(event.teamSizeMax || createdTeam.targetSize || 4);
      const targetStatus = teamCount >= fullThreshold ? 'active' : 'incomplete';
      finalTeamStatus = targetStatus;
      if (createdTeam.status !== targetStatus) {
        await BlueRidgeTeam.updateOne({ _id: createdTeam._id }, { $set: { status: targetStatus } });
      }
      await maybeWriteTeamStatusAudit(
        models,
        req,
        event,
        createdTeam,
        createsTeam ? String(createdTeam.status || '') : previousTargetTeamStatus,
        targetStatus,
        createsTeam ? 'registration_created' : 'join_team_registration',
        {
          registrationId: String(registration && registration._id || ''),
          submittedByName: submitter && submitter.name || '',
        }
      );
    }

    await writeOutingAudit(models, {
      outingId: event._id,
      category: createdTeam ? 'team' : 'player',
      action: 'registration_created',
      actor: auditActor(req),
      method: req.method,
      route: routePath(req),
      summary: createdTeam
        ? `${submitter.name} registered for ${createdTeam.name || 'team'}`
        : `${submitter.name} registered for the outing`,
      details: {
        registrationId: String(registration && registration._id || ''),
        mode,
        modeLabel: formatModeLabel(mode),
        submittedByName: submitter && submitter.name || '',
        teamId: createdTeam ? String(createdTeam._id || '') : '',
        teamName: createdTeam && createdTeam.name || '',
        teamStatus: finalTeamStatus || undefined,
        players: summarizePlayers(players),
        playerCount: players.length,
        amountDue: registrationAmountDueForAudit(event, registration, players.length),
        kegSponsorshipAmount,
        notes,
      },
    });

    await notifyPlasteredOpenRegistration(event, {
      action: 'created',
      teamName: createdTeam && createdTeam.name || '',
      submittedByName: submitter && submitter.name || '',
      submittedByEmail: submitter && submitter.email || '',
      mode,
      kegSponsorshipAmount,
      notes,
      players,
    });

    const detail = await buildEventDetail(event, models, false);
    res.status(201).json({ ok: true, registration, event: detail });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'A player is already registered for this event' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.put('/:eventId([0-9a-fA-F]{24})/registrations/:registrationId([0-9a-fA-F]{24})', async (req, res) => {
  try {
    if (!(await requireSecondaryConnection(res))) return;
    const models = getSecondaryModels();
    const { BlueRidgeOuting, BlueRidgeRegistration, BlueRidgeTeam, BlueRidgeTeamMember } = models;

    const event = await BlueRidgeOuting.findById(req.params.eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const registration = await BlueRidgeRegistration.findOne({ _id: req.params.registrationId, eventId: event._id, status: 'registered' });
    if (!registration) return res.status(404).json({ error: 'Registration not found' });

    const requesterEmail = normalizeEmail((req.body && req.body.requesterEmail) || req.query.requesterEmail || '');
    if (!requesterEmail || requesterEmail !== registration.submittedByEmail) {
      return res.status(403).json({ error: 'Only the registration owner can edit this signup' });
    }

    const teamId = registration.teamId;
    if (!teamId) return badRequest(res, 'This registration is not a team/captain registration');

    const team = await BlueRidgeTeam.findById(teamId);
    if (!team || team.status === 'cancelled') return badRequest(res, 'Team is not available for updates');
    const previousTeamStatus = String(team.status || '');
    const previousNotes = String(registration.notes || '');
    const previousKegSponsorshipAmount = parseMoneyAmount(registration.kegSponsorshipAmount, 0);

    const removeMemberIds = Array.isArray(req.body && req.body.removeMemberIds) ? req.body.removeMemberIds : [];
    const removedMembers = removeMemberIds.length
      ? await BlueRidgeTeamMember.find({
        _id: { $in: removeMemberIds },
        teamId: team._id,
        registrationId: registration._id,
        status: 'active',
      }).lean()
      : [];
    if (removeMemberIds.length) {
      await BlueRidgeTeamMember.updateMany(
        { _id: { $in: removeMemberIds }, teamId: team._id, registrationId: registration._id, status: 'active' },
        { $set: { status: 'cancelled' } }
      );
    }

    const addPlayers = normalizePlayers(req.body && req.body.addPlayers);
    if (addPlayers.length) {
      const shapeErr = validatePlayersShape(addPlayers);
      if (shapeErr) return badRequest(res, shapeErr);

      const dupesErr = await ensurePlayersNotRegistered(event._id, addPlayers, BlueRidgeTeamMember);
      if (dupesErr) return badRequest(res, dupesErr);

      const currentCount = await BlueRidgeTeamMember.countDocuments({ teamId: team._id, status: 'active' });
      const constraintsErr = validateRuleConstraints(event, 'join_team', addPlayers, currentCount);
      if (constraintsErr) return badRequest(res, constraintsErr);

      const metrics = await getMetrics(event._id, models);
      if (event.maxPlayers && metrics.players + addPlayers.length > event.maxPlayers) {
        return res.status(409).json({ error: 'Not enough open player spots for this update' });
      }

      const docs = addPlayers.map((p) => ({
        eventId: event._id,
        teamId: team._id,
        registrationId: registration._id,
        name: p.name,
        email: p.email,
        emailKey: p.email,
        phone: p.phone,
        isGuest: Boolean(p.isGuest),
        isClubMember: Boolean(p.isClubMember),
        handicapIndex: p.handicapIndex,
        isCaptain: false,
        status: 'active',
      }));
      await BlueRidgeTeamMember.insertMany(docs, { ordered: true });
    }

    let registrationChanged = false;
    if (req.body && typeof req.body.notes === 'string') {
      registration.notes = req.body.notes.trim();
      registrationChanged = true;
    }
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'kegSponsorshipAmount')) {
      registration.kegSponsorshipAmount = parseMoneyAmount(req.body.kegSponsorshipAmount, 0);
      registrationChanged = true;
    }
    if (registrationChanged) {
      await registration.save();
    }

    const teamCount = await BlueRidgeTeamMember.countDocuments({ teamId: team._id, status: 'active' });
    const exact = Number(event.teamSizeExact || 0);
    const fullThreshold = exact > 0 ? exact : Number(event.teamSizeMax || team.targetSize || 4);
    const teamStatus = teamCount >= fullThreshold ? 'active' : 'incomplete';
    if (team.status !== teamStatus) {
      await BlueRidgeTeam.updateOne({ _id: team._id }, { $set: { status: teamStatus } });
    }

    if (removedMembers.length) {
      await writeOutingAudit(models, {
        outingId: event._id,
        category: 'player',
        action: 'players_removed',
        actor: auditActor(req),
        method: req.method,
        route: routePath(req),
        summary: `Removed ${removedMembers.length} golfer${removedMembers.length === 1 ? '' : 's'} from ${team.name || 'team'}`,
        details: {
          registrationId: String(registration && registration._id || ''),
          teamId: String(team && team._id || ''),
          teamName: team && team.name || '',
          removedPlayers: summarizePlayers(removedMembers),
          resultingActiveCount: teamCount,
        },
      });
    }

    if (addPlayers.length) {
      await writeOutingAudit(models, {
        outingId: event._id,
        category: 'player',
        action: 'players_added',
        actor: auditActor(req),
        method: req.method,
        route: routePath(req),
        summary: `Added ${addPlayers.length} golfer${addPlayers.length === 1 ? '' : 's'} to ${team.name || 'team'}`,
        details: {
          registrationId: String(registration && registration._id || ''),
          teamId: String(team && team._id || ''),
          teamName: team && team.name || '',
          addedPlayers: summarizePlayers(addPlayers),
          resultingActiveCount: teamCount,
        },
      });
    }

    if (String(registration.notes || '') !== previousNotes) {
      await writeOutingAudit(models, {
        outingId: event._id,
        category: 'team',
        action: 'registration_notes_updated',
        actor: auditActor(req),
        method: req.method,
        route: routePath(req),
        summary: `Registration notes updated for ${registration.submittedByName || 'registration'}`,
        details: {
          registrationId: String(registration && registration._id || ''),
          teamId: String(team && team._id || ''),
          teamName: team && team.name || '',
          from: previousNotes,
          to: String(registration.notes || ''),
        },
      });
    }

    const nextKegSponsorshipAmount = parseMoneyAmount(registration.kegSponsorshipAmount, 0);
    if (nextKegSponsorshipAmount !== previousKegSponsorshipAmount) {
      await writeOutingAudit(models, {
        outingId: event._id,
        category: 'money',
        action: 'keg_sponsorship_updated',
        actor: auditActor(req),
        method: req.method,
        route: routePath(req),
        summary: `Keg sponsorship updated for ${registration.submittedByName || 'registration'}`,
        details: {
          registrationId: String(registration && registration._id || ''),
          teamId: String(team && team._id || ''),
          teamName: team && team.name || '',
          from: previousKegSponsorshipAmount,
          to: nextKegSponsorshipAmount,
        },
      });
    }

    await maybeWriteTeamStatusAudit(
      models,
      req,
      event,
      team,
      previousTeamStatus,
      teamStatus,
      'roster_update',
      {
        registrationId: String(registration && registration._id || ''),
        teamId: String(team && team._id || ''),
        activePlayerCount: teamCount,
      }
    );

    const notificationChanges = [];
    if (addPlayers.length) notificationChanges.push(`Added ${addPlayers.length} golfer${addPlayers.length === 1 ? '' : 's'}`);
    if (removedMembers.length) notificationChanges.push(`Removed ${removedMembers.length} golfer${removedMembers.length === 1 ? '' : 's'}`);
    if (String(registration.notes || '') !== previousNotes) notificationChanges.push('Updated registration notes');
    if (nextKegSponsorshipAmount !== previousKegSponsorshipAmount) {
      notificationChanges.push(`Updated keg sponsorship from ${formatMoney(previousKegSponsorshipAmount)} to ${formatMoney(nextKegSponsorshipAmount)}`);
    }
    if (previousTeamStatus !== teamStatus) notificationChanges.push(`Team status changed from ${previousTeamStatus || 'unknown'} to ${teamStatus}`);
    if (notificationChanges.length) {
      const currentMembers = await BlueRidgeTeamMember.find({ teamId: team._id, status: 'active' })
        .sort({ isCaptain: -1, createdAt: 1 })
        .lean();
      await notifyPlasteredOpenRegistration(event, {
        action: 'updated',
        teamName: team && team.name || '',
        submittedByName: registration && registration.submittedByName || '',
        submittedByEmail: registration && registration.submittedByEmail || '',
        mode: registration && registration.mode || '',
        kegSponsorshipAmount: nextKegSponsorshipAmount,
        notes: String(registration && registration.notes || ''),
        players: currentMembers,
        changes: notificationChanges,
      });
    }

    const detail = await buildEventDetail(event, models, false);
    res.json({ ok: true, event: detail });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'A player is already registered for this event' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:eventId([0-9a-fA-F]{24})/registrations/:registrationId([0-9a-fA-F]{24})', async (req, res) => {
  try {
    if (!(await requireSecondaryConnection(res))) return;
    const models = getSecondaryModels();
    const { BlueRidgeOuting, BlueRidgeRegistration, BlueRidgeTeam, BlueRidgeTeamMember } = models;

    const event = await BlueRidgeOuting.findById(req.params.eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const registration = await BlueRidgeRegistration.findOne({ _id: req.params.registrationId, eventId: event._id });
    if (!registration) return res.status(404).json({ error: 'Registration not found' });
    const existingMembers = await BlueRidgeTeamMember.find({ eventId: event._id, registrationId: registration._id, status: 'active' }).lean();
    const team = registration.teamId ? await BlueRidgeTeam.findById(registration.teamId) : null;
    const previousTeamStatus = team ? String(team.status || '') : '';

    const requesterEmail = normalizeEmail(req.query.requesterEmail || (req.body && req.body.requesterEmail) || '');
    if (!requesterEmail || requesterEmail !== registration.submittedByEmail) {
      return res.status(403).json({ error: 'Only the registration owner can cancel this signup' });
    }

    if (registration.status === 'cancelled') return res.json({ ok: true });

    registration.status = 'cancelled';
    registration.cancelledAt = new Date();
    await registration.save();
    if (existingMembers.length) {
      await BlueRidgeTeamMember.updateMany(
        { eventId: event._id, registrationId: registration._id, status: 'active' },
        { $set: { status: 'cancelled' } }
      );
    }

    let nextTeamStatus = previousTeamStatus;
    if (registration.teamId) {
      const teamActiveCount = await BlueRidgeTeamMember.countDocuments({ teamId: registration.teamId, status: 'active' });
      if (teamActiveCount === 0) {
        await BlueRidgeTeam.updateOne({ _id: registration.teamId }, { $set: { status: 'cancelled' } });
        nextTeamStatus = 'cancelled';
      }
    }

    await writeOutingAudit(models, {
      outingId: event._id,
      category: registration.teamId ? 'team' : 'player',
      action: 'registration_cancelled',
      actor: auditActor(req),
      method: req.method,
      route: routePath(req),
      summary: `Registration cancelled for ${registration.submittedByName || 'registration'}`,
      details: {
        registrationId: String(registration && registration._id || ''),
        mode: registration && registration.mode || '',
        modeLabel: formatModeLabel(registration && registration.mode || ''),
        submittedByName: registration && registration.submittedByName || '',
        teamId: registration.teamId ? String(registration.teamId) : '',
        teamName: team && team.name || '',
        paymentStatus: registration && registration.paymentStatus || '',
        amountDue: registrationAmountDueForAudit(event, registration),
        kegSponsorshipAmount: parseMoneyAmount(registration && registration.kegSponsorshipAmount, 0),
        players: summarizePlayers(existingMembers),
        notes: String(registration && registration.notes || ''),
      },
    });

    await maybeWriteTeamStatusAudit(
      models,
      req,
      event,
      team,
      previousTeamStatus,
      nextTeamStatus,
      'registration_cancelled',
      {
        registrationId: String(registration && registration._id || ''),
        teamId: registration.teamId ? String(registration.teamId) : '',
      }
    );

    await notifyPlasteredOpenRegistration(event, {
      action: 'cancelled',
      teamName: team && team.name || '',
      submittedByName: registration && registration.submittedByName || '',
      submittedByEmail: registration && registration.submittedByEmail || '',
      mode: registration && registration.mode || '',
      kegSponsorshipAmount: parseMoneyAmount(registration && registration.kegSponsorshipAmount, 0),
      notes: String(registration && registration.notes || ''),
      players: existingMembers,
      changes: ['Registration cancelled'],
    });

    const detail = await buildEventDetail(event, models, false);
    res.json({ ok: true, event: detail });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:eventId([0-9a-fA-F]{24})/waitlist', async (req, res) => {
  try {
    if (!(await requireSecondaryConnection(res))) return;
    const models = getSecondaryModels();
    const { BlueRidgeOuting, BlueRidgeWaitlist, BlueRidgeTeamMember } = models;

    const event = await BlueRidgeOuting.findById(req.params.eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (!event.autoWaitlist && event.status !== 'waitlist') return badRequest(res, 'Waitlist is disabled for this event');

    const name = String((req.body && req.body.name) || '').trim();
    const email = normalizeEmail((req.body && req.body.email) || '');
    const phone = String((req.body && req.body.phone) || '').trim();
    const mode = String((req.body && req.body.mode) || 'single').trim();
    const notes = String((req.body && req.body.notes) || '').trim();

    if (!name || !email) return badRequest(res, 'name and email are required');

    const existingActive = await BlueRidgeTeamMember.findOne({ eventId: event._id, emailKey: email, status: 'active' }).lean();
    if (existingActive) return badRequest(res, 'Player is already registered for this event');

    const waitlist = await BlueRidgeWaitlist.create({
      eventId: event._id,
      name,
      email,
      emailKey: email,
      phone,
      mode,
      notes,
      status: 'active',
    });

    await writeOutingAudit(models, {
      outingId: event._id,
      category: 'waitlist',
      action: 'waitlist_joined',
      actor: auditActor(req),
      method: req.method,
      route: routePath(req),
      summary: `${name} joined the waitlist`,
      details: {
        waitlistId: String(waitlist && waitlist._id || ''),
        name,
        email,
        phone,
        mode,
        modeLabel: formatModeLabel(mode),
        notes,
      },
    });

    res.status(201).json(waitlist);
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'This email is already on the waitlist for this event' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:eventId([0-9a-fA-F]{24})/waitlist/:waitlistId([0-9a-fA-F]{24})', async (req, res) => {
  try {
    if (!(await requireSecondaryConnection(res))) return;
    const models = getSecondaryModels();
    const { BlueRidgeOuting, BlueRidgeWaitlist } = models;

    const event = await BlueRidgeOuting.findById(req.params.eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const waitlist = await BlueRidgeWaitlist.findOne({ _id: req.params.waitlistId, eventId: event._id });
    if (!waitlist) return res.status(404).json({ error: 'Waitlist entry not found' });

    const requesterEmail = normalizeEmail(req.query.requesterEmail || (req.body && req.body.requesterEmail) || '');
    if (!requesterEmail || requesterEmail !== waitlist.emailKey) {
      return res.status(403).json({ error: 'Only the waitlist owner can cancel this entry' });
    }

    if (waitlist.status === 'cancelled') return res.json({ ok: true });

    waitlist.status = 'cancelled';
    await waitlist.save();

    await writeOutingAudit(models, {
      outingId: event._id,
      category: 'waitlist',
      action: 'waitlist_cancelled',
      actor: auditActor(req),
      method: req.method,
      route: routePath(req),
      summary: `${waitlist.name || 'Waitlist entry'} left the waitlist`,
      details: {
        waitlistId: String(waitlist && waitlist._id || ''),
        name: waitlist && waitlist.name || '',
        email: waitlist && waitlist.email || '',
        phone: waitlist && waitlist.phone || '',
        mode: waitlist && waitlist.mode || '',
        modeLabel: formatModeLabel(waitlist && waitlist.mode || ''),
        notes: String(waitlist && waitlist.notes || ''),
      },
    });

    const detail = await buildEventDetail(event, models, false);
    res.json({ ok: true, event: detail });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/admin/events/:eventId/registrations/:registrationId/payment', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin code required' });
    if (!(await requireSecondaryConnection(res))) return;

    const paymentStatus = String((req.body && req.body.paymentStatus) || '').trim().toLowerCase();
    if (!REGISTRATION_PAYMENT_STATUSES.has(paymentStatus)) {
      return badRequest(res, `paymentStatus must be one of: ${[...REGISTRATION_PAYMENT_STATUSES].join(', ')}`);
    }

    const models = getSecondaryModels();
    const { BlueRidgeOuting, BlueRidgeRegistration } = models;

    const event = await BlueRidgeOuting.findById(req.params.eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const registration = await BlueRidgeRegistration.findOne({ _id: req.params.registrationId, eventId: event._id });
    if (!registration) return res.status(404).json({ error: 'Registration not found' });
    const previousPaymentStatus = String(registration.paymentStatus || 'unpaid').toLowerCase();
    const team = registration.teamId ? await models.BlueRidgeTeam.findById(registration.teamId) : null;

    await BlueRidgeRegistration.updateOne(
      { _id: registration._id, eventId: event._id },
      { $set: { paymentStatus } }
    );

    if (previousPaymentStatus !== paymentStatus) {
      await writeOutingAudit(models, {
        outingId: event._id,
        category: 'money',
        action: 'payment_status_updated',
        actor: auditActor(req),
        method: req.method,
        route: routePath(req),
        summary: `Payment updated for ${registration.submittedByName || 'registration'}`,
        details: {
          registrationId: String(registration && registration._id || ''),
          submittedByName: registration && registration.submittedByName || '',
          teamId: registration.teamId ? String(registration.teamId) : '',
          teamName: team && team.name || '',
          mode: registration && registration.mode || '',
          modeLabel: formatModeLabel(registration && registration.mode || ''),
          from: previousPaymentStatus,
          to: paymentStatus,
          amountDue: registrationAmountDueForAudit(event, registration),
        },
      });
    }

    const detail = await buildEventDetail(event, models, true);
    const refreshed = Array.isArray(detail.registrations)
      ? detail.registrations.find((entry) => String(entry && entry._id || '') === String(registration._id))
      : null;

    res.json({ ok: true, registration: refreshed || { _id: registration._id, paymentStatus }, event: detail });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/admin/events/:eventId/teams/:teamId', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin code required' });
    if (!(await requireSecondaryConnection(res))) return;

    const models = getSecondaryModels();
    const { BlueRidgeOuting, BlueRidgeRegistration, BlueRidgeTeam, BlueRidgeTeamMember } = models;

    const event = await BlueRidgeOuting.findById(req.params.eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const team = await BlueRidgeTeam.findOne({ _id: req.params.teamId, eventId: event._id });
    if (!team || team.status === 'cancelled') return res.status(404).json({ error: 'Team not found' });

    const previousTeam = team.toObject ? team.toObject() : { ...team };
    const teamName = String((req.body && req.body.teamName) || '').trim();
    const removeMemberIds = Array.isArray(req.body && req.body.removeMemberIds)
      ? req.body.removeMemberIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [];
    const addPlayers = summarizePlayers(req.body && req.body.addPlayers || [])
      .filter((player) => player.name && player.email);
    const memberFeeLocations = Array.isArray(req.body && req.body.memberFeeLocations)
      ? req.body.memberFeeLocations.map((entry) => ({
        memberId: String(entry && entry.memberId || '').trim(),
        feePaidTo: normalizeFeePaidTo(entry && entry.feePaidTo),
      })).filter((entry) => entry.memberId)
      : [];
    const memberUpdates = Array.isArray(req.body && req.body.memberUpdates)
      ? req.body.memberUpdates.map((entry) => ({
        memberId: String(entry && entry.memberId || '').trim(),
        email: normalizeEmail(entry && entry.email || ''),
        phone: String(entry && entry.phone || '').trim(),
        isClubMember: Boolean(entry && entry.isClubMember),
      })).filter((entry) => entry.memberId)
      : [];

    if (teamName && teamName !== team.name) {
      const existing = await BlueRidgeTeam.findOne({ eventId: event._id, name: teamName }).lean();
      if (existing && String(existing._id || '') !== String(team._id || '')) {
        return res.status(409).json({ error: 'Another team already uses that name' });
      }
      team.name = teamName;
    }

    const contactUpdates = [];
    for (const entry of memberUpdates) {
      if (!entry.email) return badRequest(res, 'Team member email is required');
      const member = await BlueRidgeTeamMember.findOne({
        _id: entry.memberId,
        eventId: event._id,
        teamId: team._id,
        status: 'active',
      });
      if (!member) continue;

      const previousEmail = normalizeEmail(member.emailKey || member.email || '');
      const previousPhone = String(member.phone || '').trim();
      const previousIsClubMember = Boolean(member.isClubMember);
      if (entry.email !== previousEmail) {
        const duplicate = await BlueRidgeTeamMember.findOne({
          eventId: event._id,
          emailKey: entry.email,
          status: 'active',
        }).lean();
        if (duplicate && String(duplicate._id || '') !== String(member._id || '')) {
          return badRequest(res, `Player already registered for this event: ${entry.email}`);
        }
      }

      if (entry.email === previousEmail && entry.phone === previousPhone && entry.isClubMember === previousIsClubMember) continue;
      member.email = entry.email;
      member.emailKey = entry.email;
      member.phone = entry.phone;
      member.isClubMember = entry.isClubMember;
      await member.save();
      contactUpdates.push({
        memberId: String(member && member._id || ''),
        name: member && member.name || '',
        email: { from: previousEmail, to: entry.email },
        phone: { from: previousPhone, to: entry.phone },
        isClubMember: { from: previousIsClubMember, to: entry.isClubMember },
      });
    }

    const feeLocationUpdates = [];
    for (const entry of memberFeeLocations) {
      const member = await BlueRidgeTeamMember.findOne({
        _id: entry.memberId,
        eventId: event._id,
        teamId: team._id,
        status: 'active',
      });
      if (!member) continue;
      const previousFeePaidTo = String(member.feePaidTo || '');
      if (previousFeePaidTo === entry.feePaidTo) continue;
      member.feePaidTo = entry.feePaidTo;
      await member.save();
      feeLocationUpdates.push({
        memberId: String(member && member._id || ''),
        name: member && member.name || '',
        from: previousFeePaidTo,
        to: entry.feePaidTo,
      });
    }

    let removedMembers = [];
    if (removeMemberIds.length) {
      removedMembers = await BlueRidgeTeamMember.find({
        _id: { $in: removeMemberIds },
        eventId: event._id,
        teamId: team._id,
        status: 'active',
      }).lean();
      await BlueRidgeTeamMember.updateMany(
        { _id: { $in: removeMemberIds }, eventId: event._id, teamId: team._id, status: 'active' },
        { $set: { status: 'cancelled' } }
      );
    }

    let addedMembers = [];
    if (addPlayers.length) {
      const currentCount = await BlueRidgeTeamMember.countDocuments({ teamId: team._id, status: 'active' });
      const constraintsErr = validateRuleConstraints(event, 'join_team', addPlayers, currentCount);
      if (constraintsErr) return badRequest(res, constraintsErr);
      const duplicateErr = await ensurePlayersNotRegistered(event._id, addPlayers, BlueRidgeTeamMember);
      if (duplicateErr) return badRequest(res, duplicateErr);

      const createdRegistrations = [];
      for (const player of addPlayers) {
        const registration = await BlueRidgeRegistration.create({
          eventId: event._id,
          mode: 'join_team',
          teamId: team._id,
          submittedByName: player.name,
          submittedByEmail: player.email,
          submittedByPhone: player.phone,
          notes: 'Added from Plastered Open roster admin.',
          paymentStatus: 'unpaid',
          status: 'registered',
        });
        createdRegistrations.push(registration);
      }

      const docs = addPlayers.map((player, index) => ({
        eventId: event._id,
        teamId: team._id,
        registrationId: createdRegistrations[index]._id,
        name: player.name,
        email: player.email,
        emailKey: player.email,
        phone: player.phone,
        isGuest: Boolean(player.isGuest),
        isClubMember: Boolean(player.isClubMember),
        isCaptain: false,
        feePaidTo: player.feePaidTo,
        status: 'active',
      }));
      addedMembers = await BlueRidgeTeamMember.insertMany(docs, { ordered: true });
    }

    const teamCount = await BlueRidgeTeamMember.countDocuments({ teamId: team._id, status: 'active' });
    const exact = Number(event.teamSizeExact || 0);
    const fullThreshold = exact > 0 ? exact : Number(event.teamSizeMax || team.targetSize || 4);
    const nextStatus = teamCount <= 0 ? 'cancelled' : (teamCount >= fullThreshold ? 'active' : 'incomplete');
    team.status = nextStatus;
    await team.save();

    const changes = buildAuditChangeSet(previousTeam, team, ['name', 'status']);
    if (Object.keys(changes).length || removedMembers.length || addedMembers.length || feeLocationUpdates.length || contactUpdates.length) {
      await writeOutingAudit(models, {
        outingId: event._id,
        category: 'team',
        action: 'team_roster_admin_updated',
        actor: auditActor(req),
        method: req.method,
        route: routePath(req),
        summary: `Team updated: ${team.name || 'team'}`,
        details: {
          teamId: String(team && team._id || ''),
          teamName: team && team.name || '',
          changes,
          removedPlayers: summarizePlayers(removedMembers),
          addedPlayers: summarizePlayers(addPlayers),
          contactUpdates,
          feeLocationUpdates,
          activePlayerCount: teamCount,
        },
      });
    }

    const detail = await buildEventDetail(event, models, true);
    res.json({ ok: true, team, event: detail });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'Team update would duplicate an existing team or golfer' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.delete('/admin/events/:eventId/teams/:teamId', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin code required' });
    if (!(await requireSecondaryConnection(res))) return;

    const models = getSecondaryModels();
    const { BlueRidgeOuting, BlueRidgeRegistration, BlueRidgeTeam, BlueRidgeTeamMember } = models;

    const event = await BlueRidgeOuting.findById(req.params.eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const team = await BlueRidgeTeam.findOne({ _id: req.params.teamId, eventId: event._id });
    if (!team || team.status === 'cancelled') {
      const archivedMembers = await BlueRidgeTeamMember.find({
        eventId: event._id,
        teamId: req.params.teamId,
      }).lean();
      const archivedRegistrations = await BlueRidgeRegistration.find({
        eventId: event._id,
        teamId: req.params.teamId,
      }).lean();
      if (!team && !archivedMembers.length && !archivedRegistrations.length) {
        return res.status(404).json({ error: 'Team not found' });
      }

      await BlueRidgeTeamMember.deleteMany({ eventId: event._id, teamId: req.params.teamId });
      await BlueRidgeRegistration.deleteMany({ eventId: event._id, teamId: req.params.teamId });
      if (team) {
        await BlueRidgeTeam.deleteOne({ _id: team._id, eventId: event._id });
      }

      await writeOutingAudit(models, {
        outingId: event._id,
        category: 'team',
        action: 'archived_team_admin_deleted',
        actor: auditActor(req),
        method: req.method,
        route: routePath(req),
        summary: `Archived team records deleted: ${team && team.name || 'Archived Team'}`,
        details: {
          teamId: String(req.params.teamId || ''),
          teamName: team && team.name || 'Archived Team',
          deletedPlayers: summarizePlayers(archivedMembers),
          deletedRegistrations: archivedRegistrations.map((entry) => ({
            registrationId: String(entry && entry._id || ''),
            submittedByName: entry && entry.submittedByName || '',
            submittedByEmail: entry && entry.submittedByEmail || '',
            status: entry && entry.status || '',
            paymentStatus: entry && entry.paymentStatus || '',
          })),
        },
      });

      const detail = await buildEventDetail(event, models, true);
      return res.json({ ok: true, team: team || { _id: req.params.teamId, status: 'deleted' }, event: detail });
    }

    const teamMembers = await BlueRidgeTeamMember.find({
      eventId: event._id,
      teamId: team._id,
    }).lean();
    const teamRegistrations = await BlueRidgeRegistration.find({
      eventId: event._id,
      teamId: team._id,
    }).lean();

    await BlueRidgeTeamMember.deleteMany({ eventId: event._id, teamId: team._id });
    await BlueRidgeRegistration.deleteMany({ eventId: event._id, teamId: team._id });
    await BlueRidgeTeam.deleteOne({ _id: team._id, eventId: event._id });

    await writeOutingAudit(models, {
      outingId: event._id,
      category: 'team',
      action: 'team_admin_deleted',
      actor: auditActor(req),
      method: req.method,
      route: routePath(req),
      summary: `Team deleted: ${team.name || 'team'}`,
      details: {
        teamId: String(team && team._id || ''),
        teamName: team && team.name || '',
        removedPlayers: summarizePlayers(teamMembers),
        deletedRegistrations: teamRegistrations.map((entry) => ({
          registrationId: String(entry && entry._id || ''),
          submittedByName: entry && entry.submittedByName || '',
          submittedByEmail: entry && entry.submittedByEmail || '',
          status: entry && entry.status || '',
          paymentStatus: entry && entry.paymentStatus || '',
        })),
      },
    });

    const detail = await buildEventDetail(event, models, true);
    res.json({ ok: true, team: { _id: team._id, name: team.name, status: 'deleted' }, event: detail });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/events/:eventId/fees', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin code required' });
    if (!(await requireSecondaryConnection(res))) return;

    const models = getSecondaryModels();
    const event = await models.BlueRidgeOuting.findById(req.params.eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const detail = await buildFeeManagementDetail(event, models);
    res.json(detail);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/admin/events/:eventId/fees', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin code required' });
    if (!(await requireSecondaryConnection(res))) return;

    const models = getSecondaryModels();
    const event = await models.BlueRidgeOuting.findById(req.params.eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const feeSchedule = normalizeFeeScheduleItems(req.body && req.body.feeSchedule || []);
    if (!feeSchedule.length) return badRequest(res, 'At least one fee schedule item is required');
    const previousSchedule = feeScheduleForEvent(event);
    event.feeSchedule = feeSchedule;
    const entryItem = feeSchedule.find((item) => item.key === 'entry_fee' || item.category === 'income');
    if (entryItem && entryItem.basis === 'per_player') {
      event.entryFee = parseMoneyAmount(entryItem.amount, event.entryFee || 0);
    }
    await event.save();

    await writeOutingAudit(models, {
      outingId: event._id,
      category: 'money',
      action: 'fee_schedule_updated',
      actor: auditActor(req),
      method: req.method,
      route: routePath(req),
      summary: `Fee schedule updated for ${event.name || 'outing'}`,
      details: {
        previousSchedule,
        feeSchedule,
        entryFee: event.entryFee,
      },
    });

    const detail = await buildFeeManagementDetail(event, models);
    res.json(detail);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/events/:eventId/fee-ledger', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin code required' });
    if (!(await requireSecondaryConnection(res))) return;

    const models = getSecondaryModels();
    const event = await models.BlueRidgeOuting.findById(req.params.eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    const payload = coerceLedgerInput(req.body || {});
    if (!payload.label) return badRequest(res, 'label is required');
    if (!payload.amount) return badRequest(res, 'amount is required');

    const entry = await models.BlueRidgeOutingLedgerEntry.create({
      eventId: event._id,
      ...payload,
    });

    await writeOutingAudit(models, {
      outingId: event._id,
      category: 'money',
      action: 'fee_ledger_entry_created',
      actor: auditActor(req),
      method: req.method,
      route: routePath(req),
      summary: `Ledger entry added: ${entry.label}`,
      details: {
        ledgerEntryId: String(entry && entry._id || ''),
        type: entry.type,
        category: entry.category,
        label: entry.label,
        amount: entry.amount,
      },
    });

    const detail = await buildFeeManagementDetail(event, models);
    res.status(201).json(detail);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/admin/events/:eventId/fee-ledger/:entryId', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin code required' });
    if (!(await requireSecondaryConnection(res))) return;

    const models = getSecondaryModels();
    const event = await models.BlueRidgeOuting.findById(req.params.eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    const entry = await models.BlueRidgeOutingLedgerEntry.findOne({ _id: req.params.entryId, eventId: event._id });
    if (!entry) return res.status(404).json({ error: 'Ledger entry not found' });

    const previous = entry.toObject ? entry.toObject() : { ...entry };
    const payload = coerceLedgerInput(req.body || {});
    if (!payload.label) return badRequest(res, 'label is required');
    if (!payload.amount) return badRequest(res, 'amount is required');
    Object.assign(entry, payload);
    await entry.save();

    await writeOutingAudit(models, {
      outingId: event._id,
      category: 'money',
      action: 'fee_ledger_entry_updated',
      actor: auditActor(req),
      method: req.method,
      route: routePath(req),
      summary: `Ledger entry updated: ${entry.label}`,
      details: {
        ledgerEntryId: String(entry && entry._id || ''),
        changedFields: buildAuditChangeSet(previous, entry, Object.keys(payload)),
      },
    });

    const detail = await buildFeeManagementDetail(event, models);
    res.json(detail);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/admin/events/:eventId/fee-ledger/:entryId', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin code required' });
    if (!(await requireSecondaryConnection(res))) return;

    const models = getSecondaryModels();
    const event = await models.BlueRidgeOuting.findById(req.params.eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    const entry = await models.BlueRidgeOutingLedgerEntry.findOne({ _id: req.params.entryId, eventId: event._id });
    if (!entry) return res.status(404).json({ error: 'Ledger entry not found' });
    const entrySnapshot = entry.toObject ? entry.toObject() : { ...entry };
    await models.BlueRidgeOutingLedgerEntry.deleteOne({ _id: entry._id, eventId: event._id });

    await writeOutingAudit(models, {
      outingId: event._id,
      category: 'money',
      action: 'fee_ledger_entry_deleted',
      actor: auditActor(req),
      method: req.method,
      route: routePath(req),
      summary: `Ledger entry deleted: ${entrySnapshot.label || 'entry'}`,
      details: {
        ledgerEntryId: String(entrySnapshot && entrySnapshot._id || ''),
        type: entrySnapshot.type,
        category: entrySnapshot.category,
        label: entrySnapshot.label,
        amount: entrySnapshot.amount,
      },
    });

    const detail = await buildFeeManagementDetail(event, models);
    res.json(detail);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/events/:eventId/communications', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin code required' });
    if (!(await requireSecondaryConnection(res))) return;

    const models = getSecondaryModels();
    const event = await models.BlueRidgeOuting.findById(req.params.eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    res.json(await buildCommunicationAudience(event, models));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/events/:eventId/communications/contacts', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin code required' });
    if (!(await requireSecondaryConnection(res))) return;

    const models = getSecondaryModels();
    const event = await models.BlueRidgeOuting.findById(req.params.eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const name = String(req.body && req.body.name || '').trim();
    const email = normalizeEmail(req.body && req.body.email || '');
    const phone = String(req.body && req.body.phone || '').trim();
    const notes = String(req.body && req.body.notes || '').trim();
    const tags = String(req.body && req.body.tags || '')
      .split(',')
      .map((tag) => String(tag || '').trim().toLowerCase())
      .filter(Boolean);
    if (!email || !email.includes('@')) return badRequest(res, 'A valid email is required');

    await models.BlueRidgeOutingMailingContact.findOneAndUpdate(
      { eventId: event._id, emailKey: email },
      {
        $set: {
          eventId: event._id,
          name,
          email,
          emailKey: email,
          phone,
          notes,
          tags,
          source: 'manual',
          status: 'subscribed',
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    await writeOutingAudit(models, {
      outingId: event._id,
      category: 'event',
      action: 'mailing_contact_saved',
      actor: auditActor(req),
      method: req.method,
      route: routePath(req),
      summary: `Mailing contact saved: ${name || email}`,
      details: { name, email, phone, tags },
    });

    res.status(201).json(await buildCommunicationAudience(event, models));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/admin/events/:eventId/communications/contacts/:contactId', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin code required' });
    if (!(await requireSecondaryConnection(res))) return;

    const models = getSecondaryModels();
    const event = await models.BlueRidgeOuting.findById(req.params.eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    const contact = await models.BlueRidgeOutingMailingContact.findOne({ _id: req.params.contactId, eventId: event._id });
    if (!contact) return res.status(404).json({ error: 'Mailing contact not found' });
    contact.status = 'unsubscribed';
    await contact.save();

    await writeOutingAudit(models, {
      outingId: event._id,
      category: 'event',
      action: 'mailing_contact_removed',
      actor: auditActor(req),
      method: req.method,
      route: routePath(req),
      summary: `Mailing contact removed: ${contact.name || contact.email}`,
      details: { contactId: String(contact._id), email: contact.email },
    });

    res.json(await buildCommunicationAudience(event, models));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/events/:eventId/communications/send', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin code required' });
    if (!(await requireSecondaryConnection(res))) return;

    const models = getSecondaryModels();
    const event = await models.BlueRidgeOuting.findById(req.params.eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const subject = String(req.body && req.body.subject || '').trim();
    const body = String(req.body && req.body.body || '').trim();
    const audience = String(req.body && req.body.audience || 'all').trim().toLowerCase();
    const testEmail = normalizeEmail(req.body && req.body.testEmail || '');
    const isTest = parseBool(req.body && req.body.testOnly, false);
    if (!subject) return badRequest(res, 'Subject is required');
    if (!body) return badRequest(res, 'Message body is required');

    const audiencePayload = await buildCommunicationAudience(event, models);
    const selected = isTest
      ? [{ name: 'Test recipient', email: testEmail, groups: ['test'] }]
      : filterAudienceRecipients(audiencePayload.recipients, audience);
    if (isTest && (!testEmail || !testEmail.includes('@'))) return badRequest(res, 'A test email is required');
    if (!selected.length) return badRequest(res, 'No recipients match this audience');

    const html = communicationEmailHtml(event, body);
    const sendResult = await sendPlasteredOpenEmail(selected.map((recipient) => recipient.email), subject, html, { bcc: !isTest });
    const status = sendResult && sendResult.ok ? (isTest ? 'test' : 'sent') : 'failed';
    const message = await models.BlueRidgeOutingMessage.create({
      eventId: event._id,
      subject,
      body,
      audience,
      status,
      recipientCount: selected.length,
      recipients: selected.map((recipient) => ({
        name: recipient.name || '',
        email: recipient.email,
        groups: recipient.groups || [],
      })),
      testEmail: isTest ? testEmail : '',
      providerResponse: sendResult && sendResult.data ? sendResult.data : sendResult || {},
      error: sendResult && sendResult.error && sendResult.error.message ? sendResult.error.message : '',
      sentAt: new Date(),
    });

    await writeOutingAudit(models, {
      outingId: event._id,
      category: 'event',
      action: isTest ? 'communication_test_sent' : 'communication_sent',
      actor: auditActor(req),
      method: req.method,
      route: routePath(req),
      summary: `${isTest ? 'Test message' : 'Message'} sent: ${subject}`,
      details: {
        messageId: String(message && message._id || ''),
        audience,
        recipientCount: selected.length,
        testEmail: isTest ? testEmail : '',
        status,
      },
    });

    if (status === 'failed') {
      return res.status(503).json({ error: 'Unable to send message', result: sendResult, message });
    }
    res.status(201).json({ ok: true, message, communications: await buildCommunicationAudience(event, models) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/events/:eventId/audit-log', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin code required' });
    if (!(await requireSecondaryConnection(res))) return;

    const models = getSecondaryModels();
    const event = await models.BlueRidgeOuting.findById(req.params.eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(1000, Math.floor(rawLimit))) : 300;
    const rows = await models.BlueRidgeOutingAuditLog.find({ outingId: event._id }).sort({ timestamp: -1 }).lean();
    const trimmedRows = Array.isArray(rows) ? rows.slice(0, limit) : [];
    const hasCreateEntry = trimmedRows.some((row) => String(row && row.action || '').trim() === 'event_created');
    const createdRow = !hasCreateEntry && event.createdAt ? {
      _id: `created-${String(event._id)}`,
      outingId: event._id,
      category: 'event',
      action: 'event_created',
      actor: 'admin',
      method: 'CREATE',
      route: `/api/outings/admin/events/${event._id}`,
      summary: `Outing created: ${event.name || 'Outing'}`,
      details: {
        name: event.name || '',
        formatType: event.formatType || '',
        date: formatDateRange(event.startDate, event.endDate),
      },
      timestamp: event.createdAt,
    } : null;

    const auditRows = createdRow && trimmedRows.length < limit
      ? [...trimmedRows, createdRow]
      : trimmedRows;

    res.json({
      eventId: String(event._id),
      eventName: event.name || '',
      count: auditRows.length,
      rows: auditRows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/events', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin code required' });
    if (!(await requireSecondaryConnection(res))) return;

    const models = getSecondaryModels();
    const outings = await models.BlueRidgeOuting.find({}).sort({ startDate: 1 });
    const payload = await Promise.all(outings.map((e) => buildEventDetail(e, models, true)));
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/events', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin code required' });
    if (!(await requireSecondaryConnection(res))) return;

    const payload = coerceOutingInput(req.body || {});
    if (!payload.name || !payload.formatType || !payload.startDate || !payload.endDate) {
      return badRequest(res, 'name, formatType, startDate, and endDate are required');
    }
    const configErr = validateOutingConfig(payload);
    if (configErr) return badRequest(res, configErr);

    const models = getSecondaryModels();
    const created = await models.BlueRidgeOuting.create(payload);
    await writeOutingAudit(models, {
      outingId: created && created._id,
      category: 'event',
      action: 'event_created',
      actor: auditActor(req),
      method: req.method,
      route: routePath(req),
      summary: `Outing created: ${created.name || 'Outing'}`,
      details: {
        name: created && created.name || '',
        formatType: created && created.formatType || '',
        status: created && created.status || '',
        date: formatDateRange(created && created.startDate, created && created.endDate),
      },
    });
    const detail = await buildEventDetail(created, models, true);
    res.status(201).json(detail);
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'Event with this name/date already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.put('/admin/events/:eventId', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin code required' });
    if (!(await requireSecondaryConnection(res))) return;

    const payload = coerceOutingInput(req.body || {});
    const configErr = validateOutingConfig(payload);
    if (configErr) return badRequest(res, configErr);

    const models = getSecondaryModels();
    const existing = await models.BlueRidgeOuting.findById(req.params.eventId);
    if (!existing) return res.status(404).json({ error: 'Event not found' });
    const updated = await models.BlueRidgeOuting.findByIdAndUpdate(req.params.eventId, payload, { new: true });
    if (!updated) return res.status(404).json({ error: 'Event not found' });

    const changedFields = buildAuditChangeSet(existing, updated, Object.keys(payload));
    const changedKeys = Object.keys(changedFields);
    if (changedKeys.length) {
      await writeOutingAudit(models, {
        outingId: updated && updated._id,
        category: 'event',
        action: 'event_updated',
        actor: auditActor(req),
        method: req.method,
        route: routePath(req),
        summary: `Outing updated: ${updated.name || 'Outing'}`,
        details: {
          changedCount: changedKeys.length,
          changedKeys,
          changedFields,
          status: updated && updated.status || '',
          date: formatDateRange(updated && updated.startDate, updated && updated.endDate),
        },
      });
    }

    const detail = await buildEventDetail(updated, models, true);
    res.json(detail);
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'Event with this name/date already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
