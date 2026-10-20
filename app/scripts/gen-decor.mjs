// Floor decoration sprites: each floor has its own palette and signature props (generated pixel art, ours).
// Imported by gen-assets.mjs; `add` registers a sprite and `Img` is the tiny raster class.
export function registerDecor(add) {
  const ink = '#2c2c40';
  // tiny 3x5 font for neon / signs
  const FONT = { S: ['111', '100', '111', '001', '111'], H: ['101', '101', '111', '101', '101'], I: ['111', '010', '010', '010', '111'], P: ['111', '101', '111', '100', '100'] };
  const word = (im, x, y, text, col) => [...text].forEach((ch, n) => FONT[ch]?.forEach((row, j) => [...row].forEach((v, i) => v === '1' && im.px(x + n * 4 + i, y + j, col))));

  // ===== RESEARCH: violet, brass, parchment, dark wood =====
  add('poster_atom', 16, 20, (im) => {
    im.box(0, 0, 16, 20, '#f2e6c8', '#6b3f7c');
    im.rect(7, 9, 2, 2, '#c07cff');
    for (let a = 0; a < 16; a++) { const t = (a / 16) * Math.PI * 2; im.px(8 + Math.cos(t) * 5, 10 + Math.sin(t) * 2.2, '#6b3f7c'); im.px(8 + Math.cos(t + 1) * 2.2, 10 + Math.sin(t + 1) * 5, '#8a5ab0'); }
    im.rect(3, 3, 10, 1, '#b48a3c');
  });
  add('poster_stars', 16, 20, (im) => {
    im.box(0, 0, 16, 20, '#262a5c', '#b48a3c');
    [[3, 4], [10, 3], [6, 8], [12, 9], [4, 13], [9, 15], [13, 14]].forEach(([x, y]) => im.px(x, y, '#fff2a8'));
    [[3, 4, 6, 8], [6, 8, 12, 9], [6, 8, 4, 13]].forEach(([x0, y0, x1, y1]) => { for (let t = 0; t <= 6; t++) im.px(x0 + ((x1 - x0) * t) / 6, y0 + ((y1 - y0) * t) / 6, '#6c70b8'); });
  });
  add('blackboard', 32, 20, (im) => {
    im.box(0, 0, 32, 20, '#254a3c', '#6b4a2e');
    im.rect(2, 2, 28, 15, '#2d5a48');
    [[4, 5, 10], [4, 9, 14], [18, 6, 8], [18, 11, 9]].forEach(([x, y, l]) => im.rect(x, y, l, 1, '#e8f0e0'));
    im.px(24, 14, '#e8f0e0'); im.px(25, 13, '#e8f0e0'); im.px(26, 14, '#e8f0e0');
    im.rect(4, 17, 6, 1, '#cfd2e0');
  });
  add('diploma', 12, 14, (im) => {
    im.box(0, 0, 12, 14, '#f4e8c4', '#6b4a2e');
    im.rect(2, 3, 8, 1, '#8a6a3c'); im.rect(2, 5, 8, 1, '#8a6a3c'); im.rect(2, 7, 5, 1, '#8a6a3c');
    im.rect(7, 9, 3, 3, '#e0584f'); im.px(8, 10, '#f0d060');
  });
  add('paper_wall', 32, 22, (im) => {
    im.box(0, 0, 32, 22, '#5a4030', '#3a2a22');
    [[3, 3, '#f8f8f8'], [11, 4, '#f4e8c4'], [19, 3, '#f8f8f8'], [5, 11, '#f4e8c4'], [14, 11, '#f8f8f8'], [22, 10, '#f4e8c4']].forEach(([x, y, c]) => {
      im.rect(x, y, 8, 7, c); im.rect(x + 1, y + 2, 5, 1, '#8f85a9'); im.rect(x + 1, y + 4, 4, 1, '#8f85a9'); im.px(x + 3, y - 1, '#e0584f');
    });
  });
  add('globe', 14, 22, (im) => {
    im.rect(6, 16, 2, 5, '#6b4a2e'); im.rect(3, 20, 8, 2, '#4a3220');
    for (let y = 0; y < 14; y++) for (let x = 0; x < 14; x++) { const dx = x - 6.5, dy = y - 6.5; if (dx * dx + dy * dy <= 31) im.px(x, y + 1, (x + y) % 5 === 0 ? '#6fd49a' : '#4985cc'); }
    im.rect(5, 6, 4, 3, '#6fd49a'); im.rect(8, 10, 3, 2, '#6fd49a');
    im.rect(1, 1, 1, 14, '#b48a3c');
  });
  add('telescope', 22, 28, (im) => {
    for (let i = 0; i < 16; i++) { im.rect(4 + i, 2 + Math.round(i * 0.35), 2, 3, i % 7 < 2 ? '#b48a3c' : '#cfd2e0'); }
    im.rect(18, 7, 3, 4, '#3a3a50');
    im.rect(10, 12, 2, 12, '#6b4a2e'); im.rect(7, 24, 2, 4, '#6b4a2e'); im.rect(13, 24, 2, 4, '#6b4a2e'); im.rect(10, 23, 2, 5, '#6b4a2e');
  });
  add('microscope_table', 30, 24, (im) => {
    im.rect(1, 10, 28, 3, '#8a5a3c'); im.rect(2, 13, 2, 10, '#5a3a28'); im.rect(26, 13, 2, 10, '#5a3a28'); im.rect(1, 10, 28, 1, '#c8905a');
    im.rect(8, 6, 3, 4, '#3a3a50'); im.rect(11, 2, 3, 8, '#cfd2e0'); im.rect(9, 1, 4, 2, '#3a3a50'); im.rect(7, 9, 8, 1, '#3a3a50');
    im.rect(19, 5, 4, 5, '#8cc0f0'); im.rect(20, 3, 2, 2, '#f8f8f8'); im.rect(24, 8, 3, 2, '#e0584f');
  });
  add('armchair_violet', 20, 20, (im) => {
    im.box(1, 2, 18, 8, '#7a4a9c', '#3a2250'); im.box(0, 8, 20, 9, '#8f5ab8', '#3a2250'); im.rect(3, 10, 14, 4, '#a574d0'); im.rect(2, 17, 3, 3, '#3a2250'); im.rect(15, 17, 3, 3, '#3a2250');
  });
  add('floor_lamp', 10, 30, (im) => {
    im.rect(4, 8, 2, 20, '#8a6a3c'); im.rect(2, 28, 6, 2, '#5a4030'); im.rect(1, 1, 8, 8, '#f6dd8a'); im.rect(2, 2, 6, 6, '#fff2b8'); im.rect(1, 1, 8, 1, '#b48a3c');
  });
  add('fern', 16, 22, (im) => {
    im.rect(5, 15, 6, 7, '#a56a4a'); im.rect(5, 15, 6, 1, '#c88a62');
    for (let i = 0; i < 7; i++) { const x = 8 + (i - 3) * 2; im.rect(x, 6 + Math.abs(i - 3) * 2, 1, 9 - Math.abs(i - 3) * 2, '#4a9a5a'); im.px(x - 1, 8 + Math.abs(i - 3) * 2, '#6fd49a'); im.px(x + 1, 9 + Math.abs(i - 3) * 2, '#6fd49a'); }
  });
  add('runner_violet', 64, 14, (im) => {
    im.rect(0, 0, 64, 14, '#5a2e78'); im.rect(1, 1, 62, 12, '#6e3c92'); im.rect(3, 3, 58, 8, '#7e4aa4');
    for (let x = 5; x < 60; x += 8) { im.rect(x, 5, 4, 4, '#b48a3c'); im.px(x + 1, 6, '#f0d060'); }
  });

  // ===== PRODUCTS: slate, electric blue, signal orange =====
  add('kanban', 32, 22, (im) => {
    im.box(0, 0, 32, 22, '#f4f6fa', '#3a4a6a');
    [[3, '#6fb3ff'], [12, '#f0a060'], [21, '#6fd49a']].forEach(([x, c]) => { im.rect(x, 2, 8, 2, c); [0, 1, 2].forEach((n) => n < 3 - (x > 12 ? 1 : 0) && im.rect(x + 1, 6 + n * 5, 6, 4, ['#ffe08a', '#ffb0b0', '#b0e0ff'][(n + x) % 3])); });
  });
  add('roadmap', 32, 16, (im) => {
    im.box(0, 0, 32, 16, '#1f2a44', '#6fb3ff'); im.rect(3, 8, 26, 1, '#6fb3ff');
    [5, 12, 19, 26].forEach((x, i) => { im.rect(x - 1, 6, 3, 5, i === 3 ? '#f0a060' : '#8cc0f0'); im.rect(x - 2, 2 + (i % 2) * 8, 5, 3, '#f8f8f8'); });
  });
  add('neon_ship', 20, 10, (im) => { im.box(0, 0, 20, 10, '#1a1a2e', '#f0a060'); word(im, 2, 2, 'SHIP', '#ffb070'); });
  add('poster_blueprint', 16, 20, (im) => {
    im.box(0, 0, 16, 20, '#2c5fa8', '#16305a');
    im.rect(3, 4, 10, 1, '#9ccaff'); im.rect(3, 15, 10, 1, '#9ccaff'); im.rect(3, 4, 1, 12, '#9ccaff'); im.rect(12, 4, 1, 12, '#9ccaff'); im.rect(6, 8, 4, 4, '#9ccaff'); im.rect(7, 9, 2, 2, '#2c5fa8');
  });
  add('pedestal_device', 18, 26, (im) => {
    im.rect(3, 10, 12, 14, '#eef2f8'); im.rect(3, 10, 12, 2, '#ffffff'); im.rect(2, 24, 14, 2, '#9aa4b8'); im.rect(3, 12, 1, 12, '#cfd6e4');
    im.rect(6, 2, 6, 8, '#2a3350'); im.rect(7, 3, 4, 6, '#6fb3ff'); im.px(8, 4, '#ffffff'); im.rect(5, 1, 8, 1, '#9ccaff');
  });
  add('printer3d', 22, 22, (im) => {
    im.rect(1, 1, 20, 2, '#3a4a6a'); im.rect(1, 1, 2, 20, '#3a4a6a'); im.rect(19, 1, 2, 20, '#3a4a6a'); im.rect(1, 19, 20, 2, '#3a4a6a');
    im.rect(6, 4, 10, 2, '#9ccaff'); im.rect(10, 6, 2, 4, '#cfd2e0'); im.rect(7, 14, 8, 5, '#f0a060'); im.rect(8, 15, 6, 2, '#ffc890'); im.rect(3, 10, 16, 1, '#6fb3ff');
  });
  for (const [name, c, d] of [['beanbag_blue', '#4f8fe8', '#2c5fa8'], ['beanbag_orange', '#f0a060', '#c8702e']]) {
    add(name, 18, 14, (im) => { im.box(1, 3, 16, 10, c, d); im.rect(3, 0, 12, 5, c); im.rect(3, 0, 12, 1, d); im.rect(4, 4, 6, 2, '#ffffff22'); });
  }
  add('vending', 18, 32, (im) => {
    im.box(0, 0, 18, 32, '#3a4a6a', '#1a2238'); im.rect(2, 2, 11, 20, '#1a2238');
    [[3, 3], [8, 3], [3, 9], [8, 9], [3, 15], [8, 15]].forEach(([x, y], i) => im.rect(x, y, 4, 5, ['#f0a060', '#6fb3ff', '#6fd49a', '#ffe08a', '#ff8a8a', '#c07cff'][i]));
    im.rect(14, 4, 2, 8, '#9aa4b8'); im.px(14, 14, '#6fd49a'); im.rect(3, 25, 12, 4, '#0f1424');
  });
  add('runner_blue', 64, 14, (im) => {
    im.rect(0, 0, 64, 14, '#1f3e78'); im.rect(1, 1, 62, 12, '#2c5fa8'); im.rect(3, 3, 58, 8, '#3a74c4');
    for (let x = 4; x < 60; x += 6) im.rect(x, 6, 3, 2, '#f0a060');
  });

  // ===== GROWTH: terracotta, sage, cream, warm wood =====
  add('poster_sun', 16, 20, (im) => {
    im.box(0, 0, 16, 20, '#fbe8c8', '#b0623e');
    im.rect(5, 6, 6, 6, '#f0a060'); im.rect(4, 7, 8, 4, '#f0a060'); im.rect(6, 5, 4, 8, '#f0a060');
    im.rect(0, 14, 16, 6, '#c88a62'); for (let i = 0; i < 6; i++) im.rect(2 + i * 2, 12 + (i % 2), 2, 3, '#8aa07a');
  });
  add('poster_leaf', 16, 20, (im) => {
    im.box(0, 0, 16, 20, '#f4efe0', '#6f8a60');
    for (let i = 0; i < 8; i++) { im.rect(6 - i / 2, 3 + i * 1.6, 4 + i / 1.2, 2, '#6f9a60'); }
    im.rect(8, 8, 1, 9, '#4a6a40');
  });
  add('vision_board', 28, 18, (im) => {
    im.box(0, 0, 28, 18, '#c8905a', '#7a4a2e');
    [[3, 3, '#f8f8f8', '#f0a060'], [11, 4, '#f8f8f8', '#8aa07a'], [19, 3, '#f8f8f8', '#6fb3ff'], [6, 10, '#f8f8f8', '#e0584f'], [15, 10, '#f8f8f8', '#f0d060']].forEach(([x, y, f, p]) => { im.rect(x, y, 6, 6, f); im.rect(x + 1, y + 1, 4, 3, p); });
  });
  add('mandala', 16, 16, (im) => {
    im.box(0, 0, 16, 16, '#fbe8c8', '#b0623e');
    for (let a = 0; a < 12; a++) { const t = (a / 12) * Math.PI * 2; im.rect(7.5 + Math.cos(t) * 4.5, 7.5 + Math.sin(t) * 4.5, 2, 2, a % 2 ? '#e0584f' : '#f0a060'); }
    im.rect(6, 6, 4, 4, '#8aa07a'); im.rect(7, 7, 2, 2, '#fbe8c8');
  });
  add('hangplant', 14, 20, (im) => {
    im.rect(6, 0, 2, 5, '#8a6a3c'); im.rect(3, 4, 8, 4, '#c8702e');
    [[1, 8], [3, 10], [5, 9], [8, 10], [10, 8]].forEach(([x, y]) => im.rect(x, y, 2, 8 - (y - 8), '#6fa060'));
  });
  add('yoga_mat', 26, 12, (im) => { im.rect(0, 0, 26, 12, '#6f8a60'); im.rect(1, 1, 24, 10, '#8aa87a'); im.rect(2, 5, 22, 1, '#a8c496'); im.rect(0, 0, 26, 1, '#587048'); });
  add('cushion', 12, 9, (im) => { im.box(0, 1, 12, 7, '#e8805a', '#a84a2e'); im.rect(3, 3, 6, 2, '#f4a888'); });
  add('tea_table', 22, 16, (im) => {
    im.rect(1, 6, 20, 3, '#c8905a'); im.rect(1, 6, 20, 1, '#e0b078'); im.rect(3, 9, 2, 6, '#7a4a2e'); im.rect(17, 9, 2, 6, '#7a4a2e');
    im.rect(4, 2, 5, 4, '#f8f8f8'); im.rect(9, 3, 2, 2, '#f8f8f8'); im.rect(13, 3, 3, 3, '#e8805a'); im.rect(17, 4, 2, 2, '#f8f8f8');
  });
  add('indoor_tree', 26, 40, (im) => {
    im.rect(10, 28, 6, 12, '#a56a4a'); im.rect(9, 28, 8, 2, '#c88a62'); im.rect(12, 16, 2, 14, '#6b4a2e');
    [[13, 8, 9], [7, 12, 7], [19, 12, 7], [13, 14, 8]].forEach(([cx, cy, r]) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) im.px(cx + x, cy + y, (x + y) % 4 === 0 ? '#6fd49a' : '#4a9a5a'); });
  });
  add('fountain', 22, 18, (im) => {
    im.rect(1, 8, 20, 9, '#8f95a8'); im.rect(2, 7, 18, 3, '#cfd2e0'); im.rect(3, 9, 16, 5, '#8cc0f0'); im.rect(5, 10, 3, 1, '#d8f0ff');
    im.rect(10, 1, 2, 8, '#a9acbc'); im.rect(9, 0, 4, 2, '#8cc0f0'); im.rect(6, 14, 3, 2, '#6b6f80'); im.rect(14, 13, 3, 2, '#6b6f80');
  });
  add('runner_terracotta', 64, 14, (im) => {
    im.rect(0, 0, 64, 14, '#a84a2e'); im.rect(1, 1, 62, 12, '#c8623e'); im.rect(3, 3, 58, 8, '#e0805a');
    for (let x = 4; x < 60; x += 8) { im.rect(x, 5, 3, 4, '#8aa07a'); im.rect(x + 3, 6, 2, 2, '#fbe8c8'); }
  });

  // ===== stairs (all floors) =====
  add('stairs', 32, 40, (im) => {
    im.rect(0, 0, 32, 40, '#3a3a50'); im.rect(2, 2, 28, 36, '#202236');
    for (let i = 0; i < 7; i++) { im.rect(4, 6 + i * 5, 24, 4, i % 2 ? '#a9acbc' : '#cfd2e0'); im.rect(4, 9 + i * 5, 24, 1, '#6b6f80'); }
    im.rect(2, 2, 2, 36, '#8f85a9'); im.rect(28, 2, 2, 36, '#8f85a9'); im.rect(12, 1, 8, 3, '#f0d060');
  });
}
