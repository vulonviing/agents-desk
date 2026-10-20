import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveBaseline, loadManifest, stationsFor, validateManifest } from '../scanner/manifest.js';
import { tmp, write } from './helpers.js';

test('validateManifest: normalizes stations and reports problems without dropping the good ones', () => {
  const { manifest, errors } = validateManifest({
    slug: 'x',
    level: 'read-only',
    stations: [
      { id: 'diag', name: 'Teşhis', risk: 'readonly', scripts: ['a.sh'], runsOn: 'vps' },
      { id: 'diag', name: 'dup' },
      { id: 'bad', risk: 'nuclear' },
      { name: 'no id' },
      { skill: 'cover-letter-style', risk: 'effect' },
    ],
  });
  assert.equal(manifest.level, 'read-only');
  assert.deepEqual(manifest.stations.map((s) => s.id), ['diag', 'bad', 'skill:cover-letter-style']);
  assert.equal(manifest.stations[0].runsOn, 'vps');
  assert.equal(manifest.stations[1].risk, 'unknown');
  assert.equal(errors.length, 3);
});

test('validateManifest: unknown level is rejected, not trusted', () => {
  const { manifest, errors } = validateManifest({ level: 'god-mode', stations: [] });
  assert.equal(manifest.level, undefined);
  assert.match(errors[0], /unknown level/);
});

test('loadManifest: missing file is fine, broken JSON is reported', () => {
  const dir = tmp();
  assert.deepEqual(loadManifest('nope', dir), { manifest: null, errors: [] });
  write(dir, 'broken.json', '{ not json');
  assert.equal(loadManifest('broken', dir).manifest, null);
  assert.equal(loadManifest('broken', dir).errors.length, 1);
});

test('stationsFor: skills become stations and manifest entries override them', () => {
  const skills = [{ name: 'a', description: 'A' }, { name: 'b', description: 'B' }];
  const { manifest } = validateManifest({
    stations: [{ skill: 'a', risk: 'readonly', paths: ['extra/'] }, { id: 'task1', name: 'Task', scripts: ['t.sh'] }],
  });
  const st = stationsFor({ repoPath: tmp(), skills, manifest });
  assert.deepEqual(st.map((s) => s.id), ['skill:a', 'skill:b', 'task1']);
  const a = st[0];
  assert.equal(a.risk, 'readonly');
  assert.equal(a.description, 'A');
  assert.ok(a.paths.includes('extra/') && a.paths.includes('.agents/skills/a/'));
  assert.equal(a.source, 'skill+manifest');
});

test('deriveBaseline: groups scripts by first word, singles stay alone, skips node_modules', () => {
  const repo = tmp();
  for (const f of ['openvpn-install.sh', 'openvpn-verify.sh', 'inventory.sh', 'scripts/check_tokens.py', 'node_modules/x.js', 'notes.md']) write(repo, f, '#!/bin/sh\n');
  const st = deriveBaseline(repo);
  assert.deepEqual(st.map((s) => s.name).sort(), ['check_tokens.py', 'inventory.sh', 'openvpn']);
  assert.deepEqual(st.find((s) => s.name === 'openvpn').scripts, ['openvpn-install.sh', 'openvpn-verify.sh']);
  assert.ok(st.every((s) => s.source === 'derived'));
});

test('stationsFor: a project with nothing still gets one general desk; stations are capped', () => {
  assert.deepEqual(stationsFor({ repoPath: tmp(), skills: [], manifest: null }).map((s) => s.id), ['general']);
  const many = Array.from({ length: 40 }, (_, i) => ({ name: `s${i}`, description: '' }));
  assert.equal(stationsFor({ repoPath: tmp(), skills: many, manifest: null }).length, 24);
});
