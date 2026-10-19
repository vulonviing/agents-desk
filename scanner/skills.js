import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join, sep } from 'node:path';

const SKILL_DIRS = ['.agents/skills', '.claude/skills'];

export function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out = {};
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const km = lines[i].match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!km) continue;
    const [, key, raw] = km;
    let value = raw;
    if (/^[>|][+-]?$/.test(raw)) {
      const buf = [];
      while (i + 1 < lines.length && /^(\s+\S|\s*$)/.test(lines[i + 1])) buf.push(lines[++i].trim());
      value = buf.join(' ').trim();
    } else {
      value = raw.replace(/^(['"])(.*)\1$/, '$2');
    }
    out[key] = value;
  }
  return out;
}

// Lists skills installed in a repo. A SKILL.md reached through a symlink is only
// read when it resolves to a file inside the same repo.
export function listSkills(repoPath) {
  let root;
  try {
    root = realpathSync(repoPath);
  } catch {
    return [];
  }
  const byName = new Map();
  for (const rel of SKILL_DIRS) {
    let entries;
    try {
      entries = readdirSync(join(repoPath, rel));
    } catch {
      continue;
    }
    for (const entry of entries.sort()) {
      let file;
      try {
        file = realpathSync(join(repoPath, rel, entry, 'SKILL.md'));
      } catch {
        continue;
      }
      if (!file.startsWith(root + sep)) continue;
      const fm = parseFrontmatter(readFileSync(file, 'utf8'));
      const name = fm.name || entry;
      if (!byName.has(name)) byName.set(name, { name, description: fm.description || '' });
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}
