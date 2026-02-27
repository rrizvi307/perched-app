import { Platform, Share } from 'react-native';
import { Fonts } from '@/constants/theme';
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
  const persona = typeof safe?.persona === 'string' ? safe.persona : 'THIRD PLACE ERA';

  const userHandle =
    typeof safe?.userHandle === 'string' && safe.userHandle.trim().length
      ? `@${safe.userHandle.trim().replace(/^@/, '')}`
      : null;
  const userName =
    typeof safe?.userName === 'string' && safe.userName.trim().length
      ? safe.userName.trim()
      : null;

  const nowLabel = (() => {
    try {
      const ms = typeof safe?.generatedAt === 'number' ? safe.generatedAt : Date.now();
      const d = new Date(ms);
      return `${d.toLocaleString('default', { month: 'short' })} ${d.getFullYear()}`;
    } catch {
      return '';
    }
  })();

  // Always dark card design for visual impact (Spotify Wrapped style)
  const bg = '#0D0B1E';
  const bgCard = '#1A1635';
  const bgCard2 = '#231F42';
  const accent = '#7C3AED';
  const accentGlow = '#9B5CF6';
  const accent2 = '#F43F5E';
  const accent3 = '#06B6D4';
  const white = '#FFFFFF';
  const white70 = 'rgba(255,255,255,0.7)';
  const white40 = 'rgba(255,255,255,0.4)';
  const white15 = 'rgba(255,255,255,0.15)';
  const white08 = 'rgba(255,255,255,0.08)';

  const px = Math.round(width * 0.074);
  const py = Math.round(height * 0.058);
  const cw = width - px * 2;
  const r = 44;

  const bigDigits = String(Math.max(0, totalPosts)).length;
  const heroSize = bigDigits >= 4 ? 180 : bigDigits === 3 ? 230 : 290;

  // Layout positions
  const headerY = py + 60;
  const taglineY = headerY + 60;
  const heroBlockY = taglineY + 80;
  const heroBlockH = Math.round(height * 0.22);
  const statsRowY = heroBlockY + heroBlockH + 44;
  const statsRowH = Math.round(height * 0.105);
  const spotBlockY = statsRowY + statsRowH + 44;
  const spotBlockH = Math.round(height * 0.185);
  const vibesY = spotBlockY + spotBlockH + 44;
  const vibesH = Math.round(height * 0.12);
  const personaY = vibesY + vibesH + 44;
  const personaH = Math.round(height * 0.085);
  const footerY = height - py;

  const halfW = (cw - 24) / 2;
  const topSpotLines = wrapText(topSpotName, 22, 2);
  const tagPillColors = [accent, accent2, accent3, '#10B981'];

  // Build vibe tags as pills
  const vibeTagPills = topTags.slice(0, 4).map((tag: string, i: number) => {
    const pillW = Math.min(220, String(tag).length * 22 + 48);
    return { tag: String(tag).trim(), color: tagPillColors[i % tagPillColors.length], w: pillW };
  });
  let pillX = px;
  const pillY = vibesY + 24;
  const pillRows: { tag: string; color: string; w: number; x: number; y: number }[][] = [[]];
  vibeTagPills.forEach((p: { tag: string; color: string; w: number }) => {
    if (pillX + p.w > px + cw) {
      pillRows.push([]);
      pillX = px;
    }
    pillRows[pillRows.length - 1].push({ ...p, x: pillX, y: pillY + (pillRows.length - 1) * 72 });
    pillX += p.w + 16;
  });
  const allPills = pillRows.flat();

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0%" stop-color="#1A0E3A"/>
      <stop offset="55%" stop-color="${bg}"/>
      <stop offset="100%" stop-color="#0A0818"/>
    </linearGradient>
    <linearGradient id="heroGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#2D1B69"/>
      <stop offset="100%" stop-color="#1A0E3A"/>
    </linearGradient>
    <linearGradient id="accentLine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${accent}"/>
      <stop offset="100%" stop-color="${accent2}"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="18" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <clipPath id="spotClip">
      <rect x="${px}" y="${spotBlockY}" width="${cw}" height="${spotBlockH}" rx="${r}"/>
    </clipPath>
  </defs>

  <!-- Background -->
  <rect width="${width}" height="${height}" fill="url(#bgGrad)"/>

  <!-- Ambient glow top-left -->
  <ellipse cx="${Math.round(width * 0.2)}" cy="${Math.round(height * 0.18)}" rx="320" ry="280" fill="${accent}" opacity="0.12"/>
  <!-- Ambient glow bottom-right -->
  <ellipse cx="${Math.round(width * 0.85)}" cy="${Math.round(height * 0.78)}" rx="280" ry="240" fill="${accent2}" opacity="0.10"/>

  <!-- Header -->
  <text x="${px}" y="${headerY}" font-size="26" fill="${white40}" font-weight="800" font-family="${fontSans}" letter-spacing="3.5">PERCHED</text>
  <text x="${px}" y="${taglineY}" font-size="38" fill="${white70}" font-weight="600" font-family="${fontSans}">your week in spots</text>

  <!-- Accent divider line -->
  <rect x="${px}" y="${taglineY + 20}" width="80" height="4" rx="2" fill="url(#accentLine)"/>

  <!-- Hero block: check-ins -->
  <rect x="${px}" y="${heroBlockY}" width="${cw}" height="${heroBlockH}" rx="${r}" fill="url(#heroGrad)"/>
  <rect x="${px}" y="${heroBlockY}" width="${cw}" height="${heroBlockH}" rx="${r}" fill="none" stroke="${white15}" stroke-width="1.5"/>
  <text x="${px + 56}" y="${heroBlockY + Math.round(heroBlockH * 0.72)}" font-size="${heroSize}" fill="${white}" font-weight="900" font-family="${fontSans}" letter-spacing="-4" filter="url(#glow)">${escapeXml(String(totalPosts))}</text>
  <text x="${px + 56}" y="${heroBlockY + heroBlockH - 44}" font-size="32" fill="${white70}" font-weight="600" font-family="${fontSans}" letter-spacing="1">check-in${totalPosts === 1 ? '' : 's'} this week</text>

  <!-- Stats row -->
  <rect x="${px}" y="${statsRowY}" width="${halfW}" height="${statsRowH}" rx="${r}" fill="${bgCard}"/>
  <rect x="${px}" y="${statsRowY}" width="${halfW}" height="${statsRowH}" rx="${r}" fill="none" stroke="${white08}" stroke-width="1.5"/>
  <text x="${px + 36}" y="${statsRowY + 50}" font-size="22" fill="${white40}" font-weight="700" font-family="${fontSans}" letter-spacing="1.5">SPOTS</text>
  <text x="${px + 36}" y="${statsRowY + statsRowH - 34}" font-size="74" fill="${accent3}" font-weight="900" font-family="${fontSans}" letter-spacing="-2">${escapeXml(String(uniqueCount))}</text>

  <rect x="${px + halfW + 24}" y="${statsRowY}" width="${halfW}" height="${statsRowH}" rx="${r}" fill="${bgCard}"/>
  <rect x="${px + halfW + 24}" y="${statsRowY}" width="${halfW}" height="${statsRowH}" rx="${r}" fill="none" stroke="${white08}" stroke-width="1.5"/>
  <text x="${px + halfW + 60}" y="${statsRowY + 50}" font-size="22" fill="${white40}" font-weight="700" font-family="${fontSans}" letter-spacing="1.5">ACTIVE DAYS</text>
  <text x="${px + halfW + 60}" y="${statsRowY + statsRowH - 34}" font-size="74" fill="${accentGlow}" font-weight="900" font-family="${fontSans}" letter-spacing="-2">${escapeXml(String(activeDays || 0))}</text>

  <!-- Top spot block -->
  <rect x="${px}" y="${spotBlockY}" width="${cw}" height="${spotBlockH}" rx="${r}" fill="${bgCard2}"/>
  <rect x="${px}" y="${spotBlockY}" width="${cw}" height="${spotBlockH}" rx="${r}" fill="none" stroke="${white08}" stroke-width="1.5"/>
  <!-- Accent left bar -->
  <rect x="${px}" y="${spotBlockY + 40}" width="6" height="${spotBlockH - 80}" rx="3" fill="url(#accentLine)"/>
  <text x="${px + 52}" y="${spotBlockY + 60}" font-size="22" fill="${white40}" font-weight="700" font-family="${fontSans}" letter-spacing="1.5">TOP SPOT</text>
  <text x="${px + 52}" y="${spotBlockY + Math.round(spotBlockH * 0.52)}" font-size="62" fill="${white}" font-weight="900" font-family="${fontSans}" letter-spacing="-1">
    <tspan x="${px + 52}" dy="0">${escapeXml(topSpotLines[0])}</tspan>
    ${topSpotLines[1] ? `<tspan x="${px + 52}" dy="78">${escapeXml(topSpotLines[1])}</tspan>` : ''}
  </text>
  ${topSpotVisits ? `<text x="${px + 52}" y="${spotBlockY + spotBlockH - 44}" font-size="30" fill="${white40}" font-weight="600" font-family="${fontSans}">${escapeXml(String(topSpotVisits))} visit${topSpotVisits === 1 ? '' : 's'}</text>` : ''}

  <!-- Vibe pills -->
  ${allPills.length ? `<text x="${px}" y="${vibesY - 10}" font-size="22" fill="${white40}" font-weight="700" font-family="${fontSans}" letter-spacing="1.5">YOUR VIBES</text>` : ''}
  ${allPills.map((p) => `
  <rect x="${p.x}" y="${p.y}" width="${p.w}" height="52" rx="26" fill="${p.color}" opacity="0.22"/>
  <rect x="${p.x}" y="${p.y}" width="${p.w}" height="52" rx="26" fill="none" stroke="${p.color}" stroke-width="1.5" opacity="0.7"/>
  <text x="${p.x + p.w / 2}" y="${p.y + 34}" font-size="24" fill="${white}" font-weight="700" font-family="${fontSans}" text-anchor="middle">${escapeXml(p.tag)}</text>
  `).join('')}

  <!-- Persona block -->
  <rect x="${px}" y="${personaY}" width="${cw}" height="${personaH}" rx="${r}" fill="${accent}" opacity="0.18"/>
  <rect x="${px}" y="${personaY}" width="${cw}" height="${personaH}" rx="${r}" fill="none" stroke="${accent}" stroke-width="1.5" opacity="0.5"/>
  <text x="${width / 2}" y="${personaY + Math.round(personaH * 0.63)}" font-size="44" fill="${white}" font-weight="900" font-family="${fontSans}" text-anchor="middle" letter-spacing="2">${escapeXml(persona)}</text>

  <!-- Footer -->
  <text x="${px}" y="${footerY}" font-size="24" fill="${white40}" font-weight="700" font-family="${fontSans}" letter-spacing="1">@perchedapp</text>
  <text x="${width - px}" y="${footerY}" font-size="24" fill="${white40}" font-weight="700" font-family="${fontSans}" text-anchor="end" letter-spacing="1">${escapeXml(userHandle || userName || nowLabel || '')}</text>
</svg>`;

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
