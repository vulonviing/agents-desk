// Boot: roster from the server, live events, top bar, chat panel and the ambient life of the office.
(function () {
  'use strict';
  const { getJson, h } = window.OfficeApi;
  const I = window.OfficeI18n;
  const L = window.OfficeLayout;
  const Chat = window.OfficeChat;
  const News = window.OfficeNews;

  const $ = (id) => document.getElementById(id);
  const canvas = $('office');
  let roster = { agents: [] };
  let serverStatus = {}; // agent id -> snapshot entry

  const toast = (text) => {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { el.hidden = true; }, 4000);
  };

  // ---------- scene ----------
  const view = new window.OfficeView(canvas, {
    onPick: (agent) => { if (agent) openChat(agent); },
    onLed: (article) => News.openNews(article),
    onCli: (p) => Chat.setProvider(p), // true: the agent animation moves the pin
    onLoc: () => toggleLocation(), // resolves to the new state so the agent can rewrite the board
    onWalk: (id, evt, act) => life.onWalk(id, evt, act),
    onSched: (act) => life.onSched(act),
    onAct: (act) => life.onAct(act),
    onZoom: (z) => { $('zoomLabel').textContent = `${Math.round(z * 100)}%`; },
  });
  const life = new window.OfficeLife.Life(view, {
    floorId: 'growth',
    onConversation: (record) => News.openConversation(record, (id) => I.name(view.byId[id]) || 'Sim'),
    onNews: (source) => News.openSource(source),
  });

  // ---------- chat ----------
  function chatTarget(agent) {
    return { id: agent.id, name: agent.name, names: agent.names, short: agent.short, shorts: agent.shorts, kind: agent.kind };
  }
  function openChat(agent) {
    const prev = view.selected;
    if (prev && prev !== agent.id) view.pinned.delete(prev);
    view.selected = agent.id;
    view.pinned.add(agent.id);
    view.release(agent.id); // a coordinator whose chat is open stays at its desk
    view.clearSpeech(agent.id);
    void Chat.open(chatTarget(agent));
  }
  function closedChat() {
    if (!Chat.state.agent && view.selected) { view.pinned.delete(view.selected); view.selected = null; }
    document.body.classList.toggle('chat-open', !!Chat.state.agent);
  }
  Chat.mount($('chat'), { onChange: () => { closedChat(); applyStatuses(); } });

  // ---------- statuses ----------
  function applyStatuses() {
    const localBusy = new Set(Chat.busyIds());
    for (const a of view.agents) {
      const s = serverStatus[a.id];
      const busy = localBusy.has(a.id) || s?.status === 'working' || s?.status === 'thinking';
      view.setStatus(a.id, busy ? 'typing' : 'idle', busy ? 'tag.replying' : s?.hasSession ? 'tag.session' : 'tag.ready');
    }
  }
  function applyOffice(snap) {
    const coordinators = snap.agents ?? [];
    const sig = JSON.stringify(coordinators.map((c) => [c.id, c.name, c.deskName]));
    serverStatus = Object.fromEntries(coordinators.map((a) => [a.id, a]));
    if (sig !== roster.sig) {
      roster = { agents: coordinators, sig };
      view.setRoster(L.place(coordinators));
    }
    applyStatuses();
  }

  // LED news board
  News.subscribe((n) => view.setNews({ articles: n.articles, refreshing: n.refreshing, error: n.error }));

  // weather + location (toggled on the control board)
  async function updateWeather() { view.setWeather(await News.weatherInfo()); }
  async function toggleLocation() {
    try {
      if (await News.locationConfigured()) { if (!confirm(I.t('confirm.location'))) return null; await News.clearLocation(); } else await News.requestLocation();
      life.pools.reloadAll();
    } catch (err) { toast(err.message); return null; }
    await updateWeather(); // the cards the agent hangs need the data
    return News.locationConfigured();
  }

  // Agents Deck usage percentages (read-only from the local Agents Deck store)
  async function updateUsage() { try { view.setUsage(await getJson('/api/usage')); } catch { view.setUsage(null); } }

  // zoom controls
  $('zoomIn').addEventListener('click', () => view.setZoom(view.cam.z * 1.25));
  $('zoomOut').addEventListener('click', () => view.setZoom(view.cam.z / 1.25));
  $('zoomReset').addEventListener('click', () => view.resetView());

  // ---------- live events ----------
  function connect() {
    const es = new EventSource('/api/events');
    es.onopen = () => { $('toast').hidden = true; };
    es.onerror = () => toast(I.t('toast.connecting'));
    es.addEventListener('office', (e) => applyOffice(JSON.parse(e.data)));
    es.addEventListener('news', () => void News.refresh());
    es.addEventListener('dialogues', (e) => { const { scope } = JSON.parse(e.data); if (scope) life.pools.reload(scope); });
    es.addEventListener('manager-cli', (e) => Chat.pushTerminal(JSON.parse(e.data)));
  }

  // static page texts follow the language switched on the board
  function applyStatic() {
    document.querySelector('.hint').textContent = I.t('hint');
    canvas.setAttribute('aria-label', I.t('canvas.label'));
    $('zoomIn').setAttribute('aria-label', I.t('zoom.in')); $('zoomOut').setAttribute('aria-label', I.t('zoom.out')); $('zoomReset').setAttribute('aria-label', I.t('zoom.fit'));
    document.querySelector('.zoom').setAttribute('aria-label', I.t('zoom.group'));
  }
  I.onChange(() => { applyStatic(); applyStatuses(); });
  applyStatic();

  // ---------- session continuity: a refresh resumes the same office ----------
  // The server keeps the real state (chat sessions and their history, news, dialogue pools, location). What only the page knew
  // (the open chat, camera, kitchen dishes, LED position) is saved here every few seconds and restored on load.
  const KEY = 'desk-session-v2';
  function saveSession() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), chat: Chat.state.agent?.id ?? null, cli: Chat.state.showCli, view: view.snapshot(), life: life.snapshot() }));
    } catch { /* private mode: the office simply starts fresh */ }
  }
  function restoreSession() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { /* none */ }
    if (!saved || Date.now() - saved.at > 12 * 3600_000) return;
    // the scene resumes exactly where it was (walkers mid-stride, speech, animations, dishes, LED); beyond 90 s the moving parts start fresh
    const resumed = view.restore(saved.view);
    if (resumed) life.restore(saved.life);
    else if (saved.view) { view.dishes = saved.view.dishes ?? []; if (saved.view.cam) { view.cam = { ...saved.view.cam }; view.clampCam(); } }
    const agent = saved.chat ? view.byId[saved.chat] : null;
    if (agent) { view.selected = agent.id; view.pinned.add(agent.id); void Chat.open(chatTarget(agent)); if (saved.cli) Chat.state.showCli = true; syncOpen(); }
  }
  function syncOpen() { document.body.classList.toggle('chat-open', !!Chat.state.agent); }
  setInterval(saveSession, 300);
  window.addEventListener('pagehide', saveSession);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveSession(); });

  (async function boot() {
    try { applyOffice(await getJson('/api/office')); } catch { toast(I.t('toast.server')); }
    connect();
    void News.refresh();
    setInterval(() => { if (!document.hidden) void News.refresh(); }, 60_000);
    view.locOn = await News.locationConfigured();
    void updateWeather();
    setInterval(updateWeather, 10 * 60_000);
    void updateUsage();
    setInterval(() => { if (!document.hidden) void updateUsage(); }, 60_000);
    view.cli = Chat.state.provider;
    restoreSession();
    life.start();
    for (const a of view.agents) void life.pools.ensure(life.deskOf(a));
  })();

  window.OfficeDebug = { view, life, Chat, News };
})();
