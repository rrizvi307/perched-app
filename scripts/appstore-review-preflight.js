#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

let failures = 0;
let warnings = 0;

function relPath(parts) {
  return path.join(ROOT, ...parts);
}

function readText(parts) {
  const filePath = relPath(parts);
  return fs.readFileSync(filePath, 'utf8');
}

function exists(parts) {
  return fs.existsSync(relPath(parts));
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

function contains(text, pattern) {
  if (pattern instanceof RegExp) return pattern.test(text);
  return text.includes(pattern);
}

function semverAtLeast(value, target) {
  const parse = (input) => {
    const base = String(input || '')
      .trim()
      .replace(/^v/i, '')
      .split('-')[0];
    const raw = base.split('.');
    return [0, 1, 2].map((idx) => Number(raw[idx] || 0));
  };

  const a = parse(value);
  const b = parse(target);
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return true;
}

function main() {
  process.stdout.write('[appstore:preflight] validating App Review remediation checks\n');

  check(exists(['app.json']), 'app.json exists', 'app.json missing');
  check(exists(['app', '(tabs)', 'feed.tsx']), 'feed screen exists', 'app/(tabs)/feed.tsx missing');
  check(exists(['services', 'mapsLinks.ts']), 'maps link service exists', 'services/mapsLinks.ts missing');
  check(exists(['app', 'settings.tsx']), 'settings screen exists', 'app/settings.tsx missing');
  check(exists(['app', 'support.tsx']), 'support screen exists', 'app/support.tsx missing');

  let appJson = null;
  try {
    appJson = JSON.parse(readText(['app.json']));
  } catch (error) {
    check(false, '', `Unable to parse app.json: ${String(error?.message || error)}`);
  }

  if (appJson && appJson.expo) {
    const expo = appJson.expo || {};
    const ios = expo.ios || {};
    const version = String(expo.version || '');
    const buildNumber = Number(ios.buildNumber || 0);

    check(
      semverAtLeast(version, '1.2.0'),
      `App version is >= 1.2.0 (${version})`,
      `App version must be >= 1.2.0 for resubmission, found ${version || 'unset'}`
    );
    check(
      Number.isFinite(buildNumber) && buildNumber >= 3,
      `iOS buildNumber is >= 3 (${ios.buildNumber})`,
      `iOS buildNumber must be >= 3, found ${ios.buildNumber || 'unset'}`
    );
    check(
      ios.supportsTablet === true,
      'iOS supportsTablet is enabled',
      'iOS supportsTablet must be true for iPad review coverage'
    );
  }

  const feed = readText(['app', '(tabs)', 'feed.tsx']);
  check(
    contains(feed, /if\s*\(!beginAction\(profileActionKey\)\)\s*return;/),
    'Feed profile tap action lock exists',
    'Feed profile tap lock is missing'
  );
  check(
    contains(feed, /if\s*\(!beginAction\(closeActionKey\)\)\s*return;/),
    'Feed close-friend action lock exists',
    'Feed close-friend action lock is missing'
  );
  check(
    contains(feed, /if\s*\(!beginAction\(reportActionKey\)\)\s*return;/),
    'Feed report action lock exists',
    'Feed report action lock is missing'
  );
  check(
    contains(feed, /if\s*\(!beginAction\(blockActionKey\)\)\s*return;/),
    'Feed block action lock exists',
    'Feed block action lock is missing'
  );
  check(
    contains(feed, 'disabled={profilePending}') &&
      contains(feed, 'disabled={closePending}') &&
      contains(feed, 'disabled={reportPending}') &&
      contains(feed, 'disabled={blockPending}'),
    'Feed action buttons have pending disabled states',
    'One or more feed action buttons are missing disabled pending states'
  );
  check(
    contains(feed, 'router.push(`/profile-view?uid='),
    'Feed profile navigation route exists',
    'Feed profile navigation route missing'
  );
  check(
    contains(feed, "showToast('Report submitted. This check-in was hidden from your feed.', 'success')"),
    'Feed report success user feedback exists',
    'Feed report success feedback toast missing'
  );
  check(
    contains(feed, "showToast('User blocked and hidden from your feed.', 'success')"),
    'Feed block success user feedback exists',
    'Feed block success feedback toast missing'
  );
  check(
    !contains(feed, /Alert\.alert\(/),
    'Feed avoids blocking Alert.alert for report/block flow',
    'Feed still uses Alert.alert in interaction path'
  );

  const friends = readText(['app', 'friends.tsx']);
  check(
    !contains(friends, /Alert\.alert\(/),
    'Friends screen uses non-blocking toast error handling',
    'Friends screen still contains Alert.alert calls'
  );

  const mapsLinks = readText(['services', 'mapsLinks.ts']);
  check(
    contains(mapsLinks, 'buildAppleMapsUrl') &&
      contains(mapsLinks, 'ActionSheetIOS') &&
      contains(mapsLinks, 'Apple Maps') &&
      contains(mapsLinks, 'Google Maps'),
    'Apple Maps option + iOS chooser implemented',
    'Apple Maps option flow is incomplete in services/mapsLinks.ts'
  );

  const spot = readText(['app', 'spot.tsx']);
  const explore = readText(['app', '(tabs)', 'explore.tsx']);
  check(
    contains(spot, 'openInMaps(') || contains(explore, 'openInMaps('),
    'At least one user maps entry-point calls openInMaps()',
    'No maps entry-point found calling openInMaps()'
  );

  const settings = readText(['app', 'settings.tsx']);
  check(
    contains(settings, "router.push('/privacy')") &&
      contains(settings, "router.push('/terms')") &&
      contains(settings, "router.push('/support')"),
    'Settings links route to Privacy/Terms/Support screens',
    'One or more Settings legal/support routes are missing'
  );

  const hasResubmissionDoc = exists(['APPSTORE_RESUBMISSION_CHECKLIST.md']);
  check(
    hasResubmissionDoc,
    'App Store resubmission checklist doc exists',
    'Missing APPSTORE_RESUBMISSION_CHECKLIST.md'
  );

  if (hasResubmissionDoc) {
    const doc = readText(['APPSTORE_RESUBMISSION_CHECKLIST.md']);
    check(
      contains(doc, '2.1.0') && contains(doc, '4.0.0') && contains(doc, '2.3.3'),
      'Resubmission doc tracks all cited App Review guidelines',
      'Resubmission doc must explicitly include 2.1.0, 4.0.0, and 2.3.3'
    );
  }

  warn('Manual step required: upload new native iPad screenshots in App Store Connect (Guideline 2.3.3).');
  warn('Manual step required: run iPad release-build smoke test and capture evidence before resubmission.');

  process.stdout.write('\n');
  if (failures > 0) {
    process.stderr.write(
      `[appstore:preflight] failed with ${failures} issue${failures === 1 ? '' : 's'} (${warnings} warning${warnings === 1 ? '' : 's'}).\n`
    );
    process.exit(1);
  }
  process.stdout.write(
    `[appstore:preflight] passed with ${warnings} warning${warnings === 1 ? '' : 's'} (manual App Store Connect actions remain).\n`
  );
}

main();
