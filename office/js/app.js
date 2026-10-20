import { daysSince, liveText, timeAgo } from './format.js';
import { createRoomPanel } from './panel.js';
import { createTasks } from './tasks.js';
import { createFloorView } from './floorView.js';
import { createRoomView } from './roomView.js';
import { clampCamera, fitCamera, frameRect, screenToWorld, worldToScreen, zoomAt } from './camera.js';

const $ = (id) => document.getElementById(id);
const canvas = $('floor');
const ctx = canvas.getContext('2d');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const SESSIONS_MS = 3000;
const ACTIVITY_MS = { floor: 20000, room: 5000 };

const state = {
  data: null,
  live: {},
  liveSig: '',
  activity: { rooms: {} },
  floorId: null,
  roomId: null,
  selectedStation: null,
  tab: 'activity',
  view: { w: 1, h: 1, dpr: 1 },
  cam: { x: 0, y: 0, z: 1 },
  camTarget: null,
  fit: true,
  hoverId: null,
};

const floorOf = (id) => state.data.floors.find((f) => f.id === id);
const allRooms = () => state.data.floors.flatMap((f) => f.rooms);

// ---------- what the views may ask the app ----------

const tasks = createTasks(() => {
  if (current === roomView) renderPanel();
});
const host = {
  now: () => Date.now(),
  // The run started from the office in this room: its current station and whether it waits for an approval.
  runOf: (roomId) => tasks.runOf(roomId),
  activityOf: (roomId) => state.activity.rooms?.[roomId] ?? {},
  // The room's live session, or one in a repo embedded in it.
  roomLive: (room) => state.live[room.id] ?? room.embedded.map((e) => state.live[e.id]).find(Boolean) ?? null,
};
const floorView = createFloorView(host);
const roomView = createRoomView(host);
let current = floorView;

// ---------- canvas and camera ----------

function refit() {
  if (!current.world.w) return;
  state.cam = fitCamera(current.world.w, current.world.h, state.view.w, state.view.h);
  state.camTarget = null;
  state.fit = true;
}

function resize() {
  const view = $('view');
  const dpr = window.devicePixelRatio || 1;
  state.view = { w: Math.max(1, view.clientWidth), h: Math.max(1, view.clientHeight), dpr };
  canvas.width = Math.round(state.view.w * dpr);
  canvas.height = Math.round(state.view.h * dpr);
  if (state.fit) refit();
}

function truncate(text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

let frame = { f: 0, walkF: 0 };

function draw() {
  const { view, cam } = state;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.fillStyle = '#0e0f18';
  ctx.fillRect(0, 0, view.w, view.h);
  if (!current.canvas || (current === floorView && floorView.empty)) return;
  current.hoverId = state.hoverId;
  current.selectedId = current === roomView ? state.selectedStation : null;
  current.drawScene(frame.f, frame.walkF);
  ctx.imageSmoothingEnabled = false;
  const o = worldToScreen(cam, 0, 0, view.w, view.h);
  ctx.drawImage(current.scene, Math.round(o.x), Math.round(o.y), current.scene.width * cam.z, current.scene.height * cam.z);
  current.drawLabels(ctx, cam, (wx, wy) => worldToScreen(cam, wx, wy, view.w, view.h), truncate, clamp);
}

// Animation loop: 6 frames per second on the floor, 15 in a room where workers walk.
let last = 0;
function loop(ts) {
  const interval = current.animated ? 1000 / 15 : 1000 / 6;
  if (state.camTarget) {
    const c = state.cam;
    const t = state.camTarget;
    state.cam = { x: c.x + (t.x - c.x) * 0.2, y: c.y + (t.y - c.y) * 0.2, z: c.z * Math.pow(t.z / c.z, 0.2) };
    if (Math.abs(t.x - state.cam.x) < 0.3 && Math.abs(t.y - state.cam.y) < 0.3 && Math.abs(t.z / state.cam.z - 1) < 0.003) {
      state.cam = t;
      state.camTarget = null;
    }
  }
  if (!document.hidden && state.data && ts - last >= interval) {
    const dt = Math.min(0.25, (ts - last) / 1000);
    last = ts;
    frame = { f: reduceMotion ? 0 : Math.floor(ts / (1000 / 6)), walkF: reduceMotion ? 0 : Math.floor(ts / 130) };
    if (!reduceMotion) current.update(dt);
    draw();
  } else if (state.camTarget && !document.hidden) {
    draw();
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---------- views: floor and room ----------

function showFloor() {
  const floor = floorOf(state.floorId);
  state.roomId = null;
  state.selectedStation = null;
  state.hoverId = null;
  current = floorView;
  floorView.build(floor);
  $('panel').hidden = true;
  $('back').hidden = true;
  $('empty').hidden = !floorView.empty;
  $('empty').textContent = 'Bu katta henüz proje yok.';
  resize();
  refit();
  renderList();
  draw();
}

function enterRoom(roomId) {
  const room = allRooms().find((r) => r.id === roomId);
  if (!room) return;
  state.roomId = roomId;
  state.selectedStation = null;
  state.hoverId = null;
  state.tab = 'activity';
  current = roomView;
  roomView.build(room);
  $('empty').hidden = true;
  $('panel').hidden = false;
  $('back').hidden = false;
  resize();
  refit();
  roomView.update(0);
  renderPanel();
  renderList();
  draw();
  pollActivity();
}

function leaveRoom() {
  showFloor();
}

function selectStation(id) {
  state.selectedStation = id;
  const item = roomView.items().find((i) => i.id === id);
  const rect = item && roomView.focusRect(item);
  if (rect) {
    state.camTarget = frameRect(rect, state.view.w, state.view.h, 40, 2.6);
    state.fit = false;
  }
  renderPanel();
}

const roomPanel = createRoomPanel($('panel'), {
  tasks,
  onBack: () => leaveRoom(),
  onTab: (t) => {
    state.tab = t;
    renderPanel();
  },
  onSelect: (id) => selectStation(id),
});

function renderPanel() {
  if (current !== roomView) return;
  const room = roomView.room;
  roomPanel.render({ room, live: host.roomLive(room), statuses: roomView.statuses, selectedId: state.selectedStation, tab: state.tab });
}

// ---------- pointer: click picks, drag pans, wheel zooms ----------

const pointerWorld = (ev) => {
  const r = canvas.getBoundingClientRect();
  return screenToWorld(state.cam, ev.clientX - r.left, ev.clientY - r.top, state.view.w, state.view.h);
};
let drag = null;

canvas.addEventListener('pointerdown', (ev) => {
  canvas.setPointerCapture(ev.pointerId);
  drag = { x: ev.clientX, y: ev.clientY, moved: false };
});
canvas.addEventListener('pointermove', (ev) => {
  if (drag) {
    const dx = ev.clientX - drag.x;
    const dy = ev.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > 4) drag.moved = true;
    if (drag.moved) {
      state.camTarget = null;
      state.fit = false;
      state.cam = clampCamera({ ...state.cam, x: state.cam.x - dx / state.cam.z, y: state.cam.y - dy / state.cam.z }, current.world.w, current.world.h);
      drag.x = ev.clientX;
      drag.y = ev.clientY;
      canvas.style.cursor = 'grabbing';
    }
    return;
  }
  if (!current.canvas || (current === floorView && floorView.empty)) return;
  const w = pointerWorld(ev);
  const item = current.pick(w.x, w.y);
  canvas.style.cursor = item ? 'pointer' : 'grab';
  state.hoverId = item?.id ?? null;
});
canvas.addEventListener('pointerup', (ev) => {
  const wasClick = drag && !drag.moved;
  drag = null;
  canvas.style.cursor = 'grab';
  if (!wasClick || !current.canvas || (current === floorView && floorView.empty)) return;
  const w = pointerWorld(ev);
  const item = current.pick(w.x, w.y);
  if (current === floorView) {
    if (item) enterRoom(item.id);
  } else if (item) {
    selectStation(item.id);
  } else {
    state.selectedStation = null;
    renderPanel();
  }
});
canvas.addEventListener('pointerleave', () => {
  state.hoverId = null;
});
canvas.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  if (!current.canvas) return;
  const r = canvas.getBoundingClientRect();
  state.cam = clampCamera(zoomAt(state.cam, Math.exp(-ev.deltaY * 0.0015), ev.clientX - r.left, ev.clientY - r.top, state.view.w, state.view.h), current.world.w, current.world.h);
  state.camTarget = null;
  state.fit = false;
}, { passive: false });
canvas.addEventListener('dblclick', refit);

function zoomButton(factor) {
  if (!current.canvas) return;
  state.cam = clampCamera(zoomAt(state.cam, factor, state.view.w / 2, state.view.h / 2, state.view.w, state.view.h), current.world.w, current.world.h);
  state.camTarget = null;
  state.fit = false;
}
$('zoom-in').addEventListener('click', () => zoomButton(1.4));
$('zoom-out').addEventListener('click', () => zoomButton(1 / 1.4));
$('zoom-fit').addEventListener('click', refit);
$('back').addEventListener('click', leaveRoom);
window.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape') return;
  if (current === roomView && state.selectedStation) {
    state.selectedStation = null;
    refit();
    renderPanel();
  } else if (current === roomView) {
    leaveRoom();
  }
});
new ResizeObserver(() => {
  if (state.data) resize();
}).observe($('view'));

// ---------- floors, data, list for keyboard and screen-reader users ----------

function renderTabs() {
  const nav = $('floors');
  nav.replaceChildren();
  for (const f of state.data.floors) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = f.name;
    const small = document.createElement('small');
    small.textContent = f.rooms.length;
    b.append(small);
    b.setAttribute('aria-pressed', String(f.id === state.floorId));
    b.addEventListener('click', () => setFloor(f.id));
    nav.append(b);
  }
}

function renderList() {
  const ul = $('desk-list');
  ul.replaceChildren();
  const add = (text, onClick) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.addEventListener('click', onClick);
    li.append(b);
    ul.append(li);
  };
  if (current === roomView) {
    for (const s of roomView.room.stations) add(`${s.name}, ${roomView.statuses.get(s.id)?.label ?? ''}`, () => selectStation(s.id));
    return;
  }
  for (const r of floorOf(state.floorId).rooms) {
    const live = host.roomLive(r);
    add(`${r.name}, ${live ? liveText(live) : timeAgo(daysSince(r.lastCommit?.date))}`, () => enterRoom(r.id));
  }
}

function setFloor(id) {
  state.floorId = id;
  try {
    localStorage.setItem('desk.floor', id);
  } catch {
    // storage unavailable: the tab just won't be remembered
  }
  renderTabs();
  showFloor();
}

async function load(url = '/api/projects', init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  state.data = await res.json();
  let saved = null;
  try {
    saved = localStorage.getItem('desk.floor');
  } catch {
    // ignore
  }
  const wanted = [state.floorId, saved, state.data.floors[0]?.id].find((id) => id && floorOf(id));
  $('stamp').textContent = `Tarama: ${new Date(state.data.generatedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
  const keepRoom = state.roomId;
  state.floorId = wanted;
  renderTabs();
  showFloor();
  if (keepRoom && allRooms().some((r) => r.id === keepRoom)) enterRoom(keepRoom);
}

// ---------- live sessions and activity ----------

// Signature ignores the age counter so the panel only refreshes on real changes.
const liveSignature = (live) =>
  JSON.stringify(Object.entries(live).map(([id, v]) => [id, v.state, v.reason, v.tool, v.file, v.stationId]).sort());

async function pollSessions() {
  if (document.hidden || !state.data) return;
  try {
    const res = await fetch('/api/sessions');
    if (!res.ok) return;
    state.live = (await res.json()).live ?? {};
  } catch {
    return; // server restarting: keep the last known state
  }
  const sig = liveSignature(state.live);
  if (sig === state.liveSig) return;
  state.liveSig = sig;
  renderList();
  if (current === roomView) renderPanel();
}

let lastActivity = 0;
async function pollActivity() {
  if (document.hidden || !state.data) return;
  lastActivity = Date.now();
  try {
    const res = await fetch('/api/activity');
    if (!res.ok) return;
    state.activity = await res.json();
  } catch {
    return;
  }
  if (current === roomView) {
    roomView.update(0);
    renderPanel();
  }
}
setInterval(pollSessions, SESSIONS_MS);
setInterval(() => {
  if (Date.now() - lastActivity >= ACTIVITY_MS[current === roomView ? 'room' : 'floor'] - 200) pollActivity();
}, 1000);

$('rescan').addEventListener('click', async () => {
  const b = $('rescan');
  b.disabled = true;
  b.textContent = 'Taranıyor…';
  try {
    await load('/api/rescan', { method: 'POST' });
  } catch (err) {
    $('stamp').textContent = `Tarama başarısız: ${err.message}`;
  } finally {
    b.disabled = false;
    b.textContent = 'Yeniden tara';
  }
});

load()
  .then(() => {
    tasks.start();
    pollSessions();
    pollActivity();
    return document.fonts?.ready?.then(draw);
  })
  .catch((err) => {
    $('empty').hidden = false;
    $('empty').textContent = `Veri okunamadı: ${err.message}`;
  });
