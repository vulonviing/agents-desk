import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const HEADING = /trigger commands|tetikleyici komutlar/i;

function clean(text) {
  const s = text.replace(/\*\*/g, '').replace(/`/g, '').replace(/\s+/g, ' ').trim();
  return s.length > 220 ? s.slice(0, 217) + '...' : s;
}

// Collects bullets and table rows under a "Trigger commands" / "Tetikleyici komutlar" heading.
export function extractTriggers(markdown) {
  const out = [];
  let level = 0;
  let inSection = false;
  let inFence = false;
  let tableRow = 0;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      if (inSection && h[1].length <= level) break;
      if (!inSection && HEADING.test(h[2])) {
        inSection = true;
        level = h[1].length;
      }
      continue;
    }
    if (!inSection) continue;
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      out.push(clean(bullet[1]));
      tableRow = 0;
      continue;
    }
    if (/^\|.*\|\s*$/.test(line)) {
      tableRow++;
      if (tableRow === 1 || /^\|[\s:|-]+\|\s*$/.test(line)) continue;
      out.push(clean(line.split('|').slice(1, -1).map((c) => c.trim()).join(' → ')));
      continue;
    }
    tableRow = 0;
    if (/^\s{2,}\S/.test(line) && out.length && !/^\s{2,}(```|\$)/.test(line)) {
      // continuation of the previous bullet
      out[out.length - 1] = clean(out[out.length - 1] + ' ' + line);
    }
  }
  return out;
}

export function readTriggers(repoPath) {
  for (const f of ['AGENTS.md', 'CLAUDE.md']) {
    try {
      const t = extractTriggers(readFileSync(join(repoPath, f), 'utf8'));
      if (t.length) return t;
    } catch {
      // file missing or unreadable: try the next one
    }
  }
  return [];
}
