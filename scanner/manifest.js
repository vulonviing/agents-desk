import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// A room's stations are the things its project can do: real SKILL.md skills plus "tasks" described in
// projects/<slug>.json (written by hand or by an agent, stored here, never inside the project repo).
// Projects with neither get a baseline derived from their scripts.

export const LEVELS = ['plan', 'read-only', 'approve'];
export const RISKS = ['readonly', 'effect', 'unknown'];
const MAX_STATIONS = 24;
const SCRIPT_EXT = /\.(sh|ps1|py|mjs|js|cjs|rb)$/;
const SKIP_DIRS = new Set(['node_modules', '.git', 'build', 'dist', '__pycache__', '.venv']);

const slugOf = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Returns { manifest, errors }. A manifest with errors is still usable for the valid parts.
export function validateManifest(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object') return { manifest: null, errors: ['manifest must be an object'] };
  const level = LEVELS.includes(raw.level) ? raw.level : undefined;
  if (raw.level && !level) errors.push(`unknown level "${raw.level}"`);
  const seen = new Set();
  const stations = [];
  for (const s of Array.isArray(raw.stations) ? raw.stations : []) {
    const id = typeof s.id === 'string' && s.id ? s.id : s.skill ? `skill:${s.skill}` : null;
    if (!id) {
      errors.push('station without id');
      continue;
    }
    if (seen.has(id)) {
      errors.push(`duplicate station "${id}"`);
      continue;
    }
    seen.add(id);
    if (s.risk && !RISKS.includes(s.risk)) errors.push(`station "${id}": unknown risk "${s.risk}"`);
    stations.push({
      id,
      skill: s.skill ?? null,
      name: String(s.name ?? s.skill ?? id),
      description: String(s.description ?? ''),
      kind: s.skill ? 'skill' : 'task',
      risk: RISKS.includes(s.risk) ? s.risk : 'unknown',
      runsOn: typeof s.runsOn === 'string' ? s.runsOn : 'local',
      scripts: Array.isArray(s.scripts) ? s.scripts.map(String) : [],
      paths: Array.isArray(s.paths) ? s.paths.map(String) : [],
      repo: typeof s.repo === 'string' ? s.repo : null,
      source: 'manifest',
    });
  }
  return { manifest: { slug: String(raw.slug ?? ''), level, notes: String(raw.notes ?? ''), stations }, errors };
}

export function loadManifest(slug, dir) {
  const file = join(dir, `${slug}.json`);
  if (!existsSync(file)) return { manifest: null, errors: [] };
  try {
    return validateManifest(JSON.parse(readFileSync(file, 'utf8')));
  } catch (err) {
    return { manifest: null, errors: [`${slug}.json: ${err.message}`] };
  }
}

function skillStation(skill) {
  return {
    id: `skill:${skill.name}`,
    skill: skill.name,
    name: skill.name,
    description: skill.description,
    kind: 'skill',
    risk: 'unknown',
    runsOn: 'local',
    scripts: [],
    paths: [`.agents/skills/${skill.name}/`, `.claude/skills/${skill.name}/`],
    repo: null,
    source: 'skill',
  };
}

// Groups script files by their first word (openvpn-*, diagnostics-*, deploy-*), singles stay alone.
export function deriveBaseline(repoPath) {
  const files = [];
  for (const dir of ['', 'scripts', 'tools']) {
    let names;
    try {
      names = readdirSync(join(repoPath, dir));
    } catch {
      continue;
    }
    for (const n of names) {
      if (!SCRIPT_EXT.test(n) || SKIP_DIRS.has(n)) continue;
      try {
        if (statSync(join(repoPath, dir, n)).isFile()) files.push(dir ? `${dir}/${n}` : n);
      } catch {
        // vanished
      }
    }
  }
  const groups = new Map();
  for (const f of files.sort()) {
    const base = f.split('/').pop().replace(SCRIPT_EXT, '');
    const key = base.split(/[-_.]/)[0];
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  const stations = [];
  for (const [key, list] of groups) {
    const grouped = list.length > 1;
    stations.push({
      id: `task:${slugOf(grouped ? key : list[0])}`,
      skill: null,
      name: grouped ? key : list[0].split('/').pop(),
      description: grouped ? `${list.length} script: ${list.map((f) => f.split('/').pop()).join(', ')}` : list[0],
      kind: 'task',
      risk: 'unknown',
      runsOn: 'local',
      scripts: list,
      paths: [],
      repo: null,
      source: 'derived',
    });
  }
  return stations;
}

// Real skills first, then manifest tasks; a manifest entry with `skill` overrides that skill's details.
export function stationsFor({ repoPath, skills, manifest }) {
  const byId = new Map();
  for (const s of skills) byId.set(`skill:${s.name}`, skillStation(s));
  for (const m of manifest?.stations ?? []) {
    const base = byId.get(m.id);
    byId.set(m.id, base ? { ...base, ...m, name: m.name || base.name, description: m.description || base.description, paths: [...new Set([...base.paths, ...m.paths])], source: 'skill+manifest' } : m);
  }
  let stations = [...byId.values()];
  if (!stations.length) stations = deriveBaseline(repoPath);
  if (!stations.length) {
    stations = [{ id: 'general', skill: null, name: 'Genel masa', description: 'Bu proje için tanımlı skill ya da script bulunamadı.', kind: 'task', risk: 'unknown', runsOn: 'local', scripts: [], paths: [], repo: null, source: 'derived' }];
  }
  return stations.slice(0, MAX_STATIONS);
}
