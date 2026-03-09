const { getDefaultScorecard } = require('./tripCompetitionService');

const DEFAULT_TEMPLATE_NAME = 'Fairway Forge Trip Template';
const DEFAULT_TEMPLATE_GROUP = 'Future Golf Trip Group';
const DEFAULT_TEMPLATE_LOCATION = 'Destination TBD';
const DEFAULT_TEMPLATE_PACKAGE = '4 Nights / 5 Rounds';
const DEFAULT_TEMPLATE_ROUND_COUNT = 5;
const DEFAULT_TEMPLATE_BUCKET_LABELS = ['Bucket A', 'Bucket B', 'Bucket C', 'Bucket D'];

function toDateOnly(value) {
  const parsed = value ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function addDays(date, days) {
  const out = new Date(date);
  out.setDate(out.getDate() + days);
  return out;
}

function formatTemplateRoundLabel(index) {
  return `Round ${index + 1}`;
}

function buildTemplateRound(roundIndex, baseDate) {
  const firstTeeMinutes = 8 * 60;
  const teeInterval = 9;
  const teeTimes = Array.from({ length: 4 }, (_, slotIndex) => {
    const minutes = firstTeeMinutes + (slotIndex * teeInterval);
    const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    return {
      label: `TT#${slotIndex + 1}`,
      time: `${hh}:${mm}`,
      players: [],
    };
  });

  return {
    course: `${formatTemplateRoundLabel(roundIndex)} Course`,
    address: '',
    date: addDays(baseDate, roundIndex),
    time: teeTimes[0].time,
    confirmation: '',
    teeTimes,
    unassignedPlayers: [],
    scorecard: getDefaultScorecard(''),
    playerScores: [],
    teamMatches: [],
    ctpWinners: [],
    skinsResults: [],
  };
}

function buildDefaultTripTemplate(input = {}) {
  const requestedStartDate = toDateOnly(input.startDate);
  const roundStartDate = requestedStartDate || addDays(toDateOnly(), 60);
  const arrivalDate = addDays(roundStartDate, -1);
  const departureDate = addDays(roundStartDate, 4);
  const roundCount = Number.isInteger(input.roundCount) && input.roundCount > 0 ? input.roundCount : DEFAULT_TEMPLATE_ROUND_COUNT;

  return {
    name: String(input.name || DEFAULT_TEMPLATE_NAME),
    groupName: String(input.groupName || DEFAULT_TEMPLATE_GROUP),
    location: String(input.location || DEFAULT_TEMPLATE_LOCATION),
    arrivalDate,
    departureDate,
    packageType: String(input.packageType || DEFAULT_TEMPLATE_PACKAGE),
    reservationNumber: String(input.reservationNumber || 'TEMPLATE-RESERVATION'),
    preparedBy: String(input.preparedBy || 'Trip Coordinator'),
    contactPhone: String(input.contactPhone || '(000) 000-0000'),
    baseGroupSize: Number.isInteger(input.baseGroupSize) && input.baseGroupSize > 0 ? input.baseGroupSize : 16,
    extraNightPricePerCondo: Number.isFinite(Number(input.extraNightPricePerCondo))
      ? Number(input.extraNightPricePerCondo)
      : 130,
    competition: {
      scoringMode: 'best4',
      handicapBuckets: DEFAULT_TEMPLATE_BUCKET_LABELS.map((label) => ({ label, players: [] })),
    },
    tinCupLive: {
      version: 1,
      settings: {
        enableLiveFoursomeScoring: false,
        enableFoursomeCodes: true,
        enableLiveMarkers: true,
        enableLiveLeaderboard: false,
      },
      codes: {},
      scorecards: {},
      scrambleBonus: {},
    },
    rounds: Array.from({ length: roundCount }, (_, roundIndex) => buildTemplateRound(roundIndex, roundStartDate)),
    notes: String(input.notes || 'Reusable template trip. Duplicate and customize dates, courses, participants, settings, and add a dedicated live leaderboard page link from the main trip page.'),
  };
}

module.exports = {
  DEFAULT_TEMPLATE_NAME,
  buildDefaultTripTemplate,
};
