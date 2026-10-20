import { getJson } from './api';

// Ambient dialogue pools (see the office-dialogues skill): one fetch per office, lines are picked locally with a cooldown,
// so talking costs no model call. The server refills pools rarely with a small model; here we only read them.

export type LineKind = 'coffee' | 'water' | 'window' | 'news' | 'visit' | 'desk';
export interface Line { kind: LineKind; text: string; reply?: string; who?: string }
interface Pool { lines: Line[]; loadedAt: number; loading: boolean; refreshing: boolean; recent: string[] }

const RELOAD_MS = 10 * 60_000;
const FALLBACK: Line[] = [
  { kind: 'coffee', text: 'Bir kahve molası iyi gelir.' }, { kind: 'water', text: 'Bir bardak su, sonra devam.' },
  { kind: 'window', text: 'Dışarıda hava ne güzel.' }, { kind: 'news', text: 'Bugünün haberlerine bir göz atayım.' },
  { kind: 'visit', text: '{other}, bir dakikan var mı?', reply: 'Tabii {name}, buyur.' }, { kind: 'desk', text: 'Yarın için not alayım.' },
];

const pools = new Map<string, Pool>();
const pool = (id: string): Pool => {
  let p = pools.get(id);
  if (!p) { p = { lines: FALLBACK, loadedAt: 0, loading: false, refreshing: false, recent: [] }; pools.set(id, p); }
  return p;
};

/** Loads (or reloads, after a while) the pool of an office. Never throws: the built-in lines stay in use. */
export async function ensurePool(officeId: string, fetcher: (path: string) => Promise<{ lines: Line[]; refreshing?: boolean }> = getJson, now = Date.now()) {
  const p = pool(officeId);
  if (p.loading || (p.loadedAt && now - p.loadedAt < RELOAD_MS && !p.refreshing)) return;
  p.loading = true;
  try {
    const r = await fetcher(`/api/dialogues?office=${encodeURIComponent(officeId)}`);
    if (Array.isArray(r.lines) && r.lines.length) p.lines = r.lines;
    p.refreshing = !!r.refreshing;
    p.loadedAt = now;
    // a refill was started on the server: look again shortly (at most a few times)
    if (p.refreshing) setTimeout(() => { p.loadedAt = 0; void ensurePool(officeId, fetcher); }, 20_000);
  } catch {
    p.loadedAt = now - RELOAD_MS + 30_000; // retry in 30 s
  } finally {
    p.loading = false;
  }
}

const short = (name: string) => (name.length > 16 ? `${name.slice(0, 15)}…` : name);
const fill = (t: string, name: string, other?: string) => t.replaceAll('{name}', short(name)).replaceAll('{other}', other ? short(other) : 'arkadaş');

/** One line of the given kind for an office: not one of the last dozen used, preferring lines written for this agent. */
export function pickLine(officeId: string, kind: LineKind, who: string, other: string | undefined, rng: () => number): { text: string; reply?: string } | null {
  const p = pool(officeId);
  void ensurePool(officeId);
  const all = p.lines.filter((l) => l.kind === kind);
  const fresh = all.filter((l) => !p.recent.includes(l.text));
  const own = fresh.filter((l) => l.who && l.who === who);
  const candidates = own.length && rng() < 0.6 ? own : fresh.filter((l) => !l.who || l.who === who);
  const list = candidates.length ? candidates : all;
  if (!list.length) return null;
  const line = list[Math.floor(rng() * list.length)]!;
  p.recent.push(line.text);
  if (p.recent.length > 12) p.recent.shift();
  return { text: fill(line.text, who, other), reply: line.reply ? fill(line.reply, who, other) : undefined };
}

export const resetDialogues = () => pools.clear();
