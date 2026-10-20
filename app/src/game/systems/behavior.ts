import type { Point } from '../constants';
import type { RoomLayout, SpotKind } from '../layout/roomLayout';
import { findPath } from './pathfinding';

// What a worker does in a room. Movement is never random: it walks to the station that is in use, and only
// when it has nothing to do it takes a short break (coffee, water, window, sofa) or looks at another desk.
// Time and randomness are injected, so it is deterministic in tests.

export type Dir = 'up' | 'down' | 'left' | 'right';
export type WorkerMode = 'seated' | 'walking' | 'doing' | 'sleeping';
export type Doing = SpotKind | 'visit';

export interface Worker {
  id: string;
  home: string;
  pos: Point;
  mode: WorkerMode;
  stationId: string | null;
  spotId: string | null;
  path: Point[];
  target: { kind: 'station' | Doing; id: string } | null;
  timer: number;
  dir: Dir;
  doing: Doing | null;
}

export interface Env {
  layout: RoomLayout;
  /** idle choices and their weights; crowded rooms use CALM so characters do not wander about */
  weights?: [string, number][];
  /** station id that needs this worker right now */
  demand: string | null;
  sleeping: boolean;
  rng: () => number;
}

export const SPEED = 3.4; // tiles per second

const IDLE_CHOICES: [string, number][] = [['stay', 25], ['coffee', 25], ['cooler', 15], ['window', 10], ['sofa', 10], ['visit', 15]];
export const CALM_CHOICES: [string, number][] = [['stay', 30], ['coffee', 17], ['cooler', 10], ['window', 10], ['sofa', 10], ['visit', 23]];

export function pickIdle(rng: () => number, hasOthers: boolean, weights: [string, number][] = IDLE_CHOICES): string {
  const choices = hasOthers ? weights : weights.filter(([c]) => c !== 'visit');
  let roll = rng() * choices.reduce((n, [, w]) => n + w, 0);
  for (const [name, w] of choices) {
    roll -= w;
    if (roll < 0) return name;
  }
  return 'stay';
}

const between = (rng: () => number, lo: number, hi: number) => lo + rng() * (hi - lo);

export function createWorker(id: string, layout: RoomLayout, homeId: string | null): Worker {
  const home = layout.stations.find((s) => s.station.id === homeId) ?? layout.stations[0]!;
  return { id, home: home.station.id, pos: { ...home.seat }, mode: 'seated', stationId: home.station.id, spotId: null, path: [], target: null, timer: 1 + [...id].reduce((h, c) => h + c.charCodeAt(0), 0) % 14, dir: 'down', doing: null };
}

const rounded = (p: Point): Point => ({ x: Math.round(p.x), y: Math.round(p.y) });

function walkTo(w: Worker, layout: RoomLayout, goal: Point, target: NonNullable<Worker['target']>): boolean {
  const path = findPath(layout.grid, rounded(w.pos), goal);
  if (!path) return false;
  w.path = path;
  w.target = target;
  w.mode = 'walking';
  w.stationId = null;
  w.spotId = null;
  return true;
}

function walkToStation(w: Worker, layout: RoomLayout, id: string): boolean {
  const s = layout.stations.find((x) => x.station.id === id);
  if (!s) return false;
  // the aisle tile above the desk first, then the seat itself
  const aisle = findPath(layout.grid, rounded(w.pos), s.access);
  if (!aisle) return false;
  w.path = [...aisle, { ...s.seat }];
  w.target = { kind: 'station', id };
  w.mode = 'walking';
  w.stationId = null;
  w.spotId = null;
  return true;
}

function arrive(w: Worker, layout: RoomLayout, rng: () => number) {
  const t = w.target!;
  w.target = null;
  w.path = [];
  if (t.kind === 'station') {
    w.mode = 'seated';
    w.stationId = t.id;
    w.dir = 'down';
    w.timer = between(rng, 4, 9);
    w.pos = { ...layout.stations.find((s) => s.station.id === t.id)!.seat };
  } else {
    w.mode = 'doing';
    w.spotId = t.id;
    w.doing = t.kind;
    w.timer = t.kind === 'visit' ? between(rng, 3, 6) : between(rng, 6, 20);
  }
}

function advance(w: Worker, dt: number, layout: RoomLayout, rng: () => number) {
  let budget = SPEED * dt;
  while (budget > 0 && w.path.length) {
    const next = w.path[0]!;
    const dx = next.x - w.pos.x;
    const dy = next.y - w.pos.y;
    const dist = Math.hypot(dx, dy);
    w.dir = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
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

function startIdle(w: Worker, env: Env) {
  const { layout, rng } = env;
  const others = layout.stations.filter((s) => s.station.id !== w.stationId);
  const choice = pickIdle(rng, others.length > 0, env.weights);
  if (choice === 'stay') {
    w.timer = between(rng, 6, 15);
    return;
  }
  if (choice === 'visit') {
    const s = others[Math.floor(rng() * others.length)]!;
    walkTo(w, layout, s.access, { kind: 'visit', id: s.station.id });
    return;
  }
  const spot = layout.spots.find((p) => p.kind === choice);
  if (spot && !walkTo(w, layout, { x: spot.x, y: spot.y }, { kind: choice as SpotKind, id: spot.id })) w.timer = 5;
}

export function stepWorker(w: Worker, dt: number, env: Env): Worker {
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
    if (w.timer <= 0) startIdle(w, env);
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
