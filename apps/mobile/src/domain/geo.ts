// Outils géométriques sur les tracés de la carte (repère 0–1000).
import type { Zone } from './zoneScore';

type Pt = [number, number];
const cache = new Map<string, Pt[]>();

/** « M x y L x y … Z » → liste de points. */
function points(path: string): Pt[] {
  let pts = cache.get(path);
  if (!pts) {
    const nums = path.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
    pts = [];
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
    cache.set(path, pts);
  }
  return pts;
}

function inside(x: number, y: number, poly: Pt[]) {
  let ok = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ok = !ok;
  }
  return ok;
}

/** Zone qui contient le point, sinon la plus proche (à moins de ~2 km), sinon null. */
export function zoneAt(p: { x: number; y: number }, zones: Zone[], kmPerUnit: number): Zone | null {
  const hit = zones.find((z) => inside(p.x, p.y, points(z.path)));
  if (hit) return hit;
  let best: Zone | null = null;
  let bestD = Infinity;
  for (const z of zones) {
    const d = Math.hypot(z.cx - p.x, z.cy - p.y) * kmPerUnit;
    if (d < bestD) {
      best = z;
      bestD = d;
    }
  }
  return bestD <= 2 ? best : null;
}
