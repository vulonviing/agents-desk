import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoordinators } from '../server/coordinators.js';
const data = { floors: [{ id: 'growth', rooms: [{ id: 'emrecan-cv', name: 'Emrecan CV', level: 'plan' }] }] };
const session = (id, provider = 'claude') => ({ id, provider, roomId: 'emrecan-cv', at: Date.now(), stationId: 'skill:tailoring', state: 'working', ageSec: 0, tool: 'Skill' });
test('every office has a named coordinator before any CLI opens', () => {
  const agents = createCoordinators().build(data, []);
  assert.equal(agents.length, 1);
  assert.equal(agents[0].id, 'emrecan-cv#project');
  assert.equal(agents[0].name, 'Başvuru Koordinatörü');
  assert.equal(agents[0].sessionMode, 'ready');
  assert.equal(agents[0].cliActive, false);
});
test('the first CLI binds the permanent coordinator; additional sessions get unique coordinators', () => {
  const c = createCoordinators(), a = session('session:first'), b = session('session:second', 'codex');
  assert.equal(c.build(data, [], [a])[0].sessionId, a.id);
  const both = c.build(data, [], [b,a]);
  assert.equal(both.length, 2);
  assert.equal(both[0].id, 'emrecan-cv#project');
  assert.equal(both[0].sessionId, a.id);
  assert.equal(both[1].name, 'Başvuru Koordinatörü 2');
  assert.equal(both[1].sessionProvider, 'codex');
  assert.equal(new Set(both.map(x => x.id)).size, 2);
  assert.equal(c.build(data, [], [a]).length, 1);
});
test('coordinators appear before skills and reflect Desk chat activity', () => {
  const c = createCoordinators();
  const agents = c.build(data, [{ roomId: 'emrecan-cv', kind: 'skill', id: 'skill:x' }], [], () => ({ busy: true, provider: 'codex', stationId: 'skill:tailoring', task: 'Review my CV' }));
  assert.equal(agents[0].coordinator, true);
  assert.equal(agents[0].cliActive, true);
  assert.equal(agents[0].targetStationId, 'skill:tailoring');
  assert.equal(agents[1].kind, 'skill');
});

test('script-only offices keep their task workers beside the permanent coordinator', () => {
  const project={id:'scripts',name:'Scripts',level:'plan',stations:[{id:'run',name:'run.sh',kind:'task',scripts:['run.sh']}]};
  const agents=createCoordinators().build({floors:[{id:'products',rooms:[project]}]},[]);
  assert.equal(agents.length,2);
  assert.equal(agents[0].coordinator,true);
  assert.equal(agents[1].stationWorker,true);
  assert.equal(agents[1].deskId,'run');
});
