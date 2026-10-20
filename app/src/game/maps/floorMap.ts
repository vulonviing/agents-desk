import type { Floor } from '../../types';
import { TILE } from '../constants';
import { type FloorPlan, type PlacedRoom } from '../layout/floorLayout';
import { COLLISION_GID, faceGid, floorGid, hash, themeOf, TILESETS, WALL_FACE_ROWS, wallGid, type FloorTheme, type Piece } from './catalog';
import { deskSet, sprite, type Placer } from './furniture';
import { MapBuilder, prop, type TiledMap, type TiledObject } from './tiled';

// Builds the Tiled map of one floor: ground, walls, collision, furniture objects, desk spots and room zones.

export interface FloorMapResult {
  map: TiledMap;
  worldW: number;
  worldH: number;
}

const T = TILE;

function floorStyleOf(r: PlacedRoom, theme: FloorTheme): string {
  if (r.kind === 'garden') return 'tileTeal';
  if (r.kind === 'kitchen') return 'tileTeal';
  if (r.kind === 'meeting') return 'tileRed';
  if (r.kind === 'manager') return 'herringbone';
  if (r.kind === 'server') return 'tileGray';
  return theme.projectFloors[hash(r.id) % theme.projectFloors.length]!;
}

export function buildFloorMap(plan: FloorPlan, _floor: Floor, floorIndex = 0): FloorMapResult {
  const theme = themeOf(_floor.id, floorIndex);
  const W = plan.tilesW;
  const H = plan.tilesH;
  const b = new MapBuilder(W, H);
  const ground = b.tileLayer('ground');
  const walls = b.tileLayer('walls');
  const collision = b.tileLayer('collision', false);
  const furnitureList = b.objectLayer('furniture');
  const deskList = b.objectLayer('desks');
  const zoneList = b.objectLayer('zones');
  const p: Placer = { b, list: furnitureList };
  const at = (x: number, y: number) => y * W + x;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;

  // 1. thick-wall grid (true = wall)
  const wall: boolean[][] = Array.from({ length: H }, () => new Array<boolean>(W).fill(false));
  const faceColor = new Map<number, number>(); // tile index → color index for wall-face tiles
  const setWall = (x: number, y: number) => inside(x, y) && (wall[y]![x] = true);

  // Recessed office fronts leave OUTSIDE space (not furnished rooms): the building has a stepped silhouette with an exterior wall.
  const outside = new Set<number>();
  for (const r of plan.rooms) {
    const t = r.terrace;
    if (t) for (let y = t.y; y < t.y + t.h; y++) for (let x = t.x; x < t.x + t.w; x++) if (inside(x, y)) outside.add(at(x, y));
  }
  for (const t of plan.outside ?? []) for (let y = t.y; y < t.y + t.h; y++) for (let x = t.x; x < t.x + t.w; x++) if (inside(x, y)) outside.add(at(x, y));
  // Outside space that does not touch the map edge is an enclosed light well: it gets a garden floor instead of the void.
  const open = new Set<number>();
  const queue: number[] = [...outside].filter((k) => { const x = k % W, y = Math.floor(k / W); return x === 0 || y === 0 || x === W - 1 || y === H - 1; });
  queue.forEach((k) => open.add(k));
  while (queue.length) {
    const k = queue.pop()!;
    const x = k % W, y = Math.floor(k / W);
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const nx = x + dx, ny = y + dy;
      if (inside(nx, ny) && outside.has(at(nx, ny)) && !open.has(at(nx, ny))) { open.add(at(nx, ny)); queue.push(at(nx, ny)); }
    }
  }
  const wells = [...outside].filter((k) => !open.has(k));
  const isOutside = (x: number, y: number) => open.has(at(x, y));
  const isWell = (x: number, y: number) => outside.has(at(x, y)) && !open.has(at(x, y));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!isOutside(x, y)) ground[at(x, y)] = floorGid(isWell(x, y) ? 'tileTeal' : 'carpetC', x, y);
  for (let x = 0; x < W; x++) { if (!isOutside(x, 0)) setWall(x, 0); if (!isOutside(x, H - 1)) setWall(x, H - 1); }
  for (let y = 0; y < H; y++) { if (!isOutside(0, y)) setWall(0, y); if (!isOutside(W - 1, y)) setWall(W - 1, y); }
  // Corridors run the full width; every office opens onto one through a doorway in its facing wall. A large floor has a central connector between its two corridors.
  const corridors = plan.corridors ?? [plan.corridor];
  const paint = (c: { x: number; y: number; w: number; h: number }) => { for (let y = c.y; y < c.y + c.h; y++) for (let x = c.x; x < c.x + c.w; x++) if (!isOutside(x, y)) ground[at(x, y)] = floorGid(theme.corridor, x, y); };
  corridors.forEach(paint);
  if (plan.connector) paint(plan.connector);

  for (const r of plan.rooms) {
    const style = floorStyleOf(r, theme);
    const colorIdx = theme.wallFaces[hash(`${r.id}#wall`) % theme.wallFaces.length]! % WALL_FACE_ROWS.length;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      const face = y < r.y + 2;
      // a shared partition is one tile thick: only the last room of a row owns its right wall
      const edge = x === r.x || (x === r.x + r.w - 1) || y === r.y + r.h - 1;
      const inDoor = (d: { x: number; y: number; w: number; h: number } | undefined) => !!d && x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h;
      const gap = inDoor(r.door) || inDoor(r.sideDoor);
      if (gap || !(face || edge)) ground[at(x, y)] = floorGid(style, x, y);
      if (gap) { wall[y]![x] = false; continue; }
      if (face) faceColor.set(at(x, y), colorIdx);
      else if (edge) setWall(x, y);
    }
  }

  // exterior wall: every inside tile that touches outside space becomes wall (rooms' own faces already count)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (isOutside(x, y) || wall[y]![x] || faceColor.has(at(x, y))) continue;
    if ([[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) => inside(x + dx!, y + dy!) && isOutside(x + dx!, y + dy!))) setWall(x, y);
  }
  for (const k of outside) collision[k] = COLLISION_GID;
  // light wells: a few plants and flower boxes, no furniture
  const wellKeys = new Set(wells);
  for (const k of wells) {
    const x = k % W, y = Math.floor(k / W);
    if ((x * 7 + y * 13) % 9 === 0 && wellKeys.has(at(x + 1, y)) && wellKeys.has(at(x, y + 1))) sprite(p, (x + y) % 2 ? 'lz_plant_a' : 'flowerbox', (x + 0.5) * T, (y + 1) * T);
  }

  // 2. wall tiles: faces use the Room Builder sheet, thick walls are auto-tiled from their neighbours
  const isWall = (x: number, y: number) => inside(x, y) && (wall[y]![x] || faceColor.has(at(x, y)));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = at(x, y);
    if (faceColor.has(k)) {
      const ry = [...plan.rooms].find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + 2)!;
      walls[k] = faceGid(faceColor.get(k)!, y === ry.y ? 0 : 1);
      collision[k] = COLLISION_GID;
    } else if (wall[y]![x]) {
      const mask = (isWall(x, y - 1) ? 1 : 0) | (isWall(x + 1, y) ? 2 : 0) | (isWall(x, y + 1) ? 4 : 0) | (isWall(x - 1, y) ? 8 : 0);
      walls[k] = wallGid(mask);
      collision[k] = COLLISION_GID;
    }
  }

  // 3. rooms: zones, furniture, desks
  for (const r of plan.rooms) {
    const X = r.x * T;
    const Y = r.y * T;
    const RW = r.w * T;
    b.rect(zoneList, r.name, 'room', X, Y, RW, r.h * T, [prop('roomId', r.id), prop('kind', r.kind), prop('name', r.name), prop('doorSide', r.door.side)]);
    decorate(p, r, X, Y, RW);
    if (r.kind === 'project' && r.cell && r.room) {
      const count = Math.min(6, Math.max(1, r.room.stations.length));
      const cols = Math.min(3, count, Math.floor((r.w - 2) / 5));
      const rows = Math.ceil(count / cols);
      for (let i = 0; i < count; i++) {
        const tx = count === 1 ? r.cell.tx : r.x + Math.floor((r.w - cols * 5) / 2) + (i % cols) * 5;
        const ty = r.y + 4 + Math.floor(i / cols) * 5;
        const { seatX, seatY } = deskSet(p, tx * T, ty * T, { roomId: r.room.id });
        b.point(deskList, `${r.room.id}:${i}`, 'desk', seatX, seatY, [prop('roomId', i === 0 ? r.room.id : `${r.room.id}:preview:${i}`), prop('stationId', r.room.stations[i]?.id ?? '')]);
      }
      if (rows > 1) sprite(p, 'partition', (r.x + r.w / 2) * T, (r.y + 8) * T);
    }
  }
  // the elevator stands in the axis of the central connector (or mid-corridor on small floors); the floor plaque hangs beside it
  const first = corridors[0]!;
  const prefer = plan.connector ? (plan.connector.x + plan.connector.w / 2) * T - 16 : (first.w * T) / 2 - 16;
  const lift = freeWallSpan(plan, first, 44, prefer);
  if (lift !== null) {
    sprite(p, 'elevator_closed', lift + 16, first.y * T + 4, { layer: 'wall' });
    b.rect(zoneList, 'Asansör', 'elevator', lift - 48, first.y * T + 30, 128, 20, [prop('roomId', 'elevator'), prop('kind', 'elevator'), prop('name', _floor.name)]);
  }
  // stairs: the second way out, on the last corridor's south wall far from the elevator
  const lastC = corridors[corridors.length - 1]!;
  const stairs = freeStairsSpan(plan, lastC, 40, lift !== null && lift < (W * T) / 2 ? (W * T) - 90 : 40, lift);
  if (stairs !== null) {
    sprite(p, 'stairs', stairs + 16, (lastC.y + lastC.h) * T + 34, { layer: 'wall' });
    b.rect(zoneList, 'Merdiven', 'stairs', stairs - 8, (lastC.y + lastC.h) * T - 26, 64, 14, [prop('roomId', 'stairs'), prop('kind', 'stairs'), prop('name', 'Merdiven')]);
  }
  corridors.forEach((c, i) => decorateCorridor(p, plan, c, theme, i));
  if (plan.connector) decorateConnector(p, plan.connector, theme);
  decorateLobby(p, first, lift, theme);

  return { map: b.build(TILESETS), worldW: W * T, worldH: H * T };
}

// ---------- decoration ----------

const putPiece = (p: Placer, cx: number, by: number, piece: Piece) => sprite(p, piece.frame, cx + piece.dx, by + (piece.dy ?? 0), piece.layer ? { layer: piece.layer } : {});

// Corridor dressing follows the floor's theme (see the floor-interior-design skill): art along the north wall, set pieces on the
// south side, plants between them; doorways, the connector and the middle lane stay clear.
function decorateCorridor(p: Placer, plan: FloorPlan, c: { x: number; y: number; w: number; h: number }, theme: FloorTheme, index: number) {
  const X = c.x * T, Y = c.y * T;
  const doorsFacing = (side: 'north' | 'south') => plan.rooms
    .filter((r) => (side === 'north' ? r.door.side === 'south' && r.y + r.h === c.y : r.door.side === 'north' && r.y === c.y + c.h))
    .map((r) => ({ from: r.door.x * T - 18, to: (r.door.x + r.door.w) * T + 18 }));
  const top = doorsFacing('north'), bottom = doorsFacing('south');
  const free = (doors: { from: number; to: number }[], x: number, w = 20) => doors.every((d) => x + w < d.from || x - w > d.to);
  const connectorSpan = plan.connector ? [{ from: plan.connector.x * T - 24, to: (plan.connector.x + plan.connector.w) * T + 24 }] : [];
  const clearAll = (x: number, hw: number, onTop: boolean) => free(onTop ? top : bottom, X + x, hw) && free(connectorSpan, X + x, hw);
  // the floor's runner: a coloured lane down the middle of the corridor
  for (let x = 32; x + 64 <= c.w * T; x += 64) sprite(p, theme.runner, X + x + 32, Y + (c.h * T) / 2 + 7, { layer: 'floor' });
  let art = index, set = index, plant = 0;
  for (let x = 44; x < c.w * T - 44; x += 88) {
    // north wall: one piece of art per slot
    if (clearAll(x, 22, true)) sprite(p, theme.wallArt[art++ % theme.wallArt.length]!, X + x, Y + 20);
    // south side: a set piece every slot, a plant where it does not fit
    const sx = x + 44;
    if (sx < c.w * T - 60) {
      const v = theme.vignettes[set++ % theme.vignettes.length]!;
      if (clearAll(sx, v.w / 2 + 4, false)) { v.pieces.forEach((pc) => putPiece(p, X + sx, Y + c.h * T - 8, pc)); continue; }
      if (clearAll(sx, 14, false)) sprite(p, theme.plants[plant++ % theme.plants.length]!, X + sx, Y + c.h * T - 6);
    }
  }
  if (index === 0) sprite(p, 'cat_sleep', X + Math.min(c.w * T - 40, 180), Y + c.h * T - 26);
}

// The central connector: a signature group in the middle and plants at both ends; the lane stays clear.
function decorateConnector(p: Placer, k: { x: number; y: number; w: number; h: number }, theme: FloorTheme) {
  const cx = (k.x + k.w / 2) * T;
  theme.centerpiece.forEach((pc) => putPiece(p, cx, (k.y + k.h / 2) * T + 12, pc));
  sprite(p, theme.plants[0]!, (k.x + 0.9) * T, (k.y + 1.8) * T);
  sprite(p, theme.plants[1]!, (k.x + k.w - 0.9) * T, (k.y + k.h - 0.4) * T);
}

// Arrival: a runner and plants frame the elevator.
function decorateLobby(p: Placer, c: { x: number; y: number; w: number; h: number }, lift: number | null, theme: FloorTheme) {
  if (lift === null) return;
  const cx = lift + 16;
  sprite(p, theme.plants[2 % theme.plants.length]!, cx - 30, (c.y + 1.7) * T);
  sprite(p, theme.plants[0]!, cx + 150, (c.y + 1.7) * T);
}

// Left edge (px) of the free stretch of the corridor's north wall (`width` px, clear of doors and the connector) closest to `prefer`.
function freeWallSpan(plan: FloorPlan, c: { x: number; y: number; w: number; h: number }, width: number, prefer: number): number | null {
  const doors = plan.rooms.filter((r) => r.door.side === 'south' && r.y + r.h === c.y).map((r) => ({ from: r.door.x * T - 10, to: (r.door.x + r.door.w) * T + 10 }));
  const k = plan.connector;
  if (k) doors.push({ from: k.x * T - 10, to: (k.x + k.w) * T + 10 });
  let best: number | null = null;
  for (let x = c.x * T + 8; x + width < (c.x + c.w) * T - 8; x += 8) {
    if (doors.every((d) => x + width < d.from || x > d.to) && (best === null || Math.abs(x - prefer) < Math.abs(best - prefer))) best = x;
  }
  return best;
}

// The stairs sit on the south wall (the top wall of the offices below), away from doors and their plates.
function freeStairsSpan(plan: FloorPlan, c: { x: number; y: number; w: number; h: number }, width: number, prefer: number, liftX: number | null): number | null {
  const doors = plan.rooms.filter((r) => r.door.side === 'north' && r.y === c.y + c.h).map((r) => ({ from: (r.door.x - 3) * T, to: (r.door.x + r.door.w + 3) * T }));
  // far from the elevator: two ways out should not sit next to each other
  if (liftX !== null) doors.push({ from: liftX - 160, to: liftX + 260 });
  let best: number | null = null;
  for (let x = c.x * T + 8; x + width < (c.x + c.w) * T - 8; x += 8) {
    if (doors.every((d) => x + width < d.from || x > d.to) && (best === null || Math.abs(x - prefer) < Math.abs(best - prefer))) best = x;
  }
  return best;
}

function wallDecor(p: Placer, r: PlacedRoom, X: number, Y: number, RW: number) {
  // the name plate hangs in the middle of the wall (drawn by the scene), so the window moves to the right
  sprite(p, hash(r.id) % 2 ? 'lz_window_red' : 'lz_window_white', X + RW - 34, Y + 28, { layer: 'wall' });
}

function decorate(p: Placer, r: PlacedRoom, X: number, Y: number, RW: number) {
  const base = Y + 34; // wall base line: furniture stands on it
  const R = (frame: string, x: number, y: number, o = {}) => sprite(p, frame, x, y, o);
  if (r.kind === 'project') {
    wallDecor(p, r, X, Y, RW);
    const books = r.room ? r.room.skills.length || r.room.stations.length : 0;
    R(books > 6 ? 'lz_shelf_books_b' : 'lz_shelf_books_a', X + 28, base + 4);
    if (books > 12) R('lz_shelf_books_a', X + RW - 28, base + 4);
    R('lz_plant_a', X + 18, Y + r.h * T - 20);
    R('lz_plant_b', X + RW - 18, Y + r.h * T - 20);
    if (r.cell && r.room!.stations.length <= 1) R('lz_rug_big', r.cell.tx * T + 32, (r.cell.ty + 4) * T + 2, { layer: 'floor' });
  } else if (r.kind === 'garden') {
    R('rug_sage', X + RW / 2, Y + r.h * T - 24, { layer: 'floor' });
    R('lz_sofa_beige', X + RW / 2, Y + 88);
    for (let x = 24; x < RW - 12; x += 36) R('flowerbox', X + x, base + 16);
    R('lz_plant_a', X + 20, Y + 100);
    R('lz_plant_b', X + RW - 20, Y + 100);
    R('cat_sleep', X + RW / 2 + 16, Y + 110);
  } else if (r.kind === 'kitchen') {
    R('lz_cabinet_white_a', X + 40, base + 4);
    R('lz_cabinet_white_b', X + RW - 24, base + 4);
    R('coffee', X + RW - 48, base - 2);
    R('cooler', X + 18, base + 18);
    R('lz_table_light', X + RW / 2, Y + 94);
    R('chair_back', X + RW / 2 - 20, Y + 70);
    R('chair_back', X + RW / 2 + 20, Y + 70);
    R('lz_plant_b', X + RW - 18, Y + r.h * T - 18);
  } else if (r.kind === 'meeting') {
    R('whiteboard', X + RW / 2 - 24, base - 2, { layer: 'wall' });
    R('tv', X + RW / 2 + 28, base - 2, { layer: 'wall' });
    R('lz_table_wood', X + RW / 2 - 21, Y + 96);
    R('lz_table_wood', X + RW / 2 + 21, Y + 96);
    for (const dx of [-30, 0, 30]) R('chair_back', X + RW / 2 + dx, Y + 70);
    R('lz_plant_a', X + 18, Y + r.h * T - 18);
  } else if (r.kind === 'manager') {
    wallDecor(p, r, X, Y, RW);
    R('lz_shelf_books_a', X + 26, base + 4);
    R('lz_shelf_books_b', X + RW - 26, base + 4);
    deskSet(p, X + RW / 2 - 32, Y + 52);
    R('lz_sofa_beige', X + RW / 2, Y + r.h * T - 14);
    R('lz_plant_a', X + 18, Y + r.h * T - 18);
  } else if (r.kind === 'server') {
    for (let i = 0; i < 4; i++) R(`rack_${i % 3}`, X + 22 + i * 22, base + 18, { anim: 'rack' });
    R('filecab', X + 20, Y + 86);
    R('filecab', X + RW - 20, Y + 86);
    R('whiteboard', X + RW / 2 - 16, Y + 126, { layer: 'wall' });
  }
}

export type { TiledObject };
