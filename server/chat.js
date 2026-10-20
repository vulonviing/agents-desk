import { spawnClaude } from './claude.js';
import { runDecision } from './llm.js';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { agentDefs } from './agents.js';

// Conversations with an agent. A skill agent talks as that skill inside its project; a project agent is the
// Claude Code CLI working in the project's folder. Chats are read-only (Read/Grep/Glob/Skill): doing work
// goes through the plan and approval flow of the "Görev" tab.

export const CHAT_TOOLS = 'Read,Grep,Glob,Skill';
const MAX_MESSAGE = 2000;
const MAX_REPLY = 6000;
const MAX_HISTORY = 100;
const TIMEOUT_MS = 240_000;

const clip = (s, n) => {
  const t = String(s ?? '').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

// "roomId#key" → { roomId, key }
export function parseAgentId(id) {
  const i = String(id).indexOf('#');
  return i < 0 ? null : { roomId: id.slice(0, i), key: id.slice(i + 1) };
}

export function findAgent(room, id) {
  const p = parseAgentId(id);
  if (!p || p.roomId !== room.id) return null;
  if (p.key.startsWith('skill:')) { const station = room.stations.find(s => s.id === p.key && s.kind === 'skill'); if (station) return {kind:'skill',key:p.key,name:station.skill ?? station.name}; }
  if (p.key.startsWith('task:')) { const station = room.stations.find(s => s.id === p.key.slice(5) && s.kind !== 'skill'); return station ? { kind: 'task', key: p.key, name: station.name, station } : null; }
  if (p.key === 'project') return { kind: 'project', key: 'project', name: room.name, coordinator: true };
  return agentDefs(room).find((d) => d.key === p.key) ?? null;
}

export function chatPrompt(room, def) {
  if (def.kind === 'manager') return def.prompt;
  const common = [
    'Bu bir sohbettir: kullanıcıyla Türkçe, kısa ve doğrudan konuş.',
    'Bu oturum salt-okunurdur: dosya değiştirme, komut çalıştırma ya da ağ erişimi yok. İsteği bu koordinatör sohbetinde ele al; ayrı bir Görev sekmesine yönlendirme. Düzenleme veya komut çalıştırma gerekiyorsa salt-okunur sınırını açıkça belirt.',
    'Gizli dosyalara (.env, anahtarlar) bakma.',
  ];
  if (def.kind === 'task') return [`Sen ${room.name} ofisinin ${def.name} iş istasyonusun. Görevin: ${def.station.description ?? def.name}. Salt-okunur yanıt ver; komut veya betik çalıştırdığını iddia etme.`, ...common].join('\n');
  if (def.kind === 'skill') {
    return [
      `Sen "${room.name}" projesindeki "${def.name}" skill'isin ve bu skill'in sesiyle konuşuyorsun.`,
      `Kullanıcının mesajına önce "${def.name}" skill'inin yönergelerini (Skill aracı ya da SKILL.md) okuyarak, projenin bağlamında cevap ver.`,
      ...common,
    ].join('\n');
  }
  return [def.coordinator ? `Sen ofisin koordinatörüsün. Kullanıcının amacına uygun skill’i gerçekten Skill aracıyla çağır veya SKILL.md yönergelerini oku; yapmadığın bir işi yapmış gibi anlatma. İstasyonlar: ${(room.stations ?? []).map(s => `${s.id}: ${s.name} — ${s.description ?? ''}`).join('; ')}` : '', `Sen "${room.name}" projesinin ajanısın; çalışma klasörün bu projedir ve projenin AGENTS.md / CLAUDE.md kuralları geçerlidir.`, ...common].join('\n');
}

export function chatArgs(room, def, sessionId) {
  return [
    '-p', '--output-format', 'json', '--restricted', '--tools', def.kind === 'manager' ? '' : CHAT_TOOLS, '--permission-prompts', 'none', '--strict-mcp-config',
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

function skillContract(room, station) {
  if (!station.skill || !/^[\w.-]+$/.test(station.skill)) return station.description ?? '';
  for (const root of ['.agents', '.claude']) try {
    const file = realpathSync(join(room.path, root, 'skills', station.skill, 'SKILL.md'));
    if (file.startsWith(realpathSync(room.path) + sep) && statSync(file).size <= 64_000) return readFileSync(file, 'utf8');
  } catch { /* fall back to scanned skill metadata */ }
  return station.description ?? '';
}

// In-memory chat history per agent (not written to disk; the CLI keeps its own transcript).
export function createChats({ onChange = () => {} } = {}) {
  const chats = new Map();
  const busy = new Set();
  const get = (id) => chats.get(id) ?? { sessionId: null, messages: [] };
  return {
    state: id => { const entry = [...chats.entries()].filter(([key]) => key.endsWith(`:${id}`)).sort((a,b) => Number(busy.has(b[0])) - Number(busy.has(a[0])) || (b[1].at ?? '').localeCompare(a[1].at ?? ''))[0]; const chat = entry?.[1]; return chat ? { ...chat, messages: undefined, busy: busy.has(entry[0]), provider: entry[0].split(':')[0] } : null; },
    history: (id) => ({ messages: get(id).messages, busy: busy.has(id) }),
    reset: (id) => chats.delete(id),
    async send(room, def, id, message, provider = 'claude', { resumeSessionId } = {}) {
      if (busy.has(id)) throw Object.assign(new Error('Bu ajan hâlâ bir önceki mesajı cevaplıyor.'), { status: 409 });
      const text = String(message ?? '').trim();
      if (text.length < 1 || text.length > MAX_MESSAGE) throw Object.assign(new Error(`Mesaj 1 ile ${MAX_MESSAGE} karakter arasında olmalı.`), { status: 400 });
      busy.add(id);
      const chat = get(id);
      if (resumeSessionId) chat.sessionId = resumeSessionId;
      chat.at = new Date().toISOString(); chat.task = text; chat.stationId = null;
      chats.set(id, chat);
      onChange({ id, roomId: room.id, provider, phase: 'started' });
      const push = (role, t) => chat.messages.push({ role, text: t, at: new Date().toISOString() });
      push('user', text);
      try {
        let reply, sessionId = chat.sessionId;
        if (provider === 'claude') {
          ({ reply, sessionId } = await runChat(room, def, text, chat.sessionId));
        } else {
          const schema = { type: 'object', properties: { reply: { type: 'string' }, ...(def.coordinator ? { stationId: { type: 'string' } } : {}) }, required: ['reply', ...(def.coordinator ? ['stationId'] : [])] };
          const opts = { provider, cwd: room.path, persist: !!def.coordinator, sessionId: def.coordinator ? chat.sessionId : null, onSession: value => { if (!def.coordinator) return; chat.sessionId = sessionId = value; onChange({ id, roomId: room.id, provider, phase: 'session' }); } };
          const metadata = `${room.readmeSummary ?? ''}\n${(room.stations ?? []).map(s => `${s.id}: ${s.name} — ${s.description ?? ''}`).join('\n')}`;
          const answer = await runDecision(`${chatPrompt(room, def)}\nProje bağlamı:\n${metadata}\nAraçların kapalı. Dosyaları okuduğunu veya komut çalıştırdığını iddia etme.${def.coordinator ? ' İş için uygun skill varsa stationId alanına onun kimliğini yaz; aksi halde boş bırak. Skill çağrısını uygulama bir sonraki gerçek CLI turunda yapacak.' : ''}`, JSON.stringify(chat.messages.slice(-20)), schema, opts);
          reply = answer.reply;
          // an empty or unknown skill id is not an error: the coordinator simply answers in the chat
          const station = def.coordinator && answer.stationId ? room.stations.find(s => s.id === answer.stationId) : null;
          if (station) {
            if (room.id === 'emrecan-vps') throw new Error('Bu ofiste iş yönlendirme kapalı.');
            chat.stationId = station.id;
            onChange({ id, roomId: room.id, provider, phase: 'delegation', stationId: station.id });
            const result = await runDecision(`Sen ${room.name} ofisinde ${station.name} uzmanısın. Salt-okunur çalış; yalnızca verilen bağlamla yanıt ver. Araç kullanma, dosyaları okuduğunu iddia etme.\nSkill yönergeleri:\n${skillContract(room, station)}\nProje bağlamı:\n${metadata}`, text, { type: 'object', properties: { reply: { type: 'string' } }, required: ['reply'] }, { ...opts, sessionId });
            reply = `${station.name}:\n${result.reply}`;
          }
        }
        chat.sessionId = sessionId;
        push('assistant', reply);
      } catch (err) {
        push('error', err.message);
        throw Object.assign(err, { status: 502 });
      } finally {
        chat.messages = chat.messages.slice(-MAX_HISTORY);
        chats.set(id, chat);
        busy.delete(id);
        onChange({ id, roomId: room.id, provider, phase: 'completed', ok: chat.messages.at(-1)?.role !== 'error' });
      }
      return chat.messages;
    },
  };
}
