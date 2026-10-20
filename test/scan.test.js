import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, lstatSync, mkdirSync, readlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gitInfo } from '../scanner/git.js';
import { levelFor, scan, slugify } from '../scanner/scan.js';
import { linkWorkspace } from '../scripts/link-workspace.js';
import { git, makeRepo, tmp, write } from './helpers.js';

const NOW = Date.parse('2026-06-30T12:00:00Z');

function fixtureRoot() {
  const root = tmp();
  makeRepo(join(root, 'fresh'), [['a.txt', '2026-06-29T10:00:00Z']]);
  makeRepo(join(root, 'Old Project'), [['a.txt', '2025-01-01T10:00:00Z']]);
  makeRepo(join(root, 'Big Repo'), [
    ['sub1/a.txt', '2026-01-01T10:00:00Z'],
    ['sub2/b.txt', '2026-06-20T10:00:00Z'],
    ['README.md', '2026-06-20T10:00:00Z'],
  ]);
  makeRepo(join(root, 'Side Repo'), [['s.txt', '2026-06-10T10:00:00Z']]);
  write(join(root, 'Big Repo'), 'AGENTS.md', '## Trigger commands\n- **"go"** → run\n');
  write(join(root, 'Big Repo'), '.agents/skills/x/SKILL.md', '---\nname: x\ndescription: d\n---\n');
  write(join(root, 'Side Repo'), '.agents/skills/side/SKILL.md', '---\nname: side\ndescription: s\n---\n');
  mkdirSync(join(root, 'plain-folder'));
  mkdirSync(join(root, 'agents-desk'));
  return root;
}

const config = (root) => ({
  roots: [root],
  exclude: ['agents-desk'],
  dust: { light: 14, medium: 45, heavy: 120 },
  lamp: { activeDays: 1, weekDays: 7 },
  defaultFloor: 'products',
  floors: [{ id: 'products', name: 'P' }, { id: 'research', name: 'R' }],
  assignments: { 'Old Project': 'research', 'Big Repo': 'research' },
  embed: { 'Big Repo': ['Side Repo'] },
  levels: { default: 'plan', fresh: 'approve' },
});

function manifestDir() {
  const dir = tmp();
  write(dir, 'big-repo.json', JSON.stringify({ level: 'read-only', notes: 'n', stations: [{ id: 'sub1', name: 'Sub 1', paths: ['sub1/'], risk: 'readonly' }] }));
  write(dir, 'old-project.json', '{ broken');
  return dir;
}

test('gitInfo: scoped commit date, dirty count, no upstream', () => {
  const root = fixtureRoot();
  const repo = join(root, 'Big Repo');
  assert.equal(gitInfo(repo, 'sub1').lastCommit.date.slice(0, 10), '2026-01-01');
  assert.equal(gitInfo(repo).lastCommit.date.slice(0, 10), '2026-06-20');
  write(repo, 'sub1/new.txt', 'x');
  assert.equal(gitInfo(repo, 'sub1').dirty, 1);
  assert.equal(gitInfo(repo, 'sub2').dirty, 0);
  assert.equal(gitInfo(repo).ahead, null);
});

test('scan: every project is a room on its floor; folders, excluded and embedded repos are not', () => {
  const data = scan(config(fixtureRoot()), NOW, manifestDir());
  const [products, research] = data.floors;
  assert.deepEqual(products.rooms.map((r) => r.name), ['fresh']);
  assert.deepEqual(research.rooms.map((r) => r.name), ['Big Repo', 'Old Project']);
  const all = data.floors.flatMap((f) => f.rooms.map((r) => r.name));
  assert.ok(!all.includes('plain-folder') && !all.includes('agents-desk') && !all.includes('Side Repo'));
});

test('scan: dust and lamps come from the last commit', () => {
  const data = scan(config(fixtureRoot()), NOW, manifestDir());
  const fresh = data.floors[0].rooms[0];
  const old = data.floors[1].rooms.find((r) => r.name === 'Old Project');
  assert.deepEqual([fresh.lamp, fresh.dust], ['active', 0]);
  assert.deepEqual([old.lamp, old.dust], ['idle', 3]);
});

test('scan: stations merge SKILL.md skills with the manifest, embedded repos become stations', () => {
  const big = scan(config(fixtureRoot()), NOW, manifestDir()).floors[1].rooms.find((r) => r.name === 'Big Repo');
  assert.deepEqual(big.stations.map((s) => s.id), ['skill:x', 'sub1', 'repo:side-repo']);
  assert.equal(big.stations[1].risk, 'readonly');
  assert.equal(big.embedded[0].name, 'Side Repo');
  assert.equal(big.embedded[0].skills[0].name, 'side');
  assert.deepEqual(big.triggers, ['"go" → run']);
  assert.equal(big.notes, 'n');
});

test('scan: a project without skills or manifest gets a baseline station', () => {
  const fresh = scan(config(fixtureRoot()), NOW, manifestDir()).floors[0].rooms[0];
  assert.deepEqual(fresh.stations.map((s) => s.id), ['general']);
});

test('scan: a broken manifest becomes a warning, not a crash', () => {
  const data = scan(config(fixtureRoot()), NOW, manifestDir());
  assert.equal(data.warnings.length, 1);
  assert.match(data.warnings[0], /old-project/);
});

test('levelFor: config beats manifest beats default; unknown values fall back to plan', () => {
  const cfg = { levels: { default: 'plan', a: 'approve', b: 'nonsense' } };
  assert.equal(levelFor(cfg, 'a', 'a', { level: 'read-only' }), 'approve');
  assert.equal(levelFor(cfg, 'c', 'c', { level: 'read-only' }), 'read-only');
  assert.equal(levelFor(cfg, 'b', 'b', null), 'plan');
  assert.equal(levelFor({}, 'x', 'x', null), 'plan');
  assert.equal(scan(config(fixtureRoot()), NOW, manifestDir()).floors[0].rooms[0].level, 'approve');
  assert.equal(scan(config(fixtureRoot()), NOW, manifestDir()).floors[1].rooms[0].level, 'read-only');
});

test('scan never changes the repos it reads', () => {
  const root = fixtureRoot();
  const repo = join(root, 'Big Repo');
  write(repo, 'untracked.txt', 'x');
  // Measure with stat only: running `git status` here would itself refresh the index.
  const index = () => statSync(join(repo, '.git/index')).mtimeMs;
  const before = index();
  scan(config(root), NOW, manifestDir());
  assert.equal(index(), before);
  assert.equal(git(repo, ['--no-optional-locks', 'status', '--porcelain']).includes('untracked.txt'), true);
});

test('linkWorkspace: creates, is idempotent, removes stale symlinks only', () => {
  const root = fixtureRoot();
  const ws = tmp();
  const cfg = config(root);
  const first = linkWorkspace(cfg, ws);
  assert.deepEqual(first.created.sort(), ['big-repo', 'fresh', 'old-project', 'side-repo']);
  assert.equal(readlinkSync(join(ws, 'fresh')), join(root, 'fresh'));
  assert.equal(linkWorkspace(cfg, ws).created.length, 0);
  write(ws, 'keep.txt', 'regular file');
  cfg.exclude.push('fresh');
  const again = linkWorkspace(cfg, ws);
  assert.deepEqual(again.removed, ['fresh']);
  assert.ok(existsSync(join(ws, 'keep.txt')) && !lstatSync(join(ws, 'keep.txt')).isSymbolicLink());
});

test('slugify handles spaces, case and non-ascii', () => {
  assert.equal(slugify('Eğitimler Özel'), 'egitimler-ozel');
  assert.equal(slugify('Emrecan CV'), 'emrecan-cv');
});

test('gitInfo does not run a repo-configured fsmonitor hook', () => {
  const root = tmp();
  const repo = join(root, 'evil');
  makeRepo(repo, [['a.txt', '2026-06-01T10:00:00Z']]);
  const marker = join(root, 'pwned');
  write(root, 'hook.sh', `#!/bin/sh\ntouch '${marker}'\n`);
  chmodSync(join(root, 'hook.sh'), 0o755);
  git(repo, ['config', 'core.fsmonitor', join(root, 'hook.sh')]);
  gitInfo(repo);
  assert.equal(existsSync(marker), false);
});

test('gitInfo branch is the plain branch name even when a tag shares it', () => {
  const root = tmp();
  const repo = join(root, 'r');
  makeRepo(repo, [['a.txt', '2026-06-01T10:00:00Z']]);
  git(repo, ['tag', 'main']);
  assert.equal(gitInfo(repo).branch, 'main');
});
