import { describe, expect, it } from 'vitest';
import type { RoomLayout } from '../layout/roomLayout';
import type { Station } from '../../types';
import { createWorker, requestSpot, startNeedsActivity, stepWorker } from './behavior';
import { createAtmosphere, observeAtmosphere, printerState, skyAt } from './atmosphere';
const fixture = () => {
  const layout = { grid: Array.from({ length: 8 }, () => Array(10).fill(true)),
    stations: [0, 1, 2].map(i => ({ station: { id: `s${i}` } as Station, tx: i * 2, ty: 1, seat: { x: i * 2, y: 1 }, access: { x: i * 2, y: 2 } })),
    spots: [{ id: 'coffee', kind: 'coffee', x: 5, y: 4 }, { id: 'window', kind: 'window', x: 8, y: 5 }],
  } as RoomLayout;
  const workers = [0, 1, 2].map(i => createWorker(`w${i}`, layout, `s${i}`));
  const env = { layout, workers, demand: null as string | null, sleeping: false, rng: () => 0 };
  return { workers, env };
};
describe('office life', () => {
  it('chooses by need and distance and never visits an empty desk or a busy resident', () => {
    const { workers, env } = fixture();
    const w = workers[0]!; w.needs = { energy: 100, social: 0, focus: 0 };
    startNeedsActivity(w, env);
    expect(w.target?.kind).toBe('coffee');
    w.mode = 'seated'; w.target = null; w.path = []; w.needs = { energy: 0, social: 100, focus: 0 };
    startNeedsActivity(w, { ...env, busyIds: new Set(['w1', 'w2']) });
    expect(w.target).toBeNull();
  });
  it('reserves one service tile and distinct queue tiles, then interrupts a queue for real work', () => {
    const { workers, env } = fixture();
    for (const w of workers) expect(requestSpot(w, 'coffee', env)).toBe(true);
    expect(workers.map(w => w.target?.kind)).toEqual(['coffee', 'queue', 'queue']);
    expect(new Set(workers.map(w => JSON.stringify(w.path.at(-1)))).size).toBe(3);
    const w = workers[1]!;
    stepWorker(w, 0.1, { ...env, demand: 's1' });
    expect(w.target).toEqual({ kind: 'station', id: 's1' });
    expect(w.doing).toBeNull();
  });
  it('releases a service reservation and lets a waiting character approach it', () => {
    const { workers, env } = fixture();
    const first = workers[0]!, waiting = workers[1]!;
    requestSpot(first, 'coffee', env); requestSpot(waiting, 'coffee', env);
    for (let t = 0; t < 5; t += 0.1) for (const w of [first, waiting]) stepWorker(w, 0.1, env);
    expect(waiting.doing).toBe('queue');
    stepWorker(first, 0.1, { ...env, demand: 's0' });
    stepWorker(waiting, 0.1, env);
    expect(waiting.target?.kind).toBe('coffee');
  });
});
describe('observation-driven atmosphere', () => {
  it('follows the real clock at every day/night boundary', () => {
    expect([5, 6, 7, 16, 17, 19, 20].map(skyAt)).toEqual(['night', 'dusk', 'day', 'day', 'dusk', 'dusk', 'night']);
  });
  it('expires completion/error indicators and limits celebration frequency', () => {
    const s = createAtmosphere();
    expect(printerState(s, 0)).toBe('idle');
    observeAtmosphere(s, 'error', 1000);
    expect(printerState(s, 2000)).toBe('error');
    observeAtmosphere(s, 'completed', 3000);
    expect(printerState(s, 3001)).toBe('done');
    expect(printerState(s, 11_001)).toBe('idle');
    observeAtmosphere(s, 'completed', 4000); observeAtmosphere(s, 'completed', 5000);
    expect(s.celebrationUntil).toBe(7000);
    observeAtmosphere(s, 'completed', 6000);
    expect(s.celebrationUntil).toBe(7000);
  });
});
