export function withAlpha(hex: string, alpha: number) {
  if (!hex || !hex.startsWith('#')) return `rgba(0,0,0,${alpha})`;
  const full = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;
  if (full.length !== 7) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(full.slice(1, 3), 16);
  const g = parseInt(full.slice(3, 5), 16);
  const b = parseInt(full.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
