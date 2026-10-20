import type { Room } from '../../types';
import { TILE } from '../constants';
import type { RoomLayout } from '../layout/roomLayout';
import { COLLISION_GID, faceGid, floorGid, hash, TILESETS, themeGid, themeOf, wallGid } from './catalog';
import { dressOf } from './roomDress';
import type { FloorMapResult } from './floorMap';
import { deskSet, sprite, type Placer } from './furniture';
import { MapBuilder, prop } from './tiled';

// Builds the Tiled map of one room: every station is a desk; the right-hand corner is the social area.

const T = TILE;

export function buildRoomMap(layout: RoomLayout, room: Room, floorId = '', floorIndex = 0): FloorMapResult {
  const floorTheme = themeOf(floorId, floorIndex);
  const W = layout.tilesW;
  const H = layout.tilesH;
  const b = new MapBuilder(W, H);
  const ground = b.tileLayer('ground');
  const walls = b.tileLayer('walls');
  const collision = b.tileLayer('collision', false);
  const furniture = b.objectLayer('furniture');
  const stationsLayer = b.objectLayer('stations');
  const spotsLayer = b.objectLayer('spots');
  const coordinatorSeats = b.objectLayer('desks');
  const p: Placer = { b, list: furniture };
  const at = (x: number, y: number) => y * W + x;
  const themed = layout.theme === 'music' || layout.theme === 'research';
  const color = hash(`${room.id}#wall`);

  const wall = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => y >= 2 && (x === 0 || x === W - 1 || y === H - 1 || layout.partitions[y]![x])));
  const isWall = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && (y < 2 || wall[y]![x]!);

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = at(x, y);
    if (y < 2) {
      const northRoom = layout.departments.find(z => z.y === 0 && x >= z.x && x < z.x + z.w);
      walls[k] = themed ? themeGid(layout.theme, y === 0 ? 1 : 2) : faceGid(northRoom ? dressOf(northRoom.dress)?.wall ?? color : color, y === 0 ? 0 : 1);
      continue;
    }
    const zone = layout.departments.find(z => x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h);
    if (zone && y <= zone.y + 1 && layout.partitions[y]![x]) {
      const dress = dressOf(zone.dress);
      walls[k] = themed ? themeGid(layout.theme, y === zone.y ? 1 : 2) : faceGid(dress ? dress.wall : layout.departments.indexOf(zone), y === zone.y ? 0 : 1);
    } else if (wall[y]![x]) {
      walls[k] = wallGid((isWall(x, y - 1) ? 1 : 0) | (isWall(x + 1, y) ? 2 : 0) | (isWall(x, y + 1) ? 4 : 0) | (isWall(x - 1, y) ? 8 : 0));
    } else {
      ground[k] = themed ? themeGid(layout.theme, 0) : floorGid(zone ? dressOf(zone.dress)?.floor ?? zone.floor : floorTheme.corridor, x, y);
    }
    if (!layout.grid[y]![x]) collision[k] = COLLISION_GID;
  }
  for (let x = 0; x < W; x++) for (let y = 0; y < 2; y++) collision[at(x, y)] = COLLISION_GID;

  // wall furniture
  const books = room.skills.length || room.stations.length;
  const base = 34;
  sprite(p, books > 6 ? 'lz_shelf_books_b' : 'lz_shelf_books_a', 30, base + 4);
  if (books > 12 && layout.openPlan) sprite(p, 'lz_shelf_books_a', 76, base + 4);
  sprite(p, 'lz_window_white', layout.openPlan && layout.departments[0] && dressOf(layout.departments[0].dress)?.openBack ? 96 : 122, base - 4, { layer: 'wall' });
  if (layout.openPlan && !(layout.openPlan && layout.departments[0] && dressOf(layout.departments[0].dress)?.openBack)) sprite(p, 'clock', 158, base - 10, { layer: 'wall' });
  sprite(p, 'door_office', layout.door.x * T + T, base + 2, { layer: 'wall' });
  if (layout.openPlan) sprite(p, 'lz_plant_a', 18, base + 22);

  // Every room has its own dress: back-wall art, corner pieces; rooms without one keep the generic wall furniture.
  for (const z of layout.departments) {
    const dress = dressOf(z.dress);
    if (!dress) {
      const frame = layout.theme === 'music' ? 'music_poster' : layout.theme === 'research' ? 'research_board' : z.id === 'opportunities' ? 'opportunity_board' : z.id === 'letters' ? 'letter_board' : 'research_board';
      sprite(p, frame, (z.x + 2) * T, (z.y + 2) * T, { layer: 'wall' });
      sprite(p, layout.theme === 'music' ? 'vinyl_rack' : 'lz_shelf_books_a', (z.x + z.w - 2) * T, (z.y + 2) * T + 4, { layer: 'wall' });
      continue;
    }
    const south = z.doorY === z.y; // door in the top wall: keep the back wall free there
    const from = layout.openPlan ? z.x + 12 : z.y === 0 && z.coordinator ? z.x + 8 : z.x + 2, to = layout.openPlan ? z.x + z.w - 10 : z.x + z.w - (south ? 5 : 2);
    dress.back.forEach((frame, i) => sprite(p, frame, layout.openPlan && dress.openBack ? dress.openBack[i]! : (from + ((to - from) * (i + 0.5)) / dress.back.length) * T, (z.y + 3) * T - 2, { layer: 'wall' }));
    const bottom = (z.y + z.h - 1) * T - 3;
    const doorAtBottom = !south && !layout.openPlan;
    for (const c of dress.corners) {
      if (c.at === 'abs') { sprite(p, c.frame, c.dx ?? 0, c.dy ?? 0); continue; }
      const cx = c.at === 'bl' ? (z.x + 3) * T : c.at === 'bm' ? (z.x + z.w / 2) * T : (z.x + z.w - (doorAtBottom ? 6.5 : 3)) * T;
      sprite(p, c.frame, cx + (c.dx ?? 0), bottom + (c.dy ?? 0));
    }
  }
  // the hall: the floor's runner and a couple of its set pieces instead of identical rugs
  for (let x = 2 * T + 32; !layout.openPlan && x + 32 < (W - 2) * T; x += 64) sprite(p, floorTheme.runner, x, (layout.hallY + 3.4) * T, { layer: 'floor' });
  if (!layout.openPlan) floorTheme.vignettes.slice(0, 2).forEach((v, i) => v.pieces.forEach((pc) => sprite(p, pc.frame, (i ? W * 0.68 : W * 0.34) * T + pc.dx, (layout.hallY + 4.6) * T + (pc.dy ?? 0), pc.layer ? { layer: pc.layer } : {})));
  sprite(p, layout.theme === 'music' ? 'vinyl_rack' : 'lz_shelf_books_a', 5 * T, (H - 2) * T);
  sprite(p, 'flowerbox', 9 * T, (H - 2) * T);
  sprite(p, 'cat_sleep', (W - 9) * T, (H - 2) * T, { layer: 'floor' });

  layout.coordinatorDesks.forEach((desk, i) => {
    const seat = deskSet(p, desk.tx * T, desk.ty * T, { roomId: `coordination:${room.id}:${i}`, cellW: 48 });
    b.point(coordinatorSeats, `coordination:${room.id}:${i}`, 'desk', seat.seatX, seat.seatY, [prop('roomId', `coordination:${room.id}:${i}`)]);
  });

  // stations: a desk set each, a seat and the aisle tile in front
  for (const s of layout.stations) {
    const { seatX, seatY } = deskSet(p, s.tx * T, s.ty * T, { stationId: s.station.id, roomId: room.id, cellW: 48 });
    b.point(stationsLayer, s.station.id, 'station', seatX, seatY, [
      prop('stationId', s.station.id), prop('tx', s.tx), prop('ty', s.ty), prop('seatTx', s.seat.x), prop('seatTy', s.seat.y), prop('accessTx', s.access.x), prop('accessTy', s.access.y),
    ]);
  }

  // social corner
  for (const pr of layout.props) {
    const x = pr.tx * T;
    const y = pr.ty * T;
    if (pr.type === 'window') sprite(p, 'lz_window_red', x + T, base - 4, { layer: 'wall' });
    if (pr.type === 'coffee') sprite(p, 'coffee', x + T + 8, (pr.ty + 2) * T);
    if (pr.type === 'cooler') sprite(p, 'cooler', x + T / 2, y + T - 2);
    if (pr.type === 'sofa') sprite(p, 'lz_sofa_beige', x + (pr.w * T) / 2, y + T + 2);
    if (pr.type === 'plant') sprite(p, 'lz_plant_b', x + T / 2, y + T);
    if (pr.type === 'table') {
      sprite(p, 'lz_rug_small_red', x + (pr.w * T) / 2, y + pr.h * T, { layer: 'floor' });
      sprite(p, 'lz_table_wood', x + (pr.w * T) / 2, y + pr.h * T - 4);
    }
    if (pr.type === 'printer') sprite(p, 'printer', x + T / 2, y + T, { role: 'printer', roomId: room.id });
    if (pr.type === 'whiteboard') sprite(p, 'whiteboard', x + T, y + T + 8, { layer: 'wall' });
  }
  for (const sp of layout.spots) b.point(spotsLayer, sp.id, 'spot', sp.x * T + T / 2, sp.y * T + T, [prop('kind', sp.kind), prop('tx', sp.x), prop('ty', sp.y)]);

  return { map: b.build(TILESETS), worldW: W * T, worldH: H * T };
}
