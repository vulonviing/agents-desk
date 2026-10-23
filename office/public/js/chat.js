// Chat panel with a coordinator: one resumable CLI session per chat. The conversation continues in the same
// session until "Yeni konuşma" is pressed; switching the CLI switches the thread, nothing is reset. Chats are read-only.
(function () {
  'use strict';
  const { getJson, postJson, h, copyText } = window.OfficeApi;
  const I = window.OfficeI18n;
  const CLI = { claude: 'Claude Code', codex: 'Codex' };

  const state = {
    provider: (() => { try { return localStorage.getItem('desk-cli') === 'codex' ? 'codex' : 'claude'; } catch { return 'claude'; } })(),
    article: null,
    agent: null, // { id, name, deskName, kind }
    messages: {}, busy: {}, terminal: [], showCli: false, terminalError: '', resume: 'idle',
  };
  let root = null;
  let onChange = () => {};
  const key = (id = state.agent?.id) => `${state.provider}:${id}`;
  const url = (id) => `/api/agents/${encodeURIComponent(id)}/chat`;

  function mount(el, handlers = {}) { root = el; onChange = handlers.onChange ?? (() => {}); render(); }
  function setProvider(p) {
    if (state.agent && state.busy[key()]) return false;
    state.provider = p;
    try { localStorage.setItem('desk-cli', p); } catch { /* optional preference */ }
    if (state.agent) void load();
    render();
    onChange();
    return true;
  }
  async function open(agent, article = null) {
    state.article = agent.kind === 'news' ? article : null;
    state.agent = agent;
    state.showCli = false;
    state.resume = 'idle';
    render();
    onChange();
    await load();
  }
  function close() { state.agent = null; render(); onChange(); }
  async function load() {
    const id = state.agent?.id;
    if (!id) return;
    const k = key(id);
    try {
      const r = await getJson(`${url(id)}?provider=${state.provider}`);
      state.messages[k] = r.messages;
      state.busy[k] = r.busy;
    } catch { /* history is optional */ }
    render();
  }
  async function send(text) {
    const id = state.agent.id;
    const k = key(id);
    if (state.busy[k]) return;
    state.messages[k] = [...(state.messages[k] ?? []), { role: 'user', text, at: new Date().toISOString() }];
    state.busy[k] = true;
    render(); onChange();
    try {
      const r = await postJson(url(id), { message: text, provider: state.provider, lang: I.lang, ...(state.agent?.kind === 'news' ? { articleId: state.article?.articleId ?? null } : {}) });
      state.messages[k] = r.messages;
    } catch (err) {
      state.messages[k] = [...(state.messages[k] ?? []), { role: 'error', text: err.message || I.t('chat.error'), at: new Date().toISOString() }];
    } finally { state.busy[k] = false; render(); onChange(); }
  }
  async function reset() {
    const id = state.agent.id;
    const k = key(id);
    if (state.busy[k]) return;
    try { await postJson(`${url(id)}/reset`, { provider: state.provider }); } catch { /* ignore */ }
    state.messages[k] = [];
    render(); onChange();
  }
  async function loadTerminal() {
    const id = state.agent?.id;
    if (!id) return;
    state.terminalError = '';
    try {
      const r = await getJson(`/api/agents/${encodeURIComponent(id)}/terminal?provider=${state.provider}`);
      const merged = new Map([...state.terminal, ...r.entries].map((e) => [e.id, e]));
      state.terminal = [...merged.values()].sort((a, b) => a.at.localeCompare(b.at)).slice(-200);
    } catch { state.terminalError = I.t('chat.cliError'); }
    render();
  }
  // live line of the bounded CLI log (status, output, errors; never prompts)
  function pushTerminal(entry) {
    if (state.terminal.some((e) => e.id === entry.id)) return;
    state.terminal = [...state.terminal, entry].slice(-200);
    if (state.showCli) render();
  }
  async function copyResume() {
    try {
      const r = await getJson(`/api/agents/${encodeURIComponent(state.agent.id)}/resume?provider=${state.provider}`);
      state.resume = (await copyText(r.command)) ? 'ok' : 'fail';
    } catch { state.resume = 'none'; }
    render();
    setTimeout(() => { state.resume = 'idle'; render(); }, 3500);
  }
  const isBusy = () => !!state.agent && !!state.busy[key()];

  function render() {
    if (!root) return;
    const a = state.agent;
    root.hidden = !a;
    if (!a) { root.replaceChildren(); return; }
    const keepText = root.querySelector('textarea')?.value ?? '';
    const messages = state.messages[key()] ?? [];
    const busy = isBusy();
    const resumeLabel = I.t({ ok: 'chat.resume.ok', none: 'chat.resume.none', fail: 'chat.resume.fail', idle: 'chat.resume' }[state.resume]);
    const entries = state.terminal.filter((e) => e.provider === state.provider && e.managerId === a.id);
    const log = state.showCli
      ? h('div.chat-log.terminal-lines', { role: 'log', 'aria-label': I.t('chat.terminal') },
        entries.length ? null : h('p.muted', I.t('chat.noCli')),
        ...entries.map((e) => h('div.terminal-entry.' + e.kind, h('small', `${e.at.slice(11, 19)} · ${e.label}`), h('pre', e.text))),
        state.terminalError ? h('p.error', state.terminalError) : null)
      : h('div.chat-log', { role: 'log', 'aria-live': 'polite' },
        messages.length === 0 && !busy ? h('p.muted', I.t('chat.empty.desk')) : null,
        ...messages.map((m) => {
          const el = h('div.msg.' + m.role);
          // renderMarkdown escapes all HTML first and only emits a few fixed tags and http(s) links
          if (m.role === 'assistant') el.innerHTML = window.renderMarkdown(m.text); else el.textContent = m.text;
          return el;
        }),
        busy ? h('div.activity-card.live', { role: 'status' }, h('span', '●'), h('div', h('strong', I.t('chat.preparing')))) : null);
    const submit = () => { const t = area.value.trim(); if (t && !isBusy()) { area.value = ''; void send(t); } };
    const area = h('textarea', { rows: 3, maxlength: 2000, placeholder: I.t('chat.placeholder'), 'aria-label': I.t('chat.message'), onkeydown: (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    } });
    area.value = keepText;
    root.replaceChildren(
      h('header.chat-head',
        h('div.chat-title', h('strong', I.name(a)), h('span.muted', `${I.short(a)} · ${CLI[state.provider]}`)),
        h('button.close', { type: 'button', 'aria-label': I.t('chat.close'), onclick: close }, '✕'),
        h('div.chat-head-actions', h('span.pill' + (busy ? '.working' : ''), busy ? I.t('chat.replying') : I.t('chat.ready')),
          messages.some((m) => m.role === 'assistant') ? h('button', { type: 'button', onclick: copyResume, title: I.t('chat.resume.title') }, resumeLabel) : null,
          h('button', { type: 'button', 'aria-pressed': String(state.showCli), onclick: () => { state.showCli = !state.showCli; render(); if (state.showCli) void loadTerminal(); } }, state.showCli ? I.t('chat.chat') : I.t('chat.cli')))),
      ...(state.article ? [h('div.news-chat-context', h('small', I.t('news.context')), h('strong', I.title(state.article)), h('a', { href: state.article.url, target: '_blank', rel: 'noopener noreferrer' }, state.article.publisher), h('p', I.explanation(state.article) ?? ''))] : []),
      log,
      h('div.chat-input', area,
        h('div.chat-actions',
          h('button.primary', { type: 'button', disabled: busy, onclick: submit }, I.t('chat.send')),
          h('button', { type: 'button', disabled: busy || messages.length === 0, onclick: reset }, I.t('chat.new'))),
        h('p.muted', I.t('chat.note'))));
    const logEl = root.querySelector('.chat-log');
    if (logEl) logEl.scrollTop = logEl.scrollHeight;
    if (!busy && keepText === '') area.focus();
  }

  I.onChange(() => render());
  window.OfficeChat = { state, mount, open, close, setProvider, pushTerminal, isBusy, busyIds: () => Object.entries(state.busy).filter(([, v]) => v).map(([k]) => k.split(':').slice(1).join(':')) };
})();
