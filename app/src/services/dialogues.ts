import { getJson } from './api';

// Ambient dialogue pools (see the office-dialogues skill): one fetch per office, lines are picked locally with a cooldown,
// so talking costs no model call. The server refills pools rarely with a small model; here we only read them.

export type LineKind = 'coffee' | 'water' | 'window' | 'news' | 'visit' | 'desk';
export interface DialogueSource { kind: 'news' | 'weather'; publisher: string; url: string; publishedAt: number; expiresAt: number }
export interface Line { kind: LineKind; text: string; reply?: string; followUp?: string; answer?: string; who?: string; concept?: string; source?: DialogueSource }
interface Pool { lines: Line[]; loadedAt: number; loading: boolean; refreshing: boolean; recent: string[]; lastAt: Map<string, number>; timer?: ReturnType<typeof setTimeout>; polls: number }

const RELOAD_MS = 10 * 60_000;
const FALLBACK: Line[] = [
  { kind: 'coffee', text: 'Kahvenin kokusu koridora kadar geliyor.' }, { kind: 'water', text: 'Bir bardak su, sonra devam.' },
  { kind: 'window', text: 'Şu köşeye bir okuma koltuğu yakışırdı.' }, { kind: 'news', text: 'Bugünün haberlerine bir göz atayım.' },
  { kind: 'desk', text: 'Yarın için not alayım.' },
];

const pools = new Map<string, Pool>();
// the same text is never repeated anywhere in the building for a while (offices share generic lines)
const spokenAt = new Map<string, number>();
const GLOBAL_REPEAT_MS = 10 * 60_000;
const pool = (id: string): Pool => {
  let p = pools.get(id);
  if (!p) { p = { lines: FALLBACK, loadedAt: 0, loading: false, refreshing: false, recent: [], lastAt: new Map(), polls: 0 }; pools.set(id, p); }
  return p;
};

/** Loads (or reloads, after a while) the pool of an office. Never throws: the built-in lines stay in use. */
export async function ensurePool(officeId: string, fetcher: (path: string) => Promise<{ lines: Line[]; refreshing?: boolean }> = getJson, now = Date.now()) {
  const p = pool(officeId);
  if (p.loading || (p.loadedAt && now - p.loadedAt < RELOAD_MS)) return;
  p.loading = true;
  try {
    const r = await fetcher(officeId.startsWith('floor:') ? `/api/dialogues?floor=${encodeURIComponent(officeId.slice(6))}` : `/api/dialogues?office=${encodeURIComponent(officeId)}`);
    if (Array.isArray(r.lines) && r.lines.length) p.lines = r.lines;
    p.refreshing = !!r.refreshing;
    p.loadedAt = now;
    // a refill was started on the server: look again shortly (at most a few times)
    if (p.refreshing && p.polls < 4) { p.polls++; p.timer = setTimeout(() => { p.loadedAt = 0; void ensurePool(officeId, fetcher); }, 20_000); }
    else if (!p.refreshing) p.polls = 0;
  } catch {
    p.loadedAt = now - RELOAD_MS + 30_000; // retry in 30 s
  } finally {
    p.loading = false;
  }
}

const fill = (t: string) => t.replace(/\s*\{(?:name|other)\},?\s*/g, ' ').replace(/\s+([,.!?])/g,'$1').trim();

/** One line of the given kind for an office: not one of the last dozen used, preferring lines written for this agent. */
export function pickLine(officeId: string, kind: LineKind, who: string, _other: string | undefined, rng: () => number, now = Date.now(), sourcedOnly = false): { text: string; reply?: string; followUp?: string; answer?: string; concept?: string; source?: DialogueSource } | null {
  const p = pool(officeId);
  void ensurePool(officeId);
  const all = p.lines.filter((l) => l.kind === kind && (sourcedOnly ? !!l.source : !l.source || true) && (!sourcedOnly || !!l.source) && (!l.source || l.source.expiresAt > now) && (!l.who || l.who === who) && now - (p.lastAt.get(l.text) ?? -Infinity) >= 60_000 && now - (spokenAt.get(l.text) ?? -Infinity) >= GLOBAL_REPEAT_MS);
  const fresh = all.filter((l) => !p.recent.includes(l.text));
  const own = fresh.filter((l) => l.who && l.who === who);
  const candidates = own.length && rng() < 0.6 ? own : fresh.filter((l) => !l.who || l.who === who);
  const list = candidates.length ? candidates : all.slice().sort((a, b) => p.recent.indexOf(a.text) - p.recent.indexOf(b.text)).slice(0, 1);
  if (!list.length) return null;
  const line = list[Math.floor(rng() * list.length)]!;
  p.recent = p.recent.filter(t => t !== line.text);
  p.recent.push(line.text);
  p.lastAt.set(line.text, now);
  spokenAt.set(line.text, now);
  if (spokenAt.size > 600) for (const [text, at] of spokenAt) if (now - at >= GLOBAL_REPEAT_MS) spokenAt.delete(text);
  if (p.lastAt.size > 480) for (const [text, at] of p.lastAt) if (now - at >= 60_000) p.lastAt.delete(text);
  if (p.recent.length > 12) p.recent.shift();
  return { source: line.source, concept: line.concept, followUp: line.followUp ? fill(line.followUp) : undefined, answer: line.answer ? fill(line.answer) : undefined, text: fill(line.text), reply: line.reply ? fill(line.reply) : undefined };
}

export const resetDialogues = () => { spokenAt.clear(); for (const p of pools.values()) if (p.timer) clearTimeout(p.timer); pools.clear(); };

/** Server push makes a completed slow refill visible immediately, without persistent polling. */
export async function refreshLoadedPool(id: string, fetcher = getJson<{lines: Line[]; refreshing?: boolean}>) {
  const p = pools.get(id); if (!p) return;
  if (p.timer) clearTimeout(p.timer);
  p.loadedAt = 0; p.polls = 0;
  await ensurePool(id, fetcher);
}
