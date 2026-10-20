import { prop, type MapBuilder, type TiledObject } from './tiled';

// Shared helpers to place sprites (atlas frames) on the object layers. All x/y are bottom-center pixels.

export interface Placer {
  b: MapBuilder;
  list: TiledObject[];
}

export interface SpriteOpts {
  /** 'floor' sprites (rugs) are drawn under everything, 'wall' ones above the wall tiles but under characters */
  layer?: 'floor' | 'wall';
  role?: string;
  roomId?: string;
  stationId?: string;
  /** extra properties, e.g. the animation of a server rack */
  anim?: string;
  flipX?: boolean;
  /** explicit depth (seated characters sit between the chair and the desk) */
  depth?: number;
}

export function sprite(p: Placer, frame: string, x: number, y: number, o: SpriteOpts = {}): TiledObject {
  const props = [prop('frame', frame)];
  if (o.layer) props.push(prop('layer', o.layer));
  if (o.role) props.push(prop('role', o.role));
  if (o.roomId) props.push(prop('roomId', o.roomId));
  if (o.stationId) props.push(prop('stationId', o.stationId));
  if (o.anim) props.push(prop('anim', o.anim));
  if (o.flipX) props.push(prop('flipX', true));
  if (o.depth !== undefined) props.push(prop('depth', o.depth));
  return p.b.point(p.list, frame, 'sprite', Math.round(x), Math.round(y), props);
}

// A work desk as the player sees it: chair behind, white desk, a low monitor, keyboard, a mug. (x, y) is the
// top-left pixel of the 64 x 64 desk cell. The character sits at `seat` (feet): head and shoulders stay visible
// above the monitor, the lower body is hidden by the desk. Depth order: chair < character < monitor < desk.
export function deskSet(p: Placer, x: number, y: number, o: { roomId?: string; stationId?: string; chair?: boolean; cellW?: number } = {}) {
  const { cellW = 64, ...rest } = o;
  const cx = x + cellW / 2;
  const seatY = y + 33;
  if (rest.chair !== false) sprite(p, 'chair_back', cx, y + 30, { ...rest, depth: y + 30 });
  sprite(p, 'desk', cx, y + 52, { ...rest, depth: y + 52 });
  sprite(p, 'monitor_off_0', cx, y + 37, { ...rest, role: 'monitor', depth: y + 40 });
  sprite(p, 'keyboard', cx, y + 45, { ...rest, depth: y + 46 });
  sprite(p, 'mug', cx + 21, y + 41, { ...rest, depth: y + 46 });
  sprite(p, 'papers', cx - 21, y + 43, { ...rest, depth: y + 46 });
  return { seatX: cx, seatY };
}
