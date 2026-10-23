// News Desk controls show server-reported work, never a simulated time estimate.
(function () {
  'use strict';
  const I = window.OfficeI18n;
  const { h, getJson, postJson } = window.OfficeApi;
  let panel, options, nodes, requesting = false, error = false, returnFocus = null, floating;
  function close() { panel.hidden = true; returnFocus?.focus?.(); }
  function stateOf(s, delivery) {
    if (delivery && s.status === 'ready') return delivery.stage === 'publishing' ? 'publishing' : 'delivering';
    if (s.reason === 'unavailable') return 'unavailable';
    return s.status === 'idle' && s.appliedAt ? 'published' : s.status ?? 'idle';
  }
  function render() {
    if (!panel || panel.hidden) return;
    const s = options.getSession(), d = options.getDelivery();
    const state = stateOf(s, d), progress = s.progress ?? { percent: 0 };
    const percent = Math.max(0, Math.min(100, Number(progress.percent) || 0));
    panel.setAttribute('aria-label', I.t('desk.title'));
    panel.dataset.state = state;
    nodes.title.textContent = I.t('desk.title');
    nodes.close.setAttribute('aria-label', I.t('desk.close'));
    nodes.status.textContent = I.t(`desk.status.${state}`);
    nodes.percent.textContent = `${percent}%`;
    nodes.progress.value = percent;
    nodes.progress.setAttribute('aria-label', I.t('desk.progress'));
    const agent = options.agents().find(a => a.id.split('#')[0] === progress.scope);
    const scope = agent ? I.short(agent) : I.t('desk.shared');
    nodes.stage.textContent = state === 'preparing'
      ? progress.stage === 'dialogues' ? `${I.t('desk.dialogues')} · ${scope}` : I.t('desk.news')
      : I.t(`desk.detail.${state}`);
    if (state === 'preparing' && progress.phase) {
      nodes.stage.textContent += ` · ${I.t(`desk.phase.${progress.phase}`)}`;
      if (progress.phase === 'generating' && progress.batch) nodes.stage.textContent += ` (${progress.batch}/${progress.batches})`;
    }
    if (state === 'unavailable' && s.failure?.code) {
      const code = s.failure.code;
      const key = code === 'news-insufficient-coverage' ? 'coverage' : code === 'dialogue-empty' ? 'content' : /timeout/.test(code) ? 'timeout' : /briefing|news-empty/.test(code) ? 'search' : code === 'interrupted' ? 'interrupted' : /auth/.test(code) ? 'auth' : /schema|json|news-incomplete|news-selection-invalid/.test(code) ? 'format' : 'service';
      nodes.stage.textContent = I.t(`desk.failure.${key}`);
    }
    nodes.explanation.textContent = I.t('desk.progressHint');
    const time = at => at ? new Date(at).toLocaleTimeString(I.lang === 'en' ? 'en-GB' : 'tr-TR', { hour: '2-digit', minute: '2-digit' }) : '—';
    nodes.lastLabel.textContent = I.t('desk.last'); nodes.last.textContent = time(s.appliedAt);
    nodes.nextLabel.textContent = I.t('desk.next'); nodes.next.textContent = time(s.nextAt);
    nodes.refresh.textContent = I.t(requesting ? 'desk.requesting' : 'desk.refresh');
    nodes.refresh.disabled = requesting || !s.canRefresh;
    nodes.error.hidden = !error; nodes.error.textContent = I.t('desk.offline');
  }
  async function refresh() {
    if (requesting || !options.getSession().canRefresh) return;
    requesting = true; error = false; render();
    try { options.onSession(await postJson('/api/news/session/refresh', {})); }
    catch { error = true; }
    finally { requesting = false; render(); }
  }
  function mount(config) {
    options = config;
    nodes = {
      title: h('strong'), close: h('button', { type: 'button', onclick: close }, '✕'),
      status: h('span', { role: 'status', 'aria-live': 'polite' }), percent: h('strong'),
      progress: h('progress', { max: 100, value: 0 }), stage: h('p'), explanation: h('p.muted'),
      lastLabel: h('dt'), last: h('dd'), nextLabel: h('dt'), next: h('dd'),
      refresh: h('button.desk-refresh', { type: 'button', onclick: refresh }),
      error: h('p.error', { hidden: true, role: 'alert' }),
    };
    panel = h('section.popup.news-desk', { role: 'dialog', hidden: true },
      h('header', nodes.title, nodes.close),
      h('div.desk-status', nodes.status, nodes.percent), nodes.progress, nodes.stage,
      nodes.explanation,
      h('dl.desk-times', nodes.lastLabel, nodes.last, nodes.nextLabel, nodes.next),
      nodes.refresh, nodes.error);
    document.body.appendChild(panel);
    floating = window.OfficeDeskPopup.attach(panel, { view: options.view, agentId: () => options.agents().find(a => a.kind === 'news')?.id });
    document.addEventListener('keydown', e => { if (!panel.hidden && e.key === 'Escape') { e.stopPropagation(); close(); } });
    document.addEventListener('pointerdown', e => { if (!panel.hidden && !panel.contains(e.target)) close(); });
    I.onChange(render);
    setInterval(render, 1000); // delivery stages are local animations; preparation progress arrives over SSE
  }
  async function open() {
    window.OfficeNews.close();
    returnFocus = document.activeElement;
    panel.hidden = false; render(); floating.open(); nodes.close.focus();
    try { options.onSession(await getJson('/api/news/session')); error = false; }
    catch { error = true; }
    render();
  }
  window.OfficeNewsDesk = { mount, open, close, render, snapshot: () => floating?.snapshot(), restore: s => floating?.restore(s), isOpen: () => !!panel && !panel.hidden };
})();
