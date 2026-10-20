// Pure worker behavior: path finding on the room's tile grid and a small state machine.
// Time and randomness are injected so everything is deterministic in tests.

const key = (x, y) => y * 4096 + x;
const SPEED = 3.4; // tiles per second

const open = (grid, x, y) => grid[y]?.[x] === true;

// A* on a 4-connected grid. Start and goal may be blocked (a seat sits inside a blocked desk cell).
export function findPath(grid, from, to) {
  if (from.x === to.x && from.y === to.y) return [];
  const h = (x, y) => Math.abs(x - to.x) + Math.abs(y - to.y);
  const best = new Map([[key(from.x, from.y), 0]]);
  const prev = new Map();
  const queue = [{ x: from.x, y: from.y, f: h(from.x, from.y) }];
  while (queue.length) {
    queue.sort((a, b) => a.f - b.f);
    const cur = queue.shift();
    if (cur.x === to.x && cur.y === to.y) {
      const path = [];
      for (let k = key(cur.x, cur.y); k !== key(from.x, from.y); k = prev.get(k)) path.unshift({ x: k % 4096, y: Math.floor(k / 4096) });
      return path;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = cur.x + dx;
      const y = cur.y + dy;
      const isGoal = x === to.x && y === to.y;
      if (!isGoal && !open(grid, x, y)) continue;
      const g = best.get(key(cur.x, cur.y)) + 1;
      if (g >= (best.get(key(x, y)) ?? Infinity)) continue;
      best.set(key(x, y), g);
      prev.set(key(x, y), key(cur.x, cur.y));
      queue.push({ x, y, f: g + h(x, y) });
    }
  }
  return null;
}

// Idle choices, weighted: stay at the desk, coffee, water, window, sofa, look at another desk.
const IDLE_CHOICES = [['stay', 25], ['coffee', 25], ['cooler', 15], ['window', 10], ['sofa', 10], ['visit', 15]];

export function pickIdle(rng, hasOthers) {
  const choices = hasOthers ? IDLE_CHOICES : IDLE_CHOICES.filter(([c]) => c !== 'visit');
  let roll = rng() * choices.reduce((n, [, w]) => n + w, 0);
  for (const [name, w] of choices) {
    roll -= w;
    if (roll < 0) return name;
  }
  return 'stay';
}

const between = (rng, lo, hi) => lo + rng() * (hi - lo);

export function createWorker(id, layout, homeId) {
  const home = layout.stations.find((s) => s.station.id === homeId) ?? layout.stations[0];
  return { id, home: home.station.id, pos: { ...home.seat }, mode: 'seated', stationId: home.station.id, spotId: null, path: [], target: null, timer: 4, dir: 'down', doing: null };
}

function walkTo(w, layout, goal, target) {
  const path = findPath(layout.grid, { x: Math.round(w.pos.x), y: Math.round(w.pos.y) }, goal);
  if (!path) return false;
  w.path = path;
  w.target = target;
  w.mode = 'walking';
  w.stationId = null;
  w.spotId = null;
  return true;
}

const stationOf = (layout, id) => layout.stations.find((s) => s.station.id === id);

function walkToStation(w, layout, id) {
  const s = stationOf(layout, id);
  if (!s) return false;
  // Aisle tile above the desk first, then the seat itself.
  const aisle = findPath(layout.grid, { x: Math.round(w.pos.x), y: Math.round(w.pos.y) }, s.access);
  if (!aisle) return false;
  w.path = [...aisle, { ...s.seat }];
  w.target = { kind: 'station', id };
  w.mode = 'walking';
  w.stationId = null;
  w.spotId = null;
  return true;
}

function arrive(w, layout, rng) {
  const t = w.target;
  w.target = null;
  w.path = [];
  if (t.kind === 'station') {
    w.mode = 'seated';
    w.stationId = t.id;
    w.dir = 'down';
    w.timer = between(rng, 4, 9);
    const s = stationOf(layout, t.id);
    w.pos = { ...s.seat };
  } else {
    w.mode = 'doing';
    w.spotId = t.id;
    w.doing = t.kind;
    w.timer = t.kind === 'visit' ? between(rng, 3, 6) : between(rng, 6, 20);
  }
}

// env: { layout, demand: station id or null, sleeping: bool, rng }
export function stepWorker(w, dt, env) {
  const { layout, demand, sleeping, rng } = env;

  if (sleeping && !demand) {
    if (w.mode === 'seated' && w.stationId === w.home) {
      w.mode = 'sleeping';
      return w;
    }
    if (w.mode === 'sleeping') return w;
    if (w.target?.kind !== 'station' || w.target.id !== w.home) walkToStation(w, layout, w.home);
  } else if (w.mode === 'sleeping') {
    w.mode = 'seated';
    w.timer = 2;
  }

  if (demand && !(w.mode === 'seated' && w.stationId === demand) && !(w.target?.kind === 'station' && w.target.id === demand)) {
    walkToStation(w, layout, demand);
  }

  if (w.mode === 'seated' && !demand) {
    w.timer -= dt;
    if (w.timer <= 0) startIdle(w, layout, env);
  } else if (w.mode === 'doing') {
    w.timer -= dt;
    if (w.timer <= 0) {
      w.doing = null;
      if (!walkToStation(w, layout, demand ?? w.home)) w.mode = 'seated';
    }
  } else if (w.mode === 'walking') {
    advance(w, dt, layout, rng);
  }
  return w;
}

function startIdle(w, layout, env) {
  const others = layout.stations.filter((s) => s.station.id !== w.stationId);
  const choice = pickIdle(env.rng, others.length > 0);
  if (choice === 'stay') {
    w.timer = between(env.rng, 6, 15);
    return;
  }
  if (choice === 'visit') {
    const s = others[Math.floor(env.rng() * others.length)];
    walkTo(w, layout, s.access, { kind: 'visit', id: s.station.id });
    return;
  }
  const spot = layout.spots.find((p) => p.kind === choice);
  if (spot && !walkTo(w, layout, { x: spot.x, y: spot.y }, { kind: choice, id: spot.id })) w.timer = 5;
}

function advance(w, dt, layout, rng) {
  let budget = SPEED * dt;
  while (budget > 0 && w.path.length) {
    const next = w.path[0];
    const dx = next.x - w.pos.x;
    const dy = next.y - w.pos.y;
    const dist = Math.hypot(dx, dy);
    if (Math.abs(dx) >= Math.abs(dy)) w.dir = dx < 0 ? 'left' : 'right';
    else w.dir = dy < 0 ? 'up' : 'down';
    if (dist <= budget) {
      w.pos = { x: next.x, y: next.y };
      w.path.shift();
      budget -= dist;
    } else {
      w.pos = { x: w.pos.x + (dx / dist) * budget, y: w.pos.y + (dy / dist) * budget };
      budget = 0;
    }
  }
  if (!w.path.length) arrive(w, layout, rng);
}
