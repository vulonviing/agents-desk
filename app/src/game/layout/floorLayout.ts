import type { Floor, Room } from '../../types';
import { DESK, NORTH, type Rect } from '../constants';

// Pure layout in tiles. Small floors: two rows of offices with ONE corridor between them. Large floors: three rows with TWO
// corridors, joined by a central connector that splits the middle row into a left and a right half. Every office has a door
// onto a corridor; the building is a compact rectangle (no wings, no side gutters).

export type RoomKind = 'project' | 'kitchen' | 'meeting' | 'manager' | 'server' | 'garden';
export const SPINE_H = 6; // walkable height of a corridor
export const CONNECTOR_W = 5; // walkable width of the central connector (large floors)
const THREE_ROWS_FROM = 9; // rooms (offices + services) from which a floor gets three rows
export const ROOM_W = 10;
export const ROOM_H = 9;
export const CORRIDOR_H = 6;
const SERVICE_W = 9;

export interface PlacedRoom extends Rect {
  id: string;
  kind: RoomKind;
  name: string;
  room: Room | null;
  /** which side of the corridor the office stands on */
  band: 'north' | 'south';
  /** the opening in the wall facing a corridor, in tiles */
  door: { side: 'north' | 'south'; x: number; y: number; w: number; h: number };
  /** a second doorway onto the central connector (offices standing next to it) */
  sideDoor?: { side: 'east' | 'west'; x: number; y: number; w: number; h: number };
  /** Top-left tile of the 4x4 desk cell of a project room's resident. */
  cell: { tx: number; ty: number } | null;
  row: number;
  terrace?: Rect;
}

export interface FloorPlan {
  tilesW: number;
  tilesH: number;
  rooms: PlacedRoom[];
  /** the first (north) corridor */
  corridor: Rect;
  corridors?: Rect[];
  /** the central connector between the two corridors of a three-row floor */
  connector?: Rect;
  /** outside space beyond a short row (not part of the building) */
  outside?: Rect[];
}

const SERVICES: RoomKind[][] = [
  ['meeting', 'garden', 'kitchen'],
  ['meeting', 'server', 'garden', 'kitchen'],
  ['garden', 'meeting', 'kitchen'],
];
const SERVICE_NAME: Record<string, string> = { garden: 'Kış bahçesi', kitchen: 'Mutfak', meeting: 'Toplantı', manager: 'Yönetim', server: 'Arşiv ve sunucu' };

interface Draft {
  id: string;
  kind: RoomKind;
  name: string;
  room: Room | null;
  w: number;
  h: number;
}

// Mirrors the server's skill/project identities, so office size reflects actual residents.
export function officePopulation(room: Room): number {
  return 1 + (room.stations ?? []).length;
}

// An office is sized by what it holds: its desks (at most six are drawn on the floor), never by the space left over.
export function officeSize(room: Room): { w: number; h: number } {
  const count = Math.min(6, Math.max(1, (room.stations ?? []).length));
  const cols = Math.min(3, count);
  const rows = Math.ceil(count / cols);
  return { w: Math.max(ROOM_W, cols * 5 + 3), h: 4 + rows * 5 };
}

export function layoutFloor(floor: Floor, floorIndex = 0, _targetAspect = 1.7): FloorPlan {
  const projects: Draft[] = floor.rooms.map((r) => ({ id: r.id, kind: 'project', name: r.name, room: r, ...officeSize(r) }));
  const kinds = SERVICES[Math.min(floorIndex, SERVICES.length - 1)]!;
  const services: Draft[] = projects.length
    ? kinds.map((k) => ({ id: `${floor.id}:${k}`, kind: k, name: SERVICE_NAME[k] ?? k, room: null, w: SERVICE_W + (k === 'garden' ? 3 : 0), h: ROOM_H }))
    : [];
  if (!projects.length) return { tilesW: 0, tilesH: 0, rooms: [], corridor: { x: 0, y: 0, w: 0, h: 0 } };

  // Service rooms are spread evenly between the offices (kitchen is not tucked away at one end).
  const order: Draft[] = [];
  let next = 0;
  projects.forEach((p, i) => {
    order.push({ ...p });
    while (next < services.length && i + 1 >= Math.round(((next + 1) * projects.length) / (services.length + 1))) order.push({ ...services[next++]! });
  });
  order.push(...services.slice(next).map((d) => ({ ...d })));

  const three = order.length >= THREE_ROWS_FROM;
  const rows: Draft[][] = Array.from({ length: three ? 3 : 2 }, () => []);
  const mid = three ? 1 : -1;
  const lengthOf = (r: Draft[], i: number) => r.reduce((n, d) => n + d.w, 0) + (i === mid ? CONNECTOR_W : 0);
  for (const d of order) {
    // the middle row touches both corridors, so it only takes standard-height rooms (no stretching, no gaps)
    const allowed = rows.map((_, i) => i).filter((i) => i !== mid || d.h <= ROOM_H);
    let best = allowed[0]!;
    for (const i of allowed) if (lengthOf(rows[i]!, i) < lengthOf(rows[best]!, best)) best = i;
    rows[best]!.push(d);
  }
  // rows keep their natural lengths: nothing is stretched; what is left beyond a short row is outside space
  const width = Math.max(...rows.map((r, i) => lengthOf(r, i)));
  const rowH = rows.map((r) => Math.max(ROOM_H, ...r.map((d) => d.h)));

  // vertical stacking: row0, corridor, row1, [corridor, row2]
  const rowY: number[] = [];
  const corridors: { x: number; y: number; w: number; h: number }[] = [];
  let y = 0;
  rows.forEach((_, i) => {
    rowY.push(y);
    y += rowH[i]!;
    if (i < rows.length - 1) { corridors.push({ x: 0, y, w: width, h: SPINE_H }); y += SPINE_H; }
  });
  const height = y;

  // the middle row is split around the connector, as close to the centre as the office widths allow
  let connectorX = -1;
  if (three) {
    const row = rows[1]!;
    const target = (width - CONNECTOR_W) / 2;
    let acc = 0, bestK = 0, bestDiff = Infinity;
    row.forEach((d, k) => { acc += d.w; const diff = Math.abs(acc - target); if (diff < bestDiff) { bestDiff = diff; bestK = k; } });
    connectorX = row.slice(0, bestK + 1).reduce((n, d) => n + d.w, 0);
  }

  const placed: PlacedRoom[] = [];
  const outside: { x: number; y: number; w: number; h: number }[] = [];
  rows.forEach((row, ri) => {
    const first = ri === 0, last = ri === rows.length - 1;
    let x = 0;
    row.forEach((d, idx) => {
      if (ri === mid && x === connectorX) x += CONNECTOR_W;
      const ry = first ? rowY[ri]! + rowH[ri]! - d.h : rowY[ri]!;
      const outerH = rowH[ri]! - d.h;
      const cx = x + Math.floor(d.w / 2) - 1;
      // doors face a corridor: the north row opens south, the south row north, the middle row alternates between both
      const southDoor = first || (ri === mid && idx % 2 === 1);
      placed.push({
        id: d.id, kind: d.kind, name: d.name, room: d.room, band: southDoor ? 'north' : 'south', row: idx, x, y: ry, w: d.w, h: d.h,
        door: southDoor ? { side: 'south', x: cx, y: ry + d.h - 1, w: 2, h: 1 } : { side: 'north', x: cx, y: ry, w: 2, h: 2 },
        cell: d.kind === 'project' ? { tx: x + Math.floor((d.w - DESK) / 2), ty: ry + NORTH + 1 } : null,
        terrace: outerH > 0 && (first || last) ? { x, y: first ? rowY[ri]! : ry + d.h, w: d.w, h: outerH } : undefined,
      });
      x += d.w;
    });
    // a short row ends early: the rest of its band is outside space
    const end = x + (ri === mid && connectorX >= x ? CONNECTOR_W : 0);
    if (end < width) outside.push({ x: end, y: rowY[ri]!, w: width - end, h: rowH[ri]! });
  });
  if (three) {
    for (const r of placed) {
      if (r.y !== rowY[1]) continue;
      const doorY = r.y + NORTH + 2;
      if (r.x + r.w === connectorX) r.sideDoor = { side: 'east', x: r.x + r.w - 1, y: doorY, w: 1, h: 2 };
      if (r.x === connectorX + CONNECTOR_W) r.sideDoor = { side: 'west', x: r.x, y: doorY, w: 1, h: 2 };
    }
  }
  const connector = three ? { x: connectorX, y: corridors[0]!.y + SPINE_H, w: CONNECTOR_W, h: rowH[1]! } : undefined;
  return { tilesW: width, tilesH: height, rooms: placed, corridor: corridors[0]!, corridors, connector, outside };
}
