// Static background pieces of the office (drawn once into a buffer). Pixel-art routines of the reference studio office.
(function () {
  'use strict';
  const K = window.PixelKit;
  const { WALL_H } = window.OfficeLayout;
  const BG = {
    wall(P, r, w) {
      const rail = WALL_H - 9; // a slim wainscot: rail and skirting only
      P(0, 0, w, WALL_H, '#3b2e4e');
      for (let y = 0; y < rail; y += 2) for (let x = (y / 2) % 2; x < w; x += 2) if (r() < 0.06) P(x, y, 1, 1, '#41335a');
      for (let x = 0; x < w; x += 32) { P(x, 3, 1, rail - 3, '#33273f'); P(x + 1, 3, 1, rail - 3, '#46385f'); }
      P(0, 0, w, 3, '#271d33'); P(0, 3, w, 1, '#4d3e66');
      P(0, rail, w, 2, '#7a5241'); P(0, rail + 2, w, 1, '#3f2820');
      P(0, rail + 3, w, 6, '#5a3a2f');
      P(0, WALL_H - 3, w, 3, '#2b1c19'); P(0, WALL_H - 3, w, 1, '#4b342c');
    },
    floor(P, g, r, w, h) {
      const tones = ['#8a5a3c', '#86573a', '#8e5d3e', '#83563a'];
      for (let row = 0, y = WALL_H; y < h; row++, y += 8) {
        let x = -((row * 23) % 46);
        while (x < w) {
          const len = 38 + Math.floor(r() * 30);
          const t = tones[Math.floor(r() * tones.length)];
          P(x, y, len, 8, t);
          P(x, y, len, 1, K.tone(t, 0.18));
          P(x, y + 7, len, 1, '#6b4330');
          P(x + len - 1, y, 1, 8, '#6b4330');
          for (let i = 0; i < 3; i++) P(x + 3 + Math.floor(r() * (len - 10)), y + 2 + Math.floor(r() * 4), 3 + Math.floor(r() * 5), 1, K.tone(t, -0.15));
          if (r() < 0.25) P(x + 4 + Math.floor(r() * (len - 8)), y + 3, 1, 1, '#5e3a27');
          x += len;
        }
      }
      for (let i = 0; i < 5; i++) { g.fillStyle = `rgba(20,10,25,${0.34 - i * 0.065})`; g.fillRect(0, WALL_H + i, w, 1); }
    },
    rug(P, x, y, w, h, base, border, motif) {
      P(x, y, w, h, border);
      P(x + 3, y + 3, w - 6, h - 6, base);
      P(x + 3, y + 3, w - 6, 1, K.tone(base, -0.25));
      for (let yy = y + 7; yy < y + h - 6; yy += 8) for (let xx = x + 8 + ((yy / 8) % 2) * 4; xx < x + w - 8; xx += 8) { P(xx, yy, 2, 2, motif); P(xx + 1, yy - 1, 1, 1, motif); P(xx + 1, yy + 2, 1, 1, motif); }
      for (let xx = x + 1; xx < x + w; xx += 3) { P(xx, y - 2, 1, 2, '#e8d9b8'); P(xx, y + h, 1, 2, '#e8d9b8'); }
    },
    windowFrames(P, windows) {
      for (const w of windows) {
        P(w.x - 3, w.y - 3, w.w + 6, w.h + 6, '#2a2036');
        P(w.x - 2, w.y - 2, w.w + 4, w.h + 4, '#e6dccb');
        P(w.x - 2, w.y - 2, w.w + 4, 1, '#fff6e6');
        P(w.x - 6, w.y + w.h + 2, w.w + 12, 3, '#d6c8b0'); P(w.x - 6, w.y + w.h + 2, w.w + 12, 1, '#fff2dc'); P(w.x - 6, w.y + w.h + 5, w.w + 12, 1, '#7a6a5a');
      }
    },
    // LED news panel: dark glass in a black frame with a faint pixel grid; text is drawn live on top.
    led(P, g, bd) {
      P(bd.x - 4, bd.y - 3, bd.w + 8, bd.h + 7, '#0d0a12');
      P(bd.x - 3, bd.y - 2, bd.w + 6, bd.h + 5, '#2a2336'); P(bd.x - 3, bd.y - 2, bd.w + 6, 1, '#4a4460');
      P(bd.x, bd.y, bd.w, bd.h, '#0a1418');
      for (let y = bd.y; y < bd.y + bd.h; y += 2) P(bd.x, y, bd.w, 1, '#0d1a20');
      P(bd.x + 2, bd.y + 2, bd.w - 4, 1, '#143038');
      P(bd.x + bd.w - 6, bd.y + bd.h + 3, 3, 1, '#3ccf8e');
      P(bd.x + bd.w / 2 - 12, bd.y + bd.h + 3, 24, 2, '#1b1822');
    },
    clock(P, cx, cy) {
      for (let y = -9; y <= 9; y++) for (let x = -9; x <= 9; x++) {
        const d = Math.sqrt(x * x + y * y);
        if (d <= 9.4) P(cx + x, cy + y, 1, 1, d > 8 ? '#2a2036' : d > 7 ? '#c9a24a' : '#f4efe4');
      }
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; P(Math.round(cx + Math.sin(a) * 6), Math.round(cy - Math.cos(a) * 6), 1, 1, '#8a7e70'); }
    },
    bookshelf(P, r, x0, y0, w = 52, h = 54) {
      P(x0, y0, w, h, '#2a1a14');
      P(x0 + 1, y0 + 1, w - 2, h - 2, '#6a4430'); P(x0 + 1, y0 + 1, w - 2, 1, '#8a5c40');
      const bookC = ['#d8485f', '#4f8fe0', '#ffcf4a', '#3ccf8e', '#a77cff', '#ff8a4c', '#e8e0d0', '#2fa0a8'];
      for (const sy of [y0 + 2, y0 + 19, y0 + 36]) {
        P(x0 + 3, sy, w - 6, 15, '#3e2619');
        P(x0 + 2, sy + 15, w - 4, 2, '#8a5c40');
        let bx = x0 + 4;
        while (bx < x0 + w - 6) {
          const bw = 2 + Math.floor(r() * 3);
          const bh = 9 + Math.floor(r() * 5);
          const col = bookC[Math.floor(r() * bookC.length)];
          if (r() < 0.12 && bx < x0 + w - 12) { P(bx, sy + 15 - 4, 7, 3, col); P(bx, sy + 15 - 4, 7, 1, K.tone(col, 0.3)); bx += 8; continue; }
          P(bx, sy + 15 - bh, bw, bh, col); P(bx, sy + 15 - bh, 1, bh, K.tone(col, 0.3)); P(bx + bw - 1, sy + 15 - bh, 1, bh, K.tone(col, -0.3));
          P(bx, sy + 15 - bh + 2, bw, 1, K.tone(col, -0.4));
          bx += bw + (r() < 0.2 ? 1 : 0);
        }
      }
    },
    // cork board with a dark wood frame; notes and pins are drawn live on top
    board(P, r, bd) {
      P(bd.x - 3, bd.y - 3, bd.w + 6, bd.h + 6, '#2a1c16');
      P(bd.x - 2, bd.y - 2, bd.w + 4, bd.h + 4, '#8a5a3a'); P(bd.x - 2, bd.y - 2, bd.w + 4, 1, '#b07a52'); P(bd.x - 2, bd.y + bd.h + 1, bd.w + 4, 1, '#6b4430');
      P(bd.x, bd.y, bd.w, bd.h, '#b8844f');
      for (let i = 0; i < bd.w * bd.h / 7; i++) P(bd.x + Math.floor(r() * bd.w), bd.y + Math.floor(r() * bd.h), 1, 1, r() < 0.5 ? '#a8743f' : '#c99a62');
      for (let i = 0; i < bd.w * bd.h / 90; i++) P(bd.x + Math.floor(r() * bd.w), bd.y + Math.floor(r() * bd.h), 2, 1, '#96663a');
      P(bd.x, bd.y, bd.w, 1, '#c99a62'); P(bd.x, bd.y + bd.h - 1, bd.w, 1, '#946134');
    },
    cork(P, r, x, y, w = 28, h = 35) {
      P(x, y, w, h, '#2a1c16'); P(x + 1, y + 1, w - 2, h - 2, '#8a5a3a'); P(x + 1, y + 1, w - 2, 1, '#b07a52');
      P(x + 3, y + 3, w - 6, h - 6, '#b8844f');
      for (let i = 0; i < 70; i++) P(x + 3 + Math.floor(r() * (w - 6)), y + 3 + Math.floor(r() * (h - 6)), 1, 1, r() < 0.5 ? '#a8743f' : '#c99a62');
    },
    door(P, x = 434) {
      P(x, 6, 38, 58, '#271d33');
      P(x + 2, 8, 34, 56, '#9a6a48'); P(x + 2, 8, 34, 1, '#c08b62');
      P(x + 5, 11, 28, 53, '#8a5a3a');
      P(x + 7, 13, 24, 18, '#a8d4e8'); P(x + 7, 13, 24, 1, '#d8eef7'); for (let i = 0; i < 10; i++) P(x + 10 + i, 28 - i, 1, 1, '#e8f6fb');
      P(x + 7, 34, 24, 26, '#7e5134'); P(x + 7, 34, 24, 1, '#9a6a48'); P(x + 9, 36, 20, 22, '#76492f');
      P(x + 27, 38, 3, 3, '#ffd34f'); P(x + 27, 38, 1, 1, '#fff2a8');
      P(x + 6, 0, 26, 6, '#1a3a2a'); P(x + 7, 1, 24, 4, '#2fcf7e');
    },
    // the kitchen L (floor-standing furniture drawn once; the parquet stays underneath)
    kitchenL(P, k) {
      const { VCOUNTER: v, UCAB: u, LRUN: r } = k;
      // wall cabinet above the top end of the vertical counter
      P(u.x, u.y, u.w, u.h, '#2a1c16'); P(u.x + 1, u.y + 1, u.w - 2, u.h - 2, '#7a5a44'); P(u.x + 1, u.y + 1, u.w - 2, 1, '#9a7a62');
      P(u.x + 21, u.y + 1, 1, u.h - 2, '#3f2820'); P(u.x + 18, u.y + 14, 2, 8, '#e8c27a'); P(u.x + 24, u.y + 14, 2, 8, '#e8c27a');
      P(u.x + 1, u.y + u.h - 3, u.w - 2, 2, '#5a4034');
      // vertical counter: worktop seen from above, its cabinet doors on the side that faces the room
      P(v.x, v.y, v.w + 6, v.h, '#2a1c16');
      P(v.x + 1, v.y + 1, v.w - 2, v.h - 2, '#c9a27a'); P(v.x + 1, v.y + 1, 1, v.h - 2, '#ead0ae'); P(v.x + v.w - 2, v.y + 1, 1, v.h - 2, '#8a6a52');
      for (let y = v.y + 24; y < v.y + v.h - 4; y += 24) P(v.x + 1, y, v.w - 2, 1, '#b88a62');
      P(v.x + v.w, v.y + 1, 5, v.h - 2, '#5a4034');
      for (let y = v.y + 4; y < v.y + v.h - 14; y += 24) { P(v.x + v.w + 1, y, 3, 20, '#6e5040'); P(v.x + v.w + 2, y + 9, 1, 3, '#e8c27a'); }
      // sink with a tap
      P(v.x + 5, v.y + 64, 20, 28, '#586069'); P(v.x + 6, v.y + 65, 18, 26, '#8c96a0'); P(v.x + 7, v.y + 66, 16, 24, '#6d7782'); P(v.x + 13, v.y + 60, 4, 6, '#cfd6dd'); P(v.x + 13, v.y + 58, 8, 2, '#cfd6dd');
      // cups and a kettle on the worktop
      P(v.x + 6, v.y + 104, 6, 6, '#e2445c'); P(v.x + 6, v.y + 104, 6, 1, '#ff7a8e'); P(v.x + 15, v.y + 106, 5, 5, '#4fa8ff'); P(v.x + 15, v.y + 106, 5, 1, '#8ac6ff');
      P(v.x + 8, v.y + 116, 10, 9, '#e8e0d0'); P(v.x + 8, v.y + 116, 10, 2, '#fff6e6'); P(v.x + 10, v.y + 114, 6, 2, '#c9c2d6');
      // lower run along the bottom edge: worktop seen from above
      P(r.x, r.y, r.w, r.h, '#2a1c16'); P(r.x + 1, r.y + 1, r.w - 2, r.h - 2, '#c9a27a'); P(r.x + 1, r.y + 1, r.w - 2, 1, '#ead0ae'); P(r.x + 1, r.y + r.h - 3, r.w - 2, 2, '#8a6a52');
      for (let x = r.x + 26; x < r.x + r.w - 4; x += 26) P(x, r.y + 1, 1, r.h - 2, '#b88a62');
    },
    // the coffee machine alone (the old counter is gone); origin at (12, 216) like the effects expect
    coffee(P) {
      P(12, 216, 24, 24, '#1f1c27'); P(13, 217, 22, 22, '#3a3548'); P(13, 217, 22, 2, '#5c5672'); P(14, 222, 20, 4, '#c9c2d6'); P(14, 222, 20, 1, '#f0ecf6');
      P(20, 228, 8, 3, '#1f1c27'); P(22, 231, 4, 2, '#2a2533');
      P(21, 234, 6, 5, '#f3eee6'); P(21, 234, 6, 1, '#6b4430'); P(26, 234, 1, 5, '#cdc3b6');
    },
    cooler(P) {
      P(92, 204, 16, 58, '#1d1a26');
      P(93, 205, 14, 20, '#9fd6f2'); P(93, 205, 3, 20, '#d4f0ff'); P(95, 203, 10, 3, '#6aaed6');
      P(93, 225, 14, 36, '#e8e4ee'); P(93, 225, 14, 1, '#ffffff'); P(104, 225, 3, 36, '#c3bccf');
      P(96, 232, 3, 3, '#4fa8ff'); P(101, 232, 3, 3, '#e2445c'); P(95, 240, 10, 2, '#a59cb6');
    },
  };
  window.OfficeBg = BG;
})();
