// Register service worker for PWA support
if ('serviceWorker' in navigator) {
  let swControllerReloaded = false;
  const requestSwActivation = (reg) => {
    if (reg && reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  };
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/service-worker.js', { updateViaCache: 'none' })
      .then(reg => {
        console.log('Service Worker registered:', reg.scope);
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (swControllerReloaded) return;
          swControllerReloaded = true;
          window.location.reload();
        });
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              requestSwActivation(reg);
            }
          });
        });
        requestSwActivation(reg);
        reg.update().catch(() => {});
      })
      .catch(err => console.error('Service Worker registration failed:', err));
  });
}
/* public/script.js v3.13 — calendar view with date selection */
(() => {
  'use strict';
  const $ = (s, r=document) => r.querySelector(s);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  const debugFooter = $('#debugFooter');
  const debugLogsEl = $('#debugLogs');
  const showLogsBtn = $('[data-show-logs]');
  const closeLogsBtn = $('[data-close-logs]');
  let debugActive = (window.location.search || '').includes('debug=1');
  try {
    debugActive = debugActive || localStorage.getItem('debugLogs') === '1';
  } catch (_) {}

  function setDebugActive(on) {
    debugActive = !!on;
    try {
      if (debugActive) localStorage.setItem('debugLogs', '1');
      else localStorage.removeItem('debugLogs');
    } catch (_) {}
    if (debugFooter) debugFooter.style.display = debugActive ? 'block' : 'none';
    if (showLogsBtn) showLogsBtn.style.display = debugActive ? 'none' : '';
  }

  // Apply persisted debug state on load
  if (debugActive) setDebugActive(true);

  // Debug logging
  const debugLog = (type, message, data) => {
    if (!debugActive || !debugLogsEl) return;
    const timestamp = new Date().toLocaleTimeString();
    const color = type === 'error' ? '#ff6b6b' : type === 'success' ? '#51cf66' : type === 'warn' ? '#ffd43b' : '#74c0fc';
    const icon = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warn' ? '⚠️' : 'ℹ️';
    const logEntry = document.createElement('div');
    logEntry.style.cssText = `border-left:3px solid ${color};padding:4px 8px;margin:4px 0;background:rgba(255,255,255,0.05)`;
    logEntry.innerHTML = `<span style="color:#888">[${timestamp}]</span> ${icon} <strong style="color:${color}">${type.toUpperCase()}</strong>: ${message}${data ? `\n${JSON.stringify(data, null, 2)}` : ''}`;
    debugLogsEl.appendChild(logEntry);
    debugLogsEl.scrollTop = debugLogsEl.scrollHeight;
  };

  // Override console methods to capture logs
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  
  console.log = function(...args) {
    debugLog('info', args.join(' '));
    originalConsoleLog.apply(console, args);
  };
  
  console.error = function(...args) {
    debugLog('error', args.join(' '));
    originalConsoleError.apply(console, args);
  };
  
  console.warn = function(...args) {
    debugLog('warn', args.join(' '));
    originalConsoleWarn.apply(console, args);
  };

  on(showLogsBtn, 'click', (e) => {
    e.preventDefault();
    setDebugActive(true);
  });

  on(closeLogsBtn, 'click', (e) => {
    e.preventDefault();
    setDebugActive(false);
  });

  const eventsEl = $('#events');
  const modal = $('#eventModal');
  const eventForm = $('#eventForm');
  const newTeeBtn = $('#newTeeBtn');
  const newTeamBtn = $('#newTeamBtn');
  const createModeInput = $('#createMode');
  const teeTimeRow = $('#teeTimeRow');
  const teamSizeRow = $('#teamSizeRow');
  const subForm = $('#subscribeForm');
  const subMsg = $('#subMsg');
  const subscribeModal = $('#subscribeModal');
  const openSubscribeBtn = $('#openSubscribeBtn');
  const REFRESH_INTERVAL_MS = 60000;
  const RESUME_REFRESH_DEBOUNCE_MS = 1500;

  // Calendar elements
  const calendarGrid = $('#calendarGrid');
  const currentMonthEl = $('#currentMonth');
  const prevMonthBtn = $('#prevMonth');
  const nextMonthBtn = $('#nextMonth');
  const selectedDateTitle = $('#selectedDateTitle');
  const monthCalendarBtn = $('#monthCalendarBtn');
  const starterModeBtn = $('#starterModeBtn');
  const requestClubTimeBtn = $('#requestClubTimeBtn');
  const refreshBtn = $('#refreshBtn');
  const lastUpdatedEl = $('#lastUpdated');
  const mobileQuickBar = $('#mobileQuickBar');
  const mobileFilterBar = $('#mobileFilterBar');
  const mobileFilterStatus = $('#mobileFilterStatus');
  const requestClubTimeModal = $('#requestClubTimeModal');
  const requestClubTimeForm = $('#requestClubTimeForm');
  const requestClubDateInput = $('#requestClubDate');
  const requestClubPreferredTimeInput = $('#requestClubPreferredTime');
  const requestClubRequesterNameInput = $('#requestClubRequesterName');
  const requestClubNameOptions = $('#requestClubNameOptions');
  const subscribeScopeNote = $('#subscribeScopeNote');
  const STARTER_EVENT_PREFS_KEY = 'teeTimeStarterEventViews';

  // State
  let allEvents = []; // selected-day event cache
  let monthEventSummary = new Map();
  let loadedMonthKey = '';
  let currentDate = new Date();
  let selectedDate = null;
  let isLoading = false;
  let loadPending = false;
  let autoRefreshTimer = null;
  let lastUpdatedAt = null;
  let lastResumeRefreshAt = 0;
  let monthSummarySignature = '';
  let selectedDateEventsSignature = '';
  let selectedDateRequestSeq = 0;
  let activeMobileFilter = 'all';
  let starterMode = false;
  let teeDragState = null;
  let starterEventViewIds = loadStarterEventViewIds();
  const currentGroupSlug = (() => {
    try {
      const raw = String(new URLSearchParams(window.location.search).get('group') || '').trim().toLowerCase();
      const normalized = raw.replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
      return (normalized === 'thursday-seniors-group' ? 'seniors' : normalized) || 'main';
    } catch (_) {
      return 'main';
    }
  })();
  const defaultSiteProfile = {
    groupSlug: currentGroupSlug,
    siteTitle: 'Tee Times',
    shortTitle: 'Tee Time',
    groupName: currentGroupSlug === 'main' ? 'Knight Group Tee Times' : '',
    groupReference: currentGroupSlug === 'main' ? 'BRS Group' : '',
    clubName: 'the club',
    clubRequestLabel: 'Request a Tee Time',
    themeColor: '#173224',
    iconAssetName: 'knight-club-icon.png',
    iconPath: '/assets/knight-club-icon.png',
    features: {
      includeHandicaps: currentGroupSlug === 'main',
      includeTrips: currentGroupSlug === 'main',
      includeOutings: currentGroupSlug === 'main',
      includeNotifications: true,
      includeScheduler: true,
      includeBackups: currentGroupSlug === 'main',
    },
  };
  let currentSiteProfile = { ...defaultSiteProfile };
  let currentSiteLinks = {};
  const initialSelectedDateFromUrl = (() => {
    try {
      const dateISO = String(new URLSearchParams(window.location.search).get('date') || '').trim();
      return /^\d{4}-\d{2}-\d{2}$/.test(dateISO) ? dateISO : '';
    } catch (_) {
      return '';
    }
  })();

  const MOBILE_FILTER_LABELS = {
    all: 'All events',
    'open-spots': 'Open spots',
    'urgent-empty': 'Urgent empty',
    'blue-ridge': 'Blue Ridge only',
    'team-events': 'Team events',
  };

  function normalizeHexColor(value = '', fallback = '#173224') {
    const input = String(value || '').trim();
    if (/^#[0-9a-f]{3}$/i.test(input)) {
      return `#${input.slice(1).split('').map((part) => `${part}${part}`).join('').toLowerCase()}`;
    }
    if (/^#[0-9a-f]{6}$/i.test(input)) return input.toLowerCase();
    return fallback;
  }

  function shiftHexColor(hexColor, amount = 0) {
    const safe = normalizeHexColor(hexColor, '#173224').slice(1);
    const clamp = (value) => Math.max(0, Math.min(255, value));
    const adjust = (segment) => clamp(parseInt(segment, 16) + amount).toString(16).padStart(2, '0');
    return `#${adjust(safe.slice(0, 2))}${adjust(safe.slice(2, 4))}${adjust(safe.slice(4, 6))}`;
  }

  function resolveSiteIconPath(iconAssetName = '') {
    const safe = String(iconAssetName || '').trim();
    if (!safe) return '/assets/knight-club-icon.png';
    return safe.startsWith('/') ? safe : `/assets/${safe}`;
  }

  function buildGroupPageHref(pathname = '/') {
    try {
      const scopedUrl = new URL(pathname, window.location.origin);
      if (scopedUrl.origin === window.location.origin && currentGroupSlug !== 'main' && !scopedUrl.searchParams.has('group')) {
        scopedUrl.searchParams.set('group', currentGroupSlug);
      }
      return scopedUrl.origin === window.location.origin
        ? `${scopedUrl.pathname}${scopedUrl.search}${scopedUrl.hash}`
        : scopedUrl.toString();
    } catch (_) {
      return pathname;
    }
  }

  function siteFeatureEnabled(featureKey = '') {
    return !featureKey || !currentSiteProfile.features || currentSiteProfile.features[featureKey] !== false;
  }

  function clubContactLabel() {
    return String(currentSiteProfile.clubName || 'the club').trim() || 'the club';
  }

  function subscriptionGroupLabel() {
    return String(
      currentSiteProfile.groupReference
      || currentSiteProfile.groupName
      || currentSiteProfile.siteTitle
      || 'this group'
    ).trim() || 'this group';
  }

  function isMainGroupSite() {
    return currentGroupSlug === 'main';
  }

  function mobileFilterLabel(filterKey = '') {
    if (filterKey === 'blue-ridge' && !isMainGroupSite()) return 'Home course';
    return MOBILE_FILTER_LABELS[filterKey] || MOBILE_FILTER_LABELS.all;
  }

  function applySiteTheme(themeColor = '#173224') {
    const safeTheme = normalizeHexColor(themeColor, '#173224');
    const root = document.documentElement;
    root.style.setProperty('--golf-green-dark', shiftHexColor(safeTheme, -36));
    root.style.setProperty('--golf-green', safeTheme);
    root.style.setProperty('--golf-green-light', shiftHexColor(safeTheme, 24));
    root.style.setProperty('--golf-green-fairway', shiftHexColor(safeTheme, 54));
    root.style.setProperty('--golf-accent', shiftHexColor(safeTheme, 18));
    root.style.setProperty('--green-600', safeTheme);
    root.style.setProperty('--green-500', shiftHexColor(safeTheme, 20));
    root.style.setProperty('--green-700', shiftHexColor(safeTheme, -16));
  }

  function applySiteProfile(profile = {}, links = {}) {
    currentSiteProfile = {
      ...defaultSiteProfile,
      ...(profile || {}),
      themeColor: normalizeHexColor(profile && profile.themeColor, defaultSiteProfile.themeColor),
      iconPath: resolveSiteIconPath((profile && profile.iconPath) || (profile && profile.iconAssetName) || defaultSiteProfile.iconAssetName),
      features: {
        ...(defaultSiteProfile.features || {}),
        ...((profile && profile.features) || {}),
      },
    };
    currentSiteLinks = links && typeof links === 'object' ? links : {};

    document.title = currentSiteProfile.siteTitle || defaultSiteProfile.siteTitle;
    applySiteTheme(currentSiteProfile.themeColor);

    const topbarTitleLink = document.querySelector('.topbar-title-link');
    if (topbarTitleLink) {
      topbarTitleLink.textContent = currentSiteProfile.siteTitle || defaultSiteProfile.siteTitle;
      if (isMainGroupSite()) {
        topbarTitleLink.href = buildGroupPageHref('/');
        topbarTitleLink.title = 'Refresh to calendar view';
      } else {
        topbarTitleLink.removeAttribute('href');
        topbarTitleLink.removeAttribute('title');
      }
    }
    const topbarDropdown = document.querySelector('.topbar-dropdown');
    if (topbarDropdown) topbarDropdown.hidden = !isMainGroupSite();

    if (requestClubTimeBtn) {
      requestClubTimeBtn.textContent = currentSiteProfile.clubRequestLabel || defaultSiteProfile.clubRequestLabel;
      requestClubTimeBtn.title = `Request a tee time from ${clubContactLabel()}`;
    }

    document.querySelectorAll('[data-group-link]').forEach((node) => {
      const href = node.getAttribute('href') || '/';
      node.setAttribute('href', buildGroupPageHref(href));
    });
    document.querySelectorAll('[data-group-admin-link]').forEach((node) => {
      const isMainGroup = isMainGroupSite();
      const href = isMainGroup
        ? '/admin.html'
        : (currentSiteLinks.adminPath || `/groups/${encodeURIComponent(currentGroupSlug)}/admin`);
      node.setAttribute('href', href);
      node.textContent = isMainGroup ? 'Admin' : 'Group Admin';
    });
    document.querySelectorAll('[data-feature-link]').forEach((node) => {
      const featureKey = String(node.getAttribute('data-feature-link') || '').trim();
      node.hidden = !siteFeatureEnabled(featureKey);
    });
    document.querySelectorAll('[data-main-only-link]').forEach((node) => {
      node.hidden = !isMainGroupSite();
    });

    if (openSubscribeBtn) openSubscribeBtn.hidden = !siteFeatureEnabled('includeNotifications');
    if (subscribeScopeNote) {
      subscribeScopeNote.textContent = `This subscribes you to ${subscriptionGroupLabel()} email updates only. You can subscribe to other golf groups separately.`;
    }

    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute('content', currentSiteProfile.themeColor);
    const appleTitleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (appleTitleMeta) appleTitleMeta.setAttribute('content', currentSiteProfile.shortTitle || currentSiteProfile.siteTitle || defaultSiteProfile.shortTitle);
    const appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]');
    if (appleTouchIcon) appleTouchIcon.setAttribute('href', currentSiteProfile.iconPath);
  }

  async function initSiteProfile() {
    try {
      const payload = await api('/api/site-profile');
      applySiteProfile(payload && payload.profile ? payload.profile : {}, payload && payload.links ? payload.links : {});
    } catch (err) {
      console.warn('Failed to load site profile:', err);
      applySiteProfile(defaultSiteProfile, currentSiteLinks);
    }
  }

  if (initialSelectedDateFromUrl) {
    selectedDate = initialSelectedDateFromUrl;
    currentDate = new Date(`${initialSelectedDateFromUrl}T12:00:00`);
  }

  // Inject Edit dialog
  function ensureEditDialog(){
    if ($('#editModal')) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = `<dialog id="editModal">
      <form id="editForm" method="dialog">
        <h3>Edit Event</h3>
        <label>Course <input name="course" required></label>
        <label>Date <input name="date" type="date" required></label>
        <label>Mode
          <select id="editModeSelect" name="mode">
            <option value="tees">Tee times</option>
            <option value="teams">Teams</option>
          </select>
        </label>
        <div id="editTeamSizeRow">
          <label>Team size max <input name="teamSizeMax" type="number" min="2" max="4" value="4"></label>
        </div>
        <label>Notes <textarea name="notes" rows="3"></textarea></label>
        <input type="hidden" name="id">
        <menu>
          <button type="button" data-cancel>Cancel</button>
          <button type="submit" class="primary">Save</button>
        </menu>
      </form>
    </dialog>`;
    document.body.appendChild(wrap.firstElementChild);
  }
  function ensureAuditDialog(){
    if ($('#auditModal')) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = `<dialog id="auditModal" style="min-width:600px;max-width:800px">
      <h3>📋 Audit Log</h3>
      <div id="auditLogContent" style="max-height:500px;overflow-y:auto;margin:16px 0">
        <p style="color:var(--slate-700);text-align:center">Loading...</p>
      </div>
      <menu>
        <button type="button" data-cancel>Close</button>
      </menu>
    </dialog>`;
    document.body.appendChild(wrap.firstElementChild);
  }
  function ensureMoveDialog(){
    if ($('#moveModal')) return;
    const tpl = document.createElement('div');
    tpl.innerHTML = `<dialog id="moveModal">
      <form id="moveForm" method="dialog">
        <h3 id="moveTitle">Move Player</h3>
        <div id="moveChoices" style="display:grid;gap:8px;margin:8px 0;"></div>
        <input type="hidden" name="eventId">
        <input type="hidden" name="fromTeeId">
        <input type="hidden" name="playerId">
        <menu>
          <button type="button" data-cancel>Cancel</button>
          <button type="submit" class="primary">Move</button>
        </menu>
      </form>
    </dialog>`;
    document.body.appendChild(tpl.firstElementChild);
  }
  function ensureEditTeeDialog(){
    if ($('#editTeeModal')) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = `<dialog id="editTeeModal">
      <form id="editTeeForm" method="dialog">
        <h3 id="editTeeTitle">Edit</h3>
        <label>
          <span id="editTeeLabel">Name</span>
          <input id="editTeeInput" name="value" required>
          <select id="editTeeSelect" name="value" required style="display:none;"></select>
        </label>
        <input type="hidden" name="eventId">
        <input type="hidden" name="teeId">
        <input type="hidden" name="isTeam">
        <menu>
          <button type="button" data-cancel>Cancel</button>
          <button type="submit" class="primary">Save</button>
        </menu>
      </form>
    </dialog>`;
    document.body.appendChild(wrap.firstElementChild);
  }
  function ensureActionDialog(){
    if ($('#actionModal')) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = `<dialog id="actionModal" class="action-dialog">
      <form id="actionForm" method="dialog">
        <h3 id="actionDialogTitle">Action</h3>
        <p id="actionDialogMessage" class="dialog-message" hidden></p>
        <div id="actionDialogBody"></div>
        <div id="actionDialogFields" class="dialog-fields"></div>
        <p id="actionDialogHint" class="dialog-hint" hidden></p>
        <menu>
          <button type="button" data-cancel id="actionDialogCancelBtn">Cancel</button>
          <button type="submit" class="primary" id="actionDialogConfirmBtn">Continue</button>
        </menu>
      </form>
    </dialog>`;
    document.body.appendChild(wrap.firstElementChild);
  }
  function ensureToastHost(){
    if ($('#toastHost')) return;
    const host = document.createElement('div');
    host.id = 'toastHost';
    host.className = 'toast-stack';
    host.setAttribute('aria-live', 'polite');
    host.setAttribute('aria-atomic', 'true');
    document.body.appendChild(host);
  }
  ensureEditDialog();
  ensureMoveDialog();
  ensureEditTeeDialog();
  ensureAuditDialog();
  ensureActionDialog();
  ensureToastHost();

  const editModal = $('#editModal');
  const editForm = $('#editForm');
  const editModeSelect = $('#editModeSelect');
  const editTeamSizeRow = $('#editTeamSizeRow');
  const moveModal = $('#moveModal');
  const moveForm = $('#moveForm');
  const moveChoices = $('#moveChoices');
  const moveTitle = $('#moveTitle');
  const editTeeModal = $('#editTeeModal');
  const editTeeForm = $('#editTeeForm');
  const editTeeTitle = $('#editTeeTitle');
  const editTeeLabel = $('#editTeeLabel');
  const editTeeInput = $('#editTeeInput');
  const editTeeSelect = $('#editTeeSelect');
  const actionModal = $('#actionModal');
  const actionForm = $('#actionForm');
  const actionDialogTitle = $('#actionDialogTitle');
  const actionDialogMessage = $('#actionDialogMessage');
  const actionDialogBody = $('#actionDialogBody');
  const actionDialogFields = $('#actionDialogFields');
  const actionDialogHint = $('#actionDialogHint');
  const actionDialogCancelBtn = $('#actionDialogCancelBtn');
  const actionDialogConfirmBtn = $('#actionDialogConfirmBtn');
  const toastHost = $('#toastHost');

  if (!eventsEl) return;
  let actionDialogState = null;

  function updateLastUpdated(text){
    if (!lastUpdatedEl) return;
    lastUpdatedEl.textContent = text;
  }

  function stampLastUpdated(){
    lastUpdatedAt = new Date();
    updateLastUpdated(`Updated ${lastUpdatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
  }

  function buildRefreshSignature(value) {
    try {
      return JSON.stringify(value || null);
    } catch (_) {
      return '';
    }
  }

  function setLoading(isBusy){
    if (!refreshBtn) return;
    refreshBtn.disabled = !!isBusy;
    refreshBtn.textContent = isBusy ? 'Refreshing…' : 'Refresh';
  }

  function fmtDate(val){
    try{
      if (!val) return '—';
      const s = String(val);
      let d;
      if (/^\d{4}-\d{2}-\d{2}T/.test(s)) d = new Date(s);
      else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) d = new Date(s+'T12:00:00Z');
      else d = new Date(s);
      if (isNaN(d)) return '—';
      return d.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric', year:'numeric', timeZone:'UTC' });
    } catch { return '—'; }
  }
  function fmtTime(hhmm){ if(!hhmm) return ''; const m=/^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(hhmm); if(!m) return hhmm; let h=parseInt(m[1],10); const min=m[2]; const ap=h>=12?'PM':'AM'; h=h%12||12; return `${h}:${min} ${ap}`; }
  function escapeHtml(value = '') {
    return String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function renderActionField(field = {}) {
    const label = escapeHtml(field.label || '');
    const name = escapeHtml(field.name || '');
    const hint = field.hint ? `<span class="dialog-field-note">${escapeHtml(field.hint)}</span>` : '';
    if (field.type === 'select') {
      const options = Array.isArray(field.options) ? field.options : [];
      const currentValue = String(field.value ?? '');
      return `<label class="dialog-field">
        <span>${label}</span>
        <select name="${name}" ${field.required ? 'required' : ''}>
          ${options.map((option) => {
            const value = String(option && option.value != null ? option.value : '');
            const selected = value === currentValue ? ' selected' : '';
            return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(option && option.label != null ? option.label : value)}</option>`;
          }).join('')}
        </select>
        ${hint}
      </label>`;
    }
    if (field.type === 'textarea') {
      return `<label class="dialog-field">
        <span>${label}</span>
        <textarea name="${name}" rows="${Number(field.rows) || 3}" placeholder="${escapeHtml(field.placeholder || '')}" ${field.required ? 'required' : ''}>${escapeHtml(field.value || '')}</textarea>
        ${hint}
      </label>`;
    }
    const inputType = escapeHtml(field.type || 'text');
    const inputMode = field.inputMode ? ` inputmode="${escapeHtml(field.inputMode)}"` : '';
    const autoComplete = field.autocomplete ? ` autocomplete="${escapeHtml(field.autocomplete)}"` : '';
    return `<label class="dialog-field">
      <span>${label}</span>
      <input name="${name}" type="${inputType}" value="${escapeHtml(field.value || '')}" placeholder="${escapeHtml(field.placeholder || '')}" ${field.required ? 'required' : ''}${inputMode}${autoComplete}>
      ${hint}
    </label>`;
  }
  function collectActionDialogValues(fields = []) {
    const formData = new FormData(actionForm);
    return fields.reduce((values, field) => {
      if (!field || !field.name) return values;
      const rawValue = formData.get(field.name);
      values[field.name] = typeof rawValue === 'string' && field.trim !== false ? rawValue.trim() : rawValue;
      return values;
    }, {});
  }
  function focusFirstActionField() {
    const firstField = actionForm && actionForm.querySelector('input, textarea, select, button[type="submit"]');
    if (!firstField) return;
    firstField.focus();
    if (typeof firstField.select === 'function' && firstField.tagName === 'INPUT') {
      firstField.select();
    }
  }
  function resolveActionDialog(result) {
    if (!actionDialogState) return;
    const { resolve } = actionDialogState;
    actionDialogState = null;
    resolve(result);
  }
  function openActionDialog(options = {}) {
    if (!actionModal || !actionForm) return Promise.resolve(null);
    if (actionDialogState) {
      resolveActionDialog(null);
      if (actionModal.open) actionModal.close();
    }
    const fields = Array.isArray(options.fields) ? options.fields.filter(Boolean) : [];
    actionDialogTitle.textContent = options.title || 'Action';
    actionDialogMessage.textContent = options.message || '';
    actionDialogMessage.hidden = !options.message;
    actionDialogBody.innerHTML = options.bodyHtml || '';
    actionDialogFields.innerHTML = fields.map(renderActionField).join('');
    actionDialogHint.textContent = options.hint || '';
    actionDialogHint.hidden = !options.hint;
    actionDialogCancelBtn.textContent = options.cancelLabel || 'Cancel';
    actionDialogConfirmBtn.textContent = options.confirmLabel || 'Continue';
    actionDialogConfirmBtn.className = options.confirmClass || 'primary';
    actionDialogState = { fields, resolve: null };
    const promise = new Promise((resolve) => {
      actionDialogState.resolve = resolve;
    });
    actionModal.showModal();
    requestAnimationFrame(focusFirstActionField);
    return promise;
  }
  function showToast(message, tone = 'info') {
    if (!toastHost || !message) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${tone}`;
    toast.textContent = message;
    toastHost.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-visible'));
    const dismiss = () => {
      toast.classList.remove('toast-visible');
      window.setTimeout(() => toast.remove(), 220);
    };
    window.setTimeout(dismiss, tone === 'error' ? 4200 : 3000);
  }
  function weatherLinkForEvent(ev) {
    const info = (ev && ev.courseInfo) || {};
    const lat = Number(info.latitude);
    const lon = Number(info.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      return `https://weather.com/weather/today/l/${lat},${lon}`;
    }

    const address = String(info.address || info.fullAddress || '').trim();
    const city = String(info.city || '').trim();
    const state = String(info.state || '').trim();
    const course = String(ev && ev.course || '').trim();
    const queryUnits = [];
    if (address) queryUnits.push(address);
    if (city) queryUnits.push(city);
    if (state) queryUnits.push(state);
    if (!queryUnits.length && course) queryUnits.push(course);
    const query = queryUnits.join(', ').trim();
    if (query) {
      return `https://www.google.com/search?q=${encodeURIComponent(`weather ${query}`)}`;
    }
    return 'https://www.weather.com/weather/today';
  }

  function weatherSummaryMarkup(ev) {
    const weather = ev && ev.weather ? ev.weather : null;
    const link = weatherLinkForEvent(ev);
    const icon = weather && weather.icon ? `<span class="weather-inline" aria-hidden="true">${escapeHtml(weather.icon)}</span>` : '';
    const details = [];
    if (weather) {
      const low = Number.isFinite(Number(weather.tempLow)) ? Math.round(Number(weather.tempLow)) : null;
      const high = Number.isFinite(Number(weather.tempHigh)) ? Math.round(Number(weather.tempHigh)) : null;
      if (Number.isFinite(low) && Number.isFinite(high)) {
        details.push(`L${low}\u00b0 / H${high}\u00b0`);
      } else if (Number.isFinite(Number(weather.temp))) {
        details.push(`${Math.round(Number(weather.temp))}\u00b0F`);
      }
      const rainChance = Number.isFinite(Number(weather.rainChance)) ? Math.round(Number(weather.rainChance)) : null;
      if (Number.isFinite(rainChance) && rainChance > 15) {
        details.push(`Rain ${rainChance}%`);
      }
      const desc = String(weather.description || weather.condition || '').trim();
      if (desc) details.push(desc);
    }

    const text = (details.length ? details.join(' • ') : 'Forecast unavailable');
    const safeText = escapeHtml(text);
    return `<a class="weather-summary${details.length ? '' : ' weather-summary-muted'}" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer" title="Open local weather forecast">${icon}<span class="weather-text">${safeText}</span></a>`;
  }

  function wazeLinkForEvent(ev) {
    const course = String((ev && ev.course) || '').trim();
    const info = (ev && ev.courseInfo) || {};
    const address = String(info.address || info.fullAddress || '').trim();
    const city = String(info.city || '').trim();
    const state = String(info.state || '').trim();
    let query = '';
    if (address) {
      query = address;
    } else {
      query = [course, city, state].filter(Boolean).join(', ');
    }
    if (!query || /^course$/i.test(query)) return '';
    return `https://www.waze.com/ul?q=${encodeURIComponent(query)}&navigate=yes`;
  }
  function courseTitleMarkup(ev) {
    const course = String((ev && ev.course) || '').trim();
    const label = escapeHtml(course || 'Course');
    if (!course) return label;
    const waze = wazeLinkForEvent(ev);
    if (!waze) return label;
    return `<a class="card-title-link" href="${waze}" target="_blank" rel="noopener" title="Open in Waze">${label}</a>`;
  }
  const CALENDAR_EVENT_DURATION_MINUTES = 270;

  function toDateISO(val) {
    const str = String(val || '').trim();
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(str);
    if (match) return match[1];
    const d = new Date(str);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  const DELETE_CODE_STORAGE_KEY = 'teeTimeDeleteCode';

  function getStoredDeleteCode() {
    try {
      return String(sessionStorage.getItem(DELETE_CODE_STORAGE_KEY) || '').trim();
    } catch (_) {
      return '';
    }
  }

  function rememberDeleteCode(code) {
    try {
      if (code) sessionStorage.setItem(DELETE_CODE_STORAGE_KEY, code);
    } catch (_) {}
  }

  async function requestDeleteCode(label = 'this action') {
    const values = await openActionDialog({
      title: 'Admin Delete Code',
      message: `Enter the admin delete code for ${label}.`,
      confirmLabel: 'Continue',
      fields: [{
        name: 'deleteCode',
        label: 'Delete code',
        type: 'password',
        value: getStoredDeleteCode(),
        placeholder: 'Admin delete code',
        required: true,
        autocomplete: 'current-password'
      }]
    });
    const code = String(values && values.deleteCode || '').trim();
    if (code) rememberDeleteCode(code);
    return code;
  }

  function parseHHMMToMinutes(rawTime = '') {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(rawTime).trim());
    if (!m) return null;
    const h = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isInteger(h) || !Number.isInteger(mm) || h < 0 || h > 23 || mm < 0 || mm > 59) return null;
    return (h * 60) + mm;
  }

  function eventStartMinutes(ev) {
    let min = null;
    for (const tt of (ev && ev.teeTimes) || []) {
      const mins = parseHHMMToMinutes(tt && tt.time);
      if (mins === null) continue;
      if (min === null || mins < min) min = mins;
    }
    return min;
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function localDateISO(date = new Date()) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function addDaysToISO(dateISO, days) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateISO || '').trim());
    if (!match) return '';
    const next = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + Number(days || 0));
    return `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-${pad2(next.getDate())}`;
  }

  function fullDateLabel(dateISO = '') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateISO || '').trim());
    if (!match) return 'Selected day';
    const date = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00Z`);
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  function formatSelectedDateShort(dateISO = '') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateISO || '').trim());
    if (!match) return 'Pick a date';
    const date = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00Z`);
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  }

  function isBlueRidgeCourse(courseName = '') {
    return /blue\s*ridge\s*shadows/.test(String(courseName || '').trim().toLowerCase());
  }

  function eventCapacitySummary(ev) {
    const isTeamEvent = !!(ev && ev.isTeamEvent);
    const teeTimes = Array.isArray(ev && ev.teeTimes) ? ev.teeTimes : [];
    const slotCap = isTeamEvent ? Number((ev && ev.teamSizeMax) || 4) : 4;
    const registeredCount = teeTimes.reduce((sum, tt) => sum + ((tt && tt.players || []).length), 0);
    const fifthCount = eventFifthCount(ev);
    const totalCapacity = teeTimes.length * slotCap;
    return {
      teeTimes,
      isTeamEvent,
      registeredCount,
      fifthCount,
      totalCapacity,
      openCount: Math.max(0, totalCapacity - registeredCount),
    };
  }

  function eventDaysUntil(dateISO = '') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateISO || '').trim());
    if (!match) return null;
    const eventDay = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    const now = new Date();
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((eventDay - today) / (1000 * 60 * 60 * 24));
  }

  function eventHasUrgentEmpty(ev) {
    const dateISO = toDateISO(ev && ev.date);
    const daysUntil = eventDaysUntil(dateISO);
    if (!!(ev && ev.isTeamEvent) || !Number.isInteger(daysUntil) || daysUntil < 0 || daysUntil > 3) return false;
    return (ev && ev.teeTimes || []).some((tt) => ((tt && tt.players) || []).length === 0);
  }

  function eventMatchesMobileFilter(ev) {
    switch (activeMobileFilter) {
      case 'open-spots':
        return eventCapacitySummary(ev).openCount > 0;
      case 'urgent-empty':
        return eventHasUrgentEmpty(ev);
      case 'blue-ridge':
        return isBlueRidgeCourse(ev && ev.course);
      case 'team-events':
        return !!(ev && ev.isTeamEvent);
      case 'all':
      default:
        return true;
    }
  }

  function filteredSelectedDateEvents(events = allEvents) {
    return (events || []).filter(eventMatchesMobileFilter);
  }

  function loadStarterEventViewIds() {
    try {
      const raw = JSON.parse(localStorage.getItem(STARTER_EVENT_PREFS_KEY) || '[]');
      if (!Array.isArray(raw)) return new Set();
      return new Set(raw.map((value) => String(value || '').trim()).filter(Boolean));
    } catch (_) {
      return new Set();
    }
  }

  function saveStarterEventViewIds() {
    try {
      localStorage.setItem(STARTER_EVENT_PREFS_KEY, JSON.stringify(Array.from(starterEventViewIds)));
    } catch (_) {}
  }

  function usesStarterEventView(evOrId) {
    const eventId = typeof evOrId === 'string'
      ? String(evOrId || '').trim()
      : String(evOrId && evOrId._id || '').trim();
    return !!eventId && starterEventViewIds.has(eventId);
  }

  function setStarterEventView(eventId, enabled) {
    const safeEventId = String(eventId || '').trim();
    if (!safeEventId) return false;
    if (enabled) starterEventViewIds.add(safeEventId);
    else starterEventViewIds.delete(safeEventId);
    saveStarterEventViewIds();
    return true;
  }

  function slotPlayerCount(teeTime = {}) {
    return ((teeTime && teeTime.players) || []).length;
  }

  function slotFifthCount(teeTime = {}) {
    return ((teeTime && teeTime.players) || []).filter((player) => !!(player && player.isFifth)).length;
  }

  function eventFifthCount(ev = {}, options = {}) {
    if (!ev || ev.isTeamEvent) return 0;
    const ignoredPlayerId = String(options.ignorePlayerId || '').trim();
    return ((ev && ev.teeTimes) || []).reduce((sum, teeTime) => (
      sum + ((teeTime && teeTime.players) || []).filter((player) => {
        if (!(player && player.isFifth)) return false;
        return !ignoredPlayerId || String(player._id) !== ignoredPlayerId;
      }).length
    ), 0);
  }

  function slotPlayerCountIgnoring(teeTime = {}, options = {}) {
    const ignoredPlayerId = String(options.ignorePlayerId || '').trim();
    const players = ((teeTime && teeTime.players) || []);
    if (!ignoredPlayerId) return players.length;
    return players.filter((player) => !player || String(player._id) !== ignoredPlayerId).length;
  }

  function eventHasOtherOpenBaseSlot(ev = {}, teeTime = {}, options = {}) {
    if (!ev || ev.isTeamEvent) return false;
    const targetTeeId = String(teeTime && teeTime._id || '').trim();
    return ((ev && ev.teeTimes) || []).some((entry) => {
      if (!entry) return false;
      if (targetTeeId && String(entry._id) === targetTeeId) return false;
      return slotPlayerCountIgnoring(entry, options) < 4;
    });
  }

  function slotHasFifthPlayer(teeTime = {}) {
    return slotFifthCount(teeTime) > 0;
  }

  function slotCanAddFifth(ev, teeTime = {}, options = {}) {
    return !!(
      ev &&
      !ev.isTeamEvent &&
      slotPlayerCount(teeTime) === 4 &&
      !slotHasFifthPlayer(teeTime) &&
      eventFifthCount(ev, options) === 0 &&
      !eventHasOtherOpenBaseSlot(ev, teeTime, options)
    );
  }

  function slotCheckedInCount(teeTime = {}) {
    return ((teeTime && teeTime.players) || []).filter((player) => !!(player && player.checkedIn)).length;
  }

  function starterSlotMarkup(ev, teeTime = {}, idx = 0) {
    const slotCap = ev && ev.isTeamEvent ? Number((ev && ev.teamSizeMax) || 4) : 4;
    const count = slotPlayerCount(teeTime);
    const hasFifth = slotHasFifthPlayer(teeTime);
    const canAddFifth = slotCanAddFifth(ev, teeTime);
    const checkedInCount = slotCheckedInCount(teeTime);
    const openCount = Math.max(0, slotCap - count);
    const addDisabled = ev && ev.isTeamEvent ? count >= slotCap : (count >= slotCap && !canAddFifth);
    const addLabel = canAddFifth ? 'Add 5th' : 'Add Player';
    const allCheckedIn = count > 0 && checkedInCount === count;
    const urgentEmpty = !(ev && ev.isTeamEvent) && count === 0 && eventHasUrgentEmpty({ ...ev, teeTimes: [teeTime] });
    const slotClasses = ['starter-slot'];
    if (count === 0) slotClasses.push('starter-slot-empty');
    if (urgentEmpty) slotClasses.push('starter-slot-urgent');
    if (allCheckedIn) slotClasses.push('starter-slot-ready');
    if (canAddFifth) slotClasses.push('starter-slot-can-add-fifth');
    if (hasFifth) slotClasses.push('starter-slot-has-fifth');
    const playersMarkup = ((teeTime && teeTime.players) || []).map((player) => {
      const checkedIn = !!(player && player.checkedIn);
      const isFifth = !!(player && player.isFifth);
      const safeName = escapeHtml(String(player && player.name || 'Player'));
      return `<li class="starter-player ${checkedIn ? 'is-checked' : ''}${isFifth ? ' is-fifth' : ''}" draggable="true" data-drag-player="${escapeHtml(String(ev && ev._id || ''))}:${escapeHtml(String(teeTime && teeTime._id || ''))}:${escapeHtml(String(player && player._id || ''))}" title="${safeName}">
        <button class="starter-player-check ${checkedIn ? 'is-checked' : ''}" type="button" data-toggle-checkin="${ev._id}:${teeTime._id}:${player._id}:${checkedIn ? '1' : '0'}" aria-label="${checkedIn ? 'Clear check-in for' : 'Mark checked in for'} ${safeName}">${checkedIn ? '✓' : '○'}</button>
        <span class="starter-player-name"><span class="starter-player-text">${safeName}</span>${isFifth ? '<span class="player-status-badge player-status-badge-fifth">5th</span>' : ''}</span>
      </li>`;
    });
    for (let i = 0; i < openCount; i += 1) {
      playersMarkup.push(`<li class="starter-player starter-player-open"><button class="starter-player-check is-open" type="button" data-add-player="${escapeHtml(String(ev && ev._id || ''))}:${escapeHtml(String(teeTime && teeTime._id || ''))}" title="Add player to ${escapeHtml(teeSlotLabel(ev, teeTime, idx))}">+</button><span class="starter-player-name">Open</span></li>`);
    }
    if (canAddFifth) {
      playersMarkup.push(`<li class="starter-player starter-player-open starter-player-fifth-open"><button class="starter-player-check" type="button" data-add-player="${escapeHtml(String(ev && ev._id || ''))}:${escapeHtml(String(teeTime && teeTime._id || ''))}" title="Add a marked 5th player to ${escapeHtml(teeSlotLabel(ev, teeTime, idx))}">+5</button><span class="starter-player-name"><span class="starter-player-text">Add 5th</span><span class="player-status-badge player-status-badge-fifth">Rare</span></span></li>`);
    }
    const metaParts = [`${count}/${slotCap} in`, `${openCount} open`, `${checkedInCount} checked in`];
    if (hasFifth) metaParts.push('5th added');
    else if (canAddFifth) metaParts.push('5th available');
    return `<article class="${slotClasses.join(' ')}" data-drop-tee="${escapeHtml(String(ev && ev._id || ''))}:${escapeHtml(String(teeTime && teeTime._id || ''))}" data-slot-max="${slotCap}" data-player-count="${count}">
      <div class="starter-slot-header">
        <div>
          <div class="starter-slot-title">${escapeHtml(teeSlotLabel(ev, teeTime, idx))}</div>
          <div class="starter-slot-meta">${metaParts.join(' · ')}</div>
        </div>
        <div class="starter-slot-actions">
          <button class="starter-slot-add" type="button" data-add-player="${ev._id}:${teeTime._id}" ${addDisabled ? 'disabled' : ''}>${addLabel}</button>
          <button class="starter-slot-bulk" type="button" data-checkin-all="${ev._id}:${teeTime._id}:${allCheckedIn ? '1' : '0'}" ${count ? '' : 'disabled'}>${allCheckedIn ? 'Clear' : 'Check In All'}</button>
        </div>
      </div>
      <ul class="starter-player-list">${playersMarkup.join('')}</ul>
    </article>`;
  }

  function starterCardMarkup(ev, options = {}) {
    const capacity = eventCapacitySummary(ev);
    const checkedInCount = capacity.teeTimes.reduce((sum, teeTime) => sum + slotCheckedInCount(teeTime), 0);
    const maybeCount = Array.isArray(ev && ev.maybeList) ? ev.maybeList.length : 0;
    const notes = String(ev && ev.notes || '').trim();
    const showToggle = !starterMode && options.allowToggle !== false;
    return `<section class="starter-card${options.inline ? ' starter-card-inline' : ''}" data-event-id="${escapeHtml(String(ev && ev._id || ''))}">
      <div class="starter-card-header">
        <div class="starter-card-head-copy">
          <h3 class="starter-card-title">${courseTitleMarkup(ev)}</h3>
          <div class="card-date">
            <span>${fmtDate(ev && ev.date)}</span>
            ${weatherSummaryMarkup(ev)}
          </div>
        </div>
        ${showToggle ? `<button class="small starter-card-toggle" type="button" data-toggle-starter-event="${escapeHtml(String(ev && ev._id || ''))}" title="Return this event to the full card">Full Card</button>` : ''}
      </div>
      <div class="starter-card-summary">
        <span>${capacity.teeTimes.length} ${capacity.isTeamEvent ? (capacity.teeTimes.length === 1 ? 'team' : 'teams') : (capacity.teeTimes.length === 1 ? 'tee time' : 'tee times')}</span>
        <span>${capacity.registeredCount} golfer${capacity.registeredCount === 1 ? '' : 's'}</span>
        <span>${capacity.openCount} open</span>
        <span>${checkedInCount} checked in</span>
        ${capacity.fifthCount ? `<span>${capacity.fifthCount} fifth${capacity.fifthCount === 1 ? '' : 's'}</span>` : ''}
        ${maybeCount ? `<span>${maybeCount} maybe</span>` : ''}
      </div>
      ${notes ? `<div class="starter-card-note">${escapeHtml(notes)}</div>` : ''}
      <div class="starter-slot-grid">
        ${capacity.teeTimes.length ? capacity.teeTimes.map((teeTime, idx) => starterSlotMarkup(ev, teeTime, idx)).join('') : '<div class="starter-empty">No tee times set.</div>'}
      </div>
    </section>`;
  }

  function renderStarter(list) {
    window.requestAnimationFrame(() => {
      eventsEl.innerHTML = list.map((ev) => starterCardMarkup(ev, { allowToggle: false })).join('');
    });
  }

  function sortedEventTimes(ev) {
    return ((ev && ev.teeTimes) || [])
      .map((tt) => String(tt && tt.time || '').trim())
      .filter(Boolean)
      .sort((a, b) => {
        const left = parseHHMMToMinutes(a);
        const right = parseHHMMToMinutes(b);
        if (left === null && right === null) return a.localeCompare(b);
        if (left === null) return 1;
        if (right === null) return -1;
        return left - right;
      });
  }

  function teeSlotLabel(ev, teeTime = {}, idx = 0) {
    if (ev && ev.isTeamEvent) {
      return teeTime && teeTime.name ? String(teeTime.name) : `Team ${idx + 1}`;
    }
    return teeTime && teeTime.time ? fmtTime(teeTime.time) : `Tee ${idx + 1}`;
  }

  function findTeeTimeDetails(ev, teeId) {
    const teeTimes = Array.isArray(ev && ev.teeTimes) ? ev.teeTimes : [];
    const teeIndex = teeTimes.findIndex((teeTime) => String(teeTime && teeTime._id) === String(teeId));
    if (teeIndex === -1) return { teeTime: null, teeIndex: -1, label: ev && ev.isTeamEvent ? 'Team' : 'Tee time' };
    const teeTime = teeTimes[teeIndex];
    return {
      teeTime,
      teeIndex,
      label: teeSlotLabel(ev, teeTime, teeIndex)
    };
  }

  function getCachedEventById(eventId = '') {
    return (allEvents || []).find((ev) => String(ev && ev._id) === String(eventId)) || null;
  }

  function getTeeDropAvailability(eventId = '', toTeeId = '', playerId = '') {
    const ev = getCachedEventById(eventId);
    if (!ev) return { allowed: false, asFifth: false };
    const teeDetails = findTeeTimeDetails(ev, toTeeId);
    const teeTime = teeDetails.teeTime;
    if (!teeTime) return { allowed: false, asFifth: false };
    const slotCap = ev.isTeamEvent ? Number(ev.teamSizeMax || 4) : 4;
    const playerCount = slotPlayerCount(teeTime);
    if (playerCount < slotCap) return { allowed: true, asFifth: false };
    const asFifth = slotCanAddFifth(ev, teeTime, { ignorePlayerId: playerId });
    return { allowed: asFifth, asFifth };
  }

  function encodeMaybeFillTargetValue(teeId = '', asFifth = false) {
    return `${String(teeId || '').trim()}|${asFifth ? '1' : '0'}`;
  }

  function decodeMaybeFillTargetValue(value = '') {
    const [teeId, asFifth] = String(value || '').split('|');
    return { teeId: String(teeId || '').trim(), asFifth: asFifth === '1' };
  }

  function maybeFillTargetOptions(ev) {
    const teeTimes = Array.isArray(ev && ev.teeTimes) ? ev.teeTimes : [];
    const slotCap = ev && ev.isTeamEvent ? Number((ev && ev.teamSizeMax) || 4) : 4;
    const options = teeTimes.map((teeTime, idx) => {
      const playerCount = Array.isArray(teeTime && teeTime.players) ? teeTime.players.length : 0;
      const openCount = Math.max(0, slotCap - playerCount);
      const canAddFifth = slotCanAddFifth(ev, teeTime);
      return {
        idx,
        value: String(teeTime && teeTime._id || '').trim(),
        label: teeSlotLabel(ev, teeTime, idx),
        openCount,
        canAddFifth,
        sortMinutes: ev && !ev.isTeamEvent ? parseHHMMToMinutes(teeTime && teeTime.time) : null
      };
    }).filter((option) => option.value && (option.openCount > 0 || option.canAddFifth));

    if (ev && !ev.isTeamEvent) {
      options.sort((left, right) => {
        if (left.sortMinutes === null && right.sortMinutes === null) return left.idx - right.idx;
        if (left.sortMinutes === null) return 1;
        if (right.sortMinutes === null) return -1;
        if (left.sortMinutes !== right.sortMinutes) return left.sortMinutes - right.sortMinutes;
        return left.idx - right.idx;
      });
    }

    return options.map((option) => ({
      value: encodeMaybeFillTargetValue(option.value, option.canAddFifth && option.openCount === 0),
      label: option.openCount > 0 ? `${option.label} (${option.openCount} open)` : `${option.label} (Add as 5th)`
    }));
  }

  function buildSelectedDateShareUrl(dateISO = selectedDate) {
    const url = new URL(window.location.pathname, window.location.origin);
    if (currentGroupSlug !== 'main') url.searchParams.set('group', currentGroupSlug);
    if (dateISO) url.searchParams.set('date', dateISO);
    return url.toString();
  }

  function syncSelectedDateUrl(dateISO = '') {
    try {
      const url = new URL(window.location.href);
      if (dateISO) url.searchParams.set('date', dateISO);
      else url.searchParams.delete('date');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    } catch (_) {}
  }

  function buildSelectedDateShareSummary(dateISO = selectedDate, events = allEvents) {
    const dayLabel = fullDateLabel(dateISO);
    const shareLines = [`Tee Times for ${dayLabel}`];
    if (!Array.isArray(events) || !events.length) {
      shareLines.push('- No events scheduled');
      return shareLines.join('\n');
    }
    const sortedEvents = events.slice().sort((left, right) => {
      const startDiff = (eventStartMinutes(left) ?? Number.MAX_SAFE_INTEGER) - (eventStartMinutes(right) ?? Number.MAX_SAFE_INTEGER);
      if (startDiff !== 0) return startDiff;
      return String((left && left.course) || '').localeCompare(String((right && right.course) || ''));
    });
    for (const ev of sortedEvents) {
      const capacity = eventCapacitySummary(ev);
      const timeLabels = sortedEventTimes(ev).map((time) => fmtTime(time));
      const detailParts = [];
      if (capacity.isTeamEvent) {
        detailParts.push(`${capacity.teeTimes.length} team${capacity.teeTimes.length === 1 ? '' : 's'}`);
      } else {
        if (timeLabels.length) detailParts.push(timeLabels.join(', '));
        detailParts.push(`${capacity.teeTimes.length} tee time${capacity.teeTimes.length === 1 ? '' : 's'}`);
      }
      detailParts.push(`${capacity.registeredCount} golfer${capacity.registeredCount === 1 ? '' : 's'}`);
      if (capacity.openCount > 0) detailParts.push(`${capacity.openCount} open`);
      const maybeCount = Array.isArray(ev && ev.maybeList) ? ev.maybeList.length : 0;
      if (maybeCount > 0) detailParts.push(`${maybeCount} maybe`);
      shareLines.push(`- ${String((ev && ev.course) || 'Golf Event').trim()}: ${detailParts.join(' · ')}`);
    }
    return shareLines.join('\n');
  }

  async function copyTextToClipboard(text = '') {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return;
    }
    const helper = document.createElement('textarea');
    helper.value = text;
    helper.setAttribute('readonly', 'readonly');
    helper.style.position = 'fixed';
    helper.style.top = '-1000px';
    helper.style.opacity = '0';
    document.body.appendChild(helper);
    helper.select();
    const copied = document.execCommand('copy');
    helper.remove();
    if (!copied) throw new Error('Clipboard unavailable');
  }

  async function shareSelectedDay() {
    const dateISO = selectedDate || localDateISO();
    if (!selectedDate) {
      await applySelectedDate(dateISO, { force: true });
    }
    const shareText = buildSelectedDateShareSummary(dateISO, allEvents);
    const shareUrl = buildSelectedDateShareUrl(dateISO);
    const shareTitle = `Tee Times for ${fullDateLabel(dateISO)}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
        showToast('Day share opened.', 'success');
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        console.error(err);
      }
    }
    await copyTextToClipboard(`${shareText}\n\nOpen the day: ${shareUrl}`);
    showToast('Day summary and link copied.', 'success');
  }

  function updateMobileFilterButtons() {
    if (!mobileFilterBar) return;
    mobileFilterBar.querySelectorAll('[data-mobile-filter]').forEach((btn) => {
      const isActive = btn.dataset.mobileFilter === activeMobileFilter;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function updateStarterModeButtons() {
    document.body.classList.toggle('starter-mode', starterMode);
    if (!starterModeBtn) return;
    starterModeBtn.textContent = starterMode ? 'Full View' : 'Starter Mode';
    starterModeBtn.classList.toggle('is-active', starterMode);
    starterModeBtn.setAttribute('aria-pressed', starterMode ? 'true' : 'false');
  }

  async function setStarterMode(nextValue) {
    starterMode = !!nextValue;
    updateStarterModeButtons();
    if (starterMode && !selectedDate) {
      const targetDate = await findNextEventDate(localDateISO()) || localDateISO();
      await applySelectedDate(targetDate, { force: true });
      return;
    }
    renderEventsForDate();
  }

  function updateMobileFilterStatus(visibleCount = 0, totalCount = 0) {
    if (!mobileFilterStatus) return;
    if (!selectedDate) {
      mobileFilterStatus.textContent = 'Pick a date to see tee times and use quick filters.';
      return;
    }
    const dateLabel = formatSelectedDateShort(selectedDate);
    if (!totalCount) {
      mobileFilterStatus.textContent = `${dateLabel} · No events scheduled`;
      return;
    }
    const filterLabel = mobileFilterLabel(activeMobileFilter);
    if (activeMobileFilter === 'all') {
      mobileFilterStatus.textContent = `${dateLabel} · ${totalCount} event${totalCount === 1 ? '' : 's'}`;
      return;
    }
    mobileFilterStatus.textContent = `${dateLabel} · ${visibleCount} of ${totalCount} · ${filterLabel}`;
  }

  function fmtCalendarDate(date) {
    return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}`;
  }

  function fmtCalendarDateTime(date) {
    return `${fmtCalendarDate(date)}T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}00`;
  }

  function eventCalendarTiming(ev) {
    const dateISO = toDateISO(ev && ev.date);
    if (!dateISO) return null;
    const [year, month, day] = dateISO.split('-').map(Number);
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
    const startMinutes = eventStartMinutes(ev);
    if (startMinutes === null) {
      const startDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
      const endDate = new Date(startDate.getTime() + (24 * 60 * 60 * 1000));
      return { allDay: true, startDate, endDate };
    }
    const start = new Date(Date.UTC(year, month - 1, day, Math.floor(startMinutes / 60), startMinutes % 60, 0));
    const end = new Date(start.getTime() + (CALENDAR_EVENT_DURATION_MINUTES * 60 * 1000));
    return { allDay: false, start, end };
  }

  function calendarTitle(ev) {
    const mode = ev && ev.isTeamEvent ? 'Team Event' : 'Tee-Time Event';
    const course = ev && ev.course ? String(ev.course).trim() : 'Golf Event';
    return `${course} (${mode})`;
  }

  function calendarDescription(ev) {
    const lines = ['Tee Time Manager Event'];
    if (ev && ev.course) lines.push(`Course: ${String(ev.course).trim()}`);
    lines.push(`Date: ${fmtDate(ev && ev.date)}`);
    const slotLines = ((ev && ev.teeTimes) || [])
      .map((tt, idx) => {
        if (tt && tt.time) {
          if (ev && ev.isTeamEvent) return `${tt.name || `Team ${idx + 1}`}: ${fmtTime(tt.time)}`;
          return `Tee ${idx + 1}: ${fmtTime(tt.time)}`;
        }
        if (ev && ev.isTeamEvent) return tt && tt.name ? String(tt.name) : `Team ${idx + 1}`;
        return '';
      })
      .filter(Boolean);
    if (slotLines.length) lines.push(`${ev && ev.isTeamEvent ? 'Teams' : 'Tee Times'}: ${slotLines.join(', ')}`);
    if (ev && ev.notes) lines.push(`Notes: ${String(ev.notes).trim()}`);
    if (ev && ev._id) {
      const eventUrl = new URL('/', window.location.origin);
      if (currentGroupSlug !== 'main') eventUrl.searchParams.set('group', currentGroupSlug);
      eventUrl.searchParams.set('event', String(ev._id));
      lines.push(`Event Link: ${eventUrl.toString()}`);
    }
    return lines.join('\n');
  }

  function buildGoogleCalendarUrl(ev) {
    const timing = eventCalendarTiming(ev);
    if (!timing) return '';
    const params = new URLSearchParams();
    params.set('action', 'TEMPLATE');
    params.set('text', calendarTitle(ev));
    params.set('details', calendarDescription(ev));
    params.set('location', ev && ev.course ? String(ev.course) : 'Golf Course');
    if (timing.allDay) {
      params.set('dates', `${fmtCalendarDate(timing.startDate)}/${fmtCalendarDate(timing.endDate)}`);
    } else {
      params.set('dates', `${fmtCalendarDateTime(timing.start)}/${fmtCalendarDateTime(timing.end)}`);
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) params.set('ctz', tz);
    }
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  function openExternalCalendarUrlSafely(urlBuilder) {
    const popup = window.open('about:blank', '_blank', 'noopener,noreferrer');
    return Promise.resolve()
      .then(urlBuilder)
      .then((url) => {
        if (!url) {
          if (popup && !popup.closed) popup.close();
          return false;
        }
        if (popup && !popup.closed) {
          popup.location = url;
          return true;
        }
        window.open(url, '_blank', 'noopener,noreferrer');
        return true;
      })
      .catch((err) => {
        if (popup && !popup.closed) popup.close();
        throw err;
      });
  }

  function upsertCachedEvent(ev) {
    if (!ev || !ev._id) return;
    const idx = allEvents.findIndex((item) => String(item && item._id) === String(ev._id));
    if (idx >= 0) allEvents[idx] = ev;
    else allEvents.push(ev);
    syncSelectedDateSummary();
  }

  function monthKeyForDate(dateValue = currentDate) {
    if (dateValue instanceof Date) {
      return `${dateValue.getFullYear()}-${String(dateValue.getMonth() + 1).padStart(2, '0')}`;
    }
    const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(dateValue || '').trim());
    return match ? `${match[1]}-${match[2]}` : '';
  }

  function buildDaySummary(dateISO = '', events = []) {
    const summary = {
      date: dateISO,
      eventCount: 0,
      teamEventCount: 0,
      urgentTeeEventCount: 0,
      nonBlueRidgeTeeEventCount: 0,
    };
    const todayIso = toDateISO(new Date());
    const todayUtc = todayIso ? Date.parse(`${todayIso}T00:00:00.000Z`) : null;
    const eventDayUtc = dateISO ? Date.parse(`${dateISO}T00:00:00.000Z`) : null;
    const daysUntil = Number.isFinite(todayUtc) && Number.isFinite(eventDayUtc)
      ? Math.round((eventDayUtc - todayUtc) / (24 * 60 * 60 * 1000))
      : null;
    for (const ev of (events || [])) {
      summary.eventCount += 1;
      if (ev && ev.isTeamEvent) {
        summary.teamEventCount += 1;
        continue;
      }
      const courseName = String((ev && ev.course) || '').trim().toLowerCase();
      const isBlueRidgeShadows = /blue\s*ridge\s*shadows/.test(courseName);
      if (courseName && !isBlueRidgeShadows) summary.nonBlueRidgeTeeEventCount += 1;
      if (Number.isInteger(daysUntil) && daysUntil >= 0 && daysUntil <= 3) {
        summary.urgentTeeEventCount += 1;
      }
    }
    return summary;
  }

  function syncSelectedDateSummary() {
    if (!selectedDate) return;
    if (monthKeyForDate(selectedDate) !== loadedMonthKey) return;
    if (!allEvents.length) monthEventSummary.delete(selectedDate);
    else monthEventSummary.set(selectedDate, buildDaySummary(selectedDate, allEvents));
    renderCalendar();
  }

  function setCurrentMonthFromIso(dateISO = '') {
    const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(dateISO || '').trim());
    if (!match) return;
    currentDate = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  }

  function getMonthSummarySets() {
    const eventDates = new Set();
    const teamEventDates = new Set();
    const urgentTeeEventDates = new Set();
    const nonBlueRidgeTeeEventDates = new Set();
    monthEventSummary.forEach((summary, dateISO) => {
      eventDates.add(dateISO);
      if (Number(summary && summary.teamEventCount)) teamEventDates.add(dateISO);
      if (Number(summary && summary.urgentTeeEventCount)) urgentTeeEventDates.add(dateISO);
      if (Number(summary && summary.nonBlueRidgeTeeEventCount)) nonBlueRidgeTeeEventDates.add(dateISO);
    });
    return { eventDates, teamEventDates, urgentTeeEventDates, nonBlueRidgeTeeEventDates };
  }

  async function loadMonthSummary(force = false) {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const requestMonthKey = `${year}-${String(month).padStart(2, '0')}`;
    if (!force && loadedMonthKey === requestMonthKey) {
      renderCalendar();
      return false;
    }
    const payload = await api(`/api/events/calendar/summary?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`);
    if (requestMonthKey !== monthKeyForDate(currentDate)) return false;
    const days = Array.isArray(payload && payload.days) ? payload.days : [];
    const nextSignature = buildRefreshSignature(days);
    const changed = loadedMonthKey !== requestMonthKey || nextSignature !== monthSummarySignature;
    monthEventSummary = new Map(days.map((day) => [String(day && day.date || ''), day]).filter(([dateKey]) => dateKey));
    loadedMonthKey = requestMonthKey;
    monthSummarySignature = nextSignature;
    if (changed) renderCalendar();
    return changed;
  }

  async function loadEventsForSelectedDate(options = {}) {
    const showLoading = options.showLoading !== false;
    if (!selectedDate) {
      selectedDateTitle.textContent = '';
      allEvents = [];
      eventsEl.innerHTML = '';
      updateMobileFilterStatus(0, 0);
      selectedDateEventsSignature = '';
      return false;
    }
    const requestDate = selectedDate;
    const requestSeq = ++selectedDateRequestSeq;
    const date = new Date(`${requestDate}T12:00:00Z`);
    selectedDateTitle.textContent = date.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC'
    });
    if (showLoading) {
      eventsEl.innerHTML = '<div style="color:#ffffff;padding:20px;text-align:center;text-shadow:0 2px 8px rgba(0,0,0,0.7)">Loading events...</div>';
    }
    try {
      const payload = await api(`/api/events/by-date?date=${encodeURIComponent(requestDate)}`);
      if (requestSeq !== selectedDateRequestSeq || requestDate !== selectedDate) return false;
      const nextEvents = Array.isArray(payload && payload.events) ? payload.events : [];
      const nextSignature = buildRefreshSignature(nextEvents);
      const changed = nextSignature !== selectedDateEventsSignature;
      allEvents = nextEvents;
      selectedDateEventsSignature = nextSignature;
      if (changed || showLoading) {
        renderEventsForDate();
        syncSelectedDateSummary();
      }
      return changed;
    } catch (err) {
      if (requestSeq !== selectedDateRequestSeq || requestDate !== selectedDate) return false;
      console.error(err);
      allEvents = [];
      eventsEl.innerHTML = '<div class="card">Failed to load events for this date.</div>';
      selectedDateEventsSignature = '';
      return false;
    }
  }

  function normalizeForm(form){
    const data=Object.fromEntries(new FormData(form).entries());
    if(data.date){
      const s = String(data.date).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const d = new Date(s + 'T12:00:00Z');
        const y=d.getUTCFullYear(), m=String(d.getUTCMonth()+1).padStart(2,'0'), day=String(d.getUTCDate()).padStart(2,'0');
        data.date=`${y}-${m}-${day}`;
      } else {
        data.date = s;
      }
    }
    return data;
  }
  async function api(path, opts){ 
    const method = String(opts?.method || 'GET').toUpperCase();
    let requestPath = path;
    const mergedHeaders = { ...(opts?.headers || {}) };
    try {
      const scopedUrl = new URL(requestPath, window.location.origin);
      if (scopedUrl.origin === window.location.origin && (scopedUrl.pathname.startsWith('/api/') || scopedUrl.pathname.startsWith('/admin/'))) {
        if (!scopedUrl.searchParams.has('group')) scopedUrl.searchParams.set('group', currentGroupSlug);
        requestPath = `${scopedUrl.pathname}${scopedUrl.search}${scopedUrl.hash}`;
      }
    } catch (_) {}
    if (method === 'GET') {
      // Force fresh API reads, especially after mobile app resume.
      mergedHeaders['Cache-Control'] = mergedHeaders['Cache-Control'] || 'no-cache';
      mergedHeaders.Pragma = mergedHeaders.Pragma || 'no-cache';
      try {
        const u = new URL(requestPath, window.location.origin);
        if (!u.searchParams.has('fresh')) u.searchParams.set('fresh', '1');
        u.searchParams.set('_rt', String(Date.now()));
        requestPath = u.origin === window.location.origin
          ? `${u.pathname}${u.search}${u.hash}`
          : u.toString();
      } catch (_) {}
    }
    debugLog('info', `API Request: ${method} ${requestPath}`, opts?.body ? JSON.parse(opts.body) : null);
    
    // Add timeout for slow requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    try {
      const r=await fetch(requestPath, {
        ...opts,
        headers: mergedHeaders,
        cache: method === 'GET' ? 'no-store' : opts?.cache,
        signal: controller.signal,
      }); 
      clearTimeout(timeoutId);
      
      const ct=r.headers.get('content-type')||''; 
      const body = ct.includes('application/json') ? await r.json() : await r.text();
      if(!r.ok) {
        const msg = (typeof body === 'object' && body.message) || (typeof body === 'object' && body.error) || body || ('HTTP '+r.status);
        debugLog('error', `API Error: ${method} ${requestPath} (${r.status})`, body);
        throw new Error(msg);
      }
      debugLog('success', `API Success: ${method} ${requestPath}`, body);
      return body;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        debugLog('error', `API Timeout: ${method} ${requestPath}`, { error: 'Request timed out after 30 seconds' });
        throw new Error('Request timed out. Please check your connection and try again.');
      }
      debugLog('error', `API Failed: ${method} ${requestPath}`, { error: err.message });
      throw err;
    }
  }

  function requestServiceWorkerRefresh() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.getRegistration()
      .then((registration) => {
        if (!registration || typeof registration.update !== 'function') return;
        return registration.update().catch(() => {});
      })
      .catch(() => {});
  }

  function refreshOnResume(reason) {
    if (document.hidden) return;
    const now = Date.now();
    if (now - lastResumeRefreshAt < RESUME_REFRESH_DEBOUNCE_MS) return;
    lastResumeRefreshAt = now;
    debugLog('info', `Resume refresh: ${reason}`);
    requestServiceWorkerRefresh();
    load(true, { silent: true });
  }

  // Create Event: open modal in the requested mode (tees or teams)
  on(newTeeBtn, 'click', () => {
    if (createModeInput) createModeInput.value = 'tees';
    if (teeTimeRow) teeTimeRow.hidden = false;
    if (teamSizeRow) teamSizeRow.hidden = true;
    if (eventForm?.elements?.['teeTime']) eventForm.elements['teeTime'].required = true;
    if (eventForm?.elements?.['teamStartTime']) eventForm.elements['teamStartTime'].required = false;
    if (selectedDate && eventForm?.elements?.['date']) {
      eventForm.elements['date'].value = selectedDate;
    }
    modal?.showModal?.();
  });
  on(newTeamBtn, 'click', () => {
    if (createModeInput) createModeInput.value = 'teams';
    if (teeTimeRow) teeTimeRow.hidden = true;
    if (teamSizeRow) teamSizeRow.hidden = false;
    if (eventForm?.elements?.['teeTime']) eventForm.elements['teeTime'].required = false;
    if (eventForm?.elements?.['teamStartTime']) eventForm.elements['teamStartTime'].required = true;
    if (selectedDate && eventForm?.elements?.['date']) {
      eventForm.elements['date'].value = selectedDate;
    }
    modal?.showModal?.();
  });

  // Team start type toggle
  const teamStartType = $('#teamStartType');
  const teamStartHint = $('#teamStartHint');
  on(teamStartType, 'change', () => {
    const isShotgun = teamStartType.value === 'shotgun';
    if (teamStartHint) {
      teamStartHint.textContent = isShotgun 
        ? 'All teams start at this time' 
        : 'Teams will start 9 minutes apart';
    }
  });

  // Dialog cancel
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-cancel]');
    if (!btn) return;
    ev.preventDefault();
    const dlg = btn.closest('dialog');
    dlg?.close?.();
  });
  on(actionForm, 'submit', (e) => {
    e.preventDefault();
    if (!actionDialogState) return;
    const values = collectActionDialogValues(actionDialogState.fields);
    resolveActionDialog(values);
    actionModal?.close?.('ok');
  });
  on(actionModal, 'close', () => {
    if (actionDialogState) resolveActionDialog(null);
  });

  // Create event submit
  on(eventForm, 'submit', async (e)=>{
    e.preventDefault();
    try{
      const body = normalizeForm(eventForm);
      const isTeams = (body.mode === 'teams');
      const courseName = body.course;
      const payload = {
        course: courseName,
        courseInfo: selectedCourseData || {},
        date: body.date,
        notes: body.notes || '',
        isTeamEvent: isTeams,
        teamSizeMax: isTeams ? Number(body.teamSizeMax || 4) : 4
      };
      if (isTeams) {
        payload.teamStartType = body.teamStartType || 'shotgun';
        payload.teamStartTime = body.teamStartTime;
      } else {
        const teeTime = body.teeTime;
        let count = 4;
        if (body.teeTimesCount) {
          count = parseInt(body.teeTimesCount, 10) || 4;
        }
        if (teeTime) {
          const mins = teeTime.split(':').map(Number);
          const startMins = mins[0] * 60 + mins[1];
          payload.teeTime = teeTime;
          if (count > 1) {
            payload.teeTimes = [];
            for (let i = 0; i < count; i++) {
              let minsVal = startMins + i * 9;
              let h = String(Math.floor(minsVal / 60) % 24).padStart(2, '0');
              let m = String(minsVal % 60).padStart(2, '0');
              payload.teeTimes.push({ time: `${h}:${m}` });
            }
          }
        }
      }
      await api('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      modal?.close?.();
      eventForm.reset();
      if (courseInfoCard) courseInfoCard.style.display = 'none';
      selectedCourseData = null;
      load();
    } catch (err) {
      console.error(err);
      alert('Create failed: ' + (err && err.message ? err.message : 'Unknown error'));
    }
  });

  // Edit mode toggle
  on(editModeSelect, 'change', ()=>{
    const teams = editModeSelect.value === 'teams';
    if (editTeamSizeRow) editTeamSizeRow.hidden = !teams;
  });

  // Edit save
  on(editForm, 'submit', async (e)=>{
    e.preventDefault();
    try{
      const data = normalizeForm(editForm);
      const id = data.id;
      const payload = {
        course: data.course,
        date: data.date,
        notes: data.notes || '',
        isTeamEvent: data.mode === 'teams',
        teamSizeMax: data.mode === 'teams' ? Number(data.teamSizeMax || 4) : 4
      };
      await api(`/api/events/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      editModal?.close?.(); load();
    }catch(err){ console.error(err); alert('Save failed'); }
  });

  // Subscribe modal
  console.log('Subscribe button:', openSubscribeBtn, 'Modal:', subscribeModal);
  on(openSubscribeBtn, 'click', () => {
    console.log('Subscribe button clicked!');
    subscribeModal?.showModal?.();
  });
  on(subscribeModal, 'click', (e) => {
    if (e.target.dataset.cancel) subscribeModal?.close();
  });

  // Subscribe
  on(subForm, 'submit', async (e)=>{
    e.preventDefault(); 
    if(subMsg) {
      subMsg.textContent='Subscribing...';
      subMsg.style.color='var(--slate-700)';
      subMsg.style.fontWeight='500';
    }
    try{
      const formData = new FormData(subForm);
      const payload = { email: formData.get('email') };
      
      const result = await api('/api/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      if(subMsg) {
        subMsg.style.color='var(--green-700)';
        subMsg.style.fontWeight='600';
        const groupLabel = String(result && result.groupReference || subscriptionGroupLabel()).trim() || 'this group';
        if (result.isNew) {
          subMsg.textContent = `✓ Subscribed to ${groupLabel} updates!`;
        } else {
          subMsg.textContent = `✓ Already subscribed to ${groupLabel}!`;
        }
      }
      setTimeout(() => {
        subscribeModal?.close();
        if(subMsg) subMsg.textContent='';
      }, 2500);
      subForm.reset();
    }catch(err){ 
      console.error(err);
      if(subMsg) {
        subMsg.textContent='Failed: ' + (err.message || 'Unknown error');
        subMsg.style.color='#dc2626';
        subMsg.style.fontWeight='600';
      }
    }
  });

  // Calendar functions
  function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // Update month/year title
    currentMonthEl.textContent = new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    if (monthCalendarBtn) {
      const fullMonth = new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long' });
      monthCalendarBtn.textContent = 'Add this month\'s tee times';
      monthCalendarBtn.title = `Add all ${fullMonth} ${year} tee times to your calendar`;
    }
    
    // Clear grid
    calendarGrid.innerHTML = '';
    
    // Add day headers
    const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayHeaders.forEach(day => {
      const header = document.createElement('div');
      header.className = 'calendar-day-header';
      header.textContent = day;
      calendarGrid.appendChild(header);
    });
    
    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    
    // Build event date maps (YYYY-MM-DD format)
    const { eventDates, teamEventDates, urgentTeeEventDates, nonBlueRidgeTeeEventDates } = getMonthSummarySets();
    
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    
    // Previous month days
    for (let i = firstDay - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      const dayEl = createDayElement(day, year, month - 1, true);
      calendarGrid.appendChild(dayEl);
    }
    
    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const dayEl = createDayElement(day, year, month, false);
      const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      
      if (dateStr === todayStr) {
        dayEl.classList.add('today');
      }
      
      if (eventDates.has(dateStr)) {
        dayEl.classList.add('has-events');
        if (teamEventDates.has(dateStr)) dayEl.classList.add('has-team-events');
        if (urgentTeeEventDates.has(dateStr)) dayEl.classList.add('has-urgent-tee-events');
        if (nonBlueRidgeTeeEventDates.has(dateStr)) dayEl.classList.add('has-non-brs-tee-events');
        if (dateStr < todayStr) dayEl.classList.add('past-event-day');
        else dayEl.classList.add('upcoming-event-day');
      }
      
      if (selectedDate && dateStr === selectedDate) {
        dayEl.classList.add('selected');
      }
      
      calendarGrid.appendChild(dayEl);
    }
    
    // Next month days
    const totalCells = firstDay + daysInMonth;
    const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let day = 1; day <= remainingCells; day++) {
      const dayEl = createDayElement(day, year, month + 1, true);
      calendarGrid.appendChild(dayEl);
    }
  }
  
  function createDayElement(day, year, month, isOtherMonth) {
    const dayEl = document.createElement('div');
    dayEl.className = 'calendar-day';
    if (isOtherMonth) dayEl.classList.add('other-month');
    dayEl.textContent = day;
    
    // Handle month overflow
    let actualYear = year;
    let actualMonth = month;
    if (month < 0) {
      actualMonth = 11;
      actualYear--;
    } else if (month > 11) {
      actualMonth = 0;
      actualYear++;
    }
    
    const dateStr = `${actualYear}-${String(actualMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    
    // Use passive event listener for better scroll/tap performance
    dayEl.addEventListener('click', () => {
      if (isOtherMonth) {
        // Navigate to other month when clicking its days
        currentDate = new Date(actualYear, actualMonth, day);
      }
      selectDate(dateStr);
    }, { passive: true });
    
    return dayEl;
  }

  async function applySelectedDate(dateStr, options = {}) {
    if (!dateStr) return;
    const force = !!options.force;
    if (!force && selectedDate === dateStr) return;
    selectedDate = dateStr;
    syncSelectedDateUrl(dateStr);
    setCurrentMonthFromIso(dateStr);
    await loadMonthSummary(force);
    await loadEventsForSelectedDate();
  }

  async function findNextEventDate(startDateISO = localDateISO()) {
    const searchStart = String(startDateISO || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(searchStart)) return '';
    const baseDate = new Date(`${searchStart}T12:00:00`);
    for (let offset = 0; offset < 12; offset += 1) {
      const monthDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + offset, 1);
      const year = monthDate.getFullYear();
      const month = monthDate.getMonth() + 1;
      const monthKey = `${year}-${pad2(month)}`;
      let days = [];
      if (monthKey === loadedMonthKey) {
        days = Array.from(monthEventSummary.values());
      } else {
        const payload = await api(`/api/events/calendar/summary?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`);
        days = Array.isArray(payload && payload.days) ? payload.days : [];
      }
      const candidate = days
        .map((day) => String(day && day.date || '').trim())
        .filter((dateISO) => /^\d{4}-\d{2}-\d{2}$/.test(dateISO))
        .filter((dateISO) => offset > 0 || dateISO >= searchStart)
        .sort((a, b) => a.localeCompare(b))[0];
      if (candidate) return candidate;
    }
    return '';
  }
  
  // Debounced selectDate for smoother mobile experience
  let selectDateTimeout = null;
  function selectDate(dateStr) {
    if (selectedDate === dateStr) return; // No-op if already selected
    if (selectDateTimeout) clearTimeout(selectDateTimeout);
    selectDateTimeout = setTimeout(async () => {
      try {
        await applySelectedDate(dateStr);
      } catch (err) {
        console.error(err);
        updateLastUpdated('Date load failed');
      }
    }, 60); // 60ms debounce for fast taps
  }
  
  function renderEventsForDate() {
    if (!selectedDate) {
      selectedDateTitle.textContent = '';
      eventsEl.innerHTML = '';
      updateMobileFilterStatus(0, 0);
      return;
    }
    
    const date = new Date(selectedDate + 'T12:00:00Z');
    selectedDateTitle.textContent = date.toLocaleDateString(undefined, { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric',
      timeZone: 'UTC'
    });
    
    const visibleEvents = filteredSelectedDateEvents(allEvents);
    updateMobileFilterStatus(visibleEvents.length, allEvents.length);
    if (allEvents.length === 0) {
      eventsEl.innerHTML = '<div style="color:#ffffff;padding:20px;text-align:center;text-shadow:0 2px 8px rgba(0,0,0,0.7)">No events scheduled for this date</div>';
    } else if (visibleEvents.length === 0) {
      const filterLabel = mobileFilterLabel(activeMobileFilter);
      eventsEl.innerHTML = `<div style="color:#ffffff;padding:20px;text-align:center;text-shadow:0 2px 8px rgba(0,0,0,0.7)">No events match the ${escapeHtml(filterLabel.toLowerCase())} filter for this date</div>`;
    } else {
      if (starterMode) renderStarter(visibleEvents);
      else render(visibleEvents);
    }
  }

  function gatherKnownGolferNames() {
    const names = new Set();
    for (const ev of (allEvents || [])) {
      for (const tt of (ev.teeTimes || [])) {
        for (const p of (tt.players || [])) {
          const n = String((p && p.name) || '').trim();
          if (n) names.add(n);
        }
      }
      for (const maybeName of (ev.maybeList || [])) {
        const n = String(maybeName || '').trim();
        if (n) names.add(n);
      }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }

  function openRequestClubTimeModal() {
    if (!requestClubTimeModal || !requestClubDateInput || !requestClubPreferredTimeInput || !requestClubRequesterNameInput || !requestClubNameOptions) return;
    const todayIso = new Date().toISOString().slice(0, 10);
    requestClubDateInput.value = selectedDate || todayIso;
    requestClubPreferredTimeInput.value = '';

    const golfers = gatherKnownGolferNames();
    requestClubNameOptions.innerHTML = '';
    if (!golfers.length) {
      requestClubRequesterNameInput.value = '';
    } else {
      if (!requestClubRequesterNameInput.value) requestClubRequesterNameInput.value = golfers[0];
      for (const name of golfers) {
        const opt = document.createElement('option');
        opt.value = name;
        requestClubNameOptions.appendChild(opt);
      }
    }
    requestClubTimeModal.showModal();
  }
  

  on(refreshBtn, 'click', (e) => {
    e.preventDefault();
    load(true);
  });

  on(starterModeBtn, 'click', async (e) => {
    e.preventDefault();
    try {
      const originalText = starterModeBtn.textContent;
      starterModeBtn.disabled = true;
      starterModeBtn.textContent = starterMode ? 'Loading...' : 'Starting...';
      await setStarterMode(!starterMode);
      starterModeBtn.textContent = originalText;
    } catch (err) {
      console.error(err);
      showToast('Starter mode failed: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      starterModeBtn.disabled = false;
      updateStarterModeButtons();
    }
  });

  on(requestClubTimeBtn, 'click', (e) => {
    e.preventDefault();
    openRequestClubTimeModal();
  });

  on(requestClubTimeModal, 'click', (e) => {
    if (e.target && e.target.dataset && e.target.dataset.closeRequestClubTime !== undefined) {
      requestClubTimeModal.close();
    }
  });

  on(requestClubTimeForm, 'submit', async (e) => {
    e.preventDefault();
    const submitBtn = requestClubTimeForm.querySelector('button[type="submit"]');
    const originalText = submitBtn ? submitBtn.textContent : 'Send Request';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';
    }
    try {
      const fd = new FormData(requestClubTimeForm);
      const payload = {
        date: String(fd.get('date') || '').trim(),
        preferredTime: String(fd.get('preferredTime') || '').trim(),
        requesterName: String(fd.get('requesterName') || '').trim(),
        note: String(fd.get('note') || '').trim(),
      };
      await api('/api/request-club-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      requestClubTimeModal.close();
      showToast('Club time request sent.', 'success');
    } catch (err) {
      console.error(err);
      showToast('Request failed: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    }
  });

  on(mobileFilterBar, 'click', (e) => {
    const btn = e.target.closest('[data-mobile-filter]');
    if (!btn) return;
    const nextFilter = String(btn.dataset.mobileFilter || 'all');
    if (nextFilter === activeMobileFilter) return;
    activeMobileFilter = nextFilter;
    updateMobileFilterButtons();
    renderEventsForDate();
  });

  on(mobileQuickBar, 'click', async (e) => {
    const btn = e.target.closest('[data-mobile-action]');
    if (!btn) return;
    const action = String(btn.dataset.mobileAction || '');
    const originalText = btn.textContent;
    try {
      if (action === 'refresh') {
        btn.disabled = true;
        btn.textContent = 'Refreshing...';
        await load(true);
        return;
      }
      if (action === 'today') {
        btn.disabled = true;
        btn.textContent = 'Loading...';
        await applySelectedDate(localDateISO(), { force: true });
        return;
      }
      if (action === 'next-event') {
        btn.disabled = true;
        btn.textContent = 'Finding...';
        const nextDate = await findNextEventDate(selectedDate ? addDaysToISO(selectedDate, 1) : localDateISO());
        if (!nextDate) {
          showToast('No upcoming event dates were found.', 'error');
          return;
        }
        await applySelectedDate(nextDate, { force: true });
        return;
      }
      if (action === 'share-day') {
        btn.disabled = true;
        btn.textContent = 'Sharing...';
        await shareSelectedDay();
        return;
      }
      if (action === 'new-tee') {
        newTeeBtn?.click();
        return;
      }
      if (action === 'request-time') {
        openRequestClubTimeModal();
      }
    } catch (err) {
      console.error(err);
      showToast('Quick action failed: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });

  on(monthCalendarBtn, 'click', (e) => {
    e.preventDefault();
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const url = `/api/events/calendar/month.ics?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}&group=${encodeURIComponent(currentGroupSlug)}`;
    window.location.assign(url);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (!document.hidden) refreshOnResume('visibility');
  });
  window.addEventListener('pageshow', (e) => {
    if (e && e.persisted) refreshOnResume('pageshow-bfcache');
    else refreshOnResume('pageshow');
  });
  window.addEventListener('focus', () => refreshOnResume('focus'));
  window.addEventListener('online', () => refreshOnResume('online'));

  // Calendar navigation
  on(prevMonthBtn, 'click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    loadMonthSummary().catch((err) => {
      console.error(err);
      updateLastUpdated('Month refresh failed');
    });
  });

  on(nextMonthBtn, 'click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    loadMonthSummary().catch((err) => {
      console.error(err);
      updateLastUpdated('Month refresh failed');
    });
  });

  // No MutationObserver: only call load() after successful actions

  async function load(force=false, options = {}){
    const silent = !!options.silent;
    if (isLoading) { 
      loadPending = true; 
      return; 
    }
    if (!force && document.hidden) {
      loadPending = true;
      return;
    }
    isLoading = true;
    if (!silent) setLoading(true);
    try{ 
      const monthChanged = await loadMonthSummary(force);
      let eventsChanged = false;
      if (selectedDate) {
        eventsChanged = await loadEventsForSelectedDate({ showLoading: !silent });
      } else {
        allEvents = [];
        eventsEl.innerHTML = '';
        selectedDateEventsSignature = '';
      }
      if (!silent || monthChanged || eventsChanged) {
        stampLastUpdated();
      }
    } catch(e) { 
      console.error(e); 
      eventsEl.innerHTML='<div class="card">Failed to load events.</div>'; 
      updateLastUpdated('Refresh failed');
    } finally {
      isLoading = false;
      if (!silent) setLoading(false);
      if (loadPending) {
        loadPending = false;
        load(true, { silent: true });
      }
    } 
  }

  function startAutoRefresh(){
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    autoRefreshTimer = setInterval(() => {
      if (document.hidden) return;
      load(true, { silent: true });
    }, REFRESH_INTERVAL_MS);
  }

  // Fetch a single event by ID
  async function fetchEventById(eventId) {
    try {
      return await api(`/api/events/${eventId}`);
    } catch (e) {
      console.error('Failed to fetch event by ID:', e);
      return null;
    }
  }

  async function getEventForAction(eventId) {
    const cached = allEvents.find((item) => String(item && item._id) === String(eventId));
    if (cached) return cached;
    const fetched = await fetchEventById(eventId);
    if (fetched) upsertCachedEvent(fetched);
    return fetched;
  }

  function render(list){
    // Use a document fragment for batch DOM updates
    window.requestAnimationFrame(() => {
      eventsEl.innerHTML = '';
      const frag = document.createDocumentFragment();
      for(const ev of list){
        if (usesStarterEventView(ev)) {
          const starterWrap = document.createElement('div');
          starterWrap.innerHTML = starterCardMarkup(ev, { allowToggle: true, inline: true });
          if (starterWrap.firstElementChild) frag.appendChild(starterWrap.firstElementChild);
          continue;
        }
        const card=document.createElement('div'); card.className='card';
        const isTeams = !!ev.isTeamEvent;
        let teesArr = ev.teeTimes || [];
        if (!isTeams) {
          // Sort tee times by time (HH:MM) ascending
          teesArr = teesArr.slice().sort((a, b) => {
            if (!a.time || !b.time) return 0;
            const [ah, am] = a.time.split(":").map(Number);
            const [bh, bm] = b.time.split(":").map(Number);
            return ah !== bh ? ah - bh : am - bm;
          });
        }
        const slotCap = isTeams ? (ev.teamSizeMax || 4) : 4;
        const slotCount = teesArr.length;
        const registeredCount = teesArr.reduce((sum, tt) => sum + ((tt.players || []).length), 0);
        const checkedInCount = teesArr.reduce((sum, tt) => sum + ((tt.players || []).filter((p) => !!p.checkedIn).length), 0);
        const fifthCount = eventFifthCount(ev);
        const totalCapacity = slotCount * slotCap;
        const openCount = Math.max(0, totalCapacity - registeredCount);
        const maybeCount = (ev.maybeList || []).length;
        const isDayFullyBooked = !isTeams && slotCount > 0 && openCount === 0;
        const fullDayAlert = isDayFullyBooked
          ? `<div class="full-day-alert">All tee times are full for ${escapeHtml(fullDateLabel(toDateISO(ev.date)))}. You can request an additional time from the ${escapeHtml(clubContactLabel())}${fifthCount ? '.' : ' or ask them to allow a 5th in one of your tee times for that day.'}</div>`
          : '';
        const summaryRow = `<div class="row" style="gap:8px;flex-wrap:wrap;margin:6px 0 10px 0;font-size:12px;color:var(--slate-700)">
          <span><strong>${registeredCount}</strong> registered</span>
          <span><strong>${checkedInCount}</strong> checked in</span>
          <span><strong>${openCount}</strong> open</span>
          ${fifthCount ? `<span><strong>${fifthCount}</strong> fifth${fifthCount === 1 ? '' : 's'}</span>` : ''}
          <span><strong>${maybeCount}</strong> maybe</span>
          <span><strong>${slotCount}</strong> ${isTeams ? 'teams' : 'tee times'}</span>
        </div>`;
        const tees = teesArr.map((tt,idx)=>teeRow(ev,tt,idx,isTeams)).join('');
        // Render maybe list
        const maybeList = (ev.maybeList || []).map((name, idx) => {
          const safe = String(name).replace(/"/g, '&quot;');
          return `<span class="maybe-chip" title="${safe}">
            <span class="maybe-name">${name}</span>
            <button class="icon small danger" title="Remove" data-remove-maybe="${ev._id}:${idx}">×</button>
          </span>`;
        }).join('');
        const maybeSection = `
          <div class="maybe-section">
            <div class="maybe-header">
              <h4>🤔 Maybe List</h4>
              <div class="maybe-controls">
                <button class="small maybe-btn" data-add-maybe="${ev._id}">+ Interested</button>
                <button class="small maybe-btn" data-fill-maybe="${ev._id}" title="Move someone from maybe list into an open spot">Fill Spot</button>
              </div>
            </div>
            <div class="maybe-list">
              ${maybeList || '<em style="color:var(--slate-700);font-size:11px;opacity:0.7">No one yet</em>'}
            </div>
          </div>
        `;
        const weatherSummary = weatherSummaryMarkup(ev);
        // Course details
        const courseDetailsBits = [];
        if (ev.courseInfo && ev.courseInfo.city && ev.courseInfo.state) {
          courseDetailsBits.push(`<span>📍 ${escapeHtml(ev.courseInfo.city)}, ${escapeHtml(ev.courseInfo.state)}</span>`);
        }
        if (ev.courseInfo && ev.courseInfo.phone) {
          courseDetailsBits.push(`<span>📞 ${escapeHtml(ev.courseInfo.phone)}</span>`);
        }
        if (ev.courseInfo && ev.courseInfo.website) {
          courseDetailsBits.push(`<span><a href="${escapeHtml(ev.courseInfo.website)}" target="_blank" rel="noopener">🔗 Website</a></span>`);
        }
        if (ev.courseInfo && ev.courseInfo.holes && ev.courseInfo.par) {
          courseDetailsBits.push(`<span>⛳ ${escapeHtml(ev.courseInfo.holes)} holes, Par ${escapeHtml(ev.courseInfo.par)}</span>`);
        }
        const courseDetails = courseDetailsBits.length
          ? `<div class="course-details">${courseDetailsBits.join('')}</div>`
          : '';
        const eventActionLegend = `
          <div class="event-action-legend" aria-label="Golfer action legend">
            <span class="event-action-title">Golfer Controls</span>
            <span class="event-action-item"><span class="event-action-symbol">○</span>Individual check-in</span>
            <span class="event-action-item"><span class="event-action-pill">All</span>Group check-in</span>
            <span class="event-action-item"><span class="event-action-symbol">↔</span>Move golfer</span>
            <span class="event-action-item"><span class="event-action-symbol danger">×</span>Delete golfer</span>
          </div>
        `;
        card.innerHTML = `
          <div class="card-header">
            <div class="card-header-left">
              <div class="card-title-row">
                <h3 class="card-title">${courseTitleMarkup(ev)}</h3>
                <div class="event-top-actions">
                  <button class="event-top-btn event-top-edit" data-edit="${ev._id}" title="Edit Event" aria-label="Edit Event">✏</button>
                  <button class="event-top-btn event-top-delete" data-del="${ev._id}" title="Delete Event" aria-label="Delete Event">✕</button>
                </div>
              </div>
              <div class="card-date">
                <span>${fmtDate(ev.date)}</span>
                ${weatherSummary}
              </div>
              ${courseDetails}
            </div>
          </div>
          <div class="card-content">
            ${maybeSection}
            <div class="empty-tee-note"><span>RED</span> = empty tee time</div>
            <div class="card-actions">
              <button class="small event-actions-toggle" data-toggle-actions title="Show/hide event actions">Actions</button>
              <div class="button-row">
                <button class="small" data-toggle-starter-event="${ev._id}" title="Switch this event to the compact starter view">Starter View</button>
                ${isTeams ? `<button class="small" data-add-tee="${ev._id}">Add Team</button>` : `<div class="time-action-pair"><button class="small" data-add-tee="${ev._id}">Add Existing Time</button><button class="small" data-request-extra-tee="${ev._id}" title="Email ${escapeHtml(clubContactLabel())} to request an additional tee time">Request Club Time</button></div>`}
                ${isTeams ? '' : `<button class="small" data-suggest-pairings="${ev._id}" title="Suggest balanced groups using handicap data">Pairings</button>`}
                <button class="small" data-calendar-google="${ev._id}" title="Add this event to Google Calendar">Google</button>
              </div>
            </div>
            ${summaryRow}
            ${fullDayAlert}
            ${eventActionLegend}
            <div class="tees">${tees || (isTeams ? '<em>No teams</em>' : '<em>No tee times</em>')}</div>
            ${ev.notes ? `<div class="notes">${ev.notes}</div>` : ''}
            <div class="event-bottom-actions">
              <button class="small event-audit-btn event-bottom-audit-btn" data-audit="${ev._id}" title="View Audit Log" aria-label="View Audit Log">View Audit</button>
            </div>
          </div>`;
        frag.appendChild(card);
      }
      eventsEl.appendChild(frag);
    });
  }

  function teeRow(ev, tt, idx, isTeams){
    const chips = (tt.players || []).map(p => {
      // keep a safe-quoted title for tooltips so long names can be seen on hover
      const safe = String(p.name || '').replace(/"/g, '&quot;');
      const checkedIn = !!p.checkedIn;
      const isFifth = !!p.isFifth;
      return `<span class="chip ${checkedIn ? 'checked-in' : ''}${isFifth ? ' is-fifth' : ''}" title="${safe}" draggable="true" data-drag-player="${ev._id}:${tt._id}:${p._id}">
        <span class="chip-label" title="${safe}"><span class="chip-name">${p.name}</span>${isFifth ? '<span class="player-status-badge player-status-badge-fifth">5th</span>' : ''}</span>
        <span class="chip-actions">
          <button class="icon small ${checkedIn ? 'ok' : ''}" title="${checkedIn ? 'Checked in' : 'Mark checked in'}" data-toggle-checkin="${ev._id}:${tt._id}:${p._id}:${checkedIn ? '1' : '0'}">${checkedIn ? '✓' : '○'}</button>
          <button class="icon small" title="Move" data-move="${ev._id}:${tt._id}:${p._id}">↔</button>
          <button class="icon small danger" title="Remove" data-del-player="${ev._id}:${tt._id}:${p._id}">×</button>
        </span>
      </span>`;
    }).join('') || '—';
    const max = ev.teamSizeMax || 4;
    const slotMax = isTeams ? max : 4;
    const count = (tt.players || []).length;
    const hasFifth = slotHasFifthPlayer(tt);
    const canAddFifth = slotCanAddFifth(ev, tt);
    const checkedInCount = (tt.players || []).filter((p) => !!p.checkedIn).length;
    const openSpots = Math.max(0, slotMax - count);
    const full = count >= slotMax;
    const addDisabled = isTeams ? full : (count >= slotMax && !canAddFifth);
    const dateISO = toDateISO(ev && ev.date);
    let daysUntil = null;
    if (dateISO) {
      const [y, m, d] = dateISO.split('-').map(Number);
      if (Number.isInteger(y) && Number.isInteger(m) && Number.isInteger(d)) {
        const eventDay = Date.UTC(y, m - 1, d);
        const now = new Date();
        const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
        daysUntil = Math.round((eventDay - today) / (1000 * 60 * 60 * 24));
      }
    }
    const urgentEmpty = !isTeams && count === 0 && Number.isInteger(daysUntil) && daysUntil >= 0 && daysUntil <= 3;
    const allCheckedIn = count > 0 && checkedInCount === count;
    const left = teeSlotLabel(ev, tt, idx);
    const delTitle = isTeams ? 'Remove team' : 'Remove tee time';
    const teeClasses = ['tee'];
    if (full) teeClasses.push('tee-full');
    if (canAddFifth) teeClasses.push('tee-can-add-fifth');
    if (hasFifth) teeClasses.push('tee-has-fifth');
    if (urgentEmpty) teeClasses.push('tee-empty-urgent');
    // Only show edit button for teams, not tee times
    let editBtn = '';
    if (isTeams) {
      const editTitle = 'Edit team name';
      editBtn = `<button class="icon small" title="${editTitle}" data-edit-tee="${ev._id}:${tt._id}">✎</button>`;
    }
    const summaryText = hasFifth ? '5th added' : (canAddFifth ? '5th available' : `${openSpots} open`);
    const addLabel = canAddFifth ? 'Add 5th' : 'Add Player';
    return `<div class="${teeClasses.join(' ')}" data-drop-tee="${ev._id}:${tt._id}" data-slot-max="${slotMax}" data-player-count="${count}">
      <div class="tee-meta">
        <div class="tee-time">${left} <span style="font-size:11px;opacity:0.8">(${count}/${slotMax})</span></div>
        <div class="tee-summary" style="font-size:11px;color:var(--slate-700)">${summaryText}</div>
        <div class="tee-actions">
          ${editBtn}
          <button class="icon small danger" title="${delTitle}" data-del-tee="${ev._id}:${tt._id}">×</button>
        </div>
      </div>
      <div class="tee-players">${chips}</div>
            <div class="row" style="gap:8px;flex-wrap:wrap">
        <button class="small" data-add-player="${ev._id}:${tt._id}" ${addDisabled ? 'disabled' : ''}>${addLabel}</button>
        <button class="small" data-checkin-all="${ev._id}:${tt._id}:${allCheckedIn ? '1' : '0'}" ${count ? '' : 'disabled'}>${allCheckedIn ? 'Clear Check-In' : 'Check In All'}</button>
      </div>
    </div>`;
  }

  function clearTeeDragUi(){
    document.querySelectorAll('[data-drag-player].is-dragging').forEach((node) => node.classList.remove('is-dragging'));
    document.querySelectorAll('[data-drop-tee].is-drop-target').forEach((node) => node.classList.remove('is-drop-target'));
    document.querySelectorAll('[data-drop-tee].is-drop-invalid').forEach((node) => node.classList.remove('is-drop-invalid'));
  }

  function parseDragPlayerValue(value = ''){
    const [eventId, fromTeeId, playerId] = String(value || '').split(':');
    if (!eventId || !fromTeeId || !playerId) return null;
    return { eventId, fromTeeId, playerId };
  }

  async function movePlayerToTee(eventId, fromTeeId, toTeeId, playerId, options = {}){
    if (!eventId || !fromTeeId || !toTeeId || !playerId) return;
    if (String(fromTeeId) === String(toTeeId)) return;
    const updatedEvent = await api(`/api/events/${eventId}/move-player`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ fromTeeId, toTeeId, playerId, asFifth: !!options.asFifth })
    });
    await updateEventCard(eventId, updatedEvent);
  }

  function syncTeeDropUi(target){
    if (!teeDragState) return;
    clearTeeDragUi();
    const dragPlayer = document.querySelector(`[data-drag-player="${CSS.escape(`${teeDragState.eventId}:${teeDragState.fromTeeId}:${teeDragState.playerId}`)}"]`);
    if (dragPlayer) dragPlayer.classList.add('is-dragging');
    if (!target) return;
    const [eventId, toTeeId] = String(target.dataset.dropTee || '').split(':');
    if (String(eventId) !== String(teeDragState.eventId) || String(toTeeId) === String(teeDragState.fromTeeId)) return;
    const availability = getTeeDropAvailability(eventId, toTeeId, teeDragState.playerId);
    target.classList.add(availability.allowed ? 'is-drop-target' : 'is-drop-invalid');
  }

  on(eventsEl, 'dragstart', (e) => {
    const chip = e.target.closest('[data-drag-player]');
    if (!chip) return;
    const parsed = parseDragPlayerValue(chip.dataset.dragPlayer);
    if (!parsed) return;
    teeDragState = parsed;
    chip.classList.add('is-dragging');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', chip.dataset.dragPlayer);
    }
  });

  on(eventsEl, 'dragover', (e) => {
    const target = e.target.closest('[data-drop-tee]');
    if (!target || !teeDragState) return;
    const [eventId, toTeeId] = String(target.dataset.dropTee || '').split(':');
    if (String(eventId) !== String(teeDragState.eventId) || String(toTeeId) === String(teeDragState.fromTeeId)) return;
    e.preventDefault();
    const availability = getTeeDropAvailability(eventId, toTeeId, teeDragState.playerId);
    if (e.dataTransfer) e.dataTransfer.dropEffect = availability.allowed ? 'move' : 'none';
    syncTeeDropUi(target);
  });

  on(eventsEl, 'dragleave', (e) => {
    const target = e.target.closest('[data-drop-tee]');
    if (!target) return;
    const related = e.relatedTarget;
    if (related && target.contains(related)) return;
    target.classList.remove('is-drop-target', 'is-drop-invalid');
  });

  on(eventsEl, 'dragend', () => {
    teeDragState = null;
    clearTeeDragUi();
  });

  on(eventsEl, 'drop', async (e) => {
    const target = e.target.closest('[data-drop-tee]');
    if (!target || !teeDragState) return;
    e.preventDefault();
    const dragState = teeDragState;
    teeDragState = null;
    clearTeeDragUi();
    const [eventId, toTeeId] = String(target.dataset.dropTee || '').split(':');
    if (String(eventId) !== String(dragState.eventId) || String(toTeeId) === String(dragState.fromTeeId)) return;
    const availability = getTeeDropAvailability(eventId, toTeeId, dragState.playerId);
    if (!availability.allowed) {
      showToast('That tee time is already full.', 'error');
      return;
    }
    try {
      await movePlayerToTee(dragState.eventId, dragState.fromTeeId, toTeeId, dragState.playerId, { asFifth: availability.asFifth });
    } catch (err) {
      console.error(err);
      showToast('Move failed: ' + (err.message || 'Unknown error'), 'error');
    }
  });

  on(eventsEl, 'click', async (e)=>{
    const t=(e.target.closest('[data-del-tee],[data-del-player],[data-add-tee],[data-add-player],[data-move],[data-edit],[data-del],[data-audit],[data-add-maybe],[data-remove-maybe],[data-fill-maybe],[data-edit-tee],[data-request-extra-tee],[data-suggest-pairings],[data-toggle-checkin],[data-checkin-all],[data-toggle-actions],[data-calendar-google],[data-calendar-ics],[data-toggle-starter-event]')||e.target);
    try{
      if(t.dataset.toggleStarterEvent){
        const eventId = String(t.dataset.toggleStarterEvent || '').trim();
        if (!eventId) return;
        const enabled = !usesStarterEventView(eventId);
        if (!setStarterEventView(eventId, enabled)) return;
        renderEventsForDate();
        showToast(enabled ? 'Event switched to starter view.' : 'Full event card restored.', 'success');
        return;
      }
      if(t.dataset.toggleActions !== undefined){
        const card = t.closest('.card');
        if (!card) return;
        const open = card.classList.toggle('actions-open');
        t.textContent = open ? 'Hide Actions' : 'Actions';
        return;
      }
      if(t.dataset.calendarGoogle){
        const ok = await openExternalCalendarUrlSafely(async () => {
          const ev = await getEventForAction(t.dataset.calendarGoogle);
          return ev ? buildGoogleCalendarUrl(ev) : '';
        });
        if (!ok) alert('Unable to build Google Calendar link for this event.');
        return;
      }
      if(t.dataset.calendarIcs){
        const id = String(t.dataset.calendarIcs);
        window.location.assign(`/api/events/${encodeURIComponent(id)}/calendar.ics?group=${encodeURIComponent(currentGroupSlug)}`);
        return;
      }
      if(t.dataset.addMaybe){
        const id=t.dataset.addMaybe;
        const maybeValues = await openActionDialog({
          title: 'Add to Maybe List',
          message: 'Enter the player name to add to the maybe list.',
          confirmLabel: 'Add Player',
          fields: [{
            name: 'name',
            label: 'Player name',
            placeholder: 'Golfer name',
            required: true,
            autocomplete: 'name'
          }]
        });
        const name = String(maybeValues && maybeValues.name || '').trim();
        if(!name) return;
        try {
          const updatedEvent = await api(`/api/events/${id}/maybe`,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name}) });
          await updateEventCard(id, updatedEvent);
          return;
        } catch (err) {
          console.error(err);
          if (err.message && err.message.includes('already on maybe list')) {
            showToast('You are already on the maybe list for this event.', 'error');
          } else {
            showToast('Failed to add to maybe list: ' + err.message, 'error');
          }
          return;
        }
      }
      if(t.dataset.fillMaybe){
        const id = t.dataset.fillMaybe;
        const ev = await getEventForAction(id);
        if (!ev) {
          showToast('Unable to load this event right now.', 'error');
          return;
        }
        const maybeOptions = (Array.isArray(ev.maybeList) ? ev.maybeList : [])
          .map((name) => String(name || '').trim())
          .filter(Boolean)
          .map((name) => ({ value: name, label: name }));
        if (!maybeOptions.length) {
          showToast('No interested players are waiting for this event.', 'error');
          return;
        }
        const targetOptions = maybeFillTargetOptions(ev);
        if (!targetOptions.length) {
          showToast(`No open ${ev.isTeamEvent ? 'teams' : 'tee times'} are available.`, 'error');
          return;
        }
        const maybeFillValues = await openActionDialog({
          title: 'Confirm Maybe Player',
          message: `Choose the interested player and the ${ev.isTeamEvent ? 'team' : 'tee time'} to add them to.`,
          confirmLabel: 'Confirm Player',
          hint: ev.isTeamEvent
            ? 'Only teams with room are listed.'
            : 'Only tee times with room, plus the single event-wide 5th option after every other tee is full, are listed.',
          fields: [{
            name: 'name',
            label: 'Interested player',
            type: 'select',
            value: maybeOptions[0].value,
            options: maybeOptions,
            required: true
          }, {
            name: 'teeId',
            label: ev.isTeamEvent ? 'Destination team' : 'Destination tee time',
            type: 'select',
            value: targetOptions[0].value,
            options: targetOptions,
            required: true
          }]
        });
        if (maybeFillValues === null) return;
        const name = String(maybeFillValues.name || '').trim();
        const targetChoice = decodeMaybeFillTargetValue(maybeFillValues.teeId || '');
        const teeId = String(targetChoice.teeId || '').trim();
        const asFifth = !!targetChoice.asFifth;
        if (!name || !teeId) return;
        const original = t.textContent;
        t.disabled = true;
        t.textContent = 'Filling...';
        try {
          const result = await api(`/api/events/${id}/maybe/fill`, {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ name, teeId, asFifth })
          });
          await updateEventCard(id, result && result.event ? result.event : null);
        } catch (err) {
          console.error(err);
          showToast('Fill failed: ' + (err.message || 'Unknown error'), 'error');
        } finally {
          t.disabled = false;
          t.textContent = original;
        }
        return;
      }
      if(t.dataset.removeMaybe){
        const [id, index] = t.dataset.removeMaybe.split(':');
        const confirmed = await openActionDialog({
          title: 'Remove Maybe Player',
          message: 'Remove this player from the maybe list?',
          confirmLabel: 'Remove',
          confirmClass: 'dialog-danger'
        });
        if (confirmed === null) return;
        const updatedEvent = await api(`/api/events/${id}/maybe/${index}`,{ method:'DELETE' });
        await updateEventCard(id, updatedEvent);
        return;
      }
      if(t.dataset.audit){
        const id=t.dataset.audit;
        await openAuditLog(id);
        return;
      }
      if(t.dataset.requestExtraTee){
        const id = t.dataset.requestExtraTee;
        const noteValues = await openActionDialog({
          title: 'Request Additional Tee Time',
          message: 'Leave your name so the club knows who requested this.',
          confirmLabel: 'Send Request',
          fields: [{
            name: 'note',
            label: 'Who is asking',
            placeholder: 'Requester name',
            autocomplete: 'name'
          }]
        });
        if (noteValues === null) return;
        const note = String(noteValues.note || '').trim();
        const orig = t.textContent;
        t.disabled = true;
        t.textContent = 'Sending...';
        try {
          await api(`/api/events/${id}/request-extra-tee-time`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note })
          });
          showToast(`Additional tee time request emailed to ${clubContactLabel()}.`, 'success');
        } catch (err) {
          console.error(err);
          showToast('Request failed: ' + (err.message || 'Unknown error'), 'error');
        } finally {
          t.disabled = false;
          t.textContent = orig;
        }
        return;
      }
      if(t.dataset.toggleCheckin){
        const [eventId, teeId, playerId, currentFlag] = t.dataset.toggleCheckin.split(':');
        const nextCheckedIn = currentFlag !== '1';
        t.disabled = true;
        try {
          await api(`/api/events/${eventId}/tee-times/${teeId}/players/${playerId}/check-in`, {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ checkedIn: nextCheckedIn })
          });
          await updateEventCard(eventId);
        } catch (err) {
          console.error(err);
          alert('Check-in update failed: ' + (err.message || 'Unknown error'));
        } finally {
          t.disabled = false;
        }
        return;
      }
      if(t.dataset.checkinAll){
        const [eventId, teeId, allFlag] = t.dataset.checkinAll.split(':');
        const nextChecked = allFlag !== '1';
        t.disabled = true;
        try {
          await api(`/api/events/${eventId}/tee-times/${teeId}/check-in-all`, {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ checkedIn: nextChecked })
          });
          await updateEventCard(eventId);
        } catch (err) {
          console.error(err);
          alert('Bulk check-in failed: ' + (err.message || 'Unknown error'));
        } finally {
          t.disabled = false;
        }
        return;
      }
      if(t.dataset.suggestPairings){
        const id = t.dataset.suggestPairings;
        const original = t.textContent;
        t.disabled = true;
        t.textContent = 'Working...';
        try {
          const suggestion = await api(`/api/events/${id}/pairings/suggest`, { method: 'POST' });
          const groups = Array.isArray(suggestion.groups) ? suggestion.groups : [];
          if (!groups.length) {
            showToast('No players found to pair.', 'error');
            return;
          }
          const pairingsChoice = await openActionDialog({
            title: 'Suggested Pairings',
            message: 'Review the suggested groups before applying them.',
            confirmLabel: 'Apply Pairings',
            bodyHtml: `<div class="dialog-summary-list">${groups.map((g, idx) => {
              const names = (g.players || []).map((p) => {
                const handicap = Number.isFinite(p.handicapIndex) ? ` (${escapeHtml(String(p.handicapIndex))})` : '';
                return `${escapeHtml(String(p && p.name || 'Player'))}${handicap}`;
              }).join(', ');
              return `<div class="dialog-summary-item"><strong>Group ${idx + 1}</strong><span>${names || 'No players'}</span></div>`;
            }).join('')}</div>`
          });
          if (pairingsChoice === null) return;
          await api(`/api/events/${id}/pairings/apply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              groups: groups.map((g) => ({
                teeId: g.teeId || null,
                playerIds: (g.players || []).map((p) => p.playerId)
              }))
            })
          });
          await updateEventCard(id);
          showToast('Pairings applied.', 'success');
        } catch (err) {
          console.error(err);
          showToast('Pairing action failed: ' + (err.message || 'Unknown error'), 'error');
        } finally {
          t.disabled = false;
          t.textContent = original;
        }
        return;
      }
      if(t.dataset.delTee){
        const [eventId, teeId] = t.dataset.delTee.split(':');
        const ev = await getEventForAction(eventId);
        const isTeamEvent = !!(ev && ev.isTeamEvent);
        const teeDetails = findTeeTimeDetails(ev, teeId);
        const slotLabel = teeDetails.label || (isTeamEvent ? 'this team' : 'this tee time');
        const deleteValues = await openActionDialog({
          title: isTeamEvent ? 'Remove Team' : 'Remove Tee Time',
          message: isTeamEvent
            ? `Remove ${slotLabel}? This cannot be undone.`
            : `Remove ${slotLabel}? Choose whether to only remove it here or also notify ${clubContactLabel()}.`,
          confirmLabel: isTeamEvent ? 'Remove Team' : 'Remove Tee Time',
          confirmClass: 'dialog-danger',
          fields: [
            !isTeamEvent ? {
              name: 'notifyClub',
              label: 'Club notification',
              type: 'select',
              value: 'no',
              options: [
                { value: 'no', label: 'Remove only' },
                { value: 'yes', label: `Remove and email ${clubContactLabel()}` }
              ]
            } : null
          ]
        });
        if (deleteValues === null) return;
        const notifyClub = !isTeamEvent && String(deleteValues.notifyClub || 'no') === 'yes';
        t.disabled = true;
        t.textContent = notifyClub ? 'Sending...' : 'Removing...';
        try {
          const params = new URLSearchParams();
          if (notifyClub) params.set('notifyClub', '1');
          const url = `/api/events/${eventId}/tee-times/${teeId}${params.toString() ? `?${params.toString()}` : ''}`;
          const resp = await api(url, {
            method: 'DELETE',
            headers: { 'x-delete-confirmed': 'true' }
          });
          if (resp && resp.notifyClub) {
            showToast('Club notified and tee time removed.', 'success');
          } else {
            showToast(isTeamEvent ? 'Team removed.' : 'Tee time removed without club notification.', 'success');
          }
        } catch (err) {
          console.error(err);
          t.disabled = false;
          t.textContent = '×';
          showToast('Delete tee/team failed: ' + (err.message || 'Unknown error'), 'error');
          return;
        }
        await updateEventCard(eventId);
        return;
      }
      if(t.dataset.delPlayer){
        const [eventId, teeId, playerId] = t.dataset.delPlayer.split(':');
        const ev = await getEventForAction(eventId);
        const teeDetails = findTeeTimeDetails(ev, teeId);
        const player = ((teeDetails.teeTime && teeDetails.teeTime.players) || []).find((entry) => String(entry && entry._id) === String(playerId));
        const playerName = String((player && player.name) || 'this player').trim() || 'this player';
        const deleteValues = await openActionDialog({
          title: 'Remove Player',
          message: `Remove ${playerName} from ${teeDetails.label || 'this tee time'}? This cannot be undone.`,
          confirmLabel: 'Remove Player',
          confirmClass: 'dialog-danger',
          fields: []
        });
        if (deleteValues === null) return;
        const origText = t.textContent;
        t.disabled = true;
        t.textContent = '...';
        try {
          await api(`/api/events/${eventId}/tee-times/${teeId}/players/${playerId}`, {
            method: 'DELETE',
            headers: { 'x-delete-confirmed': 'true' }
          });
          await updateEventCard(eventId);
        } catch (err) {
          console.error(err);
          t.disabled = false;
          t.textContent = origText || 'x';
          showToast('Remove player failed: ' + (err.message || 'Unknown error'), 'error');
        }
        return;
      }
      if(t.dataset.addTee){
        const id=t.dataset.addTee;
        const list=await api('/api/events');
        const ev=(list||[]).find(x=>x._id===id);
        if(!ev) return;
        if(ev.isTeamEvent){
            const origText = t.textContent;
            t.disabled = true;
            t.textContent = 'Adding...';
            try {
              await api(`/api/events/${id}/tee-times`,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({}) });
              await updateEventCard(id);
            } finally {
              t.disabled = false;
              t.textContent = origText;
            }
        }else{
            // For tee time events, show a select dialog for time
            let dialog = document.getElementById('teeTimeSelectDialog');
            if (!dialog) {
              dialog = document.createElement('dialog');
              dialog.id = 'teeTimeSelectDialog';
              // Show times from 06:30 to 23:59, formatted as HH:MM AM/PM
              const startMinutes = 6 * 60 + 30; // 6:30 AM
              const endMinutes = 23 * 60 + 59; // 23:59
              dialog.innerHTML = `
                <form method="dialog" style="min-width:220px;padding:16px;display:flex;flex-direction:column;gap:12px;">
                  <label style="font-weight:600;">Select Tee Time
                    <select id="teeTimeSelect" required style="font-size:18px;padding:8px 6px;margin-top:8px;">
                      ${Array.from({length: endMinutes - startMinutes + 1}, (_,i) => {
                        const total = startMinutes + i;
                        const h24 = Math.floor(total/60);
                        const m = String(total%60).padStart(2,'0');
                        const h12 = ((h24+11)%12)+1;
                        const ampm = h24 < 12 ? 'AM' : 'PM';
                        const value = `${String(h24).padStart(2,'0')}:${m}`;
                        return `<option value="${value}">${h12}:${m} ${ampm}</option>`;
                      }).join('')}
                    </select>
                  </label>
                  <menu style="display:flex;gap:10px;justify-content:flex-end;">
                    <button id="teeTimeCancelBtn" value="cancel" type="button">Cancel</button>
                    <button value="ok" type="submit" class="primary">Add</button>
                  </menu>
                </form>`;
              document.body.appendChild(dialog);
            }
            const select = dialog.querySelector('#teeTimeSelect');
            select.selectedIndex = 0; // default to 06:30 AM
            return new Promise(resolve => {
              // Ensure cancel button closes the dialog
              dialog.querySelector('#teeTimeCancelBtn').onclick = function() {
                dialog.close('cancel');
              };
              dialog.onclose = async function() {
                if (dialog.returnValue !== 'ok') return resolve();
                const timeToAdd = select.value;
                const body = { time: timeToAdd };
                t.disabled = true;
                const origText = t.textContent;
                t.textContent = 'Adding...';
                await api(`/api/events/${id}/tee-times`,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
                await updateEventCard(id);
                t.disabled = false;
                t.textContent = origText;
                resolve();
              };
              dialog.showModal();
            });
          }
        return;
      }
      if(t.dataset.del){
        const code = await requestDeleteCode('deleting this event'); if(!code) return;
        t.disabled = true;
        t.textContent = 'Deleting...';
        t.style.background = '#dc2626';
        t.style.color = 'white';
        try {
          await api(`/api/events/${t.dataset.del}`,{
            method:'DELETE',
            headers: { 'x-admin-delete-code': code }
          });
          await updateEventCard(t.dataset.del);
        } catch(err) {
          console.error(err);
          t.disabled = false;
          t.textContent = 'Delete';
          t.style.background = '';
          t.style.color = '';
          showToast('Delete failed: ' + (err.message || 'Invalid code or network error'), 'error');
        }
        return;
      }
      if(t.dataset.addPlayer){
        const [id,teeId]=t.dataset.addPlayer.split(':');
        const ev = await getEventForAction(id);
        if (!ev) {
          showToast('Unable to load this tee time right now.', 'error');
          return;
        }
        const teeDetails = findTeeTimeDetails(ev, teeId);
        const slotLabel = teeDetails.label || (ev.isTeamEvent ? 'this team' : 'this tee time');
        const canAddFifth = slotCanAddFifth(ev, teeDetails.teeTime);
        const playerValues = await openActionDialog({
          title: canAddFifth ? 'Add 5th Player' : 'Add Player',
          message: canAddFifth
            ? `This tee time already has four golfers. The next player will be clearly marked as the 5th on ${slotLabel}.`
            : `Enter the golfer name to add to ${slotLabel}.`,
          confirmLabel: canAddFifth ? 'Add 5th Player' : 'Add Player',
          hint: canAddFifth ? 'Only one marked 5th player is allowed per event, and every other tee time must already be full.' : '',
          fields: [{
            name: 'name',
            label: 'Player name',
            placeholder: 'Golfer name',
            required: true,
            autocomplete: 'name'
          }]
        });
        const name = String(playerValues && playerValues.name || '').trim();
        if(!name) return;
        const origText = t.textContent;
        try {
          t.disabled = true;
          t.textContent = canAddFifth ? 'Adding 5th...' : 'Adding...';
          const updatedEvent = await api(`/api/events/${id}/tee-times/${teeId}/players`,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ name, asFifth: canAddFifth }) });
          await updateEventCard(id, updatedEvent);
          return;
        } catch (err) {
          console.error(err);
          t.disabled = false;
          t.textContent = origText;
          if (err.message && err.message.includes('duplicate')) {
            showToast('Duplicate name detected. Use a nickname like "John S" or "Big Mike".', 'error');
          } else {
            showToast('Failed to add player: ' + (err.message || 'Unknown error'), 'error');
          }
          return;
        }
      }
      if(t.dataset.move){
        const [eventId,fromTeeId,playerId]=t.dataset.move.split(':');
        return openMoveDialog(eventId,fromTeeId,playerId);
      }
      if(t.dataset.edit){
        const id=t.dataset.edit;
        const list=await api('/api/events');
        const ev=(list||[]).find(x=>x._id===id); if(!ev) return;
        editForm.elements['id'].value=id;
        editForm.elements['course'].value=ev.course||'';
        editForm.elements['date'].value=(String(ev.date).slice(0,10));
        editForm.elements['notes'].value=ev.notes||'';
        editModeSelect.value = ev.isTeamEvent ? 'teams' : 'tees';
        editTeamSizeRow.hidden = !ev.isTeamEvent;
        if (ev.isTeamEvent) editForm.elements['teamSizeMax'].value = ev.teamSizeMax || 4;
        editModal.showModal();
        return;
      }
      if(t.dataset.editTee){
        const [eventId, teeId] = t.dataset.editTee.split(':');
        const list=await api('/api/events');
        const ev=(list||[]).find(x=>x._id===eventId); if(!ev) return;
        const tee = (ev.teeTimes||[]).find(x=>x._id===teeId); if(!tee) return;
        const isTeam = ev.isTeamEvent;
        editTeeTitle.textContent = isTeam ? 'Edit Team Name' : 'Edit Tee Time';
        editTeeLabel.textContent = isTeam ? 'Team Name' : 'Tee Time';
        
        if (isTeam) {
          // Show input for team name
          editTeeInput.style.display = '';
          editTeeSelect.style.display = 'none';
          editTeeInput.value = tee.name || '';
        } else {
          // Only show free input for tee time
          editTeeInput.style.display = '';
          editTeeSelect.style.display = 'none';
          editTeeInput.value = tee.time || '';
        }
        // Always enable Save button if value is present
        const saveBtn = editTeeForm.querySelector('button[type="submit"]');
        saveBtn.disabled = false;
        
        editTeeForm.elements['eventId'].value = eventId;
        editTeeForm.elements['teeId'].value = teeId;
        editTeeForm.elements['isTeam'].value = isTeam ? '1' : '0';
        editTeeModal.showModal();
        return;
      }
    }catch(err){
      console.error(err);
      if (err && err.message) {
        alert('Action failed: ' + err.message);
      } else {
        alert('Action failed');
      }
    }
  });

  async function openMoveDialog(eventId, fromTeeId, playerId){
    const list=await api('/api/events'); const ev=(list||[]).find(x=>x._id===eventId); if(!ev) return;
    const all = ev.teeTimes || [];
    const slotCap = ev.isTeamEvent ? Number(ev.teamSizeMax || 4) : 4;
    const dests = all
      .filter(t => String(t._id) !== String(fromTeeId))
      .map((t) => {
        const playerCount = Array.isArray(t && t.players) ? t.players.length : 0;
        const openCount = Math.max(0, slotCap - playerCount);
        const asFifth = slotCanAddFifth(ev, t, { ignorePlayerId: playerId });
        return { teeTime: t, openCount, asFifth };
      })
      .filter((entry) => entry.openCount > 0 || entry.asFifth);
    if(!dests.length){ alert('No other destinations'); return; }

    moveForm.elements['eventId'].value=eventId;
    moveForm.elements['fromTeeId'].value=fromTeeId;
    moveForm.elements['playerId'].value=playerId;

    const html = dests.map((entry)=>{
      const t = entry.teeTime;
      const originalIdx = all.findIndex(tt => String(tt._id) === String(t._id));
      const label = ev.isTeamEvent ? (t.name ? t.name : ('Team ' + (originalIdx + 1))) : (t.time ? fmtTime(t.time) : '—');
      const detail = entry.asFifth ? 'Add as 5th' : `${entry.openCount} open`;
      return `<label class="radio-item"><input type="radio" name="dest" value="${t._id}" data-as-fifth="${entry.asFifth ? '1' : '0'}" required> ${label} <span class="radio-item-meta">${detail}</span></label>`;
    }).join('');

    moveTitle.textContent = ev.isTeamEvent ? 'Move Player to another Team' : 'Move Player to another Tee Time';
    moveChoices.innerHTML = html;
    moveModal.showModal();
  }

  on(moveForm, 'submit', async (e)=>{
    e.preventDefault();
    const eventId=moveForm.elements['eventId'].value;
    const fromTeeId=moveForm.elements['fromTeeId'].value;
    const playerId=moveForm.elements['playerId'].value;
    const selectedDest = moveForm.querySelector('input[name="dest"]:checked');
    if (!selectedDest) return;
    const toTeeId=selectedDest.value;
    const asFifth = selectedDest.dataset.asFifth === '1';
    try{
      await movePlayerToTee(eventId, fromTeeId, toTeeId, playerId, { asFifth });
      moveModal.close?.();
    }catch(err){ 
      console.error(err);
      const msg = err.message || 'Move failed';
      alert(msg);
    }
  });

  async function openAuditLog(eventId){
    try{
      const content = $('#auditLogContent');
      const modal = $('#auditModal');
      if (!content || !modal) {
        console.error('Audit modal elements not found');
        return;
      }
      content.innerHTML = '<p style="color:var(--slate-700);text-align:center">Loading...</p>';
      modal.showModal();
      const logs = await api(`/api/events/${eventId}/audit-log`);
      if (!logs || logs.length === 0) {
        content.innerHTML = '<p style="color:var(--slate-700);text-align:center">No audit entries yet.</p>';
        return;
      }
      const items = logs.map(log => {
        const ts = new Date(log.timestamp).toLocaleString();
        let desc = '';
        if (log.action === 'add_player') {
          desc = `➕ Added <strong>${log.playerName}</strong> to ${log.teeLabel}`;
        } else if (log.action === 'remove_player') {
          desc = `➖ Removed <strong>${log.playerName}</strong> from ${log.teeLabel}`;
        } else if (log.action === 'move_player') {
          desc = `↔️ Moved <strong>${log.playerName}</strong> from ${log.fromTeeLabel} to ${log.toTeeLabel}`;
        } else if (log.action === 'check_in_player') {
          desc = `✅ Checked in <strong>${log.playerName}</strong> at ${log.teeLabel}`;
        } else if (log.action === 'undo_check_in_player') {
          desc = `⬜ Marked not checked in: <strong>${log.playerName}</strong> at ${log.teeLabel}`;
        } else if (log.action === 'bulk_check_in') {
          desc = `✅ Checked in all players at ${log.teeLabel}`;
        } else if (log.action === 'bulk_clear_check_in') {
          desc = `⬜ Cleared check-in for all players at ${log.teeLabel}`;
        }
        return `<div style="padding:8px;border-bottom:1px solid var(--slate-200)">
          <div style="font-size:14px;color:var(--slate-900)">${desc}</div>
          <div style="font-size:12px;color:var(--slate-700);margin-top:4px">${ts}</div>
        </div>`;
      }).join('');
      content.innerHTML = items;
    }catch(err){
      console.error(err);
      const content = $('#auditLogContent');
      if (content) content.innerHTML = '<p style="color:#dc2626;text-align:center">Failed to load audit log.</p>';
    }
  }

  // Golf Course Search with Dynamic API Search and Caching
  const courseSearch = $('#courseSearch');
  const courseList = $('#courseList');
  const courseInfoCard = $('#courseInfoCard');
  const courseLocation = $('#courseLocation');
  const courseDetails = $('#courseDetails');
  const courseWebsite = $('#courseWebsite');
  let coursesData = [];
  let selectedCourseData = null;
  let searchTimeout = null;
  
  const CACHE_KEY = 'golfCourseCache';
  const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  function getCachedCourses(query) {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return null;
      
      const cache = JSON.parse(cached);
      const cacheKey = query || '_default';
      
      if (cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < CACHE_DURATION) {
        console.log(`Using cached courses for "${query || 'default'}"`);
        return cache[cacheKey].data;
      }
    } catch (e) {
      console.error('Cache read error:', e);
    }
    return null;
  }

  function setCachedCourses(query, courses) {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      const cache = cached ? JSON.parse(cached) : {};
      const cacheKey = query || '_default';
      
      cache[cacheKey] = {
        data: courses,
        timestamp: Date.now()
      };
      
      // Keep cache size reasonable - remove entries older than 7 days
      const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      Object.keys(cache).forEach(key => {
        if (cache[key].timestamp < weekAgo) {
          delete cache[key];
        }
      });
      
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      console.log(`Cached courses for "${query || 'default'}"`);
    } catch (e) {
      console.error('Cache write error:', e);
    }
  }

  async function searchGolfCourses(query) {
    if (!query || query.length < 2) {
      // Load default local courses for short queries
      await loadDefaultCourses();
      return;
    }
    
    // Check cache first
    const cached = getCachedCourses(query);
    if (cached) {
      coursesData = cached;
      updateCourseList(cached);
      return;
    }
    
    try {
      // Search API with the typed query
      const courses = await api(`/api/golf-courses/search?q=${encodeURIComponent(query)}`);
      coursesData = courses;
      
      // Cache the results
      setCachedCourses(query, courses);
      
      updateCourseList(courses);
    } catch (err) {
      console.error('Failed to search golf courses:', err);
      // Fall back to loading all courses on error
      await loadDefaultCourses();
    }
  }
  
  function updateCourseList(courses) {
    if (!courseList) return;
    
    courseList.innerHTML = '';
    courses.forEach((course) => {
      const option = document.createElement('option');
      option.value = course.name;
      courseList.appendChild(option);
    });
  }

  async function loadDefaultCourses() {
    // Check cache first
    const cached = getCachedCourses('');
    if (cached) {
      coursesData = cached;
      updateCourseList(cached);
      return;
    }
    
    try {
      const courses = await api('/api/golf-courses/list?limit=20');
      coursesData = courses;
      
      // Cache the default courses
      setCachedCourses('', courses);
      
      updateCourseList(courses);
    } catch (err) {
      console.error('Failed to load default courses:', err);
    }
  }

  async function loadGolfCourses() {
    // Clear datalist and coursesData to force dynamic search
    coursesData = [];
    if (courseList) courseList.innerHTML = '';
    if (courseInfoCard) courseInfoCard.style.display = 'none';
    if (courseSearch) courseSearch.value = '';
    selectedCourseData = null;
  }

  // Display course info when course is selected/typed
  function displayCourseInfo(course) {
    if (!course || !courseInfoCard) return;
    
    selectedCourseData = course;
    
    // Location
    const location = [course.city, course.state].filter(Boolean).join(', ');
    courseLocation.textContent = location ? `📍 ${location}` : '';
    
    // Details (holes, par, phone)
    const details = [];
    if (course.holes) details.push(`${course.holes} holes`);
    if (course.par) details.push(`Par ${course.par}`);
    if (course.phone) details.push(`📞 ${course.phone}`);
    
    courseDetails.innerHTML = details.map(d => `<span>${d}</span>`).join('');
    
    // Website
    if (course.website) {
      courseWebsite.innerHTML = `<a href="${course.website}" target="_blank" style="color:#15803d;text-decoration:none;font-size:12px;display:inline-flex;align-items:center;gap:4px">🌐 Visit Website</a>`;
    } else {
      courseWebsite.innerHTML = '';
    }
    
    courseInfoCard.style.display = 'block';
  }

  // Weather preview on date selection
  const dateInput = $('#dateInput');
  const weatherPreview = $('#weatherPreview');
  
  if (dateInput && weatherPreview) {
    dateInput.addEventListener('change', async (e) => {
      const selectedDate = e.target.value;
      if (!selectedDate) {
        weatherPreview.style.display = 'none';
        return;
      }
      
      // Show loading state
      weatherPreview.style.display = 'block';
      weatherPreview.innerHTML = '<div style="color:#3b82f6;font-size:13px">Loading weather...</div>';
      
      // Simple date validation - show weather emoji based on how far in future
      const daysUntil = Math.ceil((new Date(selectedDate) - new Date()) / (1000 * 60 * 60 * 24));
      
      if (daysUntil > 16) {
        weatherPreview.innerHTML = '<div style="font-size:13px;color:#6b7280">⛅ Weather forecast available closer to date</div>';
      } else if (daysUntil < 0) {
        weatherPreview.style.display = 'none';
      } else {
        // Show generic preview (actual weather will be fetched on backend)
        weatherPreview.innerHTML = `<div style="font-size:13px;color:#1e40af">
          <span style="font-size:20px">🌤️</span> Weather forecast will be added automatically
        </div>`;
      }
    });
  }

  // Load courses when modal opens
  if (newTeeBtn) {
    newTeeBtn.addEventListener('click', () => {
      loadGolfCourses();
    });
  }
  
  if (newTeamBtn) {
    newTeamBtn.addEventListener('click', () => {
      loadGolfCourses();
    });
  }

  // Handle course search input with debounced API search
  if (courseSearch) {
    // Handle Enter key to submit form
    courseSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        // Find the submit button and click it
        const submitBtn = eventForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.click();
      }
    });
    
    courseSearch.addEventListener('input', (e) => {
      const value = e.target.value;
      
      // Clear previous timeout
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
      
      // Debounce API search (wait 300ms after user stops typing)
      searchTimeout = setTimeout(() => {
        searchGolfCourses(value);
      }, 300);
      
      // Find exact match in current coursesData
      const course = coursesData.find(c => c.name === value);
      
      if (course) {
        // Exact match found - show course info
        displayCourseInfo(course);
      } else {
        // No match or partial input - hide course info
        courseInfoCard.style.display = 'none';
        selectedCourseData = null;
      }
    });
    
    // Also listen for selection from datalist
    courseSearch.addEventListener('change', (e) => {
      const value = e.target.value;
      const course = coursesData.find(c => c.name === value);
      
      if (course) {
        displayCourseInfo(course);
      } else if (value.trim() !== '') {
        // User typed custom course name
        courseInfoCard.style.display = 'none';
        selectedCourseData = null;
      }
    });
  }

  // Expose cache clearing function globally for debugging
  window.clearCourseCache = function() {
    try {
      localStorage.removeItem(CACHE_KEY);
      console.log('Course cache cleared!');
      return 'Course cache cleared successfully';
    } catch (e) {
      console.error('Failed to clear cache:', e);
      return 'Failed to clear cache';
    }
  };

  // Update only a single event card in the DOM
  async function updateEventCard(eventId, prefetchedEvent = null) {
    try {
      const ev = prefetchedEvent || await fetchEventById(eventId);
      if (!ev) return load(); // fallback
      upsertCachedEvent(ev);
      renderEventsForDate();
    } catch (e) {
      console.error('Failed to update event card:', e);
      load();
    }
  }

  applySiteProfile(defaultSiteProfile, currentSiteLinks);
  updateMobileFilterButtons();
  updateStarterModeButtons();
  updateLastUpdated('Loading…');
  initSiteProfile();
  load();
  startAutoRefresh();
})();







