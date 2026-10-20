import { NORTH, TILE } from './layout.js';
import { blend, rng } from './util.js';

// Static part of a floor: floors, walls, wall furniture, rugs and props, drawn once into an
// offscreen canvas. Desks, characters, light and labels are drawn every frame (see desk.js, floor.js).
// Everything is plain rectangles; the kit is intentionally small so a real tileset can replace it later.

const T = TILE;
export const FACE = 40; // wall face height in px (NORTH tiles minus some floor)
const WALL_LINE = 3;
const TINTS = ['#aeb7d1', '#bdb6cf', '#a9c3c4', '#cdbba7', '#b9acbc', '#a9bca6'];
const FLOORS = ['wood', 'carpetBlue', 'carpetGreen', 'carpetPlum', 'concrete'];
const BOOKS = ['#c0493d', '#3d7fc0', '#d9a63a', '#4aa36a', '#8a5bc4', '#d96a8a', '#e8e0cf'];

const hash = (s) => [...s].reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) | 0, 7) >>> 0;
const rectOf = (r) => ({ x: r.x * T, y: r.y * T, w: r.w * T, h: r.h * T });

// ---------- floors ----------

function drawFloor(g, kind, { x, y, w, h }, seed) {
  const r = rng(seed);
  const R = (a, b, c, d, col) => {
    g.fillStyle = col;
    g.fillRect(a, b, c, d);
  };
  if (kind === 'tile') {
    R(x, y, w, h, '#cfd3dc');
    for (let i = 0; i < w; i += 16) R(x + i, y, 1, h, '#bec3cf');
    for (let j = 0; j < h; j += 16) R(x, y + j, w, 1, '#bec3cf');
    for (let n = 0; n < (w * h) / 90; n++) R(x + Math.floor(r() * w), y + Math.floor(r() * h), 1, 1, r() < 0.5 ? '#dde1e8' : '#b9bfcb');
  } else if (kind === 'checker') {
    for (let j = 0; j < h; j += 8) for (let i = 0; i < w; i += 8) R(x + i, y + j, 8, 8, ((i + j) / 8) % 2 ? '#c3c8d3' : '#dbdfe7');
  } else if (kind === 'wood') {
    const tones = ['#b5835a', '#ad7b52', '#bb8a60', '#a8774f'];
    for (let j = 0; j < h; j += 8) {
      let i = -((j / 8) * 23) % 40;
      while (i < w) {
        const len = 30 + Math.floor(r() * 30);
        const t = tones[Math.floor(r() * tones.length)];
        const x0 = Math.max(0, i);
        const x1 = Math.min(w, i + len);
        if (x1 > x0) {
          R(x + x0, y + j, x1 - x0, 8, t);
          R(x + x0, y + j, x1 - x0, 1, blend(t, '#ffffff', 0.18));
          R(x + x0, y + j + 7, x1 - x0, 1, '#7d5638');
          if (i + len <= w) R(x + i + len - 1, y + j, 1, 8, '#7d5638');
        }
        i += len;
      }
    }
  } else {
    const base = { carpetBlue: '#3d4b78', carpetGreen: '#3f5d4a', carpetPlum: '#5b3a58', concrete: '#8d91a0' }[kind];
    R(x, y, w, h, base);
    const light = blend(base, '#ffffff', 0.1);
    const dark = blend(base, '#000000', 0.15);
    for (let n = 0; n < (w * h) / 6; n++) R(x + Math.floor(r() * w), y + Math.floor(r() * h), 1, 1, r() < 0.5 ? light : dark);
  }
}

// ---------- wall furniture (drawn on the wall face; y is relative to the room top) ----------

const rr = (g) => (x, y, w, h, c) => {
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
};

function shelf(g, x, y, books, seed) {
  const R = rr(g);
  R(x, y, 28, 36, '#4a2f24');
  R(x + 1, y + 1, 26, 34, '#6b4330');
  const r = rng(seed);
  let n = books;
  for (let row = 0; row < 3; row++) {
    const ry = y + 2 + row * 11;
    R(x + 2, ry, 24, 9, '#2f1d16');
    for (let col = 0; col < 8; col++) {
      if (n-- <= 0) continue;
      const bh = 6 + Math.floor(r() * 3);
      R(x + 3 + col * 3, ry + 9 - bh, 2, bh, BOOKS[Math.floor(r() * BOOKS.length)]);
    }
    R(x + 1, ry + 9, 26, 2, '#8a5a3c');
  }
}

function windowPane(g, x, y) {
  const R = rr(g);
  R(x, y, 28, 26, '#e8ebf5');
  for (let i = 0; i < 20; i++) R(x + 2, y + 2 + i, 24, 1, blend('#6fb0ff', '#d3eaff', i / 20));
  R(x + 4, y + 6, 8, 3, '#ffffff');
  R(x + 6, y + 4, 8, 3, '#ffffff');
  R(x + 13, y + 2, 2, 22, '#e8ebf5');
  R(x + 2, y + 12, 24, 2, '#e8ebf5');
  R(x - 1, y + 26, 30, 2, '#8d93ad');
}

function board(g, x, y, seed) {
  const R = rr(g);
  const r = rng(seed);
  R(x, y, 32, 24, '#7a5241');
  R(x + 2, y + 2, 28, 20, '#b98a5a');
  for (let i = 0; i < 4; i++) R(x + 4 + (i % 2) * 13, y + 4 + Math.floor(i / 2) * 9, 10, 7, ['#f2e394', '#f29ab0', '#9ad7f2', '#b8f2a0'][Math.floor(r() * 4)]);
}

function clock(g, x, y) {
  const R = rr(g);
  R(x + 1, y, 8, 10, '#2f1d16');
  R(x, y + 1, 10, 8, '#2f1d16');
  R(x + 1, y + 1, 8, 8, '#f2efe6');
  R(x + 5, y + 2, 1, 4, '#1a1a28');
  R(x + 5, y + 5, 3, 1, '#1a1a28');
}

function door(g, x, y) {
  const R = rr(g);
  R(x, y, 24, 38, '#3a2a22');
  R(x + 2, y + 2, 20, 36, '#7a5241');
  R(x + 5, y + 5, 14, 12, '#9ec8e8');
  R(x + 11, y + 5, 2, 12, '#7a5241');
  R(x + 5, y + 20, 14, 14, '#6b4330');
  R(x + 18, y + 21, 2, 3, '#f2c94c');
}

function whiteboard(g, x, y, w) {
  const R = rr(g);
  R(x, y, w, 26, '#8d93ad');
  R(x + 2, y + 2, w - 4, 22, '#f4f5f9');
  R(x + 6, y + 6, w - 20, 1, '#6c7bd9');
  R(x + 6, y + 11, w - 28, 1, '#d96a8a');
  for (let i = 0; i < 4; i++) R(x + w - 16 + i * 3, y + 20 - i * 4, 2, 2 + i * 4, '#4aa36a');
}

function tv(g, x, y) {
  const R = rr(g);
  R(x, y, 44, 26, '#1a1c29');
  R(x + 2, y + 2, 40, 20, '#26304f');
  R(x + 6, y + 6, 14, 2, '#6c7bd9');
  R(x + 6, y + 11, 24, 2, '#3a456e');
  R(x + 18, y + 24, 8, 2, '#1a1c29');
}

function fridge(g, x, y) {
  const R = rr(g);
  R(x, y, 20, 40, '#d6dae6');
  R(x, y + 14, 20, 2, '#9aa0b5');
  R(x + 16, y + 6, 2, 6, '#6d7391');
  R(x + 16, y + 20, 2, 10, '#6d7391');
  R(x + 2, y + 38, 16, 2, '#9aa0b5');
}

function counter(g, x, y, w) {
  const R = rr(g);
  R(x, y + 12, w, 22, '#6b4330');
  R(x, y + 8, w, 5, '#d6dae6');
  for (let i = 4; i < w - 8; i += 14) R(x + i, y + 16, 12, 16, '#7a5241');
  // coffee machine and a mug
  R(x + 6, y - 6, 12, 14, '#3a3f55');
  R(x + 8, y - 4, 8, 4, '#c0493d');
  R(x + 10, y + 4, 4, 4, '#e8e9f3');
  R(x + w - 14, y + 2, 5, 6, '#f2efe6');
}

// ---------- floor props ----------

export function plant(g, x, y) {
  const R = rr(g);
  R(x + 3, y + 14, 10, 8, '#9c5a36');
  R(x + 2, y + 13, 12, 2, '#b5683f');
  R(x + 4, y + 13, 8, 1, '#3b2a20');
  R(x + 1, y + 5, 6, 9, '#2f8a4a');
  R(x + 9, y + 4, 6, 10, '#3ea35a');
  R(x + 4, y, 8, 12, '#58c878');
  R(x + 6, y + 2, 2, 4, '#8be8a6');
}

function cooler(g, x, y) {
  const R = rr(g);
  R(x + 3, y, 10, 9, '#9ad7f2');
  R(x + 4, y + 1, 4, 5, '#d3f0ff');
  R(x + 2, y + 9, 12, 14, '#e8ebf5');
  R(x + 6, y + 12, 4, 2, '#6c7bd9');
  R(x + 2, y + 22, 12, 2, '#9aa0b5');
}

function printer(g, x, y) {
  const R = rr(g);
  R(x, y + 8, 24, 16, '#6b4330');
  R(x + 2, y + 2, 20, 8, '#d6dae6');
  R(x + 4, y + 4, 16, 2, '#9aa0b5');
  R(x + 6, y, 12, 3, '#f4f5f9');
  R(x + 17, y + 6, 2, 2, '#4aa36a');
}

function sofa(g, x, y, w, color) {
  const R = rr(g);
  R(x, y, w, 8, blend(color, '#000000', 0.3));
  R(x, y + 8, w, 14, color);
  R(x - 3, y + 6, 4, 16, blend(color, '#000000', 0.2));
  R(x + w - 1, y + 6, 4, 16, blend(color, '#000000', 0.2));
  for (let i = 4; i < w - 8; i += 20) R(x + i, y + 10, 16, 10, blend(color, '#ffffff', 0.08));
}

function table(g, x, y, w, h, top = '#8a5a3c') {
  const R = rr(g);
  R(x, y + 3, w, h, blend(top, '#000000', 0.4));
  R(x, y, w, h, top);
  R(x, y, w, 2, blend(top, '#ffffff', 0.2));
}

function chair(g, x, y, color = '#3a3f55') {
  const R = rr(g);
  R(x, y, 12, 12, color);
  R(x + 1, y + 1, 10, 3, blend(color, '#ffffff', 0.2));
}

function rug(g, x, y, w, h, base, border) {
  const R = rr(g);
  R(x, y, w, h, border);
  R(x + 3, y + 3, w - 6, h - 6, base);
  for (let i = x + 8; i < x + w - 8; i += 8) {
    R(i, y + 7, 2, 2, border);
    R(i, y + h - 9, 2, 2, border);
  }
}

// ---------- room assembly ----------

function wallItems(room, books) {
  const seed = room.id;
  const base = [];
  if (room.kind === 'kitchen') base.push({ w: 28, draw: (g, x, y) => windowPane(g, x, y + 6) }, { w: 20, draw: (g, x, y) => fridge(g, x, y + 0) }, { w: 56, draw: (g, x, y) => counter(g, x, y + 8, 56) }, { w: 32, draw: (g, x, y) => board(g, x, y + 8, seed) });
  else if (room.kind === 'meeting') base.push({ w: 28, draw: (g, x, y) => windowPane(g, x, y + 6) }, { w: 44, draw: (g, x, y) => tv(g, x, y + 8) }, { w: 52, draw: (g, x, y) => whiteboard(g, x, y + 8, 52) }, { w: 28, draw: (g, x, y) => windowPane(g, x, y + 6) });
  else base.push({ w: 28, draw: (g, x, y) => shelf(g, x, y + 2, books, seed) }, { w: 28, draw: (g, x, y) => windowPane(g, x, y + 6) }, { w: 32, draw: (g, x, y) => board(g, x, y + 8, seed) }, { w: 10, draw: (g, x, y) => clock(g, x, y + 8) }, { w: 28, draw: (g, x, y) => shelf(g, x, y + 2, Math.max(0, books - 24), seed + 'b') });
  return base;
}

function drawWalls(g, room, floor) {
  const R = rr(g);
  const { x, y, w, h } = rectOf(room);
  const tint = TINTS[hash(room.id) % TINTS.length];
  const trim = '#5c6285';
  R(x, y, w, FACE, tint);
  R(x, y, w, 4, trim);
  R(x, y + FACE - 12, w, 12, blend(tint, '#000000', 0.22));
  R(x, y + FACE - 12, w, 1, blend(tint, '#ffffff', 0.25));
  R(x, y + FACE - 2, w, 2, '#454a63');
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `rgba(30,25,50,${0.3 - i * 0.05})`;
    g.fillRect(x, y + FACE + i, w, 1);
  }
  // side and bottom walls
  R(x, y, WALL_LINE, h, '#454a63');
  R(x + w - WALL_LINE, y, WALL_LINE, h, '#454a63');
  R(x, y + h - WALL_LINE, w, WALL_LINE, '#454a63');
  // doorway on the hall side
  const dx = room.door.x * T;
  if (room.door.side === 'south') {
    R(dx, y + h - WALL_LINE - 1, room.door.w * T, WALL_LINE + 2, floor.hallColor);
    R(dx - 2, y + h - WALL_LINE - 1, 2, WALL_LINE + 2, '#2b2f45');
    R(dx + room.door.w * T, y + h - WALL_LINE - 1, 2, WALL_LINE + 2, '#2b2f45');
  }
  // wall furniture, left to right, skipping the door on the north side
  const books = room.kind === 'project' ? room.room.skills.length || room.room.stations.length : 0;
  const avoid = room.door.side === 'north' ? { from: dx - 4, to: dx + room.door.w * T + 4 } : null;
  let cx = x + 8;
  for (const item of wallItems(room, books)) {
    if (avoid && cx < avoid.to && cx + item.w > avoid.from) cx = avoid.to + 4;
    if (cx + item.w > x + w - 8) break;
    item.draw(g, cx, y + 2);
    cx += item.w + 8;
  }
  if (avoid) {
    R(dx - 2, y + 2, room.door.w * T + 4, FACE - 2, '#2b2f45');
    door(g, dx + 4, y + 2);
    R(dx + 2, y + FACE - 1, room.door.w * T - 4, 4, blend(tint, '#000000', 0.35)); // threshold mat
  }
}

function drawRoomProps(g, room) {
  const { x, y, w, h } = rectOf(room);
  const seed = hash(room.id);
  const floorTop = y + FACE;
  if (room.kind === 'project') {
    const palette = [['#3a4468', '#8a93c2'], ['#5b3140', '#a8586f'], ['#3f5d4a', '#7fb596']][seed % 3];
    rug(g, room.cell.tx * T - 6, floorTop + 14, 76, 56, palette[0], palette[1]);
    plant(g, x + 4, y + FACE - 10);
    plant(g, x + w - 20, y + FACE - 10);
  } else if (room.kind === 'kitchen') {
    const tx = x + Math.floor(w / 2) - 28;
    const ty = floorTop + 22;
    chair(g, tx + 4, ty - 12);
    chair(g, tx + 40, ty - 12);
    table(g, tx, ty, 56, 24, '#c9a46a');
    chair(g, tx + 4, ty + 28);
    chair(g, tx + 40, ty + 28);
    cooler(g, x + 8, floorTop + 6);
    plant(g, x + w - 24, y + h - 30);
  }
}

// Corridor decoration, kept away from the doorways of the rooms on both sides.
function drawCorridor(g, plan) {
  const { x, y, w, h } = rectOf(plan.corridor);
  const doors = plan.rooms.map((r) => ({ from: r.door.x * T - 10, to: (r.door.x + r.door.w) * T + 10 }));
  const free = (px, width) => doors.every((d) => px + width < d.from || px > d.to);
  const R = rr(g);
  plant(g, x, y + 4);
  plant(g, x + w - 17, y + h - 28);
  let placed = 0;
  for (let px = x + 40; px < x + w - 120 && placed < 2; px += 8) {
    const width = placed === 0 ? 96 : 40;
    if (!free(px, width)) continue;
    if (placed === 0) {
      rug(g, px - 6, y + 28, width + 12, 48, '#3a4468', '#8a93c2');
      sofa(g, px + 8, y + 34, 72, '#6c7bd9');
      table(g, px + 22, y + 60, 40, 10, '#c9a46a');
      px += width + 20;
    } else {
      cooler(g, px, y + 30);
      printer(g, px + 22, y + 34);
    }
    placed++;
  }
  R(x + Math.floor(w / 2) - 24, y + h - 5, 48, 3, '#8d93ad'); // entrance mat
}

export function buildFloorWorld(plan) {
  const c = document.createElement('canvas');
  c.width = plan.tilesW * T;
  c.height = plan.tilesH * T;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#0e0f18';
  g.fillRect(0, 0, c.width, c.height);

  const hallColor = '#cfd3dc';
  drawFloor(g, 'tile', rectOf(plan.corridor), 'corridor');
  for (const room of plan.rooms) {
    const kind = room.kind === 'kitchen' ? 'checker' : FLOORS[hash(room.id) % FLOORS.length];
    drawFloor(g, kind, rectOf(room), room.id);
  }
  for (const room of plan.rooms) drawWalls(g, room, { hallColor });
  for (const room of plan.rooms) drawRoomProps(g, room);
  drawCorridor(g, plan);
  g.strokeStyle = '#2b2f45';
  g.lineWidth = 4;
  g.strokeRect(2, 2, c.width - 4, c.height - 4);
  return c;
}

// The inside of one project room: wall furniture, a rug under the stations and the social corner.
// Desks, workers and labels are drawn per frame by roomView.js.
export function buildRoomWorld(layout, room) {
  const c = document.createElement('canvas');
  c.width = layout.tilesW * T;
  c.height = layout.tilesH * T;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const R = rr(g);
  const w = c.width;
  const h = c.height;
  const seed = hash(room.id);
  R(0, 0, w, h, '#0e0f18');
  drawFloor(g, FLOORS[seed % FLOORS.length], { x: 0, y: FACE, w, h: h - FACE }, room.id);

  const tint = TINTS[seed % TINTS.length];
  R(0, 0, w, FACE, tint);
  R(0, 0, w, 4, '#5c6285');
  R(0, FACE - 12, w, 12, blend(tint, '#000000', 0.22));
  R(0, FACE - 12, w, 1, blend(tint, '#ffffff', 0.25));
  R(0, FACE - 2, w, 2, '#454a63');
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `rgba(30,25,50,${0.3 - i * 0.05})`;
    g.fillRect(0, FACE + i, w, 1);
  }
  R(0, 0, 3, h, '#454a63');
  R(w - 3, 0, 3, h, '#454a63');
  R(0, h - 3, w, 3, '#454a63');

  // rug under the station grid
  const palette = [['#3a4468', '#8a93c2'], ['#5b3140', '#a8586f'], ['#3f5d4a', '#7fb596']][seed % 3];
  rug(g, 10, FACE + 10, (layout.xs - 1) * T - 14, h - FACE - 22, palette[0], palette[1]);

  // wall furniture: bookshelf per ~skill, windows, board, clock, door
  const books = room.skills.length || room.stations.length;
  shelf(g, 20, 4, books, room.id);
  windowPane(g, 60, 10);
  board(g, 100, 10, room.id);
  clock(g, 140, 10);
  door(g, layout.door.x * T, 2);
  // social corner
  const xs = layout.xs * T;
  windowPane(g, xs + 4, 10);
  counter(g, xs + 2 * T - 6, 10, 40);
  for (const p of layout.props) {
    if (p.type === 'cooler') cooler(g, p.tx * T, p.ty * T - 8);
    if (p.type === 'sofa') {
      rug(g, p.tx * T - 10, p.ty * T - 26, p.w * T + 20, 54, '#3a4468', '#8a93c2');
      sofa(g, p.tx * T, p.ty * T, p.w * T, '#6c7bd9');
    }
    if (p.type === 'plant') plant(g, p.tx * T, p.ty * T - 6);
  }
  plant(g, 6, FACE - 10);
  g.strokeStyle = '#2b2f45';
  g.lineWidth = 4;
  g.strokeRect(2, 2, w - 4, h - 4);
  return c;
}

export { rectOf };
