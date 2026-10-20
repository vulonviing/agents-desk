import { TILE } from '../constants';
import { COLLISION_GID, faceGid, floorGid, TILESETS, wallGid } from './catalog';
import { deskSet, sprite, type Placer } from './furniture';
import { MapBuilder, prop } from './tiled';

// The master's permanent office is part of the same simulated building as the project floors.
export const MASTER_ID = 'manager:master';
export const MASTER_SEAT = { x: 14 * TILE, y: 12 * TILE + 33 };
export function buildMasterMap() {
  const W = 30, H = 23, T = TILE;
  const b = new MapBuilder(W, H);
  const ground = b.tileLayer('ground');
  const walls = b.tileLayer('walls');
  const collision = b.tileLayer('collision', false);
  const furniture = b.objectLayer('furniture');
  const desks = b.objectLayer('desks');
  const zones = b.objectLayer('zones');
  const p: Placer = { b, list: furniture };
  const place = (name: string, x: number, y: number, layer?: 'floor' | 'wall') => sprite(p, name, x * T, y * T, { layer });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x;
    const doorway = y >= H - 2 && x >= 14 && x <= 15;
    const boundary = x === 0 || x === W - 1 || y === H - 1;
    ground[k] = floorGid(x >= 9 && x <= 20 && y >= 8 && y <= 18 ? 'carpetD' : 'herringbone', x, y);
    if (y < 2) walls[k] = faceGid(2, y as 0 | 1);
    else if (boundary && !doorway) walls[k] = wallGid(x === 0 || x === W - 1 ? 5 : 10);
    if (walls[k]) collision[k] = COLLISION_GID;
  }
  // Windows and books frame the desk; the lounge, coffee corner, and conservatory stay walkable.
  place('lz_window_white', 6, 2, 'wall');
  place('lz_window_white', 23, 2, 'wall');
  place('lz_shelf_books_b', 3, 4);
  place('lz_shelf_books_a', 10, 4);
  place('lz_shelf_books_b', 19, 4);
  place('lz_plant_a', 27, 4.5);
  place('whiteboard', 14.5, 5, 'wall');
  place('clock', 26, 1.8, 'wall');
  place('rug_coral', 14, 16, 'floor');
  const seat = deskSet(p, 12 * T, 12 * T, { roomId: MASTER_ID });
  place('filecab', 17, 14.8);
  place('lz_plant_b', 10.5, 15.3);
  b.point(desks, MASTER_ID, 'desk', seat.seatX, seat.seatY, [prop('roomId', MASTER_ID)]);
  b.rect(zones, 'Master Yönetici', 'manager', 11 * T, 11 * T, 6 * T, 6 * T, [prop('roomId', MASTER_ID), prop('kind', 'manager'), prop('name', 'Master Yönetici')]);
  // A reading nook, set apart from the main work area by shelves and a different rug.
  place('rug_lilac', 5, 15, 'floor');
  place('lz_sofa_beige', 5, 12.6);
  place('lz_table_light', 5, 15);
  place('lz_plant_a', 2, 15);
  place('lz_shelf_books_a', 3, 8);
  place('flowerbox', 7, 8);
  // Small meeting / planning corner on the other side of the office.
  place('rug_sage', 24, 12, 'floor');
  place('chair_back', 23, 8.7);
  place('chair_back', 25, 8.7);
  place('lz_table_wood', 24, 10.6);
  place('corkboard', 24, 6, 'wall');
  place('lz_plant_b', 27, 12);
  // Coffee and an indoor garden give the room a lived-in edge.
  place('coffee', 3, 20);
  place('cooler', 5, 20);
  place('lz_cabinet_white_a', 3, 21.5);
  place('rug_sage', 24, 21, 'floor');
  place('lz_sofa_beige', 24, 19.5);
  place('flowerbox', 20, 21);
  place('flowerbox', 27, 21);
  place('lz_plant_a', 27, 17.5);
  place('cat_sleep', 23.7, 20.8);
  sprite(p, 'butterfly_0', 26.5 * T, 17 * T, { anim: 'butterfly' });
  // Compact lobby around the entrance: floor directory on the left of the doorway, the elevator on the right.
  place('board_floors', 12, 22.6, 'wall');
  place('elevator_closed', 17.5, 22.75, 'wall');
  place('lz_plant_a', 9.5, 21);
  place('lz_plant_b', 20.5, 21);
  return { map: b.build(TILESETS), worldW: W * T, worldH: H * T };
}
