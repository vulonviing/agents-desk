import { spawnClaude } from './claude.js';
import { runCodexChat } from './llm.js';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// Conversations with a coordinator (the real CLI working read-only in its project's folder). Chats are read-only (Read/Grep/Glob/Skill); the CLI keeps its own transcript and Desk only keeps the session id.

export const CHAT_TOOLS = 'Read,Grep,Glob,Skill';
const MAX_MESSAGE = 2000;
const MAX_REPLY = 6000;
const MAX_HISTORY = 100;
const TIMEOUT_MS = 240_000;

const clip = (s, n) => {
  const t = String(s ?? '').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

export function chatPrompt(room, def) {
  if (def.lang === 'en') {
    return [
      `You are the coordinator of the "${room.name}" project; your working folder is this project and its AGENTS.md / CLAUDE.md rules apply. If a skill fits the user's goal, really call it with the Skill tool or read its SKILL.md; never describe work you did not do.`,
      'This is a conversation: reply in English, short and direct.',
      'This session is read-only: do not change files, run commands or use the network. If an edit or command is needed, state the read-only limit clearly.',
      'Do not look at secret files (.env, keys).',
    ].join('\n');
  }
  return [
    `Sen "${room.name}" projesinin koordinatörüsün; çalışma klasörün bu projedir ve projenin AGENTS.md / CLAUDE.md kuralları geçerlidir. Kullanıcının amacına uygun skill varsa Skill aracıyla gerçekten çağır ya da SKILL.md yönergesini oku; yapmadığın bir işi yapmış gibi anlatma.`,
    'Bu bir sohbettir: kullanıcıyla Türkçe, kısa ve doğrudan konuş.',
    'Bu oturum salt-okunurdur: dosya değiştirme, komut çalıştırma ya da ağ erişimi yok. Düzenleme veya komut çalıştırma gerekiyorsa salt-okunur sınırını açıkça belirt.',
    'Gizli dosyalara (.env, anahtarlar) bakma.',
  ].join('\n');
}

/** Prompt of a real, read-only Codex turn (shell exists but the sandbox is read-only and offline). */
export function codexChatPrompt(room, def) {
  if (def.lang === 'en') {
    return [
      'This is a conversation: reply in English, short and direct.',
      `You are in the project folder (${room.name}). To answer, really read and search files (read-only commands such as cat, rg, ls, git log); do not guess, say where you found things. This session is read-only and offline: no writing, deleting, installing or network; say so when it matters.`,
      'Never look at secret files (.env, keys, credentials) and never write their contents.',
      "Follow the AGENTS.md of the project and the instructions under .agents/skills; if a skill fits, read its SKILL.md and answer accordingly. Never describe work you did not do.",
      `You are the coordinator of the ${room.name} office: find the right skill for the user's goal and carry the work through it.`,
    ].join('\n');
  }
  return [
    'Bu bir sohbettir: kullanıcıyla Türkçe, kısa ve doğrudan konuş.',
    `Proje klasöründesin (${room.name}). Soruyu cevaplamak için dosyaları gerçekten oku ve ara (cat, rg, ls, git log gibi salt-okunur komutlar); tahmin etme, bulduğun yeri belirt. Bu oturum salt-okunur ve ağsızdır: dosya yazma, silme, kurulum ya da ağ yok; gerekiyorsa bunun sınırını açıkça söyle.`,
    'Gizli dosyalara (.env, anahtarlar, kimlik bilgileri) asla bakma ve içeriklerini yazma.',
    'Projenin AGENTS.md dosyasındaki ve .agents/skills altındaki yönergeleri izle; uygun bir skill varsa SKILL.md yönergesini oku ve ona göre cevap ver. Yapmadığın bir işi yapmış gibi anlatma.',
    `Sen ${room.name} ofisinin koordinatörüsün: kullanıcının amacına uygun skill'i bul ve işi ona göre yürüt.`,
  ].join('\n');
}

export function chatArgs(room, def, sessionId) {
  return [
    '-p', '--output-format', 'json', '--restricted', '--tools', CHAT_TOOLS, '--permission-prompts', 'none', '--strict-mcp-config',
    '--append-system-prompt', chatPrompt(room, def),
    ...(sessionId ? ['--resume', sessionId] : []),
  ];
}

// One turn: resolves with { reply, sessionId }. The session id lets the next turn continue the conversation.
export function runChat(room, def, message, sessionId = null, { timeoutMs = TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnClaude(chatArgs(room, def, sessionId), { cwd: room.path, env: {} });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Cevap zaman aşımına uğradı.'));
    }, timeoutMs);
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (err = (err + c).slice(-1500)));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`claude başlatılamadı: ${e.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      let parsed;
      try {
        parsed = JSON.parse(out);
      } catch {
        return reject(new Error(code === 0 ? 'Cevap okunamadı.' : `claude çıkış kodu ${code}: ${clip(err, 200)}`));
      }
      if (parsed.is_error) return reject(new Error(`Hata: ${clip(parsed.result, 200)}`));
      resolve({ reply: clip(parsed.result, MAX_REPLY), sessionId: typeof parsed.session_id === 'string' ? parsed.session_id : sessionId });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(clip(message, MAX_MESSAGE));
  });
}

// In-memory chat history per agent (not written to disk; the CLI keeps its own transcript).
// sessionsFile (optional): only the CLI session ids are kept on disk (never any message text), so a server restart resumes the same
// real CLI sessions; the conversation itself stays in the CLI's own transcript.
export function createChats({ onChange = () => {}, sessionsFile = null } = {}) {
  const chats = new Map();
  const busy = new Set();
  let saved = {};
  try { if (sessionsFile && existsSync(sessionsFile)) saved = JSON.parse(readFileSync(sessionsFile, 'utf8')); } catch { saved = {}; }
  const persist = () => {
    if (!sessionsFile) return;
    try {
      const ids = Object.fromEntries([...chats.entries()].filter(([, c]) => c.sessionId && /^[A-Za-z0-9_-]{8,80}$/.test(c.sessionId)).map(([k, c]) => [k, c.sessionId]));
      saved = { ...saved, ...ids };
      for (const k of Object.keys(saved)) if (chats.has(k) && !chats.get(k).sessionId) delete saved[k]; // a reset chat forgets its session
      mkdirSync(dirname(sessionsFile), { recursive: true });
      writeFileSync(sessionsFile + '.tmp', JSON.stringify(saved), { mode: 0o600 });
      renameSync(sessionsFile + '.tmp', sessionsFile);
    } catch { /* sessions still work from memory */ }
  };
  const get = (id) => chats.get(id) ?? { sessionId: typeof saved[id] === 'string' ? saved[id] : null, messages: [] };
  return {
    state: id => { const entry = [...chats.entries()].filter(([key]) => key.endsWith(`:${id}`)).sort((a,b) => Number(busy.has(b[0])) - Number(busy.has(a[0])) || (b[1].at ?? '').localeCompare(a[1].at ?? ''))[0]; const chat = entry?.[1]; if (!chat) { const k = Object.keys(saved).find(key => key.endsWith(`:${id}`)); return k ? { sessionId: saved[k], messages: undefined, busy: false, provider: k.split(':')[0] } : null; } return chat ? { ...chat, messages: undefined, busy: busy.has(entry[0]), provider: entry[0].split(':')[0] } : null; },
    history: (id) => ({ messages: get(id).messages, busy: busy.has(id) }),
    reset: (id) => { chats.delete(id); delete saved[id]; persist(); },
    async send(room, def, id, message, provider = 'claude', { resumeSessionId, onEvent = () => {} } = {}) {
      if (busy.has(id)) throw Object.assign(new Error('Bu ajan hâlâ bir önceki mesajı cevaplıyor.'), { status: 409 });
      const text = String(message ?? '').trim();
      if (text.length < 1 || text.length > MAX_MESSAGE) throw Object.assign(new Error(`Mesaj 1 ile ${MAX_MESSAGE} karakter arasında olmalı.`), { status: 400 });
      busy.add(id);
      const chat = get(id);
      if (resumeSessionId) chat.sessionId = resumeSessionId;
      chat.at = new Date().toISOString();
      chats.set(id, chat);
      onChange({ id, provider, phase: 'started' });
      const push = (role, t) => chat.messages.push({ role, text: t, at: new Date().toISOString() });
      push('user', text);
      try {
        let reply, sessionId = chat.sessionId;
        if (provider === 'claude') {
          onEvent({ kind: 'status', text: `claude -p ${chat.sessionId ? '--resume ' : ''}· araçlar salt-okunur` });
          ({ reply, sessionId } = await runChat(room, def, text, chat.sessionId));
          onEvent({ kind: 'output', text: reply });
        } else {
          // a real read-only Codex session in the project folder (reads files, follows the project's AGENTS.md/skills, resumes its thread)
          ({ reply, sessionId } = await runCodexChat(codexChatPrompt(room, def), text, { cwd: room.path, sessionId: chat.sessionId, persist: true, onEvent }));
        }
        chat.sessionId = sessionId;
        push('assistant', reply);
        chats.set(id, chat); persist();
      } catch (err) {
        push('error', err.message);
        onEvent({ kind: 'error', text: err.message });
        throw Object.assign(err, { status: 502 });
      } finally {
        chat.messages = chat.messages.slice(-MAX_HISTORY);
        chats.set(id, chat);
        busy.delete(id);
        onChange({ id, provider, phase: 'completed', ok: chat.messages.at(-1)?.role !== 'error' });
      }
      return chat.messages;
    },
  };
}
