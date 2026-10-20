import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter, listSkills } from '../scanner/skills.js';
import { extractTriggers } from '../scanner/triggers.js';
import { summarize } from '../scanner/readme.js';
import { ageInDays, classify, dustLevel, lampState } from '../scanner/classify.js';
import { tmp, write } from './helpers.js';

test('frontmatter: plain, quoted and folded values', () => {
  const fm = parseFrontmatter('---\nname: a-skill\ndescription: >\n  first line\n  second line\nother: "quoted"\nmetadata:\n  nested: x\n---\nbody');
  assert.equal(fm.name, 'a-skill');
  assert.equal(fm.description, 'first line second line');
  assert.equal(fm.other, 'quoted');
  assert.equal(fm.nested, undefined);
});

test('listSkills: dedupes by name, follows in-repo symlinks, ignores outside ones', () => {
  const repo = tmp();
  const outside = tmp();
  write(repo, '.agents/skills/alpha/SKILL.md', '---\nname: alpha\ndescription: A\n---\n');
  write(repo, '.agents/skills/beta/SKILL.md', '---\nname: beta\ndescription: B\n---\n');
  mkdirSync(join(repo, '.claude'), { recursive: true });
  symlinkSync(join(repo, '.agents/skills'), join(repo, '.claude/skills'), 'dir');
  write(outside, 'evil/SKILL.md', '---\nname: evil\ndescription: E\n---\n');
  mkdirSync(join(repo, '.agents/skills'), { recursive: true });
  symlinkSync(join(outside, 'evil'), join(repo, '.agents/skills/evil'), 'dir');
  assert.deepEqual(listSkills(repo).map((s) => s.name), ['alpha', 'beta']);
});

test('listSkills: repo without skills gives an empty list', () => {
  assert.deepEqual(listSkills(tmp()), []);
});

test('triggers: bullets with continuation, stops at next heading, skips fences', () => {
  const md = [
    '# Title', '', '## Trigger commands', '',
    '- **"başla"** → batch mode', '  continues here', '',
    '```sh', '# not a heading', 'run it', '```',
    '- **"jobbot status"** → status', '', '## Other', '- not a trigger',
  ].join('\n');
  assert.deepEqual(extractTriggers(md), ['"başla" → batch mode continues here', '"jobbot status" → status']);
});

test('triggers: Turkish heading and table rows', () => {
  const md = '## Tetikleyici komutlar\n\n| Komut | İş |\n|---|---|\n| başla | batch |\n';
  assert.deepEqual(extractTriggers(md), ['başla → batch']);
});

test('triggers: no matching heading gives an empty list', () => {
  assert.deepEqual(extractTriggers('## Skills\n- a\n'), []);
});

test('readme summary skips headings, badges and html', () => {
  const md = '# Name\n\n![badge](x.png)\n\n<p align="center">x</p>\n\nThis is **the** [real](http://x) description.\n\nSecond paragraph.';
  assert.equal(summarize(md), 'This is the real description.');
});

test('dust, lamp and classify rules', () => {
  const dust = { light: 14, medium: 45, heavy: 120 };
  assert.deepEqual([0, 13, 14, 44, 45, 119, 120].map((d) => dustLevel(d, dust)), [0, 0, 1, 1, 2, 2, 3]);
  assert.equal(dustLevel(null, dust), 3);
  const lamp = { activeDays: 1, weekDays: 7 };
  assert.equal(lampState({ ageDays: 0, dirty: 2, ahead: 0 }, lamp), 'unpushed');
  assert.equal(lampState({ ageDays: 50, dirty: 0, ahead: 3 }, lamp), 'unpushed');
  assert.equal(lampState({ ageDays: 1, dirty: 0, ahead: 0 }, lamp), 'active');
  assert.equal(lampState({ ageDays: 5, dirty: 0, ahead: null }, lamp), 'week');
  assert.equal(lampState({ ageDays: 30, dirty: 0, ahead: 0 }, lamp), 'idle');
  assert.equal(classify('x', { assignments: { x: 'research' }, defaultFloor: 'products' }), 'research');
  assert.equal(classify('y', { assignments: {}, defaultFloor: 'products' }), 'products');
  assert.equal(ageInDays('2026-01-01T00:00:00Z', Date.parse('2026-01-11T12:00:00Z')), 10);
});

test('shellQuote neutralizes quotes, $() and backticks in paths', async () => {
  const { shellQuote } = await import('../office/js/panel.js');
  assert.equal(shellQuote('/a b/c'), "'/a b/c'");
  assert.equal(shellQuote("/x'; rm -rf ~; '"), "'/x'\\''; rm -rf ~; '\\'''");
  assert.equal(shellQuote('/$(id)/`id`'), "'/$(id)/`id`'");
});
