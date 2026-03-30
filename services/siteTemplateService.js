function cleanString(value = '') {
  return String(value || '').trim();
}

function cleanEmail(value = '') {
  return cleanString(value).toLowerCase();
}

function cleanAccessCode(value = '') {
  return cleanString(value).replace(/\s+/g, '');
}

function cleanSlug(value = '') {
  const safe = cleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return safe || 'tee-times-group';
}

function cleanHexColor(value = '', fallback = '#173224') {
  const normalized = cleanString(value);
  if (/^#[0-9a-f]{3}$/i.test(normalized)) {
    const [, hex = ''] = normalized.match(/^#([0-9a-f]{3})$/i) || [];
    return `#${hex.split('').map((part) => `${part}${part}`).join('').toLowerCase()}`;
  }
  if (/^#[0-9a-f]{6}$/i.test(normalized)) return normalized.toLowerCase();
  return fallback;
}

function parseBool(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'y'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', 'n'].includes(normalized)) return false;
  return fallback;
}

function cleanStringList(value = '') {
  const entries = Array.isArray(value)
    ? value
    : String(value || '').split(/\r?\n|,/);
  return entries
    .map((entry) => cleanString(entry))
    .filter(Boolean);
}

function resolveFeatureFlag(input = {}, key = '', fallback = true) {
  if (!key) return fallback;
  if (Object.prototype.hasOwnProperty.call(input, key)) {
    return parseBool(input[key], fallback);
  }
  if (input.features && Object.prototype.hasOwnProperty.call(input.features, key)) {
    return parseBool(input.features[key], fallback);
  }
  return fallback;
}

function buildGroupRoutePaths(groupSlug = '') {
  const safeGroupSlug = cleanSlug(groupSlug);
  return {
    site: `/groups/${safeGroupSlug}`,
    admin: `/groups/${safeGroupSlug}/admin`,
    adminLite: `/groups/${safeGroupSlug}/admin-lite`,
    calendar: `/groups/${safeGroupSlug}/calendar.ics`,
  };
}

function buildTeeTimesSiteDeploymentProfile(input = {}, options = {}) {
  const siteTitle = cleanString(input.siteTitle) || 'Tee Times';
  const shortTitle = cleanString(input.shortTitle) || siteTitle;
  const groupName = cleanString(input.groupName) || 'Golf Group';
  const groupReference = cleanString(input.groupReference) || groupName;
  const clubName = cleanString(input.clubName) || groupName;
  const packageSlug = cleanSlug(input.packageSlug || siteTitle || groupName);
  const groupSlug = cleanSlug(input.groupSlug || packageSlug || groupName || siteTitle);
  const isMainGroup = groupSlug === 'main';
  const preserveBlankAccessCodes = Boolean(options && options.preserveBlankAccessCodes);
  const clubRequestLabel = cleanString(input.clubRequestLabel) || `Request a Tee Time for ${clubName}`;
  const primaryContactEmail = cleanEmail(input.primaryContactEmail) || 'admin@example.com';
  const secondaryContactEmail = cleanEmail(input.secondaryContactEmail) || '';
  const clubRequestEmail = cleanEmail(input.clubRequestEmail) || 'golfshop@example.com';
  const replyToEmail = cleanEmail(input.replyToEmail) || primaryContactEmail;
  const supportPhone = cleanString(input.supportPhone) || '';
  const clubPhone = cleanString(input.clubPhone) || '';
  const smsPhone = cleanString(input.smsPhone) || '';
  const adminAlertPhones = cleanStringList(input.adminAlertPhones);
  const themeColor = cleanHexColor(input.themeColor, '#173224');
  const iconAssetName = cleanString(input.iconAssetName) || 'brs-tee-manager-logo.png';
  const mongoDbName = cleanString(input.mongoDbName) || `${packageSlug.replace(/-/g, '_')}_db`;
  const notes = cleanString(input.notes) || 'Deploy this package as a branded instance of the current tee-times + admin stack.';
  const adminCode = cleanAccessCode(input.adminCode) || (preserveBlankAccessCodes ? '' : (isMainGroup ? '' : 'change-me'));
  const deleteCode = cleanAccessCode(input.deleteCode) || adminCode;
  const confirmCode = cleanAccessCode(input.confirmCode) || '';
  const inboundEmailAlias = cleanEmail(input.inboundEmailAlias) || `teetime+${groupSlug}@xenailexou.resend.app`;
  const sharedModuleDefault = isMainGroup;
  const features = {
    includeHandicaps: resolveFeatureFlag(input, 'includeHandicaps', sharedModuleDefault),
    includeTrips: resolveFeatureFlag(input, 'includeTrips', sharedModuleDefault),
    includeOutings: resolveFeatureFlag(input, 'includeOutings', sharedModuleDefault),
    includeNotifications: resolveFeatureFlag(input, 'includeNotifications', true),
    includeScheduler: resolveFeatureFlag(input, 'includeScheduler', true),
    includeBackups: resolveFeatureFlag(input, 'includeBackups', isMainGroup),
  };

  return {
    groupSlug,
    packageSlug,
    siteTitle,
    shortTitle,
    groupName,
    groupReference,
    clubName,
    clubRequestLabel,
    primaryContactEmail,
    secondaryContactEmail,
    clubRequestEmail,
    replyToEmail,
    supportPhone,
    clubPhone,
    smsPhone,
    adminAlertPhones,
    adminCode,
    deleteCode,
    confirmCode,
    inboundEmailAlias,
    themeColor,
    iconAssetName,
    mongoDbName,
    features,
    routePaths: buildGroupRoutePaths(groupSlug),
    notes,
  };
}

function buildMinimalGroupAdminPage({
  siteTitle,
  groupName,
  groupReference,
  groupSlug,
  packageSlug,
  themeColor,
  contactDirectory,
  routePaths,
}) {
  const jsonPayload = JSON.stringify(contactDirectory, null, 2);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${siteTitle} Contact Admin</title>
  <style>
    :root {
      --accent: ${themeColor};
      --ink: #10231c;
      --muted: #5b6b64;
      --line: #d8e0dc;
      --panel: #ffffff;
      --bg: #f3f6f4;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", Arial, sans-serif;
      background: linear-gradient(180deg, #f7faf8 0%, var(--bg) 100%);
      color: var(--ink);
      padding: 24px;
    }
    .shell {
      max-width: 880px;
      margin: 0 auto;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 24px;
      box-shadow: 0 20px 60px rgba(16, 35, 28, 0.08);
    }
    h1 { margin: 0 0 6px 0; font-size: 28px; }
    .meta { margin: 0 0 18px 0; color: var(--muted); }
    .note {
      margin: 0 0 18px 0;
      padding: 12px 14px;
      border-radius: 12px;
      background: #eef6f1;
      border: 1px solid #d5e6dc;
      color: #244236;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
    }
    label {
      display: grid;
      gap: 6px;
      font-size: 13px;
      font-weight: 700;
      color: var(--ink);
    }
    input, textarea {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 10px 12px;
      font: inherit;
    }
    textarea { min-height: 120px; }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 18px;
    }
    button {
      border: none;
      border-radius: 999px;
      padding: 10px 16px;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
      background: var(--accent);
      color: #fff;
    }
    button.secondary {
      background: #e7ece9;
      color: var(--ink);
    }
    pre {
      margin: 18px 0 0 0;
      padding: 14px;
      border-radius: 12px;
      background: #0f1d18;
      color: #eff7f2;
      overflow: auto;
      font-size: 12px;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <main class="shell">
    <h1>${siteTitle} Contact Admin</h1>
    <p class="meta">${groupReference || groupName} | group slug: ${groupSlug} | package slug: ${packageSlug}</p>
    <p class="note">Starter admin page for group-specific contact details. The live shared-stack deployment uses ${routePaths && routePaths.adminLite ? routePaths.adminLite : '/group-admin-lite.html'} for the dedicated group-operations admin surface covering tee times, subscribers, and group contacts. The main site keeps using the full admin page.</p>
    <form id="contactAdminForm">
      <div class="grid">
        <label>Primary Contact Email<input name="primaryContactEmail" type="email" value="${contactDirectory.primaryContactEmail || ''}"></label>
        <label>Secondary Contact Email<input name="secondaryContactEmail" type="email" value="${contactDirectory.secondaryContactEmail || ''}"></label>
        <label>Club Request Email<input name="clubRequestEmail" type="email" value="${contactDirectory.clubRequestEmail || ''}"></label>
        <label>Notification Reply-To Email<input name="replyToEmail" type="email" value="${contactDirectory.replyToEmail || ''}"></label>
        <label>Support Phone<input name="supportPhone" type="text" value="${contactDirectory.supportPhone || ''}"></label>
        <label>Club Phone<input name="clubPhone" type="text" value="${contactDirectory.clubPhone || ''}"></label>
        <label>SMS / Text Line<input name="smsPhone" type="text" value="${contactDirectory.smsPhone || ''}"></label>
      </div>
      <label style="margin-top:14px;">Admin Alert Phones (one per line)<textarea name="adminAlertPhones">${Array.isArray(contactDirectory.adminAlertPhones) ? contactDirectory.adminAlertPhones.join('\n') : ''}</textarea></label>
      <div class="actions">
        <button type="submit">Update Preview</button>
        <button type="button" class="secondary" id="downloadJsonBtn">Download Contact JSON</button>
      </div>
    </form>
    <pre id="contactPreview">${jsonPayload}</pre>
  </main>
  <script>
    const form = document.getElementById('contactAdminForm');
    const preview = document.getElementById('contactPreview');
    const downloadBtn = document.getElementById('downloadJsonBtn');

    function collectValues() {
      const data = Object.fromEntries(new FormData(form).entries());
      data.adminAlertPhones = String(data.adminAlertPhones || '')
        .split(/\\r?\\n/)
        .map((value) => value.trim())
        .filter(Boolean);
      return data;
    }

    function renderPreview() {
      preview.textContent = JSON.stringify(collectValues(), null, 2);
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      renderPreview();
    });

    downloadBtn.addEventListener('click', () => {
      renderPreview();
      const blob = new Blob([preview.textContent || '{}'], { type: 'application/json;charset=utf-8' });
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = 'group-contact-settings.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    });
  </script>
</body>
</html>`;
}

function buildTeeTimesSiteTemplatePackage(input = {}) {
  const deploymentProfile = buildTeeTimesSiteDeploymentProfile(input);
  const {
    groupSlug,
    packageSlug,
    siteTitle,
    shortTitle,
    groupName,
    groupReference,
    clubName,
    clubRequestLabel,
    primaryContactEmail,
    secondaryContactEmail,
    clubRequestEmail,
    replyToEmail,
    supportPhone,
    clubPhone,
    smsPhone,
    adminAlertPhones,
    adminCode,
    deleteCode,
    confirmCode,
    inboundEmailAlias,
    themeColor,
    iconAssetName,
    mongoDbName,
    features,
    routePaths,
    notes: packageNotes,
  } = deploymentProfile;

  const contactDirectory = {
    primaryContactEmail,
    secondaryContactEmail,
    clubRequestEmail,
    replyToEmail,
    supportPhone,
    clubPhone,
    smsPhone,
    adminAlertPhones,
  };

  const includedPages = [
    {
      key: 'tee-times',
      title: 'Main Tee Times',
      path: '/public/index.html',
      deployedPath: routePaths.site,
      enabled: true,
      category: 'core',
      notes: 'Calendar, tee-time events, team events, course search, weather, starter mode, and drag/drop player movement.',
    },
    {
      key: 'admin',
      title: 'Admin',
      path: '/public/admin.html',
      deployedPath: routePaths.admin,
      enabled: true,
      category: 'core',
      notes: 'Templates, backups, notifications, scheduler rules, quick actions, audit log, and subscriber tools.',
    },
    {
      key: 'group-admin-lite',
      title: 'Group Admin',
      path: '/public/group-admin-lite.html',
      deployedPath: routePaths.adminLite,
      enabled: true,
      category: 'core',
      notes: 'Starter group-only admin page for live tee-time maintenance, subscriber management, and group contact handoff details.',
    },
    {
      key: 'handicaps',
      title: 'Handicap Pages',
      path: '/public/handicaps.html',
      enabled: features.includeHandicaps,
      category: 'optional',
      notes: 'Handicap lookup and import/admin workflows.',
    },
    {
      key: 'trip-system',
      title: 'Trip Systems',
      path: '/public/myrtle/trip-2026.html',
      enabled: features.includeTrips,
      category: 'optional',
      notes: 'Trip/travel competition pages such as Myrtle Ryder Cup and Tin Cup page sets.',
    },
    {
      key: 'outings',
      title: 'Blue Ridge Outings',
      path: '/public/blue-ridge-outings.html',
      enabled: features.includeOutings,
      category: 'optional',
      notes: 'Separate outings registration flow with its own public and admin pages.',
    },
  ];

  const adminCapabilities = [
    'Create tee-time and team events',
    'Edit tee-time labels, start times, and team settings',
    'Move players across tee times with drag/drop and manual move tools',
    'Subscriber management and custom messaging',
    'Group-scoped admin and delete code ownership',
    'Weather refresh and course verification utilities',
    'Backup creation, restore, and schedule settings',
    'Notification and scheduled email rule controls',
    'Change-log visibility for tee-time modifications',
    'Template management from the admin page',
    'Group-only admin page for tee-time operations, subscriber maintenance, and contact details',
  ];

  const sourceFiles = [
    '/public/index.html',
    '/public/script.js',
    '/public/style.css',
    '/public/admin.html',
    '/public/group-admin-lite.html',
    '/public/manifest.json',
    '/public/pwa-shell.css',
    '/public/pwa-shell.js',
    '/public/service-worker.js',
    '/server.js',
    '/models/Event.js',
    '/models/TeeTimeLog.js',
  ];

  if (features.includeTrips) {
    sourceFiles.push('/routes/trips.js', '/services/tripTemplateService.js', '/services/tripCompetitionService.js');
  }
  if (features.includeOutings) {
    sourceFiles.push('/routes/outings.js', '/public/blue-ridge-outings.html', '/public/blue-ridge-outings-admin.html');
  }
  const environment = [
    { name: 'SITE_ADMIN_WRITE_CODE', required: true, description: 'Main-site admin code for BRS / super-admin access in a shared-stack deployment.' },
    { name: 'ADMIN_DELETE_CODE', required: true, description: 'Main-site delete/destructive admin code.' },
    { name: 'ADMIN_DESTRUCTIVE_CODE', required: false, description: 'Override destructive code if different from delete code.' },
    { name: 'ADMIN_DESTRUCTIVE_CONFIRM_CODE', required: false, description: 'Optional second confirmation code for destructive actions.' },
    { name: 'MONGO_URI', required: true, description: 'Primary MongoDB connection for tee times and site data.' },
    { name: 'MONGO_DB', required: false, description: `Optional explicit Mongo database name for the primary connection. Recommended for this group: ${mongoDbName}` },
    { name: 'MONGO_URI_SECONDARY', required: false, description: 'Secondary MongoDB connection for optional trip and outings modules.' },
    { name: 'SITE_URL', required: true, description: 'Canonical public site URL used in emails, links, and webhook follow-up fetches.' },
    { name: 'CORS_ORIGIN', required: false, description: 'Allowed frontend origin list for browser access.' },
    { name: 'LOCAL_TZ', required: false, description: 'Site timezone for scheduling, alerts, and date labeling.' },
    { name: 'ENABLE_SCHEDULER', required: false, description: 'Enable/disable the internal scheduler jobs.' },
    { name: 'CLUB_CANCEL_EMAIL', required: false, description: 'Recipient for tee-time request and tee cancellation emails.' },
    { name: 'CLUB_CANCEL_CC', required: false, description: 'Optional CC list for club request and cancellation emails.' },
    { name: 'ADMIN_EMAILS', required: false, description: 'Admin alert recipients for operational notifications.' },
    { name: 'RESEND_API_KEY', required: false, description: 'Resend API key for outbound email and inbound-email fetch support.' },
    { name: 'RESEND_FROM', required: false, description: 'Verified sender address for site emails.' },
    { name: 'RESEND_AUDIENCE_ID', required: false, description: 'Audience/list integration identifier if subscriber sync is used.' },
    { name: 'GOLF_API_KEY', required: false, description: 'Primary GolfCourseAPI key for course search/listing.' },
    { name: 'GOLF_API_KEY_BACKUP', required: false, description: 'Backup GolfCourseAPI key.' },
    { name: 'DEFAULT_LAT', required: false, description: 'Fallback weather/geocode latitude.' },
    { name: 'DEFAULT_LON', required: false, description: 'Fallback weather/geocode longitude.' },
  ];

  const externalDependencies = [
    {
      name: 'Render',
      type: 'hosting',
      required: true,
      purpose: 'Primary web hosting/runtime target assumed by the current deployment defaults.',
      touchpoints: ['SITE_URL default', 'Node web service deployment'],
    },
    {
      name: 'MongoDB',
      type: 'database',
      required: true,
      purpose: 'Primary persistence for tee times, subscribers, handicaps, admin settings, and logs.',
      touchpoints: ['MONGO_URI', 'MONGO_DB'],
    },
    {
      name: 'MongoDB Secondary',
      type: 'database',
      required: false,
      purpose: 'Secondary persistence for optional trip and outings modules.',
      touchpoints: ['MONGO_URI_SECONDARY'],
    },
    {
      name: 'Resend',
      type: 'email',
      required: false,
      purpose: 'Outbound email delivery and inbound email processing support for tee-time workflows.',
      touchpoints: ['RESEND_API_KEY', 'RESEND_FROM', 'webhooks/resend'],
    },
    {
      name: 'Resend SMTP',
      type: 'email',
      required: false,
      purpose: 'SMTP fallback path for email sending through smtp.resend.com.',
      touchpoints: ['nodemailer', 'RESEND_API_KEY'],
    },
    {
      name: 'GolfCourseAPI',
      type: 'course-data',
      required: false,
      purpose: 'Course search/list enrichment for the tee-times event builder.',
      touchpoints: ['GOLF_API_KEY', 'GOLF_API_KEY_BACKUP'],
    },
  ];

  const runtimeDependencies = [
    { name: 'Node.js', required: true, notes: 'CommonJS app with server-side fetch fallback support.' },
    { name: 'Express', required: true, notes: 'Primary HTTP server and route layer.' },
    { name: 'Mongoose', required: true, notes: 'MongoDB ODM for core and optional modules.' },
    { name: 'Nodemailer', required: false, notes: 'SMTP email transport fallback.' },
    { name: 'Resend SDK', required: false, notes: 'Email API integration dependency.' },
    { name: 'node-fetch', required: false, notes: 'Fetch polyfill for older Node runtimes.' },
    { name: 'Service Worker / PWA shell assets', required: true, notes: 'Offline shell and installable mobile behavior.' },
  ];

  const deploymentChecklist = [
    `Brand the site title, short title, icon, and theme color for ${groupName}.`,
    `Set the club request copy to "${clubRequestLabel}" and point club email flows to ${clubRequestEmail}.`,
    `Seed the minimal group admin page with contact emails and phones for ${groupName}.`,
    `Assign dedicated group access codes for ${groupName}: admin=${adminCode || 'set manually'}, delete=${deleteCode || 'set manually'}${confirmCode ? `, confirm=${confirmCode}` : ''}.`,
    `Verify the dedicated URLs for the public page (${routePaths.site}), full admin (${routePaths.admin}), group operations admin (${routePaths.adminLite}), and calendar feed (${routePaths.calendar}).`,
    `Use the inbound tee-time alias ${inboundEmailAlias} or a [group:${groupSlug}] subject tag if this group will use email-driven tee-time imports.`,
    'Configure site admin, destructive action, URL, and database environment variables.',
    'Provision hosting/runtime on Render or an equivalent Node web-service platform.',
    'Configure outbound email through Resend and verify sender/domain settings if email flows are enabled.',
    'Configure inbound Resend webhook/email routing if the group will use email-driven tee-time updates.',
    'Provision GolfCourseAPI credentials if course search/list enrichment should remain enabled.',
    'Decide which optional modules ship for this group: handicaps, trips, and outings.',
    'Review subscriber, scheduler, and backup settings after first deploy.',
    'Test the main tee-times page, admin page, and each enabled optional module before launch.',
  ];

  const deploymentLoe = [
    { phase: 'Branding and package decisions', loe: '1-2 hours', notes: 'Finalize group name, site title, icon, theme, enabled modules, and contact details.' },
    { phase: 'Infrastructure and environment setup', loe: '2-4 hours', notes: 'Provision Render service, MongoDB connection(s), environment variables, and DNS/domain settings if needed.' },
    { phase: 'Email and webhook setup', loe: '1-3 hours', notes: 'Configure Resend sender identity, API key, SMTP fallback expectations, and inbound webhook/email routing if used.' },
    { phase: 'Module configuration', loe: '1-3 hours', notes: 'Review handicaps, trips, outings, scheduler, backup, and notification settings for the group.' },
    { phase: 'QA and launch', loe: '1-2 hours', notes: 'Smoke test tee times, admin, subscriber flows, club requests, and any enabled optional systems.' },
  ];

  const deploymentGuide = [
    `# ${siteTitle} Deployment Package`,
    '',
    '## Purpose',
    `This package defines a branded deployment profile for the Tee Times platform for ${groupName}. It includes the core tee-times page, admin controls, optional modules, infrastructure assumptions, and rollout guidance.`,
    '',
    '## Deployment Profile',
    `- Site title: ${siteTitle}`,
    `- Short app title: ${shortTitle}`,
    `- Group name: ${groupName}`,
    `- Group reference: ${groupReference}`,
    `- Group slug: ${groupSlug}`,
    `- Package slug: ${packageSlug}`,
    `- Club name: ${clubName}`,
    `- Club request label: ${clubRequestLabel}`,
    `- Primary contact email: ${primaryContactEmail}`,
    `- Club request email: ${clubRequestEmail}`,
    `- Secondary contact email: ${secondaryContactEmail || 'Not specified'}`,
    `- Reply-to email: ${replyToEmail || 'Not specified'}`,
    `- Group admin code: ${adminCode || 'Not specified'}`,
    `- Group delete code: ${deleteCode || 'Not specified'}`,
    `- Group destructive confirm code: ${confirmCode || 'Not specified'}`,
    `- Inbound email alias: ${inboundEmailAlias}`,
    `- Support phone: ${supportPhone || 'Not specified'}`,
    `- Club phone: ${clubPhone || 'Not specified'}`,
    `- SMS phone: ${smsPhone || 'Not specified'}`,
    `- Admin alert phones: ${adminAlertPhones.length ? adminAlertPhones.join(', ') : 'Not specified'}`,
    `- Theme color: ${themeColor}`,
    `- Icon asset: ${iconAssetName}`,
    `- Recommended Mongo DB name: ${mongoDbName}`,
    '',
    '## Dedicated URLs',
    `- Public page: ${routePaths.site}`,
    `- Full admin: ${routePaths.admin}`,
    `- Group operations admin: ${routePaths.adminLite}`,
    `- Calendar feed: ${routePaths.calendar}`,
    `- Inbound email alias: ${inboundEmailAlias}`,
    '',
    '## Enabled Modules',
    `- Handicaps: ${features.includeHandicaps ? 'Yes' : 'No'}`,
    `- Trips: ${features.includeTrips ? 'Yes' : 'No'}`,
    `- Outings: ${features.includeOutings ? 'Yes' : 'No'}`,
    `- Notifications: ${features.includeNotifications ? 'Yes' : 'No'}`,
    `- Scheduler: ${features.includeScheduler ? 'Yes' : 'No'}`,
    `- Backups: ${features.includeBackups ? 'Yes' : 'No'}`,
    '',
    '## External Dependencies',
    ...externalDependencies.map((entry) => `- ${entry.name} (${entry.type})${entry.required ? ' [required]' : ' [optional]'}: ${entry.purpose}. Touchpoints: ${entry.touchpoints.join(', ')}`),
    '',
    '## Environment Variables',
    ...environment.map((entry) => `- ${entry.name}${entry.required ? ' [required]' : ' [optional]'}: ${entry.description}`),
    '',
    '## Shared-Stack Isolation Notes',
    '- In the shared-stack deployment model, group-specific admin/delete/confirm codes are stored in the group site profile rather than in top-level environment variables.',
    '- Non-main groups default to handicaps, trips, and outings disabled so they do not surface shared BRS modules unless you explicitly enable them.',
    '- Each group should keep its own inbound tee-time alias and contact routing values to avoid cross-group operational overlap.',
    '',
    '## Contact Directory',
    `- Primary contact email: ${primaryContactEmail}`,
    `- Secondary contact email: ${secondaryContactEmail || 'Not specified'}`,
    `- Club request email: ${clubRequestEmail}`,
    `- Notification reply-to email: ${replyToEmail || 'Not specified'}`,
    `- Group admin code: ${adminCode || 'Not specified'}`,
    `- Group delete code: ${deleteCode || 'Not specified'}`,
    `- Group destructive confirm code: ${confirmCode || 'Not specified'}`,
    `- Support phone: ${supportPhone || 'Not specified'}`,
    `- Club phone: ${clubPhone || 'Not specified'}`,
    `- SMS phone: ${smsPhone || 'Not specified'}`,
    `- Admin alert phones: ${adminAlertPhones.length ? adminAlertPhones.join(', ') : 'Not specified'}`,
    '',
    '## Starter Admin Artifact',
    '- `/public/group-admin-lite.html`: group-only admin page for tee-time maintenance, subscriber management, and group contacts.',
    '',
    '## Source Files Included In Scope',
    ...sourceFiles.map((entry) => `- ${entry}`),
    '',
    '## Deployment Checklist',
    ...deploymentChecklist.map((entry, index) => `${index + 1}. ${entry}`),
    '',
    '## LOE For Group Deployment',
    ...deploymentLoe.map((entry) => `- ${entry.phase}: ${entry.loe}. ${entry.notes}`),
    '',
    '## Notes',
    packageNotes,
    '',
  ].join('\n');

  const starterArtifacts = [
    {
      path: '/public/group-admin-lite.html',
      description: 'Minimal admin page for tee-time maintenance, subscriber management, and group contacts.',
      contentType: 'text/html',
      content: buildMinimalGroupAdminPage({
        siteTitle,
        groupName,
        groupReference,
        groupSlug,
        packageSlug,
        themeColor,
        contactDirectory,
        routePaths,
      }),
    },
  ];

  return {
    templateName: 'Tee Times Site Package',
    packageVersion: 2,
    packageSlug,
    packageLabel: `${siteTitle} tee-times-site-package`,
    deploymentProfile,
    deploymentLinks: routePaths,
    contactDirectory,
    features,
    includedPages,
    adminCapabilities,
    sourceFiles,
    environment,
    externalDependencies,
    runtimeDependencies,
    deploymentChecklist,
    deploymentLoe,
    deploymentGuide,
    starterArtifacts,
    notes: packageNotes,
  };
}

module.exports = {
  buildGroupRoutePaths,
  buildTeeTimesSiteDeploymentProfile,
  buildTeeTimesSiteTemplatePackage,
};
