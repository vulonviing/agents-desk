import test from 'node:test';
import assert from 'node:assert/strict';
import { DESK, NORTH, ROOM_H, ROOM_W, layoutFloor } from '../office/js/layout.js';
import { MAX_ZOOM, MIN_ZOOM, clampCamera, fitCamera, frameRect, screenToWorld, worldToScreen, zoomAt } from '../office/js/camera.js';

const floor = (n) => ({ id: 'f', name: 'Kat', rooms: Array.from({ length: n }, (_, i) => ({ id: `r${i}`, name: `r${i}`, stations: [] })) });
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('layoutFloor: empty floor has no plan', () => {
  assert.deepEqual(layoutFloor(floor(0)), { tilesW: 0, tilesH: 0, rooms: [], corridor: null });
});

test('layoutFloor: every project is one room, north row first, rows balanced', () => {
  const plan = layoutFloor(floor(9));
  const projects = plan.rooms.filter((r) => r.kind === 'project');
  assert.deepEqual(projects.map((r) => r.id), Array.from({ length: 9 }, (_, i) => `r${i}`));
  assert.equal(plan.rooms.filter((r) => r.band === 'north').length, 5);
  assert.equal(plan.rooms.filter((r) => r.band === 'south').length, 5);
  assert.equal(plan.rooms.at(-1).kind, 'kitchen');
});

test('layoutFloor: no kitchen when the south row is already as long as the north row', () => {
  assert.equal(layoutFloor(floor(10)).rooms.some((r) => r.kind === 'kitchen'), false);
});

test('layoutFloor: rooms fill the building width, stay inside it and never overlap', () => {
  for (const n of [1, 2, 3, 5, 9, 11]) {
    const plan = layoutFloor(floor(n));
    for (const band of ['north', 'south']) {
      const row = plan.rooms.filter((r) => r.band === band);
      if (row.length) assert.equal(row.reduce((s, r) => s + r.w, 0), plan.tilesW, `${n} rooms, ${band} row`);
    }
    for (let i = 0; i < plan.rooms.length; i++) {
      const a = plan.rooms[i];
      assert.ok(a.x >= 0 && a.x + a.w <= plan.tilesW && a.y >= 0 && a.y + a.h <= plan.tilesH);
      for (const b of plan.rooms.slice(i + 1)) assert.ok(!overlap(a, b), `${a.id} vs ${b.id}`);
      assert.ok(!overlap(a, plan.corridor));
    }
  }
});

test('layoutFloor: the preview desk sits inside its room below the wall; doors face the corridor', () => {
  const plan = layoutFloor(floor(6));
  for (const r of plan.rooms.filter((x) => x.kind === 'project')) {
    assert.ok(r.cell.tx >= r.x && r.cell.tx + DESK <= r.x + r.w);
    assert.ok(r.cell.ty >= r.y + NORTH && r.cell.ty + DESK <= r.y + r.h);
  }
  for (const r of plan.rooms) assert.equal(r.door.side, r.band === 'north' ? 'south' : 'north');
  assert.ok(plan.rooms.every((r) => r.w >= ROOM_W && r.h === ROOM_H));
});

test('camera: fit, zoom around the cursor, clamp and frame', () => {
  const cam = fitCamera(800, 400, 1000, 600, 0);
  assert.equal(cam.z, 1.25);
  assert.deepEqual([cam.x, cam.y], [400, 200]);
  const cursor = { x: 300, y: 200 };
  const before = screenToWorld(cam, cursor.x, cursor.y, 1000, 600);
  const zoomed = zoomAt(cam, 2, cursor.x, cursor.y, 1000, 600);
  const after = screenToWorld(zoomed, cursor.x, cursor.y, 1000, 600);
  assert.ok(Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9);
  assert.equal(zoomAt(cam, 1000, 0, 0, 1000, 600).z, MAX_ZOOM);
  assert.equal(zoomAt(cam, 0.0001, 0, 0, 1000, 600).z, MIN_ZOOM);
  assert.deepEqual(clampCamera({ x: -50, y: 900, z: 1 }, 800, 400), { x: 0, y: 400, z: 1 });
  const s = worldToScreen(cam, 400, 200, 1000, 600);
  assert.deepEqual([s.x, s.y], [500, 300]);
  const f = frameRect({ x: 100, y: 100, w: 200, h: 100 }, 1000, 600, 0, 3.2);
  assert.deepEqual([f.x, f.y, f.z], [200, 150, 3.2]);
});
