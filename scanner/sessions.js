import { closeSync, openSync, readSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { buildMatcher, matchEvent } from './stations.js';

// Live Claude Code sessions, inferred from transcript files in ~/.claude/projects.
// Privacy: only record types, stop_reason, tool names and file basenames are ever
// extracted. Message text is parsed past but never kept.

const TAIL_SIZES = [128 * 1024, 1024 * 1024];
const WORKING_MS = 120_000; // a prompt/tool result with no reply for this long is considered stale
const TOOL_RUNNING_MS = 15_000; // a pending tool call older than this is probably waiting on a permission or the tool

// Claude Code names a project folder after the cwd, every non-alphanumeric char becoming "-".
export const encodeProjectDir = (p) => p.replace(/[^a-zA-Z0-9]/g, '-');

const safeTool = (name) => (typeof name === 'string' && /^[A-Za-z0-9_:.-]{1,40}$/.test(name) ? name : 'araç');
const safeFile = (p) => {
  if (typeof p !== 'string') return null;
  const b = basename(p).replace(/[^\p{L}\p{N}._ -]/gu, '').slice(0, 40);
  return b || null;
};

function readTail(file, size) {
  const fd = openSync(file, 'r');
  try {
    const { size: total } = statSync(file);
    const len = Math.min(size, total);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, total - len);
    const lines = buf.toString('utf8').split('\n');
    if (total > len) lines.shift(); // first line is probably cut in half
    return { lines, complete: total <= len };
  } finally {
    closeSync(fd);
  }
}

// Last user/assistant record reduced to the few fields we are allowed to keep.
// opts.hint adds the raw tool input fields used to find the station; callers must not expose or keep them.
export function lastTurn(file, opts = {}) {
  for (const size of TAIL_SIZES) {
    const { lines, complete } = readTail(file, size);
    for (let i = lines.length - 1; i >= 0; i--) {
      let rec;
      try {
        rec = JSON.parse(lines[i]);
      } catch {
        continue;
      }
      if (rec.isSidechain || (rec.type !== 'user' && rec.type !== 'assistant')) continue;
      const content = rec.message?.content;
      const blocks = Array.isArray(content) ? content : [];
      const toolUse = [...blocks].reverse().find((b) => b?.type === 'tool_use');
      const model = rec.type === 'assistant' && typeof rec.message?.model === 'string' && /^[\w.:-]{1,60}$/.test(rec.message.model) ? rec.message.model : null;
      return {
        model,
        role: rec.type,
        stopReason: rec.message?.stop_reason ?? null,
        toolUse: toolUse
          ? {
              name: safeTool(toolUse.name),
              file: safeFile(toolUse.input?.file_path ?? toolUse.input?.notebook_path),
              ...(opts.hint ? { hint: { skill: toolUse.input?.skill, path: toolUse.input?.file_path ?? toolUse.input?.notebook_path, command: toolUse.input?.command } } : {}),
            }
          : null,
      };
    }
    if (complete) break;
  }
  return null;
}

// state: working | waiting. null means "no live session".
export function classify(turn, ageMs, liveMs) {
  if (ageMs > liveMs) return null;
  if (!turn) return ageMs < WORKING_MS ? { state: 'working', reason: 'unknown' } : null;
  if (turn.role === 'assistant' && turn.toolUse && turn.stopReason !== 'end_turn') {
    return ageMs < TOOL_RUNNING_MS ? { state: 'working', reason: 'tool' } : { state: 'waiting', reason: 'tool' };
  }
  if (turn.role === 'assistant' && turn.stopReason === 'end_turn') return { state: 'waiting', reason: 'turn' };
  return ageMs < WORKING_MS ? { state: 'working', reason: 'thinking' } : null;
}

function newestTranscripts(dir) {
  let names;
  try {
    names = readdirSync(dir).filter((n) => n.endsWith('.jsonl'));
  } catch {
    return [];
  }
  const files = [];
  for (const n of names) {
    try {
      files.push({ file: join(dir, n), mtimeMs: statSync(join(dir, n)).mtimeMs });
    } catch {
      // file vanished between readdir and stat
    }
  }
  return files.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

// Flattens the scan output into {id, key} targets: every room plus the repos embedded in it.
// The longest matching key wins, so "agents-deck-public" is not mistaken for a subfolder of "agents-deck".
export function sessionTargets(data) {
  const targets = [];
  for (const floor of data.floors) {
    for (const room of floor.rooms) {
      targets.push({ id: room.id, roomId: room.id, key: encodeProjectDir(room.path) });
      for (const e of room.embedded ?? []) targets.push({ id: e.id, roomId: room.id, key: encodeProjectDir(e.path), embeddedName: e.name });
    }
  }
  return targets;
}

export function scanSessions(data, config = {}, now = Date.now()) {
  const root = (config.sessions?.projectsDir ?? '~/.claude/projects').replace(/^~/, homedir());
  const liveMs = (config.sessions?.liveMinutes ?? 10) * 60_000;
  const targets = sessionTargets(data);
  const rooms = new Map(data.floors.flatMap((f) => f.rooms).filter((r) => r.stations).map((r) => [r.id, r]));
  const matchers = new Map([...rooms].map(([id, r]) => [id, buildMatcher(r)]));
  const live = {};
  let dirs;
  try {
    dirs = readdirSync(root);
  } catch {
    return { at: new Date(now).toISOString(), live };
  }
  for (const dir of dirs) {
    const match = targets
      .filter((t) => dir === t.key || dir.startsWith(t.key + '-'))
      .sort((a, b) => b.key.length - a.key.length)[0];
    if (!match) continue;
    const files = newestTranscripts(join(root, dir)).filter((f) => now - f.mtimeMs <= liveMs);
    if (!files.length) continue;
    const ageMs = now - files[0].mtimeMs;
    const turn = lastTurn(files[0].file, { hint: true });
    const verdict = classify(turn, ageMs, liveMs);
    if (!verdict) continue;
    // Which station the session is working at: the tool it just called, or the embedded repo's station.
    const room = rooms.get(match.roomId);
    let stationId = room && turn?.toolUse?.hint ? matchEvent(matchers.get(match.roomId), turn.toolUse.hint) : null;
    if (!stationId && match.embeddedName && room) stationId = room.stations.find((st) => st.repo === match.embeddedName)?.id ?? null;
    const prev = live[match.id];
    if (prev && prev.ageSec * 1000 <= ageMs) continue;
    live[match.id] = {
      ...verdict,
      roomId: match.roomId,
      stationId,
      model: turn?.model ?? null,
      tool: verdict.reason === 'tool' ? turn?.toolUse?.name ?? null : null,
      file: verdict.reason === 'tool' ? turn?.toolUse?.file ?? null : null,
      ageSec: Math.round(ageMs / 1000),
      sessions: files.length,
    };
  }
  return { at: new Date(now).toISOString(), live };
}
