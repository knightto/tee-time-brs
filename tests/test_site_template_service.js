const assert = require('assert');
const { buildTeeTimesSiteTemplatePackage } = require('../services/siteTemplateService');

const pkg = buildTeeTimesSiteTemplatePackage({
  siteTitle: 'Blue Ridge Tee Times',
  shortTitle: 'BR Tee',
  groupName: 'Blue Ridge Weekend Group',
  clubName: 'Blue Ridge Shadows',
  clubRequestLabel: 'Request a Tee Time for Blue Ridge Shadows',
  primaryContactEmail: 'admin@blueridge.example',
  secondaryContactEmail: 'assistant@blueridge.example',
  clubRequestEmail: 'golfshop@blueridge.example',
  replyToEmail: 'reply@blueridge.example',
  supportPhone: '540-555-1000',
  clubPhone: '540-555-2000',
  smsPhone: '540-555-3000',
  adminAlertPhones: '540-555-4000\n540-555-5000',
  notes: 'Deploy for weekend group usage.',
});

assert.strictEqual(pkg.templateName, 'Tee Times Site Package');
assert.strictEqual(pkg.deploymentProfile.siteTitle, 'Blue Ridge Tee Times');
assert.strictEqual(pkg.deploymentProfile.clubName, 'Blue Ridge Shadows');
assert.strictEqual(pkg.deploymentProfile.secondaryContactEmail, 'assistant@blueridge.example');
assert.strictEqual(pkg.deploymentProfile.replyToEmail, 'reply@blueridge.example');
assert.strictEqual(pkg.contactDirectory.clubPhone, '540-555-2000');
assert.deepStrictEqual(pkg.contactDirectory.adminAlertPhones, ['540-555-4000', '540-555-5000']);
assert.strictEqual(pkg.features.includeTrips, true);
assert.ok(pkg.includedPages.some((entry) => entry.key === 'admin' && entry.enabled), 'Admin page should be included');
assert.ok(pkg.includedPages.some((entry) => entry.key === 'group-admin-lite' && entry.enabled), 'Minimal group admin page should be included');
assert.ok(pkg.sourceFiles.includes('/public/index.html'), 'Main tee-times page should be part of the package');
assert.ok(pkg.sourceFiles.includes('/public/group-admin-lite.html'), 'Starter group admin page should be part of the package');
assert.ok(pkg.sourceFiles.includes('/server.js'), 'Server entrypoint should be part of the package');
assert.ok(pkg.environment.some((entry) => entry.name === 'SITE_ADMIN_WRITE_CODE'), 'Package should document site admin env vars');
assert.ok(pkg.environment.some((entry) => entry.name === 'SITE_URL'), 'Package should document site URL env vars');
assert.ok(pkg.environment.some((entry) => entry.name === 'RESEND_API_KEY'), 'Package should document email env vars');
assert.ok(pkg.externalDependencies.some((entry) => entry.name === 'Render'), 'Package should document hosting dependency');
assert.ok(pkg.externalDependencies.some((entry) => entry.name === 'Resend'), 'Package should document email provider dependency');
assert.ok(pkg.externalDependencies.some((entry) => entry.name === 'MongoDB'), 'Package should document database dependency');
assert.ok(pkg.runtimeDependencies.some((entry) => entry.name === 'Node.js'), 'Package should document runtime dependency');
assert.ok(Array.isArray(pkg.deploymentLoe) && pkg.deploymentLoe.length >= 4, 'Package should include LOE planning rows');
assert.ok(String(pkg.deploymentGuide || '').includes('## LOE For Group Deployment'), 'Package should include a human-readable deployment guide');
assert.ok(String(pkg.deploymentGuide || '').includes('## Contact Directory'), 'Deployment guide should include contact directory section');
assert.ok(pkg.deploymentChecklist.length >= 4, 'Package should include deployment checklist items');
assert.ok(Array.isArray(pkg.starterArtifacts) && pkg.starterArtifacts.some((entry) => entry.path === '/public/group-admin-lite.html'), 'Package should include minimal group admin starter artifact');

console.log('test_site_template_service.js passed');
