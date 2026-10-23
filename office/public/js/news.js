// Public news board (LED panel + detail card) and the weather line. Only public metadata is shown and rated;
// private chat text never reaches this code.
(function () {
  'use strict';
  const { getJson, postJson, h } = window.OfficeApi;
  const I = window.OfficeI18n;

  // ---------- board state ----------
  const news = { articles: [], updatedAt: null, refreshing: false, error: null };
  const listeners = new Set();
  let loading = false;
  let discuss = () => {};
  async function refresh() {
    if (loading) return;
    loading = true;
    try {
      const next = await getJson('/api/news/board');
      Object.assign(news, next, { articles: (next.articles ?? []).filter((s) => s.expiresAt > Date.now()), error: null });
    } catch { news.articles = news.articles.filter((s) => s.expiresAt > Date.now()); news.error = true; } finally { loading = false; for (const fn of listeners) fn(news); }
  }
  const subscribe = (fn) => { listeners.add(fn); fn(news); return () => listeners.delete(fn); };

  // ---------- weather ----------
  // { configured, weather } with a Turkish description of the conditions
  async function weatherInfo() {
    try {
      const r = await getJson('/api/weather?lang=' + I.lang);
      return { configured: !!r.configured, weather: r.weather ?? null };
    } catch { return { configured: false, weather: null }; }
  }

  // ---------- popup (bottom right): a news article or an ambient conversation ----------
  let popup = null;
  let conversation = null;
  let outside = null;
  function close() {
    if (popup) popup.remove();
    popup = null;
    conversation = null;
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', onKey, true);
  }
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  function show(node) {
    close();
    popup = node;
    document.body.append(node);
    outside = (e) => { if (popup && !popup.contains(e.target) && !e.target.closest('[data-keep-popup]')) close(); };
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
    document.addEventListener('keydown', onKey, true);
  }

  function feedback(source, showHeadline) {
    const id = source.articleId ?? source.id;
    const box = h('footer.news-feedback', { 'aria-label': I.t('fb.label') });
    if (!id) return box;
    let result = null, reason = 'topic', busy = true, error = '', saved = false;
    const draw = () => {
      const article = result?.article ?? {};
      const cat = article.category ?? source.category ?? source.topic ?? 'general';
      const tags = article.tags ?? source.tags ?? [];
      const rate = (value) => async () => {
        if (busy || !result) return;
        busy = true; error = ''; saved = false; draw();
        try {
          const next = result.feedback?.value === value ? null : value;
          result = await postJson('/api/news/feedback', { sourceId: id, value: next, reason });
          reason = result.feedback?.reason ?? reason; saved = true;
        } catch { error = I.t('fb.saveFail'); }
        busy = false; draw();
      };
      const select = h('select', { 'aria-label': I.t('fb.aria'), disabled: busy || !result, onchange: async (e) => { reason = e.target.value; if (result?.feedback) await rate(result.feedback.value)(); } },
        ...['topic', 'source', 'repeat', 'style'].map((v) => h('option', { value: v, selected: v === reason }, I.t(`fb.${v}`))));
      const status = error || (busy ? I.t('fb.saving') : saved ? (reason === 'style' ? I.t('fb.savedStyle') : I.t('fb.saved')) : result?.feedback ? I.t('fb.existing') : I.t('fb.hint'));
      box.replaceChildren(...[
        h('div.news-metadata', h('span', I.t(`topic.${cat}`) === `topic.${cat}` ? I.t('topic.general') : I.t(`topic.${cat}`)), ...tags.map((t) => h('span', I.t(`tag.${t}`) === `tag.${t}` ? t : I.t(`tag.${t}`)))),
        showHeadline ? h('strong.news-headline', I.title(article.title ? { ...source, ...article } : source)) : null,
        h('div.news-feedback-controls', h('span', I.t('fb.question')),
          h('div.news-rating',
            h('button', { type: 'button', 'aria-pressed': String(result?.feedback?.value === 'like'), disabled: busy || !result, onclick: rate('like') }, I.t('fb.like')),
            h('button', { type: 'button', 'aria-pressed': String(result?.feedback?.value === 'dislike'), disabled: busy || !result, onclick: rate('dislike') }, I.t('fb.dislike'))),
          h('label', I.t('fb.rating'), select)),
        h('small', { role: 'status' }, status)].filter(Boolean));
    };
    draw();
    getJson(`/api/news/feedback?sourceId=${encodeURIComponent(id)}`).then((r) => { result = r; reason = r.feedback?.reason ?? 'topic'; }).catch(() => { error = I.t('fb.loadFail'); }).finally(() => { busy = false; draw(); });
    return box;
  }

  function openNews(article) {
    const list = news.articles;
    if (!article) article = list[0];
    const render = (a) => {
      const i = list.findIndex((s) => s.articleId === a?.articleId);
      const step = (d) => () => { const s = list[(i + d + list.length) % list.length]; if (s) show(render(s)); };
      return h('section.popup.is-news', { role: 'dialog', 'aria-label': I.t('pop.newsDetail') },
        h('header', h('strong', I.t('pop.news')), h('button', { type: 'button', 'aria-label': I.t('pop.closeNews'), onclick: close }, '✕')),
        a ? h('div.news-explanation',
          h('nav', { 'aria-label': I.t('pop.nav') }, h('button', { disabled: list.length < 2, onclick: step(-1) }, I.t('pop.prev')), h('small', i >= 0 ? `${i + 1} / ${list.length}` : I.t('pop.item')), h('button', { disabled: list.length < 2, onclick: step(1) }, I.t('pop.next'))),
          h('h3', I.title(a)), h('small', I.t('pop.gemini')),
          h('p.news-summary', I.explanation(a) ?? (a.explanationStatus === 'pending' ? I.t('pop.pending') : I.t('pop.unavailable'))))
          : h('p.muted', news.refreshing ? I.t('pop.refreshing') : I.t('pop.none')),
        a ? h('a', { href: a.url, target: '_blank', rel: 'noopener noreferrer' }, `${a.publisher} · ${new Date(a.publishedAt).toLocaleDateString(I.t('locale'))} ↗`) : null,
        a?.popularity ? h('small.news-popularity',
          `${I.t('pop.popularity')}: ${a.popularity.publishers} ${I.t('pop.publishers')}` +
          (a.popularity.communityRank ? ` · Hacker News #${a.popularity.communityRank} · ${a.popularity.communityVotes} ${I.t('pop.votes')}` : '') +
          (a.preferenceOverride ? ` · ${I.t('pop.majorOverride')}` : '')) : null,
        a ? h('button.primary.news-discuss', { type: 'button', onclick: () => { close(); discuss(a); } }, I.t('news.discuss')) : null,
        a ? feedback(a, false) : null);
    };
    show(render(article));
  }

  // an ambient conversation: its transcript, the source (when it is about a news article) and the rating
  function openConversation(record, nameOf, newsSource) {
    const source = newsSource ?? record.source;
    const fullSource = source ? news.articles.find((s) => s.articleId === source.articleId) ?? source : null;
    const turns = h('div.ambient-turns', { 'aria-live': 'polite', 'aria-relevant': 'additions text' });
    show(h('section.popup', { role: 'dialog', 'aria-label': I.t('pop.talk') },
      h('header', h('strong', `${nameOf(record.a)} · ${nameOf(record.b)}`), h('button', { type: 'button', 'aria-label': I.t('pop.closeTalk'), onclick: close }, '✕')),
      turns,
      fullSource ? h('a', { href: fullSource.url, target: '_blank', rel: 'noopener noreferrer' }, `${fullSource.publisher} · ${new Date(fullSource.publishedAt).toLocaleDateString(I.t('locale'))} ↗`) : null,
      fullSource?.kind === 'news' ? feedback(fullSource, true) : null));
    conversation = { id: record.id, record, turns, nameOf, rendered: 0 };
    updateConversation(record);
  }
  function updateConversation(record) {
    const c = conversation;
    if (!popup || !c || c.id !== record.id) return;
    c.record = record;
    const follow = popup.scrollTop + popup.clientHeight >= popup.scrollHeight - 32;
    c.turns.querySelector('.ambient-next')?.remove();
    for (const turn of record.turns.slice(c.rendered)) {
      c.turns.append(h('div.ambient-turn' + (turn.speakerId === record.b ? '.reply' : ''),
        h('strong.ambient-speaker', c.nameOf(turn.speakerId)), h('p', turn.text)));
    }
    c.rendered = record.turns.length;
    if (record.active) c.turns.append(h('span.ambient-next', { role: 'status' }, I.t('pop.talking')));
    if (follow) popup.scrollTop = popup.scrollHeight;
  }
  I.onChange(() => { if (conversation) updateConversation(conversation.record); });
  function openSource(source) { openNews(news.articles.find((s) => s.articleId === source.articleId) ?? source); }

  // ---------- location permission for the weather line ----------
  async function locationConfigured() { try { return (await getJson('/api/dialogues/location')).configured; } catch { return false; } }
  function requestLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error(I.t('geo.unsupported')));
      navigator.geolocation.getCurrentPosition(
        (p) => postJson('/api/dialogues/location', { latitude: p.coords.latitude, longitude: p.coords.longitude }).then(resolve, reject),
        () => reject(new Error(I.t('geo.denied'))), { enableHighAccuracy: false, timeout: 15000, maximumAge: 3600000 });
    });
  }
  const clearLocation = () => postJson('/api/dialogues/location', { clear: true });

  window.OfficeNews = { onDiscuss(fn) { discuss = fn; }, news, refresh, subscribe, weatherInfo, openNews, openConversation, updateConversation, openSource, close, locationConfigured, requestLocation, clearLocation };
})();
