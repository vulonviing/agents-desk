import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { structureNews } from './news-taxonomy.js';

export const FEEDBACK_REASONS = ['topic', 'source', 'repeat', 'style'];
const MAX_ARTICLES = 3000, MAX_RATINGS = 2000;
const invalid = (message, status = 400) => Object.assign(new Error(message), { status });

/** Local single-user news preferences. Never stores conversation turns, prompts or personal notes. */
export function createNewsFeedback({ dataDir, now = Date.now }) {
  const dir = join(dataDir, 'news'), path = join(dir, 'preferences.json');
  let state = { version: 1, revision: 0, articles: [], ratings: [] };
  try {
    const saved = JSON.parse(readFileSync(path, 'utf8'));
    if (saved.version === 1 && Array.isArray(saved.articles) && Array.isArray(saved.ratings)) state = saved;
  } catch { /* first run */ }
  let cachedProfile = null;
  const save = () => { mkdirSync(dir, { recursive: true }); writeFileSync(path + '.tmp', JSON.stringify(state), { mode: 0o600 }); renameSync(path + '.tmp', path); };
  const article = id => state.articles.find(a => a.articleId === id || a.sourceIds.includes(id));
  const rating = a => a ? state.ratings.find(r => r.articleId === a.articleId) ?? null : null;
  function register(sources = []) {
    let changed = false;
    for (const source of sources) {
      const s = structureNews(source); if (!s || !s.title || typeof s.id !== 'string' || s.id.length > 180) continue;
      const previous = article(s.articleId);
      const item = { articleId: s.articleId, sourceIds: [...new Set([...(previous?.sourceIds ?? []), s.id])].slice(-12), kind: 'news', title: s.title, url: s.url, publisher: String(s.publisher ?? '').slice(0, 80), category: s.category, tags: s.tags, query: typeof s.query === 'string' ? s.query.slice(0, 100) : null, origin: s.origin, publishedAt: Number(s.publishedAt) || null, eventId: s.eventId ?? previous?.eventId ?? null, eventKey: s.eventKey ?? previous?.eventKey ?? null };
      if (JSON.stringify(item) !== JSON.stringify(previous)) { const articles = [item, ...state.articles.filter(a => a.articleId !== item.articleId)]; const rated = new Set(state.ratings.map(r => r.articleId)); state.articles = [...articles.filter(a => rated.has(a.articleId)), ...articles.filter(a => !rated.has(a.articleId))].slice(0, MAX_ARTICLES); changed = true; }
    }
    if (changed) { save(); cachedProfile = null; }
  }
  function get(id) {
    const a = article(id); if (!a) throw invalid('Haber bulunamadı.', 404);
    return { article: a, feedback: rating(a), revision: state.revision };
  }
  function set({ sourceId, value, reason = 'topic' }) {
    if (typeof sourceId !== 'string' || sourceId.length > 180 || !['like', 'dislike', null].includes(value) || !FEEDBACK_REASONS.includes(reason)) throw invalid('Geçersiz haber geri bildirimi.');
    const a = article(sourceId); if (!a) throw invalid('Haber bulunamadı.', 404);
    const old = rating(a);
    if ((old?.value ?? null) === value && (value === null || old.reason === reason)) return get(sourceId);
    const previous = state;
    const ratings = state.ratings.filter(r => r.articleId !== a.articleId);
    if (value) ratings.unshift({ articleId: a.articleId, value, reason, updatedAt: now() });
    state = { ...state, ratings: ratings.slice(0, MAX_RATINGS), revision: state.revision + 1 };
    try { save(); } catch { state = previous; throw invalid('Haber tercihi kaydedilemedi.', 503); }
    return get(sourceId);
  }
  function profile() {
    if (cachedProfile?.revision === state.revision) return cachedProfile;
    const categories = {}, tags = {}, publishers = {};
    const recent = state.ratings.flatMap(r => {
      const a = article(r.articleId); if (!a) return [];
      const score = r.value === 'like' ? 1 : -1;
      if (r.reason === 'topic') { categories[a.category] = (categories[a.category] ?? 0) + score; for (const tag of a.tags) tags[tag] = (tags[tag] ?? 0) + score; }
      if (r.reason === 'source') publishers[a.publisher] = (publishers[a.publisher] ?? 0) + score;
      return [{ title: a.title, category: a.category, tags: a.tags, publisher: a.publisher, query: a.query, value: r.value, reason: r.reason }];
    });
    return cachedProfile = { revision: state.revision, categories, tags, publishers, recent: recent.slice(0, 24) };
  }
  function editorial() {
    const p = profile();
    return { ...p, publishers: Object.fromEntries(Object.entries(p.publishers).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 24)) };
  }
  function score(source) {
    const s = structureNews(source); if (!s) return 0;
    const p = profile();
    return Math.max(-20, Math.min(20, (p.categories[s.category] ?? 0) + s.tags.reduce((n, t) => n + 3 * (p.tags[t] ?? 0), 0) + 4 * (p.publishers[s.publisher] ?? 0)));
  }
  function accepts(source) {
    if (source?.kind !== 'news') return true;
    const a = article(source.articleId ?? source.id), r = rating(a);
    return !(r?.value === 'dislike' && r.reason !== 'style');
  }
  function consumed() {
    return state.ratings.filter(r => r.value === 'like').flatMap(r => {
      const a = article(r.articleId);
      return a ? [{ articleId: a.articleId, title: a.title, eventId: a.eventId, eventKey: a.eventKey }] : [];
    });
  }
  return { register, get, set, editorial, score, accepts, consumed };
}
