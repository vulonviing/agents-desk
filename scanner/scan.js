import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitInfo } from './git.js';
import { listSkills } from './skills.js';
import { readTriggers } from './triggers.js';
import { readSummary } from './readme.js';
import { ageInDays, classify, dustLevel, lampState } from './classify.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '..');

export const slugify = (name) =>
  name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export const expandHome = (p) => (p.startsWith('~') ? join(homedir(), p.slice(1)) : p);

export function loadConfig(path = join(ROOT, 'desk.config.json')) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// Top-level git repositories under the configured roots (a .git directory, not a symlink).
export function discoverRepos(config) {
  const repos = [];
  for (const rootRaw of config.roots) {
    const root = expandHome(rootRaw);
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      if (config.exclude?.includes(entry.name)) continue;
      const dir = join(root, entry.name);
      try {
        if (lstatSync(join(dir, '.git')).isDirectory()) repos.push({ name: entry.name, path: dir });
      } catch {
        // not a git repo
      }
    }
  }
  return repos.sort((a, b) => a.name.localeCompare(b.name));
}

function buildDesk(config, now, { id, name, path, kind, subpath, withDocs }) {
  const info = gitInfo(path, subpath);
  const ageDays = ageInDays(info.lastCommit?.date, now);
  const dir = subpath ? join(path, subpath) : path;
  return {
    id,
    name,
    path: dir,
    kind,
    ...info,
    ageDays,
    dust: dustLevel(ageDays, config.dust),
    lamp: lampState({ ageDays, dirty: info.dirty, ahead: info.ahead }, config.lamp),
    readmeSummary: readSummary(dir),
    skills: withDocs ? listSkills(path) : [],
    triggers: withDocs ? readTriggers(path) : [],
  };
}

export function scan(config = loadConfig(), now = Date.now()) {
  const repos = discoverRepos(config);
  const byName = new Map(repos.map((r) => [r.name, r]));
  const roomRepoNames = new Set();
  for (const room of config.rooms ?? []) {
    roomRepoNames.add(room.repo);
    for (const n of room.repos ?? []) roomRepoNames.add(n);
  }

  const floors = config.floors.map((f) => ({ id: f.id, name: f.name, rooms: [], desks: [] }));
  const floorById = new Map(floors.map((f) => [f.id, f]));
  const warnings = [];

  for (const room of config.rooms ?? []) {
    const floor = floorById.get(room.floor);
    const repo = byName.get(room.repo);
    if (!floor || !repo) {
      warnings.push(`room "${room.id}": missing floor or repo`);
      continue;
    }
    const desks = (room.subsystems ?? []).map((s) =>
      buildDesk(config, now, { id: `${room.id}/${slugify(s.name)}`, name: s.name, path: repo.path, kind: 'subsystem', subpath: s.path }),
    );
    for (const n of room.repos ?? []) {
      const r = byName.get(n);
      if (!r) {
        warnings.push(`room "${room.id}": repo "${n}" not found`);
        continue;
      }
      desks.push(buildDesk(config, now, { id: slugify(n), name: n, path: r.path, kind: 'repo', withDocs: true }));
    }
    const head = buildDesk(config, now, { id: room.id, name: room.name, path: repo.path, kind: 'repo', withDocs: true });
    floor.rooms.push({
      id: room.id,
      name: room.name,
      path: repo.path,
      lastCommit: head.lastCommit,
      ageDays: head.ageDays,
      dust: head.dust,
      lamp: head.lamp,
      remote: head.remote,
      branch: head.branch,
      dirty: head.dirty,
      ahead: head.ahead,
      readmeSummary: head.readmeSummary,
      skills: head.skills,
      triggers: head.triggers,
      desks,
    });
  }

  for (const repo of repos) {
    if (roomRepoNames.has(repo.name)) continue;
    const floorId = classify(repo.name, config);
    const floor = floorById.get(floorId);
    if (!floor) {
      warnings.push(`repo "${repo.name}": unknown floor "${floorId}"`);
      continue;
    }
    floor.desks.push(buildDesk(config, now, { id: slugify(repo.name), name: repo.name, path: repo.path, kind: 'repo', withDocs: true }));
  }

  return { generatedAt: new Date(now).toISOString(), floors, warnings };
}

export function writeProjects(data, out = join(ROOT, 'data', 'projects.json')) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(data, null, 2));
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const data = scan();
  const out = writeProjects(data);
  const desks = data.floors.reduce((n, f) => n + f.desks.length + f.rooms.reduce((m, r) => m + r.desks.length, 0), 0);
  console.log(`scanned ${desks} desks → ${out}`);
  for (const w of data.warnings) console.warn('warning:', w);
}
