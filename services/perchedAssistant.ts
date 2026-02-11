export type ExploreVibe = 'all' | 'quiet' | 'study' | 'social' | 'late' | 'cowork';
export type OpenFilter = 'all' | 'open' | 'closed';
export type NoisePreference = 'any' | 'quiet' | 'moderate' | 'lively';
export type WifiPreference = 'any' | 'fast' | 'ok';
export type BusynessPreference = 'any' | 'empty' | 'moderate' | 'busy';

export type OutletPreference = 'any' | 'has-outlets';

export type PerchedIntent = {
  raw: string;
  vibe: ExploreVibe;
  openFilter: OpenFilter;
  tags: string[];
  // Utility metric filters
  wifiSpeed: WifiPreference;
  noiseLevel: NoisePreference;
  busyness: BusynessPreference;
  outlets: OutletPreference;
};

const TAG_CANONICAL: Array<{ match: RegExp; tag: string }> = [
  { match: /\bwi[\s-]?fi\b|\binternet\b|\bwireless\b/g, tag: 'Wi-Fi' },
  { match: /\boutlet(s)?\b|\bpower\b|\bcharger\b|\bcharging\b/g, tag: 'Outlets' },
  { match: /\bseat(s)?\b|\bseating\b|\bbooth\b|\bchair(s)?\b|\bbench\b/g, tag: 'Seating' },
  { match: /\bbright\b|\bsun(light)?\b|\bnatural light\b|\bwindow(s)?\b/g, tag: 'Bright' },
  { match: /\bspacious\b|\broomy\b|\bspace\b|\bspread out\b/g, tag: 'Spacious' },
  { match: /\bquiet\b|\bcalm\b|\bsilent\b|\bpeaceful\b|\blow noise\b/g, tag: 'Quiet' },
  { match: /\bstudy\b|\bwork\b|\bworking\b|\bcoding\b|\blaptop\b|\bdeep work\b|\bhomework\b/g, tag: 'Study' },
  { match: /\bsocial\b|\bhang\b|\bhangout\b|\bmeet\b|\bfriends?\b|\bdate\b|\blively\b|\bbuzzy\b/g, tag: 'Social' },
  { match: /\bcowork\b|\bco-work\b|\bcoworking\b|\bworkspace\b|\bshared office\b|\bdesk\b|\bwework\b|\bregus\b/g, tag: 'Coworking' },
  { match: /\blate\b|\bnight\b|\bmidnight\b|\b24\b|\bopen late\b|\bafter \d{1,2}\b/g, tag: 'Late-night' },
];

function uniq(list: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function scoreVibes(text: string): Record<Exclude<ExploreVibe, 'all'>, number> {
  const scores = { quiet: 0, study: 0, social: 0, late: 0, cowork: 0 };
  const add = (key: keyof typeof scores, re: RegExp, weight = 1) => {
    const m = text.match(re);
    if (!m) return;
    scores[key] += m.length * weight;
  };

  add('quiet', /\bquiet\b|\bcalm\b|\bsilent\b|\bpeaceful\b|\blibrary\b|\bread(ing)?\b/g, 1);
  add('quiet', /\bfocus\b|\bdeep work\b|\blow noise\b/g, 2);

  add('study', /\bstudy\b|\bwork\b|\bworking\b|\bcoding\b|\blaptop\b|\bhomework\b|\bassignment\b/g, 2);
  add('study', /\blibrary\b|\bworkspace\b|\bproductive\b/g, 1);

  add('cowork', /\bcowork\b|\bco-work\b|\bcoworking\b|\bwework\b|\bregus\b|\bindustrious\b|\bshared office\b|\bdesk\b|\boffice\b/g, 2);
  add('cowork', /\boutlet(s)?\b|\bpower\b/g, 1);

  add('social', /\bsocial\b|\bhang\b|\bhangout\b|\bmeet\b|\bfriends?\b|\bdate\b|\blively\b|\bbuzzy\b/g, 2);
  add('social', /\bcafe\b|\bcoffee\b|\bespresso\b|\btea\b|\bbakery\b|\blounge\b/g, 1);

  add('late', /\bopen late\b|\blate\b|\bnight\b|\bmidnight\b|\b24\b|\bafter \d{1,2}\b/g, 2);

  return scores;
}

function pickVibe(text: string): ExploreVibe {
  const scores = scoreVibes(text);
  const entries = Object.entries(scores) as Array<[keyof typeof scores, number]>;
  entries.sort((a, b) => b[1] - a[1]);
  const [best, bestScore] = entries[0];
  if (!bestScore || bestScore < 1) return 'all';
  return best;
}

function pickOpenFilter(text: string): OpenFilter {
  const t = text.toLowerCase();
  if (/\bclosed\b|\bnot open\b|\bafter close\b|\bafter closing\b/.test(t)) return 'closed';
  if (/\bopen now\b|\bcurrently open\b|\bopen right now\b/.test(t)) return 'open';
  return 'all';
}

// Utility metric parsers
function pickWifiSpeed(text: string): WifiPreference {
  const t = text.toLowerCase();
  if (/\bfast\s*wi[\s-]?fi\b|\bgood\s*wi[\s-]?fi\b|\bstrong\s*wi[\s-]?fi\b|\bfast\s*internet\b|\bgreat\s*wi[\s-]?fi\b|\breliable\s*wi[\s-]?fi\b/.test(t)) return 'fast';
  if (/\bdecent\s*wi[\s-]?fi\b|\bok\s*wi[\s-]?fi\b/.test(t)) return 'ok';
  return 'any';
}

function pickNoiseLevel(text: string): NoisePreference {
  const t = text.toLowerCase();
  if (/\bquiet\b|\bsilent\b|\bpeaceful\b|\blow noise\b|\bno noise\b|\bhush\b|\bcalm\b/.test(t)) return 'quiet';
  if (/\blively\b|\bbuzzy\b|\benergetic\b|\bloud\b|\bnoisy\b|\bbusy atmosphere\b/.test(t)) return 'lively';
  if (/\bmoderate noise\b|\bsome noise\b|\bbackground noise\b|\blight buzz\b/.test(t)) return 'moderate';
  return 'any';
}

function pickBusyness(text: string): BusynessPreference {
  const t = text.toLowerCase();
  if (/\bempty\b|\bnot busy\b|\bnot crowded\b|\bquiet spot\b|\bavailable seats\b|\bseats available\b|\buncrowded\b|\bnot packed\b/.test(t)) return 'empty';
  if (/\bbusy\b|\bcrowded\b|\bpacked\b|\bpopular\b|\bhot spot\b/.test(t)) return 'busy';
  if (/\bmoderate crowd\b|\bsome people\b|\bfew people\b/.test(t)) return 'moderate';
  return 'any';
}

function pickOutlets(text: string): OutletPreference {
  const t = text.toLowerCase();
  if (/\boutlet(s)?\b|\bpower\b|\bcharger\b|\bcharging\b|\bplug(s)?\b|\bcharge my\b/.test(t)) return 'has-outlets';
  return 'any';
}

function pickTags(text: string): string[] {
  const tags: string[] = [];
  for (const rule of TAG_CANONICAL) {
    if (rule.match.test(text)) tags.push(rule.tag);
  }
  // reset global regex state for safety across calls
  TAG_CANONICAL.forEach((r) => (r.match.lastIndex = 0));
  return uniq(tags);
}

export function parsePerchedQuery(raw: string): PerchedIntent | null {
  const trimmed = String(raw || '').trim();
  if (trimmed.length < 2) return null;
  const text = trimmed.toLowerCase();
  const vibe = pickVibe(text);
  const openFilter = pickOpenFilter(text);
  const tags = pickTags(text);
  const wifiSpeed = pickWifiSpeed(text);
  const noiseLevel = pickNoiseLevel(text);
  const busyness = pickBusyness(text);
  const outlets = pickOutlets(text);
  return { raw: trimmed, vibe, openFilter, tags, wifiSpeed, noiseLevel, busyness, outlets };
}

export function formatIntentChips(intent: PerchedIntent | null): string[] {
  if (!intent) return [];
  const chips: string[] = [];
  if (intent.vibe !== 'all') {
    chips.push(intent.vibe === 'late' ? 'Late-night' : intent.vibe === 'cowork' ? 'Coworking' : `${intent.vibe[0].toUpperCase()}${intent.vibe.slice(1)}`);
  }
  if (intent.openFilter === 'open') chips.push('Open now');
  if (intent.openFilter === 'closed') chips.push('Closed now');
  // Utility metric chips
  if (intent.wifiSpeed === 'fast') chips.push('Fast WiFi');
  if (intent.wifiSpeed === 'ok') chips.push('Decent WiFi');
  if (intent.noiseLevel === 'quiet') chips.push('Quiet');
  if (intent.noiseLevel === 'lively') chips.push('Lively');
  if (intent.noiseLevel === 'moderate') chips.push('Moderate noise');
  if (intent.busyness === 'empty') chips.push('Not busy');
  if (intent.busyness === 'busy') chips.push('Busy spot');
  if (intent.outlets === 'has-outlets') chips.push('Has Outlets');
  intent.tags.forEach((t) => chips.push(t));
  return uniq(chips).slice(0, 6);
}

