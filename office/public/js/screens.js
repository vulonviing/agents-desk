// What the idle monitors show: independent random selections of small pixel scenes (Excel, X, Instagram, Facebook, VS Code, Claude,
// Codex, Copilot, Antigravity, WhatsApp, Chrome, football, basketball, tennis). Every desk has its own order and timing,
// so the room never looks synchronised. Scenes are drawn into a 20 x 11 pixel screen through P(x, y, w, h, colour).
// Each scene also has a tint and a brightness: the lighting code uses them so the light falling out of a monitor
// really has the colour and strength of what is on it (a football pitch is green and bright, VS Code is dim and blue).
(function () {
  'use strict';
  const W = 20;
  const H = 11;
  const rnd = (n) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };
  const wave = (t, f, a = 1, ph = 0) => Math.sin(t * f + ph) * a;

  // text-like dashes: a line of n pixels at row y
  const dash = (P, x, y, n, c) => P(x, y, n, 1, c);

  const SCENES = {
    excel: {
      tint: '#dff2e6', light: 0.9, len: 16,
      draw(P, t, s) {
        P(0, 0, W, H, '#f6f6f6'); P(0, 0, W, 1, '#217346'); P(1, 0, 4, 1, '#4fa573');
        P(0, 1, W, 1, '#e1e4e6'); P(0, 1, 3, H - 1, '#e1e4e6');
        for (const x of [3, 8, 13, 18]) P(x, 1, 1, H - 1, '#c9ced2');
        for (const y of [3, 5, 7, 9]) P(3, y, W - 3, 1, '#d6dade');
        const nums = [[4, 2, 3], [9, 2, 4], [14, 2, 3], [4, 4, 4], [9, 4, 2], [14, 4, 4], [4, 6, 2], [9, 6, 4], [14, 6, 3], [4, 8, 3], [9, 8, 3]];
        for (const [x, y, n] of nums) dash(P, x, y, n, '#3a3f45');
        // selection walks through the cells; a chart grows after a while
        const c = Math.floor(s * 0.9) % 12;
        const cx = 3 + (c % 3) * 5, cy = 2 + Math.floor(c / 3) * 2;
        P(cx, cy, 6, 1, '#217346'); P(cx, cy + 2, 6, 1, '#217346'); P(cx, cy, 1, 3, '#217346'); P(cx + 5, cy, 1, 3, '#217346');
        if (s > 5) { const g = Math.min(1, (s - 5) / 3); for (let i = 0; i < 4; i++) P(15 + i, 10 - Math.round((2 + i * 1.4) * g), 1, Math.round((2 + i * 1.4) * g), i % 2 ? '#4472c4' : '#ed7d31'); }
      },
    },
    x: {
      tint: '#8a8a96', light: 0.35, len: 14,
      draw(P, t, s) {
        P(0, 0, W, H, '#000000'); P(0, 0, W, 1, '#16181c');
        P(1, 0, 1, 1, '#ffffff'); P(3, 0, 1, 1, '#ffffff'); P(2, 0, 1, 1, '#9aa0a6');
        const off = Math.floor(s * 2.5) % 5;
        for (let i = -1; i < 4; i++) {
          const y = 2 + i * 5 - off;
          if (y < 1 || y > H - 2) continue;
          P(1, y, 2, 2, ['#1d9bf0', '#7856ff', '#00ba7c', '#f91880'][(i + Math.floor(s / 2.5)) & 3]);
          dash(P, 4, y, 8 + ((i * 3 + 5) & 3), '#e7e9ea'); dash(P, 4, y + 1, 6 + ((i * 5) & 3), '#71767b');
          if (i === 1 && s % 6 > 4) P(17, y, 2, 1, '#f91880');
        }
      },
    },
    instagram: {
      tint: '#d27ab8', light: 0.7, len: 14,
      draw(P, t, s) {
        P(0, 0, W, H, '#fafafa'); P(0, 0, W, 2, '#ffffff'); P(1, 0, 3, 1, '#c13584'); P(15, 0, 4, 1, '#262626'); P(0, 1, W, 1, '#dbdbdb');
        const off = Math.floor(s * 3) % 18;
        for (let i = -1; i < 3; i++) {
          const y = 2 + i * 9 - off;
          const pal = [['#f58529', '#dd2a7b'], ['#8134af', '#515bd4'], ['#00a8cc', '#7ee8a8'], ['#fcb045', '#fd1d1d']][((i + Math.floor(s / 5)) & 3 + 4) % 4];
          for (let yy = 0; yy < 7; yy++) { const yy2 = y + yy; if (yy2 >= 2 && yy2 < H) P(1, yy2, 18, 1, yy < 4 ? pal[0] : pal[1]); }
          if (y + 8 >= 2 && y + 8 < H) { P(1, y + 8, 2, 1, '#262626'); P(4, y + 8, 2, 1, '#262626'); }
        }
        if (s % 7 > 5) { P(8, 4, 4, 3, '#ff3040'); P(9, 7, 2, 1, '#ff3040'); }
      },
    },
    facebook: {
      tint: '#7aa0ee', light: 0.75, len: 14,
      draw(P, t, s) {
        P(0, 0, W, H, '#f0f2f5'); P(0, 0, W, 2, '#1877f2'); P(1, 0, 3, 2, '#ffffff'); P(5, 0, 8, 1, '#5b9bf5');
        const off = Math.floor(s * 2.2) % 8;
        for (let i = -1; i < 3; i++) {
          const y = 3 + i * 8 - off;
          for (let yy = 0; yy < 7; yy++) { const y2 = y + yy; if (y2 >= 2 && y2 < H) P(1, y2, 18, 1, yy === 0 ? '#e4e6eb' : '#ffffff'); }
          if (y + 1 >= 2 && y + 1 < H) { P(2, y + 1, 2, 2, ['#e4a13c', '#3c8ee4', '#e43c8e'][(i + 3) % 3]); dash(P, 5, y + 1, 6, '#65676b'); }
          if (y + 4 >= 2 && y + 4 < H) { dash(P, 2, y + 4, 15, '#bcc0c4'); }
          if (y + 6 >= 2 && y + 6 < H) P(2, y + 6, 2, 1, '#1877f2');
        }
      },
    },
    vscode: {
      tint: '#5a82c0', light: 0.42, len: 20,
      draw(P, t, s) {
        P(0, 0, W, H, '#1e1e1e'); P(0, 0, 2, H, '#333333'); P(2, 0, 4, H, '#252526');
        P(0, 1, 2, 2, '#3b9cff'); P(0, 4, 2, 1, '#8a8a8a'); P(0, 6, 2, 1, '#8a8a8a');
        P(6, 0, W - 6, 1, '#2d2d2d'); P(6, 0, 5, 1, '#1e1e1e'); P(6, 0, 5, 1, '#1e1e1e'); P(6, 0, 5, 0, '#007acc');
        P(0, H - 1, W, 1, '#007acc');
        dash(P, 3, 2, 2, '#c5c5c5'); dash(P, 3, 4, 2, '#8a8a8a'); dash(P, 3, 6, 2, '#8a8a8a'); dash(P, 3, 8, 2, '#8a8a8a');
        const cols = ['#c586c0', '#9cdcfe', '#ce9178', '#4ec9b0', '#dcdcaa', '#569cd6'];
        const typed = Math.floor(s * 5);
        for (let i = 0; i < 6; i++) {
          const ind = ((i * 7) % 3) * 2;
          const len = 3 + ((i * 5 + 3) % 6);
          const shown = Math.max(0, Math.min(len, typed - i * 6));
          dash(P, 7 + ind, 2 + i, shown, cols[i % cols.length]);
        }
        if (Math.floor(s * 2) % 2) P(7 + (((Math.floor(typed / 6) * 7) % 3) * 2) + Math.min(3 + ((Math.floor(typed / 6) * 5 + 3) % 6), typed % 6), 2 + Math.min(5, Math.floor(typed / 6)), 1, 1, '#ffffff');
      },
    },
    claude: {
      tint: '#e0a283', light: 0.55, len: 16,
      draw(P, t, s) {
        P(0, 0, W, H, '#2b2622'); P(0, 0, W, 1, '#1f1b18');
        // the Claude mark: an orange asterisk
        const ax = 1, ay = 1;
        P(ax + 2, ay, 1, 5, '#d97757'); P(ax, ay + 2, 5, 1, '#d97757'); P(ax + 1, ay + 1, 1, 1, '#d97757'); P(ax + 3, ay + 3, 1, 1, '#d97757'); P(ax + 3, ay + 1, 1, 1, '#d97757'); P(ax + 1, ay + 3, 1, 1, '#d97757');
        const shown = Math.floor(s * 4);
        for (let i = 0; i < 4; i++) { dash(P, 8, 2 + i * 2, Math.max(0, Math.min(9 - ((i * 3) % 4), shown - i * 6)), i % 2 ? '#c9c2b8' : '#efe8dc'); }
        P(1, 8, 18, 2, '#3a342e'); P(1, 8, 18, 1, '#4a433b'); if (Math.floor(s * 2) % 2) P(3, 9, 1, 1, '#d97757');
      },
    },
    codex: {
      tint: '#a8c0b0', light: 0.36, len: 16,
      draw(P, t, s) {
        P(0, 0, W, H, '#0d0d0d'); P(0, 0, W, 1, '#1c1c1c');
        // the OpenAI knot: a small white ring with a centre
        P(2, 1, 3, 1, '#e8edf2'); P(1, 2, 1, 3, '#e8edf2'); P(5, 2, 1, 3, '#e8edf2'); P(2, 5, 3, 1, '#e8edf2'); P(3, 3, 1, 1, '#e8edf2'); P(2, 2, 1, 1, '#9aa2aa'); P(4, 4, 1, 1, '#9aa2aa');
        const shown = Math.floor(s * 6);
        for (let i = 0; i < 6; i++) { P(8, 2 + i, 1, 1, '#3ccf8e'); dash(P, 10, 2 + i, Math.max(0, Math.min(6 + ((i * 7) % 4), shown - i * 5)), i % 3 === 0 ? '#e8edf2' : '#8a9199'); }
        if (Math.floor(s * 2) % 2) P(10 + Math.min(6, shown % 7), 2 + Math.min(5, Math.floor(shown / 5)), 1, 1, '#3ccf8e');
      },
    },
    copilot: {
      tint: '#9a80e0', light: 0.42, len: 14,
      draw(P, t, s) {
        P(0, 0, W, H, '#0d1117'); P(0, 0, W, 1, '#161b22');
        // Copilot goggles: two rounded eyes on a violet band
        P(1, 1, 7, 4, '#8957e5'); P(2, 2, 2, 2, '#0d1117'); P(5, 2, 2, 2, '#0d1117'); P(3, 5, 3, 1, '#6e40c9');
        const shown = Math.floor(s * 5);
        for (let i = 0; i < 5; i++) dash(P, 10, 1 + i * 2, Math.max(0, Math.min(8 - (i % 3), shown - i * 5)), i % 2 ? '#8b949e' : '#c9d1d9');
        P(1, 8, 18, 2, '#161b22'); P(1, 8, 18, 1, '#30363d'); if (Math.floor(s * 2) % 2) P(3, 9, 1, 1, '#8957e5');
      },
    },
    antigravity: {
      tint: '#7f90ff', light: 0.46, len: 16,
      draw(P, t, s) {
        P(0, 0, W, H, '#10101a'); P(0, 0, W, 1, '#1a1a2a');
        // the Antigravity mark: an arch-shaped A, cyan to violet
        const rows = ['..#..', '.###.', '##.##', '#...#', '#...#', '#...#'];
        rows.forEach((line, dy) => { for (let dx = 0; dx < 5; dx++) if (line[dx] === '#') P(2 + dx, 2 + dy, 1, 1, dy < 2 ? '#4cc9f0' : dy < 4 ? '#5a7bff' : '#a066f0'); });
        const shown = Math.floor(s * 5);
        for (let i = 0; i < 5; i++) dash(P, 9, 2 + i * 2, Math.max(0, Math.min(9 - (i % 3), shown - i * 5)), i % 2 ? '#8a8fb8' : '#d6d9f5');
        P(1, 9, 18, 1, '#2a2a46'); P(1, 9, Math.round(18 * ((s / 8) % 1)), 1, '#5a7bff');
      },
    },
    whatsapp: {
      tint: '#a8d8b0', light: 0.75, len: 16,
      draw(P, t, s) {
        P(0, 0, W, H, '#ece5dd'); P(0, 0, W, 2, '#075e54'); P(1, 0, 2, 2, '#cfe8d8'); dash(P, 4, 0, 6, '#9cd2c0');
        const msgs = [[1, 3, 9, '#ffffff'], [9, 5, 9, '#dcf8c6'], [1, 7, 6, '#ffffff'], [10, 9, 8, '#dcf8c6']];
        const shown = Math.min(msgs.length, 1 + Math.floor(s / 2.2));
        for (let i = 0; i < shown; i++) { const [x, y, w, c] = msgs[i]; P(x, y, w, 1, c); P(x, y + 1, w, 1, c); dash(P, x + 1, y, w - 3, '#a9b0b5'); if (c !== '#ffffff') P(x + w - 2, y + 1, 1, 1, '#53bdeb'); }
        if (shown < msgs.length && Math.floor(s * 3) % 2) { P(2, 9, 1, 1, '#9aa0a6'); P(4, 9, 1, 1, '#9aa0a6'); }
      },
    },
    chrome: {
      tint: '#e8ebf2', light: 0.85, len: 18,
      draw(P, t, s) {
        const site = Math.floor(s / 4.5) % 5;
        P(0, 0, W, H, '#ffffff'); P(0, 0, W, 2, '#dee1e6'); P(1, 0, 5, 2, '#ffffff'); P(2, 0, 1, 1, ['#ea4335', '#fbbc04', '#34a853', '#4285f4', '#a142f4'][site]);
        P(7, 0, 3, 1, '#c9ccd2'); P(0, 2, W, 1, '#f1f3f4'); P(2, 2, 12, 1, '#e8eaed');
        const loaded = Math.min(1, (s % 4.5) / 0.8);
        if (loaded < 1) { P(0, 2, Math.round(W * loaded), 1, '#4285f4'); return; }
        if (site === 0) { P(1, 4, 18, 3, '#e8eaed'); dash(P, 2, 8, 12, '#202124'); dash(P, 2, 10, 9, '#9aa0a6'); }        // news
        else if (site === 1) { P(0, 3, W, H - 3, '#0f0f0f'); P(8, 5, 4, 3, '#ff0000'); P(9, 6, 1, 1, '#ffffff'); P(1, 10, Math.round(18 * ((s % 4.5) / 4.5)), 1, '#ff0000'); } // video
        else if (site === 2) { for (let i = 0; i < 6; i++) P(1 + (i % 3) * 6, 4 + Math.floor(i / 3) * 4, 5, 3, ['#f6c177', '#9ccfd8', '#c4a7e7', '#eb6f92', '#31748f', '#ebbcba'][i]); } // shop
        else if (site === 3) { dash(P, 3, 4, 3, '#4285f4'); dash(P, 6, 4, 2, '#ea4335'); dash(P, 8, 4, 2, '#fbbc04'); dash(P, 10, 4, 2, '#34a853'); for (let i = 0; i < 3; i++) { dash(P, 2, 6 + i * 2, 12 - i, i ? '#202124' : '#1a0dab'); } } // search
        else { P(0, 3, W, H - 3, '#cfe3c6'); P(0, 6, W, 1, '#fde293'); P(7, 3, 1, H - 3, '#fde293'); P(12, 5, 6, 4, '#a8d2f0'); P(9, 7, 2, 2, '#ea4335'); } // maps
      },
    },
    football: {
      tint: '#7cc974', light: 0.72, len: 22,
      draw(P, t, s) {
        for (let i = 0; i < 5; i++) P(0, i * 2 + 1, W, 2, i % 2 ? '#2f8a3a' : '#379642');
        P(0, 0, W, 1, '#2f8a3a'); P(0, 0, 8, 1, '#101418'); P(1, 0, 2, 1, '#ff4d4d'); P(5, 0, 2, 1, '#4d7dff');
        P(0, H - 1, W, 1, '#2f8a3a');
        const L = '#e8f5e4'; P(0, 1, 1, 9, L); P(W - 1, 1, 1, 9, L); P(0, 1, W, 1, L); P(0, 9, W, 1, L); P(9, 1, 1, 9, L); P(8, 4, 3, 3, L); P(9, 5, 1, 1, '#379642');
        P(0, 3, 3, 5, L); P(1, 4, 1, 3, '#379642'); P(W - 3, 3, 3, 5, L); P(W - 2, 4, 1, 3, '#379642');
        const attackRight = Math.floor(s / 5) % 2 === 0;
        for (let i = 0; i < 5; i++) {
          const bx = 3 + ((i * 3) % 12), by = 3 + ((i * 2) % 6);
          P(Math.round(bx + wave(s, 0.9, 2, i)), Math.round(by + wave(s, 1.3, 1.2, i * 2)) + 1, 1, 1, '#ff5a5a');
          P(Math.round(bx + 4 + wave(s, 0.8, 2, i + 3)), Math.round(by + wave(s, 1.1, 1.2, i * 3)) + 1, 1, 1, '#5a82ff');
        }
        const k = (s % 5) / 5;
        const bx = attackRight ? 3 + k * 14 : 17 - k * 14;
        P(Math.round(bx), 5 + Math.round(wave(s, 4, 1.2)), 1, 1, '#ffffff');
        if (k > 0.93) { P(0, 0, W, H, 'rgba(255,255,255,0.35)'); }
      },
    },
    basketball: {
      tint: '#e0a05a', light: 0.7, len: 20,
      draw(P, t, s) {
        P(0, 0, W, H, '#c47a3a'); for (let i = 0; i < 5; i++) P(0, i * 2 + 1, W, 1, '#b86f33');
        P(0, 0, W, 1, '#101418'); P(1, 0, 2, 1, '#ffcf4a'); P(5, 0, 2, 1, '#ffffff');
        const L = '#f3e2c4'; P(0, 1, W, 1, L); P(0, 10, W, 1, L); P(0, 1, 1, 10, L); P(W - 1, 1, 1, 10, L); P(9, 1, 1, 10, L);
        P(1, 4, 4, 4, L); P(2, 5, 2, 2, '#c47a3a'); P(W - 5, 4, 4, 4, L); P(W - 4, 5, 2, 2, '#c47a3a');
        P(0, 5, 1, 2, '#ff6a1a'); P(W - 1, 5, 1, 2, '#ff6a1a');
        for (let i = 0; i < 5; i++) {
          P(Math.round(10 + wave(s, 0.8, 6, i) * (i % 2 ? 1 : -1)), Math.round(3 + (i * 2) % 6 + wave(s, 1.2, 1, i)), 1, 1, '#ffcf4a');
          P(Math.round(10 + wave(s, 0.7, 6, i + 2)), Math.round(3 + (i * 3) % 6 + wave(s, 1.1, 1, i + 1)), 1, 1, '#ffffff');
        }
        const bounce = Math.abs(wave(s, 5, 1.6));
        P(Math.round(10 + wave(s, 0.6, 7)), Math.round(6 - bounce), 1, 1, '#ff7a1a');
      },
    },
    tennis: {
      tint: '#79b0dd', light: 0.66, len: 20,
      draw(P, t, s) {
        P(0, 0, W, H, '#3b7ea1'); P(0, 0, W, 1, '#101418'); P(1, 0, 2, 1, '#e8f060'); P(5, 0, 2, 1, '#ffffff');
        const L = '#eaf4fa'; P(1, 1, W - 2, 1, L); P(1, 10, W - 2, 1, L); P(1, 1, 1, 10, L); P(W - 2, 1, 1, 10, L); P(1, 3, W - 2, 1, L); P(1, 8, W - 2, 1, L); P(9, 3, 1, 6, L);
        for (let y = 1; y < H; y += 2) P(10, y, 1, 1, '#ffffff'); // the net
        const k = (s % 2) / 2, dir = Math.floor(s / 2) % 2 ? 1 : -1;
        const bx = 10 + dir * (k * 2 - 1) * 8, by = 6 - Math.sin(k * Math.PI) * 3;
        P(Math.round(10 - dir * 8), Math.round(6 + wave(s, 3, 1)), 1, 2, '#ffe066');
        P(Math.round(10 + dir * 8), Math.round(6 + wave(s, 2.6, 1, 1)), 1, 2, '#ff9a9a');
        P(Math.round(bx), Math.round(by), 1, 1, '#e8f060');
      },
    },
  };
  const ORDER = Object.keys(SCENES);

  // Each desk owns a random stream. Persisted RNG/history keep a refresh on the same scene.
  const players = new Map();
  const random = state => {
    state.rng = (state.rng + 0x6d2b79f5) >>> 0;
    let x = state.rng;
    x = Math.imul(x ^ x >>> 15, x | 1);
    x ^= x + Math.imul(x ^ x >>> 7, x | 61);
    return ((x ^ x >>> 14) >>> 0) / 4294967296;
  };
  function next(state, at) {
    const choices = ORDER.filter(id => !state.recent.includes(id));
    state.id = choices[Math.floor(random(state) * choices.length)];
    state.recent = [...state.recent, state.id].slice(-3);
    state.at = at;
    state.len = SCENES[state.id].len * (0.75 + random(state) * 0.7);
  }
  function player(seed, t) {
    if (!players.has(seed)) {
      const value = new Uint32Array(1);
      if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(value);
      else value[0] = Math.floor(Math.random() * 4294967296);
      const state = { rng: value[0], recent: [], pausedAt: null };
      next(state, t);
      state.at -= random(state) * state.len * 0.7;
      players.set(seed, state);
    }
    return players.get(seed);
  }
  function at(seed, t) {
    const state = player(seed, t);
    const time = state.pausedAt ?? t;
    // Catch up after a short refresh without replacing any remembered visible scenes.
    for (let i = 0; time >= state.at + state.len && i < 1000; i++) next(state, state.at + state.len);
    const age = Math.max(0, time - state.at);
    return { id: state.id, s: age, left: Math.max(0, state.len - age) };
  }

  window.OfficeScreens = {
    W, H, SCENES,
    snapshot: () => [...players].map(([seed, state]) => [seed, { ...state, recent: [...state.recent] }]),
    restore(saved) {
      if (!Array.isArray(saved)) return;
      players.clear();
      for (const [seed, state] of saved.slice(0, 24)) if (Number.isFinite(seed) && SCENES[state?.id] && Number.isFinite(state.at) && state.len > 0 && Number.isFinite(state.rng) && Array.isArray(state.recent)) {
        players.set(seed, { ...state, recent: state.recent.filter(id => SCENES[id]).slice(-3) });
      }
    },
    setStatus(seed, status, t) {
      const state = player(seed, t);
      if (status !== 'idle' && state.pausedAt === null) state.pausedAt = t;
      else if (status === 'idle' && state.pausedAt !== null) { state.at += t - state.pausedAt; state.pausedAt = null; }
    },
    sceneAt: at,
    /** draw the scene of this desk at time t (seconds) */
    draw(P, seed, t) {
      const { id, s, left } = at(seed, t);
      SCENES[id].draw(P, t, s);
      if (left < 0.25 || s < 0.2) P(0, 0, W, H, 'rgba(8,10,16,0.55)'); // a quick dip when the scene changes
      return id;
    },
    /** colour and strength of the light a screen throws, for the lighting pass */
    tint(seed, t) {
      const { id } = at(seed, t);
      const sc = SCENES[id];
      return { id, color: sc.tint, strength: sc.light * (0.86 + 0.14 * Math.sin(t * 7 + seed)) };
    },
  };
})();
