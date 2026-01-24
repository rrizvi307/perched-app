const fs = require('fs');

function hexToRgb(hex) {
  if (!hex) return null;
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const num = parseInt(hex, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function srgbToLinear(c) {
  c = c / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function lum(rgb) {
  const [r, g, b] = rgb;
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrast(hex1, hex2) {
  const a = hexToRgb(hex1);
  const b = hexToRgb(hex2);
  if (!a || !b) return null;
  const L1 = lum(a);
  const L2 = lum(b);
  const hi = Math.max(L1, L2);
  const lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

const themeFile = fs.readFileSync('constants/theme.ts', 'utf8');

function extractColors(blockName) {
  // match light: { ... } (followed by comma) or dark: { ... } (followed by comma or closing brace)
  const re = new RegExp(blockName + ':\\s*{([\\s\\S]*?)\\}\\s*(,|})', 'm');
  const m = themeFile.match(re);
  if (!m) return null;
  const block = m[1];
  const lines = block.split(/\n/).map(l => l.trim()).filter(Boolean);
  const colors = {};
  for (const line of lines) {
    const kv = line.match(/(\w+)\s*:\s*'(#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}))'/);
    if (kv) colors[kv[1]] = kv[2];
  }
  return colors;
}

const light = extractColors('light');
const dark = extractColors('dark');

function checkPairs(name, obj) {
  console.log('\nTheme:', name);
  if (!obj) return;
  const pairs = [
    ['text','background'],
    ['muted','background'],
    ['tint','background'],
    ['border','background'],
    ['card','background'],
    ['tabIconDefault','background'],
    ['tabIconSelected','background']
  ];
  for (const [a,b] of pairs) {
    const va = obj[a];
    const vb = obj[b];
    if (!va || !vb) continue;
    const r = contrast(va, vb);
    console.log(`  ${a} (${va}) vs ${b} (${vb}) => ${r.toFixed(2)}:1` + (r < 4.5 ? '  <-- below 4.5:1' : ''));
  }
}

checkPairs('light', light);
checkPairs('dark', dark);

console.log('\nFinished contrast check.');
