// Subscription usage percentages (Claude Code, Codex, Antigravity) as the user's Agents Deck menu-bar app last saw them.
// Read-only: only the "latest usage" rows of Agents Deck's local history store are queried with the system sqlite3, and only
// the used percentage of one window per provider is kept. Nothing is written, no account or token is touched.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const STORE = process.env.DESK_AGENTS_DECK_STORE || join(homedir(), 'Library', 'Application Support', 'Agents Deck', 'History', 'History.store');
const APPLE_EPOCH_MS = 978_307_200_000; // Agents Deck stores times as seconds since 2001-01-01
const TTL_MS = 20_000;

// Swift encodes dictionaries as [key, value, key, value, …]
const pairs = (list) => { const out = {}; if (Array.isArray(list)) for (let i = 0; i + 1 < list.length; i += 2) out[list[i]] = list[i + 1]; return out; };
const percent = (v) => (Number.isFinite(v?.usedPercent) ? Math.max(0, Math.min(100, Math.round(v.usedPercent))) : null);

/** One window per provider: Claude and Codex show the 5-hour window, Antigravity the weekly Gemini 4 Argon limit (Agents Deck's defaults). */
export function pickUsage(provider, payload) {
  const windows = pairs(payload?.windows);
  if (provider === 'claude' || provider === 'codex') {
    const w = windows.fiveHour ?? windows.sevenDay;
    return w && percent(w) !== null ? { percent: percent(w), window: windows.fiveHour ? '5 saat' : '7 gün' } : null;
  }
  if (provider === 'antigravity') {
    const groups = pairs(payload?.groupedWindows);
    const entry = (g, kind) => pairs(groups[g])[kind]?.available?._0;
    const w = entry('gemini4Argon', 'sevenDay') ?? entry('geminiModels', 'sevenDay') ?? entry('geminiModels', 'fiveHour');
    return w && percent(w) !== null ? { percent: percent(w), window: 'haftalık' } : null;
  }
  return null;
}

const defaultRun = (store) => new Promise((resolve, reject) => {
  execFile('sqlite3', ['-readonly', '-json', store, 'SELECT ZPROVIDERRAW AS provider, ZCAPTUREDAT AS at, CAST(ZPAYLOAD AS TEXT) AS payload FROM ZLATESTUSAGERECORD'], { timeout: 4000, maxBuffer: 1_000_000 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
});

export function createUsage({ store = STORE, run = defaultRun, now = Date.now } = {}) {
  let memo = { at: 0, value: null };
  return {
    async read() {
      if (memo.value && now() - memo.at < TTL_MS) return memo.value;
      let value = { available: false, providers: {} };
      try {
        if (existsSync(store)) {
          const rows = JSON.parse((await run(store)) || '[]');
          const providers = {};
          for (const row of rows) {
            if (!['claude', 'codex', 'antigravity'].includes(row.provider)) continue;
            let payload; try { payload = JSON.parse(row.payload); } catch { continue; }
            const picked = pickUsage(row.provider, payload);
            if (picked) providers[row.provider] = { ...picked, capturedAt: Number.isFinite(row.at) ? Math.round(APPLE_EPOCH_MS + row.at * 1000) : null };
          }
          value = { available: Object.keys(providers).length > 0, providers };
        }
      } catch { /* Agents Deck not installed, store locked or sqlite3 missing: the board shows dashes */ }
      memo = { at: now(), value };
      return value;
    },
  };
}
