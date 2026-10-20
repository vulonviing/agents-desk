import { createReadStream, readdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, sep } from 'node:path';
import { createInterface } from 'node:readline';
import { roomDirs } from '../scanner/activity.js';

// Reading conversations back (the "Oturumlar" tab). This shows message text, so it is only reachable from
// the local page, only on request, and nothing here is cached or written to disk.

const MAX_SESSIONS = 30;
const MAX_MESSAGES = 200;
const MAX_TEXT = 4000;
const ID = /^[A-Za-z0-9._-]{8,80}$/;

const clip = (s, n) => {
  const t = String(s ?? '').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

const projectsRoot = (config) => (config.sessions?.projectsDir ?? '~/.claude/projects').replace(/^~/, homedir());

function dirsOf(room, config) {
  const root = projectsRoot(config);
  let all = [];
  try {
    all = readdirSync(root);
  } catch {
    return { root, dirs: [] };
  }
  return { root, dirs: roomDirs(room, root, all) };
}

const textOf = (content) => {
  if (typeof content === 'string') return content;
  return (Array.isArray(content) ? content : []).filter((b) => b?.type === 'text').map((b) => b.text).join('\n');
};

// System wrappers (slash command markup, injected reminders) are noise in a conversation view.
const cleanUserText = (t) => t.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').replace(/<command-[a-z]+>[\s\S]*?<\/command-[a-z]+>/g, '').trim();

async function* records(file, { maxLines = Infinity } = {}) {
  const rl = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  let n = 0;
  for await (const line of rl) {
    if (n++ >= maxLines) break;
    if (line.length > 2_000_000) continue;
    try {
      yield JSON.parse(line);
    } catch {
      // half-written or garbage line
    }
  }
}

async function preview(file) {
  for await (const rec of records(file, { maxLines: 200 })) {
    if (rec.type !== 'user' || rec.isSidechain || rec.isMeta) continue;
    const t = cleanUserText(textOf(rec.message?.content));
    if (t) return clip(t.replace(/\s+/g, ' '), 100);
  }
  return '';
}

export async function listSessions(room, config) {
  const { dirs } = dirsOf(room, config);
  const files = [];
  for (const dir of dirs) {
    let names;
    try {
      names = readdirSync(dir).filter((n) => n.endsWith('.jsonl'));
    } catch {
      continue;
    }
    for (const n of names) {
      try {
        const st = statSync(join(dir, n));
        files.push({ file: join(dir, n), id: n.slice(0, -6), lastAt: st.mtime.toISOString(), size: st.size });
      } catch {
        // vanished
      }
    }
  }
  files.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  const top = files.slice(0, MAX_SESSIONS);
  return Promise.all(top.map(async ({ file, ...rest }) => ({ ...rest, preview: await preview(file) })));
}

export async function readConversation(room, sessionId, config) {
  if (!ID.test(sessionId)) return null;
  const { root, dirs } = dirsOf(room, config);
  const base = realpathSync(root);
  for (const dir of dirs) {
    let file;
    try {
      file = realpathSync(join(dir, `${sessionId}.jsonl`));
    } catch {
      continue;
    }
    if (!file.startsWith(base + sep)) continue; // a symlink pointing out of the projects folder
    const messages = [];
    for await (const rec of records(file)) {
      if (rec.isSidechain || rec.isMeta || (rec.type !== 'user' && rec.type !== 'assistant')) continue;
      const content = rec.message?.content;
      const text = rec.type === 'user' ? cleanUserText(textOf(content)) : textOf(content).trim();
      const tools = rec.type === 'assistant'
        ? (Array.isArray(content) ? content : []).filter((b) => b?.type === 'tool_use').map((b) => ({ name: String(b.name).slice(0, 40), file: b.input?.file_path ? basename(String(b.input.file_path)) : null }))
        : [];
      if (!text && !tools.length) continue;
      messages.push({ role: rec.type, ts: rec.timestamp ?? null, text: clip(text, MAX_TEXT), tools });
    }
    const truncated = messages.length > MAX_MESSAGES;
    return { id: sessionId, truncated, total: messages.length, messages: messages.slice(-MAX_MESSAGES) };
  }
  return null;
}
