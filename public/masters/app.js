(function () {
  function $(id) { return document.getElementById(id); }
  function getPoolId() { try { return String(new URLSearchParams(window.location.search).get('poolId') || '').trim(); } catch { return ''; } }
  function getParam(name) { try { return String(new URLSearchParams(window.location.search).get(name) || '').trim(); } catch { return ''; } }
  function setStatus(node, message, tone) { if (!node) return; node.className = tone || 'muted'; node.textContent = message || ''; }
  function escapeHtml(value) { return String(value == null ? '' : value).replace(/[&<>"]/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[char])); }
  function currency(value) { const num = Number(value); return Number.isFinite(num) ? num.toLocaleString(undefined, { style:'currency', currency:'USD' }) : '$0.00'; }
  function formatDateTimeLocal(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return offsetDate.toISOString().slice(0, 16);
  }
  function readLocal(key, fallback = '') { try { return window.localStorage.getItem(key) || fallback; } catch { return fallback; } }
  function writeLocal(key, value) { try { if (value) window.localStorage.setItem(key, value); } catch {} }
  function syncCompactMode() {
    const compact = window.matchMedia('(max-width: 768px)').matches || window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    document.body.classList.toggle('compact-mode', compact);
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, options);
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      const message = payload && typeof payload === 'object' ? (payload.error || payload.message) : String(payload || 'Request failed');
      throw new Error(message || 'Request failed');
    }
    return payload;
  }

  function buildNav(poolId, active) {
    const pages = poolId
      ? [['Overview', '/masters'], ['Join', '/masters/join'], ['Rules', '/masters/rules'], ['Live', '/masters/live'], ['Admin', '/masters/admin'], ['Results', '/masters/results']]
      : [['Overview', '/masters'], ['Create', '/masters/create'], ['Rules', '/masters/rules']];
    return pages.map(([label, href]) => {
      const url = poolId && href !== '/masters/create' ? `${href}?poolId=${encodeURIComponent(poolId)}` : href;
      return `<a class="nav-link ${active === href ? 'active' : ''}" href="${url}">${escapeHtml(label)}</a>`;
    }).join('');
  }

  function renderRulesContent(target, poolId) {
    if (!target) return;
    const picksHref = poolId ? `/masters/join?poolId=${encodeURIComponent(poolId)}` : '/masters/join';
    target.innerHTML = `<div class="stack">
      <div class="inline-note">Quick version: enter the pool code, pick exactly 1 golfer from each tier, submit before lock, and your lineup score is the sum of all golfer points from the real Masters tournament.</div>
      <div class="grid-2">
        <div class="card">
          <div class="section-label">How To Pick</div>
          <div>Pick exactly 1 golfer from every tier.</div>
          <div>You cannot submit an incomplete entry.</div>
          <div>No duplicate golfer picks are allowed in the same lineup.</div>
          <div>Picks become read-only once the pool locks.</div>
        </div>
        <div class="card">
          <div class="section-label">Payouts</div>
          <div>Each entrant pays $10.</div>
          <div>The total pot updates automatically from the number of paid entries.</div>
          <div>Only 1st, 2nd, and 3rd place get paid.</div>
        </div>
      </div>
      <div class="card">
        <div class="section-label">Round 1</div>
        <div>1st place: 8 points</div>
        <div>2nd to 3rd: 6 points</div>
        <div>4th to 8th: 4 points</div>
        <div>9th to 16th: 2 points</div>
        <div>17th or worse: 0 points</div>
      </div>
      <div class="card">
        <div class="section-label">Round 2</div>
        <div>Made the cut: 10 points</div>
        <div>Missed the cut: 0 points</div>
        <div>Top 10 after Round 2: +3 bonus points</div>
        <div>Leader after Round 2: +5 bonus points</div>
      </div>
      <div class="card">
        <div class="section-label">Round 3</div>
        <div>1st after Round 3: 12 points</div>
        <div>2nd to 3rd: 9 points</div>
        <div>4th to 8th: 6 points</div>
        <div>9th to 16th: 3 points</div>
        <div>Made cut but outside top 16: 1 point</div>
      </div>
      <div class="card">
        <div class="section-label">Round 4</div>
        <div>Winner: 20 points</div>
        <div>2nd place: 15 points</div>
        <div>3rd place: 12 points</div>
        <div>4th to 5th: 9 points</div>
        <div>6th to 10th: 6 points</div>
        <div>11th to 16th: 3 points</div>
        <div>Outside top 16: 1 point</div>
      </div>
      <div class="card">
        <div class="section-label">Tiebreakers</div>
        <div>1. Highest total points</div>
        <div>2. Most Sunday points</div>
        <div>3. Most golfers who made the cut</div>
        <div>4. Best single golfer finish</div>
        <div>5. Earliest valid submission timestamp</div>
      </div>
      <div class="actions-row">
        <a class="button-link primary" href="${picksHref}">Make Picks</a>
      </div>
    </div>`;
  }

  function renderHero(target, summary, activePath, subtitle) {
    if (!target) return;
    const autoLockAt = summary.pool.lockState && summary.pool.lockState.autoLockAt ? new Date(summary.pool.lockState.autoLockAt) : null;
    const lockCopy = summary.pool.isLocked
      ? (summary.pool.lockState && summary.pool.lockState.reason) || 'Locked'
      : (autoLockAt && !Number.isNaN(autoLockAt.getTime()) ? `Open until ${autoLockAt.toLocaleString()}` : 'Open');
    target.innerHTML = `<div class="hero-row"><div class="stack"><div class="eyebrow">${escapeHtml(summary.pool.tournamentName)} ${escapeHtml(summary.pool.season)}</div><h1>${escapeHtml(summary.pool.name)}</h1><div class="muted">${escapeHtml(subtitle)}</div><div class="muted">${escapeHtml(lockCopy)}</div></div><div class="stack" style="align-items:flex-end;"><div class="pill-row"><span class="pill">${escapeHtml(summary.pool.poolFormat || 'tiered_picks')}</span><span class="pill">${summary.pool.isLocked ? 'Locked' : 'Open'}</span><span class="pill">Round ${escapeHtml(String(summary.bracket.latestCompletedRound || 0))}</span></div><div class="nav-row">${buildNav(summary.pool._id, activePath)}</div></div></div>`;
  }

  function renderMetrics(target, summary) {
    if (!target) return;
    const tierRules = summary.pool.tierRules || { tierCount: 6, picksPerTier: 1 };
    const lineupRules = summary.pool.lineupRules || { countMode: 'all', bestX: null };
    target.innerHTML = `<div class="grid-4">
      <div class="metric"><strong>Total Pot</strong><div class="metric-value">${escapeHtml(currency(summary.payouts.totalPot))}</div><div class="muted">${summary.payouts.totalEntries} paid entries at ${escapeHtml(currency(summary.pool.entryFee))}</div></div>
      <div class="metric"><strong>Tier Format</strong><div class="metric-value">${escapeHtml(String(tierRules.tierCount || 6))} x ${escapeHtml(String(tierRules.picksPerTier || 1))}</div><div class="muted">Pick ${tierRules.picksPerTier || 1} golfer from each tier.</div></div>
      <div class="metric"><strong>Lineup Counting</strong><div class="metric-value">${escapeHtml(lineupRules.countMode === 'best_x' ? `Best ${lineupRules.bestX || ''}` : 'All Golfers')}</div><div class="muted">Pool rule applied to round scoring totals.</div></div>
      <div class="metric"><strong>Payout Spots</strong><div class="metric-value">3</div><div class="muted">1st, 2nd, and 3rd only.</div></div>
    </div>`;
  }

  function renderPayouts(target, summary) {
    if (!target) return;
    target.innerHTML = `<div class="grid-3">${summary.payouts.rows.map((row) => `<div class="card"><div class="card-head"><h3>${escapeHtml(row.label)}</h3><span class="pill">${escapeHtml(currency(row.amount))}</span></div><div class="muted">${row.mode === 'percentage' ? `${row.value}% of pot` : 'Fixed amount'}</div><div>${escapeHtml(row.entrantName || 'Not settled yet')}</div></div>`).join('')}</div>`;
  }

  function renderTierBoards(target, summary) {
    if (!target) return;
    target.innerHTML = `<div class="grid-2">${(summary.tiers || []).map((tier) => {
      const activeCount = tier.golfers.filter((golfer) => golfer.status === 'active').length;
      const cutCount = tier.golfers.filter((golfer) => golfer.status === 'missed_cut').length;
      const withdrewCount = tier.golfers.filter((golfer) => golfer.status === 'withdrew').length;
      const finishedCount = tier.golfers.filter((golfer) => golfer.status === 'finished').length;
      const leaders = tier.golfers.slice().sort((left, right) => Number(right.cumulative[4] || 0) - Number(left.cumulative[4] || 0)).slice(0, 3);
      return `<div class="panel"><div class="card-head"><div><div class="section-label">${escapeHtml(tier.label)}</div><div class="muted">${tier.golfers.length} golfers</div></div></div><div class="grid-4"><div class="metric"><strong>Active</strong><div class="metric-value">${activeCount}</div></div><div class="metric"><strong>Missed Cut</strong><div class="metric-value">${cutCount}</div></div><div class="metric"><strong>Withdrew</strong><div class="metric-value">${withdrewCount}</div></div><div class="metric"><strong>Finished</strong><div class="metric-value">${finishedCount}</div></div></div><div class="inline-note">Top scorers: ${leaders.map((golfer) => `${escapeHtml(golfer.name)} (${golfer.cumulative[4] || 0})`).join(' | ') || 'No scoring yet'}</div><details class="tier-details"><summary>View Tier Golfers</summary><div class="stack">${tier.golfers.map((golfer) => `<div class="contestant ${golfer.status === 'missed_cut' ? 'cut' : ''}"><div class="contestant-head"><strong>${escapeHtml(golfer.name)}</strong><span class="muted">${escapeHtml(golfer.tierKey)}</span></div><div class="muted">World rank ${escapeHtml(golfer.worldRanking || '-')} | R1 ${golfer.perRound[1]} | R2 ${golfer.perRound[2]} | R3 ${golfer.perRound[3]} | R4 ${golfer.perRound[4]}</div><div class="muted">Total ${golfer.cumulative[4]} | Status ${escapeHtml(golfer.status)}</div></div>`).join('')}</div></details></div>`;
    }).join('')}</div>`;
  }

  function renderLeaderboard(target, summary) {
    if (!target) return;
    target.innerHTML = `<div class="stack">${summary.leaderboard.length ? summary.leaderboard.map((row) => {
      const topPick = row.golferBreakdown.slice().sort((left, right) => Number(right.cumulative[4] || 0) - Number(left.cumulative[4] || 0))[0];
      return `<div class="card ${row.rank <= 3 ? 'top-3' : ''}"><div class="card-head"><div><strong>${escapeHtml(`${row.rank}. ${row.entrantName}`)}</strong><div class="muted">${row.payout ? escapeHtml(currency(row.payout.amount)) : 'No payout yet'} | Submitted ${escapeHtml(new Date(row.submittedAt).toLocaleString())}</div></div><div><strong>${escapeHtml(String(row.totalPoints))}</strong><div class="muted">Total</div></div></div><div class="grid-4"><div class="metric"><strong>R1</strong><div class="metric-value">${escapeHtml(String(row.roundTotals[1] || 0))}</div></div><div class="metric"><strong>R2</strong><div class="metric-value">${escapeHtml(String(row.roundTotals[2] || 0))}</div></div><div class="metric"><strong>R3</strong><div class="metric-value">${escapeHtml(String(row.roundTotals[3] || 0))}</div></div><div class="metric"><strong>R4</strong><div class="metric-value">${escapeHtml(String(row.roundTotals[4] || 0))}</div></div></div><div class="muted">Sunday points ${row.sundayPoints} | Made cut ${row.madeCutCount} | Best finish ${Number.isFinite(row.bestSingleGolferFinish) ? row.bestSingleGolferFinish : '-'} | Top pick ${topPick ? `${escapeHtml(topPick.name)} (${topPick.cumulative[4] || 0})` : '-'}</div><details class="tier-details"><summary>View Entrant Picks</summary><div class="grid-2">${row.golferBreakdown.map((golfer) => `<div class="contestant ${golfer.status === 'missed_cut' ? 'cut' : ''}"><div class="contestant-head"><strong>${escapeHtml(golfer.name)}</strong><span class="muted">${escapeHtml(golfer.tierKey)}</span></div><div class="muted">R1 ${golfer.perRound[1]} | R2 ${golfer.perRound[2]} | R3 ${golfer.perRound[3]} | R4 ${golfer.perRound[4]}</div><div class="muted">Total ${golfer.cumulative[4]} | ${escapeHtml(golfer.status)}</div></div>`).join('')}</div></details></div>`;
    }).join('') : '<div class="inline-note">No entries yet.</div>'}</div>`;
  }

  function renderAdminPoolList(target, pools, activePoolId) {
    if (!target) return;
    if (!pools.length) {
      target.innerHTML = '<div class="inline-note">No pools found.</div>';
      return;
    }
    target.innerHTML = pools.map((pool) => `<div class="card ${String(pool.id) === String(activePoolId) ? 'top-3' : ''}"><div class="card-head"><div><strong>${escapeHtml(pool.name)}</strong><div class="muted">${escapeHtml(pool.status || 'draft')} | ${pool.totalEntries || 0} entries | ${escapeHtml(currency(pool.totalPot || 0))}</div></div><div class="actions-row"><a class="button-link" href="/masters/admin?poolId=${encodeURIComponent(pool.id)}">Open</a><button type="button" data-admin-delete-pool="${escapeHtml(pool.id)}">Delete</button></div></div></div>`).join('');
  }

  function buildFieldEditor(container, summary) {
    if (!container) return;
    const rows = (summary.pool.golfers || []).slice().sort((a, b) => a.seed - b.seed);
    const tiers = (summary.pool.tiers || []).slice().sort((a, b) => a.order - b.order);
    container.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Order</th><th>Golfer</th><th>Short</th><th>Tier</th><th>World Rank</th><th>Odds</th><th>Status</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${row.seed}</td><td><input data-golfer-name="${row.seed}" value="${escapeHtml(row.name)}"></td><td><input data-golfer-short="${row.seed}" value="${escapeHtml(row.shortName || '')}"></td><td><select data-golfer-tier="${row.seed}">${tiers.map((tier) => `<option value="${escapeHtml(tier.key)}" ${tier.key === row.tierKey ? 'selected' : ''}>${escapeHtml(tier.label)}</option>`).join('')}</select></td><td><input data-golfer-rank="${row.seed}" type="number" value="${escapeHtml(row.worldRanking || '')}"></td><td><input data-golfer-odds="${row.seed}" value="${escapeHtml(row.bettingOdds || '')}"></td><td><select data-golfer-status="${row.seed}"><option value="active" ${row.status === 'active' ? 'selected' : ''}>active</option><option value="withdrew" ${row.status === 'withdrew' ? 'selected' : ''}>withdrew</option><option value="missed_cut" ${row.status === 'missed_cut' ? 'selected' : ''}>missed cut</option><option value="finished" ${row.status === 'finished' ? 'selected' : ''}>finished</option></select></td></tr>`).join('')}</tbody></table></div>`;
  }

  function buildTierEditor(container, tiers) {
    if (!container) return;
    const rows = (tiers || []).slice().sort((a, b) => a.order - b.order);
    container.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Order</th><th>Key</th><th>Label</th></tr></thead><tbody>${rows.map((tier) => `<tr><td><input data-tier-order="${escapeHtml(tier.key)}" type="number" value="${escapeHtml(String(tier.order))}"></td><td>${escapeHtml(tier.key)}</td><td><input data-tier-label="${escapeHtml(tier.key)}" value="${escapeHtml(tier.label)}"></td></tr>`).join('')}</tbody></table></div>`;
  }

  function collectTiers(summary) {
    return (summary.pool.tiers || []).map((tier) => ({
      key: tier.key,
      label: String(document.querySelector(`[data-tier-label="${tier.key}"]`).value || '').trim(),
      order: Number(document.querySelector(`[data-tier-order="${tier.key}"]`).value || tier.order || 1),
    }));
  }

  function collectGolfers(summary) {
    return (summary.pool.golfers || []).map((golfer) => ({
      golferId: golfer.golferId,
      seed: golfer.seed,
      name: String(document.querySelector(`[data-golfer-name="${golfer.seed}"]`).value || '').trim(),
      shortName: String(document.querySelector(`[data-golfer-short="${golfer.seed}"]`).value || '').trim(),
      tierKey: String(document.querySelector(`[data-golfer-tier="${golfer.seed}"]`).value || golfer.tierKey || '').trim(),
      worldRanking: document.querySelector(`[data-golfer-rank="${golfer.seed}"]`).value ? Number(document.querySelector(`[data-golfer-rank="${golfer.seed}"]`).value) : null,
      bettingOdds: String(document.querySelector(`[data-golfer-odds="${golfer.seed}"]`).value || '').trim(),
      status: String(document.querySelector(`[data-golfer-status="${golfer.seed}"]`).value || golfer.status || 'active').trim(),
      metadata: golfer.metadata || {},
    }));
  }

  function renderPickBuilder(target, summary, selectedByTier) {
    if (!target) return;
    const picksPerTier = Number((summary.pool.tierRules || {}).picksPerTier || 1);
    target.innerHTML = (summary.tiers || []).map((tier) => {
      const selected = Array.isArray(selectedByTier[tier.key]) ? selectedByTier[tier.key] : [];
      return `<section class="panel"><div class="card-head"><div><div class="section-label">${escapeHtml(tier.label)}</div><div class="muted">Pick exactly ${picksPerTier} golfers</div></div><span class="pill">${selected.length} of ${picksPerTier}</span></div><div class="stack pick-stack">${tier.golfers.map((golfer) => `<label class="contestant pick-contestant ${selected.includes(golfer.golferId) ? 'winner' : ''}"><span class="pick-main"><span class="pick-head"><strong>${escapeHtml(golfer.name)}</strong><span class="pick-status muted">${escapeHtml(golfer.status)}</span></span><span class="pick-meta muted">WR ${escapeHtml(golfer.worldRanking || '-')}<span class="pick-meta-sep">•</span>Odds ${escapeHtml(golfer.bettingOdds || '-')}</span></span><input type="checkbox" data-tier-key="${escapeHtml(tier.key)}" value="${escapeHtml(golfer.golferId)}" ${selected.includes(golfer.golferId) ? 'checked' : ''}></label>`).join('')}</div></section>`;
    }).join('');
  }

  async function loadCurrentField() { return fetchJson('/api/masters-pools/field/current'); }

  async function initOverviewPage() {
    const status = $('pageStatus');
    try {
      const payload = await fetchJson('/api/masters-pools');
      const pools = payload.pools || [];
      $('hero').innerHTML = `<div class="hero-row"><div class="stack"><div class="eyebrow">Masters Pool</div><h1>Majors Pool</h1><div class="muted">Create a pool, share the pool code, and let everyone pick one golfer from each tier.</div></div><div class="nav-row">${buildNav(getPoolId(), '/masters')}</div></div>`;
      $('poolList').innerHTML = pools.length ? `<div class="grid-3">${pools.map((pool) => `<a class="card" href="/masters/live?poolId=${encodeURIComponent(pool.id)}"><div class="card-head"><strong>${escapeHtml(pool.name)}</strong><span class="pill">${escapeHtml(currency(pool.totalPot))}</span></div><div class="muted">${pool.totalEntries} entrants | ${escapeHtml(pool.poolFormat)} | Round ${pool.latestCompletedRound}</div></a>`).join('')}</div>` : '<div class="inline-note">No Masters pools exist yet.</div>';
      setStatus(status, `${pools.length} pool${pools.length === 1 ? '' : 's'} loaded.`, 'ok');
    } catch (error) { setStatus(status, error.message, 'bad'); }
  }

  async function initCreatePage() {
    const status = $('pageStatus');
    const templatePoolName = getParam('poolName');
    const templateSeason = Number(getParam('season') || 2026);
    $('hero').innerHTML = `<div class="hero-row"><div class="stack"><div class="eyebrow">Majors Pool</div><h1>Create Tiered Picks Pool</h1><div class="muted">Default setup uses six tiers and one golfer per tier. You can use this for the Masters or any other 2026 major.</div></div><div class="nav-row">${buildNav('', '/masters/create')}</div></div>`;
    try {
      const field = await loadCurrentField();
      const summary = { pool: { golfers: field.golfers || [], tiers: field.tiers || [{ key:'A', label:'Tier A', order:1 },{ key:'B', label:'Tier B', order:2 },{ key:'C', label:'Tier C', order:3 },{ key:'D', label:'Tier D', order:4 },{ key:'E', label:'Tier E', order:5 },{ key:'F', label:'Tier F', order:6 }] } };
      buildTierEditor($('tierTable'), summary.pool.tiers);
      buildFieldEditor($('seedTable'), summary);
      if ($('poolName') && templatePoolName) $('poolName').value = templatePoolName;
      if ($('season') && Number.isFinite(templateSeason)) $('season').value = templateSeason;
      if ($('round1StartsAt')) $('round1StartsAt').value = formatDateTimeLocal(summary.pool.round1StartsAt);
      $('createPoolForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
          const tiers = collectTiers(summary);
          const golfers = collectGolfers({ pool: { golfers: summary.pool.golfers, tiers } });
          const payload = {
            name: $('poolName').value,
            season: Number($('season').value || 2026),
            accessCode: $('accessCode').value,
            entryFee: Number($('entryFee').value || 10),
            expectedEntrants: Number($('expectedEntrants').value || 0),
            round1StartsAt: $('round1StartsAt').value || null,
            tiers,
            tierRules: { tierCount: tiers.length, picksPerTier: 1 },
            lineupRules: { countMode: $('lineupCountMode').value, bestX: $('bestX').value ? Number($('bestX').value) : null },
            payouts: [
              { position: 1, label: '1st Place', mode: $('payout1Mode').value, value: Number($('payout1').value || 0) },
              { position: 2, label: '2nd Place', mode: $('payout2Mode').value, value: Number($('payout2').value || 0) },
              { position: 3, label: '3rd Place', mode: $('payout3Mode').value, value: Number($('payout3').value || 0) },
            ],
            golfers,
          };
          const created = await fetchJson('/api/masters-pools', { method:'POST', headers:{ 'Content-Type':'application/json', 'x-admin-code': String($('adminCode').value || '').trim() }, body: JSON.stringify(payload) });
          window.location.href = `/masters/admin?poolId=${encodeURIComponent(created.pool._id)}`;
        } catch (error) { setStatus(status, error.message, 'bad'); }
      });
      setStatus(status, 'Official field loaded.', 'ok');
    } catch (error) { setStatus(status, error.message, 'bad'); }
  }

  async function initJoinPage() {
    const status = $('pageStatus');
    const poolId = getPoolId();
    if (!poolId) return setStatus(status, 'Select a pool first.', 'bad');
    try {
      const summary = await fetchJson(`/api/masters-pools/${encodeURIComponent(poolId)}`);
      const selectedByTier = {};
      renderHero($('hero'), summary, '/masters/join', 'Enter your name, add the pool code if required, and pick one golfer from each tier.');
      renderMetrics($('metrics'), summary);
      if ($('rulesLink')) $('rulesLink').href = `/masters/rules?poolId=${encodeURIComponent(poolId)}`;
      if ($('entrantName')) $('entrantName').value = readLocal('mastersPoolEntrantName', '');
      if ($('entrantEmail')) $('entrantEmail').value = readLocal('mastersPoolEntrantEmail', '');
      if ($('winningScoreGuess')) $('winningScoreGuess').value = readLocal('mastersPoolWinningScoreGuess', '');
      if ($('poolAccessCodeWrap')) $('poolAccessCodeWrap').classList.toggle('hidden', !summary.pool.accessCode);
      if ($('joinHelp')) $('joinHelp').textContent = summary.pool.accessCode
        ? 'Only your name, pool code, and picks are required.'
        : 'Only your name and picks are required.';
      renderPickBuilder($('pickBuilder'), summary, selectedByTier);
      if (summary.pool.isLocked) {
        $('joinForm').querySelectorAll('input, button').forEach((node) => {
          if (node.id !== 'rulesLink') node.disabled = true;
        });
        setStatus(status, (summary.pool.lockState && summary.pool.lockState.reason) || 'Pool is locked.', 'bad');
        return;
      }
      $('pickBuilder').addEventListener('change', (event) => {
        const input = event.target.closest('input[type="checkbox"][data-tier-key]');
        if (!input) return;
        const tierKey = input.getAttribute('data-tier-key');
        const picksPerTier = Number((summary.pool.tierRules || {}).picksPerTier || 1);
        const selected = Array.from($('pickBuilder').querySelectorAll(`input[type="checkbox"][data-tier-key="${tierKey}"]:checked`)).map((node) => node.value);
        if (selected.length > picksPerTier) {
          input.checked = false;
          setStatus(status, `Tier ${tierKey} allows exactly ${picksPerTier} golfers.`, 'bad');
          return;
        }
        selectedByTier[tierKey] = selected;
        setStatus(status, '', 'muted');
      });
      $('joinForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
          const picks = Object.entries(selectedByTier).flatMap(([tierKey, golferIds]) => (golferIds || []).map((golferId) => ({ tierKey, golferId })));
          const entrantName = String($('entrantName').value || '').trim();
          const entrantEmail = String($('entrantEmail').value || '').trim();
          const winningScoreGuess = String($('winningScoreGuess').value || '').trim();
          writeLocal('mastersPoolEntrantName', entrantName);
          writeLocal('mastersPoolEntrantEmail', entrantEmail);
          writeLocal('mastersPoolWinningScoreGuess', winningScoreGuess);
          await fetchJson(`/api/masters-pools/${encodeURIComponent(poolId)}/join`, {
            method:'POST',
            headers:{ 'Content-Type':'application/json' },
            body: JSON.stringify({
              entrantName,
              email: entrantEmail,
              accessCode: $('poolAccessCode').value,
              predictedWinningScoreToPar: winningScoreGuess ? Number(winningScoreGuess) : null,
              picks,
            }),
          });
          window.location.href = `/masters/live?poolId=${encodeURIComponent(poolId)}`;
        } catch (error) { setStatus(status, error.message, 'bad'); }
      });
      setStatus(status, 'Pool loaded.', 'ok');
    } catch (error) { setStatus(status, error.message, 'bad'); }
  }

  async function initLivePage() {
    const status = $('pageStatus');
    const poolId = getPoolId();
    if (!poolId) return setStatus(status, 'Select a pool first.', 'bad');
    try {
      const summary = await fetchJson(`/api/masters-pools/${encodeURIComponent(poolId)}`);
      renderHero($('hero'), summary, '/masters/live', 'Live tier pool standings with round-by-round lineup scoring.');
      renderMetrics($('metrics'), summary);
      renderPayouts($('payouts'), summary);
      renderTierBoards($('bracket'), summary);
      renderLeaderboard($('leaderboard'), summary);
      setStatus(status, 'Live view updated.', 'ok');
    } catch (error) { setStatus(status, error.message, 'bad'); }
  }

  async function initResultsPage() {
    const status = $('pageStatus');
    const poolId = getPoolId();
    if (!poolId) return setStatus(status, 'Select a pool first.', 'bad');
    try {
      const summary = await fetchJson(`/api/masters-pools/${encodeURIComponent(poolId)}`);
      renderHero($('hero'), summary, '/masters/results', 'Final payouts and completed tier pool standings.');
      renderPayouts($('payouts'), summary);
      renderTierBoards($('bracket'), summary);
      renderLeaderboard($('leaderboard'), summary);
      setStatus(status, 'Results view loaded.', 'ok');
    } catch (error) { setStatus(status, error.message, 'bad'); }
  }

  async function initRulesPage() {
    const status = $('pageStatus');
    const poolId = getPoolId();
    try {
      if (poolId) {
        const summary = await fetchJson(`/api/masters-pools/${encodeURIComponent(poolId)}`);
        renderHero($('hero'), summary, '/masters/rules', 'Quick rules for how to pick and how scoring works.');
        renderRulesContent($('rulesContent'), poolId);
      } else {
        $('hero').innerHTML = `<div class="hero-row"><div class="stack"><div class="eyebrow">Masters Pool</div><h1>Pool Rules</h1><div class="muted">Quick rules for how to pick and how scoring works.</div></div><div class="nav-row">${buildNav('', '/masters/rules')}</div></div>`;
        renderRulesContent($('rulesContent'), '');
      }
      setStatus(status, 'Rules loaded.', 'ok');
    } catch (error) { setStatus(status, error.message, 'bad'); }
  }

  async function initAdminPage() {
    const status = $('pageStatus');
    const poolId = getPoolId();
    if (!poolId) return setStatus(status, 'Create or select a pool first.', 'bad');
    const roundPicker = $('roundPicker');
    let summary = null;
    let allPools = [];

    async function loadPoolList() {
      const payload = await fetchJson('/api/masters-pools');
      allPools = payload.pools || [];
      renderAdminPoolList($('adminPoolList'), allPools, poolId);
    }

    function renderRoundEditor() {
      const round = (summary.pool.roundResults || []).find((row) => Number(row.round) === Number(roundPicker.value || 1)) || { golfers: [] };
      const byId = new Map((round.golfers || []).map((golfer) => [golfer.golferId, golfer]));
      $('roundEditor').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Golfer</th><th>Tier</th><th>Position</th><th>Made Cut</th><th>Status</th><th>Score To Par</th></tr></thead><tbody>${(summary.pool.golfers || []).map((golfer) => {
        const existing = byId.get(golfer.golferId) || {};
        return `<tr><td>${escapeHtml(golfer.name)}</td><td>${escapeHtml(golfer.tierKey)}</td><td><input data-round-pos="${golfer.golferId}" type="number" value="${escapeHtml(existing.position || '')}"></td><td><input data-round-cut="${golfer.golferId}" type="checkbox" ${existing.madeCut ? 'checked' : ''}></td><td><select data-round-status="${golfer.golferId}"><option value="active" ${String(existing.status || golfer.status) === 'active' ? 'selected' : ''}>active</option><option value="withdrew" ${String(existing.status || golfer.status) === 'withdrew' ? 'selected' : ''}>withdrew</option><option value="missed_cut" ${String(existing.status || golfer.status) === 'missed_cut' ? 'selected' : ''}>missed cut</option><option value="finished" ${String(existing.status || golfer.status) === 'finished' ? 'selected' : ''}>finished</option></select></td><td><input data-round-score="${golfer.golferId}" type="number" value="${escapeHtml(existing.scoreToPar || '')}"></td></tr>`;
      }).join('')}</tbody></table></div>`;
    }

    async function loadSummary() {
      summary = await fetchJson(`/api/masters-pools/${encodeURIComponent(poolId)}`);
      await loadPoolList();
      renderHero($('hero'), summary, '/masters/admin', 'Edit tiers, field metadata, pool code, lineup rules, and round scoring.');
      renderMetrics($('metrics'), summary);
      buildTierEditor($('tierTable'), summary.pool.tiers || []);
      buildFieldEditor($('seedTable'), summary);
      renderTierBoards($('tierBoard'), summary);
      renderPayouts($('payouts'), summary);
      renderRoundEditor();
      const audit = await fetchJson(`/api/masters-pools/${encodeURIComponent(poolId)}/audit-log`);
      $('auditLog').innerHTML = audit.rows.length ? audit.rows.map((row) => `<div class="card"><div class="card-head"><strong>${escapeHtml(row.summary || row.action)}</strong><span class="muted">${escapeHtml(new Date(row.timestamp).toLocaleString())}</span></div><div class="muted">${escapeHtml(row.actor)} via ${escapeHtml(row.method || 'SYSTEM')}</div></div>`).join('') : '<div class="inline-note">No audit entries yet.</div>';
      $('poolName').value = summary.pool.name || '';
      $('accessCode').value = summary.pool.accessCode || '';
      $('entryFee').value = summary.pool.entryFee || 10;
      $('expectedEntrants').value = summary.pool.expectedEntrants || 0;
      $('round1StartsAt').value = formatDateTimeLocal(summary.pool.round1StartsAt);
      $('lineupCountMode').value = (summary.pool.lineupRules || {}).countMode || 'all';
      $('bestX').value = (summary.pool.lineupRules || {}).bestX || '';
      const payout1 = summary.pool.payouts.find((row) => row.position === 1) || {};
      const payout2 = summary.pool.payouts.find((row) => row.position === 2) || {};
      const payout3 = summary.pool.payouts.find((row) => row.position === 3) || {};
      $('payout1').value = payout1.value || 0; $('payout2').value = payout2.value || 0; $('payout3').value = payout3.value || 0;
      $('payout1Mode').value = payout1.mode || 'percentage'; $('payout2Mode').value = payout2.mode || 'percentage'; $('payout3Mode').value = payout3.mode || 'percentage';
      $('lockPool').textContent = summary.pool.manualIsLocked ? 'Unlock Pool' : 'Lock Pool';
    }

    $('adminPoolList').addEventListener('click', async (event) => {
      const button = event.target.closest('[data-admin-delete-pool]');
      if (!button) return;
      try {
        const adminCode = String($('adminCode').value || '').trim();
        if (!adminCode) throw new Error('Admin code required.');
        const targetPoolId = button.getAttribute('data-admin-delete-pool');
        const targetPool = allPools.find((pool) => String(pool.id) === String(targetPoolId));
        const confirmed = window.confirm(`Delete pool "${targetPool ? targetPool.name : targetPoolId}"? This removes the pool, entries, and audit log.`);
        if (!confirmed) return;
        await fetchJson(`/api/masters-pools/${encodeURIComponent(targetPoolId)}`, {
          method: 'DELETE',
          headers: { 'x-admin-code': adminCode },
        });
        if (String(targetPoolId) === String(poolId)) {
          window.location.href = '/masters';
          return;
        }
        await loadPoolList();
        setStatus(status, 'Pool deleted.', 'ok');
      } catch (error) { setStatus(status, error.message, 'bad'); }
    });

    roundPicker.addEventListener('change', () => { if (summary) renderRoundEditor(); });

    $('saveSettings').addEventListener('click', async () => {
      try {
        await fetchJson(`/api/masters-pools/${encodeURIComponent(poolId)}`, {
          method:'PUT',
          headers:{ 'Content-Type':'application/json', 'x-admin-code': String($('adminCode').value || '').trim() },
          body: JSON.stringify({
            name: $('poolName').value,
            accessCode: $('accessCode').value,
            entryFee: Number($('entryFee').value || 10),
            expectedEntrants: Number($('expectedEntrants').value || 0),
            round1StartsAt: $('round1StartsAt').value || null,
            tiers: collectTiers(summary),
            tierRules: { tierCount: (summary.pool.tiers || []).length, picksPerTier: 1 },
            lineupRules: { countMode: $('lineupCountMode').value, bestX: $('bestX').value ? Number($('bestX').value) : null },
            payouts: [
              { position: 1, label: '1st Place', mode: $('payout1Mode').value, value: Number($('payout1').value || 0) },
              { position: 2, label: '2nd Place', mode: $('payout2Mode').value, value: Number($('payout2').value || 0) },
              { position: 3, label: '3rd Place', mode: $('payout3Mode').value, value: Number($('payout3').value || 0) },
            ],
            golfers: collectGolfers(summary),
          }),
        });
        await loadSummary();
        setStatus(status, 'Pool settings saved.', 'ok');
      } catch (error) { setStatus(status, error.message, 'bad'); }
    });

    $('saveRound').addEventListener('click', async () => {
      try {
        const round = Number(roundPicker.value || 1);
        const golfers = (summary.pool.golfers || []).map((golfer) => ({
          golferId: golfer.golferId,
          name: golfer.name,
          position: document.querySelector(`[data-round-pos="${golfer.golferId}"]`).value ? Number(document.querySelector(`[data-round-pos="${golfer.golferId}"]`).value) : null,
          madeCut: document.querySelector(`[data-round-cut="${golfer.golferId}"]`).checked,
          status: String(document.querySelector(`[data-round-status="${golfer.golferId}"]`).value || golfer.status || 'active'),
          scoreToPar: document.querySelector(`[data-round-score="${golfer.golferId}"]`).value ? Number(document.querySelector(`[data-round-score="${golfer.golferId}"]`).value) : null,
        }));
        await fetchJson(`/api/masters-pools/${encodeURIComponent(poolId)}/rounds/${round}`, {
          method:'PUT',
          headers:{ 'Content-Type':'application/json', 'x-admin-code': String($('adminCode').value || '').trim() },
          body: JSON.stringify({ status:'complete', actualWinningScoreToPar: round === 4 ? Number($('winningScoreActual').value || 0) : null, golfers }),
        });
        await loadSummary();
        setStatus(status, `Round ${round} saved.`, 'ok');
      } catch (error) { setStatus(status, error.message, 'bad'); }
    });

    $('recalcPool').addEventListener('click', async () => {
      try {
        await fetchJson(`/api/masters-pools/${encodeURIComponent(poolId)}/recalculate`, { method:'POST', headers:{ 'x-admin-code': String($('adminCode').value || '').trim() } });
        await loadSummary();
        setStatus(status, 'Pool recalculated.', 'ok');
      } catch (error) { setStatus(status, error.message, 'bad'); }
    });

    $('lockPool').addEventListener('click', async () => {
      try {
        const action = summary.pool.manualIsLocked ? 'unlock' : 'lock';
        await fetchJson(`/api/masters-pools/${encodeURIComponent(poolId)}/${action}`, {
          method:'POST',
          headers:{ 'Content-Type':'application/json', 'x-admin-code': String($('adminCode').value || '').trim() },
          body: JSON.stringify({ lockReason:'Masters tournament start' }),
        });
        await loadSummary();
        setStatus(status, action === 'lock' ? 'Pool locked.' : 'Pool unlocked.', 'ok');
      } catch (error) { setStatus(status, error.message, 'bad'); }
    });

    $('deletePool').addEventListener('click', async () => {
      try {
        const adminCode = String($('adminCode').value || '').trim();
        if (!adminCode) throw new Error('Admin code required.');
        const confirmed = window.confirm(`Delete pool "${summary.pool.name}"? This removes the pool, entries, and audit log.`);
        if (!confirmed) return;
        await fetchJson(`/api/masters-pools/${encodeURIComponent(poolId)}`, {
          method:'DELETE',
          headers:{ 'x-admin-code': adminCode },
        });
        window.location.href = '/masters';
      } catch (error) { setStatus(status, error.message, 'bad'); }
    });

    try { await loadSummary(); setStatus(status, 'Admin view ready.', 'ok'); } catch (error) { setStatus(status, error.message, 'bad'); }
  }

  document.addEventListener('DOMContentLoaded', () => {
    syncCompactMode();
    window.addEventListener('resize', syncCompactMode);
    const page = document.body.getAttribute('data-page');
    if (page === 'overview') initOverviewPage();
    if (page === 'create') initCreatePage();
    if (page === 'join') initJoinPage();
    if (page === 'rules') initRulesPage();
    if (page === 'live') initLivePage();
    if (page === 'results') initResultsPage();
    if (page === 'admin') initAdminPage();
  });
})();
