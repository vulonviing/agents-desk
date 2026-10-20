import { closeSync, lstatSync, openSync, readSync, readdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { buildMatcher, matchEvent } from './stations.js';
import { encodeProjectDir } from './sessions.js';

// Passive, best-effort adapters for local CLI logs, not a conversation reader. Keep metadata only.
// Unknown/code-mode tools remain project activity: never execute or regex-interpret their JavaScript.
const LIMIT = 2 * 1024 * 1024;
const RECENT = 120_000;
const safeTool = name => typeof name === 'string' && /^[\w.:-]{1,60}$/.test(name) ? name : 'tool';
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 20);
const under = (path, root) => path === root || path.startsWith(root + sep);
const expand = path => resolve(path.replace(/^~/, homedir()));

function filesIn(root, depth, now, budget = { dirs: 0 }) {
  const files = [];
  const visit = (dir, left) => {
    if (++budget.dirs > 250) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries.sort((a, b) => b.name.localeCompare(a.name))) {
      if (e.isSymbolicLink()) continue;
      const path = join(dir, e.name);
      if (e.isDirectory() && left) visit(path, left - 1);
      else if (e.isFile() && e.name.endsWith('.jsonl')) {
        try { const st = lstatSync(path); if (now - st.mtimeMs < RECENT * 5 && under(realpathSync(path), root)) files.push({ path, modified: st.mtimeMs }); } catch { /* disappearing log */ }
      }
    }
  };
  visit(root, depth);
  return files.sort((a, b) => b.modified - a.modified).slice(0, 60);
}

function chunk(file, offset, max = LIMIT) {
  const fd = openSync(file, 'r');
  try {
    const size = lstatSync(file).size;
    const buffer = Buffer.alloc(Math.max(0, Math.min(max, size - offset)));
    const n = readSync(fd, buffer, 0, buffer.length, offset);
    return { text: buffer.subarray(0, n).toString('utf8'), end: offset + n, size };
  } finally { closeSync(fd); }
}

function artifact(room, path, cwd) {
  if (typeof path !== 'string') return null;
  const full = isAbsolute(path) ? resolve(path) : resolve(cwd || room.path, path);
  if (!under(full, room.path)) return null;
  const rel = relative(room.path, full);
  if (/(^|\/)(?:\.env[^/]*|\.git|\.ssh|node_modules|credentials?[^/]*|secrets?[^/]*|auth[^/]*)(\/|$)|\.(?:pem|key|p12)$/i.test(rel)) return null;
  const name = basename(full).replace(/[^\p{L}\p{N}._ -]/gu, '').slice(0, 60);
  return name ? { key: hash(`${room.id}:${rel}`), name } : null;
}

export function createObserver() {
  const instance = randomUUID();
  const logs = new Map(), artifacts = new Map();
  let events = [], sequence = 0, memoAt = 0, memo = null, initialized = false;
  const publish = event => events.push({ ...event, id: `observation:${instance}:${++sequence}` });

  const consume = (record, entry, rooms, now, warmup) => {
    const p = record.payload ?? {};
    const ts = Date.parse(record.timestamp ?? '');
    if (!Number.isFinite(ts) || ts > now + 5000) return;
    if (entry.provider === 'codex' && (record.type === 'session_meta' || record.type === 'turn_context')) {
      if (record.type === 'session_meta') entry.openedAt = ts;
      if (record.type === 'session_meta' && typeof p.id === 'string' && /^[\da-f-]{36}$/i.test(p.id)) entry.cliSessionId = p.id;
      if (typeof p.cwd === 'string') entry.cwd = resolve(p.cwd);
      if (typeof p.model === 'string' && /^[\w.:-]{1,60}$/.test(p.model)) entry.model = p.model;
      const room = rooms.filter(r => under(entry.cwd ?? '', r.path)).sort((a, b) => b.path.length - a.path.length)[0] ?? null;
      if (entry.room?.id !== room?.id) { entry.stationId = null; entry.pending.clear(); }
      entry.room = room;
      if (record.type === 'session_meta') {
        if (room && now - ts <= 600_000) entry.last = { at: ts, roomId: room.id, stationId: null, provider: entry.provider, model: entry.model ?? null, tool: null, file: null, state: 'waiting', reason: 'opened' };
        return;
      }
    }
    const room = entry.room;
    if (!room) return;
    const matcher = buildMatcher(room);
    const recent = now - ts <= RECENT;
    const touch = (tool = null, file = null) => {
      if (!recent) return;
      entry.last = { at: ts, roomId: room.id, stationId: entry.stationId, provider: entry.provider, model: entry.model ?? null, tool, file, state: 'working', reason: tool ? 'tool' : 'thinking' };
    };
    const complete = (id, success) => {
      const call = entry.pending.get(id);
      entry.pending.delete(id);
      if (!call || !success || !call.artifact || !call.stationId || now - ts > RECENT) return;
      const key = call.artifact.key;
      if (call.kind === 'write') artifacts.set(key, { roomId: room.id, stationId: call.stationId, at: ts });
      if (call.kind === 'read') {
        const writer = artifacts.get(key);
        if (!writer || writer.stationId === call.stationId || ts < writer.at || ts - writer.at > 600_000) return;
        if (!warmup) publish({ sessionId: entry.id, kind: 'handoff', at: new Date(ts).toISOString(), roomId: room.id, provider: entry.provider, from: writer.stationId, to: call.stationId, file: call.artifact.name, tool: call.tool });
      }
    };
    const call = (name, input, id) => {
      const tool = safeTool(name);
      const rawPath = input.file_path ?? input.notebook_path;
      const path = typeof rawPath === 'string' ? resolve(entry.cwd || room.path, rawPath) : null;
      const skillRead = path?.match(/\.(?:agents|claude)\/skills\/([^/]+)\/SKILL\.md$/);
      const explicit = typeof input.skill === 'string' ? matchEvent(matcher, { skill: input.skill }) : skillRead ? matchEvent(matcher, { skill: skillRead[1] }) : null;
      const command = input.command ?? input.cmd;
      const detected = explicit ?? (path && !entry.stationId ? matchEvent(matcher, { path }) : typeof command === 'string' ? matchEvent(matcher, { command }) : null);
      if (detected) {
        const previous = entry.stationId;
        entry.stationId = detected;
        if (recent && !warmup && previous !== detected) publish({ sessionId: entry.id, kind: 'activation', at: new Date(ts).toISOString(), roomId: room.id, provider: entry.provider, from: previous, to: detected, tool, file: null });
      }
      const file = artifact(room, path, entry.cwd);
      touch(tool, file?.name ?? null);
      const kind = /^(Write|Edit|MultiEdit|NotebookEdit)$/.test(tool) ? 'write' : tool === 'Read' && !skillRead ? 'read' : null;
      if (id && kind && file) entry.pending.set(id, { kind, artifact: file, stationId: entry.stationId, tool });
      while (entry.pending.size > 100) entry.pending.delete(entry.pending.keys().next().value);
    };
    if (entry.provider === 'claude') {
      if (record.isSidechain) return;
      if (record.type === 'assistant') {
        if (typeof record.message?.model === 'string' && /^[\w.:-]{1,60}$/.test(record.message.model)) entry.model = record.message.model;
        for (const b of Array.isArray(record.message?.content) ? record.message.content : []) if (b?.type === 'tool_use') call(b.name, b.input ?? {}, b.id);
        if (record.message?.stop_reason === 'end_turn' && recent) { touch(); entry.last.state = 'waiting'; entry.last.reason = 'turn'; }
      }
      if (record.type === 'user') {
        if (typeof record.message?.content === 'string' || (record.message?.content ?? []).some(b => b?.type === 'text')) entry.stationId = null;
        for (const b of Array.isArray(record.message?.content) ? record.message.content : []) if (b?.type === 'tool_result') complete(b.tool_use_id, !b.is_error);
        touch();
      }
    } else {
      if (record.type === 'event_msg' && p.type === 'task_started') entry.stationId = null;
      if (record.type === 'turn_context' || record.type === 'event_msg' && p.type === 'task_started') touch();
      if (record.type === 'event_msg' && /^(task_complete|task_aborted)$/.test(p.type) && recent) { touch(); entry.last.state = 'waiting'; entry.last.reason = 'turn'; }
      if (record.type === 'response_item' && /^(function_call|custom_tool_call)$/.test(p.type)) {
        let input = {};
        // Structured native tool arguments only. Code-mode exec input is deliberately ignored.
        if (typeof p.arguments === 'string') try { input = JSON.parse(p.arguments); } catch { /* unknown tool */ }
        call(p.name, input, p.call_id);
      }
      // Codex tool output formats vary. Do not claim successful artifact transfers without a verdict.
    }
  };

  return { resolve(id) { const entry = [...logs.values()].find(e => e.id === id); return entry?.cliSessionId ? { provider: entry.provider, sessionId: entry.cliSessionId, roomId: entry.room?.id, cwd: entry.cwd, state: entry.last?.state } : null; }, invalidate() { memo = null; }, poll(data, config = {}, now = Date.now()) {
    const bootstrapping = !initialized;
    if (config.sessions?.observeExternal === false) return { live: {}, events: [] };
    if (memo && now - memoAt < 1800 && now >= memoAt) return memo;
    memoAt = now;
    const rooms = data.floors.flatMap(f => f.rooms);
    const roots = [['claude', config.sessions?.projectsDir ?? '~/.claude/projects', 2], ['codex', config.sessions?.codexSessionsDir ?? '~/.codex/sessions', 3]];
    const seen = new Set();
    for (const [provider, value, depth] of roots) {
      if (value === false) continue;
      let root;
      try { root = realpathSync(expand(value)); } catch { continue; }
      for (const { path: file, modified } of filesIn(root, depth, now)) {
        seen.add(file);
        try {
          const size = lstatSync(file).size;
          let entry = logs.get(file), fresh = false;
          if (!entry || size < entry.offset) {
            fresh = true;
            entry = { openedAt: lstatSync(file).birthtimeMs || modified, id: `session:${hash(`${provider}:${file}`)}`, provider, offset: Math.max(0, size - LIMIT), stationId: null, pending: new Map(), room: null, cwd: null };
            if (provider === 'claude') {
              const dir = relative(root, file).split(sep)[0];
              entry.room = rooms.filter(r => [r.path, ...(r.embedded ?? []).map(e => e.path)].some(p => dir === encodeProjectDir(p) || dir.startsWith(encodeProjectDir(p) + '-'))).sort((a, b) => b.path.length - a.path.length)[0] ?? null;
              const sessionName = basename(file, '.jsonl');
              if (/^[\da-f-]{36}$/i.test(sessionName)) entry.cliSessionId = sessionName;
              entry.cwd = entry.room?.path;
              if (entry.room) entry.last = { at: Math.min(now, modified), roomId: entry.room.id, stationId: null, provider, model: null, tool: null, file: null, state: 'waiting', reason: 'opened' };
            } else {
              const header = chunk(file, 0).text.split('\n')[0];
              try { consume(JSON.parse(header), entry, rooms, now, true); } catch { /* unsupported header */ }
            }
            logs.set(file, entry);
          }
          const start = entry.offset;
          const c = chunk(file, start);
          const boundary = c.text.lastIndexOf('\n');
          const complete = boundary >= 0 ? c.text.slice(0, boundary + 1) : '';
          const lines = complete.split('\n');
          entry.offset = boundary >= 0 ? start + Buffer.byteLength(complete) : c.size - start >= LIMIT ? c.end : start;
          if (fresh && start > 0) lines.shift();
          for (const line of lines) { try { consume(JSON.parse(line), entry, rooms, now, bootstrapping); } catch { /* partial or unknown record */ } }
        } catch { logs.delete(file); }
      }
    }
    for (const [file, e] of logs) if (!seen.has(file)) logs.delete(file);
    for (const [key, value] of artifacts) if (now - value.at > 600_000) artifacts.delete(key);
    while (artifacts.size > 1000) artifacts.delete(artifacts.keys().next().value);
    events = events.filter(e => now - Date.parse(e.at) <= RECENT).slice(-80);
    const live = {}, sessions = [];
    for (const entry of logs.values()) {
      const last = entry.last;
      if (!last || now - last.at > Math.max(RECENT, (config.sessions?.liveMinutes ?? 10) * 60_000)) continue;
      const session = { ...last, id: entry.id, openedAt: entry.openedAt, ageSec: Math.max(0, Math.round((now - last.at) / 1000)), sessions: 1, state: now - last.at > RECENT || now - last.at > 30_000 && last.reason === 'tool' ? 'waiting' : last.state };
      sessions.push(session);
      if (now - last.at > RECENT) continue;
      if (live[last.roomId] && live[last.roomId].ageSec < (now - last.at) / 1000) continue;
      live[last.roomId] = { ...last, ageSec: Math.max(0, Math.round((now - last.at) / 1000)), sessions: 1, state: now - last.at > 30_000 && last.reason === 'tool' ? 'waiting' : last.state };
    }
    initialized = true;
    return memo = { live, events, sessions };
  } };
}
