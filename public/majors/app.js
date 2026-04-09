(function () {
  const MAJORS = [
    {
      key: 'pga-championship',
      name: 'PGA Championship',
      season: 2026,
      week: 'May 11-17, 2026',
      competitionDates: 'Championship rounds: May 14-17',
      venue: 'Aronimink Golf Club',
      location: 'Newtown Square, Pennsylvania',
      description: 'The same tiered-picks setup works cleanly here: build your tiers, take one golfer from each tier, and let the full-tournament scoring decide the standings.',
      logo: 'https://pgachampionship.brightspotcdn.com/dims4/default/96e6dc4/2147483647/strip/true/crop/1201x1200+0+0/resize/140x140!/quality/90/?url=http%3A%2F%2Fgolf-brightspot.s3.us-east-1.amazonaws.com%2Fpga%2F62%2F4c%2Fb5e7ce2947d6b717691dfb647f33%2F26ch-aron-4c.png',
      hero: 'https://pgachampionship.brightspotcdn.com/dims4/default/2d3cea5/2147483647/strip/true/crop/6000x2917+0+542/resize/1440x700!/quality/90/?url=http%3A%2F%2Fgolf-brightspot.s3.us-east-1.amazonaws.com%2Fpga%2F80%2F6b%2F2b2f0f4441a28b74ee8b18e21224%2Fagc-250602-151.jpg',
      officialUrl: 'https://www.pgachampionship.com/2026',
      themeClass: 'theme-pga',
      poolName: '2026 PGA Championship Pool',
    },
    {
      key: 'us-open',
      name: 'U.S. Open',
      season: 2026,
      week: 'June 15-21, 2026',
      competitionDates: 'Championship rounds: June 18-21',
      venue: 'Shinnecock Hills Golf Club',
      location: 'Southampton, New York',
      description: 'This format stays casual-user friendly even for a major with a big field: one pick per tier, four rounds of scoring, and a clean live leaderboard.',
      logo: 'https://res.cloudinary.com/usga-single-app/image/upload/f_auto,fl_lossy,q_auto/c_fill,dpr_2.0,g_center/v1717591996/championships/logos/USO_Logo_FULL_COLOR_FINAL.png',
      hero: 'https://res.cloudinary.com/usga-single-app/image/upload/f_auto,fl_lossy,q_auto/c_fill,dpr_2.0,g_center/v1771360296/championships/usopen/images/2026/as-usopen-entries-open.jpg',
      officialUrl: 'https://www.usopen.com/',
      themeClass: 'theme-usopen',
      poolName: '2026 U.S. Open Pool',
    },
    {
      key: 'the-open',
      name: 'The Open',
      season: 2026,
      week: 'July 12-19, 2026',
      competitionDates: 'Championship rounds: July 16-19',
      venue: 'Royal Birkdale',
      location: 'Southport, Merseyside, England',
      description: 'The same majors pool structure carries over well to links golf: one golfer per tier, cumulative scoring across the week, and obvious top-3 payouts.',
      logo: 'https://www.theopen.com/-/media/images/logo-the-open-symbol.png',
      hero: 'https://www.theopen.com/-/media/images/logos/TheOpen_Poster.jpg',
      officialUrl: 'https://www.theopen.com/royal-birkdale-154th-open',
      themeClass: 'theme-open',
      poolName: '2026 The Open Pool',
    },
  ];

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
  }

  function createTemplateHref(poolName) {
    const params = new URLSearchParams();
    params.set('poolName', poolName);
    params.set('season', '2026');
    return `/masters/create?${params.toString()}`;
  }

  function renderCards() {
    const root = document.getElementById('majorsGrid');
    if (!root) return;
    root.innerHTML = MAJORS.map((major) => `
      <article class="major-card ${major.themeClass}">
        <div class="major-hero" style="background-image: linear-gradient(180deg, rgba(4, 12, 16, 0.16), rgba(4, 12, 16, 0.9)), url('${major.hero}')">
          <img class="major-logo" src="${major.logo}" alt="${escapeHtml(major.name)} logo" loading="lazy">
          <div class="major-headline">
            <div class="major-kicker">${escapeHtml(major.week)}</div>
            <h2>${escapeHtml(major.name)}</h2>
            <div class="major-subline">${escapeHtml(major.venue)} · ${escapeHtml(major.location)}</div>
          </div>
        </div>
        <div class="major-body">
          <div class="pill-row">
            <span class="pill">1 pick from each tier</span>
            <span class="pill">$10 entry</span>
            <span class="pill">Top 3 paid</span>
          </div>
          <p class="major-copy">${escapeHtml(major.description)}</p>
          <div class="detail-grid">
            <div class="detail">
              <span class="detail-label">Championship Week</span>
              <strong>${escapeHtml(major.week)}</strong>
            </div>
            <div class="detail">
              <span class="detail-label">Rounds</span>
              <strong>${escapeHtml(major.competitionDates)}</strong>
            </div>
            <div class="detail">
              <span class="detail-label">Pool Setup</span>
              <strong>Tiered picks, 4 rounds</strong>
            </div>
          </div>
          <div class="note">Starts from the current pool builder so you can reuse the same format and then set the field and tiers for this event.</div>
          <div class="actions-row">
            <a class="button-link primary" href="${createTemplateHref(major.poolName)}">Open Pool Builder</a>
            <a class="button-link" href="${major.officialUrl}" target="_blank" rel="noreferrer">Official Site</a>
          </div>
        </div>
      </article>
    `).join('');
  }

  document.addEventListener('DOMContentLoaded', renderCards);
})();
