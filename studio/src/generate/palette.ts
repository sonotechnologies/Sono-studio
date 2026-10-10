/**
 * Colours from a logo, computed in code with no AI: bucket the opaque pixels,
 * merge near-identical shades and keep the most common few. Near-white is
 * ignored because it is almost always background.
 */
export function paletteFromPixels(rgba: ArrayLike<number>, max = 4): string[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const [r, g, b, a] = [rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]];
    if (a < 200) continue;
    if (r > 235 && g > 235 && b > 235) continue;
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const cell = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    cell.n++;
    cell.r += r;
    cell.g += g;
    cell.b += b;
    buckets.set(key, cell);
  }
  const colours = [...buckets.values()]
    .map((c) => ({ n: c.n, r: c.r / c.n, g: c.g / c.n, b: c.b / c.n }))
    .sort((x, y) => y.n - x.n);
  const kept: typeof colours = [];
  for (const c of colours) {
    const near = kept.find((k) => Math.hypot(k.r - c.r, k.g - c.g, k.b - c.b) < 48);
    if (near) {
      const n = near.n + c.n;
      near.r = (near.r * near.n + c.r * c.n) / n;
      near.g = (near.g * near.n + c.g * c.n) / n;
      near.b = (near.b * near.n + c.b * c.n) / n;
      near.n = n;
    } else kept.push({ ...c });
  }
  const total = kept.reduce((s, k) => s + k.n, 0) || 1;
  const hex = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return kept
    .sort((x, y) => y.n - x.n)
    .filter((k) => k.n / total >= 0.02)
    .slice(0, max)
    .map((k) => `#${hex(k.r)}${hex(k.g)}${hex(k.b)}`.toUpperCase());
}
