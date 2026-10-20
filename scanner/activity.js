import { closeSync, openSync, readSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { buildMatcher, matchEvent } from './stations.js';
import { encodeProjectDir } from './sessions.js';

// Per-station activity from Claude Code transcripts: which skill or script was used, when, how often.
// Privacy: message and command text is never kept. The cache holds only {timestamp, station, tool}.

const DAY = 86400000;
const WINDOW_DAYS = 14;
const CHUNK = 4 * 1024 * 1024;
const MAX_FILES_PER_DIR = 30;
const FILE_TOOLS = new Set(['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

// Reads complete lines appended to `file` since `offset`. A half-written last line waits for the next call.
function* newLines(file, offset) {
  const fd = openSync(file, 'r');
  try {
    const size = statSync(file).size;
    let pos = offset;
    let rest = '';
    const decoder = new StringDecoder('utf8'); // keeps multi-byte characters intact across chunk borders
    const buf = Buffer.alloc(CHUNK);
    while (pos < size) {
      const n = readSync(fd, buf, 0, Math.min(CHUNK, size - pos), pos);
      if (!n) break;
      pos += n;
      const parts = (rest + decoder.write(buf.subarray(0, n))).split('\n');
      rest = parts.pop();
      for (const line of parts) yield { line, end: pos - Buffer.byteLength(rest) };
    }
    yield { line: null, end: pos - Buffer.byteLength(rest) };
  } finally {
    closeSync(fd);
  }
}

// Station hits (id, tool, ts) in one transcript line. Only assistant tool calls are looked at.
export function hitsFromLine(line, matcher) {
  if (!line.includes('"tool_use"')) return [];
  let rec;
  try {
    rec = JSON.parse(line);
  } catch {
    return [];
  }
  if (rec.type !== 'assistant' || !Array.isArray(rec.message?.content) || !rec.timestamp) return [];
  const ts = Date.parse(rec.timestamp);
  const hits = [];
  for (const b of rec.message.content) {
    if (b?.type !== 'tool_use') continue;
    const input = b.input ?? {};
    const evt = b.name === 'Skill' ? { skill: input.skill } : FILE_TOOLS.has(b.name) ? { path: input.file_path ?? input.notebook_path } : b.name === 'Bash' ? { command: input.command } : null;
    if (!evt) continue;
    const id = typeof (evt.skill ?? evt.path ?? evt.command) === 'string' ? matchEvent(matcher, evt) : null;
    if (id) hits.push({ ts, id, tool: b.name });
  }
  return hits;
}

const matcherSig = (room) => JSON.stringify(room.stations.map((s) => [s.id, s.skill, s.paths, s.scripts, s.repo]));

// cache: Map(file → { sig, offset, hits[] }). Pass the same Map between calls for incremental scans.
export function scanRoomActivity(room, dirs, now, cache) {
  const matcher = buildMatcher(room);
  const sig = matcherSig(room);
  const since = now - WINDOW_DAYS * DAY;
  const perStation = new Map(room.stations.map((s) => [s.id, { lastAt: null, lastTool: null, count7d: 0, byDay: Array(WINDOW_DAYS).fill(0) }]));

  for (const dir of dirs) {
    let names;
    try {
      names = readdirSync(dir).filter((n) => n.endsWith('.jsonl'));
    } catch {
      continue;
    }
    const files = names
      .map((n) => ({ file: join(dir, n), mtimeMs: statSync(join(dir, n)).mtimeMs }))
      .filter((f) => f.mtimeMs >= since)
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, MAX_FILES_PER_DIR);
    for (const { file } of files) {
      let entry = cache.get(file);
      if (!entry || entry.sig !== sig || statSync(file).size < entry.offset) {
        entry = { sig, offset: 0, hits: [] };
        cache.set(file, entry);
      }
      for (const { line, end } of newLines(file, entry.offset)) {
        if (line !== null) entry.hits.push(...hitsFromLine(line, matcher));
        entry.offset = end;
      }
      for (const h of entry.hits) {
        const st = perStation.get(h.id);
        if (!st || h.ts < since) continue;
        const iso = new Date(h.ts).toISOString();
        if (!st.lastAt || iso > st.lastAt) {
          st.lastAt = iso;
          st.lastTool = h.tool;
        }
        const daysAgo = Math.floor((now - h.ts) / DAY);
        if (daysAgo >= 0 && daysAgo < WINDOW_DAYS) st.byDay[daysAgo]++;
        if (daysAgo >= 0 && daysAgo < 7) st.count7d++;
      }
    }
  }
  return Object.fromEntries(perStation);
}

// Project folders (in ~/.claude/projects) that belong to a room: its own and its embedded repos'.
export function roomDirs(room, root, allDirs) {
  const keys = [encodeProjectDir(room.path), ...(room.embedded ?? []).map((e) => encodeProjectDir(e.path))];
  return allDirs.filter((d) => keys.some((k) => d === k || d.startsWith(k + '-'))).map((d) => join(root, d));
}

export function scanActivity(data, config = {}, now = Date.now(), cache = new Map()) {
  const root = (config.sessions?.projectsDir ?? '~/.claude/projects').replace(/^~/, homedir());
  let allDirs = [];
  try {
    allDirs = readdirSync(root);
  } catch {
    // no sessions yet
  }
  const rooms = {};
  const all = data.floors.flatMap((f) => f.rooms);
  // A longer project key owns a folder: agents-deck-public must not be counted as agents-deck.
  const keyOf = (r) => encodeProjectDir(r.path);
  for (const room of all) {
    const dirs = roomDirs(room, root, allDirs).filter((d) => {
      const name = d.slice(root.length + 1);
      return !all.some((o) => o !== room && keyOf(o).length > keyOf(room).length && (name === keyOf(o) || name.startsWith(keyOf(o) + '-')));
    });
    rooms[room.id] = scanRoomActivity(room, dirs, now, cache);
  }
  return { generatedAt: new Date(now).toISOString(), windowDays: WINDOW_DAYS, rooms };
}
