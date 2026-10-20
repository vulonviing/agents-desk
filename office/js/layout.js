// Pure floor-plan layout (no DOM, no canvas) so it can be unit tested.
// Coordinates are tiles of TILE px. A floor is a building level: every project is a compact room
// along the north or south wall, a corridor runs between the two rows.

export const TILE = 16;
export const NORTH = 3; // wall face height of every room, in tiles
export const DESK = 4; // desk cell is DESK x DESK tiles
export const ROOM_W = 10;
export const ROOM_H = NORTH + 6;
export const CORRIDOR_H = 6;
const MIN_W = 28;

const sumW = (rooms) => rooms.reduce((n, r) => n + r.w, 0);

// Spreads spare width over the rooms of a row, one tile at a time, so the row fills the building.
function stretch(row, width) {
  let extra = width - sumW(row);
  for (let i = 0; extra > 0 && row.length; i++, extra--) row[i % row.length].w++;
}

// floor: { id, name, rooms[] } from /api/projects.
export function layoutFloor(floor) {
  const rooms = floor.rooms.map((r) => ({ kind: 'project', id: r.id, name: r.name, room: r, w: ROOM_W, h: ROOM_H }));
  if (!rooms.length) return { tilesW: 0, tilesH: 0, rooms: [], corridor: null };

  const half = Math.ceil(rooms.length / 2);
  const north = rooms.slice(0, half);
  const south = rooms.slice(half);
  // A kitchen fills the south row when that keeps the rows balanced.
  if (south.length < north.length) south.push({ kind: 'kitchen', id: `${floor.id}:kitchen`, name: 'Mutfak', room: null, w: ROOM_W, h: ROOM_H });

  const width = Math.max(sumW(north), sumW(south), MIN_W);
  stretch(north, width);
  stretch(south, width);

  const place = (row, y, band) => {
    let x = 0;
    for (const r of row) {
      Object.assign(r, { x, y, band });
      r.door = { side: band === 'north' ? 'south' : 'north', x: x + Math.floor(r.w / 2) - 1, w: 2 };
      r.cell = r.kind === 'project' ? { tx: x + Math.floor((r.w - DESK) / 2), ty: y + NORTH + 1 } : null;
      x += r.w;
    }
  };
  place(north, 0, 'north');
  place(south, ROOM_H + CORRIDOR_H, 'south');

  return {
    tilesW: width,
    tilesH: ROOM_H + CORRIDOR_H + (south.length ? ROOM_H : 0),
    rooms: [...north, ...south],
    corridor: { x: 0, y: ROOM_H, w: width, h: CORRIDOR_H },
  };
}
