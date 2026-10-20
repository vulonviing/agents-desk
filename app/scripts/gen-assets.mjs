// Generates the original pixel art of the app (office props, status icons) into a Phaser atlas and
// builds recolored variants of the LimeZu character sheets. Run: `npm run assets` (also part of `npm run build`).
// Palette follows the LimeZu conventions (dark blue-gray outline, warm shadows, soft whites).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { registerDecor } from './gen-decor.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUB = join(HERE, '..', 'public', 'assets');
const OUT = join(PUB, 'generated');
mkdirSync(join(OUT, 'characters'), { recursive: true });

// ---------- tiny raster ----------

const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 255];
const C = {
  K: '#3a3a50', k: '#46465e', g: '#565972', h: '#8f85a9', a: '#a9acbc', b: '#cfd2e0', w: '#f8f8f8', c: '#faf6ee', s: '#a79796',
  e: '#e0b870', d: '#ca8854', D: '#b35e3f', W: '#6b5052',
  B: '#4985cc', L: '#8cc0f0', t: '#95e3e3', T: '#b7ffee', G: '#6fd49a', R: '#e0584f', Y: '#f0d060', O: '#e08a3c', P: '#c07cff',
};
class Img {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Uint8Array(w * h * 4);
  }
  px(x, y, col) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || !col) return;
    const c = typeof col === 'string' ? hex(C[col] ?? col) : col;
    const i = (y * this.w + x) * 4;
    this.d[i] = c[0];
    this.d[i + 1] = c[1];
    this.d[i + 2] = c[2];
    this.d[i + 3] = c[3];
  }
  rect(x, y, w, h, col) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, col);
  }
  // outlined, rounded-corner box
  box(x, y, w, h, fill, outline = 'K') {
    this.rect(x + 1, y, w - 2, h, outline);
    this.rect(x, y + 1, w, h - 2, outline);
    this.rect(x + 1, y + 1, w - 2, h - 2, fill);
  }
  ascii(x, y, rows, map) {
    rows.forEach((row, j) => [...row].forEach((ch, i) => ch !== ' ' && ch !== '.' && this.px(x + i, y + j, map[ch] ?? ch)));
  }
  blit(src, x, y) {
    for (let j = 0; j < src.h; j++) for (let i = 0; i < src.w; i++) {
      const si = (j * src.w + i) * 4;
      if (src.d[si + 3] === 0) continue;
      this.px(x + i, y + j, [src.d[si], src.d[si + 1], src.d[si + 2], src.d[si + 3]]);
    }
  }
}

// ---------- props ----------

const sprites = new Map(); // name → Img
const add = (name, w, h, draw) => {
  const im = new Img(w, h);
  draw(im);
  sprites.set(name, im);
};

// Monitor, front view, 16x13 (low, so a seated character's head stays visible above it).
function monitor(im, state, frame = 0) {
  im.box(1, 0, 14, 10, 'g');
  im.rect(2, 1, 12, 8, 'K');
  const sx = 3;
  const sy = 2;
  const sw = 10;
  const sh = 6;
  const bg = { off: 'k', code: '#1f3a6e', think: '#1f3a6e', chart: '#17455a', error: '#5a1f28', done: '#1d5a3a', idle: '#2a2a4a' }[state];
  im.rect(sx, sy, sw, sh, bg);
  if (state === 'code') {
    const rows = [[0, 6, 'L'], [2, 4, 'T'], [2, 7, 'L'], [0, 5, 'Y'], [3, 5, 'L']];
    rows.forEach(([off, len, col], r) => im.rect(sx + 1 + off, sy + r, Math.min(len + (frame && r === 3 ? 2 : 0), sw - 2 - off), 1, col));
    if (frame) im.px(sx + 7, sy + 4, 'w');
  } else if (state === 'think') {
    [0, 1, 2].forEach((i) => im.rect(sx + 2 + i * 3, sy + 2 - (frame === i ? 1 : 0), 2, 2, 'T'));
  } else if (state === 'chart') {
    [2, 4, 3, 5].forEach((hh, i) => im.rect(sx + 1 + i * 2, sy + sh - 1 - Math.min(hh, sh - 2), 1, Math.min(hh, sh - 2), i % 2 ? 'Y' : 'T'));
    im.rect(sx + 1, sy + sh - 1, sw - 2, 1, 'L');
  } else if (state === 'error') {
    im.rect(sx + 4, sy, 2, 3, 'R');
    im.rect(sx + 4, sy + 4, 2, 1, 'R');
    if (frame) im.rect(sx + 1, sy, sw - 2, sh - 1, '#7a2a34');
  } else if (state === 'done') {
    im.ascii(sx + 2, sy, ['      #', '     ##', '#   ## ', '## ##  ', ' ###   '], { '#': 'G' });
  } else if (state === 'idle') {
    im.rect(sx + 1 + (frame % 4) * 2, sy + 1, 3, 3, '#7a7aa8');
  }
  im.rect(2, 1, 12, 1, 'a');
  im.rect(2, 1, 1, 8, 'a');
  im.rect(6, 10, 4, 1, 'a');
  im.rect(4, 11, 8, 2, 'K');
  im.rect(5, 11, 6, 1, 'a');
}
for (const [state, frames] of [['off', 1], ['code', 2], ['think', 3], ['chart', 1], ['error', 2], ['done', 1], ['idle', 4]]) {
  for (let f = 0; f < frames; f++) add(`monitor_${state}_${f}`, 16, 13, (im) => monitor(im, state, f));
}

// Modern white desk, 32x22 (front view with drawer and legs).
add('desk', 32, 22, (im) => {
  im.box(0, 0, 32, 11, 'b'); // top slab
  im.rect(2, 1, 28, 1, 'w');
  im.rect(1, 9, 30, 1, 's');
  im.rect(2, 11, 28, 7, 'a'); // front panel
  im.rect(2, 11, 28, 1, 'K');
  im.rect(18, 12, 11, 5, 'b');
  im.rect(18, 12, 11, 1, 'w');
  im.rect(22, 14, 3, 1, 'g'); // drawer handle
  im.rect(3, 18, 3, 4, 'K');
  im.rect(26, 18, 3, 4, 'K');
  im.rect(4, 18, 1, 3, 'g');
  im.rect(27, 18, 1, 3, 'g');
});
add('keyboard', 12, 5, (im) => {
  im.box(0, 0, 12, 5, 'b');
  for (let i = 0; i < 4; i++) im.rect(2 + i * 2, 1, 1, 1, 'g');
  for (let i = 0; i < 4; i++) im.rect(2 + i * 2, 3, 1, 1, 'g');
});
add('keyboard_type', 12, 5, (im) => {
  im.box(0, 0, 12, 5, 'b');
  for (let i = 0; i < 4; i++) im.rect(2 + i * 2, 1, 1, 1, i === 1 ? 'Y' : 'g');
  for (let i = 0; i < 4; i++) im.rect(2 + i * 2, 3, 1, 1, i === 2 ? 'Y' : 'g');
});
add('mug', 6, 6, (im) => {
  im.box(0, 1, 5, 5, 'w');
  im.px(5, 2, 'K');
  im.px(5, 3, 'K');
  im.rect(1, 2, 3, 1, '#7a4a3a');
});
add('papers', 9, 7, (im) => {
  im.box(0, 0, 8, 7, 'w');
  im.rect(2, 2, 4, 1, 'a');
  im.rect(2, 4, 5, 1, 'a');
});

// Office chair back (seen from the front, the character sits in front of it), 22x18.
add('chair_back', 22, 18, (im) => {
  im.box(0, 0, 22, 14, 'g');
  im.rect(2, 1, 18, 1, 'h');
  im.rect(2, 2, 1, 10, 'h');
  im.rect(19, 2, 1, 10, 'k');
  im.rect(10, 14, 2, 3, 'K');
  im.rect(5, 17, 12, 1, 'K');
});

// Server rack 16x32 with three blinking states.
for (let f = 0; f < 3; f++) {
  add(`rack_${f}`, 16, 32, (im) => {
    im.box(0, 0, 16, 32, 'g');
    for (let u = 0; u < 5; u++) {
      const y = 2 + u * 6;
      im.rect(2, y, 12, 5, 'K');
      im.rect(3, y + 1, 7, 1, 'k');
      im.rect(3, y + 3, 7, 1, 'k');
      const on = (u + f) % 3;
      im.px(11, y + 1, on === 0 ? 'G' : '#3a6a4a');
      im.px(13, y + 1, on === 1 ? 'Y' : '#6a5a2a');
      im.px(11, y + 3, on === 2 ? 'G' : '#3a6a4a');
      im.px(13, y + 3, f === 2 && u === 3 ? 'R' : '#5a2a2a');
    }
    im.rect(2, 1, 12, 1, 'h');
  });
}
// Elevator doors in a wall (front view, 32x40): frame, two door leaves (closed or open), a call panel and a floor lamp.
function elevator(im, open) {
  im.rect(0, 0, 32, 40, 'K');
  im.rect(1, 1, 30, 4, 'a'); // lintel with the floor lamp
  im.rect(14, 2, 4, 2, open ? 'G' : 'Y');
  im.rect(3, 6, 26, 33, '#202236'); // shaft
  const gap = open ? 9 : 0;
  im.rect(3, 6, 13 - gap, 33, 'g');
  im.rect(16 + gap, 6, 13 - gap, 33, 'g');
  im.rect(15 - gap, 6, 1, 33, 'K');
  im.rect(16 + gap, 6, 1, 33, 'K');
  im.rect(3, 6, 13 - gap, 1, 'L');
  im.rect(16 + gap, 6, 13 - gap, 1, 'L');
  if (open) im.rect(11, 8, 10, 31, '#f4e6b0'); // lit cabin
  im.rect(30, 20, 2, 5, 'a'); // call panel
  im.px(30, 21, 'R');
  im.px(30, 23, 'G');
}
add('elevator_closed', 32, 40, (im) => elevator(im, false));
add('elevator_open', 32, 40, (im) => elevator(im, true));
// Floor directory board for the lobby (32x24): a framed board with coloured lines.
add('board_floors', 32, 24, (im) => {
  im.box(0, 0, 32, 24, 'a');
  im.rect(2, 2, 28, 20, '#20223a');
  [['G', 20], ['B', 14], ['Y', 17]].forEach(([c, len], i) => {
    im.rect(4, 5 + i * 6, 3, 3, c);
    im.rect(9, 6 + i * 6, len, 1, 'w');
  });
});
registerDecor(add);
add('printer', 16, 16, (im) => {
  im.box(1, 5, 14, 10, 'b');
  im.rect(3, 1, 10, 5, 'w');
  im.rect(3, 1, 10, 1, 'K');
  im.rect(4, 8, 8, 2, 'g');
  im.rect(3, 11, 10, 1, 'a');
  im.px(12, 7, 'G');
});
add('cooler', 16, 32, (im) => {
  im.box(3, 0, 10, 11, 'T'); // bottle
  im.rect(4, 2, 3, 6, 'w');
  im.rect(2, 11, 12, 18, 'b');
  im.rect(2, 11, 12, 1, 'K');
  im.rect(2, 11, 1, 18, 'K');
  im.rect(13, 11, 1, 18, 'K');
  im.rect(6, 15, 4, 2, 'B');
  im.rect(6, 19, 4, 2, 'R');
  im.rect(5, 23, 6, 1, 'a');
  im.rect(2, 29, 12, 3, 'K');
});
add('coffee', 16, 22, (im) => {
  im.box(1, 1, 14, 20, 'k');
  im.rect(3, 3, 10, 5, 'K');
  im.rect(4, 4, 8, 3, 'R');
  im.rect(5, 10, 6, 4, 'K');
  im.rect(6, 15, 4, 4, 'w');
  im.rect(7, 16, 2, 2, '#7a4a3a');
  im.rect(2, 20, 12, 1, 'K');
});
add('whiteboard', 32, 22, (im) => {
  im.box(0, 0, 32, 20, 'w');
  im.rect(1, 18, 30, 1, 'a');
  im.rect(4, 4, 14, 1, 'B');
  im.rect(4, 7, 10, 1, 'R');
  im.rect(4, 10, 12, 1, 'B');
  [3, 6, 4, 8].forEach((h, i) => im.rect(21 + i * 3, 15 - h, 2, h, i % 2 ? 'Y' : 'G'));
  im.rect(20, 15, 11, 1, 'a');
});
add('corkboard', 32, 22, (im) => {
  im.box(0, 0, 32, 20, 'd');
  im.rect(2, 2, 28, 16, 'e');
  [[4, 4, 'Y'], [12, 5, 'T'], [20, 4, 'L'], [8, 11, '#f29ab0'], [17, 11, 'G'], [24, 10, 'Y']].forEach(([x, y, c]) => {
    im.rect(x, y, 6, 5, c);
    im.px(x + 2, y, 'R');
  });
});
add('tv', 32, 22, (im) => {
  im.box(0, 0, 32, 18, 'K');
  im.rect(2, 2, 28, 14, '#1f3a6e');
  im.rect(4, 4, 12, 1, 'T');
  im.rect(4, 7, 20, 1, 'L');
  im.rect(4, 10, 16, 1, 'L');
  im.rect(2, 2, 28, 1, 'g');
  im.rect(12, 18, 8, 2, 'k');
});
add('clock', 12, 12, (im) => {
  im.box(0, 0, 12, 12, 'w');
  im.rect(6, 2, 1, 4, 'K');
  im.rect(6, 6, 3, 1, 'K');
});
add('filecab', 16, 26, (im) => {
  im.box(1, 0, 14, 24, 'a');
  [3, 10, 17].forEach((y) => {
    im.rect(3, y, 10, 6, 'b');
    im.rect(3, y, 10, 1, 'w');
    im.rect(6, y + 3, 4, 1, 'g');
  });
  im.rect(1, 24, 14, 2, 'K');
});
add('partition', 16, 24, (im) => {
  im.box(0, 0, 16, 22, 'a');
  im.rect(1, 1, 14, 2, 'b');
  im.rect(1, 20, 14, 1, 'h');
  im.rect(0, 22, 16, 2, 'K');
});
add('door_office', 16, 32, (im) => {
  im.box(0, 0, 16, 32, 'K');
  im.rect(2, 2, 12, 28, 'b');
  im.rect(3, 4, 10, 10, 'L');
  im.rect(3, 4, 10, 1, 'T');
  im.rect(3, 16, 10, 12, 'a');
  im.rect(11, 18, 2, 3, 'Y');
});

// Status bubbles (16x16): thought dots, alert, check, question, sleep, coffee.
function bubble(im, body) {
  im.box(1, 0, 14, 11, 'w');
  im.px(5, 11, 'K');
  im.rect(5, 11, 3, 1, 'w');
  im.rect(4, 11, 1, 1, 'K');
  im.rect(8, 11, 1, 1, 'K');
  im.rect(5, 12, 2, 1, 'K');
  body(im);
}
for (let f = 0; f < 3; f++) add(`bubble_think_${f}`, 16, 14, (im) => bubble(im, () => [0, 1, 2].forEach((i) => im.rect(4 + i * 3, 4 + (i === f ? -1 : 1), 2, 2, 'g'))));
add('bubble_alert', 16, 14, (im) => bubble(im, () => { im.rect(7, 2, 2, 5, 'R'); im.rect(7, 8, 2, 2, 'R'); }));
add('bubble_check', 16, 14, (im) => bubble(im, () => im.ascii(4, 2, ['      #', '     ##', '#   ## ', '## ##  ', ' ###   '], { '#': 'G' })));
add('bubble_question', 16, 14, (im) => bubble(im, () => { im.rect(6, 2, 4, 1, 'B'); im.rect(9, 3, 1, 2, 'B'); im.rect(7, 5, 2, 1, 'B'); im.rect(7, 7, 2, 2, 'B'); }));
for (let f = 0; f < 2; f++) add(`bubble_zzz_${f}`, 16, 14, (im) => bubble(im, () => { im.rect(4, 3 + f, 4, 1, 'B'); im.rect(6, 4 + f, 1, 1, 'B'); im.rect(4, 5 + f, 4, 1, 'B'); im.rect(9, 6 - f, 3, 1, 'h'); im.rect(10, 7 - f, 1, 1, 'h'); im.rect(9, 8 - f, 3, 1, 'h'); }));
for (let f = 0; f < 2; f++) add(`bubble_coffee_${f}`, 16, 14, (im) => bubble(im, () => { im.box(4, 4, 6, 5, 'c'); im.rect(10, 5, 2, 2, 'K'); im.px(6, 2 + f, 'a'); im.px(8, 3 - f, 'a'); }));
add('led_on', 3, 3, (im) => { im.rect(0, 0, 3, 3, 'G'); });

// Original small garden and corridor props; generated alongside the existing pixel atlas.
for (const [name, base, accent] of [['coral', '#bd6476', '#f0b796'], ['sage', '#63968b', '#b4d7ac'], ['lilac', '#8876b3', '#cab8ed']]) {
  add(`rug_${name}`, 80, 32, (im) => {
    im.box(0, 0, 80, 32, base);
    im.rect(4, 4, 72, 24, accent); im.rect(6, 6, 68, 20, base);
    for (let x = 12; x < 72; x += 12) { im.rect(x, 12, 4, 8, accent); im.rect(x - 2, 14, 8, 4, accent); }
  });
}
add('flowerbox', 24, 22, (im) => {
  im.box(1, 13, 22, 9, '#966646'); im.rect(3, 14, 18, 2, '#d4a373');
  for (const x of [5, 12, 19]) {
    im.rect(x, 5, 1, 9, '#4d825d'); im.rect(x - 3, 8, 6, 3, '#74ad68');
    im.rect(x - 2, 2, 5, 5, x === 12 ? '#e7b26d' : '#df82b5'); im.px(x, 4, '#fff0a8');
  }
});
for (let f = 0; f < 3; f++) add(`butterfly_${f}`, 10, 9, (im) => {
  im.rect(4, 2, 1, 6, '#624367');
  im.rect(f === 1 ? 3 : 0, 2, f === 1 ? 1 : 4, 3, '#ec9dba');
  im.rect(5, 2, f === 1 ? 1 : 4, 3, '#d1b1ed');
  im.rect(f === 1 ? 3 : 1, 5, f === 1 ? 1 : 3, 2, '#cf7caa');
  im.rect(5, 5, f === 1 ? 1 : 3, 2, '#ac86cd');
});
add('cat_sleep', 24, 14, (im) => {
  im.rect(3, 11, 18, 2, '#46465e'); im.box(7, 5, 15, 7, '#dca374');
  im.box(2, 3, 10, 9, '#edbd8b'); im.rect(2, 0, 3, 5, '#dca374'); im.rect(9, 0, 3, 5, '#dca374');
  im.rect(4, 7, 2, 1, '#6b5052'); im.rect(9, 7, 2, 1, '#6b5052'); im.px(7, 9, '#c47183');
  im.rect(17, 6, 3, 2, '#ae794f'); im.rect(19, 8, 4, 3, '#edbd8b');
});

// Original wall art: mood discs, research notes, job cards and letter drafts.
for (const [name, bg, accent] of [['music_poster', '#37274f', '#bf95df'], ['research_board', '#354e58', '#9bdfcf'], ['opportunity_board', '#596455', '#d5ca93'], ['letter_board', '#67516c', '#e4bfd8']]) {
  add(name, 32, 24, im => {
    im.box(0, 0, 32, 24, bg); im.rect(2, 2, 28, 1, accent);
    if (name === 'music_poster') {
      for (let y = 5; y < 20; y++) for (let x = 7; x < 23; x++) { const d = Math.hypot(x - 15, y - 12); if (d < 8) im.px(x, y, d < 2 ? accent : '#211d35'); }
      im.rect(25, 6, 1, 12, accent); im.rect(26, 6, 3, 2, accent);
    } else for (let n = 0; n < 3; n++) { im.rect(4 + n * 9, 6, 6, 12, '#eee5d5'); im.rect(5 + n * 9, 8, 4, 2, accent); im.rect(5 + n * 9, 13, 4, 1, bg); }
  });
}
add('vinyl_rack', 24, 30, im => {
  im.box(0, 0, 24, 30, '#47364f');
  for (let y = 3; y < 28; y += 9) { im.rect(2, y + 6, 20, 2, '#a985b1'); for (let x = 3; x < 20; x += 4) im.rect(x, y, 3, 6, x % 3 ? '#76649d' : '#d3a3c9'); }
});

// ---------- pack into an atlas ----------

function packAtlas() {
  const entries = [...sprites.entries()].sort((a, b) => b[1].h - a[1].h || a[0].localeCompare(b[0]));
  const W = 256;
  let x = 1;
  let y = 1;
  let rowH = 0;
  const placed = [];
  for (const [name, im] of entries) {
    if (x + im.w + 1 > W) {
      x = 1;
      y += rowH + 1;
      rowH = 0;
    }
    placed.push({ name, im, x, y });
    x += im.w + 1;
    rowH = Math.max(rowH, im.h);
  }
  const H = y + rowH + 1;
  const png = new PNG({ width: W, height: H });
  const frames = {};
  for (const { name, im, x: px, y: py } of placed) {
    for (let j = 0; j < im.h; j++) for (let i = 0; i < im.w; i++) {
      const si = (j * im.w + i) * 4;
      const di = ((py + j) * W + px + i) * 4;
      png.data[di] = im.d[si];
      png.data[di + 1] = im.d[si + 1];
      png.data[di + 2] = im.d[si + 2];
      png.data[di + 3] = im.d[si + 3];
    }
    frames[name] = { frame: { x: px, y: py, w: im.w, h: im.h }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: im.w, h: im.h }, sourceSize: { w: im.w, h: im.h } };
  }
  writeFileSync(join(OUT, 'props.png'), PNG.sync.write(png));
  writeFileSync(join(OUT, 'props.json'), JSON.stringify({ frames, meta: { image: 'props.png', format: 'RGBA8888', size: { w: W, h: H }, scale: '1' } }));
  return { count: entries.length, W, H };
}

// ---------- recolored characters ----------

const BASES = ['Adam', 'Alex', 'Amelia', 'Bob'];
const HUE_SHIFTS = [0, 0.22, 0.5, 0.72];
export const VARIANTS = BASES.flatMap((b) => HUE_SHIFTS.map((s, i) => ({ id: `${b.toLowerCase()}${i}`, base: b, shift: s })));
const ROWS = [['run', 'run', 24], ['idle', 'idle_anim', 24], ['sit', 'sit3', 12], ['phone', 'phone', 9]]; // sheet rows in the combined variant sheet
const FRAME_W = 16;
const FRAME_H = 32;
const COLS = 24;

function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
function hsl2rgb(h, s, l) {
  const f = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255];
}

// Clothes are the saturated pixels that are not skin or hair (orange/brown hues); only those are rotated.
function recolor(png, shift) {
  if (!shift) return png;
  const out = new PNG({ width: png.width, height: png.height });
  for (let i = 0; i < png.data.length; i += 4) {
    const [r, g, b, a] = [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
    let [nr, ng, nb] = [r, g, b];
    if (a > 0) {
      const [h, s, l] = rgb2hsl(r, g, b);
      const skinOrHair = h > 0.02 && h < 0.14;
      if (s > 0.22 && !skinOrHair && l > 0.1 && l < 0.92) [nr, ng, nb] = hsl2rgb((h + shift) % 1, s, l);
    }
    out.data[i] = Math.round(nr);
    out.data[i + 1] = Math.round(ng);
    out.data[i + 2] = Math.round(nb);
    out.data[i + 3] = a;
  }
  return out;
}

function buildCharacters() {
  const dir = join(PUB, 'limezu', 'characters');
  let made = 0;
  for (const v of VARIANTS) {
    const sheet = new PNG({ width: COLS * FRAME_W, height: ROWS.length * FRAME_H });
    ROWS.forEach(([, file, frames], row) => {
      const path = join(dir, `${v.base}_${file}_16x16.png`);
      if (!existsSync(path)) return;
      const src = recolor(PNG.sync.read(readFileSync(path)), v.shift);
      const w = Math.min(frames * FRAME_W, src.width);
      PNG.bitblt(src, sheet, 0, 0, w, FRAME_H, 0, row * FRAME_H);
    });
    writeFileSync(join(OUT, 'characters', `${v.id}.png`), PNG.sync.write(sheet));
    made++;
  }
  writeFileSync(join(OUT, 'characters', 'variants.json'), JSON.stringify({ frameWidth: FRAME_W, frameHeight: FRAME_H, cols: COLS, rows: ROWS.map(([n, , f]) => ({ name: n, frames: f })), variants: VARIANTS.map((v) => v.id) }, null, 1));
  return made;
}

// ---------- LimeZu furniture: cropped from the free sheet, trimmed, packed into the same atlas ----------

const LZ_SHEET = join(PUB, 'limezu', 'Interiors_free_16x16.png');
// [name, x, y, w, h] in sheet pixels (generous rects; transparent borders are trimmed away).
const LZ = [
  ['plant_a', 165, 711, 22, 36], ['plant_b', 191, 720, 18, 28], ['palm', 211, 702, 27, 36], ['plant_small', 0, 788, 16, 18],
  ['window_red', 113, 389, 29, 24], ['window_white', 145, 389, 29, 24], ['door_double', 174, 385, 36, 32], ['door_wood', 110, 137, 22, 26],
  ['rug_big', 112, 241, 66, 50], ['rug_small_green', 180, 553, 48, 34], ['rug_small_red', 180, 635, 48, 34],
  ['sofa_gray', 14, 1154, 52, 38], ['sofa_beige', 110, 1154, 52, 38], ['sofa_blue_corner', 12, 1190, 52, 38],
  ['shelf_books_a', 78, 222, 36, 36], ['shelf_books_b', 78, 254, 36, 36], ['shelf_store_a', 316, 1090, 1, 1],
  ['cabinet_white_a', 30, 294, 68, 36], ['cabinet_white_b', 100, 294, 26, 36], ['cabinet_white_c', 126, 286, 52, 30],
  ['table_wood', 12, 160, 42, 40], ['table_light', 92, 160, 42, 40], ['bench_wood', 118, 214, 44, 26],
  ['lamp_red', 80, 1, 1, 1],
];

function cropTrim(png, x, y, w, h) {
  let minx = w, miny = h, maxx = -1, maxy = -1;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const sx = x + i;
    const sy = y + j;
    if (sx < 0 || sy < 0 || sx >= png.width || sy >= png.height) continue;
    if (png.data[(sy * png.width + sx) * 4 + 3] > 20) {
      minx = Math.min(minx, i); miny = Math.min(miny, j); maxx = Math.max(maxx, i); maxy = Math.max(maxy, j);
    }
  }
  if (maxx < 0) return null;
  const im = new Img(maxx - minx + 1, maxy - miny + 1);
  for (let j = miny; j <= maxy; j++) for (let i = minx; i <= maxx; i++) {
    const si = ((y + j) * png.width + x + i) * 4;
    if (png.data[si + 3] > 0) im.px(i - minx, j - miny, [png.data[si], png.data[si + 1], png.data[si + 2], png.data[si + 3]]);
  }
  return im;
}

function addLimezu() {
  if (!existsSync(LZ_SHEET)) return 0;
  const png = PNG.sync.read(readFileSync(LZ_SHEET));
  let n = 0;
  for (const [name, x, y, w, h] of LZ) {
    if (w < 4) continue;
    const im = cropTrim(png, x, y, w, h);
    if (im) {
      sprites.set(`lz_${name}`, im);
      n++;
    }
  }
  return n;
}

// ---------- auto-tiled walls (white thick walls with a dark outline on the exposed sides) ----------
// Tile index = N*1 + E*2 + S*4 + W*8, where each bit says "a wall neighbor is there".
function buildWalls() {
  const W16 = 16;
  const png = new PNG({ width: 4 * W16, height: 4 * W16 });
  for (let m = 0; m < 16; m++) {
    const im = new Img(W16, W16);
    const n = m & 1, e = m & 2, so = m & 4, w = m & 8;
    im.rect(0, 0, 16, 16, 'w');
    // outline on every side without a neighbor, 2px; soft shade on the lower and right edge
    if (!n) im.rect(0, 0, 16, 2, 'K');
    if (!so) im.rect(0, 14, 16, 2, 'K');
    if (!w) im.rect(0, 0, 2, 16, 'K');
    if (!e) im.rect(14, 0, 2, 16, 'K');
    if (!so) im.rect(0, 12, 16, 2, 's');
    if (!e) im.rect(12, 0, 2, 16, 's');
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
      const di = ((Math.floor(m / 4) * 16 + j) * png.width + (m % 4) * 16 + i) * 4;
      const si = (j * 16 + i) * 4;
      png.data[di] = im.d[si]; png.data[di + 1] = im.d[si + 1]; png.data[di + 2] = im.d[si + 2]; png.data[di + 3] = im.d[si + 3];
    }
  }
  writeFileSync(join(OUT, 'walls.png'), PNG.sync.write(png));
  // one translucent tile that marks collision cells in Tiled (the layer itself is hidden in the game)
  const col = new PNG({ width: 16, height: 16 });
  for (let i = 0; i < col.data.length; i += 4) { col.data[i] = 224; col.data[i + 1] = 88; col.data[i + 2] = 79; col.data[i + 3] = 110; }
  writeFileSync(join(OUT, 'collision.png'), PNG.sync.write(col));
}

// Original interior tiles: purple acoustic panels and teal research walls.
function buildOfficeThemes() {
  const sheet = new Img(96, 16);
  const themes = [['#51425f', '#594166', '#9875ad'], ['#516768', '#45666d', '#a3c4c0']];
  themes.forEach(([floor, wall, accent], i) => {
    const ox = i * 48;
    sheet.rect(ox, 0, 16, 16, floor);
    for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x += 4) sheet.px(ox + x, y, i ? '#5b7270' : '#5e4d6b');
    sheet.rect(ox + 16, 0, 32, 16, wall);
    sheet.rect(ox + 16, 0, 16, 2, accent);
    sheet.rect(ox + 32, 13, 16, 2, accent);
    sheet.rect(ox + 32, 15, 16, 1, '#3a3a50');
    for (let x = 18; x < 32; x += 4) sheet.rect(ox + x, 4, 1, 12, i ? '#5e7c82' : '#745280');
  });
  const png = new PNG({ width: sheet.w, height: sheet.h }); png.data = Buffer.from(sheet.d);
  writeFileSync(join(OUT, 'office-themes.png'), PNG.sync.write(png));
}
buildOfficeThemes();

// Floor materials of the three floors (3 x 2 tile seamless patterns, stacked): slate tiles, walnut parquet, warm wood.
function buildThemeFloors() {
  const sheet = new Img(48, 96);
  const rng = (n) => { let h = n * 2654435761 >>> 0; h ^= h >>> 15; return ((h * 2246822519) >>> 0) / 4294967296; };
  const patterns = [
    // slate: square tiles with grout, a few blue flecks
    (im, ox, oy) => {
      for (let y = 0; y < 32; y++) for (let x = 0; x < 48; x++) {
        const tx = x % 16, ty = y % 16;
        let c = '#6a7388';
        if (tx === 0 || ty === 0) c = '#535c70';
        else if (tx === 1 || ty === 1) c = '#79839a';
        if (rng(x * 53 + y * 17) > 0.93 && c === '#6a7388') c = '#727c92';
        im.px(ox + x, oy + y, c);
      }
      [[5, 6], [30, 20], [38, 9]].forEach(([x, y]) => { im.px(ox + x, oy + y, '#6fb3ff'); im.px(ox + x + 1, oy + y, '#6fb3ff'); });
    },
    // parquet: dark violet-brown planks with staggered joints
    (im, ox, oy) => {
      const cols = ['#5a3a5e', '#4e3052', '#664268'];
      for (let y = 0; y < 32; y++) for (let x = 0; x < 48; x++) {
        const row = Math.floor(y / 4), off = (row % 2) * 8, px = (x + off) % 16;
        let c = cols[Math.floor(rng(row * 7 + Math.floor((x + off) / 16) * 3) * 3)];
        if (y % 4 === 0) c = '#3e2642';
        else if (px === 0) c = '#3e2642';
        else if (y % 4 === 1) c = '#7a5280';
        im.px(ox + x, oy + y, c);
      }
    },
    // warm wood: light planks, sage/terracotta accents
    (im, ox, oy) => {
      const cols = ['#e8cfa0', '#e0c490', '#eed7ac'];
      for (let y = 0; y < 32; y++) for (let x = 0; x < 48; x++) {
        const row = Math.floor(y / 8), off = (row % 2) * 12, px = (x + off) % 24;
        let c = cols[Math.floor(rng(row * 11 + Math.floor((x + off) / 24) * 5) * 3)];
        if (y % 8 === 0) c = '#c9a66c';
        else if (px === 0) c = '#c9a66c';
        im.px(ox + x, oy + y, c);
      }
      [[10, 12], [34, 26]].forEach(([x, y]) => { im.px(ox + x, oy + y, '#d8805a'); im.px(ox + x + 1, oy + y, '#8aa07a'); });
    },
  ];
  patterns.forEach((draw, i) => draw(sheet, 0, i * 32));
  const png = new PNG({ width: sheet.w, height: sheet.h }); png.data = Buffer.from(sheet.d);
  writeFileSync(join(OUT, 'theme-floors.png'), PNG.sync.write(png));
}
buildThemeFloors();

const lzCount = addLimezu();
buildWalls();
const atlas = packAtlas();
const chars = buildCharacters();
console.log(`assets: ${atlas.count} sprites (${lzCount} from LimeZu) in ${atlas.W}x${atlas.H} atlas, ${chars} character variants, wall autotiles`);
