#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

let failures = 0;
let warnings = 0;

const REQUIRED_CONSUMER_ROUTES = [
  ['app', 'index.tsx'],
  ['app', 'signin.tsx'],
  ['app', 'signup.tsx'],
  ['app', 'verify.tsx'],
  ['app', 'reset.tsx'],
  ['app', 'checkin.tsx'],
  ['app', 'spot.tsx'],
  ['app', 'settings.tsx'],
  ['app', 'support.tsx'],
  ['app', 'privacy.tsx'],
  ['app', 'terms.tsx'],
  ['app', 'delete-account.tsx'],
  ['app', 'find-friends.tsx'],
  ['app', 'profile-view.tsx'],
  ['app', 'my-posts.tsx'],
  ['app', '(tabs)', '_layout.tsx'],
  ['app', '(tabs)', 'feed.tsx'],
  ['app', '(tabs)', 'explore.tsx'],
  ['app', '(tabs)', 'friends.tsx'],
  ['app', '(tabs)', 'profile.tsx'],
];

function relPath(parts) {
  return path.join(ROOT, ...parts);
}

function readText(parts) {
  return fs.readFileSync(relPath(parts), 'utf8');
}

function exists(parts) {
  return fs.existsSync(relPath(parts));
}

function contains(text, pattern) {
  if (pattern instanceof RegExp) return pattern.test(text);
  return text.includes(pattern);
}

function check(condition, okMessage, failMessage) {
  if (condition) {
    process.stdout.write(`PASS  ${okMessage}\n`);
    return;
  }
  failures += 1;
  process.stderr.write(`FAIL  ${failMessage}\n`);
}

function warn(message) {
  warnings += 1;
  process.stdout.write(`WARN  ${message}\n`);
}

function requireDocSections(docText, docLabel, sections) {
  sections.forEach((section) => {
    check(
      contains(docText, section),
      `${docLabel} includes "${section}"`,
      `${docLabel} is missing "${section}"`
    );
  });
}

function main() {
  process.stdout.write('[audit:testflight] validating consumer launch readiness\n');

  REQUIRED_CONSUMER_ROUTES.forEach((parts) => {
    check(exists(parts), `${parts.join('/')} exists`, `${parts.join('/')} is missing`);
  });

  check(
    exists(['docs', 'testflight-readiness-audit.md']),
    'TestFlight readiness audit doc exists',
    'docs/testflight-readiness-audit.md is missing'
  );
  check(
    exists(['docs', 'app-store.md']),
    'App Store doc exists',
    'docs/app-store.md is missing'
  );
  check(
    exists(['docs', 'operations.md']),
    'Operations doc exists',
    'docs/operations.md is missing'
  );
  check(
    exists(['docs', 'release-readiness.md']),
    'Release readiness tracker exists',
    'docs/release-readiness.md is missing'
  );

  let packageJson = null;
  try {
    packageJson = JSON.parse(readText(['package.json']));
  } catch (error) {
    check(false, '', `Unable to parse package.json: ${String(error?.message || error)}`);
  }

  if (packageJson) {
    const scripts = packageJson.scripts || {};
    check(
      scripts['audit:testflight'] === 'node ./scripts/testflight-readiness-audit.js',
      'package.json exposes audit:testflight',
      'package.json must define audit:testflight -> node ./scripts/testflight-readiness-audit.js'
    );
    ['check:all', 'preflight', 'appstore:preflight', 'auth:smoke-check', 'place-provider:smoke-check', 'post-deploy:smoke-check'].forEach((name) => {
      check(
        typeof scripts[name] === 'string' && scripts[name].trim().length > 0,
        `package.json exposes ${name}`,
        `package.json is missing required script ${name}`
      );
    });
  }

  if (exists(['docs', 'testflight-readiness-audit.md'])) {
    const auditDoc = readText(['docs', 'testflight-readiness-audit.md']);
    requireDocSections(auditDoc, 'TestFlight readiness audit doc', [
      '# TestFlight Readiness Audit',
      '## Scope',
      '## Automated Gate',
      '## Consumer Launch Matrix',
      '## Manual Device Matrix',
      '## Auth State Matrix',
      '## Proxy-Only Parity Run',
      '## Go / No-Go Rule',
      'FORCE_PROXY_ONLY',
      'Premium',
      'campus',
      'business',
      'admin',
    ]);
  }

  if (exists(['docs', 'app-store.md'])) {
    const appStoreDoc = readText(['docs', 'app-store.md']);
    requireDocSections(appStoreDoc, 'App Store doc', [
      '## Human Tester Checklist',
      '### Device Matrix',
      '### Auth And Account',
      '### Core Product',
      '### Permissions',
      '### Explore, Feed, And Navigation',
      '### Social, Safety, And Profile',
      '### Premium And Monetization',
      '### Submit Or Hold',
    ]);
  }

  if (exists(['docs', 'operations.md'])) {
    const operationsDoc = readText(['docs', 'operations.md']);
    check(
      contains(operationsDoc, 'Smoke test auth, check-in creation, photo upload, and account deletion on a release build.'),
      'Operations doc includes release-build smoke coverage',
      'docs/operations.md must include auth/check-in/photo/account deletion smoke guidance'
    );
    check(
      contains(operationsDoc, 'Keep a dedicated production smoke-test account and run the auth smoke check before every App Store submission.'),
      'Operations doc requires a production smoke-test account',
      'docs/operations.md must require a dedicated production smoke-test account'
    );
    check(
      contains(operationsDoc, 'npm run audit:testflight'),
      'Operations doc includes audit:testflight in the command gate',
      'docs/operations.md must include audit:testflight in the command gate'
    );
  }

  if (exists(['docs', 'release-readiness.md'])) {
    const releaseDoc = readText(['docs', 'release-readiness.md']);
    check(
      contains(releaseDoc, 'audit:testflight'),
      'Release readiness tracker references audit:testflight',
      'docs/release-readiness.md must reference audit:testflight'
    );
    check(
      contains(releaseDoc, 'proxy-only'),
      'Release readiness tracker references proxy-only parity testing',
      'docs/release-readiness.md must call out proxy-only parity testing'
    );
  }

  const tabLayout = readText(['app', '(tabs)', '_layout.tsx']);
  ['name="feed"', 'name="explore"', 'name="friends"', 'name="profile"'].forEach((token) => {
    check(
      contains(tabLayout, token),
      `Tabs layout includes ${token.replace('name="', '').replace('"', '')}`,
      `Tabs layout is missing ${token}`
    );
  });
  check(
    contains(tabLayout, "router.push('/checkin')"),
    'Tabs layout exposes a check-in entry point',
    'Tabs layout must route to /checkin'
  );
  check(
    contains(tabLayout, "router.push('/settings' as any)"),
    'Tabs layout exposes a settings entry point',
    'Tabs layout must route to /settings'
  );

  const signIn = readText(['app', 'signin.tsx']);
  check(
    contains(signIn, "router.push('/reset')"),
    'Sign-in screen links to reset password',
    'app/signin.tsx must route to /reset'
  );
  check(
    contains(signIn, "router.push('/terms')") && contains(signIn, "router.push('/privacy')"),
    'Sign-in screen links to Terms and Privacy',
    'app/signin.tsx must link to /terms and /privacy'
  );

  const signUp = readText(['app', 'signup.tsx']);
  check(
    contains(signUp, "router.push('/terms')") && contains(signUp, "router.push('/privacy')"),
    'Sign-up screen links to Terms and Privacy',
    'app/signup.tsx must link to /terms and /privacy'
  );

  const settings = readText(['app', 'settings.tsx']);
  check(
    contains(settings, "router.push('/privacy')") &&
      contains(settings, "router.push('/terms')") &&
      contains(settings, "router.push('/support')") &&
      contains(settings, "router.push('/delete-account' as any)"),
    'Settings screen routes to legal/support/delete-account flows',
    'app/settings.tsx must route to /privacy, /terms, /support, and /delete-account'
  );

  const profile = readText(['app', '(tabs)', 'profile.tsx']);
  check(
    contains(profile, "router.push('/subscription' as any)") || contains(profile, "router.push('/upgrade')"),
    'Profile still exposes premium upgrade surfaces for degradation checks',
    'app/(tabs)/profile.tsx should expose the premium surface if launch UI still references it'
  );

  const feed = readText(['app', '(tabs)', 'feed.tsx']);
  if (contains(feed, "router.push('/campus-leaderboard' as any)")) {
    warn('Feed exposes a gated campus leaderboard path; keep it covered in manual testing when a user has campus set.');
  }

  const consumerSurfaceText = [
    readText(['app', 'index.tsx']),
    signIn,
    signUp,
    settings,
    readText(['app', 'checkin.tsx']),
    readText(['app', 'spot.tsx']),
    readText(['app', 'find-friends.tsx']),
    readText(['app', 'profile-view.tsx']),
    readText(['app', 'my-posts.tsx']),
    readText(['app', '(tabs)', 'feed.tsx']),
    readText(['app', '(tabs)', 'explore.tsx']),
    readText(['app', '(tabs)', 'friends.tsx']),
    profile,
  ].join('\n');

  check(
    !/\/business(\/|['"`])/m.test(consumerSurfaceText),
    'Consumer launch surfaces do not route directly to business pages',
    'Consumer launch surfaces should not link directly to /business routes'
  );
  check(
    !/\/admin-[\w-]+['"`)]/m.test(consumerSurfaceText),
    'Consumer launch surfaces do not route directly to admin pages',
    'Consumer launch surfaces should not link directly to /admin-* routes'
  );

  const runtimeFlags = readText(['services', 'runtimeFlags.ts']);
  const googleMaps = readText(['services', 'googleMaps.ts']);
  check(
    contains(runtimeFlags, 'FORCE_PROXY_ONLY'),
    'Runtime flags expose FORCE_PROXY_ONLY',
    'services/runtimeFlags.ts must expose FORCE_PROXY_ONLY'
  );
  check(
    contains(googleMaps, 'isClientProviderCallsEnabled'),
    'Google Maps service honors the client-provider runtime flag',
    'services/googleMaps.ts must honor isClientProviderCallsEnabled() for proxy-only parity runs'
  );

  const readme = readText(['docs', 'README.md']);
  check(
    contains(readme, 'testflight-readiness-audit.md'),
    'Docs index links to the TestFlight readiness audit',
    'docs/README.md must link to docs/testflight-readiness-audit.md'
  );

  if (failures > 0) {
    process.stderr.write(`\n[audit:testflight] ${failures} failure(s), ${warnings} warning(s)\n`);
    process.exit(1);
  }

  process.stdout.write(`\n[audit:testflight] consumer launch audit passed with ${warnings} warning(s)\n`);
}

main();
