import test from 'node:test';
import assert from 'node:assert/strict';
import { createSceneShare } from '../server/scene-share.js';

const A = 'client-aaaaaa', B = 'client-bbbbbb';
const make = () => { let t = 1000; const share = createSceneShare({ now: () => t }); return { share, tick: (ms) => { t += ms; } }; };

test('the first visible client leads and followers receive its snapshot', () => {
  const { share } = make();
  assert.equal(share.sync({ clientId: A, snapshot: { n: 1 } }).role, 'leader');
  const f = share.sync({ clientId: B });
  assert.equal(f.role, 'follower');
  assert.deepEqual(f.scene, { n: 1 });
  assert.equal(share.sync({ clientId: B, since: f.seq }).scene, undefined);
});

test('a hidden page never takes the lead, and the lead moves when the lease expires', () => {
  const { share, tick } = make();
  assert.equal(share.sync({ clientId: B, visible: false }).role, 'follower');
  assert.equal(share.sync({ clientId: A, snapshot: { n: 1 } }).role, 'leader');
  tick(3000); assert.equal(share.sync({ clientId: B }).role, 'follower');
  tick(5000); assert.equal(share.sync({ clientId: B }).role, 'leader');
  assert.equal(share.sync({ clientId: A }).role, 'follower');
});

test('releasing hands the lead over immediately', () => {
  const { share } = make();
  share.sync({ clientId: A });
  share.release(A);
  assert.equal(share.sync({ clientId: B }).role, 'leader');
});

test('follower commands reach only the leader and are validated', () => {
  const { share } = make();
  share.sync({ clientId: A });
  share.sync({ clientId: B, commands: [{ type: 'interact', id: 'plant1' }, { type: 'power', on: 1 }, { type: 'poke' }, { type: 'exec', cmd: 'x' }, { type: 'interact', id: '../x' }] });
  assert.deepEqual(share.sync({ clientId: A }).commands, [{ type: 'interact', id: 'plant1' }, { type: 'power', on: true }, { type: 'poke' }]);
  assert.deepEqual(share.sync({ clientId: A }).commands, []);
});

test('pinned desks from other clients are reported and expire', () => {
  const { share, tick } = make();
  share.sync({ clientId: A });
  share.sync({ clientId: B, pinned: ['news#project'] });
  assert.deepEqual(share.sync({ clientId: A }).pinned, ['news#project']);
  tick(3500);
  assert.deepEqual(share.sync({ clientId: A }).pinned, []);
});

test('bad client ids and oversized snapshots are rejected', () => {
  const { share } = make();
  assert.equal(share.sync({ clientId: '../x' }).status, 400);
  share.sync({ clientId: A, snapshot: { n: 1 } });
  share.sync({ clientId: A, snapshot: { big: 'x'.repeat(500 * 1024) } });
  assert.deepEqual(share.sync({ clientId: B }).scene, { n: 1 });
});
