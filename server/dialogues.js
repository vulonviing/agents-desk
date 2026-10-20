// Ambient office dialogue: a POOL of short lines per office that characters pull from while they take coffee, read the
// news, look out of the window or chat. The pool is refilled rarely by a small model (Haiku), never per line, so ambient
// talk costs a few hundred tokens per office per day. Lines are mundane office life flavoured by the roles in the office;
// they never claim real work and never contain chat/transcript text (AGENTS.md: ambient life is not CLI work).
//
// Flow: GET /api/dialogues?office=ID returns the pool at once (built-in lines first) and, when the pool is stale and the
// daily budget allows, starts ONE background refresh. Everything is bounded and validated; no CLI → built-in lines.
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';

export const KINDS = ['coffee', 'water', 'window', 'news', 'visit', 'desk'];
const MAX_TEXT = 80;
const DEFAULTS = { enabled: true, model: 'haiku', refreshHours: 12, maxCallsPerDay: 10, linesPerRefresh: 36, poolMax: 120 };

export const SCHEMA = {
  type: 'object',
  properties: {
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: { kind: { type: 'string' }, text: { type: 'string' }, reply: { type: 'string' }, who: { type: 'string' } },
        required: ['kind', 'text'],
      },
    },
  },
  required: ['lines'],
};

// Built-in pool: works with no CLI and no network. {name} is the speaker's name, {other} the listener's.
export const BUILTIN = [
  { kind: 'coffee', text: 'Bir kahve molası iyi gelir.' },
  { kind: 'coffee', text: 'Filtre kahve mi, bugün sütlü mü?' },
  { kind: 'coffee', text: 'Kahve bitmiş, yenisini koyayım.' },
  { kind: 'coffee', text: 'İkinci kahve; kimse saymasın.' },
  { kind: 'water', text: 'Bir bardak su, sonra devam.' },
  { kind: 'water', text: 'Sebil yine boşalmış, ben değiştiririm.' },
  { kind: 'window', text: 'Dışarıda hava ne güzel.' },
  { kind: 'window', text: 'Bulutlar bugün çok hızlı geçiyor.' },
  { kind: 'window', text: 'Gözümü biraz dinlendireyim.' },
  { kind: 'news', text: 'Bugünün haberlerine bir göz atayım.' },
  { kind: 'news', text: 'Teknoloji haberlerinde yine yapay zekâ var.' },
  { kind: 'news', text: 'Hava durumuna bakıyorum, yağmur var mı?' },
  { kind: 'visit', text: '{other}, bir dakikan var mı?', reply: 'Tabii {name}, buyur.' },
  { kind: 'visit', text: 'Kahveye geliyor musun {other}?', reply: 'Olur, biraz soluklanalım.' },
  { kind: 'visit', text: '{other}, sence bugün sakin mi geçer?', reply: 'Umarım {name}, umarım.' },
  { kind: 'desk', text: 'Masam bugün biraz dağınık.' },
  { kind: 'desk', text: 'Sandalyeyi biraz yükseltsem mi?' },
  { kind: 'desk', text: 'Yarın için not alayım.' },
];

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const norm = (t) => String(t).toLocaleLowerCase('tr').replace(/[^\p{L}\p{N} ]/gu, '').trim();

// Keeps only safe, short, single-line lines of a known kind. No URLs, markdown, mentions, emails or digits-heavy strings.
export function validateLines(raw, { max = 60 } = {}) {
  const seen = new Set();
  const out = [];
  for (const l of Array.isArray(raw) ? raw : []) {
    const kind = String(l?.kind ?? '').trim();
    const text = clip(l?.text, MAX_TEXT + 1);
    const reply = l?.reply ? clip(l.reply, MAX_TEXT + 1) : '';
    const bad = (t) => !t || t.length > MAX_TEXT || /https?:|www\.|@|`|\*\*|[<>{}]\s*[a-z]|\bhttp/i.test(t.replace(/\{(name|other)\}/g, ''));
    if (!KINDS.includes(kind) || bad(text) || (reply && bad(reply))) continue;
    if (kind === 'visit' && !reply) continue; // a visit is a two-line exchange
    const key = norm(text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind, text, ...(reply ? { reply } : {}), ...(l?.who ? { who: clip(l.who, 60) } : {}) });
    if (out.length >= max) break;
  }
  return out;
}

export function createDialogues({ dataDir, config = () => ({}), run, now = () => Date.now(), onChange = () => {} }) {
  const dir = join(dataDir, 'dialogues');
  const cfg = () => ({ ...DEFAULTS, ...(config()?.dialogues ?? {}) });
  const pools = new Map(); // officeId → { updatedAt, lines, source }
  const refreshing = new Set();
  const usage = { day: '', calls: 0, inChars: 0, outChars: 0 };
  const day = () => new Date(now()).toISOString().slice(0, 10);

  const file = (id) => join(dir, `${String(id).replace(/[^\w.-]/g, '_')}.json`);
  const load = (id) => {
    if (pools.has(id)) return pools.get(id);
    let pool = { updatedAt: 0, lines: [], source: 'builtin' };
    try {
      const saved = JSON.parse(readFileSync(file(id), 'utf8'));
      pool = { updatedAt: Number(saved.updatedAt) || 0, lines: validateLines(saved.lines, { max: 200 }), source: 'cache' };
    } catch { /* no cache yet */ }
    pools.set(id, pool);
    return pool;
  };
  const save = (id, pool) => {
    try {
      mkdirSync(dir, { recursive: true });
      const tmp = `${file(id)}.tmp`;
      writeFileSync(tmp, JSON.stringify({ updatedAt: pool.updatedAt, lines: pool.lines }), { mode: 0o600 });
      renameSync(tmp, file(id));
    } catch { /* the pool still works from memory */ }
  };
  const budgetLeft = () => {
    if (usage.day !== day()) Object.assign(usage, { day: day(), calls: 0, inChars: 0, outChars: 0 });
    return usage.calls < cfg().maxCallsPerDay;
  };
  const stale = (pool) => now() - pool.updatedAt > cfg().refreshHours * 3_600_000;

  // What the model sees: the office, its roles and (names only) what was touched lately. Never prompts, chat or file contents.
  function promptFor(office) {
    const roles = office.agents.slice(0, 10).map((a) => `- ${a.name}: ${clip(a.mission, 110)}`).join('\n');
    const recent = office.recent.slice(0, 3).join(', ') || 'yok';
    return {
      system: [
        'Bir ofis simülasyonunun karakterleri için kısa, günlük ofis sohbeti satırları yaz. Türkçe, sıcak, hafif esprili.',
        'Satırlar mola ve ofis yaşamıyla ilgili: kahve, su, pencereden bakmak, haber okumak, masa başı mırıldanmak ve iki kişinin kısa konuşması.',
        'Rollerin ruhunu yansıt ama GERÇEK iş yaptığını, dosya, komut ya da sonuç raporladığını ASLA söyleme. Gerçek kişi adı, link, e-posta, sayı listesi yazma.',
        `En fazla ${MAX_TEXT} karakter. kind: ${KINDS.join(' | ')}. "visit" satırlarında text ilk kişinin sözü, reply karşıdakinin cevabı; {name} konuşanın, {other} karşıdakinin adı yerine geçer.`,
        'Yalnız JSON ver.',
      ].join('\n'),
      input: `Ofis: ${office.name} (${office.floor})\nRoller:\n${roles}\nSon dokunulan alanlar: ${recent}\nİstenen satır sayısı: ${cfg().linesPerRefresh}, kind\'lara dengeli dağıt.`,
    };
  }

  async function refresh(id, office) {
    const c = cfg();
    if (!c.enabled || !run || refreshing.has(id) || !budgetLeft()) return false;
    refreshing.add(id);
    usage.calls++;
    try {
      const { system, input } = promptFor(office);
      usage.inChars += system.length + input.length;
      const raw = await run(system, input, SCHEMA, { model: c.model });
      usage.outChars += JSON.stringify(raw ?? '').length;
      const fresh = validateLines(raw?.lines, { max: c.linesPerRefresh });
      if (!fresh.length) return false;
      const pool = load(id);
      // newest lines first, older ones kept until the pool is full; duplicates dropped
      pool.lines = validateLines([...fresh, ...pool.lines], { max: c.poolMax });
      pool.updatedAt = now();
      pool.source = 'haiku';
      save(id, pool);
      onChange(id);
      return true;
    } catch (err) {
      if (process.env.DESK_DEBUG_DIALOGUES) console.error('dialogue refill failed:', err.message);
      return false;
    } finally {
      refreshing.delete(id);
    }
  }

  return {
    // The pool for an office: model lines (when any) plus the built-in ones; starts a background refresh when stale.
    get(id, office) {
      const pool = load(id);
      if (office && stale(pool) && !refreshing.has(id)) void refresh(id, office);
      return { office: id, source: pool.source, updatedAt: pool.updatedAt || null, refreshing: refreshing.has(id), lines: [...pool.lines, ...BUILTIN] };
    },
    refresh,
    status: () => ({ ...cfg(), usage: { ...usage }, pools: [...pools.entries()].map(([id, p]) => ({ id, lines: p.lines.length, updatedAt: p.updatedAt || null })), refreshing: [...refreshing] }),
    exists: (id) => existsSync(file(id)),
  };
}
