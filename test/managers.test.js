import test from 'node:test';
import assert from 'node:assert/strict';
import { managerDefs, optionsFor, findManager, choicePrompt, pickTarget } from '../server/managers.js';
const data = { floors: [{ id: 'g', name: 'Gelişim', rooms: [
  { id: 'cv', name: 'CV', readmeSummary: 'Tailors resumes to job applications', skills: [{ name: 'tailoring' }], stations: [] },
  { id: 'web', name: 'Portfolio', readmeSummary: 'Personal website', skills: [], stations: [] },
  { id: 'emrecan-vps', name: 'emrecan-vps', skills: [], stations: [] },
] }] };
test('managers receive semantic metadata and no keyword rankings', () => {
  const m = findManager(data, 'manager:master');
  const prompt = choicePrompt(data, m);
  assert.match(prompt, /Tailors resumes/);
  assert.match(prompt, /tailoring/);
  assert.match(prompt, /clarify/);
  assert.doesNotMatch(prompt, /eşleşmesi|anahtar:|emrecan-vps/);
});
test('route and clarification ids are validated against the offered scope', () => {
  const opts = optionsFor(data, findManager(data, 'manager:master'));
  assert.equal(pickTarget({ target: 'cv', intent: 'git' }, opts).target.id, 'cv');
  assert.throws(() => pickTarget({ target: 'invented', intent: 'git' }, opts));
  assert.throws(() => pickTarget({ decision: 'clarify', question: 'Which?', candidates: ['invented'] }, opts));
  assert.throws(() => pickTarget({ decision: 'clarify', question: '', candidates: [] }, opts));
  const ask = pickTarget({ decision: 'clarify', question: 'CV mi, web sitesi mi?', candidates: ['cv', 'web'] }, opts);
  assert.deepEqual(ask.clarification.options.map((o) => o.id), ['cv', 'web']);
});

test('there is exactly one master across floors; destinations are offices with floor locations', () => {
  const expanded = { floors: [...data.floors, { id: 'research', name: 'Research', rooms: [{ id: 'paper', name: 'Paper' }] }] };
  assert.deepEqual(managerDefs(expanded).map(m => m.id), ['manager:master']);
  assert.equal(findManager(expanded, 'manager:floor:g'), null);
  const options = optionsFor(expanded, findManager(expanded, 'manager:master'));
  assert.deepEqual(options.map(o => [o.id, o.floorId]), [['cv', 'g'], ['web', 'g'], ['paper', 'research']]);
  assert.ok(!options.some(o => o.id === 'g'));
});

test('master replies preserve Markdown paragraphs, lists and bold text', () => {
  const text = '## Ürünler\n\n- **Mahur**: müzik\n- **Portfolio**: web';
  const reply = pickTarget({ decision: 'reply', question: text, candidates: [] }, []);
  assert.equal(reply.clarification.question, text);
});
