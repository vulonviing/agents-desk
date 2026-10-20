import type { Point } from '../constants';

// A* on a 4-connected tile grid (true = walkable). Start and goal may be blocked: a seat sits inside a blocked desk cell.
const key = (x: number, y: number) => y * 4096 + x;

export function findPath(grid: boolean[][], from: Point, to: Point): Point[] | null {
  if (from.x === to.x && from.y === to.y) return [];
  const h = (x: number, y: number) => Math.abs(x - to.x) + Math.abs(y - to.y);
  const best = new Map<number, number>([[key(from.x, from.y), 0]]);
  const prev = new Map<number, number>();
  const open: { x: number; y: number; f: number }[] = [{ x: from.x, y: from.y, f: h(from.x, from.y) }];
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i]!.f < open[bi]!.f) bi = i;
    const cur = open.splice(bi, 1)[0]!;
    if (cur.x === to.x && cur.y === to.y) {
      const path: Point[] = [];
      for (let k = key(cur.x, cur.y); k !== key(from.x, from.y); k = prev.get(k)!) path.unshift({ x: k % 4096, y: Math.floor(k / 4096) });
      return path;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const x = cur.x + dx;
      const y = cur.y + dy;
      const isGoal = x === to.x && y === to.y;
      if (!isGoal && grid[y]?.[x] !== true) continue;
      const g = best.get(key(cur.x, cur.y))! + 1;
      if (g >= (best.get(key(x, y)) ?? Infinity)) continue;
      best.set(key(x, y), g);
      prev.set(key(x, y), key(cur.x, cur.y));
      open.push({ x, y, f: g + h(x, y) });
    }
  }
  return null;
}
