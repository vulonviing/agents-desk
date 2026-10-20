import { TILE } from './layout.js';
import { layoutRoom } from './roomLayout.js';
import { buildRoomWorld } from './world.js';
import { drawDeskCell } from './desk.js';
import { drawActivityBubble, drawWalker, lookFor } from './character.js';
import { createWorker, stepWorker } from './walk.js';
import { demandList, stationStatus } from './stationStatus.js';

// The inside of one project room: every station is a desk, one to three workers walk between them,
// drink coffee and look out of the window. A station that is in use gets a worker.

const T = TILE;
const FONT = '"Pixelify Sans", monospace';
const CELL = 64;
const MAX_WORKERS = 3;
const LIVE_COLOR = '#7be0a3';
const SOCIAL_LABEL = { coffee: 'Kahve', cooler: 'Su', window: 'Pencere', sofa: 'Kanepe' };

export function createRoomView(host) {
  const view = { id: 'room', world: { w: 1, h: 1 }, room: null, layout: null, canvas: null, scene: null, sceneCtx: null, hoverId: null, selectedId: null, workers: [], statuses: new Map() };

  view.build = (room) => {
    view.room = room;
    view.layout = layoutRoom(room);
    view.canvas = buildRoomWorld(view.layout, room);
    view.world = { w: view.canvas.width, h: view.canvas.height };
    view.scene = document.createElement('canvas');
    view.scene.width = view.world.w;
    view.scene.height = view.world.h;
    view.sceneCtx = view.scene.getContext('2d');
    view.workers = [createWorker(`${room.id}#0`, view.layout, view.layout.stations[0].station.id)];
    view.workers[0].look = lookFor(view.workers[0].id);
    view.rngState = 12345;
  };

  // Small seeded generator: the same room always behaves the same way for the same history.
  const rng = () => {
    view.rngState = (Math.imul(view.rngState, 1664525) + 1013904223) >>> 0;
    return view.rngState / 4294967296;
  };

  const statusOf = (station) => {
    const live = host.roomLive(view.room);
    const run = host.runOf(view.room.id);
    return stationStatus(station, host.activityOf(view.room.id), run?.stationId ?? live?.stationId ?? null, host.now());
  };

  view.update = (dt) => {
    const now = host.now();
    const live = host.roomLive(view.room);
    const run = host.runOf(view.room.id); // a run started from the office comes first
    const stations = view.room.stations;
    const demand = demandList(stations, host.activityOf(view.room.id), run?.stationId ?? live?.stationId ?? null, now, MAX_WORKERS);
    // one worker always lives here; more join while several stations are busy
    const want = Math.max(1, demand.length);
    while (view.workers.length < want) {
      const w = createWorker(`${view.room.id}#${view.workers.length}`, view.layout, view.layout.stations[Math.min(view.workers.length, view.layout.stations.length - 1)].station.id);
      w.look = lookFor(w.id);
      view.workers.push(w);
    }
    // keep each worker on its station when possible, hand out the rest in order
    const taken = new Set();
    const assigned = view.workers.map((w) => {
      const keep = demand.find((d) => d === w.stationId || d === w.target?.id);
      if (keep) taken.add(keep);
      return keep ?? null;
    });
    const spare = demand.filter((d) => !taken.has(d));
    assigned.forEach((d, i) => {
      if (!d && spare.length) assigned[i] = spare.shift();
    });
    const asleep = !demand.length && view.room.dust >= 2 && !live;
    view.workers.forEach((w, i) => {
      const idleFollower = i >= want;
      stepWorker(w, dt, { layout: view.layout, demand: idleFollower ? null : assigned[i], sleeping: asleep && i === 0, rng });
    });
    view.statuses = new Map(stations.map((s) => [s.id, statusOf(s)]));
  };

  view.drawScene = (f, walkF) => {
    const g = view.sceneCtx;
    g.imageSmoothingEnabled = false;
    g.drawImage(view.canvas, 0, 0);
    const seated = new Map(view.workers.filter((w) => w.mode === 'seated' || w.mode === 'sleeping').map((w) => [w.stationId, w]));
    for (const s of view.layout.stations) {
      const st = view.statuses.get(s.station.id) ?? statusOf(s.station);
      const worker = seated.get(s.station.id);
      const waiting = host.roomLive(view.room)?.state === 'waiting' || host.runOf(view.room.id)?.waiting;
      const mode = worker ? (worker.mode === 'sleeping' ? 'sleep' : st.live ? (waiting ? 'wait' : 'work') : st.hot ? 'work' : 'idle') : 'idle';
      drawDeskCell(g, s.tx * T, s.ty * T, {
        desk: { id: s.station.id, lamp: st.lamp, dust: st.dust },
        mode,
        look: worker?.look,
        f,
        live: st.live || st.hot,
        occupied: !!worker,
      });
      if (view.selectedId === s.station.id || view.hoverId === s.station.id) {
        g.strokeStyle = view.selectedId === s.station.id ? '#7c5cff' : 'rgba(255,255,255,0.7)';
        g.lineWidth = 1;
        g.strokeRect(s.tx * T + 1.5, s.ty * T - 2.5, CELL - 3, CELL + 1);
      }
    }
    // walking workers on top, back to front
    const walking = view.workers.filter((w) => w.mode === 'walking' || w.mode === 'doing').sort((a, b) => a.pos.y - b.pos.y);
    for (const w of walking) {
      const fx = w.pos.x * T + T / 2;
      const fy = w.pos.y * T + T - 2;
      const doing = w.mode === 'doing' ? w.doing : null;
      drawWalker(g, fx, fy, doing === 'window' ? 'up' : w.dir, w.look, w.mode === 'walking' ? walkF : 0, { cup: doing === 'coffee' || doing === 'cooler', sit: doing === 'sofa' });
      if (doing) drawActivityBubble(g, fx, fy, doing, f);
    }
  };

  view.drawLabels = (ctx, cam, at, truncate, clamp) => {
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    const size = clamp(6.5 * cam.z, 9, 14);
    // station plates
    for (const s of view.layout.stations) {
      const st = view.statuses.get(s.station.id);
      if (!st) continue;
      const c = at(s.tx * T + CELL / 2, s.ty * T + 52);
      const maxW = CELL * cam.z - 2;
      ctx.font = `${size}px ${FONT}`;
      const name = truncate(s.station.name, maxW);
      const nameW = ctx.measureText(name).width;
      ctx.font = `${size - 1}px ${FONT}`;
      const sub = truncate(st.live ? 'çalışıyor' : st.count7d ? `${st.label} · ${st.count7d}×` : st.label, maxW);
      const pw = Math.max(nameW, ctx.measureText(sub).width) + 8;
      ctx.fillStyle = 'rgba(14,15,24,0.62)';
      ctx.fillRect(c.x - pw / 2, c.y - size, pw, size * 2.4);
      ctx.fillStyle = '#e8e9f3';
      ctx.font = `${size}px ${FONT}`;
      ctx.fillText(name, c.x, c.y);
      ctx.fillStyle = st.live ? LIVE_COLOR : st.dust >= 2 ? '#ffb454' : '#aab0cc';
      ctx.font = `${size - 1}px ${FONT}`;
      ctx.fillText(sub, c.x, c.y + size * 1.1);
    }
    // room title on the wall and names of the social spots
    const title = at(view.world.w / 2, 24);
    ctx.font = `400 ${clamp(8 * cam.z, 10, 22)}px ${FONT}`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(20,22,40,0.55)';
    ctx.strokeText(view.room.name.toUpperCase(), title.x, title.y);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText(view.room.name.toUpperCase(), title.x, title.y);
    if (cam.z >= 0.8) {
      ctx.font = `${clamp(6 * cam.z, 8, 12)}px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (const sp of view.layout.spots) {
        const p = at(sp.x * T + T / 2, sp.y * T + T + 8);
        ctx.fillText(SOCIAL_LABEL[sp.kind], p.x, p.y);
      }
    }
  };

  view.pick = (wx, wy) => {
    const s = view.layout.stations.find((x) => wx >= x.tx * T && wx < x.tx * T + CELL && wy >= x.ty * T - 4 && wy < x.ty * T + CELL);
    return s ? { station: s.station, id: s.station.id } : null;
  };
  view.focusRect = (item) => {
    const s = view.layout.stations.find((x) => x.station.id === item.id);
    return s ? { x: s.tx * T - 40, y: s.ty * T - 24, w: CELL + 80, h: CELL + 48 } : null;
  };
  view.items = () => view.layout.stations.map((s) => ({ station: s.station, id: s.station.id }));
  view.animated = true;
  return view;
}
