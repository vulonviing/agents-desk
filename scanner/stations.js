import { basename, sep } from 'node:path';

// Maps a tool event of a Claude session to the station it belongs to. Pure: no file access.
// Event: { skill?, path? (absolute), command? }. Command text is only compared with known script
// names; the caller must not keep it.

const SKILL_DIR = /^\.(?:agents|claude)\/skills\/([^/]+)\//;

export function buildMatcher(room) {
  const skills = new Map();
  const prefixes = [];
  const scripts = new Map();
  const repos = [];
  for (const s of room.stations) {
    if (s.skill) skills.set(s.skill, s.id);
    for (const p of s.paths) prefixes.push({ prefix: p, id: s.id });
    for (const sc of s.scripts) if (!scripts.has(basename(sc))) scripts.set(basename(sc), s.id);
    if (s.repo) {
      const embedded = (room.embedded ?? []).find((e) => e.name === s.repo);
      if (embedded) repos.push({ path: embedded.path, id: s.id });
    }
  }
  prefixes.sort((a, b) => b.prefix.length - a.prefix.length);
  return { roomPath: room.path, skills, prefixes, scripts, repos };
}

export function matchEvent(m, evt) {
  if (evt.skill) return m.skills.get(String(evt.skill).split(':').pop()) ?? null;
  if (evt.path) {
    for (const r of m.repos) if (evt.path === r.path || evt.path.startsWith(r.path + sep)) return r.id;
    if (!evt.path.startsWith(m.roomPath + sep)) return null;
    const rel = evt.path.slice(m.roomPath.length + 1);
    const skill = rel.match(SKILL_DIR);
    if (skill && m.skills.has(skill[1])) return m.skills.get(skill[1]);
    for (const { prefix, id } of m.prefixes) {
      if (prefix.endsWith('/') ? rel.startsWith(prefix) : rel === prefix) return id;
    }
    return null;
  }
  if (evt.command) {
    for (const [name, id] of m.scripts) if (evt.command.includes(name)) return id;
  }
  return null;
}
