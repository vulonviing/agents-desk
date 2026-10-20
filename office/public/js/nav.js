// Walking space of the office: a coarse grid with blocked rectangles, A* and line-of-sight smoothing.
// Layout changes only need new rectangles; walkers never need hand-written routes.
(function () {
  'use strict';
  const CELL = 4;

  class Nav {
    constructor(w, h, rects) {
      this.gw = Math.ceil(w / CELL);
      this.gh = Math.ceil(h / CELL);
      this.blocked = new Uint8Array(this.gw * this.gh);
      for (const [x0, y0, x1, y1] of rects) {
        for (let gy = Math.max(0, Math.floor(y0 / CELL)); gy <= Math.min(this.gh - 1, Math.floor(y1 / CELL)); gy++) {
          for (let gx = Math.max(0, Math.floor(x0 / CELL)); gx <= Math.min(this.gw - 1, Math.floor(x1 / CELL)); gx++) this.blocked[gy * this.gw + gx] = 1;
        }
      }
    }
    cellOf(p) { return [Math.max(0, Math.min(this.gw - 1, Math.floor(p.x / CELL))), Math.max(0, Math.min(this.gh - 1, Math.floor(p.y / CELL)))]; }
    free(gx, gy) { return gx >= 0 && gy >= 0 && gx < this.gw && gy < this.gh && !this.blocked[gy * this.gw + gx]; }
    // nearest free cell (breadth-first rings) so a destination inside furniture still resolves
    snap(p) {
      const [cx, cy] = this.cellOf(p);
      if (this.free(cx, cy)) return [cx, cy];
      for (let r = 1; r < 40; r++) {
        let best = null;
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !this.free(cx + dx, cy + dy)) continue;
            const d = dx * dx + dy * dy;
            if (!best || d < best.d) best = { d, gx: cx + dx, gy: cy + dy };
          }
        }
        if (best) return [best.gx, best.gy];
      }
      return [cx, cy];
    }
    // clear straight line between two world points
    clear(a, b) {
      const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2);
      for (let i = 0; i <= steps; i++) {
        const k = steps ? i / steps : 0;
        const [gx, gy] = this.cellOf({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
        if (!this.free(gx, gy)) return false;
      }
      return true;
    }
    path(from, to) {
      const [sx, sy] = this.snap(from);
      const [tx, ty] = this.snap(to);
      const key = (x, y) => y * this.gw + x;
      const open = [{ x: sx, y: sy, g: 0, f: 0 }];
      const g = new Map([[key(sx, sy), 0]]);
      const prev = new Map();
      const done = new Set();
      const h = (x, y) => Math.hypot(x - tx, y - ty);
      let found = false;
      while (open.length) {
        let bi = 0;
        for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
        const cur = open.splice(bi, 1)[0];
        const ck = key(cur.x, cur.y);
        if (done.has(ck)) continue;
        done.add(ck);
        if (cur.x === tx && cur.y === ty) { found = true; break; }
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = cur.x + dx;
            const ny = cur.y + dy;
            if (!this.free(nx, ny) || (dx && dy && (!this.free(cur.x + dx, cur.y) || !this.free(cur.x, cur.y + dy)))) continue;
            const ng = cur.g + (dx && dy ? 1.414 : 1);
            const nk = key(nx, ny);
            if (ng < (g.get(nk) ?? Infinity)) { g.set(nk, ng); prev.set(nk, ck); open.push({ x: nx, y: ny, g: ng, f: ng + h(nx, ny) }); }
          }
        }
      }
      const pts = [];
      if (found) {
        let k = key(tx, ty);
        while (k !== undefined) { pts.push({ x: (k % this.gw) * CELL + CELL / 2, y: Math.floor(k / this.gw) * CELL + CELL / 2 }); k = prev.get(k); }
        pts.reverse();
      } else pts.push({ x: sx * CELL, y: sy * CELL }, { x: tx * CELL, y: ty * CELL });
      // exact ends, then drop waypoints that a straight line can skip
      pts[0] = { x: from.x, y: from.y };
      pts[pts.length - 1] = { x: to.x, y: to.y };
      const out = [pts[0]];
      let i = 0;
      while (i < pts.length - 1) {
        let j = pts.length - 1;
        while (j > i + 1 && !this.clear(pts[i], pts[j])) j--;
        out.push(pts[j]);
        i = j;
      }
      return out;
    }
  }

  window.OfficeNav = Nav;
})();
