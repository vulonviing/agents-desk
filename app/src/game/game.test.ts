import { describe, expect, it } from 'vitest';
import type { Floor, Room, Station } from '../types';
import { DESK, NORTH } from './constants';
import { CONNECTOR_W, layoutFloor, officeSize, ROOM_H, SPINE_H } from './layout/floorLayout';
import { DESK_H, DESK_W, gridFor, layoutRoom, PITCH } from './layout/roomLayout';
import { findPath } from './systems/pathfinding';
import { CALM_CHOICES, createWorker, pickIdle, stepWorker, type Env, type Worker } from './systems/behavior';

const station = (id: string): Station => ({ id, skill: null, name: id, description: '', kind: 'task', risk: 'readonly', runsOn: 'local', scripts: [], paths: [], repo: null, source: 'manifest' });
const room = (id: string, n = 3): Room => ({ id, name: id, stations: Array.from({ length: n }, (_, i) => station(`${id}-s${i}`)) } as unknown as Room);
const floor = (n: number): Floor => ({ id: 'f', name: 'F', rooms: Array.from({ length: n }, (_, i) => room(`r${i}`)) });
const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]!; };

describe('floor layout', () => {
  it('is empty without projects', () => {
    expect(layoutFloor({ id: 'f', name: 'F', rooms: [] }).rooms).toEqual([]);
  });
  it('places every project once and adds service rooms', () => {
    const plan = layoutFloor(floor(9), 0);
    expect(plan.rooms.filter((r) => r.kind === 'project').map((r) => r.id).sort()).toEqual(Array.from({ length: 9 }, (_, i) => `r${i}`).sort());
    expect(plan.rooms.map((r) => r.kind)).toEqual(expect.arrayContaining(['meeting', 'garden', 'kitchen']));
    expect(layoutFloor(floor(4), 1).rooms.some((r) => r.kind === 'server')).toBe(true);
  });
  it('keeps rooms inside the building and never overlapping; every row has no gaps and no stretched office', () => {
    for (const n of [1, 3, 6, 9, 11, 12]) {
      const plan = layoutFloor(floor(n), n % 3);
      plan.rooms.forEach((a, i) => {
        expect(a.x >= 0 && a.x + a.w <= plan.tilesW && a.y >= 0 && a.y + a.h <= plan.tilesH).toBe(true);
        for (const c of plan.corridors!) expect(overlap(a, c)).toBe(false);
        if (plan.connector) expect(overlap(a, plan.connector)).toBe(false);
        plan.rooms.slice(i + 1).forEach((b) => expect(overlap(a, b)).toBe(false));
      });
      // content decides size: a project office is exactly the size its desks need, never stretched to fill a row
      for (const r of plan.rooms.filter((q) => q.room)) {
        const size = officeSize(r.room!);
        expect(r.w).toBe(size.w);
        expect(r.h).toBe(size.h);
      }
    }
  });
  it('no padded offices: desks fill at least 30% of every project office interior (no big empty rooms)', () => {
    for (const stations of [1, 2, 3, 4, 6, 18]) {
      const r = room('x', stations);
      const { w, h } = officeSize(r);
      const count = Math.min(6, Math.max(1, stations));
      const interior = (w - 2) * (h - 3);
      expect(count * DESK * DESK / interior).toBeGreaterThanOrEqual(0.3);
    }
  });
  it('small floors have ONE corridor between two rows; large floors have TWO corridors and a central connector', () => {
    const small = layoutFloor(floor(4), 0);
    expect(small.corridors).toHaveLength(1);
    expect(small.connector).toBeUndefined();
    for (const n of [9, 12]) {
      const plan = layoutFloor(floor(n), 1);
      expect(plan.corridors).toHaveLength(2);
      const k = plan.connector!;
      expect(k.w).toBe(CONNECTOR_W);
      // the connector links the two corridors and sits near the middle of the building
      expect(k.y).toBe(plan.corridors![0]!.y + SPINE_H);
      expect(k.y + k.h).toBe(plan.corridors![1]!.y);
      expect(Math.abs(k.x + k.w / 2 - plan.tilesW / 2)).toBeLessThan(plan.tilesW * 0.2);
      for (const c of plan.corridors!) expect(c.h).toBe(SPINE_H);
      // rows are roughly square: not a long strip
      expect(plan.tilesW / plan.tilesH).toBeLessThan(2.6);
      expect(plan.tilesW / plan.tilesH).toBeGreaterThan(0.6);
    }
  });
  it('every door faces a corridor: the opening is in the wall touching it', () => {
    for (const n of [4, 9, 12]) {
      const plan = layoutFloor(floor(n), 2);
      for (const r of plan.rooms) {
        const probe = r.door.side === 'south' ? { x: r.door.x, y: r.door.y + 1 } : { x: r.door.x, y: r.door.y - 1 };
        expect(plan.corridors!.some((c) => probe.x >= c.x && probe.x < c.x + c.w && probe.y >= c.y && probe.y < c.y + c.h)).toBe(true);
      }
    }
  });
  it('puts the preview desk inside its room, below the wall, and doors toward the corridor', () => {
    for (const r of layoutFloor(floor(6)).rooms) {
      expect(r.door.side).toBe(r.band === 'north' ? 'south' : 'north');
      if (r.cell) {
        expect(r.cell.tx >= r.x && r.cell.tx + DESK <= r.x + r.w).toBe(true);
        expect(r.cell.ty >= r.y + NORTH && r.cell.ty + DESK <= r.y + ROOM_H - 1).toBe(true);
      }
    }
  });
});

describe('room layout', () => {
  it('is roughly square, at most six columns', () => {
    expect([1, 2, 4, 10, 17, 23].map((n) => Object.values(gridFor(n)).join('x'))).toEqual(['1x1', '2x1', '3x2', '4x3', '5x4', '6x4']);
  });
  it('gives every station a free cell with a reachable aisle tile', () => {
    for (const n of [1, 3, 10, 23]) {
      const l = layoutRoom(room('r', n));
      const seen = new Set<string>();
      for (const s of l.stations) {
        for (let j = 0; j < DESK_H; j++) for (let i = 0; i < DESK_W; i++) {
          const k = `${s.tx + i},${s.ty + j}`;
          expect(seen.has(k)).toBe(false);
          seen.add(k);
          expect(l.grid[s.ty + j]![s.tx + i]).toBe(false);
        }
        expect(l.grid[s.access.y]![s.access.x]).toBe(true);
      }
      expect(PITCH).toBe(4);
    }
  });
  it('reaches the social spots from every station', () => {
    const l = layoutRoom(room('r', 23));
    for (const spot of l.spots) {
      expect(l.grid[spot.y]![spot.x]).toBe(true);
      for (const s of l.stations) expect(findPath(l.grid, s.access, spot), `${s.station.id} → ${spot.id}`).not.toBeNull();
    }
  });
});

describe('pathfinding', () => {
  it('finds the shortest route around walls and null when sealed off', () => {
    const grid = [[true, true, true], [true, false, true], [true, true, true]];
    expect(findPath(grid, { x: 0, y: 1 }, { x: 2, y: 1 })).toHaveLength(4);
    expect(findPath(grid, { x: 0, y: 0 }, { x: 0, y: 0 })).toEqual([]);
    expect(findPath([[true, false, true]], { x: 0, y: 0 }, { x: 2, y: 0 })).toBeNull();
    expect(findPath([[true, false]], { x: 0, y: 0 }, { x: 1, y: 0 })).not.toBeNull();
  });
});

describe('worker behavior', () => {
  const run = (w: Worker, env: Env, seconds: number, dt = 0.1) => { for (let t = 0; t < seconds; t += dt) stepWorker(w, dt, env); };
  const mk = (n = 6) => { const layout = layoutRoom(room('r', n)); return { layout, w: createWorker('w', layout, 'r-s0') }; };

  it('picks idle activities by weight', () => {
    expect(pickIdle(seq(0), true)).toBe('stay');
    expect(pickIdle(seq(0.3), true)).toBe('coffee');
    expect(pickIdle(seq(0.99), true)).toBe('visit');
    expect(pickIdle(seq(0.99), false)).not.toBe('visit');
    expect(pickIdle(seq(0.5), true, CALM_CHOICES)).toBe('cooler');
  });
  it('walks to the station in use and sits down', () => {
    const { layout, w } = mk();
    const env: Env = { layout, demand: 'r-s4', sleeping: false, rng: seq(0.5) };
    run(w, env, 0.2);
    expect(w.mode).toBe('walking');
    run(w, env, 12);
    expect([w.mode, w.stationId]).toEqual(['seated', 'r-s4']);
    expect(w.pos).toEqual(layout.stations[4]!.seat);
  });
  it('takes a coffee break when idle and returns to its own desk', () => {
    const { layout, w } = mk();
    const env: Env = { layout, demand: null, sleeping: false, rng: seq(0.3, 0.5) };
    w.timer = 4;
    run(w, env, 5);
    expect(w.target?.kind).toBe('coffee');
    run(w, env, 12);
    expect([w.mode, w.doing]).toEqual(['doing', 'coffee']);
    env.rng = seq(0);
    run(w, env, 60);
    expect(w.stationId).toBe('r-s0');
  });
  it('is interrupted by new work, and keeps a sleeping room asleep until work arrives', () => {
    const { layout, w } = mk(4);
    const env: Env = { layout, demand: null, sleeping: true, rng: seq(0.3) };
    run(w, env, 20);
    expect(w.mode).toBe('sleeping');
    env.sleeping = false;
    env.demand = 'r-s2';
    run(w, env, 15);
    expect([w.mode, w.stationId]).toEqual(['seated', 'r-s2']);
  });
  it('never leaves the walkable grid', () => {
    const { layout, w } = mk(10);
    const env: Env = { layout, demand: 'r-s9', sleeping: false, rng: seq(0.5) };
    for (let t = 0; t < 15; t += 0.05) {
      stepWorker(w, 0.05, env);
      const x = Math.round(w.pos.x);
      const y = Math.round(w.pos.y);
      const seat = layout.stations.some((s) => s.seat.x === x && s.seat.y === y);
      expect(layout.grid[y]![x] || seat).toBe(true);
    }
  });
});


describe('department interiors', () => {
  it('groups CV work by purpose and connects every department through its doors', () => {
    const ids = ['linkedin-collector', 'skill:batch-ingest', 'skill:job-filter-local', 'skill:cv-tailoring-deep', 'skill:cv-cl-core-rules', 'skill:cover-letter-style', 'skill:cover-letter-math', 'skill:build-and-bundle', 'skill:application-final-layout-check', 'base-kutuphane'];
    const r = { id: 'emrecan-cv', stations: ids.map(station) };
    const l = layoutRoom(r);
    expect(l.departments.filter(d => !d.coordinator)).toHaveLength(5);
    expect(l.departments.filter(d => d.coordinator)).toHaveLength(1);
    expect(layoutRoom(room('small', 3)).openPlan).toBe(true);
    expect(layoutRoom(room('small', 3)).partitions.flat().some(Boolean)).toBe(false);
    expect(l.departments.find(z => z.id === 'letters')!.stations.map(s => s.id)).toEqual(['skill:cover-letter-style', 'skill:cover-letter-math']);
    expect(l.partitions.flat().some(Boolean)).toBe(true);
    for (const s of l.stations) for (const target of l.stations) expect(findPath(l.grid, s.access, target.access)).not.toBeNull();
    for (const s of l.stations) for (const spot of l.spots) expect(findPath(l.grid, s.access, spot), `${s.station.id} → ${spot.id}`).not.toBeNull();
    expect(l.tilesW / l.tilesH).toBeGreaterThan(1.2);
    expect(layoutRoom({ id: 'mahur', stations: [station('uygulama')] }).theme).toBe('music');
    expect(layoutRoom({ id: 'paperhub', stations: [station('general')] }).theme).toBe('research');
  });
  it('keeps idle workers moving even when the server considers the project inactive', () => {
    const layout = layoutRoom(room('r', 8));
    const workers = Array.from({ length: 8 }, (_, i) => createWorker(`resident-${i}`, layout, `r-s${i}`));
    const visited = new Set<string>();
    for (let t = 0; t < 75; t += 0.1) for (const w of workers) {
      stepWorker(w, 0.1, { layout, demand: null, sleeping: false, weights: CALM_CHOICES, rng: () => 0.4 });
      if (w.mode === 'walking' || w.mode === 'doing') visited.add(w.id);
    }
    expect(visited.size).toBe(8);
    expect(new Set(workers.map(w => w.timer)).size).toBeGreaterThan(1);
  });
});

it('communication styles are varied and stable without inventing assignments', async () => {
  const { deliveryMode } = await import('./systems/dispatch');
  const styles = new Set(Array.from({length:30},(_,i)=>deliveryMode(`observed-assignment-${i}`)));
  expect([...styles].sort()).toEqual(['message','phone','visit']);
  expect(deliveryMode('same-assignment')).toBe(deliveryMode('same-assignment'));
});

describe('office density', () => {
  it('big rooms have one coordinator desk and zones sized by their content', () => {
    const l = layoutRoom(room('r', 17));
    expect(l.coordinatorDesks).toHaveLength(1);
    for (const z of l.departments.filter((d) => !d.coordinator)) {
      const mine = l.stations.filter((st) => st.tx >= z.x && st.tx < z.x + z.w && st.ty >= z.y && st.ty < z.y + z.h);
      expect(mine.length).toBeGreaterThan(0);
      const rows = new Set(mine.map((st) => st.ty)).size;
      expect(z.h).toBeLessThanOrEqual(rows * PITCH + 4 + 8);
    }
  });
});

