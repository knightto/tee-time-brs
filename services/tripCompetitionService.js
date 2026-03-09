const SCORING_MODE_BEST4 = 'best4';
const SCORING_MODE_ALL5 = 'all5';
const DEFAULT_SCORING_MODE = SCORING_MODE_BEST4;

// Myrtle course scorecards captured from public scorecard pages on 2026-03-09.
const MYRTLE_SCORECARDS = [
  {
    courseKey: 'world tour',
    holes: [
      { hole: 1, par: 4, handicap: 15 },
      { hole: 2, par: 5, handicap: 3 },
      { hole: 3, par: 3, handicap: 7 },
      { hole: 4, par: 4, handicap: 5 },
      { hole: 5, par: 5, handicap: 1 },
      { hole: 6, par: 4, handicap: 11 },
      { hole: 7, par: 3, handicap: 9 },
      { hole: 8, par: 4, handicap: 13 },
      { hole: 9, par: 4, handicap: 17 },
      { hole: 10, par: 4, handicap: 12 },
      { hole: 11, par: 5, handicap: 10 },
      { hole: 12, par: 3, handicap: 18 },
      { hole: 13, par: 4, handicap: 2 },
      { hole: 14, par: 3, handicap: 14 },
      { hole: 15, par: 5, handicap: 8 },
      { hole: 16, par: 4, handicap: 6 },
      { hole: 17, par: 4, handicap: 16 },
      { hole: 18, par: 4, handicap: 4 },
    ],
  },
  {
    courseKey: 'wild wing avocet',
    holes: [
      { hole: 1, par: 4, handicap: 9 },
      { hole: 2, par: 4, handicap: 17 },
      { hole: 3, par: 4, handicap: 3 },
      { hole: 4, par: 5, handicap: 5 },
      { hole: 5, par: 3, handicap: 11 },
      { hole: 6, par: 4, handicap: 1 },
      { hole: 7, par: 5, handicap: 7 },
      { hole: 8, par: 3, handicap: 15 },
      { hole: 9, par: 4, handicap: 13 },
      { hole: 10, par: 4, handicap: 12 },
      { hole: 11, par: 5, handicap: 6 },
      { hole: 12, par: 3, handicap: 8 },
      { hole: 13, par: 4, handicap: 16 },
      { hole: 14, par: 4, handicap: 18 },
      { hole: 15, par: 5, handicap: 10 },
      { hole: 16, par: 4, handicap: 2 },
      { hole: 17, par: 3, handicap: 14 },
      { hole: 18, par: 4, handicap: 4 },
    ],
  },
  {
    courseKey: 'kings north',
    holes: [
      { hole: 1, par: 5, handicap: 10 },
      { hole: 2, par: 4, handicap: 8 },
      { hole: 3, par: 4, handicap: 12 },
      { hole: 4, par: 3, handicap: 16 },
      { hole: 5, par: 4, handicap: 14 },
      { hole: 6, par: 5, handicap: 2 },
      { hole: 7, par: 4, handicap: 6 },
      { hole: 8, par: 3, handicap: 18 },
      { hole: 9, par: 4, handicap: 4 },
      { hole: 10, par: 5, handicap: 13 },
      { hole: 11, par: 4, handicap: 11 },
      { hole: 12, par: 3, handicap: 17 },
      { hole: 13, par: 4, handicap: 3 },
      { hole: 14, par: 4, handicap: 9 },
      { hole: 15, par: 5, handicap: 1 },
      { hole: 16, par: 4, handicap: 7 },
      { hole: 17, par: 3, handicap: 15 },
      { hole: 18, par: 4, handicap: 5 },
    ],
  },
  {
    courseKey: 'river hills',
    holes: [
      { hole: 1, par: 4, handicap: 14 },
      { hole: 2, par: 5, handicap: 4 },
      { hole: 3, par: 3, handicap: 18 },
      { hole: 4, par: 4, handicap: 8 },
      { hole: 5, par: 4, handicap: 6 },
      { hole: 6, par: 3, handicap: 16 },
      { hole: 7, par: 5, handicap: 2 },
      { hole: 8, par: 4, handicap: 12 },
      { hole: 9, par: 4, handicap: 10 },
      { hole: 10, par: 4, handicap: 11 },
      { hole: 11, par: 5, handicap: 3 },
      { hole: 12, par: 3, handicap: 15 },
      { hole: 13, par: 4, handicap: 9 },
      { hole: 14, par: 4, handicap: 5 },
      { hole: 15, par: 3, handicap: 17 },
      { hole: 16, par: 4, handicap: 13 },
      { hole: 17, par: 5, handicap: 1 },
      { hole: 18, par: 4, handicap: 7 },
    ],
  },
  {
    courseKey: 'long bay',
    holes: [
      { hole: 1, par: 4, handicap: 11 },
      { hole: 2, par: 5, handicap: 3 },
      { hole: 3, par: 4, handicap: 5 },
      { hole: 4, par: 4, handicap: 1 },
      { hole: 5, par: 3, handicap: 13 },
      { hole: 6, par: 4, handicap: 17 },
      { hole: 7, par: 5, handicap: 7 },
      { hole: 8, par: 3, handicap: 15 },
      { hole: 9, par: 4, handicap: 9 },
      { hole: 10, par: 4, handicap: 16 },
      { hole: 11, par: 5, handicap: 10 },
      { hole: 12, par: 4, handicap: 6 },
      { hole: 13, par: 3, handicap: 18 },
      { hole: 14, par: 4, handicap: 8 },
      { hole: 15, par: 5, handicap: 14 },
      { hole: 16, par: 4, handicap: 4 },
      { hole: 17, par: 3, handicap: 12 },
      { hole: 18, par: 4, handicap: 2 },
    ],
  },
];

function cleanString(value) {
  return String(value || '').trim();
}

function normalizeNameKey(value) {
  return cleanString(value).replace(/\s+/g, ' ').toLowerCase();
}

function normalizeCourseKey(value) {
  return cleanString(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function uniqueNames(values = []) {
  const seen = new Set();
  const output = [];
  for (const raw of values) {
    const name = cleanString(raw);
    const key = normalizeNameKey(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    output.push(name);
  }
  return output;
}

function asFiniteNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function asPositiveInteger(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const rounded = Math.round(num);
  return rounded > 0 ? rounded : null;
}

function cloneScorecardHoles(holes = []) {
  return holes.map((hole) => ({
    hole: Number(hole.hole),
    par: Number(hole.par),
    handicap: Number(hole.handicap),
  }));
}

function getDefaultScorecard(courseName = '') {
  const normalizedCourse = normalizeCourseKey(courseName);
  const found = MYRTLE_SCORECARDS.find((entry) => normalizedCourse === normalizeCourseKey(entry.courseKey))
    || MYRTLE_SCORECARDS.find((entry) => normalizedCourse.includes(normalizeCourseKey(entry.courseKey)) || normalizeCourseKey(entry.courseKey).includes(normalizedCourse));
  if (found) return cloneScorecardHoles(found.holes);
  return Array.from({ length: 18 }, (_, index) => ({
    hole: index + 1,
    par: 4,
    handicap: index + 1,
  }));
}

function normalizeScorecard(scorecard = [], courseName = '') {
  const fallback = getDefaultScorecard(courseName);
  const explicit = Array.isArray(scorecard) ? scorecard : [];
  const byHole = new Map();
  explicit.forEach((hole, index) => {
    const holeNumber = asPositiveInteger(hole && (hole.hole || hole.number)) || (index + 1);
    if (holeNumber < 1 || holeNumber > 18) return;
    const par = asPositiveInteger(hole && hole.par);
    const handicap = asPositiveInteger(hole && (hole.handicap || hole.strokeIndex || hole.hcp));
    byHole.set(holeNumber, {
      hole: holeNumber,
      par: par || fallback[holeNumber - 1].par,
      handicap: handicap || fallback[holeNumber - 1].handicap,
    });
  });
  return fallback.map((hole) => byHole.get(hole.hole) || hole);
}

function normalizeHoleScores(holes = []) {
  const output = Array.from({ length: 18 }, () => null);
  if (!Array.isArray(holes)) return output;
  holes.slice(0, 18).forEach((value, index) => {
    const gross = asPositiveInteger(value);
    output[index] = gross || null;
  });
  return output;
}

function compactHoleScores(holes = []) {
  return normalizeHoleScores(holes);
}

function normalizeScoringMode(value) {
  return value === SCORING_MODE_ALL5 ? SCORING_MODE_ALL5 : SCORING_MODE_BEST4;
}

function getPlayingHandicap(handicapIndex) {
  const numeric = asFiniteNumber(handicapIndex);
  return numeric === null ? 0 : Math.round(numeric);
}

function getHoleStrokeAdjustment(playingHandicap, strokeIndex) {
  const parsedHandicap = Math.round(asFiniteNumber(playingHandicap) || 0);
  const parsedStrokeIndex = asPositiveInteger(strokeIndex);
  if (!parsedHandicap || !parsedStrokeIndex) return 0;

  const absHandicap = Math.abs(parsedHandicap);
  const base = Math.floor(absHandicap / 18);
  const extra = absHandicap % 18;

  if (parsedHandicap > 0) {
    return base + (parsedStrokeIndex <= extra ? 1 : 0);
  }

  const reverseRank = 19 - parsedStrokeIndex;
  return -(base + (reverseRank <= extra ? 1 : 0));
}

function stablefordPointsForNetDiff(netDiff) {
  if (!Number.isFinite(netDiff)) return null;
  if (netDiff >= 2) return 0;
  if (netDiff === 1) return 1;
  if (netDiff === 0) return 2;
  if (netDiff === -1) return 3;
  return 4;
}

function calculateHoleResult(grossScore, hole, handicapIndex) {
  const gross = asPositiveInteger(grossScore);
  if (!gross || !hole) {
    return {
      gross: null,
      net: null,
      points: null,
      strokeAdjustment: 0,
    };
  }
  const playingHandicap = getPlayingHandicap(handicapIndex);
  const strokeAdjustment = getHoleStrokeAdjustment(playingHandicap, hole.handicap);
  const net = gross - strokeAdjustment;
  const points = stablefordPointsForNetDiff(net - hole.par);
  return {
    gross,
    net,
    points,
    strokeAdjustment,
  };
}

function findPlayerScoreEntry(round = {}, playerName = '') {
  const targetKey = normalizeNameKey(playerName);
  const entries = Array.isArray(round.playerScores) ? round.playerScores : [];
  return entries.find((entry) => normalizeNameKey(entry && entry.playerName) === targetKey) || null;
}

function getRoundPlayerNames(round = {}) {
  const names = [];
  for (const slot of round.teeTimes || []) {
    for (const player of slot && slot.players ? slot.players : []) {
      names.push(player);
    }
  }
  for (const name of round.unassignedPlayers || []) {
    names.push(name);
  }
  for (const entry of round.playerScores || []) {
    if (entry && entry.playerName) names.push(entry.playerName);
  }
  return uniqueNames(names);
}

function getCompetitionPlayerPool(trip = {}, participants = []) {
  const roundNames = [];
  for (const round of trip.rounds || []) {
    roundNames.push(...getRoundPlayerNames(round));
  }
  const roundNameSet = new Set(roundNames.map(normalizeNameKey));
  const participantDocs = Array.isArray(participants) ? participants : [];
  const confirmed = participantDocs.filter((participant) => cleanString(participant && participant.status) === 'in');
  const baseParticipants = confirmed.length ? confirmed : participantDocs;
  const output = [];
  const seen = new Set();

  for (const participant of baseParticipants) {
    const name = cleanString(participant && participant.name);
    const key = normalizeNameKey(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    output.push({
      participantId: participant && participant._id ? String(participant._id) : null,
      name,
      handicapIndex: asFiniteNumber(participant && participant.handicapIndex),
      status: cleanString(participant && participant.status) || 'in',
    });
  }

  for (const name of roundNames) {
    const key = normalizeNameKey(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    output.push({
      participantId: null,
      name,
      handicapIndex: null,
      status: roundNameSet.has(key) ? 'in' : '',
    });
  }

  if (!output.length) {
    for (const participant of participantDocs) {
      const name = cleanString(participant && participant.name);
      const key = normalizeNameKey(name);
      if (!name || seen.has(key)) continue;
      seen.add(key);
      output.push({
        participantId: participant && participant._id ? String(participant._id) : null,
        name,
        handicapIndex: asFiniteNumber(participant && participant.handicapIndex),
        status: cleanString(participant && participant.status) || 'in',
      });
    }
  }

  return output;
}

function buildHandicapBuckets(players = []) {
  const sorted = players
    .slice()
    .sort((left, right) => {
      const leftHcp = asFiniteNumber(left && left.handicapIndex);
      const rightHcp = asFiniteNumber(right && right.handicapIndex);
      if (leftHcp !== null && rightHcp !== null && leftHcp !== rightHcp) return leftHcp - rightHcp;
      if (leftHcp !== null && rightHcp === null) return -1;
      if (leftHcp === null && rightHcp !== null) return 1;
      return cleanString(left && left.name).localeCompare(cleanString(right && right.name));
    });
  const labels = ['Bucket A', 'Bucket B', 'Bucket C', 'Bucket D'];
  return labels.map((label, index) => ({
    label,
    players: sorted.slice(index * 5, (index + 1) * 5).map((player) => ({
      name: player.name,
      handicapIndex: asFiniteNumber(player.handicapIndex),
    })),
  }));
}

function calculatePlayerRound(round = {}, playerName = '', handicapIndex = null) {
  const scorecard = normalizeScorecard(round.scorecard, round.course);
  const entry = findPlayerScoreEntry(round, playerName);
  const holes = normalizeHoleScores(entry && entry.holes);
  const holeResults = scorecard.map((hole, index) => calculateHoleResult(holes[index], hole, handicapIndex));
  const playingHandicap = getPlayingHandicap(handicapIndex);
  const completedHoles = holeResults.filter((result) => result.gross !== null).length;
  const stablefordTotal = completedHoles
    ? holeResults.reduce((sum, result) => sum + (result.points || 0), 0)
    : null;
  const grossTotal = completedHoles
    ? holeResults.reduce((sum, result) => sum + (result.gross || 0), 0)
    : null;
  const netTotal = completedHoles
    ? holeResults.reduce((sum, result) => sum + (result.net || 0), 0)
    : null;
  return {
    playerName,
    holes,
    holeResults,
    playingHandicap,
    stablefordTotal,
    grossTotal,
    netTotal,
    completedHoles,
    isComplete: completedHoles === 18,
  };
}

function computeCountedRounds(roundResults = [], scoringMode = DEFAULT_SCORING_MODE) {
  const counted = Array.from({ length: roundResults.length }, () => false);
  const completeRounds = roundResults
    .map((round, index) => ({ ...round, index }))
    .filter((round) => round && round.isComplete && Number.isFinite(round.stablefordTotal));

  if (!completeRounds.length) {
    return { countedFlags: counted, countedTotal: null };
  }

  if (normalizeScoringMode(scoringMode) === SCORING_MODE_ALL5) {
    let total = 0;
    completeRounds.forEach((round) => {
      counted[round.index] = true;
      total += round.stablefordTotal;
    });
    return { countedFlags: counted, countedTotal: total };
  }

  const chosen = completeRounds
    .slice()
    .sort((left, right) => {
      if (right.stablefordTotal !== left.stablefordTotal) return right.stablefordTotal - left.stablefordTotal;
      return left.index - right.index;
    })
    .slice(0, Math.min(4, completeRounds.length));

  const total = chosen.reduce((sum, round) => {
    counted[round.index] = true;
    return sum + round.stablefordTotal;
  }, 0);
  return { countedFlags: counted, countedTotal: total };
}

function normalizeTeamSelection(players = [], allowedPlayers = []) {
  const allowed = new Map(allowedPlayers.map((name) => [normalizeNameKey(name), cleanString(name)]));
  const output = [];
  const seen = new Set();
  for (const raw of players || []) {
    const key = normalizeNameKey(raw);
    if (!key || !allowed.has(key) || seen.has(key)) continue;
    seen.add(key);
    output.push(allowed.get(key));
  }
  return output;
}

function getSuggestedTeams(players = []) {
  const roster = uniqueNames(players);
  if (roster.length < 2) return { teamA: [], teamB: [] };
  const midpoint = Math.ceil(roster.length / 2);
  return {
    teamA: roster.slice(0, Math.min(2, midpoint)),
    teamB: roster.slice(Math.min(2, midpoint), Math.min(4, roster.length)),
  };
}

function findTeamMatch(round = {}, slotIndex) {
  const target = Number(slotIndex);
  const matches = Array.isArray(round.teamMatches) ? round.teamMatches : [];
  return matches.find((entry) => Number(entry && entry.slotIndex) === target) || null;
}

function calculateTeamBestNet(round = {}, playerName = '', holeIndex = 0, handicapIndex = null) {
  const playerRound = calculatePlayerRound(round, playerName, handicapIndex);
  const holeResult = playerRound.holeResults[holeIndex];
  return holeResult && holeResult.net !== null ? holeResult.net : null;
}

function calculateRoundMatch(round = {}, slot = {}, slotIndex = 0, playerPool = []) {
  const slotPlayers = uniqueNames(slot && slot.players ? slot.players : []);
  const savedMatch = findTeamMatch(round, slotIndex);
  const savedTeamA = normalizeTeamSelection(savedMatch && savedMatch.teamA, slotPlayers);
  const savedTeamB = normalizeTeamSelection(savedMatch && savedMatch.teamB, slotPlayers);
  const hasSavedTeams = savedTeamA.length === 2 && savedTeamB.length === 2
    && uniqueNames(savedTeamA.concat(savedTeamB)).length === 4;
  const suggestedTeams = getSuggestedTeams(slotPlayers);
  const teamA = hasSavedTeams ? savedTeamA : [];
  const teamB = hasSavedTeams ? savedTeamB : [];
  const handicapByName = new Map(playerPool.map((player) => [normalizeNameKey(player.name), asFiniteNumber(player.handicapIndex)]));

  if (!hasSavedTeams) {
    return {
      slotIndex,
      label: cleanString(slot && slot.label) || `TT#${slotIndex + 1}`,
      time: cleanString(slot && slot.time),
      players: slotPlayers,
      teamA,
      teamB,
      suggestedTeamA: suggestedTeams.teamA,
      suggestedTeamB: suggestedTeams.teamB,
      result: {
        status: slotPlayers.length === 4 ? 'unassigned' : 'unavailable',
        summary: slotPlayers.length === 4
          ? 'Assign two players to Team A and two to Team B.'
          : 'Need a four-player tee time for a 2-man match.',
        pointsA: null,
        pointsB: null,
        completedHoles: 0,
        teamAHolesWon: 0,
        teamBHolesWon: 0,
        halvedHoles: 0,
      },
    };
  }

  let completedHoles = 0;
  let teamAHolesWon = 0;
  let teamBHolesWon = 0;
  let halvedHoles = 0;

  for (let holeIndex = 0; holeIndex < 18; holeIndex += 1) {
    const teamANets = teamA
      .map((name) => calculateTeamBestNet(round, name, holeIndex, handicapByName.get(normalizeNameKey(name))))
      .filter((value) => Number.isFinite(value));
    const teamBNets = teamB
      .map((name) => calculateTeamBestNet(round, name, holeIndex, handicapByName.get(normalizeNameKey(name))))
      .filter((value) => Number.isFinite(value));
    if (!teamANets.length || !teamBNets.length) continue;
    completedHoles += 1;
    const teamABest = Math.min(...teamANets);
    const teamBBest = Math.min(...teamBNets);
    if (teamABest < teamBBest) teamAHolesWon += 1;
    else if (teamBBest < teamABest) teamBHolesWon += 1;
    else halvedHoles += 1;
  }

  const result = {
    status: completedHoles === 18 ? 'complete' : 'pending',
    summary: '',
    pointsA: null,
    pointsB: null,
    completedHoles,
    teamAHolesWon,
    teamBHolesWon,
    halvedHoles,
  };

  if (completedHoles !== 18) {
    result.summary = completedHoles
      ? `Scores entered through ${completedHoles} of 18 holes.`
      : 'No score data entered yet.';
  } else if (teamAHolesWon > teamBHolesWon) {
    result.summary = `Team A won ${teamAHolesWon}-${teamBHolesWon}-${halvedHoles}.`;
    result.pointsA = 1;
    result.pointsB = 0;
  } else if (teamBHolesWon > teamAHolesWon) {
    result.summary = `Team B won ${teamBHolesWon}-${teamAHolesWon}-${halvedHoles}.`;
    result.pointsA = 0;
    result.pointsB = 1;
  } else {
    result.summary = `Match tied ${teamAHolesWon}-${teamBHolesWon}-${halvedHoles}.`;
    result.pointsA = 0.5;
    result.pointsB = 0.5;
  }

  return {
    slotIndex,
    label: cleanString(slot && slot.label) || `TT#${slotIndex + 1}`,
    time: cleanString(slot && slot.time),
    players: slotPlayers,
    teamA,
    teamB,
    suggestedTeamA: suggestedTeams.teamA,
    suggestedTeamB: suggestedTeams.teamB,
    result,
  };
}

function normalizeCtpWinners(entries = []) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => ({
      hole: asPositiveInteger(entry && entry.hole),
      winners: uniqueNames(Array.isArray(entry && entry.winners) ? entry.winners : [entry && entry.playerName]),
      note: cleanString(entry && entry.note),
    }))
    .filter((entry) => entry.hole && entry.winners.length);
}

function normalizeSkinsResults(entries = []) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => ({
      playerName: cleanString(entry && entry.playerName),
      holes: uniqueNames((Array.isArray(entry && entry.holes) ? entry.holes : [])
        .map((hole) => String(asPositiveInteger(hole) || '').trim()))
        .map((hole) => Number(hole))
        .filter((hole) => Number.isFinite(hole)),
      amount: asFiniteNumber(entry && entry.amount),
      note: cleanString(entry && entry.note),
    }))
    .filter((entry) => entry.playerName);
}

function buildDailyPointsLeaderboard(roundViews = [], playerPool = []) {
  const pointsByName = new Map(playerPool.map((player) => [normalizeNameKey(player.name), {
    name: player.name,
    handicapIndex: asFiniteNumber(player.handicapIndex),
    points: 0,
  }]));

  for (const round of roundViews) {
    for (const match of round.matches || []) {
      if (!match || !match.result || match.result.status !== 'complete') continue;
      for (const name of match.teamA || []) {
        const key = normalizeNameKey(name);
        if (!pointsByName.has(key)) {
          pointsByName.set(key, { name, handicapIndex: null, points: 0 });
        }
        pointsByName.get(key).points += match.result.pointsA || 0;
      }
      for (const name of match.teamB || []) {
        const key = normalizeNameKey(name);
        if (!pointsByName.has(key)) {
          pointsByName.set(key, { name, handicapIndex: null, points: 0 });
        }
        pointsByName.get(key).points += match.result.pointsB || 0;
      }
    }
  }

  const sorted = Array.from(pointsByName.values()).sort((left, right) => {
    if (right.points !== left.points) return right.points - left.points;
    return left.name.localeCompare(right.name);
  });

  let previousPoints = null;
  let previousPosition = 0;
  return sorted.map((entry, index) => {
    const position = previousPoints !== null && previousPoints === entry.points ? previousPosition : index + 1;
    previousPoints = entry.points;
    previousPosition = position;
    return {
      position,
      name: entry.name,
      handicapIndex: entry.handicapIndex,
      points: entry.points,
    };
  });
}

function buildTripCompetitionView(trip = {}, participants = []) {
  const playerPool = getCompetitionPlayerPool(trip, participants);
  const scoringMode = normalizeScoringMode(trip && trip.competition && trip.competition.scoringMode);
  const rounds = Array.isArray(trip && trip.rounds) ? trip.rounds : [];

  const roundViews = rounds.map((round, roundIndex) => {
    const roundPlayers = uniqueNames(getRoundPlayerNames(round));
    const playerScores = roundPlayers.map((name) => {
      const player = playerPool.find((entry) => normalizeNameKey(entry.name) === normalizeNameKey(name));
      const roundScore = calculatePlayerRound(round, name, player && player.handicapIndex);
      return {
        playerName: name,
        handicapIndex: player ? asFiniteNumber(player.handicapIndex) : null,
        holes: roundScore.holes,
        strokeAdjustments: roundScore.holeResults.map((result) => result.strokeAdjustment),
        netHoles: roundScore.holeResults.map((result) => result.net),
        stablefordPointsByHole: roundScore.holeResults.map((result) => result.points),
        playingHandicap: roundScore.playingHandicap,
        stablefordTotal: roundScore.stablefordTotal,
        grossTotal: roundScore.grossTotal,
        netTotal: roundScore.netTotal,
        completedHoles: roundScore.completedHoles,
        isComplete: roundScore.isComplete,
      };
    });

    const scoreLookup = new Map(playerScores.map((entry) => [normalizeNameKey(entry.playerName), entry]));
    const matches = (round.teeTimes || []).map((slot, slotIndex) => calculateRoundMatch(round, slot, slotIndex, playerPool));

    return {
      roundIndex,
      course: cleanString(round && round.course) || `Round ${roundIndex + 1}`,
      date: round && round.date ? new Date(round.date).toISOString() : null,
      time: cleanString(round && round.time),
      scorecard: normalizeScorecard(round && round.scorecard, round && round.course),
      teeTimes: Array.isArray(round && round.teeTimes) ? round.teeTimes.map((slot, slotIndex) => ({
        slotIndex,
        label: cleanString(slot && slot.label) || `TT#${slotIndex + 1}`,
        time: cleanString(slot && slot.time),
        players: uniqueNames(slot && slot.players ? slot.players : []),
      })) : [],
      playerScores,
      playerScoreLookup: scoreLookup,
      matches,
      ctpWinners: normalizeCtpWinners(round && round.ctpWinners),
      skinsResults: normalizeSkinsResults(round && round.skinsResults),
      unassignedPlayers: uniqueNames(round && round.unassignedPlayers),
    };
  });

  const leaderboard = playerPool
    .map((player) => {
      const roundResults = roundViews.map((round) => {
        const score = round.playerScoreLookup.get(normalizeNameKey(player.name));
        return {
          stablefordTotal: score ? score.stablefordTotal : null,
          completedHoles: score ? score.completedHoles : 0,
          isComplete: score ? score.isComplete : false,
        };
      });
      const counted = computeCountedRounds(roundResults, scoringMode);
      return {
        participantId: player.participantId,
        name: player.name,
        handicapIndex: asFiniteNumber(player.handicapIndex),
        roundStablefordTotals: roundResults.map((round) => round.stablefordTotal),
        roundIsComplete: roundResults.map((round) => round.isComplete),
        roundCompletedHoles: roundResults.map((round) => round.completedHoles),
        countedFlags: counted.countedFlags,
        countedTotal: counted.countedTotal,
      };
    })
    .sort((left, right) => {
      const leftTotal = Number.isFinite(left.countedTotal) ? left.countedTotal : -Infinity;
      const rightTotal = Number.isFinite(right.countedTotal) ? right.countedTotal : -Infinity;
      if (rightTotal !== leftTotal) return rightTotal - leftTotal;
      const leftBest = Math.max(...left.roundStablefordTotals.map((value) => (Number.isFinite(value) ? value : -Infinity)));
      const rightBest = Math.max(...right.roundStablefordTotals.map((value) => (Number.isFinite(value) ? value : -Infinity)));
      if (rightBest !== leftBest) return rightBest - leftBest;
      return left.name.localeCompare(right.name);
    })
    .map((entry, index, list) => {
      const previous = list[index - 1];
      const sameAsPrevious = previous
        && previous.countedTotal === entry.countedTotal
        && previous.name !== entry.name;
      return {
        ...entry,
        position: sameAsPrevious ? previous.position : index + 1,
      };
    });

  return {
    overview: {
      scoringMode,
      scoringModeLabel: scoringMode === SCORING_MODE_ALL5 ? 'All 5 rounds count' : 'Best 4 of 5 rounds',
      playerCount: playerPool.length,
      roundCount: roundViews.length,
      formatSummary: 'Individual net Stableford across the trip, with daily 2-man net best ball matches inside each foursome.',
      sideGamesSummary: 'Optional Closest to Pin and skins results are tracked separately from the main competition.',
    },
    buckets: buildHandicapBuckets(playerPool),
    leaderboard,
    dailyMatches: roundViews.map((round) => ({
      roundIndex: round.roundIndex,
      course: round.course,
      date: round.date,
      time: round.time,
      matches: round.matches,
    })),
    dailyPointsLeaderboard: buildDailyPointsLeaderboard(roundViews, playerPool),
    sideGames: roundViews.map((round) => ({
      roundIndex: round.roundIndex,
      course: round.course,
      date: round.date,
      ctpWinners: round.ctpWinners,
      skinsResults: round.skinsResults,
    })),
    rounds: roundViews.map((round) => ({
      roundIndex: round.roundIndex,
      course: round.course,
      date: round.date,
      time: round.time,
      scorecard: round.scorecard,
      teeTimes: round.teeTimes,
      playerScores: round.playerScores,
      matches: round.matches,
      ctpWinners: round.ctpWinners,
      skinsResults: round.skinsResults,
      unassignedPlayers: round.unassignedPlayers,
    })),
    admin: {
      handicapPlayers: playerPool
        .filter((player) => player.participantId)
        .map((player) => ({
          participantId: player.participantId,
          name: player.name,
          handicapIndex: asFiniteNumber(player.handicapIndex),
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    },
  };
}

function getRoundAtIndex(trip = {}, roundIndex) {
  const index = Number(roundIndex);
  const rounds = Array.isArray(trip && trip.rounds) ? trip.rounds : [];
  if (!Number.isInteger(index) || index < 0 || index >= rounds.length) {
    throw new Error('Round not found.');
  }
  return rounds[index];
}

function setTripScoringMode(trip = {}, scoringMode) {
  const nextMode = normalizeScoringMode(scoringMode);
  if (!trip.competition) trip.competition = {};
  trip.competition.scoringMode = nextMode;
  return nextMode;
}

function setRoundPlayerScores(trip = {}, roundIndex, playerName = '', holes = []) {
  const round = getRoundAtIndex(trip, roundIndex);
  const cleanName = cleanString(playerName);
  if (!cleanName) throw new Error('playerName required');
  const normalizedHoles = compactHoleScores(holes);
  if (!Array.isArray(round.playerScores)) round.playerScores = [];
  const targetKey = normalizeNameKey(cleanName);
  const existingIndex = round.playerScores.findIndex((entry) => normalizeNameKey(entry && entry.playerName) === targetKey);
  const hasAnyScores = normalizedHoles.some((value) => value !== null);

  if (!hasAnyScores) {
    if (existingIndex >= 0) round.playerScores.splice(existingIndex, 1);
    return null;
  }

  const payload = { playerName: cleanName, holes: normalizedHoles };
  if (existingIndex >= 0) round.playerScores[existingIndex] = payload;
  else round.playerScores.push(payload);
  return payload;
}

function setRoundMatchTeams(trip = {}, roundIndex, slotIndex, teamA = [], teamB = []) {
  const round = getRoundAtIndex(trip, roundIndex);
  const slots = Array.isArray(round.teeTimes) ? round.teeTimes : [];
  const index = Number(slotIndex);
  if (!Number.isInteger(index) || index < 0 || index >= slots.length) {
    throw new Error('Tee time not found.');
  }
  const slotPlayers = uniqueNames(slots[index] && slots[index].players ? slots[index].players : []);
  if (slotPlayers.length !== 4) {
    throw new Error('Team matches require a four-player tee time.');
  }
  const normalizedTeamA = normalizeTeamSelection(teamA, slotPlayers);
  const normalizedTeamB = normalizeTeamSelection(teamB, slotPlayers);
  const combined = uniqueNames(normalizedTeamA.concat(normalizedTeamB));
  if (normalizedTeamA.length !== 2 || normalizedTeamB.length !== 2 || combined.length !== 4) {
    throw new Error('Select exactly two players for Team A and two players for Team B.');
  }
  if (!Array.isArray(round.teamMatches)) round.teamMatches = [];
  const existingIndex = round.teamMatches.findIndex((entry) => Number(entry && entry.slotIndex) === index);
  const payload = { slotIndex: index, teamA: normalizedTeamA, teamB: normalizedTeamB };
  if (existingIndex >= 0) round.teamMatches[existingIndex] = payload;
  else round.teamMatches.push(payload);
  return payload;
}

function setRoundSideGames(trip = {}, roundIndex, payload = {}) {
  const round = getRoundAtIndex(trip, roundIndex);
  if (Object.prototype.hasOwnProperty.call(payload, 'ctpWinners')) {
    round.ctpWinners = normalizeCtpWinners(payload.ctpWinners);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'skinsResults')) {
    round.skinsResults = normalizeSkinsResults(payload.skinsResults);
  }
  return round;
}

module.exports = {
  SCORING_MODE_BEST4,
  SCORING_MODE_ALL5,
  DEFAULT_SCORING_MODE,
  buildTripCompetitionView,
  calculatePlayerRound,
  computeCountedRounds,
  getDefaultScorecard,
  getHoleStrokeAdjustment,
  normalizeScoringMode,
  setRoundMatchTeams,
  setRoundPlayerScores,
  setRoundSideGames,
  setTripScoringMode,
  stablefordPointsForNetDiff,
};
