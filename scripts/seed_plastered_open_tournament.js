require('dotenv').config();
const mongoose = require('mongoose');

const EVENT_NAME = 'Plastered "Open"';
const EVENT_START_DATE = new Date('2026-06-19');
const FULL_TEAM_COUNT = 58;
const TARGET_TEAM_SIZE = 2;
const BASE_TIME = new Date('2026-04-21T09:00:00-04:00');

const secondaryUri = String(process.env.MONGO_URI_SECONDARY || '').trim();
const secondaryDb = process.env.MONGO_DB_SECONDARY || undefined;

if (!secondaryUri) {
  console.error('Missing MONGO_URI_SECONDARY in environment');
  process.exit(1);
}

function oid() {
  return new mongoose.Types.ObjectId();
}

let tick = 0;
function stamp(extra = {}) {
  const at = new Date(BASE_TIME.getTime() + tick * 60 * 1000);
  tick += 1;
  return { createdAt: at, updatedAt: at, ...extra };
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function phone(value) {
  return `540-55${String(value).padStart(4, '0')}`;
}

function handicap(value) {
  return Number((4.2 + ((value * 1.37) % 14)).toFixed(1));
}

function teamCaptain(teamNo) {
  const id = pad(teamNo);
  return {
    name: `Captain ${id}`,
    email: `plastered.team${id}.captain@example.com`,
    phone: phone(teamNo),
    handicapIndex: handicap(teamNo),
  };
}

function teamPartner(teamNo) {
  const id = pad(teamNo);
  return {
    name: `Partner ${id}`,
    email: `plastered.team${id}.partner@example.com`,
    phone: phone(100 + teamNo),
    handicapIndex: handicap(100 + teamNo),
  };
}

function memberDoc(eventId, teamId, registrationId, player, options = {}) {
  return {
    _id: oid(),
    eventId,
    teamId,
    registrationId,
    name: player.name,
    email: String(player.email).toLowerCase(),
    emailKey: String(player.email).toLowerCase(),
    phone: player.phone,
    handicapIndex: player.handicapIndex,
    isGuest: Boolean(options.isGuest),
    isCaptain: Boolean(options.isCaptain),
    status: options.status || 'active',
    ...stamp(options.cancelledAt ? { cancelledAt: options.cancelledAt } : {}),
  };
}

function registrationDoc(eventId, mode, submitter, extra = {}) {
  return {
    _id: oid(),
    eventId,
    mode,
    status: extra.status || 'registered',
    teamId: extra.teamId,
    submittedByName: submitter.name,
    submittedByEmail: String(submitter.email).toLowerCase(),
    submittedByPhone: submitter.phone,
    notes: extra.notes || '',
    paymentStatus: extra.paymentStatus || 'unpaid',
    cancelledAt: extra.cancelledAt,
    ...stamp(),
  };
}

function teamDoc(eventId, name, captain, extra = {}) {
  return {
    _id: oid(),
    eventId,
    name,
    captainName: captain.name,
    captainEmail: String(captain.email).toLowerCase(),
    targetSize: TARGET_TEAM_SIZE,
    status: extra.status || 'active',
    ...stamp(),
  };
}

function waitlistDoc(eventId, index, status, mode, note) {
  return {
    _id: oid(),
    eventId,
    name: `Waitlist ${pad(index)}`,
    email: `plastered.waitlist${pad(index)}@example.com`,
    emailKey: `plastered.waitlist${pad(index)}@example.com`,
    phone: phone(800 + index),
    mode,
    notes: note,
    status,
    ...stamp(),
  };
}

async function main() {
  const conn = await mongoose.createConnection(secondaryUri, { dbName: secondaryDb }).asPromise();

  try {
    const BlueRidgeOuting = conn.model('BlueRidgeOuting', require('../models/BlueRidgeOuting').schema);
    const BlueRidgeRegistration = conn.model('BlueRidgeRegistration', require('../models/BlueRidgeRegistration').schema);
    const BlueRidgeTeam = conn.model('BlueRidgeTeam', require('../models/BlueRidgeTeam').schema);
    const BlueRidgeTeamMember = conn.model('BlueRidgeTeamMember', require('../models/BlueRidgeTeamMember').schema);
    const BlueRidgeWaitlist = conn.model('BlueRidgeWaitlist', require('../models/BlueRidgeWaitlist').schema);

    const event = await BlueRidgeOuting.findOne({ name: EVENT_NAME, startDate: EVENT_START_DATE });
    if (!event) {
      throw new Error(`Plastered outing not found. Seed the event first for ${EVENT_NAME} on ${EVENT_START_DATE.toISOString().slice(0, 10)}.`);
    }

    const eventId = event._id;
    const teams = [];
    const registrations = [];
    const members = [];
    const waitlist = [];

    for (let i = 1; i <= FULL_TEAM_COUNT; i += 1) {
      const teamNumber = pad(i);
      const captain = teamCaptain(i);
      const partner = teamPartner(i);
      const team = teamDoc(eventId, `Plastered Pair ${teamNumber}`, captain, { status: 'active' });
      const registration = registrationDoc(eventId, 'full_team', captain, {
        teamId: team._id,
        paymentStatus: 'paid',
        notes: `Seeded full-team registration for Plastered Pair ${teamNumber}.`,
      });

      teams.push(team);
      registrations.push(registration);
      members.push(
        memberDoc(eventId, team._id, registration._id, captain, { isCaptain: true }),
        memberDoc(eventId, team._id, registration._id, partner, { isCaptain: false })
      );
    }

    const captainHold = {
      name: 'Captain Hold',
      email: 'plastered.captain.hold@example.com',
      phone: phone(701),
      handicapIndex: handicap(701),
    };
    const captainJoin = {
      name: 'Captain Closer',
      email: 'plastered.captain.closer@example.com',
      phone: phone(702),
      handicapIndex: handicap(702),
    };
    const captainTeam = teamDoc(eventId, 'Last Call Duo', captainHold, { status: 'active' });
    const captainRegistration = registrationDoc(eventId, 'captain', captainHold, {
      teamId: captainTeam._id,
      paymentStatus: 'pending',
      notes: 'Captain-only signup later completed by a join-team registration.',
    });
    const captainJoinRegistration = registrationDoc(eventId, 'join_team', captainJoin, {
      teamId: captainTeam._id,
      paymentStatus: 'paid',
      notes: 'Joined the seeded captain hold team to complete the roster.',
    });
    teams.push(captainTeam);
    registrations.push(captainRegistration, captainJoinRegistration);
    members.push(
      memberDoc(eventId, captainTeam._id, captainRegistration._id, captainHold, { isCaptain: true }),
      memberDoc(eventId, captainTeam._id, captainJoinRegistration._id, captainJoin, { isCaptain: false })
    );

    const partialLead = {
      name: 'Partial Lead',
      email: 'plastered.partial.lead@example.com',
      phone: phone(703),
      handicapIndex: handicap(703),
    };
    const partialJoin = {
      name: 'Partial Closer',
      email: 'plastered.partial.closer@example.com',
      phone: phone(704),
      handicapIndex: handicap(704),
    };
    const partialTeam = teamDoc(eventId, 'Patchwork Pair', partialLead, { status: 'active' });
    const partialRegistration = registrationDoc(eventId, 'partial_team', partialLead, {
      teamId: partialTeam._id,
      paymentStatus: 'pending',
      notes: 'Partial-team signup later completed by a join-team registration.',
    });
    const partialJoinRegistration = registrationDoc(eventId, 'join_team', partialJoin, {
      teamId: partialTeam._id,
      paymentStatus: 'paid',
      notes: 'Joined the seeded partial team to complete the roster.',
    });
    teams.push(partialTeam);
    registrations.push(partialRegistration, partialJoinRegistration);
    members.push(
      memberDoc(eventId, partialTeam._id, partialRegistration._id, partialLead, { isCaptain: true }),
      memberDoc(eventId, partialTeam._id, partialJoinRegistration._id, partialJoin, { isCaptain: false })
    );

    const cancelledAt = new Date(BASE_TIME.getTime() + tick * 60 * 1000);
    const withdrawnCaptain = {
      name: 'Withdrawn Captain',
      email: 'plastered.withdrawn.captain@example.com',
      phone: phone(750),
      handicapIndex: handicap(750),
    };
    const withdrawnPartner = {
      name: 'Withdrawn Partner',
      email: 'plastered.withdrawn.partner@example.com',
      phone: phone(751),
      handicapIndex: handicap(751),
    };
    const withdrawnTeam = teamDoc(eventId, 'Withdrawn Duo', withdrawnCaptain, { status: 'cancelled' });
    const withdrawnRegistration = registrationDoc(eventId, 'full_team', withdrawnCaptain, {
      teamId: withdrawnTeam._id,
      status: 'cancelled',
      paymentStatus: 'refunded',
      notes: 'Seeded cancelled team registration for ledger coverage.',
      cancelledAt,
    });
    teams.push(withdrawnTeam);
    registrations.push(withdrawnRegistration);
    members.push(
      memberDoc(eventId, withdrawnTeam._id, withdrawnRegistration._id, withdrawnCaptain, { isCaptain: true, status: 'cancelled', cancelledAt }),
      memberDoc(eventId, withdrawnTeam._id, withdrawnRegistration._id, withdrawnPartner, { isCaptain: false, status: 'cancelled', cancelledAt })
    );

    const cancelledSoloA = {
      name: 'Cancelled Solo',
      email: 'plastered.cancelled.solo@example.com',
      phone: phone(760),
      handicapIndex: handicap(760),
    };
    const cancelledSoloRegistrationA = registrationDoc(eventId, 'single', cancelledSoloA, {
      status: 'cancelled',
      paymentStatus: 'refunded',
      notes: 'Seeded cancelled solo registration.',
      cancelledAt,
    });
    registrations.push(cancelledSoloRegistrationA);
    members.push(
      memberDoc(eventId, undefined, cancelledSoloRegistrationA._id, cancelledSoloA, { isCaptain: true, status: 'cancelled', cancelledAt })
    );

    const cancelledSoloB = {
      name: 'Cancelled Partner Finder',
      email: 'plastered.cancelled.partner@example.com',
      phone: phone(761),
      handicapIndex: handicap(761),
    };
    const cancelledSoloRegistrationB = registrationDoc(eventId, 'seeking_partner', cancelledSoloB, {
      status: 'cancelled',
      paymentStatus: 'refunded',
      notes: 'Seeded cancelled seeking-partner registration.',
      cancelledAt,
    });
    registrations.push(cancelledSoloRegistrationB);
    members.push(
      memberDoc(eventId, undefined, cancelledSoloRegistrationB._id, cancelledSoloB, { isCaptain: true, status: 'cancelled', cancelledAt })
    );

    waitlist.push(
      waitlistDoc(eventId, 1, 'active', 'single', 'First alternate if a team drops.'),
      waitlistDoc(eventId, 2, 'active', 'seeking_partner', 'Can join another single if needed.'),
      waitlistDoc(eventId, 3, 'active', 'seeking_team', 'Would take any open spot.'),
      waitlistDoc(eventId, 4, 'active', 'single', 'Available on short notice.'),
      waitlistDoc(eventId, 5, 'converted', 'single', 'Converted off the waitlist during seed coverage.'),
      waitlistDoc(eventId, 6, 'cancelled', 'single', 'Cancelled after joining the waitlist.')
    );

    await BlueRidgeTeamMember.deleteMany({ eventId });
    await BlueRidgeRegistration.deleteMany({ eventId });
    await BlueRidgeWaitlist.deleteMany({ eventId });
    await BlueRidgeTeam.deleteMany({ eventId });

    await BlueRidgeTeam.insertMany(teams, { ordered: true });
    await BlueRidgeRegistration.insertMany(registrations, { ordered: true });
    await BlueRidgeTeamMember.insertMany(members, { ordered: true });
    await BlueRidgeWaitlist.insertMany(waitlist, { ordered: true });

    const [activeTeams, activePlayers, allRegistrations, allWaitlist] = await Promise.all([
      BlueRidgeTeam.countDocuments({ eventId, status: { $in: ['active', 'incomplete'] } }),
      BlueRidgeTeamMember.countDocuments({ eventId, status: 'active' }),
      BlueRidgeRegistration.countDocuments({ eventId }),
      BlueRidgeWaitlist.countDocuments({ eventId }),
    ]);

    console.log(JSON.stringify({
      ok: true,
      eventId: String(eventId),
      activeTeams,
      activePlayers,
      registrations: allRegistrations,
      waitlist: allWaitlist,
      seededTeamCards: teams.filter((team) => team.status !== 'cancelled').length,
      seededWaitlistActive: waitlist.filter((entry) => entry.status === 'active').length,
    }, null, 2));
  } finally {
    await conn.close();
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
