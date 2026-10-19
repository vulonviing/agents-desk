import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, readlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gitInfo } from '../scanner/git.js';
import { scan, slugify } from '../scanner/scan.js';
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
  write(join(root, 'Big Repo'), 'AGENTS.md', '## Trigger commands\n- **"go"** → run\n');
  write(join(root, 'Big Repo'), '.agents/skills/x/SKILL.md', '---\nname: x\ndescription: d\n---\n');
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
  assignments: { 'Old Project': 'research' },
  rooms: [{ id: 'big', name: 'Big', floor: 'research', repo: 'Big Repo', subsystems: [{ name: 'sub1', path: 'sub1' }, { name: 'sub2', path: 'sub2' }], repos: [] }],
});

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

test('scan: floors, rooms, excludes, dust and lamps', () => {
  const root = fixtureRoot();
  const data = scan(config(root), NOW);
  const products = data.floors.find((f) => f.id === 'products');
  const research = data.floors.find((f) => f.id === 'research');
  assert.deepEqual(products.desks.map((d) => d.name), ['fresh']);
  assert.deepEqual(research.desks.map((d) => d.name), ['Old Project']);
  assert.equal(research.rooms.length, 1);
  assert.deepEqual(research.rooms[0].desks.map((d) => d.name), ['sub1', 'sub2']);
  const [sub1, sub2] = research.rooms[0].desks;
  assert.equal(sub1.dust, 3);
  assert.equal(sub2.dust, 0);
  assert.equal(research.rooms[0].skills[0].name, 'x');
  assert.deepEqual(research.rooms[0].triggers, ['"go" → run']);
  assert.equal(products.desks[0].lamp, 'active');
  assert.equal(research.desks[0].lamp, 'idle');
  assert.equal(research.desks[0].dust, 3);
  const all = [...products.desks, ...research.desks, ...research.rooms[0].desks].map((d) => d.name);
  assert.ok(!all.includes('plain-folder') && !all.includes('agents-desk'));
});

test('scan never changes the repos it reads', () => {
  const root = fixtureRoot();
  const repo = join(root, 'Big Repo');
  write(repo, 'untracked.txt', 'x');
  // Measure with stat only: running `git status` here would itself refresh the index.
  const index = () => statSync(join(repo, '.git/index')).mtimeMs;
  const before = index();
  scan(config(root), NOW);
  assert.equal(index(), before);
  assert.equal(git(repo, ['--no-optional-locks', 'status', '--porcelain']).includes('untracked.txt'), true);
});

test('linkWorkspace: creates, is idempotent, removes stale symlinks only', () => {
  const root = fixtureRoot();
  const ws = tmp();
  const cfg = config(root);
  const first = linkWorkspace(cfg, ws);
  assert.deepEqual(first.created.sort(), ['big-repo', 'fresh', 'old-project']);
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
