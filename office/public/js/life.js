// Ambient office life: colleagues visit each other and talk, look out of the window, fetch coffee or water and
// comment on the LED news. Lines come from pooled dialogues (refilled rarely by the server with Gemini Flash);
// choosing a line is local, so talking never costs a model call. Nothing here implies real CLI work.
(function () {
  'use strict';
  const I = window.OfficeI18n;
  const RELOAD_MS = 10 * 60_000;
  const GLOBAL_REPEAT_MS = 10 * 60_000;
  const START_GAP_S = 25; // quiet time after any activity begins: talk stays rare
  const FALLBACK = [
    { kind: 'coffee', text: 'Kahvenin kokusu koridora kadar geliyor.', en: { text: 'The smell of coffee reaches all the way down the corridor.' } }, { kind: 'water', text: 'Bir bardak su, sonra devam.', en: { text: 'A glass of water, then back to it.' } },
    { kind: 'window', text: 'Şu köşeye bir okuma koltuğu yakışırdı.', en: { text: 'A reading chair would suit that corner.' } }, { kind: 'news', text: 'Bugünün haberlerine bir göz atayım.', en: { text: 'Let me glance at today’s news.' } },
    { kind: 'desk', text: 'Yarın için not alayım.', en: { text: 'Let me jot a note for tomorrow.' } },
  ];
  // Reading pace of a bubble: about 20 characters per second plus a short beat
  const turnDuration = (text) => Math.max(3.5, Math.min(7.5, 2.2 + text.length * 0.05));
  const fill = (t) => t.replace(/\s*\{(?:name|other)\},?\s*/g, ' ').replace(/\s+([,.!?])/g, '$1').trim();

  async function getJson(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.json();
  }

  class Pools {
    constructor() { this.pools = new Map(); this.spokenAt = new Map(); }
    pool(id) {
      let p = this.pools.get(id);
      if (!p) { p = { lines: FALLBACK, loadedAt: 0, loading: false, recent: [], lastAt: new Map(), polls: 0, timer: null }; this.pools.set(id, p); }
      return p;
    }
    url(id) { return id.startsWith('floor:') ? `/api/dialogues?floor=${encodeURIComponent(id.slice(6))}` : `/api/dialogues?office=${encodeURIComponent(id)}`; }
    // Loads (or reloads after a while) one pool; never throws, the built-in lines stay in use.
    async ensure(id, now = Date.now()) {
      const p = this.pool(id);
      if (p.loading || (p.loadedAt && now - p.loadedAt < RELOAD_MS)) return;
      p.loading = true;
      try {
        const r = await getJson(this.url(id));
        if (Array.isArray(r.lines) && r.lines.length) p.lines = r.lines;
        p.loadedAt = now;
        // a refill is running on the server: look again shortly (at most a few times)
        if (r.refreshing && p.polls < 4) { p.polls++; p.timer = setTimeout(() => { p.loadedAt = 0; void this.ensure(id); }, 20_000); } else if (!r.refreshing) p.polls = 0;
      } catch { p.loadedAt = now - RELOAD_MS + 30_000; } finally { p.loading = false; }
    }
    // the server finished a refill: show it without persistent polling
    reload(id) { const p = this.pools.get(id); if (!p) return; if (p.timer) clearTimeout(p.timer); p.loadedAt = 0; p.polls = 0; void this.ensure(id); }
    reloadAll() { for (const id of this.pools.keys()) this.reload(id); }
    // One line of the given kind: not one of the last dozen used, preferring lines written for this agent.
    pick(id, kind, who, sourcedOnly = false, now = Date.now()) {
      const p = this.pool(id);
      void this.ensure(id);
      const all = p.lines.filter((l) => l.kind === kind && (!sourcedOnly || !!l.source) && (!l.source || l.source.expiresAt > now) && (!l.who || l.who === who)
        && now - (p.lastAt.get(l.text) ?? -Infinity) >= 60_000 && now - (this.spokenAt.get(l.text) ?? -Infinity) >= GLOBAL_REPEAT_MS);
      const inLang = I.lang === 'en' && all.some((l) => l.en) ? all.filter((l) => l.en) : all; // English mode prefers lines that have an English mirror
      const fresh = inLang.filter((l) => !p.recent.includes(l.text));
      const own = fresh.filter((l) => l.who && l.who === who);
      const candidates = own.length && Math.random() < 0.6 ? own : fresh.filter((l) => !l.who || l.who === who);
      const list = candidates.length ? candidates : inLang.slice().sort((a, b) => p.recent.indexOf(a.text) - p.recent.indexOf(b.text)).slice(0, 1);
      if (!list.length) return null;
      const line = list[Math.floor(Math.random() * list.length)];
      p.recent = p.recent.filter((t) => t !== line.text);
      p.recent.push(line.text);
      p.lastAt.set(line.text, now);
      this.spokenAt.set(line.text, now);
      if (this.spokenAt.size > 600) for (const [text, at] of this.spokenAt) if (now - at >= GLOBAL_REPEAT_MS) this.spokenAt.delete(text);
      if (p.lastAt.size > 480) for (const [text, at] of p.lastAt) if (now - at >= 60_000) p.lastAt.delete(text);
      if (p.recent.length > 12) p.recent.shift();
      const spoken = I.line(line);
      return { text: fill(spoken.text), reply: spoken.reply && fill(spoken.reply), followUp: spoken.followUp && fill(spoken.followUp), answer: spoken.answer && fill(spoken.answer), source: line.source, concept: line.concept };
    }
  }

  class Life {
    constructor(view, { floorId = 'growth', onConversation = () => {}, onNews = () => {} } = {}) {
      this.view = view;
      this.floor = `floor:${floorId}`;
      this.pools = new Pools();
      this.onConversation = onConversation;
      this.onNews = onNews;
      this.nextAt = 0;
      this.busy = 0;
      this.history = [];
      this.seq = 0;
      this.timer = null;
    }
    start() {
      this.stop();
      void this.pools.ensure(this.floor);
      this.timer = setInterval(() => this.tick(), 1000);
    }
    stop() { clearInterval(this.timer); }
    deskOf(agent) { return agent.id.split('#')[0]; }
    poolFor(agent) { return this.pools.pool(this.deskOf(agent)).loadedAt === 0 || Math.random() < 0.5 ? this.deskOf(agent) : this.floor; }
    pickFor(agent, kind, sourcedOnly = false) {
      return this.pools.pick(this.deskOf(agent), kind, agent.name, sourcedOnly) ?? this.pools.pick(this.floor, kind, agent.name, sourcedOnly);
    }
    // agents that may leave their desk: idle, nobody talking to them, no open chat
    free() {
      const v = this.view;
      return v.agents.filter((a) => !v.isAway(a.id) && !v.pinned.has(a.id) && v.st[a.id]?.status === 'idle' && !v.talkedTo(a.id) && !v.speaking(a.id));
    }
    // Washing up: when the pile reaches the limit a free sim walks over and clears the counter dish by dish.
    clean(free) {
      const v = this.view;
      if (this.cleaning || v.dishes.length < window.OfficeLayout.DISH_LIMIT) return false;
      const a = this.random(free);
      this.cleaning = true; this.busy++;
      const ok = v.walkTo(a.id, window.OfficeLayout.SPOTS.dishes, { hold: true, pose: 'back', kind: 'clean', act: { type: 'clean' } });
      if (!ok) { this.busy--; this.cleaning = false; }
      return ok;
    }
    tick() {
      const v = this.view;
      if (document.hidden || !v.agents.length || v.t < this.nextAt || this.busy >= 2) return;
      const free = this.free();
      if (!free.length) return;
      if (this.clean(free)) { this.nextAt = v.t + 10; return; }
      const kinds = ['visit', 'visit', 'window', 'window', 'coffee', 'water', 'fridge', 'news', 'desk'];
      for (let tries = 0; tries < 4; tries++) {
        const kind = kinds[Math.floor(Math.random() * kinds.length)];
        if (this[kind] && this[kind](free)) { this.nextAt = v.t + START_GAP_S; return; }
      }
    }
    random(list) { return list[Math.floor(Math.random() * list.length)]; }

    // ---- activities (each returns true when it started) ----
    visit(free) {
      const v = this.view;
      if (free.length < 2) return false;
      const a = this.random(free);
      const b = this.random(free.filter((x) => x.id !== a.id));
      const ex = this.pickFor(a, 'visit');
      const turns = [ex?.text, ex?.reply, ex?.followUp, ex?.answer].filter(Boolean);
      if (turns.length < 2) return false;
      const thread = `conversation:${++this.seq}`;
      const record = { id: thread, a: a.id, b: b.id, turns: [], active: true, source: ex.source, lines: turns };
      this.history.push(record);
      if (this.history.length > 20) this.history.shift();
      this.busy++;
      const ok = v.walkTo(a.id, v.visitSpot(b), { hold: true, pose: 'stand', target: b.id, kind: 'visit', act: { type: 'visit', rid: thread } });
      if (!ok) { this.busy--; this.history.pop(); return false; }
      return true;
    }
    record(rid) { return this.history.find((r) => r.id === rid); }
    speak(rid, i) {
      const v = this.view;
      const rec = this.record(rid);
      if (!rec) return;
      const A = v.byId[rec.a], B = v.byId[rec.b];
      const cur = v.walkerOf(rec.a);
      // the host sat down busy, or somebody opened a chat: end politely
      if (!A || !B || !cur || i >= rec.lines.length || v.pinned.has(rec.a) || v.pinned.has(rec.b) || v.st[rec.b]?.status !== 'idle') { v.release(rec.a); return; }
      const speaker = i % 2 === 0 ? rec.a : rec.b;
      const text = rec.lines[i];
      const dur = turnDuration(text);
      rec.turns.push({ speakerId: speaker, text });
      v.say(speaker, text, { duration: dur * 1.6, thread: rec.id, source: rec.source, act: { type: 'talk', rid: rec.id } });
      v.schedule(dur, { type: 'speak', rid, i: i + 1 });
    }
    solo(free, { kind, spot, pose, stay = 5, sourcedOnly = false, fx, dish }) {
      const v = this.view;
      const a = this.random(free);
      const line = this.pickFor(a, kind, sourcedOnly);
      if (!line) return false;
      this.busy++;
      const ok = v.walkTo(a.id, spot, {
        stay: Math.max(stay, turnDuration(line.text) + 1.2), pose, kind,
        act: { type: 'solo', fx: fx ?? null, dish: dish ?? null, text: line.text, source: line.source ?? null },
      });
      if (!ok) this.busy--;
      return ok;
    }
    // ---- everything that used to be a callback is plain data handled here (so a refresh can resume mid-walk) ----
    onWalk(id, evt, act) {
      const v = this.view;
      if (!act) return;
      if (act.type === 'visit') { if (evt === 'arrive') this.speak(act.rid, 0); else { this.busy--; const r = this.record(act.rid); if (r) r.active = false; } }
      else if (act.type === 'solo') {
        if (evt === 'arrive') {
          if (act.fx) v.fx[act.fx] = { t0: v.t, night: v.darkness() >= 0.3 };
          v.say(id, act.text, { duration: turnDuration(act.text) * 1.6, source: act.source ?? undefined, act: act.source ? { type: 'news', source: act.source } : undefined });
        } else { this.busy--; if (act.dish) v.addDish(act.dish); }
      } else if (act.type === 'clean') {
        if (evt === 'arrive') {
          const talk = I.lang === 'en' ? ['The dishes are piling up, I will sort them out.', 'Who left all these cups?', 'Time to wash up.'] : ['Bulaşıklar birikmiş, ben hallederim.', 'Bu kadar kupayı kim bıraktı?', 'Yıkama zamanı geldi.'];
          v.say(id, talk[Math.floor(Math.random() * talk.length)], { duration: 4 });
          v.schedule(1.5, { type: 'wash', id });
        } else { this.busy--; this.cleaning = false; }
      }
    }
    onSched(act) {
      const v = this.view;
      if (act.type === 'speak') this.speak(act.rid, act.i);
      else if (act.type === 'wash') {
        if (!v.dishes.length || !v.walkerOf(act.id)) { v.release(act.id); return; }
        v.removeDish(); if (window.OfficeSfx?.glug) window.OfficeSfx.glug();
        v.schedule(0.65, act);
      }
    }
    onAct(act) {
      if (act.type === 'talk') { const r = this.record(act.rid); if (r) this.onConversation(r); }
      else if (act.type === 'news') this.onNews(act.source);
    }
    snapshot() { return { busy: this.busy, cleaning: this.cleaning, nextAt: this.nextAt, seq: this.seq, history: this.history }; }
    restore(s) { if (!s) return; this.busy = s.busy ?? 0; this.cleaning = !!s.cleaning; this.nextAt = s.nextAt ?? 0; this.seq = s.seq ?? 0; this.history = s.history ?? []; }
    window(free) {
      const spots = window.OfficeLayout.SPOTS.windows;
      const i = Math.floor(Math.random() * spots.length);
      return this.solo(free, { kind: 'window', spot: spots[i], pose: 'back', stay: 6, fx: `window${i}` });
    }
    coffee(free) { return this.solo(free, { kind: 'coffee', spot: window.OfficeLayout.SPOTS.coffee, pose: 'mug', stay: 5, fx: 'coffee', dish: 'mug' }); }
    fridge(free) { return this.solo(free, { kind: 'water', spot: window.OfficeLayout.SPOTS.fridge, pose: 'back', stay: 5, fx: 'fridge', dish: 'plate' }); }
    water(free) { return this.solo(free, { kind: 'water', spot: window.OfficeLayout.SPOTS.cooler, pose: 'stand', stay: 4, fx: 'cooler', dish: 'glass' }); }
    news(free) { return this.solo(free, { kind: 'news', spot: window.OfficeLayout.SPOTS.led, pose: 'back', stay: 7, sourcedOnly: true }); }
    desk(free) {
      const v = this.view;
      const a = this.random(free);
      const line = this.pickFor(a, 'desk');
      if (!line) return false;
      v.say(a.id, line.text, { duration: turnDuration(line.text) * 1.4 });
      return true;
    }
  }

  window.OfficeLife = { Life, Pools, turnDuration };
})();
