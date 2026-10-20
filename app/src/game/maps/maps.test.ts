import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Floor, Room, Station } from '../../types';
import { layoutFloor } from '../layout/floorLayout';
import { layoutRoom } from '../layout/roomLayout';
import { COLLISION_GID, TILESETS } from './catalog';
import { themeOf } from './catalog';
import { buildFloorMap } from './floorMap';
import { buildMasterMap, MASTER_ID, MASTER_SEAT } from './masterMap';
import { buildRoomMap } from './roomMap';
import { DRESSES, dressOf } from './roomDress';
import { propsOf, type TiledMap, type TiledObjectLayer, type TiledTileLayer } from './tiled';

const station = (id: string): Station => ({ id, skill: null, name: id, description: '', kind: 'task', risk: 'readonly', runsOn: 'local', scripts: [], paths: [], repo: null, source: 'manifest' });
const room = (id: string, n = 3): Room => ({ id, name: id, skills: [], stations: Array.from({ length: n }, (_, i) => station(`${id}-s${i}`)) } as unknown as Room);
const floor = (n: number): Floor => ({ id: 'f', name: 'F', rooms: Array.from({ length: n }, (_, i) => room(`r${i}`)) });
const tiles = (m: TiledMap, name: string) => (m.layers.find((l) => l.name === name) as TiledTileLayer).data;
const objects = (m: TiledMap, name: string) => (m.layers.find((l) => l.name === name) as TiledObjectLayer).objects;
const maxGid = Math.max(...TILESETS.map((t) => t.firstgid + t.tilecount - 1));

function checkTiled(m: TiledMap) {
  expect(m.type).toBe('map');
  expect(m.tilewidth).toBe(16);
  for (const l of m.layers) if (l.type === 'tilelayer') {
    expect(l.data).toHaveLength(m.width * m.height);
    expect(l.data.every((g) => g >= 0 && g <= maxGid)).toBe(true);
  }
  const ids = m.layers.flatMap((l) => (l.type === 'objectgroup' ? l.objects.map((o) => o.id) : []));
  expect(new Set(ids).size).toBe(ids.length);
  expect(Math.max(0, ...ids)).toBeLessThan(m.nextobjectid);
  const first = m.tilesets.map((t) => t.firstgid);
  expect(first).toEqual([...first].sort((a, b) => a - b));
}

describe('floor map', () => {
  const plan = layoutFloor(floor(9), 0);
  const { map, worldW, worldH } = buildFloorMap(plan, floor(9));
  it('is a valid Tiled map with the plan dimensions', () => {
    checkTiled(map);
    expect([map.width, map.height, worldW, worldH]).toEqual([plan.tilesW, plan.tilesH, plan.tilesW * 16, plan.tilesH * 16]);
  });
  it('floors every room and the corridor, and walls the boundary', () => {
    const ground = tiles(map, 'ground');
    for (const r of plan.rooms) expect(ground[(r.y + 4) * map.width + r.x + 3]).toBeGreaterThan(0);
    expect(ground[(plan.corridor.y + 2) * map.width + 5]).toBeGreaterThan(0);
    expect(tiles(map, 'walls')[0]).toBeGreaterThan(0);
    expect(tiles(map, 'collision').filter((g) => g === COLLISION_GID).length).toBeGreaterThan(100);
  });
  it('has desk spots for project workers and a zone for every room', () => {
    expect([...new Set(objects(map, 'desks').map(o => String(propsOf(o).roomId).split(':preview:')[0]))].sort()).toEqual(Array.from({ length: 9 }, (_, i) => `r${i}`).sort());
    expect(objects(map, 'zones').filter((o) => !['elevator', 'stairs'].includes(String(propsOf(o).kind)))).toHaveLength(plan.rooms.length);
    expect(objects(map, 'desks').some(o => String(propsOf(o).roomId).startsWith('manager:'))).toBe(false);
    expect(objects(map, 'zones').filter((o) => propsOf(o).kind === 'lounge')).toHaveLength(0);
  });
  it('shell: outside space is blocked, the elevator zone sits inside the corridor, rooms carry their door side', () => {
    const collision = tiles(map, 'collision');
    for (const r of plan.rooms) {
      const t = r.terrace;
      if (!t) continue;
      for (let y = t.y; y < t.y + t.h; y++) for (let x = t.x; x < t.x + t.w; x++) {
        expect(collision[y * map.width + x]).not.toBe(0);
      }
    }
    const lift = objects(map, 'zones').find((o) => propsOf(o).kind === 'elevator');
    expect(lift).toBeDefined();
    expect(lift!.x).toBeGreaterThanOrEqual(plan.corridor.x * 16);
    expect(lift!.x + lift!.width).toBeLessThanOrEqual((plan.corridor.x + plan.corridor.w) * 16);
    for (const o of objects(map, 'zones').filter((z) => !['elevator', 'stairs'].includes(String(propsOf(z).kind)))) expect(['north', 'south']).toContain(propsOf(o).doorSide);
  });
  it('shell: every walkable tile is reachable from the first corridor (no enclosed rooms), corridors are at least 5 tiles wide', () => {
    for (const n of [3, 9, 12, 15]) {
      const p2 = layoutFloor(floor(n), 0);
      const m = buildFloorMap(p2, { id: 'f', name: 'F', rooms: [] } as never).map;
      const col = tiles(m, 'collision');
      const ground = tiles(m, 'ground');
      const W = m.width;
      const walk = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < m.height && col[y * W + x] === 0;
      const sx = p2.corridor.x + Math.floor(p2.corridor.w / 2);
      const sy = p2.corridor.y + Math.floor(p2.corridor.h / 2);
      expect(p2.corridor.h).toBeGreaterThanOrEqual(5);
      const seen = new Set<number>();
      const stack = [sy * W + sx];
      while (stack.length) {
        const k = stack.pop()!;
        if (seen.has(k)) continue;
        seen.add(k);
        const x = k % W, y = Math.floor(k / W);
        for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) if (walk(x + dx, y + dy)) stack.push((y + dy) * W + x + dx);
      }
      const lost: string[] = [];
      for (let y = 0; y < m.height; y++) for (let x = 0; x < W; x++) if (ground[y * W + x] !== 0 && walk(x, y) && !seen.has(y * W + x)) lost.push(`${x},${y}`);
      expect(lost).toEqual([]);
    }
  });
  it('every floor has its own character: distinct materials, runner and accent, rich dressing, and real atlas frames', () => {
    const atlas = JSON.parse(readFileSync(new URL('../../../public/assets/generated/props.json', import.meta.url), 'utf8'));
    const themes = ['products', 'research', 'growth'].map((id) => themeOf(id));
    expect(new Set(themes.map((t) => t.corridor)).size).toBe(3);
    expect(new Set(themes.map((t) => t.runner)).size).toBe(3);
    expect(new Set(themes.map((t) => t.accent)).size).toBe(3);
    for (const t of themes) {
      expect(t.wallArt.length).toBeGreaterThanOrEqual(5);
      expect(t.vignettes.length).toBeGreaterThanOrEqual(3);
      const frames = [t.runner, ...t.plants, ...t.wallArt, ...t.centerpiece.map((p) => p.frame), ...t.vignettes.flatMap((v) => v.pieces.map((p) => p.frame))];
      for (const f of frames) expect(atlas.frames).toHaveProperty(f);
    }
    // the first corridor carries the elevator, and the last one the stairs
    const big = layoutFloor(floor(12), 0);
    const m = buildFloorMap(big, { id: 'products', name: 'F', rooms: [] } as never).map;
    expect(objects(m, 'furniture').map((o) => propsOf(o).frame)).toEqual(expect.arrayContaining(['elevator_closed', 'stairs']));
  });
  it('seats large teams at distinct desks inside their office and adds garden props', () => {
    const team = room('team', 18);
    team.stations = team.stations.map((s) => ({ ...s, kind: 'skill', skill: s.id }));
    const f = { id: 'f', name: 'F', rooms: [team, room('solo', 1)] };
    const plan = layoutFloor(f);
    const { map } = buildFloorMap(plan, f);
    const office = plan.rooms.find((r) => r.id === 'team')!;
    const desks = objects(map, 'desks').filter((o) => String(propsOf(o).roomId).startsWith('team'));
    expect(desks).toHaveLength(6);
    expect(new Set(desks.map((o) => `${o.x},${o.y}`)).size).toBe(6);
    for (const d of desks) {
      expect(d.x).toBeGreaterThan(office.x * 16);
      expect(d.x).toBeLessThan((office.x + office.w - 1) * 16);
      expect(d.y).toBeGreaterThan((office.y + 2) * 16);
      expect(d.y).toBeLessThan((office.y + office.h - 1) * 16);
    }
    expect(objects(map, 'furniture').map((o) => propsOf(o).frame)).toEqual(expect.arrayContaining(['cat_sleep', 'flowerbox', 'lz_rug_big']));
  });
  it('leaves the doorways open', () => {
    const walls = tiles(map, 'walls');
    const collision = tiles(map, 'collision');
    for (const r of plan.rooms) {
      for (let dy = 0; dy < r.door.h; dy++) for (let dx = 0; dx < r.door.w; dx++) {
        const k = (r.door.y + dy) * map.width + r.door.x + dx;
        expect(walls[k]).toBe(0);
        expect(collision[k]).toBe(0);
      }
    }
  });
  it('only uses frames that exist in the generated atlas names', () => {
    const atlas = JSON.parse(readFileSync(new URL('../../../public/assets/generated/props.json', import.meta.url), 'utf8'));
    for (const o of objects(map, 'furniture')) expect(atlas.frames).toHaveProperty(String(propsOf(o).frame));
  });
});

describe('room map', () => {
  const r = room('cv', 17);
  const layout = layoutRoom(r);
  const { map } = buildRoomMap(layout, r);
  it('is a valid Tiled map', () => {
    checkTiled(map);
    expect([map.width, map.height]).toEqual([layout.tilesW, layout.tilesH]);
  });
  it('writes the walkable grid into the collision layer', () => {
    const col = tiles(map, 'collision');
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
      if (y >= 2) expect(col[y * map.width + x] === 0).toBe(layout.grid[y]![x]);
    }
  });
  it('has a station object per station and the four social spots', () => {
    expect(objects(map, 'stations')).toHaveLength(17);
    expect(objects(map, 'spots').map((o) => propsOf(o).kind).sort()).toEqual(['coffee', 'cooler', 'sofa', 'window']);
    const st = propsOf(objects(map, 'stations')[0]!);
    expect([st.seatTx, st.seatTy]).toEqual([layout.stations[0]!.seat.x, layout.stations[0]!.seat.y]);
  });
});


describe('office interiors (kat → ofis → oda)', () => {
  const atlas = JSON.parse(readFileSync(new URL('../../../public/assets/generated/props.json', import.meta.url), 'utf8'));
  const cvIds = ['skill:already-built-guard', 'skill:application-final-layout-check', 'skill:application-package', 'skill:batch-ingest', 'skill:build-and-bundle', 'skill:cover-letter-bridge-check', 'skill:cover-letter-math', 'skill:cover-letter-style', 'skill:cv-cl-core-rules', 'skill:cv-tailoring-deep', 'skill:job-evaluation-criteria', 'skill:job-filter-local', 'skill:jobtable', 'skill:posting-nuance-warnings', 'linkedin-collector', 'application-preparer', 'base-kutuphane'];
  const cv = { id: 'emrecan-cv', name: 'Emrecan CV', skills: [], stations: cvIds.map((id) => ({ id, name: id, skill: id.startsWith('skill:') ? id.slice(6) : null, kind: id.startsWith('skill:') ? 'skill' : 'task', risk: 'readonly', runsOn: 'local', scripts: [], paths: [], repo: null, source: 'manifest', description: '' })) } as unknown as Room;
  it('Emrecan CV has a workflow of rooms 1–4, a coordinator room and a library, each with its own dress', () => {
    const l = layoutRoom(cv);
    const byDress = new Map(l.departments.map((d) => [d.dress, d]));
    for (const key of ['coordination', 'radar', 'tailor', 'letters', 'delivery', 'archive']) expect(byDress.has(key)).toBe(true);
    expect(['radar', 'tailor', 'letters', 'delivery'].map((k) => byDress.get(k)!.step)).toEqual(['1', '2', '3', '4']);
    // rooms of one office look different: no two rooms share a floor material
    const floors = l.departments.map((d) => dressOf(d.dress)!.floor);
    expect(new Set(floors).size).toBe(floors.length);
  });
  it('cv-checker is a review laboratory with its own dress', () => {
    const l = layoutRoom({ ...cv, id: 'cv-checker', stations: cv.stations.slice(0, 5) } as Room);
    expect(l.departments).toHaveLength(1);
    expect(l.departments[0]!.dress).toBe('checker');
    expect(l.departments[0]!.name).toMatch(/kontrol/i);
  });
  it('the other personal-growth offices have their own rooms and dresses', () => {
    const mk = (id: string, n: number) => ({ ...cv, id, stations: cv.stations.slice(0, n) }) as Room;
    const interview = layoutRoom(mk('interview-assistant', 3));
    const portfolio = layoutRoom(mk('portfolio', 2));
    expect(interview.departments[0]!.dress).toBe('interview');
    expect(interview.departments[0]!.name).toMatch(/mülakat/i);
    expect(portfolio.departments[0]!.dress).toBe('portfolio');
    expect(portfolio.departments[0]!.name).toMatch(/web/i);
    // three one-room offices of the floor never share a room floor material
    const floors = ['cv-checker', 'interview-assistant', 'portfolio'].map((id) => dressOf(layoutRoom(mk(id, 3)).departments[0]!.dress)!.floor);
    expect(new Set(floors).size).toBe(3);
  });
  it('every dress uses real atlas frames and a valid floor material', () => {
    for (const [key, dress] of Object.entries(DRESSES)) {
      for (const f of [...dress.back, ...dress.corners.map((c) => c.frame)]) expect(atlas.frames, `${key}:${f}`).toHaveProperty(f);
    }
  });
  it('builds the Emrecan CV office map with the rooms dressed (art and corner pieces present)', () => {
    const l = layoutRoom(cv);
    const { map } = buildRoomMap(l, cv, 'growth', 2);
    const frames = new Set(objects(map, 'furniture').map((o) => String(propsOf(o).frame)));
    for (const f of ['radar_screen', 'cv_drafts', 'mannequin', 'quote_wall', 'checklist_board', 'archive_cabinets', 'runner_terracotta']) expect(frames.has(f), f).toBe(true);
  });
});

describe('master office', () => {
  it('builds a furnished office with exactly one manager seat and no project stations', () => {
    const { map } = buildMasterMap();
    checkTiled(map);
    const [desk] = objects(map, 'desks');
    expect(objects(map, 'desks')).toHaveLength(1);
    expect(propsOf(desk!).roomId).toBe(MASTER_ID);
    expect({ x: desk!.x, y: desk!.y }).toEqual(MASTER_SEAT);
    expect(objects(map, 'furniture').length).toBeGreaterThan(25);
    expect(objects(map, 'zones')).toHaveLength(1);
    expect(tiles(map, 'collision')[Math.floor(desk!.y / 16) * map.width + Math.floor(desk!.x / 16)]).toBe(0);
  });
});


it('renders purpose-specific office art using available atlas frames and theme tiles', () => {
  const atlas = JSON.parse(readFileSync(new URL('../../../public/assets/generated/props.json', import.meta.url), 'utf8'));
  for (const id of ['emrecan-cv', 'mahur', 'paperhub']) {
    const r = room(id, 5);
    const { map } = buildRoomMap(layoutRoom(r), r);
    checkTiled(map);
    for (const o of objects(map, 'furniture')) expect(atlas.frames).toHaveProperty(String(propsOf(o).frame));
    if (id !== 'emrecan-cv') expect(tiles(map, 'walls').some(g => g >= 409)).toBe(true);
  }
});
