// One hourly edition: Flash prepares public news and every dialogue pool off-screen.
// A complete edition persists until the news coordinator inserts its disk at the LED.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export function createNewsSession({ dataDir, board, dialogues, scopes, emit = () => {}, now = Date.now, intervalMs = 3_600_000, retryMs = 15 * 60_000 }) {
  const file = join(dataDir, 'news', 'session.json');
  let meta = { startedAt: 0, appliedAt: 0, appliedEdition: null, ready: null };
  try { Object.assign(meta, JSON.parse(readFileSync(file, 'utf8'))); } catch { /* first run */ }
  if (board.compatible) {
    if (meta.ready && !board.compatible(meta.ready.board)) meta.ready = null;
    if (meta.draft && !board.compatible(meta.draft.board)) meta.draft = null;
  }
  const save = () => {
    mkdirSync(join(dataDir, 'news'), { recursive: true });
    writeFileSync(file + '.tmp', JSON.stringify(meta), { mode: 0o600 });
    renameSync(file + '.tmp', file);
  };
  let status = meta.ready ? 'ready' : meta.attempt?.status === 'preparing' ? 'idle' : meta.attempt?.status ?? 'idle', reason = meta.attempt?.status === 'preparing' ? 'unavailable' : meta.attempt?.reason ?? null, retryAt = 0, running = null, timer = null, initialTimer = null;
  if (meta.ready) { board.restoreStaged(meta.ready.board); dialogues.restoreStaged(meta.ready.pools); }
  else if (meta.draft) { board.restoreStaged(meta.draft.board); dialogues.restoreStaged(meta.draft.pools); }
  let failure = meta.attempt?.status === 'preparing' ? { code: 'interrupted' } : meta.attempt?.failure ?? null;
  let progress = meta.attempt?.progress ?? { completed: 0, total: 0, percent: meta.ready || meta.appliedEdition ? 100 : 0, stage: meta.ready ? 'ready' : meta.appliedEdition ? 'published' : 'waiting', scope: null };
  // Recover from a crash between storing the edition and writing its final status metadata.
  if (meta.ready) {
    reason = null; failure = null;
    progress = { ...progress, percent: 100, completed: progress.total, stage: 'ready', scope: null };
  } else if (status === 'ready' || meta.appliedAt && meta.appliedAt >= meta.startedAt) {
    status = 'idle'; reason = null; failure = null;
    progress = { ...progress, percent: 100, stage: 'published', scope: null };
  }
  const nextAt = () => Math.max(meta.startedAt ? meta.startedAt + intervalMs : 0, retryAt);
  const snapshot = () => ({ status, reason, failure, progress: { ...progress }, canRefresh: status !== 'preparing' && status !== 'ready' && dialogues.budgetLeft(), edition: meta.ready?.id ?? null, preparedAt: meta.ready?.at ?? null, appliedAt: meta.appliedAt || null, appliedEdition: meta.appliedEdition, startedAt: meta.startedAt || null, nextAt: nextAt() || null, intervalMs });
  function report() {
    progress.updatedAt = now();
    meta.attempt = { status, reason, failure, progress: { ...progress } };
    try { save(); } catch { /* the preparation path reports required storage failures */ }
    emit('news-session', snapshot());
  }
  const set = (value, why = null) => { status = value; reason = why; report(); };
  function run({ force = false } = {}) {
    if (running) return running;
    if (status === 'ready') return Promise.resolve(snapshot());
    running = (async () => {
      if (!dialogues.budgetLeft()) { retryAt = now() + retryMs; set('stopped', 'budget'); return snapshot(); }
      const draft = meta.draft && now() - meta.draft.at < intervalMs && (!board.compatible || board.compatible(meta.draft.board)) ? meta.draft : null;
      if (!draft) meta.startedAt = now();
      const edition = draft?.id ?? randomUUID();
      failure = null;
      const work = scopes();
      const done = new Set((draft?.pools ?? []).map(([id]) => id));
      progress = { completed: draft ? 1 + done.size : 0, total: work.length + 1, percent: 0, stage: 'news', scope: null };
      progress.percent = Math.floor(progress.completed / progress.total * 100);
      if (draft) { board.restoreStaged(draft.board); dialogues.restoreStaged(draft.pools); }
      else { meta.draft = null; board.discard(); dialogues.discard(); }
      const checkpoint = () => {
        if (board.hasStaged()) meta.draft = { id: edition, at: meta.startedAt, board: board.staged(), pools: dialogues.staged() };
        save();
      };
      set('preparing');
      try {
        save();
        if (!draft) await board.refresh(true, edition, (detail) => { Object.assign(progress, detail); report(); });
        if (!board.hasStaged()) throw new Error('news-unavailable');
        progress.completed = 1 + done.size;
        checkpoint();
        for (const { id, ctx } of work) {
          if (done.has(id)) continue;
          progress.stage = 'dialogues'; progress.scope = id;
          progress.percent = Math.floor(progress.completed / progress.total * 100);
          report();
          if (!dialogues.budgetLeft()) throw new Error('budget');
          if (!await dialogues.refresh(id, { ...ctx, edition }, { force, editionBatch: true, editionSources: board.staged()?.articles, onProgress: (detail) => { Object.assign(progress, detail); report(); } })) throw new Error('dialogues-unavailable');
          progress.completed++;
          checkpoint();
        }
        if (board.compatible && !board.compatible(board.staged())) throw new Error('news-preferences-changed');
        meta.ready = { id: edition, at: now(), board: board.staged(), pools: dialogues.staged() };
        meta.draft = null;
        save(); retryAt = 0;
        progress.percent = 100; progress.stage = 'ready'; progress.scope = null;
        set('ready');
      } catch {
        failure = progress.stage === 'dialogues' ? dialogues.failure?.() ?? null : board.failure?.() ?? { code: 'news-unavailable' };
        meta.ready = null;
        checkpoint();
        retryAt = now() + retryMs;
        const budget = !dialogues.budgetLeft();
        set(budget ? 'stopped' : 'idle', budget ? 'budget' : 'unavailable');
      }
      return snapshot();
    })().finally(() => { running = null; });
    return running;
  }
  function publish(edition) {
    // Edition IDs make retries, multiple tabs and stale saved animations harmless.
    if (edition && edition === meta.appliedEdition) return { ok: true, ...snapshot() };
    if (meta.ready && board.compatible && !board.compatible(meta.ready.board)) { invalidateSelection(); return { ok: false, ...snapshot() }; }
    if (status !== 'ready' || !edition || edition !== meta.ready.id) return { ok: false, ...snapshot() };
    board.publish(); dialogues.publish();
    meta.appliedAt = now(); meta.appliedEdition = edition; meta.ready = null;
    save(); progress.stage = 'published'; set('idle');
    return { ok: true, ...snapshot() };
  }
  // Location changes also scrub any prepared weather lines before they can survive a restart.
  function syncPreparedPools() {
    if (meta.ready) { meta.ready.pools = dialogues.staged(); save(); }
    if (meta.draft) { meta.draft.pools = dialogues.staged(); save(); }
  }
  function invalidateSelection() {
    if (running || !meta.ready) return;
    meta.ready = null; meta.draft = null; board.discard(); dialogues.discard();
    progress = { ...progress, percent: 0, stage: 'waiting', phase: null };
    failure = null; set('idle');
  }
  function start() {
    stop();
    timer = setInterval(() => { if ((status === 'idle' || status === 'stopped') && now() >= nextAt()) void run(); }, 30_000);
    timer.unref?.();
    if (now() >= nextAt()) { initialTimer = setTimeout(() => void run(), 5_000); initialTimer.unref?.(); }
  }
  function stop() { clearInterval(timer); clearTimeout(initialTimer); timer = initialTimer = null; }
  return { start, stop, run, publish, snapshot, syncPreparedPools, invalidateSelection };
}
