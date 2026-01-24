export function normalizeSpotName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function spotKey(placeId?: string, name?: string) {
  if (placeId) return `place:${placeId}`;
  const normalized = normalizeSpotName(name || 'unknown');
  return `name:${normalized || 'unknown'}`;
}

export function classifySpotCategory(name?: string, types?: string[]) {
  const hay = `${name || ''} ${(types || []).join(' ')}`.toLowerCase();
  if (hay.includes('library')) return 'library';
  if (hay.includes('cowork')) return 'coworking';
  if (hay.includes('university') || hay.includes('college') || hay.includes('campus')) return 'campus';
  if (hay.includes('bookstore') || hay.includes('book store')) return 'bookstore';
  if (hay.includes('cafe') || hay.includes('coffee') || hay.includes('espresso') || hay.includes('roastery') || hay.includes('tea')) return 'cafe';
  return 'other';
}
