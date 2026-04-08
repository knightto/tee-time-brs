const OFFICIAL_2026_INVITEES = Object.freeze([
  'Ludvig Aberg',
  'Daniel Berger',
  'Akshay Bhatia',
  'Keegan Bradley',
  'Michael Brennan',
  'Jacob Bridgeman',
  'Sam Burns',
  'Angel Cabrera',
  'Brian Campbell',
  'Patrick Cantlay',
  'Wyndham Clark',
  'Corey Conners',
  'Fred Couples',
  'Jason Day',
  'Bryson DeChambeau',
  'Nicolas Echavarria',
  'Harris English',
  'Ethan Fang',
  'Matt Fitzpatrick',
  'Tommy Fleetwood',
  'Ryan Fox',
  'Sergio Garcia',
  'Ryan Gerard',
  'Chris Gotterup',
  'Max Greyserman',
  'Ben Griffin',
  'Harry Hall',
  'Brian Harman',
  'Tyrrell Hatton',
  'Russell Henley',
  'Jackson Herrington',
  'Nicolai Hojgaard',
  'Rasmus Hojgaard',
  'Brandon Holtz',
  'Max Homa',
  'Viktor Hovland',
  'Mason Howell',
  'Sungjae Im',
  'Casey Jarvis',
  'Dustin Johnson',
  'Zach Johnson',
  'Naoyuki Kataoka',
  'John Keefer',
  'Michael Kim',
  'Si Woo Kim',
  'Kurt Kitayama',
  'Jake Knapp',
  'Brooks Koepka',
  'Fifa Laopakdee',
  'Min Woo Lee',
  'Haotong Li',
  'Shane Lowry',
  'Robert MacIntyre',
  'Hideki Matsuyama',
  'Matt McCarty',
  'Rory McIlroy',
  'Tom McKibbin',
  'Maverick McNealy',
  'Collin Morikawa',
  'Rasmus Neergaard-Petersen',
  'Alex Noren',
  'Andrew Novak',
  'Jose Maria Olazabal',
  'Carlos Ortiz',
  'Marco Penge',
  'Aldrich Potgieter',
  'Mateo Pulcini',
  'Jon Rahm',
  'Aaron Rai',
  'Patrick Reed',
  'Kristoffer Reitan',
  'Davis Riley',
  'Justin Rose',
  'Xander Schauffele',
  'Scottie Scheffler',
  'Charl Schwartzel',
  'Adam Scott',
  'Vijay Singh',
  'Cameron Smith',
  'J.J. Spaun',
  'Jordan Spieth',
  'Samuel Stevens',
  'Sepp Straka',
  'Nick Taylor',
  'Justin Thomas',
  'Sami Valimaki',
  'Bubba Watson',
  'Mike Weir',
  'Danny Willett',
  'Gary Woodland',
  'Cameron Young',
]);

const OFFICIAL_2026_WORLD_RANKINGS = Object.freeze({
  'Scottie Scheffler': 1,
  'Rory McIlroy': 2,
  'Cameron Young': 3,
  'Tommy Fleetwood': 4,
  'J.J. Spaun': 5,
  'Matt Fitzpatrick': 6,
  'Collin Morikawa': 7,
  'Robert MacIntyre': 8,
  'Justin Rose': 9,
  'Xander Schauffele': 10,
  'Chris Gotterup': 11,
  'Russell Henley': 12,
  'Sepp Straka': 13,
  'Hideki Matsuyama': 14,
  'Justin Thomas': 15,
  'Ben Griffin': 16,
  'Ludvig Aberg': 17,
  'Jacob Bridgeman': 18,
  'Alex Noren': 19,
  'Harris English': 20,
  'Akshay Bhatia': 21,
  'Viktor Hovland': 22,
  'Patrick Reed': 23,
  'Bryson DeChambeau': 24,
  'Min Woo Lee': 25,
  'Keegan Bradley': 26,
  'Maverick McNealy': 27,
  'Si Woo Kim': 28,
  'Ryan Gerard': 29,
  'Jon Rahm': 30,
  'Tyrrell Hatton': 31,
  'Shane Lowry': 32,
  'Sam Burns': 33,
  'Kurt Kitayama': 34,
  'Patrick Cantlay': 35,
  'Nicolai Hojgaard': 36,
  'Marco Penge': 37,
  'Daniel Berger': 38,
  'Aaron Rai': 39,
  'Nicolas Echavarria': 40,
  'Jason Day': 41,
  'Jake Knapp': 42,
  'Michael Kim': 43,
  'Corey Conners': 44,
  'Samuel Stevens': 45,
  'Kristoffer Reitan': 46,
  'Michael Brennan': 47,
  'Andrew Novak': 48,
  'Matt McCarty': 49,
  'Brian Harman': 50,
  'Ryan Fox': 51,
  'Gary Woodland': 52,
  'Adam Scott': 53,
  'Sami Valimaki': 54,
  'Rasmus Hojgaard': 55,
  'Max Greyserman': 56,
  'Jordan Spieth': 57,
  'Harry Hall': 58,
  'John Keefer': 59,
  'Nick Taylor': 60,
  'Rasmus Neergaard-Petersen': 61,
  'Casey Jarvis': 62,
  'Sungjae Im': 63,
  'Aldrich Potgieter': 64,
  'Wyndham Clark': 65,
  'Haotong Li': 66,
  'Tom McKibbin': 67,
  'Brian Campbell': 68,
  'Davis Riley': 69,
  'Carlos Ortiz': 70,
  'Max Homa': 71,
  'Brooks Koepka': 72,
  'Cameron Smith': 73,
  'Zach Johnson': 74,
  'Sergio Garcia': 75,
  'Naoyuki Kataoka': 76,
  'Danny Willett': 77,
  'Charl Schwartzel': 78,
  'Dustin Johnson': 79,
  'Bubba Watson': 80,
  'Vijay Singh': 81,
  'Angel Cabrera': 82,
  'Jose Maria Olazabal': 83,
  'Mike Weir': 84,
  'Fifa Laopakdee': 85,
  'Fred Couples': 86,
  'Ethan Fang': 87,
  'Mason Howell': 88,
  'Mateo Pulcini': 89,
  'Brandon Holtz': 90,
  'Jackson Herrington': 91,
});

function slugify(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'masters-player';
}

function buildOfficial2026Field() {
  const tierKeys = ['A', 'B', 'C', 'D', 'E', 'F'];
  const tierSizes = [16, 16, 16, 15, 15, 15];
  let cursor = 0;
  const rankedInvitees = OFFICIAL_2026_INVITEES
    .map((name, index) => ({
      name,
      officialOrder: index + 1,
      worldRanking: Object.prototype.hasOwnProperty.call(OFFICIAL_2026_WORLD_RANKINGS, name)
        ? OFFICIAL_2026_WORLD_RANKINGS[name]
        : null,
    }))
    .sort((left, right) => {
      const leftRank = Number.isFinite(left.worldRanking) ? left.worldRanking : Number.POSITIVE_INFINITY;
      const rightRank = Number.isFinite(right.worldRanking) ? right.worldRanking : Number.POSITIVE_INFINITY;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return left.name.localeCompare(right.name);
    });

  const rows = [];
  tierSizes.forEach((size, tierIndex) => {
    const tierKey = tierKeys[tierIndex];
    rankedInvitees.slice(cursor, cursor + size).forEach((player, index) => {
      rows.push({
        golferId: slugify(player.name),
        name: player.name,
        shortName: player.name.split(' ').slice(-1)[0],
        seed: rows.length + 1,
        tierKey,
        worldRanking: player.worldRanking,
        bettingOdds: '',
        status: 'active',
        metadata: {
          source: 'masters.com 2026 invitees + OWGR event field',
          officialOrder: player.officialOrder,
          tierOrder: index + 1,
          fieldQualifiedAsOf: '2026-04-05',
          rankingWeek: 'Week 15 - 12 April 2026',
        },
      });
    });
    cursor += size;
  });
  return rows;
}

function buildDefaultTiers() {
  return ['A', 'B', 'C', 'D', 'E', 'F'].map((key, index) => ({
    key,
    label: `Tier ${key}`,
    order: index + 1,
  }));
}

module.exports = {
  OFFICIAL_2026_INVITEES,
  OFFICIAL_2026_WORLD_RANKINGS,
  buildDefaultTiers,
  buildOfficial2026Field,
};
