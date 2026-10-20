import { lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitInfo } from './git.js';
import { listSkills } from './skills.js';
import { readTriggers } from './triggers.js';
import { readSummary } from './readme.js';
import { ageInDays, classify, dustLevel, lampState } from './classify.js';
import { LEVELS, loadManifest, stationsFor } from './manifest.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '..');

export const slugify = (name) =>
  name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export const expandHome = (p) => (p.startsWith('~') ? join(homedir(), p.slice(1)) : p);

// DESK_CONFIG lets tests and demos point at another config without touching the real one.
export function loadConfig(path = process.env.DESK_CONFIG || join(ROOT, 'desk.config.json')) {
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
  // `include`: repositories one level deeper (paths relative to a root), for projects kept inside a folder.
  for (const rel of config.include ?? []) {
    for (const rootRaw of config.roots) {
      const dir = join(expandHome(rootRaw), rel);
      try {
        if (lstatSync(dir).isSymbolicLink() || !lstatSync(join(dir, '.git')).isDirectory()) continue;
        if (!repos.some((r) => r.path === dir)) repos.push({ name: basename(dir), path: dir });
      } catch {
        // missing or not a git repo
      }
    }
  }
  return repos.sort((a, b) => a.name.localeCompare(b.name));
}

// Which level a room runs at: the user's config wins, then the manifest, then the default. Unknown values fall back to "plan".
export function levelFor(config, name, slug, manifest) {
  const pick = [config.levels?.[name], config.levels?.[slug], manifest?.level, config.levels?.default].find((l) => LEVELS.includes(l));
  return pick ?? 'plan';
}

function status(config, now, info) {
  const ageDays = ageInDays(info.lastCommit?.date, now);
  return { ageDays, dust: dustLevel(ageDays, config.dust), lamp: lampState({ ageDays, dirty: info.dirty, ahead: info.ahead }, config.lamp) };
}

function buildRoom(config, now, repo, manifestDir, warnings) {
  const slug = slugify(repo.name);
  const info = gitInfo(repo.path);
  const skills = listSkills(repo.path);
  const { manifest, errors } = loadManifest(slug, manifestDir);
  for (const e of errors) warnings.push(`manifest ${slug}: ${e}`);

  const embedded = (config.embed?.[repo.name] ?? []).map((name) => {
    const path = join(dirname(repo.path), name);
    const einfo = gitInfo(path);
    return { id: slugify(name), name, path, ...einfo, ...status(config, now, einfo), skills: listSkills(path) };
  });
  const stations = stationsFor({ repoPath: repo.path, skills, manifest });
  for (const e of embedded) {
    if (stations.some((s) => s.repo === e.name)) continue;
    stations.push({ id: `repo:${e.id}`, skill: null, name: e.name, description: `Ayrı repo (${e.skills.length} skill): ${e.path}`, kind: 'task', risk: 'unknown', runsOn: 'local', scripts: [], paths: [], repo: e.name, source: 'derived' });
  }

  return {
    id: slug,
    name: repo.name,
    path: repo.path,
    level: levelFor(config, repo.name, slug, manifest),
    ...info,
    ...status(config, now, info),
    readmeSummary: readSummary(repo.path),
    notes: manifest?.notes ?? '',
    skills,
    triggers: readTriggers(repo.path),
    stations,
    embedded,
  };
}

export function scan(config = loadConfig(), now = Date.now(), manifestDir = join(ROOT, 'projects')) {
  const repos = discoverRepos(config);
  const embeddedNames = new Set(Object.values(config.embed ?? {}).flat());
  const floors = config.floors.map((f) => ({ id: f.id, name: f.name, rooms: [] }));
  const floorById = new Map(floors.map((f) => [f.id, f]));
  const warnings = [];

  for (const repo of repos) {
    if (embeddedNames.has(repo.name)) continue;
    const floorId = classify(repo.name, config);
    const floor = floorById.get(floorId);
    if (!floor) {
      warnings.push(`repo "${repo.name}": unknown floor "${floorId}"`);
      continue;
    }
    floor.rooms.push(buildRoom(config, now, repo, manifestDir, warnings));
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
  const rooms = data.floors.reduce((n, f) => n + f.rooms.length, 0);
  const stations = data.floors.reduce((n, f) => n + f.rooms.reduce((m, r) => m + r.stations.length, 0), 0);
  console.log(`scanned ${rooms} rooms, ${stations} stations → ${out}`);
  for (const w of data.warnings) console.warn('warning:', w);
}
