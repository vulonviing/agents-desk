// The hourly news session. Every hour (Gemini Flash only, through the shared daily budget) a whole new edition is prepared in the
// background: the LED news with their summaries and every dialogue pool rewritten. The finished edition waits ("ready") until the
// news-desk sim carries it to the LED and publishes it (POST /api/news/session/publish), so the office changes at that moment
// and not while it is being written. When the daily Flash budget is spent the session stops until the budget returns.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const HOUR = 3_600_000;

export function createNewsSession({ dataDir, board, dialogues, scopes, emit = () => {}, now = Date.now, intervalMs = HOUR, retryMs = 15 * 60_000 }) {
  const file = join(dataDir, 'news', 'session.json');
  let meta = { startedAt: 0, appliedAt: 0 };
  try { if (existsSync(file)) meta = { ...meta, ...JSON.parse(readFileSync(file, 'utf8')) }; } catch { /* first run */ }
  const saveMeta = () => { try { mkdirSync(join(dataDir, 'news'), { recursive: true }); writeFileSync(file + '.tmp', JSON.stringify(meta), { mode: 0o600 }); renameSync(file + '.tmp', file); } catch { /* memory only */ } };
  let status = 'idle', reason = null, preparedAt = 0, retryAt = 0, running = null, timer = null;

  const nextAt = () => Math.max(meta.startedAt + intervalMs, retryAt);
  const snapshot = () => ({ status, reason, preparedAt: preparedAt || null, appliedAt: meta.appliedAt || null, startedAt: meta.startedAt || null, nextAt: meta.startedAt || retryAt ? nextAt() : null, intervalMs });
  const set = (next, why = null) => { status = next; reason = why; emit('news-session', snapshot()); };

  async function run() {
    if (running) return running;
    if (status === 'ready') return snapshot(); // the previous edition has not been carried to the LED yet: no new tokens spent
    running = (async () => {
      if (!dialogues.budgetLeft()) { retryAt = now() + retryMs; set('stopped', 'budget'); return snapshot(); }
      meta.startedAt = now(); saveMeta();
      const firstEdition = !meta.appliedAt;
      set('preparing');
      try {
        await board.refresh(true);
        for (const { id, ctx } of scopes()) {
          if (!dialogues.budgetLeft()) break;
          await dialogues.refresh(id, ctx);
        }
      } catch { /* the checks below decide what happened */ }
      if (board.hasStaged() || dialogues.hasHeld()) { preparedAt = now(); retryAt = 0; set('ready'); }
      else if (firstEdition && board.get().articles.length) { meta.appliedAt = now(); saveMeta(); preparedAt = now(); retryAt = 0; set('idle'); } // nothing was published yet: the first edition goes live at once
      else { retryAt = now() + retryMs; set(dialogues.budgetLeft() ? 'idle' : 'stopped', dialogues.budgetLeft() ? 'unavailable' : 'budget'); }
      return snapshot();
    })().finally(() => { running = null; });
    return running;
  }

  /** the news-desk sim calls this at the LED: the prepared edition goes live */
  function publish() {
    if (status !== 'ready') return { ok: false, ...snapshot() };
    board.publish(); dialogues.publish();
    meta.appliedAt = now(); saveMeta();
    set('idle');
    return { ok: true, ...snapshot() };
  }

  function start() {
    stop();
    timer = setInterval(() => { if ((status === 'idle' || status === 'stopped') && now() >= nextAt()) void run(); }, 30_000);
    timer.unref?.();
    if (now() >= nextAt()) setTimeout(() => void run(), 5_000).unref?.();
  }
  function stop() { clearInterval(timer); timer = null; }
  return { start, stop, run, publish, snapshot };
}
