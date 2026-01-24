import { Appearance, Platform, Share } from 'react-native';
import { Colors, Fonts } from '@/constants/theme';
import { withAlpha } from '@/utils/colors';
import { getCheckinsForUserRemote } from './firebaseClient';
import { getCheckins } from '@/storage/local';
import { isDemoMode } from '@/services/demoMode';

type StoryCardMeta = {
  name?: string | null;
  handle?: string | null;
};

function toMillisSafe(value: any) {
  try {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const ms = new Date(value).getTime();
      return Number.isFinite(ms) ? ms : 0;
    }
    if (typeof value === 'object' && typeof value?.seconds === 'number') return value.seconds * 1000;
    if (typeof value?.toMillis === 'function') return value.toMillis();
  } catch {}
  return 0;
}

function countTopStrings(list: string[], take: number) {
  const counts: Record<string, number> = {};
  list.forEach((raw) => {
    const key = typeof raw === 'string' ? raw.trim() : '';
    if (!key) return;
    counts[key] = (counts[key] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, take);
}

function derivePersona(topTags: string[]) {
  const normalized = topTags.map((t) => String(t || '').toLowerCase());
  const has = (tag: string) => normalized.includes(tag.toLowerCase());
  if (has('study') || has('quiet')) return 'STUDY MODE';
  if (has('coworking') || has('outlets')) return 'FOCUS MODE';
  if (has('late-night')) return 'NIGHT OWL';
  if (has('social')) return 'SOCIAL MODE';
  if (has('bright')) return 'SUNLIT VIBES';
  return 'THIRD PLACE ERA';
}

function wrapText(input: string, maxCharsPerLine: number, maxLines: number) {
  const text = String(input || '').trim();
  if (!text) return ['—'];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxCharsPerLine) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length >= maxLines - 1) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  const usedWords = lines.join(' ').split(/\s+/).length;
  if (usedWords < words.length) {
    const last = lines[lines.length - 1] || '';
    const truncated = last.length > maxCharsPerLine - 1 ? last.slice(0, maxCharsPerLine - 1) : last;
    lines[lines.length - 1] = `${truncated.replace(/\.+$/, '')}…`;
  }
  return lines.length ? lines : ['—'];
}

// Build a story-card payload for sharing.
export async function buildStoryCard(userId: string, meta?: StoryCardMeta) {
  try {
    let items: any[] = [];
    if (!isDemoMode()) {
      try {
        const res = await getCheckinsForUserRemote(userId, 240);
        items = Array.isArray(res) ? res : res.items || [];
      } catch {}
    }
    if (!items.length) {
      try {
        items = await getCheckins();
      } catch {}
    }
    const mine = items.filter((c) => c.userId === userId);
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    let recent = mine.filter((m) => toMillisSafe(m?.createdAt) >= weekAgo);
    if (!recent.length && isDemoMode()) {
      const demoRecent = items
        .filter((m) => String(m?.id || '').startsWith('demo-c'))
        .filter((m) => toMillisSafe(m?.createdAt) >= weekAgo);
      if (demoRecent.length) recent = demoRecent;
    }

    const spots = recent.map((r) => r.spotName || r.spot).filter(Boolean);
    const unique = Array.from(new Set(spots));
    const topSpotEntries = countTopStrings(spots as any, 3);
    const topSpots = topSpotEntries.map(([name]) => name);
    const topSpotVisits = topSpotEntries[0]?.[1] || 0;
    const totalPosts = recent.length;
    const estimatedHours = Math.round(totalPosts * 2); // legacy; kept for backwards compatibility

    const tags = recent.flatMap((r) => (Array.isArray(r?.tags) ? r.tags : [])).filter(Boolean);
    const topTagEntries = countTopStrings(tags as any, 4);
    const topTags = topTagEntries.map(([tag]) => tag);

    const activeDaySet = new Set<string>();
    const dayCounts: Record<number, number> = {};
    recent.forEach((r) => {
      const ms = toMillisSafe(r?.createdAt);
      if (!ms) return;
      const d = new Date(ms);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      activeDaySet.add(key);
      const dow = d.getDay();
      dayCounts[dow] = (dayCounts[dow] || 0) + 1;
    });
    const activeDays = activeDaySet.size;
    const dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
    const busiestDow = (Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null) as any;
    const peakDay = busiestDow !== null && busiestDow !== undefined ? dowNames[Number(busiestDow) as any] : null;
    const persona = derivePersona(topTags);

    const getPhotoCandidate = (r: any) =>
      String(r?.photoUrl || r?.photoURL || r?.imageUrl || r?.imageURL || r?.image || '').trim();

    const photoCandidates = recent
      .map((r) => getPhotoCandidate(r))
      .filter((u) => u && u.startsWith('http'));
    const photoStrip = Array.from(new Set(photoCandidates)).slice(0, 3);
    const topSpotPhoto = (() => {
      const top = topSpots[0] || '';
      if (!top) return null;
      const match = recent.find((r) => {
        const name = String(r?.spotName || r?.spot || '').trim();
        const photo = getPhotoCandidate(r);
        return name && name === top && photo.startsWith('http');
      });
      const url = match ? getPhotoCandidate(match) : '';
      return url && url.startsWith('http') ? url : null;
    })();

    const normalizedHandle = typeof meta?.handle === 'string' && meta.handle.trim().length ? meta.handle.trim().replace(/^@/, '') : null;
    const userName = typeof meta?.name === 'string' && meta.name.trim().length ? meta.name.trim() : null;

    return {
      topSpots,
      topSpotVisits,
      totalPosts,
      estimatedHours,
      uniqueCount: unique.length,
      activeDays,
      topTags,
      peakDay,
      persona,
      userName,
      userHandle: normalizedHandle,
      periodLabel: 'LAST 7 DAYS',
      generatedAt: now,
      photoStrip,
      topSpotPhoto,
      items: recent,
    };
  } catch (e) {
    return { topSpots: [], totalPosts: 0, estimatedHours: 0, uniqueCount: 0, items: [] };
  }
}

export function renderStoryCardSVG(
  payload: any,
  opts: { width?: number; height?: number; mode?: 'light' | 'dark' } = {},
) {
  const safe = payload || {};
  const width = opts.width || 1080;
  const height = opts.height || 1920;
  const mode = opts.mode || (Appearance.getColorScheme() === 'dark' ? 'dark' : 'light');
  const theme = Colors[mode];

  const fontSans =
    Platform.select({
      ios: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif",
      android: "Roboto, 'Noto Sans', 'Helvetica Neue', Arial, sans-serif",
      web: (Fonts as any)?.sans || "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      default: (Fonts as any)?.sans || 'system-ui, sans-serif',
    }) || 'system-ui, sans-serif';

  const totalPosts = Number(safe?.totalPosts) || 0;
  const uniqueCount = Number(safe?.uniqueCount) || 0;
  const activeDays = Number(safe?.activeDays) || 0;
  const topSpots = Array.isArray(safe?.topSpots) ? safe.topSpots.filter(Boolean) : [];
  const topSpotName = topSpots[0] || '—';
  const topSpotVisits = Number(safe?.topSpotVisits) || 0;
  const topTags = Array.isArray(safe?.topTags) ? safe.topTags.filter(Boolean) : [];
  const topVibe = topTags[0] ? String(topTags[0]).trim() : null;

  const periodLabel =
    typeof safe?.periodLabel === 'string' && safe.periodLabel.trim().length
      ? safe.periodLabel.trim().toUpperCase()
      : 'LAST 7 DAYS';
  const userHandle =
    typeof safe?.userHandle === 'string' && safe.userHandle.trim().length
      ? `@${safe.userHandle.trim().replace(/^@/, '')}`
      : null;
  const topSpotPhoto =
    typeof safe?.topSpotPhoto === 'string' && safe.topSpotPhoto.trim().startsWith('http')
      ? safe.topSpotPhoto.trim()
      : null;

  const summaryParts = [
    `${totalPosts} check-in${totalPosts === 1 ? '' : 's'}`,
    `${uniqueCount} spot${uniqueCount === 1 ? '' : 's'}`,
    activeDays ? `${activeDays} day${activeDays === 1 ? '' : 's'}` : null,
  ].filter(Boolean);
  const summary = summaryParts.join(' • ');
  const vibesText = topTags.slice(0, 4).map((t: any) => String(t).trim()).filter(Boolean).join(' • ');
  const vibeLines = wrapText(vibesText || '—', 26, 2);

  const padX = Math.round(width * 0.07);
  const padY = Math.round(height * 0.065);
  const contentW = width - padX * 2;
  const radius = 40;
  const borderW = 2;
  const gap = 36;

  const labelSize = 20;
  const titleSize = 84;
  const subtitleSize = 32;

  const statsY = padY + 240;
  const statsH = 420;

  const topY = statsY + statsH + gap;
  const topH = 650;

  const tagsY = topY + topH + gap;

  const cardFill = theme.surface;
  const cardStroke = theme.border;

  const bigDigits = String(Math.max(0, totalPosts)).length;
  const bigNumberSize = bigDigits >= 4 ? 160 : bigDigits === 3 ? 200 : 240;
  const bigNumberY = statsY + 255;

  const statsPad = 56;
  const leftX = padX + statsPad;
  const rightW = 320;
  const rightX = padX + contentW - statsPad - rightW;
  const rightLabelSize = 18;
  const rightValueSize = 54;
  const rightRowGap = 116;
  const rightY0 = statsY + 118;

  const topSpotLines = wrapText(topSpotName, topSpotPhoto ? 20 : 26, 2);
  const topCardClipId = `topCardClip_${mode}`;

  const photoH = topSpotPhoto ? 380 : 0;
  const topTextY = topY + (photoH ? photoH + 84 : 150);

  const nowLabel = (() => {
    try {
      const ms = typeof safe?.generatedAt === 'number' ? safe.generatedAt : Date.now();
      return new Date(ms).toLocaleDateString();
    } catch {
      return '';
    }
  })();

  const softAccent = (theme as any)?.accentSoft || theme.accent;
  const topSpotHeaderFill = photoH ? 'transparent' : mode === 'dark' ? withAlpha(softAccent, 0.28) : softAccent;

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="photoFade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${theme.surface}" stop-opacity="${mode === 'dark' ? 0.02 : 0.06}" />
        <stop offset="72%" stop-color="${theme.surface}" stop-opacity="${mode === 'dark' ? 0.14 : 0.08}" />
        <stop offset="100%" stop-color="${theme.surface}" stop-opacity="1" />
      </linearGradient>
      <clipPath id="${topCardClipId}">
        <rect x="${padX}" y="${topY}" width="${contentW}" height="${topH}" rx="${radius}" />
      </clipPath>
    </defs>

    <rect width="100%" height="100%" fill="${theme.background}" />

    <!-- Header -->
    <text x="${padX}" y="${padY}" font-size="${labelSize}" fill="${theme.muted}" font-weight="700" font-family="${fontSans}" letter-spacing="1.2">PERCHED</text>
    <text x="${padX}" y="${padY + 110}" font-size="${titleSize}" fill="${theme.text}" font-weight="800" font-family="${fontSans}">Weekly recap</text>
    <text x="${padX}" y="${padY + 166}" font-size="${subtitleSize}" fill="${theme.muted}" font-weight="600" font-family="${fontSans}">${escapeXml(summary || 'No check-ins yet — go tap in.')}</text>

    <g>
      <rect x="${width - padX - 280}" y="${padY - 44}" width="280" height="68" rx="34" fill="${withAlpha(theme.surface, mode === 'dark' ? 0.78 : 0.96)}" stroke="${withAlpha(theme.border, mode === 'dark' ? 0.8 : 0.95)}" stroke-width="${borderW}" />
      <text x="${width - padX - 140}" y="${padY + 2}" font-size="20" fill="${theme.text}" font-weight="700" font-family="${fontSans}" text-anchor="middle" letter-spacing="1.2">${escapeXml(periodLabel)}</text>
    </g>

    <!-- Stats card -->
    <rect x="${padX}" y="${statsY}" width="${contentW}" height="${statsH}" rx="${radius}" fill="${cardFill}" stroke="${cardStroke}" stroke-width="${borderW}" />
    <text x="${leftX}" y="${statsY + 78}" font-size="20" fill="${theme.muted}" font-weight="700" font-family="${fontSans}" letter-spacing="1.2">CHECK‑INS</text>
    <text x="${leftX}" y="${bigNumberY}" font-size="${bigNumberSize}" fill="${theme.text}" font-weight="800" font-family="${fontSans}" letter-spacing="-2">${escapeXml(String(totalPosts))}</text>
    <text x="${leftX}" y="${statsY + statsH - 60}" font-size="28" fill="${theme.muted}" font-weight="600" font-family="${fontSans}">this week</text>

    <!-- Stats right column -->
    <text x="${rightX}" y="${rightY0}" font-size="${rightLabelSize}" fill="${theme.muted}" font-weight="700" font-family="${fontSans}" letter-spacing="1.1">SPOTS</text>
    <text x="${rightX}" y="${rightY0 + 58}" font-size="${rightValueSize}" fill="${theme.text}" font-weight="800" font-family="${fontSans}">${escapeXml(String(uniqueCount))}</text>
    <line x1="${rightX}" y1="${rightY0 + 86}" x2="${rightX + rightW}" y2="${rightY0 + 86}" stroke="${withAlpha(theme.border, 0.85)}" stroke-width="2" />

    <text x="${rightX}" y="${rightY0 + rightRowGap}" font-size="${rightLabelSize}" fill="${theme.muted}" font-weight="700" font-family="${fontSans}" letter-spacing="1.1">ACTIVE DAYS</text>
    <text x="${rightX}" y="${rightY0 + rightRowGap + 58}" font-size="${rightValueSize}" fill="${theme.text}" font-weight="800" font-family="${fontSans}">${escapeXml(String(activeDays || 0))}</text>
    <line x1="${rightX}" y1="${rightY0 + rightRowGap + 86}" x2="${rightX + rightW}" y2="${rightY0 + rightRowGap + 86}" stroke="${withAlpha(theme.border, 0.85)}" stroke-width="2" />

    <text x="${rightX}" y="${rightY0 + rightRowGap * 2}" font-size="${rightLabelSize}" fill="${theme.muted}" font-weight="700" font-family="${fontSans}" letter-spacing="1.1">TOP VIBE</text>
    <text x="${rightX}" y="${rightY0 + rightRowGap * 2 + 54}" font-size="34" fill="${theme.text}" font-weight="800" font-family="${fontSans}">${escapeXml(topVibe || '—')}</text>

    <!-- Top spot card -->
    <rect x="${padX}" y="${topY}" width="${contentW}" height="${topH}" rx="${radius}" fill="${cardFill}" stroke="${cardStroke}" stroke-width="${borderW}" />
    ${photoH ? `
      <g clip-path="url(#${topCardClipId})">
        <image x="${padX}" y="${topY}" width="${contentW}" height="${photoH}" href="${escapeXml(topSpotPhoto)}" preserveAspectRatio="xMidYMid slice" crossorigin="anonymous" />
        <rect x="${padX}" y="${topY}" width="${contentW}" height="${photoH}" fill="url(#photoFade)" />
      </g>
    ` : `
      <g clip-path="url(#${topCardClipId})">
        <rect x="${padX}" y="${topY}" width="${contentW}" height="200" fill="${topSpotHeaderFill}" />
      </g>
    `}

    <text x="${leftX}" y="${topY + 78}" font-size="20" fill="${theme.muted}" font-weight="700" font-family="${fontSans}" letter-spacing="1.2">TOP SPOT</text>
    <text x="${leftX}" y="${topTextY}" font-size="56" fill="${theme.text}" font-weight="800" font-family="${fontSans}">
      <tspan x="${leftX}" dy="0">${escapeXml(topSpotLines[0])}</tspan>
      ${topSpotLines[1] ? `<tspan x="${leftX}" dy="70">${escapeXml(topSpotLines[1])}</tspan>` : ''}
    </text>
    ${topSpotVisits ? `<text x="${leftX}" y="${topTextY + 128}" font-size="30" fill="${theme.muted}" font-weight="600" font-family="${fontSans}">${escapeXml(String(topSpotVisits))} visit${topSpotVisits === 1 ? '' : 's'}</text>` : ''}

    <!-- Top vibes -->
    <text x="${padX}" y="${tagsY + 44}" font-size="20" fill="${theme.muted}" font-weight="700" font-family="${fontSans}" letter-spacing="1.2">TOP VIBES</text>
    <text x="${padX}" y="${tagsY + 104}" font-size="36" fill="${theme.text}" font-weight="800" font-family="${fontSans}">${escapeXml(vibeLines[0] || '—')}</text>
    ${vibeLines[1] ? `<text x="${padX}" y="${tagsY + 154}" font-size="36" fill="${theme.text}" font-weight="800" font-family="${fontSans}">${escapeXml(vibeLines[1])}</text>` : ''}

    <!-- Footer -->
    <text x="${padX}" y="${height - padY + 20}" font-size="22" fill="${theme.muted}" font-weight="700" font-family="${fontSans}" letter-spacing="1.2">@perchedapp</text>
    <text x="${width - padX}" y="${height - padY + 20}" font-size="22" fill="${theme.muted}" font-weight="700" font-family="${fontSans}" text-anchor="end" letter-spacing="1.2">${escapeXml(userHandle || nowLabel || '')}</text>
  </svg>
  `;

  return svg;
}

function escapeXml(str: string) {
  return (str || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' } as any)[c]);
}

export async function buildAndShareStoryCard(userId: string, mode?: 'light' | 'dark') {
  const payload = await buildStoryCard(userId);
  let svg = '';
  try {
    svg = renderStoryCardSVG(payload, { mode });
  } catch {
    svg = renderStoryCardSVG({ topSpots: [], totalPosts: 0, estimatedHours: 0, uniqueCount: 0 }, { mode });
  }
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  // On web open new tab with image; on native try share with text fallback
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const opened = window.open(dataUrl, '_blank', 'noopener,noreferrer');
      if (!opened && typeof navigator !== 'undefined' && (navigator as any).share) {
        await (navigator as any).share({ title: 'Perched Story Card', url: dataUrl });
      }
      return dataUrl;
    }
  } catch (e) {
    // ignore
  }

  // Native: share textual summary with a note (image generation can be added later)
  try {
    await Share.share({ message: `My Perched week: ${payload.topSpots.join(', ')} • ${payload.totalPosts} posts` });
  } catch (e) {
    // ignore
  }
  return dataUrl;
}
