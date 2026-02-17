import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['app', 'components', 'contexts', 'hooks', 'services', 'utils'];
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx']);

function read(rel: string) {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

function collectCodeFiles(dirRel: string, out: string[]) {
  const dirAbs = path.join(process.cwd(), dirRel);
  if (!fs.existsSync(dirAbs)) return;
  const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  for (const entry of entries) {
    const rel = path.join(dirRel, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      collectCodeFiles(rel, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (CODE_EXT.has(path.extname(entry.name))) {
      out.push(rel.split(path.sep).join('/'));
    }
  }
}

function allCodeFiles() {
  const files: string[] = [];
  for (const root of ROOTS) {
    collectCodeFiles(root, files);
  }
  return files.sort();
}

function linesMatching(content: string, pattern: RegExp) {
  const lineResults: Array<{ line: number; text: string }> = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (pattern.test(line)) {
      lineResults.push({ line: i + 1, text: line.trim() });
    }
  }
  return lineResults;
}

describe('url launch invariants', () => {
  it('forbidsDirectOpeners', () => {
    const allowedLinkingCalls = new Set(['services/externalLinks.ts', 'services/deepLinking.ts']);
    const allowedWindowOpen = new Set(['app/story-card.web.tsx', 'services/storyCards.ts']);

    const rules: Array<{
      label: string;
      pattern: RegExp;
      allow: Set<string>;
      requireExpoLinkingImport?: boolean;
    }> = [
      {
        label: 'namespaced openURL',
        pattern: /\b(?:ExpoLinking|Linking)\.openURL\s*\(/,
        allow: allowedLinkingCalls,
      },
      {
        label: 'namespaced canOpenURL',
        pattern: /\b(?:ExpoLinking|Linking)\.canOpenURL\s*\(/,
        allow: allowedLinkingCalls,
      },
      {
        label: 'bare openURL',
        pattern: /\bopenURL\s*\(/,
        allow: allowedLinkingCalls,
        requireExpoLinkingImport: true,
      },
      {
        label: 'bare canOpenURL',
        pattern: /\bcanOpenURL\s*\(/,
        allow: allowedLinkingCalls,
        requireExpoLinkingImport: true,
      },
      {
        label: 'openBrowserAsync',
        pattern: /\b(?:WebBrowser\.)?openBrowserAsync\s*\(/,
        allow: new Set<string>(),
      },
      {
        label: 'openAuthSessionAsync',
        pattern: /\b(?:WebBrowser\.)?openAuthSessionAsync\s*\(/,
        allow: new Set<string>(),
      },
      {
        label: 'window.open',
        pattern: /\bwindow\.open\s*\(/,
        allow: allowedWindowOpen,
      },
      {
        label: 'openDeepLink helper call',
        pattern: /\bopenDeepLink\s*\(/,
        allow: new Set(['services/deepLinking.ts']),
      },
    ];

    const violations: string[] = [];
    const files = allCodeFiles();
    for (const file of files) {
      const content = read(file);
      const hasExpoLinkingImport = /from\s+['"]expo-linking['"]/.test(content);
      for (const rule of rules) {
        if (rule.requireExpoLinkingImport && !hasExpoLinkingImport) continue;
        if (rule.allow.has(file)) continue;
        const hits = linesMatching(content, rule.pattern);
        for (const hit of hits) {
          violations.push(`${file}:${hit.line} [${rule.label}] ${hit.text}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps required wired screens on the guarded opener', () => {
    expect((read('app/(tabs)/explore.tsx').match(/openExternalLink\(/g) || []).length).toBeGreaterThanOrEqual(1);
    expect((read('app/spot.tsx').match(/openExternalLink\(/g) || []).length).toBeGreaterThanOrEqual(2);
    expect((read('app/settings.tsx').match(/openExternalLink\(/g) || []).length).toBeGreaterThanOrEqual(1);
    expect((read('app/support.tsx').match(/openExternalLink\(/g) || []).length).toBeGreaterThanOrEqual(3);
    expect((read('app/(tabs)/profile.tsx').match(/openExternalLink\(/g) || []).length).toBeGreaterThanOrEqual(3);
    expect((read('components/external-link.tsx').match(/openExternalLink\(/g) || []).length).toBeGreaterThanOrEqual(1);
  });

  it('limits mailto/tel/sms schemes to guarded launch files', () => {
    const allowedSchemeFiles = new Set([
      'app/settings.tsx',
      'app/support.tsx',
      'app/(tabs)/profile.tsx',
      'services/linkRouting.ts',
    ]);
    const violations: string[] = [];

    for (const file of allCodeFiles()) {
      const hits = linesMatching(read(file), /\b(?:mailto|tel|sms):/);
      if (!hits.length) continue;
      if (allowedSchemeFiles.has(file)) continue;
      for (const hit of hits) {
        violations.push(`${file}:${hit.line} ${hit.text}`);
      }
    }

    expect(violations).toEqual([]);
  });
});
