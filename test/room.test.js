import test from 'node:test';
import assert from 'node:assert/strict';
import { DESK, NORTH } from '../office/js/layout.js';
import { PITCH, gridFor, layoutRoom } from '../office/js/roomLayout.js';
import { createWorker, findPath, pickIdle, stepWorker } from '../office/js/walk.js';

const room = (n) => ({ id: 'r', stations: Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `S${i}` })) });

// Seeded rng so the behavior tests are deterministic.
const seq = (...values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

test('gridFor: roughly square, never more than six columns, never wider than the station count', () => {
  assert.deepEqual([1, 2, 4, 10, 17, 23, 24].map((n) => Object.values(gridFor(n)).join('x')), ['1x1', '2x1', '3x2', '4x3', '5x4', '6x4', '6x4']);
});

test('layoutRoom: every station gets its own free desk cell inside the room', () => {
  for (const n of [1, 3, 10, 23]) {
    const l = layoutRoom(room(n));
    assert.equal(l.stations.length, n);
    const cells = new Set();
    for (const s of l.stations) {
      assert.ok(s.tx >= 2 && s.tx + DESK <= l.xs - 1 && s.ty >= NORTH + 1 && s.ty + DESK <= l.tilesH - 1, `${n}: cell inside`);
      for (let j = 0; j < DESK; j++) for (let i = 0; i < DESK; i++) {
        const k = `${s.tx + i},${s.ty + j}`;
        assert.ok(!cells.has(k), 'cells do not overlap');
        cells.add(k);
        assert.equal(l.grid[s.ty + j][s.tx + i], false, 'desk tiles are blocked');
      }
      assert.equal(l.grid[s.access.y][s.access.x], true, 'access tile above the desk is walkable');
    }
    assert.equal(PITCH, 5);
  }
});

test('layoutRoom: social spots are reachable from every station', () => {
  const l = layoutRoom(room(23));
  for (const spot of l.spots) {
    assert.equal(l.grid[spot.y][spot.x], true, `${spot.id} stand tile is walkable`);
    for (const s of l.stations) assert.ok(findPath(l.grid, s.access, spot), `${spot.id} reachable from ${s.station.id}`);
  }
});

test('findPath: shortest 4-connected route around blocked tiles, null when walled off', () => {
  const grid = [[true, true, true], [true, false, true], [true, true, true]];
  assert.equal(findPath(grid, { x: 0, y: 1 }, { x: 2, y: 1 }).length, 4);
  assert.deepEqual(findPath(grid, { x: 0, y: 0 }, { x: 0, y: 0 }), []);
  const walled = [[true, false, true]];
  assert.equal(findPath(walled, { x: 0, y: 0 }, { x: 2, y: 0 }), null);
  assert.ok(findPath([[true, false]], { x: 0, y: 0 }, { x: 1, y: 0 }), 'a blocked goal (a seat) is allowed');
});

test('pickIdle: weighted choices, no visit when there is nobody to visit', () => {
  assert.equal(pickIdle(seq(0), true), 'stay');
  assert.equal(pickIdle(seq(0.3), true), 'coffee');
  assert.equal(pickIdle(seq(0.99), true), 'visit');
  assert.notEqual(pickIdle(seq(0.99), false), 'visit');
});

function run(w, env, seconds, dt = 0.1) {
  for (let t = 0; t < seconds; t += dt) stepWorker(w, dt, env);
}

test('worker: demand sends it to the station and it sits down there', () => {
  const layout = layoutRoom(room(6));
  const w = createWorker('w0', layout, 's0');
  const env = { layout, demand: 's4', sleeping: false, rng: seq(0.5) };
  run(w, env, 0.2);
  assert.equal(w.mode, 'walking');
  run(w, env, 12);
  assert.equal(w.mode, 'seated');
  assert.equal(w.stationId, 's4');
  assert.deepEqual(w.pos, layout.stations[4].seat);
});

test('worker: when idle it takes a coffee break and then walks back to its own desk', () => {
  const layout = layoutRoom(room(6));
  const w = createWorker('w0', layout, 's0');
  const env = { layout, demand: null, sleeping: false, rng: seq(0.3, 0.5) }; // 0.3 → coffee
  run(w, env, 5);
  assert.equal(w.mode, 'walking');
  assert.equal(w.target.kind, 'coffee');
  run(w, env, 12);
  assert.equal(w.mode, 'doing');
  assert.equal(w.doing, 'coffee');
  const coffee = layout.spots.find((s) => s.kind === 'coffee');
  assert.deepEqual([w.pos.x, w.pos.y], [coffee.x, coffee.y]);
  run(w, env, 30);
  assert.ok(['seated', 'walking', 'doing'].includes(w.mode));
  env.rng = seq(0); // from now on it only stays put
  run(w, env, 40);
  assert.equal(w.stationId, 's0');
});

test('worker: new demand while on a coffee break interrupts it', () => {
  const layout = layoutRoom(room(6));
  const w = createWorker('w0', layout, 's0');
  const env = { layout, demand: null, sleeping: false, rng: seq(0.3, 0.5) };
  run(w, env, 12);
  assert.ok(w.mode === 'walking' || w.mode === 'doing');
  env.demand = 's3';
  run(w, env, 15);
  assert.equal(w.stationId, 's3');
});

test('worker: a sleeping room keeps its worker asleep at the home desk, and wakes it when work arrives', () => {
  const layout = layoutRoom(room(4));
  const w = createWorker('w0', layout, 's1');
  const env = { layout, demand: null, sleeping: true, rng: seq(0.3) };
  run(w, env, 20);
  assert.equal(w.mode, 'sleeping');
  assert.equal(w.stationId, 's1');
  env.sleeping = false;
  env.demand = 's2';
  run(w, env, 15);
  assert.equal(w.mode, 'seated');
  assert.equal(w.stationId, 's2');
});

test('worker: walking never leaves the walkable grid', () => {
  const layout = layoutRoom(room(10));
  const w = createWorker('w0', layout, 's0');
  const env = { layout, demand: 's9', sleeping: false, rng: seq(0.5) };
  for (let t = 0; t < 15; t += 0.05) {
    stepWorker(w, 0.05, env);
    const x = Math.round(w.pos.x);
    const y = Math.round(w.pos.y);
    const seat = layout.stations.some((s) => s.seat.x === x && s.seat.y === y);
    assert.ok(layout.grid[y][x] || seat, `tile ${x},${y} is walkable or a seat`);
  }
});
