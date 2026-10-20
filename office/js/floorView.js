import { daysSince, liveText, timeAgo } from './format.js';
import { TILE, layoutFloor } from './layout.js';
import { buildFloorWorld, rectOf } from './world.js';
import { drawDeskCell } from './desk.js';
import { lookFor } from './character.js';

// The floor plan: one compact room per project along a corridor. Clicking a room enters it.

const T = TILE;
const FONT = '"Pixelify Sans", monospace';
const LIVE_COLOR = { working: '#7be0a3', waiting: '#ffd166' };
const DARK = [0, 0.1, 0.28, 0.46];
const CELL = 64;

export function createFloorView(host) {
  const view = { id: 'floor', world: { w: 1, h: 1 }, plan: null, canvas: null, scene: null, sceneCtx: null, hoverId: null, selectedId: null, looks: new Map() };
  const look = (id) => {
    if (!view.looks.has(id)) view.looks.set(id, lookFor(id));
    return view.looks.get(id);
  };

  // Resident of a room: asleep when the project is long neglected, working/waiting while a session is live.
  const modeOf = (room, live) => (live ? (live.state === 'working' ? 'work' : 'wait') : room.dust >= 2 ? 'sleep' : 'idle');

  view.build = (floor) => {
    view.plan = layoutFloor(floor);
    view.empty = !view.plan.rooms.length;
    if (view.empty) {
      view.canvas = null;
      view.world = { w: 1, h: 1 };
      return;
    }
    view.canvas = buildFloorWorld(view.plan);
    view.world = { w: view.canvas.width, h: view.canvas.height };
    view.scene = document.createElement('canvas');
    view.scene.width = view.world.w;
    view.scene.height = view.world.h;
    view.sceneCtx = view.scene.getContext('2d');
  };

  view.drawScene = (f) => {
    const g = view.sceneCtx;
    g.imageSmoothingEnabled = false;
    g.drawImage(view.canvas, 0, 0);
    for (const r of view.plan.rooms.filter((x) => x.kind === 'project')) {
      const live = host.roomLive(r.room);
      drawDeskCell(g, r.cell.tx * T, r.cell.ty * T, { desk: r.room, mode: modeOf(r.room, live), look: look(r.id), f, live: !!live });
    }
    // lights off in rooms nobody has touched for a long time
    for (const r of view.plan.rooms.filter((x) => x.kind === 'project')) {
      const a = DARK[host.roomLive(r.room) ? 0 : r.room.dust];
      if (!a) continue;
      const { x, y, w, h } = rectOf(r);
      g.fillStyle = `rgba(6,8,30,${a})`;
      g.fillRect(x, y, w, h);
    }
    g.lineWidth = 1;
    for (const r of view.plan.rooms.filter((x) => x.kind === 'project')) {
      const sel = view.selectedId === r.id;
      if (!sel && view.hoverId !== r.id) continue;
      const { x, y, w, h } = rectOf(r);
      g.strokeStyle = sel ? '#7c5cff' : 'rgba(255,255,255,0.7)';
      g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    }
  };

  view.drawLabels = (ctx, cam, at, truncate, clamp) => {
    const nameSize = clamp(7.5 * cam.z, 9, 18);
    ctx.textBaseline = 'alphabetic';
    for (const r of view.plan.rooms) {
      const p = at(r.x * T + 8, (r.y + r.h) * T - 8);
      const q = at((r.x + r.w) * T - 8, (r.y + r.h) * T - 8);
      ctx.textAlign = 'left';
      ctx.font = `400 ${nameSize}px ${FONT}`;
      const name = truncate(r.name.toUpperCase(), q.x - p.x - 4);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(20,22,40,0.55)';
      ctx.strokeText(name, p.x, p.y);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillText(name, p.x, p.y);
    }
    if (cam.z < 0.75) return;
    const size = clamp(6.5 * cam.z, 9, 13);
    ctx.textAlign = 'center';
    for (const r of view.plan.rooms.filter((x) => x.kind === 'project')) {
      const live = host.roomLive(r.room);
      const c = at((r.cell.tx + 4) * T - CELL / 2, r.cell.ty * T + 52);
      const stationCount = r.room.skills.length ? `${r.room.skills.length} skill` : `${r.room.stations.length} istasyon`;
      const status = live ? liveText(live) : `${stationCount} · ${timeAgo(daysSince(r.room.lastCommit?.date))}`;
      ctx.font = `${size}px ${FONT}`;
      const text = truncate(status, (r.w - 1) * T * cam.z - 6);
      ctx.fillStyle = 'rgba(14,15,24,0.6)';
      const tw = ctx.measureText(text).width + 8;
      ctx.fillRect(c.x - tw / 2, c.y - size * 0.9, tw, size * 1.5);
      ctx.fillStyle = live ? LIVE_COLOR[live.state] : r.room.dust >= 2 ? '#ffb454' : '#c4c9e0';
      ctx.fillText(text, c.x, c.y + size * 0.2);
    }
  };

  view.pick = (wx, wy) => {
    const r = view.plan.rooms.find((x) => x.kind === 'project' && wx >= x.x * T && wx < (x.x + x.w) * T && wy >= x.y * T && wy < (x.y + x.h) * T);
    return r ? { room: r.room, id: r.id } : null;
  };
  view.focusRect = (item) => {
    const r = view.plan.rooms.find((x) => x.id === item.id);
    return r ? rectOf(r) : null;
  };
  view.items = () => view.plan.rooms.filter((x) => x.kind === 'project').map((r) => ({ room: r.room, id: r.id }));
  view.update = () => {};
  view.animated = false;
  return view;
}
