import { daysSince, timeAgo } from './format.js';
import { renderPanel } from './panel.js';

// Logical (pre-scale) layout units; the canvas is scaled by an integer so pixels stay crisp.
const COLS = 4;
const CW = 84;
const CH = 72;
const PAD = 12;
const ROOM_HEAD = 18;
const W = PAD * 2 + COLS * CW;
const FONT = '"Pixelify Sans", monospace';

const LAMP = { active: '#7be0a3', week: '#7c9cff', unpushed: '#ffb454', idle: '#4a4f73' };
const DUST = [0, 0.2, 0.45, 0.7];
const SPECKS = [0, 6, 16, 34];

const $ = (id) => document.getElementById(id);
const canvas = $('floor');
const ctx = canvas.getContext('2d');
const state = { data: null, floorId: null, selectedId: null, hoverId: null, hits: [], k: 1, height: 0 };

// ---------- color + random helpers ----------

function blend(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

function rng(seedText) {
  let s = 2166136261;
  for (const ch of seedText) s = Math.imul(s ^ ch.charCodeAt(0), 16777619);
  return () => {
    s = Math.imul(s ^ (s >>> 15), 2246822507);
    s = Math.imul(s ^ (s >>> 13), 3266489909);
    return ((s ^= s >>> 16) >>> 0) / 4294967296;
  };
}

// ---------- layout ----------

function floorOf(data, id) {
  return data.floors.find((f) => f.id === id);
}

function layout(floor) {
  const rooms = [];
  let y = PAD;
  for (const room of floor.rooms) {
    const rows = Math.ceil(room.desks.length / COLS);
    const h = ROOM_HEAD + rows * CH + 6;
    rooms.push({
      room,
      rect: { x: PAD, y, w: COLS * CW, h },
      cells: room.desks.map((desk, i) => ({ desk, room, x: PAD + (i % COLS) * CW, y: y + ROOM_HEAD + Math.floor(i / COLS) * CH })),
    });
    y += h + PAD;
  }
  const loose = floor.desks.map((desk, i) => ({ desk, room: null, x: PAD + (i % COLS) * CW, y: y + Math.floor(i / COLS) * CH }));
  const height = y + Math.ceil(floor.desks.length / COLS) * CH + PAD;
  return { rooms, loose, height };
}

// ---------- drawing ----------

function truncate(text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

function drawDesk(cell, selected, hovered) {
  const { desk, x, y } = cell;
  const dust = desk.dust;
  const dim = DUST[dust];
  const wood = blend('#b98a5a', '#8d8a82', dim);
  const screen = blend(LAMP[desk.lamp], '#3b3d4a', dim);

  ctx.fillStyle = hovered || selected ? '#262944' : '#1f2133';
  ctx.fillRect(x + 2, y + 2, CW - 4, CH - 4);
  // chair, desk, monitor
  ctx.fillStyle = '#3a3f63';
  ctx.fillRect(x + 34, y + 34, 16, 12);
  ctx.fillStyle = wood;
  ctx.fillRect(x + 10, y + 24, 64, 16);
  ctx.fillStyle = blend(wood, '#000000', 0.35);
  ctx.fillRect(x + 10, y + 38, 64, 2);
  ctx.fillStyle = '#2a2d44';
  ctx.fillRect(x + 39, y + 20, 6, 5);
  ctx.fillRect(x + 30, y + 6, 24, 15);
  ctx.fillStyle = screen;
  ctx.fillRect(x + 32, y + 8, 20, 11);
  // desk lamp
  const lampColor = blend(LAMP[desk.lamp], '#3b3d4a', dim);
  if (desk.lamp === 'active') {
    ctx.fillStyle = 'rgba(123,224,163,0.14)';
    ctx.fillRect(x + 8, y + 10, 14, 14);
  }
  ctx.fillStyle = '#555a7a';
  ctx.fillRect(x + 15, y + 20, 2, 8);
  ctx.fillStyle = lampColor;
  ctx.fillRect(x + 11, y + 16, 9, 4);
  // dust: tint plus deterministic specks
  if (dust > 0) {
    const rand = rng(desk.id);
    ctx.fillStyle = `rgba(200,196,180,${dim * 0.35})`;
    ctx.fillRect(x + 10, y + 24, 64, 16);
    for (let i = 0; i < SPECKS[dust]; i++) {
      const onMonitor = rand() < 0.3;
      const px = onMonitor ? x + 30 + Math.floor(rand() * 24) : x + 10 + Math.floor(rand() * 64);
      const py = onMonitor ? y + 6 + Math.floor(rand() * 15) : y + 24 + Math.floor(rand() * 16);
      ctx.fillStyle = 'rgba(225,220,205,0.6)';
      ctx.fillRect(px, py, rand() < 0.25 ? 2 : 1, 1);
    }
  }
  if (dust >= 2) {
    ctx.fillStyle = '#9a9db8';
    ctx.font = `8px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(dust === 3 ? 'Zzz' : 'Zz', x + 58, y + 12);
  }
  // labels
  ctx.textAlign = 'center';
  ctx.font = `9px ${FONT}`;
  ctx.fillStyle = '#e8e9f3';
  ctx.fillText(truncate(desk.name, CW - 10), x + CW / 2, y + 56);
  ctx.font = `8px ${FONT}`;
  ctx.fillStyle = dust >= 2 ? '#ffb454' : '#9a9db8';
  ctx.fillText(timeAgo(daysSince(desk.lastCommit?.date)), x + CW / 2, y + 66);
  if (selected) {
    ctx.strokeStyle = '#7c5cff';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 2.5, y + 2.5, CW - 5, CH - 5);
  }
}

function draw() {
  const floor = floorOf(state.data, state.floorId);
  if (!floor) return;
  const lay = layout(floor);
  state.height = lay.height;
  state.hits = [];
  const container = $('view').clientWidth - 32;
  state.k = Math.max(1, Math.min(4, Math.floor(container / W)));
  const k = state.k;
  canvas.width = W * k;
  canvas.height = Math.max(lay.height, 120) * k;
  canvas.style.width = `${canvas.width}px`;
  canvas.style.height = `${canvas.height}px`;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#14151f';
  ctx.fillRect(0, 0, W, lay.height);

  for (const { room, rect, cells } of lay.rooms) {
    ctx.fillStyle = '#191b2a';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = state.selectedId === room.id ? '#7c5cff' : '#3b3f66';
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
    ctx.textAlign = 'left';
    ctx.font = `10px ${FONT}`;
    ctx.fillStyle = '#b3a2ff';
    ctx.fillText(`Oda · ${room.name}`, rect.x + 6, rect.y + 12);
    ctx.textAlign = 'right';
    ctx.font = `8px ${FONT}`;
    ctx.fillStyle = '#9a9db8';
    ctx.fillText(`${room.skills.length} skill · ${timeAgo(daysSince(room.lastCommit?.date))}`, rect.x + rect.w - 6, rect.y + 12);
    state.hits.push({ x: rect.x, y: rect.y, w: rect.w, h: ROOM_HEAD, item: { desk: room, room: null } });
    for (const cell of cells) {
      drawDesk(cell, state.selectedId === cell.desk.id, state.hoverId === cell.desk.id);
      state.hits.push({ x: cell.x, y: cell.y, w: CW, h: CH, item: cell });
    }
  }
  for (const cell of lay.loose) {
    drawDesk(cell, state.selectedId === cell.desk.id, state.hoverId === cell.desk.id);
    state.hits.push({ x: cell.x, y: cell.y, w: CW, h: CH, item: cell });
  }
  $('empty').hidden = lay.rooms.length + lay.loose.length > 0;
  $('empty').textContent = 'Bu katta henüz proje yok.';
}

// ---------- interaction ----------

function pick(ev) {
  const r = canvas.getBoundingClientRect();
  const x = ((ev.clientX - r.left) * W) / r.width;
  const y = ((ev.clientY - r.top) * canvas.height) / state.k / r.height;
  return state.hits.find((h) => x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h)?.item ?? null;
}

function select(item) {
  const panel = $('panel');
  if (!item) {
    state.selectedId = null;
    panel.hidden = true;
  } else {
    state.selectedId = item.desk.id;
    panel.hidden = false;
    renderPanel(panel, item, () => select(null));
  }
  draw();
}

function findById(id) {
  const floor = floorOf(state.data, state.floorId);
  for (const room of floor.rooms) {
    if (room.id === id) return { desk: room, room: null };
    const d = room.desks.find((x) => x.id === id);
    if (d) return { desk: d, room };
  }
  const d = floor.desks.find((x) => x.id === id);
  return d ? { desk: d, room: null } : null;
}

canvas.addEventListener('click', (ev) => select(pick(ev)));
canvas.addEventListener('mousemove', (ev) => {
  const item = pick(ev);
  const id = item?.desk.id ?? null;
  canvas.style.cursor = item ? 'pointer' : 'default';
  if (id !== state.hoverId) {
    state.hoverId = id;
    draw();
  }
});
canvas.addEventListener('mouseleave', () => {
  state.hoverId = null;
  draw();
});
window.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') select(null);
});
new ResizeObserver(() => state.data && draw()).observe($('view'));

// ---------- floors, data, list for keyboard/screen-reader users ----------

function countDesks(floor) {
  return floor.desks.length + floor.rooms.reduce((n, r) => n + r.desks.length, 0);
}

function renderTabs() {
  const nav = $('floors');
  nav.replaceChildren();
  for (const f of state.data.floors) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = f.name;
    const small = document.createElement('small');
    small.textContent = countDesks(f);
    b.append(small);
    b.setAttribute('aria-pressed', String(f.id === state.floorId));
    b.addEventListener('click', () => setFloor(f.id));
    nav.append(b);
  }
}

function renderList() {
  const ul = $('desk-list');
  ul.replaceChildren();
  const floor = floorOf(state.data, state.floorId);
  const items = [];
  for (const room of floor.rooms) {
    items.push({ desk: room, room: null });
    for (const d of room.desks) items.push({ desk: d, room });
  }
  for (const d of floor.desks) items.push({ desk: d, room: null });
  for (const item of items) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `${item.desk.name}, ${timeAgo(daysSince(item.desk.lastCommit?.date))}`;
    b.addEventListener('click', () => select(item));
    li.append(b);
    ul.append(li);
  }
}

function setFloor(id) {
  state.floorId = id;
  try {
    localStorage.setItem('desk.floor', id);
  } catch {
    // storage unavailable: the tab just won't be remembered
  }
  select(null);
  renderTabs();
  renderList();
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
  const wanted = [state.floorId, saved, state.data.floors[0]?.id].find((id) => id && floorOf(state.data, id));
  $('stamp').textContent = `Tarama: ${new Date(state.data.generatedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
  const keep = state.selectedId;
  state.floorId = wanted;
  renderTabs();
  renderList();
  const again = keep ? findById(keep) : null;
  select(again);
}

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
  .then(() => document.fonts?.ready?.then(() => draw()))
  .catch((err) => {
    $('empty').hidden = false;
    $('empty').textContent = `Veri okunamadı: ${err.message}`;
  });
