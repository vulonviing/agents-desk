// Pure room-interior layout: stations on a grid with one-tile aisles, a social corner on the right,
// and a walkable tile grid for the worker's path finding. Units are tiles.

import { DESK, NORTH } from './layout.js';

export const PITCH = DESK + 1; // a desk cell plus one aisle tile
const SOCIAL_W = 6;

export function gridFor(n) {
  const cols = Math.min(Math.max(1, n), Math.max(1, Math.min(6, Math.ceil(Math.sqrt(n * 1.3)))));
  return { cols, rows: Math.ceil(n / cols) };
}

// room: { id, stations[] }. Returns everything the renderer and the worker need.
export function layoutRoom(room) {
  const n = room.stations.length;
  const { cols, rows } = gridFor(n);
  const xs = 2 + cols * PITCH; // first column of the social corner
  const tilesW = xs + SOCIAL_W + 1;
  const tilesH = NORTH + 1 + rows * PITCH + 1;

  const stations = room.stations.map((station, i) => {
    const tx = 2 + (i % cols) * PITCH;
    const ty = NORTH + 1 + Math.floor(i / cols) * PITCH;
    return { station, tx, ty, seat: { x: tx + 2, y: ty }, access: { x: tx + 2, y: ty - 1 } };
  });

  // Social corner: coffee machine and cooler against the wall, window, sofa at the bottom, plants.
  const sofaY = Math.max(NORTH + 6, tilesH - 3);
  const props = [
    { type: 'window', tx: xs, ty: 0, w: 2, h: 2 },
    { type: 'coffee', tx: xs + 2, ty: NORTH - 2, w: 3, h: 2 },
    { type: 'cooler', tx: xs + 5, ty: NORTH, w: 1, h: 1 },
    { type: 'sofa', tx: xs + 1, ty: sofaY, w: 3, h: 1 },
    { type: 'plant', tx: xs + 5, ty: sofaY, w: 1, h: 1 },
  ];
  // Stand tiles sit next to their props so a worker never overlaps the furniture.
  const spots = [
    { id: 'coffee', kind: 'coffee', x: xs + 2, y: NORTH },
    { id: 'cooler', kind: 'cooler', x: xs + 4, y: NORTH },
    { id: 'window', kind: 'window', x: xs + 1, y: NORTH },
    { id: 'sofa', kind: 'sofa', x: xs + 2, y: sofaY - 1 },
  ];

  const grid = Array.from({ length: tilesH }, (_, y) => Array.from({ length: tilesW }, (_, x) => y >= NORTH && x >= 1 && x < tilesW - 1 && y < tilesH - 1));
  const block = (x, y, w, h) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (grid[j]?.[i] !== undefined) grid[j][i] = false;
  };
  for (const s of stations) block(s.tx, s.ty, DESK, DESK);
  for (const p of props) if (p.type === 'cooler' || p.type === 'sofa' || p.type === 'plant') block(p.tx, p.ty, p.w, p.h);

  return { tilesW, tilesH, cols, rows, xs, stations, props, spots, grid, door: { x: Math.max(1, xs - 4), w: 2 } };
}
