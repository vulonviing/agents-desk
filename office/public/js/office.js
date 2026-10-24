// Pixel-art open office scene (rendering, camera, walking, speech bubbles).
// The scene is drawn into a low-resolution buffer (W x H world "pixels") and scaled up with nearest-neighbour
// sampling; text (LED panel, name plates, speech) is drawn at screen resolution on top.
// Ported from the studio office of muratceme/minik-ajanlar and adapted to one wide open office.
(function () {
  'use strict';
  const L = window.OfficeLayout;
  const K = window.PixelKit;
  const DISPLAY = window.OfficeDisplayProfile ?? {external:false,textScale:1,catScale:1.1};
  const BG = window.OfficeBg;
  const { ENTITY_SCALE: S, W, H, WALL_H, DY, DOOR_Y, DOOR_X, WINDOWS, KITCHEN, VCOUNTER, UCAB, LRUN, COFFEE, CL, FR, FLOOR_LED, LED, CLOCK, BOOKS, BOARD, TITLE, NOTES, PINS, WALK_Y, PLANTS, PROPS } = L;
  const I = window.OfficeI18n;
  const FONT = '"Pixelify Sans", ui-monospace, monospace';
  const SFX = () => window.OfficeSfx || {};
  const SCREEN_LIGHT = { typing: '#7fa6ff', thinking: '#8f9cff', idle: '#4d5b9a', error: '#ff4f6d' };
  // How long each object reacts to a click (seconds); a second click during that time is ignored
  const FX_DUR = { plant0: 1.3, plant1: 1.3, plant2: 1.3, plant3: 1.3, plant4: 1.3, coffee: 2.6, cooler: 1.8, fridge: 4.5, clock: 2.0, books: 1.6, boardTap: 2, door: 3.0, window0: 3.2, window1: 3.2, window2: 3.2, window3: 3.2 };
  const WALK_SPEED = 62;
  const CAT_SCALE = DISPLAY.catScale; // Leya is smaller than the office characters.
  // Desks held at their chair by an open chat: local pins plus those reported by other screens sharing this scene.
  class PinSet extends Set {
    remote = new Set();
    has(id) { return super.has(id) || this.remote.has(id); }
    get size() { return super.size + this.remote.size; }
  }
  const R = 2; // the scene buffer has twice the world resolution so 150% sprites keep an even pixel grid

  function polyLen(pts) {
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return len;
  }
  function pointAt(pts, d) {
    for (let i = 1; i < pts.length; i++) {
      const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (d <= seg || i === pts.length - 1) {
        const k = seg ? Math.min(1, d / seg) : 1;
        return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k, dx: pts[i].x - pts[i - 1].x };
      }
      d -= seg;
    }
    return { ...pts[pts.length - 1], dx: 0 };
  }
  // Standing, seen from behind (looking out of the window): the seated back view plus legs
  function standBack(look) {
    const legs = K.make(K.CW, K.CH, (P) => {
      const q = (x, y, w, h, c) => P(x + K.OX, y + K.OY, w, h, c);
      const dark = K.tone(look.pants, -0.35);
      q(2, 17, 3, 4, look.pants); q(4, 17, 1, 4, dark); q(7, 17, 3, 4, look.pants); q(9, 17, 1, 4, dark); q(2, 16, 8, 1, dark);
      q(1, 21, 4, 2, '#2b2233'); q(7, 21, 4, 2, '#2b2233');
    });
    const out = K.make(K.CW, K.CH, () => {});
    const g = out.getContext('2d');
    g.drawImage(K.selout(legs), 0, 0);
    g.drawImage(K.back(look, 0), 0, 0);
    return out;
  }

  class OfficeView {
    constructor(canvas, handlers = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.buf = document.createElement('canvas');
      this.buf.width = W * R;
      this.buf.height = H * R;
      this.b = this.buf.getContext('2d');
      this.handlers = handlers;
      this.agents = [];
      this.byId = {};
      this.st = {};
      this.walks = {};
      this.bubbles = [];
      this.bubbleHits = [];
      this.pinned = new PinSet(); // agents that must stay at their desk (open chat)
      this.follower = false; // a follower only displays the leader's shared snapshot and never decides anything
      this.selected = null;
      this.particles = [];
      this.fx = {};
      this.motes = Array.from({ length: 22 }, (_, i) => ({ seed: i * 7.31, w: i % WINDOWS.length }));
      this.cat = window.OfficeCat.create(L.CAT_HOME);
      this.news = { articles: [], refreshing: false, error: null };
      this.weatherInfo = null; // { configured, weather } from /api/weather
      this.cli = 'claude'; // CLI used by the chats: shown by the red pin on the cork board
      this.locOn = false; // weather location: shown by the green pin
      this.pinAnim = null;
      this.dishes = []; // used mugs, glasses and plates piling up on the lower counter
      this.usage = null; // { available, providers: { claude, codex, antigravity } } from Agents Deck, via /api/usage
      this.led = { index: 0, at: 0, paused: false, flip: -10 };
      this.t = 0;
      this.lastT = 0;
      this.tOff = 0; // sim clock = animation clock + offset (restored after a refresh so animations continue)
      this.sched = []; // timed events: { at, act }
      this.cam = { x: W / 2, y: H / 2, z: 1 };
      this.view = { sx0: 0, sy0: 0, s: 2 };
      this.cache = new Map();
      this.nav = new window.OfficeNav(W, H, []);
      this.drag = null;
      this.bg = this.buildBackground();
      new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
      canvas.addEventListener('pointerdown', (e) => this.onDown(e));
      canvas.addEventListener('pointermove', (e) => this.onMove(e));
      canvas.addEventListener('pointerup', (e) => this.onUp(e));
      canvas.addEventListener('pointerleave', () => { this.led.paused = false; });
      canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
      this.resize();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => this.draw());
      const loop = (ts) => { this.t = ts / 1000 + this.tOff; this.update(); this.draw(); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }

    // ---------- roster and state ----------
    setRoster(list) {
      const known = new Set(this.agents.map((a) => a.id));
      this.agents = list;
      this.byId = Object.fromEntries(list.map((a) => [a.id, a]));
      for (const a of list) if (!this.st[a.id]) this.st[a.id] = { status: 'idle', tag: 'tag.ready', seed: Math.random() * 1000 };
      for (const id of [...known]) if (!this.byId[id]) { delete this.walks[id]; delete this.st[id]; }
      this.buildNav();
    }
    setStatus(id, status, tag) {
      const s = this.st[id];
      if (!s) return;
      window.OfficeScreens.setStatus(s.seed, status, this.t);
      s.status = status;
      if (tag) s.tag = tag;
    }
    setNews(news) { this.news = news; this.led.index %= Math.max(1, news.articles.length); }
    setUsage(u) { this.usage = u; }
    setWeather(info) { this.weatherInfo = info; if (info?.weather) this.lastWeather = info.weather; } // the last data stays pinned while an agent takes the cards down
    weatherLine() {
      const w = this.weatherInfo?.weather;
      if (!this.weatherInfo?.configured) return I.t('led.noLocation');
      if (!w) return I.t('led.noWeather');
      return `${I.t('led.weather')} · ${w.city ? w.city + ' · ' : ''}${Math.round(w.temperature)}° · ${I.describe(w.code)}`;
    }
    deskSize(A) { return A.big ? { w: 68, h: 20 } : { w: 56, h: 18 }; }
    seatX(A) { return A.x + 15; }
    // desks, sims and the cat are scaled about a ground anchor; ent() maps a point of the unscaled desk drawing into the world
    anchor(A) { const { w, h } = this.deskSize(A); return { x: A.x + w / 2, y: A.y + h }; }
    ent(A, x, y) { const a = this.anchor(A); return { x: a.x + (x - a.x) * S, y: a.y + (y - a.y) * S }; }
    // inverse of ent(): a world point expressed in the unscaled drawing of the desk
    unent(A, x, y) { const a = this.anchor(A); return { x: a.x + (x - a.x) / S, y: a.y + (y - a.y) / S }; }
    scaled(ax, ay, fn, scale = S) {
      const b = this.b;
      b.save();
      b.translate(ax, ay);
      b.scale(scale, scale);
      b.translate(-ax, -ay);
      fn();
      b.restore();
    }
    side(A) { const { h } = this.deskSize(A); return this.ent(A, A.x - 8, A.y + h + 4); }
    // free standing point next to a desk (where a visitor stops)
    visitSpot(A) { const { h } = this.deskSize(A); return this.ent(A, A.x - 6, A.y + h + 6); }

    buildNav() {
      const rects = [[0, 0, W, WALL_H + 15]];
      for (const A of this.agents) { const { w } = this.deskSize(A); const p0 = this.ent(A, A.x - 3, A.y - 22); const p1 = this.ent(A, A.x + w + 3, A.y + 20); rects.push([p0.x, p0.y, p1.x, p1.y]); }
      for (const pl of PLANTS) rects.push([pl.x + 2, pl.y + 18, pl.x + 20, pl.y + 30]);
      rects.push([UCAB.x, UCAB.y, UCAB.x + UCAB.w, UCAB.y + UCAB.h], [VCOUNTER.x, VCOUNTER.y, VCOUNTER.x + VCOUNTER.w + 6, VCOUNTER.y + VCOUNTER.h], [LRUN.x, LRUN.y, LRUN.x + LRUN.w, LRUN.y + LRUN.h], [CL.x - 2, CL.y, CL.x + CL.w + 2, CL.y + CL.h]); // kitchen furniture
      rects.push([FR.x - 1, FR.y, FR.x + FR.w + 1, FR.y + FR.h]); // fridge
      rects.push([282,332,318,350]); // Solid hearth; seat feet remain walkable.
      for(const p of L.HEARTH.seats)rects.push([p.x-15,p.y-32,p.x+15,p.y-9]);
      this.nav = new window.OfficeNav(W, H, rects);
    }

    // ---------- walking ----------
    // walks carry a plain-data `act` (never a function) so the whole scene can be saved and resumed after a page refresh
    walkEvent(id, evt, act) {
      if (act?.type === 'pin' && evt === 'arrive' && this.pinAnim) this.pinAnim.t0 = this.t;
      if (this.handlers.onWalk) this.handlers.onWalk(id, evt, act);
    }
    schedule(delay, act) { this.sched.push({ at: this.t + delay, act }); }
    // dest: world point. opts: stay (s) or hold (until release), pose stand|back|mug, target (agent being visited), onArrive, onDone
    walkTo(id, dest, opts = {}) {
      const A = this.byId[id];
      if (!A || this.walks[id]?.cur || this.pinned.has(id)) return false;
      const path = this.nav.path(opts.from ?? this.side(A), dest);
      const back=opts.backToDesk?this.nav.path(dest,this.side(A)):[...path].reverse();
      this.walks[id] = { cur: { path, back, backLen:polyLen(back), phase: 'go', t0: this.t, len: polyLen(path), stay: opts.stay ?? 2, hold: !!opts.hold, pose: opts.pose || 'stand', target: opts.target || null, act: opts.act ?? null, kind: opts.kind || 'walk' } };
      return true;
    }
    release(id) {
      const c = this.walks[id]?.cur;
      if (!c) return;
      c.hold = false;
      if (c.phase === 'stay') { c.phase = 'back'; c.t0 = this.t; }
    }
    walkerOf(id) { return this.walks[id]?.cur ?? null; }
    isAway(id) { return !!this.walkerOf(id); }
    walkPos(c) {
      if (c.phase === 'stay') return { ...c.path[c.path.length - 1], moving: false, dx: 0 };
      const pts = c.phase === 'go' ? c.path : c.back;
      const length=c.phase==='back'?(c.backLen??polyLen(c.back)):c.len;
      const d = Math.min(length, (this.t - c.t0) * WALK_SPEED);
      return { ...pointAt(pts, d), moving: d < length };
    }
    posOf(id) { const c = this.walkerOf(id); return c ? this.walkPos(c) : null; }
    // somebody stands at this desk and talks to its owner (the owner turns around)
    talkedTo(id) { return Object.values(this.walks).some((w) => w.cur && w.cur.phase === 'stay' && w.cur.target === id); }
    unpin(id) { this.pinned.delete(id); }

    // ---------- speech ----------
    // opts: duration (s), fill, shade, source, thread, onClick, at:{wx,wy}
    say(id, text, opts = {}) {
      this.bubbles = this.bubbles.filter((b) => b.id !== id || b.at);
      this.bubbles.push({ id, text, until: this.t + (opts.duration ?? 4), fill: opts.fill, shade: opts.shade, source: opts.source, thread: opts.thread, act: opts.act, onClick: opts.onClick, at: opts.at, n: this.bubbles.length });
    }
    clearSpeech(id) { this.bubbles = this.bubbles.filter((b) => b.id !== id); }
    speaking(id) { return this.bubbles.some((b) => b.id === id && b.until > this.t); }

    // ---------- camera and input ----------
    resize() {
      const wrap = this.canvas.parentElement;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const cw = Math.max(1, wrap.clientWidth);
      const ch = Math.max(1, wrap.clientHeight);
      this.dpr = dpr;
      this.canvas.width = Math.round(cw * dpr);
      this.canvas.height = Math.round(ch * dpr);
      this.canvas.style.width = cw + 'px';
      this.canvas.style.height = ch + 'px';
      this.base = Math.min(this.canvas.width / W, this.canvas.height / H);
      this.compact = this.base / dpr < 1.45;
      this.clampCam();
    }
    scale() { return Math.max(0.5, this.base * this.cam.z); }
    clampCam() {
      const s = this.scale();
      const vw = this.canvas.width / s;
      const vh = this.canvas.height / s;
      this.cam.x = vw >= W ? W / 2 : Math.max(vw / 2, Math.min(W - vw / 2, this.cam.x));
      this.cam.y = vh >= H ? H / 2 : Math.max(vh / 2, Math.min(H - vh / 2, this.cam.y));
    }
    setZoom(z, anchorClient) {
      const rect = this.canvas.getBoundingClientRect();
      const ax = anchorClient ? anchorClient.x - rect.left : rect.width / 2;
      const ay = anchorClient ? anchorClient.y - rect.top : rect.height / 2;
      const before = this.screenToWorld(ax, ay);
      this.cam.z = Math.max(1, Math.min(5, z));
      const s = this.scale();
      // keep the world point under the cursor fixed
      this.cam.x = before.x - ((ax * this.dpr) - this.canvas.width / 2) / s;
      this.cam.y = before.y - ((ay * this.dpr) - this.canvas.height / 2) / s;
      this.clampCam();
      if (this.handlers.onZoom) this.handlers.onZoom(this.cam.z);
    }
    resetView() { this.cam = { x: W / 2, y: H / 2, z: 1 }; this.clampCam(); if (this.handlers.onZoom) this.handlers.onZoom(1); }
    screenToWorld(cssX, cssY) {
      const s = this.scale();
      return { x: this.cam.x + (cssX * this.dpr - this.canvas.width / 2) / s, y: this.cam.y + (cssY * this.dpr - this.canvas.height / 2) / s };
    }
    onWheel(e) {
      e.preventDefault();
      this.setZoom(this.cam.z * (e.deltaY < 0 ? 1.15 : 1 / 1.15), { x: e.clientX, y: e.clientY });
    }
    onDown(e) {
      this.canvas.setPointerCapture(e.pointerId);
      this.drag = { x: e.clientX, y: e.clientY, cx: this.cam.x, cy: this.cam.y, moved: false };
    }
    onMove(e) {
      if (this.drag) {
        const dx = e.clientX - this.drag.x;
        const dy = e.clientY - this.drag.y;
        if (Math.hypot(dx, dy) > 5) this.drag.moved = true;
        if (this.drag.moved) {
          const s = this.scale();
          this.cam.x = this.drag.cx - (dx * this.dpr) / s;
          this.cam.y = this.drag.cy - (dy * this.dpr) / s;
          this.clampCam();
          this.canvas.style.cursor = 'grabbing';
          return;
        }
      }
      const hit = this.pick(e.clientX, e.clientY);
      this.led.paused = hit?.id === 'led';
      this.canvas.style.cursor = hit ? 'pointer' : 'default';
    }
    onUp(e) {
      const drag = this.drag;
      this.drag = null;
      if (!drag || drag.moved) return;
      this.handleClick(e);
    }

    // ---------- helpers ----------
    P(x, y, w, h, c) { this.b.fillStyle = c; this.b.fillRect(Math.round(x), Math.round(y), w, h); }
    spr(key, make) {
      let s = this.cache.get(key);
      if (!s) { s = make(); this.cache.set(key, s); }
      return s;
    }
    blit(img, x, y) { this.b.drawImage(img, Math.round(x), Math.round(y)); }
    blitFlip(img, x, y) {
      const b = this.b;
      b.save();
      b.translate(Math.round(x) + img.width, Math.round(y));
      b.scale(-1, 1);
      b.drawImage(img, 0, 0);
      b.restore();
    }
    shadow(cx, cy, rw, rh, a = 0.32) {
      const b = this.b;
      b.fillStyle = `rgba(28,14,30,${a})`;
      for (let dy = -rh; dy <= rh; dy++) {
        const half = Math.round(rw * Math.sqrt(1 - (dy * dy) / ((rh + 0.5) * (rh + 0.5))));
        b.fillRect(Math.round(cx - half), Math.round(cy + dy), half * 2, 1);
      }
    }
    darkness() {
      const ov = window.OFFICE_HOUR;
      const d = new Date();
      const h = ov !== undefined ? Number(ov) : d.getHours() + d.getMinutes() / 60;
      if (h >= 8 && h < 17) return 0;
      if (h >= 17 && h < 19) return (h - 17) / 2 * 0.3;
      if (h >= 19 && h < 21) return 0.3 + (h - 19) / 2 * 0.2;
      if (h >= 21 || h < 5) return 0.56;
      if (h >= 5 && h < 8) return 0.56 - (h - 5) / 3 * 0.56;
      return 0;
    }

    // ---------- static background (once) ----------
    buildBackground() {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d');
      const P = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
      const r = K.rng(7);
      BG.wall(P, r, W);
      BG.floor(P, g, r, W, H);
      BG.rug(P, 8, 150, 480, 184, '#2f4b5e', '#3e6178', '#7fb2c4');
      BG.windowFrames(P, WINDOWS);
      BG.led(P, g, LED);
      BG.board(P, r, BOARD);
      g.save(); g.translate(0, DOOR_Y - 6); BG.door(P, DOOR_X); g.restore();
      BG.kitchenL(P, { VCOUNTER, UCAB, LRUN });
      g.save(); g.translate(COFFEE.x - 12, COFFEE.y - 216); BG.coffee(P); g.restore();
      g.save(); g.translate(CL.x - 92, CL.y - 204); BG.cooler(P); g.restore();
      return c;
    }

    // ---------- update ----------
    update() {
      const dt = Math.min(0.1, Math.max(0, this.t - this.lastT));
      this.lastT = this.t;
      this.particles = this.particles.filter((p) => this.t - p.born < p.life);
      this.bubbles = this.bubbles.filter((b) => b.until > this.t);
      this.catUpdate();
      if (this.follower) return;
      for (const [id, w] of Object.entries(this.walks)) {
        const c = w.cur;
        if (!c) continue;
        const el = this.t - c.t0;
        if (c.phase === 'go' && el >= c.len / WALK_SPEED) { c.phase = 'stay'; c.t0 = this.t; this.walkEvent(id, 'arrive', c.act); }
        else if (c.phase === 'stay' && !c.hold && el >= c.stay) { c.phase = 'back'; c.t0 = this.t; }
        else if (c.phase === 'back' && el >= (c.backLen??polyLen(c.back)) / WALK_SPEED) { w.cur = null; this.walkEvent(id, 'done', c.act); }
      }
      if (this.sched.length) { const due = this.sched.filter((e) => e.at <= this.t); if (due.length) { this.sched = this.sched.filter((e) => e.at > this.t); for (const e of due) if (this.handlers.onSched) this.handlers.onSched(e.act); } }
      const pa = this.pinAnim;
      if (pa && pa.kind === 'lang' && pa.t0 != null && !pa.switched && this.t - pa.t0 >= pa.switchAt) { pa.switched = true; I.set(pa.to); }
      if(pa&&['display','refresh','usage'].includes(pa.kind)&&pa.t0!=null&&!pa.switched&&this.t-pa.t0>=pa.switchAt){pa.switched=true;this.applyBoardAction(pa.kind,pa.to);}
      if (pa && ((pa.t0 != null && this.t - pa.t0 > pa.total + 0.5) || (pa.t0 == null && this.t - pa.created > 25))) {
        if (pa.kind === 'cli') this.cli = pa.to; else if(pa.kind==='loc')this.locOn = pa.to; else if(['display','refresh','usage'].includes(pa.kind)&&!pa.switched)this.applyBoardAction(pa.kind,pa.to);
        this.pinAnim = null;
        if (pa.agentId) this.release(pa.agentId);
      }
      void dt;
    }

    // ---------- draw ----------
    draw() {
      const b = this.b;
      b.imageSmoothingEnabled = false;
      b.globalCompositeOperation = 'source-over';
      b.globalAlpha = 1;
      b.setTransform(R, 0, 0, R, 0, 0);
      b.drawImage(this.bg, 0, 0);
      const dark = this.darkness();
      this.drawWindows(dark);
      this.drawWallDynamic();
      this.drawPropFx();
      this.drawBoardNotes();
      this.drawFloorCable();
      this.drawFloorLed();
      this.drawPowerPads();
      this.drawNewsDeliverySlot();
      this.kitchen?.drawBase();
      this.fireplace?.drawRug();
      const ents = [];
      this.fireplace?.entities(ents);
      for (const A of this.agents) ents.push({ y: A.y + this.deskSize(A).h, fn: () => {this.drawStation(A);this.kitchen?.drawDesk(A.id);if(!this.isAway(A.id)){this.kitchen?.drawActor(A.id);if(this.newsDelivery?.id===A.id)this.drawNewsDelivery();}} });
      PLANTS.forEach((pl, i) => ents.push({ y: pl.y + 28, fn: () => this.drawPlant(i) }));
      ents.push({ y: this.cat.surface === 'counter' || this.cat.mode === 'jump' && this.cat.jump?.surface === 'counter' ? LRUN.y + LRUN.h + 3 : this.cat.y + 9, fn: () => this.drawCat() });
      ents.push({ y: FR.y + FR.h, fn: () => this.drawFridge() });
      ents.push({ y: LRUN.y + LRUN.h + 1, fn: () => this.drawDishes() });
      for (const [id, w] of Object.entries(this.walks)) if (w.cur) ents.push({ y: this.walkPos(w.cur).y, fn: () => {this.drawWalker(id,w.cur);this.kitchen?.drawActor(id);if(this.newsDelivery?.id===id)this.drawNewsDelivery();} });
      ents.sort((a, c) => a.y - c.y);
      for (const e of ents) e.fn();
      this.drawPinFlight();
      this.drawParticles();
      this.fireplace?.captureLight();
      this.drawLighting(dark);
      this.fireplace?.drawLight();
      this.drawVignette();
      this.drawFloorDisplayGlow(dark);
      this.drawCableEmission();
      this.drawCableConnectorLights();
      this.drawBoardTapGlow();

      const ctx = this.ctx;
      const s = this.scale();
      const vw = this.canvas.width / s;
      const vh = this.canvas.height / s;
      const sx0 = this.cam.x - vw / 2;
      const sy0 = this.cam.y - vh / 2;
      this.view = { sx0, sy0, s };
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#0f1018';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      const x0 = Math.max(0, sx0), y0 = Math.max(0, sy0), x1 = Math.min(W, sx0 + vw), y1 = Math.min(H, sy0 + vh);
      ctx.drawImage(this.buf, x0 * R, y0 * R, (x1 - x0) * R, (y1 - y0) * R, (x0 - sx0) * s, (y0 - sy0) * s, (x1 - x0) * s, (y1 - y0) * s);

      this.u = Math.max(1, Math.round(Math.min(s, this.base * 1.6)));
      this.drawLedText();
      this.drawBoardText();
      for (const A of [...this.agents].sort((a, c) => a.y - c.y)) this.drawLabel(A);
      this.drawCatName();
      this.drawBubbles();
      this.updateZoomLabel();
    }
    updateZoomLabel() {
      if (this._zoomShown !== this.cam.z && this.handlers.onZoom) { this._zoomShown = this.cam.z; this.handlers.onZoom(this.cam.z); }
    }

    // ---------- windows, sky, light shafts ----------
    drawWindows(dark) {
      const t = this.t;
      for (const [wi, w] of WINDOWS.entries()) {
        const x0 = w.x;
        const y0 = w.y;
        const day = ['#7cc4f5', '#98d2f7', '#b6e0fa'];
        const eve = ['#5a4a9a', '#c86a8a', '#ffb07a'];
        const night = ['#141a3c', '#1b2350', '#252d62'];
        const sky = dark >= 0.4 ? night : dark > 0.05 ? eve : day;
        for (let y = 0; y < w.h; y++) {
          const band = Math.min(2, Math.floor((y / w.h) * 3));
          this.P(x0, y0 + y, w.w, 1, sky[band]);
          if (band < 2 && y % (Math.floor(w.h / 3)) > Math.floor(w.h / 3) - 3) for (let x = y % 2; x < w.w; x += 2) this.P(x0 + x, y0 + y, 1, 1, sky[band + 1]);
        }
        if (dark >= 0.4) {
          for (let i = 0; i < 9; i++) { const sx = x0 + ((i * 37 + w.x) % w.w); const sy = y0 + ((i * 13) % 20); if (Math.sin(t * 2 + i) > -0.6) this.P(sx, sy, 1, 1, '#f4f1ff'); }
          if (wi === 1) { this.P(x0 + 48, y0 + 5, 6, 6, '#f4efc8'); this.P(x0 + 50, y0 + 5, 4, 4, '#1b2350'); }
        } else {
          if (wi === 0) { this.P(x0 + 50, y0 + 6, 7, 7, dark > 0.05 ? '#ffd27a' : '#fff4c2'); this.P(x0 + 51, y0 + 5, 5, 9, dark > 0.05 ? '#ffd27a' : '#fff4c2'); }
          for (let i = 0; i < 2; i++) this.cloud(x0 + ((t * (3 + i) + i * 40 + w.x) % (w.w + 30)) - 20, y0 + 8 + i * 9, x0, x0 + w.w);
        }
        const bc = dark >= 0.4 ? '#0e1230' : dark > 0.05 ? '#4a3a6a' : '#6d8fb8';
        const r = K.rng(w.x);
        let bx = x0;
        while (bx < x0 + w.w) {
          const bw = 6 + Math.floor(r() * 8);
          const bh = 8 + Math.floor(r() * 14);
          const ww = Math.min(bw, x0 + w.w - bx);
          this.P(bx, y0 + w.h - bh, ww, bh, bc);
          if (dark >= 0.25) for (let yy = y0 + w.h - bh + 2; yy < y0 + w.h - 1; yy += 3) for (let xx = bx + 1; xx < bx + ww - 1; xx += 2) if (r() < 0.35) this.P(xx, yy, 1, 1, '#ffd77a');
          bx += bw;
        }
        this.P(x0 + w.w / 2 - 1, y0, 2, w.h, '#e6dccb');
        this.P(x0, y0 + w.h / 2 - 1, w.w, 2, '#e6dccb');
        this.P(x0 + w.w / 2 - 1, y0, 1, w.h, '#fff6e6');
        for (let i = 0; i < 6; i++) this.P(x0 + 4 + i, y0 + 12 - i, 1, 1, 'rgba(255,255,255,0.35)');
      }
      const beam = Math.max(0, 1 - dark * 3);
      if (beam > 0) {
        const b = this.b;
        for (const w of WINDOWS) {
          b.fillStyle = `rgba(255,236,190,${0.075 * beam})`;
          b.beginPath();
          b.moveTo(w.x + 2, w.y + w.h + 4);
          b.lineTo(w.x + w.w - 2, w.y + w.h + 4);
          b.lineTo(w.x + w.w + 60, w.y + w.h + 150);
          b.lineTo(w.x + 50, w.y + w.h + 150);
          b.closePath();
          b.fill();
        }
        for (const m of this.motes) {
          const w = WINDOWS[m.w % WINDOWS.length];
          const k = ((this.t * 0.04 + m.seed * 0.137) % 1);
          const x = w.x + 10 + ((m.seed * 13) % (w.w - 10)) + k * 50 + Math.sin(this.t + m.seed) * 3;
          const y = w.y + w.h + 8 + k * 130;
          this.P(x, y, 1, 1, `rgba(255,246,220,${Math.sin(k * Math.PI) * 0.7 * beam})`);
        }
      }
    }
    cloud(cx, cy, minX, maxX) {
      const put = (x, y, w, h) => { const a = Math.max(minX, x); const bb = Math.min(maxX, x + w); if (bb > a) this.P(a, y, bb - a, h, 'rgba(255,255,255,0.9)'); };
      put(cx, cy + 2, 16, 3); put(cx + 3, cy, 8, 2); put(cx + 9, cy + 1, 5, 1);
    }

    drawWallDynamic() {
      const t = this.t;
      this.b.save(); this.b.translate(COFFEE.x - 12, COFFEE.y - 216);
      for (let i = 0; i < 3; i++) {
        const k = ((t * 0.6 + i / 3) % 1);
        this.P(23 + Math.sin(t * 3 + i * 2) * 1.5, 232 - k * 14, 1, 2, `rgba(255,255,255,${0.6 * (1 - k)})`);
      }
      this.P(31, 219, 2, 1, Math.floor(t * 1.5) % 2 ? '#ff5c7a' : '#7a2030');
      this.b.restore();
      this.b.save(); this.b.translate(CL.x - 92, CL.y - 204);
      for (let i = 0; i < 3; i++) {
        const k = ((t * 0.35 + i * 0.37) % 1);
        this.P(98 + i * 3, 223 - k * 16, 1, 1, 'rgba(255,255,255,0.8)');
      }
      this.b.restore();
      // red lamp above the board (top left): lit at night, dark glass by day
      const lampOn = Math.max(0, Math.min(1, (this.darkness() - 0.05) / 0.35));
      this.P(BOARD.x + 1, 0, 9, 3, '#1a1222'); this.P(BOARD.x + 2, 3, 7, 1, '#2a1c16');
      this.P(BOARD.x + 3, 4, 5, 4, lampOn > 0.5 ? '#ff5c6a' : '#6a2430'); this.P(BOARD.x + 3, 4, 2, 1, lampOn > 0.5 ? '#ffd0d6' : '#8a3a44');
      // LED panel scan line
      const sy = LED.y + 2 + Math.floor((t * 6) % (LED.h - 4));
      this.P(LED.x, sy, LED.w, 1, 'rgba(60,207,142,0.07)');
    }

    // Flush-mounted floor display: recessed wood lip, dark glass, no legs or raised enclosure.
    pulseFloor() { if(this.floorDisplayActive)return; this.floorPulses = [...(this.floorPulses ?? []).filter(p => this.t - p.at < L.FLOOR_SIGNAL.total), { at: this.t }].slice(-6); }
    floorCablePaths() {
      const paths = [L.FLOOR_CABLE], a = this.byId['emrecan-cv#project'];
      if (a) {
        const size = this.deskSize(a), p = this.ent(a, a.x + size.w + 2, a.y + size.h);
        const bottom = FLOOR_LED.y + FLOOR_LED.h + 3, endY = FLOOR_LED.y + FLOOR_LED.h - 12;
        paths.push([[p.x, p.y], [p.x, bottom], [FLOOR_LED.x - 9, bottom], [FLOOR_LED.x - 9, endY], [FLOOR_LED.x - 1, endY]]);
      }
      return paths;
    }
    floorCablePoint(distance, path = L.FLOOR_CABLE) {
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (distance <= length) return { x: a[0] + (b[0] - a[0]) * distance / length, y: a[1] + (b[1] - a[1]) * distance / length };
        distance -= length;
      }
      const p = path.at(-1); return { x: p[0], y: p[1] };
    }
    floorCablePorts(path){
      const first=path[0];
      return {inlet:{x:first[0],y:first[1]<WALL_H?WALL_H+3:first[1]+8},outlet:{x:path.at(-2)[0],y:path.at(-2)[1]}};
    }
    drawCableGrommet(x,y,horizontal=false,wide=false){
      // Recessed gland: warm metal rim, dark opening, and a foreground lip over the cable.
      const w=horizontal?6:wide?14:12,h=horizontal?8:5;
      this.P(x-w/2-1,y+1,w+2,h/2+1,'rgba(25,16,24,.35)');
      this.P(x-w/2,y-h/2,w,h,'#493b35');
      this.P(x-w/2+1,y-h/2,w-2,1,'#b09b77');
      this.P(x-w/2+1,y-h/2+1,w-2,h-2,'#776954');
      if(horizontal){
        this.P(x-1,y-2,3,4,'#101c23');this.P(x,y-1,3,2,'#345367');
      }else{
        this.P(x-3,y-1,6,2,'#111c25');this.P(x-1,y-1,2,2,'#6199a3');
        this.P(x-w/2+2,y+1,w-4,1,'#a28c6a');
      }
    }
    floorCableTransmission(distance, path) {
      const length = path.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - path[i][0], p[1] - path[i][1]), 0);
      const exposedStart = this.floorCablePorts(path).inlet.y-path[0][1];
      const last = path.at(-1), before = path.at(-2), exposedEnd = Math.hypot(last[0] - before[0], last[1] - before[1]);
      const surface = Math.max(Math.max(0, Math.min(1, (exposedStart - distance) / 6)), Math.max(0, Math.min(1, (distance - length + exposedEnd + 4) / 6)));
      return .16 + .84 * surface;
    }
    drawCableConnectorLights() {
      const b = this.b;
      b.save(); b.globalCompositeOperation = 'screen';
      for (const [index, path] of this.floorCablePaths().entries()) for (const [end, p] of [path[0], path.at(-1)].entries()) {
        const wide = index === 1 && end === 0, radius = wide ? 17 : 11;
        const glow = b.createRadialGradient(p[0], p[1], 0, p[0], p[1], radius);
        glow.addColorStop(0, 'rgba(159,255,186,.8)'); glow.addColorStop(.2, 'rgba(61,237,130,.48)'); glow.addColorStop(1, 'rgba(32,190,93,0)');
        b.fillStyle = glow; b.fillRect(p[0] - radius, p[1] - radius, radius * 2, radius * 2);
        this.P(p[0] - (wide ? 3 : 1), p[1] - 1, wide ? 6 : 2, 2, '#a1ffbc');
      }
      b.restore();
    }
    drawFloorCable() {
      const b = this.b;
      for (const [index, path] of this.floorCablePaths().entries()) {
      const ports=this.floorCablePorts(path);
      // Only the exposed wall lead and display connector are visible. The floor run is buried.
      for (const [width, color] of [[index === 1 ? 6 : 4, '#111b26'], [index === 1 ? 4 : 2, '#345367'], [index === 1 ? 2 : 1, '#6199a3']]) {
        b.beginPath(); b.strokeStyle = color; b.lineWidth = width;
        b.moveTo(...path[0]); b.lineTo(ports.inlet.x,ports.inlet.y);
        b.moveTo(...path.at(-2)); b.lineTo(...path.at(-1)); b.stroke();
      }
      this.drawCableGrommet(ports.inlet.x,ports.inlet.y,false,index===1);
      this.drawCableGrommet(ports.outlet.x,ports.outlet.y,true);
      for (const [end, [x, y]] of [path[0], path.at(-1)].entries()) { const w = index === 1 && end === 0 ? 10 : 6; this.P(x - w / 2, y - 3, w, 6, '#162c37'); this.P(x - w / 2 + 1, y - 2, w - 2, 4, '#709b85'); this.P(x - 1, y - 1, 2, 2, '#334d60'); }
      }
    }
    drawPowerPads(){
      const b=this.b;
      for(const [key,pad] of Object.entries(L.FLOOR_POWER_PADS)){
        const pressed=this.floorPowerJump?.on===(key==='on')&&this.t-this.floorPowerJump.at>=1&&this.t-this.floorPowerJump.at<1.25,dy=pressed?1:0;
        this.P(pad.x,pad.y+2,pad.w,pad.h,'#101c20');this.P(pad.x,pad.y+dy,pad.w,pad.h-2,key==='on'?'#486953':'#754c46');this.P(pad.x+1,pad.y+dy,pad.w-2,1,'#98ab9b');
        b.save();b.font=`400 4px ${FONT}`;b.textAlign='center';b.fillStyle='#e1eee1';b.fillText(key.toUpperCase(),pad.x+pad.w/2,pad.y+5+dy);b.restore();
      }
    }
    drawFloorDisplayGlow(dark) {
      if (!this.floorDisplayActive) return;
      const b = this.b, f = FLOOR_LED, strength = .12 + Math.min(1, dark * 2) * .18;
      b.save(); b.globalCompositeOperation = 'screen';
      // Light only the surrounding parquet; the HTML display and sprite layers retain their own pixels.
      b.beginPath(); b.rect(f.x - 22, f.y - 22, f.w + 44, f.h + 44); b.rect(f.x, f.y, f.w, f.h); b.clip('evenodd');
      b.shadowColor = `rgba(87,215,232,${strength * 1.6})`;
      b.shadowBlur = 14 * R; b.lineWidth = 3;
      b.strokeStyle = `rgba(123,232,242,${strength})`;
      b.beginPath(); b.roundRect(f.x, f.y, f.w, f.h, 3);
      for (let pass = 0; pass < 3; pass++) b.stroke();
      b.restore();
    }
    drawCableEmission() {
      const b = this.b, signal = L.FLOOR_SIGNAL;
      this.floorPulses = (this.floorPulses ?? []).filter(p => this.t - p.at < signal.total);
      if (!this.floorPulses.length) return;
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      b.save(); b.globalCompositeOperation = 'screen';
      const halo = (x, y, radius, strength) => {
        const glow = b.createRadialGradient(x, y, 0, x, y, radius);
        glow.addColorStop(0, `rgba(195,255,255,${strength})`);
        glow.addColorStop(.2, `rgba(62,227,255,${strength * .8})`);
        glow.addColorStop(.55, `rgba(28,170,245,${strength * .35})`);
        glow.addColorStop(1, 'rgba(20,130,220,0)');
        b.fillStyle = glow; b.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      };
      for (const path of this.floorCablePaths()) {
      const length = path.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - path[i][0], p[1] - path[i][1]), 0);
      for (const pulse of this.floorPulses) {
        const age = this.t - pulse.at;
        if (age < 0) continue;
        const head = Math.min(1, age / signal.travel) * length;
        const burst = Math.max(0, 1 - age / .9);
        halo(...path[0], 30, reduced ? .55 : .95 * burst);
        if (!reduced && age < signal.travel) {
          for (let tail = 80; tail >= 0; tail -= 7) {
            const distance = head - tail; if (distance < 0) continue;
            const p = this.floorCablePoint(distance, path), transmission = this.floorCableTransmission(distance, path), strength = (1 - tail / 90) * .38 * transmission;
            halo(p.x, p.y, 8 + transmission * 5, strength);
            // Interrupted fine highlights let the parquet grain remain legible over the buried fiber.
            if (Math.floor(p.y) % 9 !== 0) this.P(Math.round(p.x) - 1, Math.round(p.y), transmission > .5 ? 3 : 1, 1, `rgba(151,252,255,${(1 - tail / 90) * transmission})`);
          }
          const p = this.floorCablePoint(head, path), transmission = this.floorCableTransmission(head, path);
          halo(p.x, p.y, 10 + transmission * 12, .85 * transmission);
          if (transmission > .5) this.P(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 3, `rgba(240,255,255,${transmission})`);
        }
        if (reduced || age >= signal.travel) {
          const fade = reduced ? .65 : Math.max(0, 1 - (age - signal.travel) / signal.linger);
          halo(...path.at(-1), 32, fade);
          this.P(path.at(-1)[0] - 1, path.at(-1)[1] - 2, 2, 4, '#e5ffff');
        }
      }
      }
      b.restore();
    }
    drawFloorLed(faceOnly = false) {
      const { x, y, w, h } = FLOOR_LED;
      const b = this.b;
      if (!faceOnly) {
        this.P(x - 3, y - 3, w + 6, h + 6, '#54392e');
        this.P(x - 2, y - 2, w + 4, h + 4, '#241d20');
        this.P(x - 3, y - 3, w + 6, 1, '#36251f');
        this.P(x - 3, y + h + 2, w + 6, 1, '#ad7951');
        for (const xx of [x - 1, x + w]) for (const yy of [y - 1, y + h]) this.P(xx, yy, 1, 1, '#84796b');
      }
      this.P(x, y, w, h, '#101e27');
      for (let yy = y + 1; yy < y + h; yy += 3) this.P(x, yy, w, 1, '#12232c');
      this.P(x + 1, y + 1, w - 2, 1, '#2e4b53');
      if(!this.floorDisplayActive)return;
      this.P(x + 7, y + 10, 2, 2, '#81baa8');
      this.P(x + 8, y + 23, w - 16, 1, '#27404a');
      // A narrow reflection on protective glass; no bright pool at the beam's end.
      this.P(x + w - 35, y + 2, 30, 1, '#31424b');
      this.P(x + w - 25, y + 3, 20, 1, '#25363e');
      b.save();
      b.beginPath(); b.rect(x + 5, y + 4, w - 10, h - 8); b.clip();
      b.textAlign = 'left'; b.textBaseline = 'alphabetic';
      for (const [key, yy, size, color] of [
        ['floorLed.title', 13, 6, '#85b9ac'], ['floorLed.waiting', Math.round(h * 0.48), 9, '#c2caca'],
        ['floorLed.detail', Math.round(h * 0.48) + 14, 6, '#8c9da8'], ['floorLed.note', h - 9, 5, '#738c97'],
      ]) {
        b.font = `400 ${size}px ${FONT}`; b.fillStyle = color;
        b.fillText(I.t(key), x + (yy === 13 ? 13 : 8), y + yy, w - 20);
      }
      b.restore();
    }
    drawFloorEmission(on) {
      if(!this.floorDisplayActive)return;
      const b = this.b, f = FLOOR_LED;
      if (!this._floorEmission) {
        const canvas = document.createElement('canvas'); canvas.width = f.w * R; canvas.height = f.h * R;
        this._floorEmission = canvas;
      }
      const layer = this._floorEmission, g = layer.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, layer.width, layer.height);
      g.setTransform(R, 0, 0, R, -f.x * R, -f.y * R); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.imageSmoothingEnabled = false;
      // Cut out actual opaque sprite pixels, preserving the lit glass around whiskers and paws.
      // Bounding rectangles left visible dark boxes when Leya lay on the screen.
      this.b = g;
      try {
        this.drawFloorLed(true);
        g.globalCompositeOperation = 'destination-out';
        this.drawCat();
        for (const [id, walk] of Object.entries(this.walks)) if (walk.cur) {this.drawWalker(id,walk.cur);this.kitchen?.drawActor(id);if(this.newsDelivery?.id===id)this.drawNewsDelivery();}
      } finally { this.b = b; }
      b.save(); b.globalCompositeOperation = 'source-over'; b.globalAlpha = 0.62 * on;
      b.drawImage(layer, f.x, f.y, f.w, f.h);
      b.globalAlpha = 1; b.globalCompositeOperation = 'lighter';
      for (const yy of [f.y - 1, f.y + f.h + 1]) {
        const glow = b.createLinearGradient(0, yy - 3, 0, yy + 3);
        glow.addColorStop(0, 'rgba(100,170,180,0)');
        glow.addColorStop(0.5, `rgba(100,170,180,${0.08 * on})`);
        glow.addColorStop(1, 'rgba(100,170,180,0)');
        b.fillStyle = glow; b.fillRect(f.x, yy - 3, f.w, 6);
      }
      b.restore();
    }

    // ---------- desk + character ----------
    drawStation(A) { const a = this.anchor(A); this.scaled(a.x, a.y, () => this.drawStationInner(A)); }
    drawStationInner(A) {
      const st = this.st[A.id];
      const { w, h } = this.deskSize(A);
      const x = A.x;
      const y = A.y;
      const t = this.t;
      const status = st.status;
      const sx = this.seatX(A);
      this.shadow(x + w / 2, y + h + 4, w / 2 + 4, 3, 0.3);
      this.blit(this.spr(`desk${w}x${h}`, () => K.desk(w, h)), x - 1, y - 1);
      const mx = x + Math.round(w / 2) - 5;
      const my = y - 18;
      this.blit(this.spr('monitor', () => K.monitor()), mx - 1, my - 1);
      this.drawScreen(A, st, mx + 2, my + 2, 20, 11);
      this.blit(this.spr('keyboard', () => K.keyboard()), mx + 4, y + 2);
      // Leave the left edge free for the actual drink; decorations share the right edge.
      for (const [i,item] of A.items.filter(item=>item!=='mug').entries()) {
        const prop=this.spr('item-'+item,()=>K.ITEMS[item]());
        this.blit(prop,x+w-prop.width+1-i*12,y+6-prop.height);
      }
      if (A.big) this.blit(this.spr('item-nameplate', () => K.ITEMS.nameplate()), x + w / 2 - 7, y + 9);

      const chair = this.spr('chair', () => K.chair());
      if (this.isAway(A.id)) { this.blit(chair, sx - 9, y + 3); return; }
      const workflow = st.workflow && this.applicationWorkflow;
      if (workflow) window.OfficeWorkflow.props(this, A, workflow);
      if (this.talkedTo(A.id) || (this.cat.target === A.id && this.cat.mode === 'rub' && !this.pinned.has(A.id) && st.status === 'idle')) {
        // a visitor stands at the desk: the owner turns around and listens
        this.blit(chair, sx - 9, y + 3);
        const fy = y + 20;
        this.shadow(sx, fy, 6, 1.5, 0.35);
        this.blit(this.spr(`${A.id}:stand`, () => K.front(A.look, 'stand')), sx - 6 - K.OX, fy - 23 - K.OY);
        return;
      }
      const drinkArm = this.kitchen?.usesArm(A.id) ?? false;
      const typing = status === 'typing';
      const wf = workflow && window.OfficeWorkflow.frame(workflow, t);
      const f = typing ? Math.floor(t * (wf ? [3, 5, 2][wf.variant] : 9) + st.seed) % 2 : 0;
      const breathe = !typing && Math.floor(t * 1.2 + st.seed) % 2 ? 1 : 0;
      this.blit(wf ? this.spr(`${A.id}:work:${wf.phase}:${wf.variant}:${wf.beat}`, () => K.work(A.look, wf.phase, wf.variant, wf.beat)) : this.spr(`${A.id}:back${f}:${drinkArm}`, () => K.back(A.look, f, drinkArm)), sx - 6 - K.OX, y - 6 - K.OY + breathe);
      this.blit(chair, sx - 9, y + 3);
      if (status === 'error') this.alertIcon(sx, y - 30 - Math.abs(Math.sin(t * 6)) * 3, '#ff3d5e');
      if (status === 'thinking') this.thoughtCloud(sx + 4, y - 24, Math.floor(t * 2.5) % 4);
    }
    alertIcon(cx, y, col) {
      const P = (x, yy, w, h, c) => this.P(cx - 4 + x, y + yy, w, h, c);
      P(1, 0, 7, 12, '#2a1424'); P(0, 1, 9, 10, '#2a1424');
      P(1, 1, 7, 10, col); P(2, 1, 5, 1, K.tone(col, 0.4));
      P(4, 2, 2, 5, '#ffffff'); P(4, 8, 2, 2, '#ffffff');
      P(3, 12, 3, 1, '#2a1424'); P(4, 12, 1, 2, col);
    }
    thoughtCloud(x, y, dots) {
      const P = (xx, yy, w, h, c) => this.P(x + xx, y + yy, w, h, c);
      const o = '#3a3048';
      P(-3, 9, 2, 2, o); P(-3, 9, 1, 1, '#ffffff');
      P(0, 6, 3, 3, o); P(1, 6, 1, 2, '#ffffff');
      P(3, -1, 15, 9, o); P(4, -2, 13, 11, o);
      P(4, -1, 13, 9, '#ffffff'); P(5, -1, 11, 1, '#ffffff'); P(4, 7, 13, 1, '#d6d0e2');
      for (let i = 0; i < 3; i++) P(6 + i * 4, 2, 2, 2, i < dots ? '#5a4e70' : '#c9c2d6');
    }
    drawScreen(A, st, x, y, w, h) {
      const t = this.t;
      const status = st.status;
      const P = (xx, yy, ww, hh, c) => this.P(x + xx, y + yy, ww, hh, c);
      if (st.workflow && this.applicationWorkflow) { window.OfficeWorkflow.screen(P, this.applicationWorkflow, t); return; }
      if (A.kind === 'news' && this.newsSession?.status === 'preparing') {
        // The actual news job has its own screen; idle entertainment never replaces active work.
        P(0, 0, w, h, '#142637'); P(0, 0, w, 1, '#416b8c');
        P(1, 2, 5, 5, '#8da9bd'); P(2, 3, 3, 1, '#d5e3eb');
        P(7, 2, 10, 1, '#94b9ce'); P(7, 4, 8, 1, '#6e94ac'); P(7, 6, 10, 1, '#6e94ac');
        P(1, 9, w - 2, 1, '#30465b');
        P(1, 9, Math.round((w - 2) * Math.min(100, Math.max(0, this.newsSession.progress?.percent ?? 0)) / 100), 1, '#8dd3ba');
        P(18, 2 + Math.floor(t * 2) % 5, 1, 1, '#b4ccda'); return;
      }
      if (status === 'idle') { window.OfficeScreens.draw(P, st.seed, t); return; }
      if (status === 'error') {
        P(0, 0, w, h, Math.floor(t * 4) % 2 ? '#5a0f22' : '#7a1430');
        for (let i = 0; i < 5; i++) { P(7 + i, 3 + i, 2, 1, '#ffd0d8'); P(11 - i, 3 + i, 2, 1, '#ffd0d8'); }
        return;
      }
      P(0, 0, w, h, '#141629');
      P(0, 0, 3, h, '#1c1f38');
      const colors = ['#b48cff', '#6fb0ff', '#5ee6a0', '#ffd27a', '#ff9a6a', '#d8d4e8'];
      const speed = status === 'typing' ? 6 : 1;
      const n = Math.floor(t * speed + st.seed * 10);
      for (let i = 0; i < 5; i++) {
        const li = n - 4 + i;
        const ind = ((li * 31) % 3) * 2;
        const l1 = 2 + ((li * 7919) % 6);
        const l2 = 2 + ((li * 104729) % 7);
        P(4 + ind, 1 + i * 2, l1, 1, colors[Math.abs(li) % colors.length]);
        if (4 + ind + l1 + 1 + l2 < w) P(5 + ind + l1, 1 + i * 2, l2, 1, colors[Math.abs(li + 2) % colors.length]);
      }
      if (status === 'typing' && Math.floor(t * 4) % 2) P(4, 9, 2, 1, '#ffffff');
    }

    // ---------- walkers ----------
    powerJump(id) {
      const jump=this.floorPowerJump;if(!jump||jump.id!==id)return null;
      const age=Math.max(0,this.t-jump.at);
      if(age<.12)return {dx:0,lift:0,squash:Math.sin(Math.PI*age/.12)*2};
      if(age<1){const flight=(age-.12)/.88;return {dx:12*flight,lift:Math.sin(Math.PI*flight)*15,squash:0};}
      if(age<1.25)return {dx:12,lift:0,squash:Math.sin((age-1)*Math.PI*4)*2};
      const back=Math.min(1,(age-1.25)/.65);return {dx:12*(1-back),lift:Math.sin(Math.PI*back)*5,squash:0};
    }
    drawWalker(id, c) {
      const p=this.walkPos(c),jump=this.powerJump(id),b=this.b;
      if(jump)this.shadow(p.x+jump.dx,p.y,6-jump.lift*.1,1.5,.3-jump.lift*.008);
      b.save();if(jump){b.translate(jump.dx,-jump.lift);b.translate(p.x,p.y);b.scale(1+jump.squash*.03,1-jump.squash*.06);b.translate(-p.x,-p.y);}
      this.scaled(Math.round(p.x),Math.round(p.y),()=>this.drawWalkerInner(id,c));b.restore();
    }
    drawWalkerInner(id, c) {
      const A = this.byId[id];
      if (!A) return;
      const p = this.walkPos(c);
      const lift = p.moving && Math.floor(this.t * 8) % 2 ? 1 : 0;
      if(!this.powerJump(id))this.shadow(p.x, p.y, 6, 1.5, 0.35);
      const drinkArm = this.kitchen?.usesArm(id) ?? false;
      const x = p.x - 6 - K.OX;
      const y = p.y - 23 - K.OY - lift;
      if(this.powerJump(id)?.lift>2){
        this.blit(this.spr(`${id}:powerjump`,()=>K.front(A.look,'cheer')),x,y);
      } else if (p.moving) {
        const f = Math.floor(this.t * 8) % 4;
        const img = this.spr(`${id}:walk${f}:${drinkArm}`, () => K.front(A.look, 'walk', f, drinkArm));
        if (p.dx < 0 && !drinkArm) this.blitFlip(img, x, y); else this.blit(img, x, y);
      } else if(c.pose==='lounge'){
        const pet=this.fireplace?.petting(id),settle=Math.min(1,Math.max(0,(this.t-c.t0)/.65));
        const frame=Math.floor(this.t*2)%2,pose=pet?'pet-seat':this.speaking(id)?'lounge-talk':this.fireplace?.relaxing(id)?'lounge-stretch':'lounge';
        this.blit(this.spr(`${id}:${pose}:${frame}`,()=>K.front(A.look,pose,frame)),x,y+3*settle);
      } else if (c.pose === 'back') {
        this.blit(this.spr(`${id}:standback`, () => standBack(A.look)), x, y);
      } else if (c.pose === 'mug') {
        const sip = Math.sin(this.t * 0.9 + this.st[id].seed) > 0.85;
        this.blit(this.spr(`${id}:mug`, () => K.front(A.look, 'mug')), x, y - (sip ? 1 : 0));
        for (let i = 0; i < 2; i++) {
          const k = ((this.t * 0.7 + i * 0.5) % 1);
          this.P(p.x + 6 + Math.sin(this.t * 3 + i) * 1, p.y - 15 - k * 7, 1, 1, `rgba(255,255,255,${0.55 * (1 - k)})`);
        }
      } else this.blit(this.spr(`${id}:stand:${drinkArm}`, () => K.front(A.look, 'stand', 0, drinkArm)), x, y);
    }

    drawDisk(x, y, shrink = 1) {
      if (shrink <= 0) return;
      this.P(x, y, Math.max(1, 7 * shrink), 7, '#718fa8');
      this.P(x + 1, y + 1, Math.max(1, 5 * shrink), 2, '#d8edf0');
      this.P(x + 2, y + 4, Math.max(1, 3 * shrink), 2, '#23374c');
    }
    drawNewsDeliverySlot() {
      const slot = { x: LED.x + LED.w / 2, y: LED.y + LED.h + 4 };
      this.P(slot.x - 6, slot.y, 12, 4, '#192a32');
      this.P(slot.x - 5, slot.y + 1, 9, 1, '#070f19');
      this.P(slot.x + 4, slot.y + 1, 1, 1, this.newsDelivery ? '#82d8ac' : '#496776');
    }
    drawNewsDelivery() {
      const slot={x:LED.x+LED.w/2,y:LED.y+LED.h+4};
      const d = this.newsDelivery;
      if (!d || !this.byId[d.id]) return;
      const a = this.byId[d.id];
      if (d.stage === 'pickup') {
        const q = Math.min(1, (this.t - d.at) / 1.8);
        const an = this.anchor(a);
        this.scaled(an.x, an.y, () => {
          const x = a.x + this.deskSize(a).w / 2 + 16 - q * 8;
          const y = a.y - 8 + q * 12;
          this.P(x - 3, y + 5, 6, 3, a.look.skin);
          this.drawDisk(x, y);
        });
      } else {
        const pos = this.posOf(d.id);
        if (!pos) return;
        const q = d.stage === 'carry' ? 0 : Math.min(1, (this.t - d.at) / 1.6);
        const x = (pos.x + 9) * (1 - q) + (slot.x - 3) * q;
        const y = (pos.y - 21) * (1 - q) + (slot.y - 2) * q;
        this.P(x - 2, y + 6, 5, 3, a.look.skin);
        this.drawDisk(x, y, q > 0.75 ? (1 - q) * 4 : 1);
        if (q > 0.8) this.P(slot.x - 4, slot.y + 1, 8 * Math.min(1, (this.t - d.at - 1.3) / 0.9), 1, '#7ec6a3');
      }
    }

    // ---------- cat ----------
    catUpdate() { window.OfficeCat.update(this); }
    hearts(x, y, n) {
      for (let i = 0; i < n; i++) this.particles.push({ kind: 'heart', x: x + (Math.random() - 0.5) * 10, y, life: 1.6, born: this.t + i * 0.15 });
    }
    // ---------- session snapshot (a refresh resumes exactly here) ----------
    snapshot() {
      const walks = {};
      for (const [id, w] of Object.entries(this.walks)) if (w.cur) walks[id] = w.cur;
      return {
        displayMode:DISPLAY.external, t: this.t, wall: Date.now(), walks, sched: this.sched, pinAnim: this.pinAnim, fx: this.fx, cat: this.cat, screens: window.OfficeScreens.snapshot(), led: this.led, floorPulses: this.floorPulses ?? [], floorPowerJump: this.floorPowerJump ?? null, dishes: this.dishes,
        bubbles: this.bubbles.filter((b) => b.until > this.t).map((b) => ({ id: b.id, text: b.text, until: b.until, fill: b.fill, shade: b.shade, source: b.source, thread: b.thread, act: b.act, at: b.at })),
        particles: this.particles.filter((p) => this.t - p.born < p.life).slice(-60), cam: { ...this.cam }, st: Object.fromEntries(Object.entries(this.st).map(([k, v]) => [k, { seed: v.seed }])),
      };
    }
    restore(snap) {
      if(typeof snap?.displayMode==='boolean')DISPLAY.setEnabled(snap.displayMode);
      if (!snap || !Number.isFinite(snap.t) || !Number.isFinite(snap.wall)) return false;
      const gap = (Date.now() - snap.wall) / 1000;
      if (gap > 90 || gap < 0) return false; // too old: start a fresh moment instead of a frozen one
      this.tOff = snap.t + gap - performance.now() / 1000;
      this.t = performance.now() / 1000 + this.tOff;
      this.lastT = this.t;
      this.walks = {};
      for (const [id, cur] of Object.entries(snap.walks ?? {})) if (this.byId[id]) this.walks[id] = { cur };
      this.sched = snap.sched ?? [];
      this.pinAnim = snap.pinAnim ?? null;
      this.floorPowerJump=snap.floorPowerJump??null;
      this.fx = snap.fx ?? {};
      this.floorPulses = (snap.floorPulses ?? []).filter(p => Number.isFinite(p.at) && this.t - p.at < L.FLOOR_SIGNAL.total).slice(-6);
      if (snap.cat) Object.assign(this.cat, snap.cat);
      if (snap.led) Object.assign(this.led, snap.led);
      this.dishes = snap.dishes ?? [];
      this.bubbles = (snap.bubbles ?? []).filter((b) => b.until > this.t && (b.at || this.byId[b.id]));
      this.particles = snap.particles ?? [];
      for (const [id, v] of Object.entries(snap.st ?? {})) if (this.st[id] && Number.isFinite(v.seed)) this.st[id].seed = v.seed;
      window.OfficeScreens.restore(snap.screens);
      for (const A of this.agents) window.OfficeScreens.setStatus(this.st[A.id].seed, this.st[A.id].status, this.t);
      if (snap.cam) { this.cam = { ...snap.cam }; this.clampCam(); }
      return true;
    }

    // ---------- kitchen dishes ----------
    dishSlot(i) { const col = i % 6, row = Math.floor(i / 6); return { x: LRUN.x + 7 + col * 17 + (row ? 6 : 0), y: LRUN.y + 6 + row * 9 }; }
    addDish(kind) {
      if (this.dishes.length >= L.DISH_MAX) return;
      const free = [...Array(L.DISH_MAX).keys()].find((i) => !this.dishes.some((d) => d.slot === i));
      this.dishes.push({ kind, slot: free, tone: Math.floor(Math.random() * 4), born: this.t });
    }
    removeDish() { if (this.dishes.length) this.dishes.sort((a, b) => b.slot - a.slot).shift(); }
    drawDishes() {
      const cols = window.OfficeKitchen?.colors??['#e2445c','#4fa8ff','#f3eee6','#e8a33c'];
      for (const d of this.dishes) {
        if(d.held)continue;
        const { x, y } = this.dishSlot(d.slot);
        const drop = Math.max(0, 1 - (this.t - d.born) / 0.25) * 5; // lands with a tiny drop
        const yy = Math.round(y - drop);
        if (d.kind === 'mug') { this.P(x, yy + 3, 6, 1, 'rgba(30,18,10,0.35)'); this.P(x, yy - 1, 5, 4, cols[(d.tone??0)%cols.length]); this.P(x, yy - 1, 5, 1, K.tone(cols[(d.tone??0)%cols.length], 0.4)); this.P(x + 5, yy, 1, 2, '#d9d2c4'); this.P(x + 1, yy, 3, 1, '#5a3a26'); }
        else if (d.kind === 'glass') { this.P(x, yy + 3, 5, 1, 'rgba(30,18,10,0.3)'); this.P(x, yy - 3, 4, 6, 'rgba(190,225,245,0.85)'); this.P(x, yy - 3, 1, 6, '#f0fbff'); this.P(x + 1, yy + 1, 2, 2, 'rgba(120,170,205,0.9)'); }
        else { this.P(x, yy + 3, 9, 1, 'rgba(30,18,10,0.3)'); this.P(x, yy, 9, 3, '#f4f1ea'); this.P(x + 1, yy, 7, 1, '#ffffff'); this.P(x + 3, yy, 3, 2, '#c9824a'); this.P(x + 2, yy + 1, 1, 1, '#7fc47a'); }
      }
    }
    // how far the fridge door is open (0..1): swings open, stays, closes
    fridgeOpen() {
      const a = this.active('fridge');
      if (!a) return 0;
      const dur = FX_DUR.fridge;
      return Math.min(1, a.age / 0.35) * (a.age > dur - 0.4 ? Math.max(0, 1 - (a.age - (dur - 0.4)) / 0.35) : 1);
    }
    drawFridge() {
      const { x, y, w, h } = FR;
      const k = this.fridgeOpen();
      this.shadow(x + w / 2, y + h + 1, w / 2 + 3, 2, 0.32);
      this.P(x, y, w, h, '#1c2129');
      this.P(x + 1, y + 1, w - 2, h - 2, '#d9dee4'); this.P(x + 1, y + 1, w - 2, 1, '#f4f7fa'); this.P(x + w - 4, y + 1, 3, h - 2, '#b4bcc6');
      // freezer door
      this.P(x + 1, y + 23, w - 2, 1, '#8f98a3'); this.P(x + w - 7, y + 8, 2, 9, '#7c8591'); this.P(x + 4, y + 4, 8, 4, '#0e1318'); this.P(x + 5, y + 5, 2, 2, '#7fe8ff'); this.P(x + 8, y + 5, 2, 2, '#7fe8ff');
      this.P(x + 17, y + 6, 4, 4, '#e2445c'); this.P(x + 17, y + 6, 4, 1, '#ff7a8e'); // magnet
      // fridge door: swings open about its left hinge, showing a lit interior
      const dw = Math.max(3, Math.round((w - 2) * (1 - k * 0.85)));
      const top = y + 24, bh = h - 26;
      if (k > 0) {
        this.P(x + 1, top, w - 2, bh, '#eaf6ff');
        for (let sy = top + 12; sy < top + bh - 4; sy += 13) { this.P(x + 2, sy, w - 4, 1, '#a9c6da'); }
        this.P(x + 6, top + 4, 5, 8, '#e8a33c'); this.P(x + 14, top + 5, 4, 7, '#7fc47a'); this.P(x + 20, top + 6, 4, 6, '#d8485f');
        this.P(x + 5, top + 17, 8, 8, '#f6f0d8'); this.P(x + 16, top + 18, 7, 7, '#7fb0e8');
        this.P(x + 3, top + 31, 10, 7, '#e8c27a'); this.P(x + 16, top + 30, 8, 8, '#cfe6a8');
      }
      this.P(x + 1, top, dw, bh, '#c9d0d8'); this.P(x + 1, top, dw, 1, '#eef1f5'); this.P(x + dw - 1, top, 2, bh, '#a9b2bd');
      if (dw > 12) { this.P(x + dw - 6, top + 7, 2, 16, '#7c8591'); }
    }
    drawCat() { const c = this.cat; this.scaled(Math.round(c.x + 9), Math.round(c.y + 10), () => this.drawCatInner(), CAT_SCALE); }
    drawCatInner() {
      const c = this.cat, age = this.t - c.t0;
      const moving = ['walk', 'return', 'wander', 'chase', 'counter-walk'].includes(c.mode);
      const poses = { 'window-watch': 'watch', 'window-listen': 'watch', 'counter-look': 'look', 'counter-rest': 'groom', 'floor-look': 'look', 'floor-settle': 'stretch', 'floor-knead': 'knead', 'floor-nap': 'sleep', 'control-ready':'crouch','control-land':'play', jump: 'jump' };
      const mode = moving ? 'walk' : poses[c.mode] ?? c.mode;
      const frame = Math.floor(age * (moving ? 6 : 2)) % 8;
      const hop = (c.lift ?? 0) / CAT_SCALE + (c.mode === 'chase' ? Math.max(0, Math.sin(age * 8)) * 2 : 0);
      this.shadow(c.x + 9, c.y + 9, c.mode === 'roll' ? 10 : 8, 1.6, 0.3);
      if (c.toy) {
        const dx = c.mode === 'play' ? Math.sin(age * 4) * 4 : 0;
        // The little felt ball belongs to Leya; it is only out during play.
        this.P(c.toy.x + dx - 2, c.toy.y - 2, 4, 3, '#a895be');
        this.P(c.toy.x + dx - 1, c.toy.y - 2, 2, 1, '#d2c5dd');
      }
      this.blit(this.spr(`leya:${mode}:${frame}:${c.face ?? 1}`, () => K.catPose(mode, frame, c.face ?? 1)), c.x - 4, c.y - 13 - hop);
      if (mode === 'sleep' && age % 4 < 2.6) {
        const q = (age % 4) / 4;
        this.P(c.x + 17 + q * 5, c.y - 7 - q * 8, 2, 1, `rgba(192,203,221,${0.7 - q})`);
      }
    }
    // Leya's name plate: the same plate style and text size as every desk label
    drawCatName() {
      const [cx, top] = this.scr(this.cat.x + 9, this.cat.y + 16);
      if (!this.inView(cx, top)) return;
      const u = this.u;
      const fs = this.fontDev(5.8, 9);
      const label = I.t('cat.label');
      const tw = this.measureD(label, fs, 600);
      const lh = Math.round(fs + 3 * u);
      const total = Math.round(tw + 6 * u);
      const x0 = Math.round(cx - total / 2);
      this.boxD(x0, top, total, lh, '#1e1828', '#0e0a14', '#15111d');
      this.rectD(x0 + u, top + u, total - 2 * u, u, '#2f2740');
      this.textD(label, x0 + 3 * u, top + lh - 2 * u, { color: '#efe9f7', weight: 600, font: fs });
    }
    poke() { window.OfficeCat.poke(this); }

    // ---------- plants ----------
    drawPlant(i) {
      const pl = PLANTS[i];
      const f = Math.floor(this.t * pl.speed + pl.ph) % 2;
      const fx = this.fx['plant' + i];
      let dx = 0;
      if (fx) {
        const age = this.t - fx.t0;
        if (age < 1.1) dx = Math.round(Math.sin(age * 38) * 2.4 * (1 - age / 1.1));
      }
      const img = this.spr('plant' + f, () => K.bigPlant(f));
      const b = this.b;
      b.drawImage(img, 0, 20, img.width, img.height - 20, pl.x, pl.y + 20, img.width, img.height - 20);
      b.drawImage(img, 0, 0, img.width, 20, pl.x + dx, pl.y, img.width, 20);
    }

    // ---------- object reactions ----------
    interact(id) {
      const fx = this.fx[id];
      const dur = FX_DUR[id] || 2;
      if (fx && this.t - fx.t0 < dur) return;
      const sfx = SFX();
      const e = { t0: this.t };
      switch (id) {
        case 'plant0': case 'plant1': case 'plant2': case 'plant3': case 'plant4': {
          const pl = PLANTS[Number(id.slice(-1))];
          if (!pl) return;
          if (sfx.rustle) sfx.rustle();
          this.particles.push({ kind: 'leaf', x: pl.x + 6 + Math.random() * 10, y: pl.y + 6, floorY: pl.y + 28 + Math.random() * 6, life: 5, born: this.t, c: Math.random() < 0.5 ? '#46c98a' : '#7deab3' });
          break;
        }
        case 'coffee': if (sfx.brew) sfx.brew(); break;
        case 'cooler': if (sfx.glug) sfx.glug(); break;
        case 'fridge': if (sfx.creak) sfx.creak(); break;
        case 'clock':
          if (sfx.cuckoo) sfx.cuckoo();
          this.say('prop:clock', 'Guguk! Guguk!', { duration: 1.9, at: { wx: CLOCK.cx + 3, wy: 1 }, fill: '#fff2c4', shade: '#e8d39a' });
          break;
        case 'books':
          if (sfx.flip) sfx.flip();
          e.sy = [BOOKS.y + 2, BOOKS.y + 19, BOOKS.y + 36][Math.floor(Math.random() * 3)];
          e.bx = BOOKS.x + 6 + Math.floor(Math.random() * 36);
          e.col = ['#d8485f', '#4f8fe0', '#ffcf4a', '#3ccf8e', '#a77cff'][Math.floor(Math.random() * 5)];
          break;
        case 'door': if (sfx.creak) sfx.creak(); break;
        case 'window0': case 'window1': case 'window2': case 'window3':
          if (this.darkness() >= 0.3) { if (sfx.twinkle) sfx.twinkle(); e.night = true; } else if (sfx.tweet) sfx.tweet();
          break;
        default: return;
      }
      this.fx[id] = e;
    }
    active(id) {
      const fx = this.fx[id];
      if (!fx) return null;
      const age = this.t - fx.t0;
      const dur = FX_DUR[id] || 2;
      return age < dur ? { ...fx, age, k: age / dur } : null;
    }
    // reaction triggered by an ambient visit (no sound unless asked)
    react(id) { this.interact(id); }

    drawPropFx() {
      const t = this.t;
      let a;
      if ((a = this.active('coffee'))) {
        this.b.save(); this.b.translate(COFFEE.x - 12, COFFEE.y - 216);
        this.P(31, 219, 2, 1, '#3ccf8e');
        if (a.age < 1.9) this.P(23, 231, 1, 3 + (Math.floor(t * 10) % 2), '#6b4430');
        const fill = Math.min(4, Math.floor(a.age * 2));
        this.P(21, 238 - fill, 5, fill + 1, '#6b4430');
        this.P(21, 238 - fill, 5, 1, '#9a6a48');
        for (let i = 0; i < 6; i++) {
          const k = ((a.age * 0.9 + i / 6) % 1);
          this.P(18 + i * 2 + Math.sin(t * 4 + i) * 2, 215 - k * 22, 2, 2, `rgba(255,255,255,${0.5 * (1 - k)})`);
        }
      }
      this.b.restore();
      if ((a = this.active('cooler'))) {
        this.b.save(); this.b.translate(CL.x - 92, CL.y - 204);
        for (let i = 0; i < 12; i++) {
          const k = ((a.age * 1.8 + i * 0.13) % 1);
          const s = i % 3 === 0 ? 2 : 1;
          this.P(94 + ((i * 5) % 12), 224 - k * 18, s, s, 'rgba(255,255,255,0.9)');
        }
      }
      this.b.restore();
      if ((a = this.active('clock'))) {
        const out = Math.min(1, a.age / 0.2) * (a.age > 1.75 ? Math.max(0, 1 - (a.age - 1.75) / 0.2) : 1);
        this.P(CLOCK.cx - 4, CLOCK.cy - 12, 9, 3, '#5a3a26');
        this.P(CLOCK.cx - 3, CLOCK.cy - 12, 7, 3, '#1a1222');
        const bob = Math.floor(t * 6) % 2;
        this.blit(this.spr('bird', () => K.bird()), CLOCK.cx - 4, CLOCK.cy - 12 - Math.round(out * 6) - bob);
      }
      if ((a = this.active('books'))) {
        const lift = Math.round(Math.sin(Math.min(1, a.k) * Math.PI) * 6);
        const x = a.bx;
        const y = a.sy + 3 - lift;
        this.P(x - 1, y - 1, 6, 14, '#1a1222');
        this.P(x, y, 4, 12, a.col);
        this.P(x, y, 1, 12, K.tone(a.col, 0.35));
        this.P(x, y + 3, 4, 1, K.tone(a.col, -0.4));
        if (lift > 4) this.P(x + 5, y - 2, 1, 1, '#fff6c8');
      }
      if ((a = this.active('door'))) {
        this.b.save(); this.b.translate(0, DOOR_Y - 6);
        const open = a.age < 0.35 ? a.age / 0.35 : a.age > 2.55 ? Math.max(0, 1 - (a.age - 2.55) / 0.35) : 1;
        const w = Math.round(28 * open);
        const dx = DOOR_X + 5;
        if (w > 0) {
          this.P(dx, 11, w, 53, '#fff1c8');
          this.P(dx, 11, w, 2, '#ffe7a0');
          for (let i = 0; i < 3; i++) this.P(dx + 2 + i * 7, 20, 3, 44, 'rgba(255,220,150,0.35)');
          this.P(dx + w, 11, Math.max(2, 28 - w), 53, '#7e5134');
          this.P(dx + w, 11, 1, 53, '#9a6a48');
          this.b.fillStyle = `rgba(255,236,180,${0.16 * open})`;
          this.b.beginPath();
          this.b.moveTo(dx, 64); this.b.lineTo(dx + w, 64); this.b.lineTo(dx + w + 10, 100); this.b.lineTo(dx - 9, 100);
          this.b.closePath();
          this.b.fill();
        }
        this.b.restore();
      }
      for (const [i, w] of WINDOWS.entries()) {
        if (!(a = this.active('window' + i))) continue;
        const clip = (x, y, ww, hh, c) => { if (x >= w.x && x + ww <= w.x + w.w && y >= w.y && y + hh <= w.y + w.h) this.P(x, y, ww, hh, c); };
        if (a.night) {
          const k = a.age / 1.2;
          if (k <= 1) {
            const x = w.x + 6 + k * (w.w - 12);
            const y = w.y + 4 + k * 16;
            for (let j = 0; j < 8; j++) clip(Math.round(x - j * 1.6), Math.round(y - j * 0.6), 1, 1, `rgba(255,250,220,${1 - j / 8})`);
            clip(Math.round(x), Math.round(y), 2, 1, '#ffffff');
          }
        } else {
          const k = a.age / 3;
          const x = Math.round(w.x - 4 + k * (w.w + 8));
          const y = Math.round(w.y + 14 + Math.sin(a.age * 5) * 3);
          const c = '#2a2036';
          if (Math.floor(t * 10) % 2) { clip(x, y, 1, 1, c); clip(x + 1, y + 1, 1, 1, c); clip(x + 2, y, 1, 1, c); clip(x + 3, y + 1, 1, 1, c); clip(x + 4, y, 1, 1, c); }
          else { clip(x, y + 1, 5, 1, c); clip(x + 2, y, 1, 1, c); }
        }
      }
    }

    drawParticles() {
      for (const p of this.particles) {
        const age = this.t - p.born;
        if (age < 0) continue;
        if (p.kind === 'leaf') {
          const y = Math.min(p.floorY, p.y + age * 16);
          const landed = y >= p.floorY;
          const x = p.x + (landed ? Math.sin(p.floorY) * 3 : Math.sin(age * 4) * 3);
          const a = Math.min(1, (p.life - age) / 0.8);
          this.P(x, y, 2, 1, K.alpha(p.c, a));
          this.P(x + (landed ? 2 : Math.floor(age * 4) % 2), y + (landed ? 0 : 1), 1, 1, K.alpha(K.tone(p.c, -0.3), a));
          continue;
        }
        if (p.kind === 'heart') {
          const k = age / p.life;
          const x = Math.round(p.x + Math.sin(age * 5) * 2);
          const y = Math.round(p.y - age * 12);
          const c = `rgba(255,92,122,${1 - k})`;
          this.P(x, y, 2, 1, c); this.P(x + 3, y, 2, 1, c); this.P(x - 1, y + 1, 7, 1, c); this.P(x, y + 2, 5, 1, c); this.P(x + 1, y + 3, 3, 1, c); this.P(x + 2, y + 4, 1, 1, c);
          this.P(x, y, 1, 1, `rgba(255,200,210,${1 - k})`);
        }
      }
    }

    // ---------- light ----------
    // Night: the room is dark and only light sources glow (desk lamps, screens, the LED panel, the red lamp over the board,
    // moonlight through the windows, the green exit sign). Day: every light is off and the room is simply bright.
    drawLighting(dark) {
      const b = this.b;
      const on = Math.max(0, Math.min(1, (dark - 0.05) / 0.35)); // how far the lights are switched on
      const moon = Math.max(0, Math.min(1, (dark - 0.35) / 0.2)); // moon is up once the sky is dark
      if (dark > 0) { b.fillStyle = `rgba(10,9,34,${Math.min(0.9, dark * 1.5)})`; b.fillRect(0, 0, W, H); }
      else { b.fillStyle = 'rgba(255,246,222,0.08)'; b.fillRect(0, 0, W, H); } // daylight fills the room
      if (on <= 0 && moon <= 0) return;
      this.drawFloorEmission(on);
      const lights = [], cones = [];
      for (const A of this.agents) {
        const st = this.st[A.id];
        const { w } = this.deskSize(A);
        // the monitor throws light forward (towards whoever sits at the desk): a fan across keyboard, desk and shoulders,
        // coloured and scaled by what is on the screen, plus a small bloom on the bezel
        const mx = A.x + Math.round(w / 2) - 5, my = A.y - 18;
        const e0 = this.ent(A, mx + 2, my + 13), e1 = this.ent(A, mx + 22, my + 13), ec = this.ent(A, mx + 12, my + 8);
        const sl = st.status === 'idle' ? window.OfficeScreens.tint(st.seed, this.t) : { color: SCREEN_LIGHT[st.status] || SCREEN_LIGHT.typing, strength: st.status === 'error' ? 0.5 : 0.4 };
        const str = Math.max(0.45, sl.strength * 0.8); // dim scenes still light the desk
        cones.push({ x0: e0.x, x1: e1.x, y: e0.y, depth: 34 * S, spread: 9 * S, color: sl.color, alpha: 0.34 * str * on });
        lights.push({ x: ec.x, y: ec.y + 4 * S, r: 18 * S, c: sl.color, a: 0.18 * str * on });
      }
      // kitchen: tiny status lights, and the fridge's interior light spilling out when its door is open
      b.globalCompositeOperation = 'lighter';
      for (const Lt of lights) {
        const g = b.createRadialGradient(Lt.x, Lt.y, 0, Lt.x, Lt.y, Lt.r);
        g.addColorStop(0, K.alpha(Lt.c, Lt.a));
        g.addColorStop(0.5, K.alpha(Lt.c, Lt.a * 0.35));
        g.addColorStop(1, K.alpha(Lt.c, 0));
        b.fillStyle = g;
        b.fillRect(Lt.x - Lt.r, Lt.y - Lt.r, Lt.r * 2, Lt.r * 2);
      }
      // tight point lights (inverse-square falloff): coffee machine LED, cooler lamps, fridge display, exit sign
      b.globalCompositeOperation = 'lighter';
      this.glow(COFFEE.x + 19, COFFEE.y + 3, 15, '#ff7a4a', 0.9 * on);
      this.glow(CL.x + 6, CL.y + 28, 13, '#5aa8ff', 0.8 * on);
      this.glow(FR.x + 8, FR.y + 6, 14, '#7fe8ff', 0.8 * on);
      this.glow(DOOR_X + 19, DOOR_Y - 3, 16, '#37e68e', 0.9 * on);
      this.glow(BOARD.x + 5.5, 6, 18, '#ff3a4a', 0.9 * on); // the red lamp over the board
      // CLI logo marks on the board: switched on, redrawn above the night overlay
      b.globalCompositeOperation = 'source-over'; b.globalAlpha = Math.min(1, on * 1.3);
      for (const [i, key] of ['claude', 'codex', 'antigravity'].entries()) this.drawLogoMarks(key, NOTES.usage.x + 1 + i * 25, NOTES.usage.y, true);
      b.globalAlpha = 1; b.globalCompositeOperation = 'lighter';
      // exit sign: the green panel itself glows (drawn bright above the night overlay, no halo)
      b.globalCompositeOperation = 'source-over'; b.globalAlpha = Math.min(1, on * 1.3);
      this.P(DOOR_X + 7, DOOR_Y - 5, 24, 4, '#37e68e'); this.P(DOOR_X + 7, DOOR_Y - 5, 24, 1, '#9ff5c8');
      b.globalAlpha = 1; b.globalCompositeOperation = 'lighter';
      for (const c of cones) this.spill(c.x0, c.x1, c.y, c.depth, c.spread, c.color, c.alpha);
      // emissive screens: redrawn above the night overlay so a monitor is never darkened by the room it lights
      b.globalCompositeOperation = 'source-over';
      b.globalAlpha = Math.min(0.62, on * 0.8); // a screen glows, it does not dazzle
      for (const A of this.agents) {
        const { w } = this.deskSize(A);
        const an = this.anchor(A);
        this.scaled(an.x, an.y, () => this.drawScreen(A, this.st[A.id], A.x + Math.round(w / 2) - 5 + 2, A.y - 18 + 2, 20, 11));
      }
      b.globalAlpha = 1;
      b.globalCompositeOperation = 'lighter';
      // fridge interior light: a real fan of light falling out of the open door onto the floor and the people in front of it
      const fo = this.fridgeOpen();
      if (fo > 0) {
        const fx0 = FR.x + 4, fx1 = FR.x + FR.w - 4, fy = FR.y + 26;
        this.spill(fx0, fx1, fy, 86, 30, '#dff4ff', 0.5 * fo * on);
        b.save(); b.translate(FR.x + FR.w / 2, FR.y + FR.h + 22); b.scale(1, 0.42);
        const pool = b.createRadialGradient(0, 0, 0, 0, 0, 52);
        pool.addColorStop(0, K.alpha('#e6f6ff', 0.34 * fo * on)); pool.addColorStop(1, K.alpha('#e6f6ff', 0));
        b.fillStyle = pool; b.fillRect(-52, -52, 104, 104); b.restore();
      }
      if (moon > 0) {
        // moonlight: soft silver shafts (stacked, widening layers) fall from each window and pool on the floor; wide spread
        for (const w of WINDOWS) {
          const x0 = w.x + 6, x1 = w.x + w.w - 6, y0 = w.y + w.h + 2, len = 120;
          for (let layer = 0; layer < 4; layer++) {
            const grow = layer * 6;
            const sh = b.createLinearGradient(0, y0, 0, y0 + len);
            sh.addColorStop(0, `rgba(170,195,255,${0.04 * moon})`); sh.addColorStop(0.6, `rgba(170,195,255,${0.02 * moon})`); sh.addColorStop(1, 'rgba(170,195,255,0)');
            b.fillStyle = sh;
            b.beginPath();
            b.moveTo(x0 - grow * 0.3, y0); b.lineTo(x1 + grow * 0.3, y0);
            b.lineTo(x1 + 34 + grow * 1.3, y0 + len); b.lineTo(x0 - 26 - grow * 1.3, y0 + len);
            b.closePath(); b.fill();
          }
          const glow = b.createRadialGradient(w.x + w.w / 2, w.y + w.h / 2, 0, w.x + w.w / 2, w.y + w.h / 2, w.w * 0.9);
          glow.addColorStop(0, `rgba(170,195,255,${0.13 * moon})`); glow.addColorStop(1, 'rgba(170,195,255,0)');
          b.fillStyle = glow; b.fillRect(w.x - 40, w.y - 40, w.w + 80, w.h + 80);
        }
      }
      b.globalCompositeOperation = 'source-over';
    }
    // a small point light with an inverse-square falloff (bright hot core, a very short tail): looks like a real emitter
    glow(x, y, r, color, a) {
      const b = this.b, g = b.createRadialGradient(x, y, 0, x, y, r);
      for (let i = 0; i <= 8; i++) { const d = i / 8, f = 1 / (1 + 22 * d * d); g.addColorStop(d, K.alpha(color, a * f * (1 - d * d * d))); }
      b.fillStyle = g; b.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // light falling out of an emitter: a soft-edged fan (three stacked, widening layers) that fades with distance
    spill(x0, x1, y0, depth, spread, color, alpha) {
      const b = this.b;
      for (const [k, am] of [[1, 0.5], [1.5, 0.3], [2.1, 0.2]]) {
        const g = b.createLinearGradient(0, y0, 0, y0 + depth);
        g.addColorStop(0, K.alpha(color, alpha * am)); g.addColorStop(0.4, K.alpha(color, alpha * am * 0.45)); g.addColorStop(1, K.alpha(color, 0));
        b.fillStyle = g;
        b.beginPath(); b.moveTo(x0, y0); b.lineTo(x1, y0); b.lineTo(x1 + spread * k, y0 + depth); b.lineTo(x0 - spread * k, y0 + depth); b.closePath(); b.fill();
      }
    }
    drawVignette() {
      if (!this._vig) {
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(W / 2, H / 2, H * 0.55, W / 2, H / 2, W * 0.62);
        grad.addColorStop(0, 'rgba(12,6,24,0)');
        grad.addColorStop(1, 'rgba(12,6,24,0.4)');
        g.fillStyle = grad;
        g.fillRect(0, 0, W, H);
        this._vig = c;
      }
      this.b.globalAlpha = 0.35 + 0.65 * Math.min(1, this.darkness() / 0.3);
      this.b.drawImage(this._vig, 0, 0);
      this.b.globalAlpha = 1;
    }

    // ---------- screen-resolution layer ----------
    scr(wx, wy) { const v = this.view; return [Math.round((wx - v.sx0) * v.s), Math.round((wy - v.sy0) * v.s)]; }
    fontDev(size, minCss = 7) { return Math.round(Math.max(size * this.u, minCss * this.dpr)*DISPLAY.textScale); }
    // On the cork board the paper is dimmed by the night overlay but this text layer is not, so dark ink is swapped for
    // light ink as the room darkens (this.inkMap: day colour → night colour, blended by this.inkK).
    ink(color) {
      const to = this.inkMap?.[color];
      if (!to || !this.inkK) return color;
      const a = K.hexToRgb(color), b = K.hexToRgb(to);
      return K.rgbToHex(a[0] + (b[0] - a[0]) * this.inkK, a[1] + (b[1] - a[1]) * this.inkK, a[2] + (b[2] - a[2]) * this.inkK);
    }
    textD(str, x, y, { color = '#fff', align = 'left', weight = 400, shadow = null, font = 12, alpha = 1, family = FONT } = {}) {
      const ctx = this.ctx;
      color = this.ink(color);
      ctx.globalAlpha = alpha;
      ctx.font = `${weight} ${font}px ${family}`;
      ctx.textAlign = align;
      ctx.textBaseline = 'alphabetic';
      if (shadow) { ctx.fillStyle = shadow; ctx.fillText(str, x, y + Math.max(1, Math.round(this.u / 2))); }
      ctx.fillStyle = color;
      ctx.fillText(str, x, y);
      ctx.globalAlpha = 1;
    }
    measureD(str, px, weight = 400, family = FONT) { this.ctx.font = `${weight} ${px}px ${family}`; return this.ctx.measureText(str).width; }
    rectD(x, y, w, h, c) { this.ctx.fillStyle = c; this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
    boxD(x, y, w, h, fill, edge, shade) {
      const u = this.u;
      x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
      this.rectD(x + u, y, w - 2 * u, h, edge);
      this.rectD(x, y + u, w, h - 2 * u, edge);
      this.rectD(x + u, y + u, w - 2 * u, h - 2 * u, fill);
      if (shade) this.rectD(x + u, y + h - 2 * u, w - 2 * u, u, shade);
    }
    inView(x, y, m = 60) { return x > -m && y > -m && x < this.canvas.width + m && y < this.canvas.height + m; }
    wrapD(text, fs, maxPx, family = FONT) {
      const words = String(text).split(/\s+/);
      const lines = [];
      let cur = '';
      for (const w of words) {
        const next = cur ? `${cur} ${w}` : w;
        if (cur && this.measureD(next, fs, 400, family) > maxPx) { lines.push(cur); cur = w; } else cur = next;
      }
      if (cur) lines.push(cur);
      return lines.slice(0, 5);
    }

    // LED news panel text
    drawLedText() {
      const s = this.view.s;
      const px = (world, minCss) => Math.round(Math.max(world * s, minCss * this.dpr));
      const [x0, y0] = this.scr(LED.x, LED.y);
      if (x0 + LED.w * s < 0 || y0 + LED.h * s < 0 || x0 > this.canvas.width || y0 > this.canvas.height) return;
      const articles = this.news.articles;
      const pad = Math.round(8 * s);
      if (!this.led.paused && !document.hidden && this.t - this.led.at > 12 && articles.length > 1) { this.led.at = this.t; this.led.index = (this.led.index + 1) % articles.length; this.led.flip = this.t; }
      if (this.led.at === 0) this.led.at = this.t;
      const a = articles[this.led.index % Math.max(1, articles.length)];
      const fade = Math.min(1, (this.t - this.led.flip) / 0.5);
      const cat = a?.category;
      const head = a ? `● ${I.t('led.news')} ${this.led.index % articles.length + 1}/${articles.length}  ·  ${cat === 'ai' ? I.t('led.ai') : I.t(`topic.${cat ?? 'general'}`).toUpperCase()}` : `● ${I.t('led.todays')}`;
      if(DISPLAY.external){this.drawLargeLed(a,head,x0,y0,LED.w*s,LED.h*s,fade);return;}
      this.textD(head, x0 + pad, y0 + Math.round(13 * s), { color: '#88d6bf', font: px(6.2, 8), weight: 600 });
      const ctx = this.ctx;
      ctx.save();
      ctx.beginPath(); ctx.rect(x0 + pad, y0 + 19 * s, LED.w * s - 2 * pad, (LED.h - 24) * s); ctx.clip();
      const titleFs = px(9.6, 11);
      const title = a ? I.title(a) : this.news.refreshing ? I.t('led.preparing') : this.news.error ? I.t('led.unreachable') : I.t('led.waiting');
      const width = LED.w * s - 2 * pad;
      const drawLines = (lines, max, yy, font, step, color) => {
        lines.slice(0, max).forEach((ln, i) => {
          let value = ln;
          if (i === max - 1 && lines.length > max) {
            while (value && this.measureD(value + '…', font) > width) value = value.slice(0, -1);
            value += '…';
          }
          this.textD(value, x0 + pad, yy + i * step, { color, font, alpha: fade });
        });
      };
      const titles = this.wrapD(title, titleFs, width);
      const titleStep = Math.round(titleFs * 1.18);
      drawLines(titles, 2, y0 + 29 * s, titleFs, titleStep, '#e3dfd2');
      if (a) {
        const summary = I.explanation(a) || I.t('pop.pending');
        // The prose summary shares the title fade and fills the remaining screen area.
        const parts = [summary];
        let fs = px(8.2, 9);
        const top = y0 + 29 * s + Math.min(2, titles.length) * titleStep + 5 * s;
        const bottom = y0 + (LED.h - 7) * s;
        const wrap = () => parts.flatMap(part => this.wrapD(part, fs, width));
        let lines = wrap();
        while (fs > 5.5 * s && lines.length * fs * 1.16 > bottom - top + fs) { fs -= 0.5; lines = wrap(); }
        const step = fs * 1.16;
        const count = Math.max(1, Math.floor((bottom - top) / step) + 1);
        drawLines(lines, count, top, fs, step, '#a9b7c3');
      }
      ctx.restore();
    }

    drawLargeLed(article,head,x,y,width,height,fade){
      const d=this.dpr,compact=height/d<190,pad=(compact?12:18)*d,titleSize=(compact?32:36)*d,bodySize=28*d,headerSize=20*d;
      const family='"Geist",system-ui,sans-serif',inner=width-2*pad,ctx=this.ctx;
      ctx.save();ctx.beginPath();ctx.rect(x+pad,y+pad,inner,height-2*pad);ctx.clip();
      if(!compact)this.textD(head,x+pad,y+pad+headerSize,{font:headerSize,color:'#a6dfcd',weight:600});
      const title=article?I.title(article):this.news.refreshing?I.t('led.preparing'):this.news.error?I.t('led.unreachable'):I.t('led.waiting');
      const titles=this.wrapD(title,titleSize,inner).slice(0,2),start=y+pad+(compact?0:headerSize+16*d)+titleSize,step=titleSize*1.16;
      titles.forEach((line,i)=>this.textD(line,x+pad,start+i*step,{font:titleSize,color:'#f2eddf',weight:600,alpha:fade}));
      if(article&&!compact){
        const top=start+(titles.length-1)*step+20*d+bodySize,bottom=y+height-pad;
        const count=Math.max(1,Math.floor((bottom-top)/(bodySize*1.3))+1);
        const lines=this.wrapD(I.explanation(article)||I.t('pop.pending'),bodySize,inner,family);
        // Page existing verified text at a readable size instead of shrinking it to fit.
        const pages=Math.ceil(lines.length/count),page=Math.floor(Math.max(0,this.t-this.led.at)/(12/Math.max(1,pages)))%Math.max(1,pages);
        lines.slice(page*count,(page+1)*count).forEach((line,i)=>this.textD(line,x+pad,top+i*bodySize*1.3,{font:bodySize,family,color:'#d7e0df',alpha:fade}));
      }
      ctx.restore();
    }

    // ---------- cork board: notes, pins and the agent who moves the pin ----------
    paper(x, y, w, h, base, lifted) {
      const sh = lifted ? 2 : 1;
      const ty = lifted ? y - 1 : y;
      this.P(x + 1, ty + sh, w, h, 'rgba(30,18,10,0.38)');
      this.P(x, ty, w, h, base);
      this.P(x, ty, w, 1, K.tone(base, 0.28)); this.P(x, ty, 1, h, K.tone(base, 0.12));
      this.P(x, ty + h - 1, w, 1, K.tone(base, -0.22)); this.P(x + w - 1, ty, 1, h, K.tone(base, -0.14));
      return ty;
    }
    pin(x, y, col) {
      this.P(x - 1, y + 2, 4, 2, 'rgba(30,18,10,0.4)');
      this.P(x - 1, y - 3, 3, 1, col); this.P(x - 2, y - 2, 5, 3, col); this.P(x - 1, y + 1, 3, 1, K.tone(col, -0.35));
      this.P(x - 1, y - 2, 1, 1, K.tone(col, 0.55)); this.P(x + 1, y - 1, 1, 1, K.tone(col, -0.2));
    }
    // LED badges for the three CLIs: a coloured plate (never black) with the mark in LED colours. By day the marks are drawn with the
    // board; at night they are redrawn emissive above the darkness (see drawLogoMarks) so they look switched on.
    static LOGOS = {
      claude: { plate: '#e9d2c0', mark: '#d9532a', glow: '#ff8a5a', rows: ['....#....', '.#..#..#.', '..#.#.#..', '...###...', '#########', '...###...', '..#.#.#..', '.#..#..#.', '....#....'] },
      codex: { plate: '#cfd9e6', mark: '#1d2430', glow: '#e8f3ff', rows: ['...###...', '.##...##.', '.#..#..#.', '#..###..#', '#.##.##.#', '#..###..#', '.#..#..#.', '.##...##.', '...###...'] },
      antigravity: { plate: '#d6d2f0', mark: null, glow: null, rows: ['....#....', '...###...', '..##.##..', '..##.##..', '.##...##.', '.##.#.##.', '##.....##', '##.....##', '##.....##'] },
    };
    usageLogo(key, x, y) {
      const def = OfficeView.LOGOS[key];
      this.P(x, y, 11, 11, def.plate); this.P(x, y, 11, 1, K.tone(def.plate, 0.3)); this.P(x, y + 10, 11, 1, K.tone(def.plate, -0.25)); this.P(x + 10, y, 1, 11, K.tone(def.plate, -0.15));
      this.drawLogoMarks(key, x, y, false);
    }
    drawLogoMarks(key, x, y, emissive) {
      const def = OfficeView.LOGOS[key];
      const grad = (dy) => (dy < 3 ? '#1bb0e0' : dy < 6 ? '#3d5cff' : '#8a3df0'); // Antigravity: cyan → blue → violet
      const flick = emissive ? 0.9 + 0.1 * Math.sin(this.t * 3 + x) : 1;
      def.rows.forEach((line, dy) => { for (let dx = 0; dx < 9; dx++) if (line[dx] === '#') {
        const col = emissive ? (def.glow ?? K.tone(grad(dy), 0.35)) : (def.mark ?? grad(dy));
        this.P(x + 1 + dx, y + 1 + dy, 1, 1, flick < 0.95 ? K.tone(col, -0.1) : col);
      } });
    }
    // the cork board is redrawn every frame: paper cards, pins, the weather and city cards
    // visibility of a pinned info card ('weather' | 'city'): { a: alpha, dy: lift } or null. While an agent rewrites the
    // location label the cards are hung (off → on) or taken down (on → off) in step with it.
    cardAnim(which) {
      if (!(this.weatherInfo?.weather ?? this.lastWeather)) return null;
      const an = this.pinAnim?.kind === 'loc' && this.pinAnim.t0 != null ? this.pinAnim : null;
      if (!an) return this.locOn ? { a: 1, dy: 0, pin: true } : null;
      const age = this.t - an.t0;
      const k = (v) => Math.max(0, Math.min(1, v));
      if (!an.to) { const q = k(age / 0.7); return q >= 1 ? null : { a: 1 - q, dy: -q * 6, pin: q < 0.25 }; }
      const q = k((age - (which === 'weather' ? 2.1 : 2.75)) / 0.5);
      return q <= 0 ? null : { a: q, dy: (q - 1) * 8, pin: q >= 0.85 };
    }
    drawBoardNotes() {
      const moving = this.pinAnim?.kind === 'cli';
      // title strip, taped at both ends
      this.P(TITLE.x + 1, TITLE.y + 2, TITLE.w, TITLE.h, 'rgba(30,18,10,0.38)');
      this.P(TITLE.x, TITLE.y, TITLE.w, TITLE.h, '#1b1d2b'); this.P(TITLE.x, TITLE.y, TITLE.w, 1, '#3a3f66'); this.P(TITLE.x, TITLE.y + TITLE.h - 1, TITLE.w, 1, '#0d0e16');
      this.P(TITLE.x + TITLE.w - 5, TITLE.y + 3, 2, TITLE.h - 6, '#7c5cff'); this.P(TITLE.x + TITLE.w - 9, TITLE.y + 3, 2, TITLE.h - 6, '#3ccf8e');
      this.P(TITLE.x - 2, TITLE.y - 2, 6, 3, 'rgba(255,248,220,0.55)'); this.P(TITLE.x + TITLE.w - 4, TITLE.y + TITLE.h - 1, 6, 3, 'rgba(255,248,220,0.55)');
      // the two CLI cards: the one the red pin is in is lifted off the cork
      for (const [key, base] of [['claude', '#f4e6c8'], ['codex', '#cfe3f4']]) {
        const n = NOTES[key];
        const on = !moving && this.cli === key;
        this.paper(n.x, n.y, n.w, n.h, on ? base : K.tone(base, -0.1), on);
        if (!on) { this.P(n.x + 2, n.y + 2, 2, 2, '#9a928a'); this.P(n.x + n.w - 4, n.y + 2, 2, 2, '#9a928a'); } // loose, held by corner tacks only
      }
      const flip = this.pinAnim?.kind === 'lang' && this.pinAnim.t0 != null ? Math.max(0, Math.sin(Math.min(1, (this.t - this.pinAnim.t0) / 1.4) * Math.PI)) : 0; // both tags rise while the agent flips them
      for (const [key, n] of [['tr', NOTES.langTr], ['en', NOTES.langEn]]) {
        this.b.save(); this.b.translate(0, -Math.round(flip * 3));
        this.paper(n.x, n.y, n.w, n.h, I.lang === key ? '#f4e6c8' : '#cdbf9f', I.lang === key);
        this.b.restore();
      }
      // Agents Deck usage strip, bottom right: Claude, Codex and Antigravity logos (percentages are drawn as text)
      const us = NOTES.usage;
      this.paper(us.x, us.y, us.w, us.h, '#efe6cc', false);
      for (const [i, key] of ['claude', 'codex', 'antigravity'].entries()) this.usageLogo(key, us.x + 1 + i * 25, us.y);
      this.paper(NOTES.refresh.x, NOTES.refresh.y, NOTES.refresh.w, NOTES.refresh.h, this.boardRefreshing ? '#cdbf9f' : '#f4e6c8', false);
      // Compact location label, bottom left
      this.paper(NOTES.loc.x, NOTES.loc.y, NOTES.loc.w, NOTES.loc.h, '#f0e6c8', false);
      for (const [which, base, pinCol] of [['weather', '#f6edd3', '#f2c14e'], ['city', '#e4efd6', '#4f8fe0']]) {
        const st = this.cardAnim(which);
        if (!st) continue;
        const n = NOTES[which];
        this.b.save();
        this.b.globalAlpha = st.a;
        this.b.translate(0, st.dy);
        this.paper(n.x, n.y, n.w, n.h, base, which === 'weather');
        if (which === 'weather') this.P(n.x + 5, n.y + 31, n.w - 10, 1, '#d9cba4');
        if (st.pin) this.pin(n.x + n.w / 2, n.y + (which === 'weather' ? 4 : 3), pinCol);
        this.b.restore();
      }
      if (!moving) this.pin(PINS[this.cli].x, PINS[this.cli].y, '#e2445c');
    }
    // the pin in the agent's hand: lifts off, travels along an arc, presses in
    drawPinFlight() {
      const a = this.pinAnim;
      if (!a || a.kind !== 'cli' || a.t0 == null) return;
      const age = this.t - a.t0;
      let t = 0;
      for (const seg of a.segs) {
        if (age <= t + seg.dur || seg === a.segs[a.segs.length - 1]) {
          const k = Math.max(0, Math.min(1, (age - t) / seg.dur));
          const x = seg.p0.x + (seg.p1.x - seg.p0.x) * k;
          const y = seg.p0.y + (seg.p1.y - seg.p0.y) * k - (seg.arc ? seg.arc * Math.sin(Math.PI * k) : 0);
          if (!(seg.vanish && k >= 1)) this.pin(Math.round(x), Math.round(y), a.color);
          return;
        }
        t += seg.dur;
      }
    }
    pinner() {
      const free = this.agents.filter((A) => A.id !== this.newsDelivery?.id && !this.kitchen?.reserved(A.id) && !this.isAway(A.id) && !this.pinned.has(A.id) && this.st[A.id]?.status === 'idle' && !this.talkedTo(A.id));
      return free[Math.floor(Math.random() * free.length)] ?? null;
    }
    // an agent walks to the board and moves the pin; without a free agent the pin simply jumps
    setDisplayMode(on){DISPLAY.setEnabled(on);}
    applyBoardAction(kind,to){
      if(kind==='cli')this.cli=to;
      else if(kind==='lang')I.set(to);
      else if(kind==='loc')this.locOn=to;
      else if(kind==='display')this.setDisplayMode(to); // Restore a legacy in-flight trip without exposing a board control.
      else if(kind==='refresh'){this.fx.boardTap={t0:this.t,note:'refresh'};this.handlers.onBoardRefresh?.();}
      else if(kind==='usage'){this.fx.boardTap={t0:this.t,note:'usage',provider:to};this.handlers.onUsage?.(to);}
    }
    drawBoardTapGlow(){
      const tap=this.fx.boardTap;if(!tap)return;const pulse=Math.max(0,1-(this.t-tap.t0)/2);if(!pulse)return;
      const n=NOTES[tap.note];if(!n)return;const x=tap.note==='usage'?n.x+['claude','codex','antigravity'].indexOf(tap.provider)*25+12:n.x+n.w/2;
      this.b.save();this.b.globalCompositeOperation='lighter';this.glow(x,n.y+n.h/2,10+pulse*8,'#7ce3b8',pulse*.9);this.b.restore();
    }
    movePin(kind, to) {
      const apply=()=>this.applyBoardAction(kind,to);
      if (this.pinAnim) { apply(); return; }
      if(window.OfficeCat.tryControl(this,{kind,to}))return;
      const agent = this.pinner();
      if (!agent) { apply(); return; }
      let anim, spot;
      if (kind === 'cli') {
        spot = { x: BOARD.x + 50, y: WALK_Y + 8 };
        const up = (p, d = 9) => ({ x: p.x, y: p.y - d });
        const f = PINS[this.cli], t = PINS[to];
        const segs = [{ p0: f, p1: up(f), dur: 0.5 }, { p0: up(f), p1: up(t), dur: 0.9, arc: 8 }, { p0: up(t), p1: t, dur: 0.3 }];
        anim = { kind, to, segs, color: '#e2445c', total: segs.reduce((n, g) => n + g.dur, 0) };
      } else if(['display','refresh','usage'].includes(kind)){
        const n=NOTES[kind==='display'?'loc':kind],dx=kind==='usage'?Math.max(0,['claude','codex','antigravity'].indexOf(to))*25+12:n.w/2;spot={x:n.x+dx,y:WALK_Y+8};anim={kind,to,segs:[],total:1.8,switchAt:.9,switched:false};
      } else if (kind === 'lang') {
        spot = { x: NOTES.langTr.x + 15, y: WALK_Y + 8 }; // under the TR | EN tags: flip them, the language changes mid-flip
        anim = { kind, to, segs: [], color: '#000', total: 2.0, switchAt: 1.0, switched: false };
      } else {
        spot = { x: NOTES.loc.x + 30, y: WALK_Y + 8 }; // under the label: wipe the old word, write the new one
        anim = { kind, to, segs: [], color: '#000', total: to ? 3.4 : 3.0, wipeAt: to ? 0 : 0.7, writeAt: to ? 1.0 : 1.7 };
      }
      Object.assign(anim, { t0: null, created: this.t, agentId: agent.id });
      this.pinAnim = anim;
      const ok = this.walkTo(agent.id, spot, { hold: true, pose: 'back', kind: 'pin', act: { type: 'pin' } });
      if (!ok) { this.pinAnim = null; apply(); }
    }

    // Board text (screen resolution): left-aligned title, the cards, the location label, weather and city
    drawBoardText() {
      this.inkK = Math.max(0, Math.min(1, (this.darkness() - 0.22) / 0.12));
      this.inkMap = { // muted night ink: readable, not glaring
        '#2a2036': '#b3a99a', '#4a3a2a': '#8e8472', '#5e4e3c': '#8e8472',
        '#1f5a3a': '#62a583', '#9a6a14': '#b9965a', '#a23a2a': '#b9705f', '#8a8272': '#8a8272', '#6a3a2a': '#b97a68', '#6a5a4a': '#8e8472',
        '#1f3a2a': '#a9bfae', '#3a5a42': '#7f9a86', '#3a2a1a': '#b3a99a',
      };
      this.drawBoardTextInner();
      this.inkMap = null;
    }
    drawBoardTextInner() {
      const s = this.view.s;
      const [bx, by] = this.scr(BOARD.x, BOARD.y);
      // The board origin can be off-screen while its usage strip remains visible at high zoom.
      if (bx + BOARD.w * s < 0 || by + BOARD.h * s < 0 || bx > this.canvas.width || by > this.canvas.height) return;
      const px = (world, minCss) => Math.round(Math.max(world * s, minCss * this.dpr));
      const at = (n, dx, dy) => this.scr(n.x + dx, n.y + dy);
      const [tx, ty] = this.scr(TITLE.x + 5, TITLE.y + TITLE.h - 4);
      this.textD('AGENTS DESK', tx, ty, { color: '#ece9ff', weight: 600, font: px(8.6, 11) });
      const moving = this.pinAnim?.kind === 'cli';
      for (const [key, name, sub] of [['claude', 'claude', 'Claude Code'], ['codex', 'codex', 'Codex CLI']]) {
        const n = NOTES[key];
        const on = !moving && this.cli === key;
        const [x, y] = at(n, 4, on ? -1 : 0);
        this.textD(`$ ${name}`, x, y + Math.round(10 * s), { color: '#2a2036', weight: 600, font: px(6.6, 9) });
        this.textD(sub, x, y + Math.round(18 * s), { color: '#4a3a2a', font: px(4.9, 7) });
      }
      // Agents Deck usage percentages next to the logos
      const us = NOTES.usage;
      const usageFs = px(5.0, 7.5);
      for (const [i, key] of ['claude', 'codex', 'antigravity'].entries()) {
        const entry = this.usage?.providers?.[key];
        const stale = entry?.capturedAt && Date.now() - entry.capturedAt > 45 * 60_000;
        const pct = entry ? entry.percent : null;
        const color = pct === null ? '#8a8272' : pct >= 90 ? '#a23a2a' : pct >= 70 ? '#9a6a14' : '#1f5a3a';
        const [ux, uy] = this.scr(us.x + 13 + i * 25, us.y + 8.5);
        this.textD(pct === null ? '—' : `${pct}%`, ux, uy, { color, weight: 600, font: usageFs, family: 'ui-monospace, Menlo, Consolas, monospace', alpha: stale ? 0.55 : 1 });
      }
      // language switch (TR | EN), between the location label and the usage strip
      for (const [key, label] of [['tr', 'TR'], ['en', 'EN']]) {
        const n = key === 'tr' ? NOTES.langTr : NOTES.langEn;
        const [gx, gy] = at(n, n.w / 2, 8);
        const on = I.lang === key;
        this.textD(label, gx, gy, { color: on ? '#2a2036' : '#8a8272', weight: on ? 600 : 400, font: px(5.4, 8), align: 'center' });
      }
      const [rx, ry] = at(NOTES.refresh, NOTES.refresh.w / 2, 8);
      this.textD(this.boardRefreshing ? '…' : '↻', rx, ry, { color: '#2a2036', font: px(7, 10), align: 'center' });
      // location label (centered): an agent wipes the old word and writes the new one
      const ln = NOTES.loc;
      const [lcx, ly] = at(ln, ln.w / 2, 8);
      const fs = px(5.8, 8);
      const word = (on) => I.t(on ? 'board.loc.on' : 'board.loc.off');
      const colorOf = (on) => (on ? '#1f5a3a' : '#6a3a2a');
      const anim = this.pinAnim?.kind === 'loc' && this.pinAnim.t0 != null ? this.pinAnim : null;
      const ctx = this.ctx;
      const clipText = (text, lx, x0, x1, color) => { ctx.save(); ctx.beginPath(); ctx.rect(x0, ly - fs * 1.2, Math.max(0, x1 - x0), fs * 1.6); ctx.clip(); this.textD(text, lx, ly, { color, weight: 600, font: fs }); ctx.restore(); };
      if (!anim) this.textD(word(this.locOn), lcx, ly, { color: colorOf(this.locOn), weight: 600, font: fs, align: 'center' });
      else {
        const age = this.t - anim.t0;
        const oldText = word(!anim.to), newText = word(anim.to);
        const wOld = this.measureD(oldText, fs, 600), wNew = this.measureD(newText, fs, 600);
        const lxOld = lcx - wOld / 2, lxNew = lcx - wNew / 2;
        const wipe = (age - anim.wipeAt) / 0.9, write = (age - anim.writeAt) / 1.1;
        if (wipe <= 0) this.textD(oldText, lxOld, ly, { color: colorOf(!anim.to), weight: 600, font: fs });
        else if (age < anim.writeAt) { const x = lxOld + wOld * Math.min(1, wipe); clipText(oldText, lxOld, x, lxOld + wOld + 2, colorOf(!anim.to)); if (wipe < 1) this.rectD(x - 2 * this.u, ly - fs, 4 * this.u, fs * 1.3, '#fffdf4'); }
        else { const q = Math.min(1, write); const x = lxNew + wNew * q; clipText(newText, lxNew, lxNew, x, colorOf(anim.to)); if (q < 1) this.rectD(x, ly - fs * 0.9, this.u, fs, '#3a2a1a'); }
      }
      const wst = this.cardAnim('weather'), cst = this.cardAnim('city');
      if (!wst && !cst) return;
      const wi = this.weatherInfo?.weather ?? this.lastWeather;
      if (wst) {
        const wc = NOTES.weather;
        const [wx, wy0] = at(wc, 6, wst.dy);
        const al = wst.a;
        const wy = wy0;
        this.textD(wi.city ?? I.t('board.nearby'), wx, wy + Math.round(11 * s), { color: '#2a2036', weight: 600, font: px(6.8, 9), alpha: al });
        this.textD(`${Math.round(wi.temperature)}°`, wx, wy + Math.round(28 * s), { color: '#a23a2a', weight: 600, font: px(14, 17), alpha: al });
        this.textD(I.describe(wi.code), this.scr(wc.x + wc.w - 5, 0)[0], wy + Math.round(26 * s), { color: '#4a3a2a', font: px(5.6, 8), alpha: al, align: 'right' });
        const rows = [
          wi.feels !== undefined || wi.humidity !== undefined ? `${I.t('board.feels')} ${wi.feels !== undefined ? Math.round(wi.feels) + '°' : '-'} · ${I.t('board.humidity')} ${wi.humidity !== undefined ? '%' + Math.round(wi.humidity) : '-'}` : null,
          wi.wind !== undefined ? `${I.t('board.wind')} ${Math.round(wi.wind)} ${I.t('board.windUnit')} · ${I.t('board.rain')} ${wi.precipitation ?? 0} mm` : null,
          wi.sunrise && wi.sunset ? `${I.t('board.sunrise')} ${wi.sunrise} · ${I.t('board.sunset')} ${wi.sunset}` : null,
          wi.high !== undefined && wi.low !== undefined ? `${I.t('board.today')} ${Math.round(wi.low)}° – ${Math.round(wi.high)}°` : null,
        ].filter(Boolean);
        rows.forEach((r, i) => this.textD(r, wx, wy + Math.round((40 + i * 8.6) * s), { color: '#4a3a2a', font: px(4.7, 6.8), alpha: al }));
      }
      if (cst) {
        const cc = NOTES.city;
        const [cx, cy] = at(cc, 5, cst.dy);
        const al = cst.a;
        this.textD(`${wi.city ?? I.t('board.nearby')}`, cx, cy + Math.round(9 * s), { color: '#1f3a2a', weight: 600, font: px(6.2, 8.5), alpha: al });
        const place = [wi.region && wi.region !== wi.city ? wi.region : null, wi.country].filter(Boolean).join(', ');
        if (place) this.textD(place, cx, cy + Math.round(16 * s), { color: '#3a5a42', font: px(4.8, 7), alpha: al });
        let local = '';
        try { local = wi.timezone ? new Date().toLocaleTimeString(I.t('locale'), { timeZone: wi.timezone, hour: '2-digit', minute: '2-digit' }) : ''; } catch { local = ''; }
        if (local) this.textD(`${I.t('board.localTime')} ${local}`, this.scr(cc.x + cc.w - 4, 0)[0], cy + Math.round(9 * s), { color: '#3a5a42', font: px(4.8, 7), alpha: al, align: 'right' });
      }
    }

    drawLabel(A) {
      const { w, h } = this.deskSize(A);
      const [cx, top] = this.scr(A.x + w / 2, A.y + h + 7 * S);
      if (!this.inView(cx, top)) return;
      const st = this.st[A.id];
      const u = this.u;
      const fs = this.fontDev(5.8, 9);
      const ms = this.fontDev(5, 7.5);
      const label = I.short(A);
      const tw = this.measureD(label, fs, 600);
      const newsState = this.newsSession;
      const state = this.newsDelivery ? 'delivering' : newsState?.reason === 'unavailable' ? 'unavailable' : newsState?.status === 'idle' && newsState.appliedAt ? 'published' : newsState?.status ?? 'idle';
      const tagText = A.kind === 'news' && newsState
        ? `${I.t(`desk.status.${state}`)} · ${newsState.progress?.percent ?? 0}%` : I.t(st.tag);
      const tagFamily = A.kind === 'news' ? 'ui-monospace, Menlo, Consolas, monospace' : FONT;
      const mw = Math.round(this.measureD(tagText, ms, 600, tagFamily) + 3 * u);
      const lh = Math.round(fs + 3 * u);
      if(DISPLAY.external){
        const nameSize=Math.max(fs,24*this.dpr),stateSize=Math.max(ms,20*this.dpr),padding=6*this.dpr;
        const nameWidth=this.measureD(label,nameSize,600),stateWidth=this.measureD(tagText,stateSize,600,tagFamily);
        const width=Math.max(nameWidth,stateWidth)+2*padding,height=nameSize+stateSize+3*padding;
        const left=Math.max(padding,Math.min(this.canvas.width-width-padding,cx-width/2));
        this.boxD(left,top,width,height,'#171b27',this.selected===A.id?'#d7d3a2':'#384455','#10131e');
        this.textD(label,left+width/2,top+padding+nameSize,{font:nameSize,weight:600,color:'#f2eee3',align:'center'});
        const color=st.status==='error'?'#ffb7bb':st.status==='typing'||st.status==='thinking'?'#b5e5c6':'#b9d2e3';
        this.textD(tagText,left+width/2,top+2*padding+nameSize+stateSize,{font:stateSize,weight:600,family:tagFamily,color,align:'center'});
        return;
      }
      const total = Math.round(tw + mw + 7 * u);
      const x0 = Math.round(cx - total / 2);
      const selected = this.selected === A.id;
      this.boxD(x0, top, total, lh, selected ? '#2c2347' : '#1e1828', selected ? '#ffd45c' : '#0e0a14', '#15111d');
      this.rectD(x0 + u, top + u, total - 2 * u, u, '#2f2740');
      this.textD(label, x0 + 3 * u, top + lh - 2 * u, { color: '#efe9f7', weight: 600, font: fs });
      const mx = x0 + total - mw - 2 * u;
      const col = st.status === 'typing' || st.status === 'thinking' ? '#3ccf8e' : st.status === 'error' ? '#ff6b84' : A.accent;
      this.rectD(mx, top + 1.5 * u, mw, lh - 3 * u, col);
      this.rectD(mx, top + 1.5 * u, mw, u, K.tone(col, 0.4));
      this.textD(tagText, mx + mw / 2, top + lh - 2.4 * u, { color: '#130f1c', weight: 600, align: 'center', font: ms, family: tagFamily });
    }

    // Speech bubbles: wrapped, stacked so none covers another, clickable
    drawBubbles() {
      this.bubbleHits = [];
      const u = this.u;
      const fs = DISPLAY.external?Math.max(32*this.dpr,this.fontDev(8.4,12)):this.fontDev(8.4,12);
      const lineH = Math.round(fs * (DISPLAY.external?1.3:1.22));
      const maxPx = DISPLAY.external?Math.min(this.canvas.width*.8,720*this.dpr):Math.round(this.compact ? 190 * this.dpr * 0.7 : 280 * this.dpr);
      const items = [];
      for (const bub of this.bubbles) {
        let wx, wy;
        if (bub.at) { wx = bub.at.wx; wy = bub.at.wy; } else {
          const A = this.byId[bub.id];
          if (!A) continue;
          const pos = this.posOf(bub.id);
          if (pos) { wx = pos.x; wy = pos.y - 26 * S; } else { const q = this.talkedTo(bub.id) ? this.ent(A, this.seatX(A), A.y - 4) : this.ent(A, this.seatX(A), A.y - 30); wx = q.x; wy = q.y; }
        }
        const [ax, ay] = this.scr(wx, wy);
        if (!this.inView(ax, ay)) continue;
        const lines = this.wrapD(bub.text, fs, maxPx);
        const tw = Math.max(...lines.map((l) => this.measureD(l, fs)));
        items.push({ bub, ax, ay, lines, w: Math.round(tw + 7 * u), h: Math.round(lines.length * lineH + 3 * u) });
      }
      const placed = [];
      items.sort((p, q) => q.ay - p.ay);
      for (const it of items) {
        let bx = Math.round(it.ax - it.w / 2);
        bx = Math.max(2 * u, Math.min(this.canvas.width - it.w - 2 * u, bx));
        let by = Math.round(it.ay - it.h - 3 * u);
        for (let guard = 0; guard < 8; guard++) {
          const hit = placed.find((r) => bx < r.x + r.w + u && bx + it.w + u > r.x && by < r.y + r.h + u && by + it.h + u > r.y);
          if (!hit) break;
          by = hit.y - it.h - u;
        }
        if(DISPLAY.external)by=Math.max(2*u,by);
        it.x = bx; it.y = by;
        placed.push({ x: bx, y: by, w: it.w, h: it.h });
      }
      for (const it of items) {
        const fill = it.bub.fill || (it.bub.act || it.bub.onClick || it.bub.source ? '#fff7dc' : '#fbf6ec');
        const shade = it.bub.shade || '#ddd3c4';
        this.boxD(it.x, it.y, it.w, it.h, fill, '#20172b', shade);
        const tx = Math.max(it.x + 3 * u, Math.min(it.x + it.w - 5 * u, Math.round(it.ax) - u));
        const tipY = it.y + it.h;
        if (Math.abs(it.y + it.h - (it.ay - 3 * u)) < 2 * u) {
          this.rectD(tx, tipY - u, 3 * u, u, fill);
          this.rectD(tx - u, tipY - u, u, 2 * u, '#20172b');
          this.rectD(tx + 3 * u, tipY - u, u, 2 * u, '#20172b');
          this.rectD(tx, tipY, 2 * u, u, fill);
          this.rectD(tx, tipY + u, 2 * u, u, '#20172b');
          this.rectD(tx + 2 * u, tipY, u, u, '#20172b');
        }
        it.lines.forEach((ln, i) => this.textD(ln, it.x + 3.5 * u, it.y + Math.round(u * 1.5) + (i + 1) * lineH - Math.round(lineH * 0.22), { color: '#1d1626', font: fs }));
        if (it.bub.act || it.bub.onClick || it.bub.source) this.bubbleHits.push({ x: it.x, y: it.y, w: it.w, h: it.h, bub: it.bub });
      }
    }

    // ---------- picking ----------
    pick(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      const cx = (clientX - rect.left) * this.dpr;
      const cy = (clientY - rect.top) * this.dpr;
      for (const hb of [...this.bubbleHits].reverse()) if (cx >= hb.x && cx <= hb.x + hb.w && cy >= hb.y && cy <= hb.y + hb.h) return { part: 'bubble', bub: hb.bub };
      const wp = this.screenToWorld(clientX - rect.left, clientY - rect.top);
      const { x: wx, y: wy } = wp;
      for (const [id, w] of Object.entries(this.walks)) {
        if (!w.cur) continue;
        const p = this.walkPos(w.cur);
        if (wx >= p.x - 8 * S && wx <= p.x + 8 * S && wy >= p.y - 26 * S && wy <= p.y + 2 * S) return { id, part: 'agent' };
      }
      for (const A of [...this.agents].sort((a, b) => b.y - a.y)) {
        const { w, h } = this.deskSize(A);
        const q = this.unent(A, wx, wy); // the point in the unscaled drawing of this desk
        const mx = A.x + Math.round(w / 2) - 5;
        const my = A.y - 18;
        if (q.x >= mx && q.x <= mx + 25 && q.y >= my && q.y <= my + 18) return { id: A.id, part: 'screen' };
        if (q.x >= A.x - 4 && q.x <= A.x + w && q.y >= A.y - 12 && q.y <= A.y + h + 14) return { id: A.id, part: 'agent' };
      }
      const c = this.cat;
      if (wx >= c.x + 9 - 14 * CAT_SCALE && wx <= c.x + 9 + 14 * CAT_SCALE && wy >= c.y + 10 - 24 * CAT_SCALE - (c.lift ?? 0) && wy <= c.y + 10 + 2 * CAT_SCALE - (c.lift ?? 0)) return { id: 'cat', part: 'prop' };
      for (let i = 1; i < L.FLOOR_CABLE.length; i++) {
        const [ax, ay] = L.FLOOR_CABLE[i - 1], [bx, by] = L.FLOOR_CABLE[i];
        if (wx >= Math.min(ax, bx) - 3 && wx <= Math.max(ax, bx) + 3 && wy >= Math.min(ay, by) - 3 && wy <= Math.max(ay, by) + 3) return { id: 'floor-cable', part: 'prop' };
      }
      for (const [id, x, y, w, h] of PROPS) if (wx >= x && wx <= x + w && wy >= y && wy <= y + h) return { id, part: 'prop' };
      return null;
    }
    handleClick(e) {
      const hit = this.pick(e.clientX, e.clientY);
      if (hit?.part === 'bubble') { if (hit.bub.act && this.handlers.onAct) this.handlers.onAct(hit.bub.act); else if (hit.bub.onClick) hit.bub.onClick(hit.bub); return; }
      if (hit?.part === 'prop') {
        if (hit.id === 'floor-display') this.handlers.onFloorScreen?.();
        else if (hit.id === 'floor-cable') this.handlers.onFloorCable?.();
        else if (hit.id === 'board-refresh') this.movePin('refresh',true);
        else if (hit.id.startsWith('usage-')) this.movePin('usage',hit.id.slice(6));
        else if (hit.id === 'cat') this.poke();
        else if (hit.id === 'cli-claude' || hit.id === 'cli-codex') {
          const key = hit.id.slice(4);
          if (key !== this.cli || this.pinAnim) { const ok = this.handlers.onCli ? this.handlers.onCli(key) : true; if (ok !== false) this.movePin('cli', key); }
        } else if (hit.id === 'lang-tr' || hit.id === 'lang-en') { const to = hit.id.slice(5); if (to !== I.lang && !this.pinAnim) this.movePin('lang', to);
        } else if (hit.id === 'loc') {
          Promise.resolve(this.handlers.onLoc ? this.handlers.onLoc() : null).then((state) => { if (typeof state === 'boolean' && state !== this.locOn) this.movePin('loc', state); });
        }
        else if (hit.id === 'led') { if (this.handlers.onLed) this.handlers.onLed(this.news.articles[this.led.index % Math.max(1, this.news.articles.length)] ?? null); }
        else this.interact(hit.id);
        return;
      }
      if (this.handlers.onPick) this.handlers.onPick(hit ? this.byId[hit.id] : null, hit ? hit.part : null);
    }
  }

  window.OfficeView = OfficeView;
})();
