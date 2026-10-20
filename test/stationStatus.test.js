import test from 'node:test';
import assert from 'node:assert/strict';
import { demandList, stationStatus } from '../office/js/stationStatus.js';

const NOW = Date.parse('2026-10-19T20:00:00Z');
const ago = (ms) => new Date(NOW - ms).toISOString();
const DAY = 86400000;
const st = { id: 's1' };

test('stationStatus: recency decides lamp, dust and label', () => {
  const at = (ms) => stationStatus(st, { s1: { lastAt: ago(ms), count7d: 4, byDay: [1], lastTool: 'Skill' } }, null, NOW);
  assert.deepEqual([at(3600_000).lamp, at(3600_000).dust, at(3600_000).label], ['active', 0, 'bugün']);
  assert.deepEqual([at(DAY * 1.5).lamp, at(DAY * 1.5).label], ['week', 'dün']);
  assert.equal(at(DAY * 3.2).label, '3 gün önce');
  assert.deepEqual([at(DAY * 9).lamp, at(DAY * 9).dust], ['idle', 1]);
  assert.equal(at(3600_000).count7d, 4);
  const none = stationStatus(st, {}, null, NOW);
  assert.deepEqual([none.lamp, none.dust, none.label, none.hot, none.days], ['idle', 2, '14+ gün sessiz', false, null]);
});

test('stationStatus: a live session or a use in the last two minutes marks the station hot', () => {
  assert.equal(stationStatus(st, { s1: { lastAt: ago(30_000) } }, null, NOW).hot, true);
  assert.equal(stationStatus(st, { s1: { lastAt: ago(300_000) } }, null, NOW).hot, false);
  const live = stationStatus(st, {}, 's1', NOW);
  assert.deepEqual([live.live, live.hot, live.label, live.dust], [true, true, 'çalışıyor', 0]);
});

test('demandList: live station first, then recent ones newest first, capped', () => {
  const stations = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
  const activity = { b: { lastAt: ago(60_000) }, c: { lastAt: ago(10_000) }, d: { lastAt: ago(500_000) }, e: { lastAt: ago(100_000) } };
  assert.deepEqual(demandList(stations, activity, 'a', NOW, 3), ['a', 'c', 'b']);
  assert.deepEqual(demandList(stations, activity, null, NOW, 5), ['c', 'b', 'e']);
  assert.deepEqual(demandList(stations, {}, null, NOW), []);
});
