// Piksel art sprite kütüphanesi.
// - Renk tonlama: gölgeler maviye/mora, ışıklar sarıya kayar (hue shifting).
// - "Selout" dış hat: her sprite'ın kenarı, komşu pikselin koyulaştırılmış rengiyle çizilir.
// - Sprite'lar bir kez üretilip önbelleğe alınır.
(function () {
  'use strict';

  // ---------- renk yardımcıları ----------
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }
  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    if (s === 0) return [l * 255, l * 255, l * 255];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
  }
  function towardHue(h, target, amt) {
    let d = ((target - h + 540) % 360) - 180;
    return h + d * amt;
  }
  // amt: -1 (koyu, soğuk) … +1 (açık, sıcak)
  function tone(hex, amt) {
    const [h, s, l] = rgbToHsl(...hexToRgb(hex));
    let nh = h;
    let ns = s;
    let nl = l;
    if (amt < 0) {
      const a = -amt;
      nh = towardHue(h, 255, a * 0.18);
      nl = l * (1 - a * 0.55);
      ns = Math.min(1, s + a * 0.08);
    } else {
      nh = towardHue(h, 48, amt * 0.12);
      nl = l + (1 - l) * amt * 0.45;
      ns = Math.max(0, s - amt * 0.05);
    }
    return rgbToHex(...hslToRgb(nh, ns, nl));
  }
  function alpha(hex, a) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  }

  // ---------- sprite üretimi ----------
  function make(w, h, fn) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    const P = (x, y, ww, hh, col) => {
      if (!col) return;
      g.fillStyle = col;
      g.fillRect(x, y, ww, hh);
    };
    fn(P, g);
    return c;
  }

  // Selout: saydam pikselin 4 komşusundan biri doluysa, o komşunun koyu tonuyla boya
  function selout(c, { strength = 1, skipTop = false } = {}) {
    const g = c.getContext('2d');
    const img = g.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    const src = new Uint8ClampedArray(d);
    const W = c.width;
    const Hh = c.height;
    for (let y = 0; y < Hh; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (src[i + 3] > 20) continue;
        const nbs = [[x, y + 1], [x - 1, y], [x + 1, y]];
        if (!skipTop) nbs.push([x, y - 1]);
        for (const [nx, ny] of nbs) {
          if (nx < 0 || ny < 0 || nx >= W || ny >= Hh) continue;
          const j = (ny * W + nx) * 4;
          if (src[j + 3] > 200) {
            const k = 0.32 / strength;
            d[i] = src[j] * k + 14;
            d[i + 1] = src[j + 1] * k + 10;
            d[i + 2] = src[j + 2] * k + 26;
            d[i + 3] = 255;
            break;
          }
        }
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // Deterministik rastgele (statik dokular her açılışta aynı görünsün)
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- karakterler ----------
  const OX = 4; // sprite içi yatay pay (kollar/kupa için)
  const OY = 5; // üst pay (topuz, saç)
  const CW = 22;
  const CH = 33;

  function palette(look) {
    return {
      hair: look.hair, hairL: tone(look.hair, 0.4), hairD: tone(look.hair, -0.4),
      skin: look.skin, skinL: tone(look.skin, 0.25), skinD: tone(look.skin, -0.28), mouth: tone(look.skin, -0.55),
      blush: rgbToHex(...hexToRgb(look.skin).map((v, i) => v * 0.75 + [255, 120, 120][i] * 0.25)),
      shirt: look.shirt, shirtL: tone(look.shirt, 0.3), shirtD: tone(look.shirt, -0.35),
      pants: look.pants, pantsL: tone(look.pants, 0.2), pantsD: tone(look.pants, -0.35),
      cap: '#d8485f', capL: '#f07384', capD: '#9d2c45',
      shoe: '#2b2233', shoeL: '#4a3f57', eye: '#20182b',
    };
  }

  function hairFront(P, c, style) {
    // temel kısa saç
    P(2, -1, 8, 3, c.hair);
    P(1, 0, 1, 4, c.hair);
    P(10, 0, 1, 3, c.hairD);
    P(2, 2, 3, 1, c.hair);
    P(8, 2, 2, 1, c.hairD);
    P(3, -1, 3, 1, c.hairL);
    P(2, 0, 1, 1, c.hairL);
    switch (style) {
      case 'spiky':
        P(2, -2, 1, 1, c.hair); P(4, -3, 1, 2, c.hair); P(6, -2, 1, 1, c.hairL); P(8, -3, 1, 2, c.hairD); P(4, -3, 1, 1, c.hairL);
        break;
      case 'long':
        P(1, 0, 2, 10, c.hair); P(9, 0, 2, 10, c.hairD); P(1, 9, 1, 2, c.hairD); P(10, 9, 1, 2, c.hairD); P(1, 1, 1, 4, c.hairL);
        break;
      case 'bun':
        P(4, -4, 4, 3, c.hair); P(5, -4, 2, 1, c.hairL); P(7, -3, 1, 2, c.hairD);
        break;
      case 'afro':
        P(0, -3, 12, 5, c.hair); P(1, -4, 10, 1, c.hair); P(0, 2, 2, 4, c.hair); P(10, 2, 2, 4, c.hairD);
        P(2, -4, 4, 1, c.hairL); P(1, -3, 2, 1, c.hairL); P(9, -2, 2, 2, c.hairD);
        break;
      case 'cap':
        P(1, -2, 10, 3, c.cap); P(2, -2, 4, 1, c.capL); P(9, -1, 2, 2, c.capD); P(0, 1, 12, 1, c.capD);
        break;
      default:
        break;
    }
  }

  function hairBack(P, c, style) {
    P(3, -2, 6, 1, c.hair);
    P(2, -1, 8, 9, c.hair);
    P(3, -1, 3, 1, c.hairL);
    P(2, 0, 1, 3, c.hairL);
    P(8, 2, 2, 6, c.hairD);
    P(3, 7, 6, 1, c.hairD);
    switch (style) {
      case 'spiky':
        P(3, -3, 1, 1, c.hair); P(5, -4, 1, 2, c.hairL); P(7, -3, 1, 1, c.hair); P(9, -2, 1, 1, c.hairD);
        break;
      case 'long':
        P(1, 3, 10, 9, c.hair); P(8, 3, 3, 9, c.hairD); P(2, 4, 1, 6, c.hairL); P(2, 11, 8, 1, c.hairD);
        break;
      case 'bun':
        P(4, -5, 4, 3, c.hair); P(5, -5, 2, 1, c.hairL); P(7, -4, 1, 2, c.hairD);
        break;
      case 'afro':
        P(0, -3, 12, 10, c.hair); P(1, -4, 10, 1, c.hair); P(2, -4, 4, 1, c.hairL); P(1, -2, 2, 3, c.hairL); P(9, 0, 3, 7, c.hairD);
        break;
      case 'cap':
        P(1, -2, 10, 4, c.cap); P(2, -2, 4, 1, c.capL); P(8, -1, 3, 3, c.capD); P(4, 2, 4, 1, c.capD);
        break;
      default:
        break;
    }
  }

  // Önden görünüm. pose: stand | mug | wave | cheer | walk ; f: kare
  function front(look, pose = 'stand', f = 0) {
    const c = palette(look);
    return selout(make(CW, CH, (p) => {
      const P = (x, y, w, h, col) => p(x + OX, y + OY, w, h, col);
      const step = pose === 'walk' ? [0, 1, 0, -1][f % 4] : 0;
      // bacaklar
      const lL = step > 0 ? 3 : 4;
      const rL = step < 0 ? 3 : 4;
      P(2, 17, 3, lL, c.pants); P(4, 17, 1, lL, c.pantsD);
      P(7, 17, 3, rL, c.pants); P(9, 17, 1, rL, c.pantsD);
      P(1, 17 + lL, 4, 2, c.shoe); P(2, 17 + lL, 1, 1, c.shoeL);
      P(7, 17 + rL, 4, 2, c.shoe); P(8, 17 + rL, 1, 1, c.shoeL);
      // gövde
      P(2, 9, 8, 7, c.shirt);
      P(8, 9, 2, 7, c.shirtD);
      P(2, 15, 8, 1, c.shirtD);
      P(3, 9, 2, 1, c.shirtL);
      P(2, 16, 8, 1, c.pantsD);
      if (look.tie) { P(5, 9, 2, 1, '#ec6f80'); P(5, 10, 2, 5, '#cf3f56'); P(6, 10, 1, 5, '#a82f45'); }
      if (look.hoodie) { P(2, 8, 8, 2, c.shirtD); P(4, 10, 1, 3, '#f4efe6'); P(7, 10, 1, 3, '#dcd4c8'); P(4, 13, 4, 2, c.shirtD); }
      // kollar
      const sw = pose === 'walk' ? [0, 1, 0, -1][f % 4] : 0;
      const leftArm = () => { P(0, 10 + sw, 2, 5, c.shirt); P(0, 10 + sw, 1, 5, c.shirtL); P(0, 15 + sw, 2, 2, c.skin); };
      const rightArm = () => { P(10, 10 - sw, 2, 5, c.shirtD); P(10, 15 - sw, 2, 2, c.skinD); };
      if (pose === 'wave') {
        leftArm();
        P(10, 4, 2, 6, c.shirtD); P(10, 9, 1, 1, c.shirtD);
        P(10 + (f % 2), 2, 2, 2, c.skinD); P(11 + (f % 2), 1, 1, 1, c.skin);
      } else if (pose === 'cheer') {
        const a = f % 2;
        P(0, 4 + a, 2, 6, c.shirt); P(0, 2 + a, 2, 2, c.skin);
        P(10, 5 - a, 2, 6, c.shirtD); P(10, 3 - a, 2, 2, c.skinD);
      } else if (pose === 'mug') {
        leftArm();
        P(10, 10, 2, 3, c.shirtD); P(10, 12, 2, 2, c.skinD);
        P(11, 9, 3, 5, '#f3eee6'); P(13, 9, 1, 5, '#cdc3b6'); P(14, 10, 1, 2, '#e5ddd1'); P(11, 9, 3, 1, '#6b4430');
      } else {
        leftArm();
        rightArm();
      }
      // kafa
      P(5, 8, 2, 1, c.skinD);
      P(2, 1, 8, 7, c.skin);
      P(9, 1, 1, 7, c.skinD);
      P(2, 7, 8, 1, c.skinD);
      P(3, 2, 1, 1, c.skinL);
      P(1, 4, 1, 2, c.skin);
      P(10, 4, 1, 2, c.skinD);
      // yüz
      if (look.glasses) {
        P(3, 3, 3, 3, '#2a2236'); P(6, 3, 3, 3, '#2a2236');
        P(4, 4, 1, 1, '#bfe3ff'); P(7, 4, 1, 1, '#bfe3ff');
      } else {
        P(4, 4, 1, 2, c.eye); P(7, 4, 1, 2, c.eye);
        P(4, 4, 1, 1, '#4a3b5c');
      }
      P(3, 6, 1, 1, c.blush); P(8, 6, 1, 1, c.blush);
      const happy = pose === 'wave' || pose === 'cheer';
      if (happy) { P(5, 6, 2, 1, '#8a3040'); P(5, 7, 2, 0, c.mouth); } else P(5, 6, 2, 1, c.mouth);
      hairFront(P, c, look.hairStyle);
    }));
  }

  // Arkadan oturan görünüm (masada çalışırken). f: daktilo karesi
  function back(look, f = 0) {
    const c = palette(look);
    return selout(make(CW, CH, (p) => {
      const P = (x, y, w, h, col) => p(x + OX, y + OY, w, h, col);
      // gövde
      P(1, 9, 10, 8, c.shirt);
      P(8, 9, 3, 8, c.shirtD);
      P(2, 9, 3, 1, c.shirtL);
      P(1, 9, 1, 4, c.shirtL);
      if (look.hoodie) { P(2, 8, 8, 3, c.shirtD); P(3, 8, 6, 1, c.shirt); }
      // dirsekler (yazarken oynar)
      P(0, 10 - (f % 2), 1, 5, c.shirt);
      P(11, 10 - ((f + 1) % 2), 1, 5, c.shirtD);
      // boyun, kulaklar
      P(4, 8, 4, 1, c.skinD);
      P(1, 3, 1, 2, c.skin);
      P(10, 3, 1, 2, c.skinD);
      hairBack(P, c, look.hairStyle);
    }));
  }

  // Ofis sandalyesi (arkadan)
  function chair() {
    return selout(make(18, 18, (P) => {
      P(3, 1, 12, 7, '#3d3754'); P(3, 1, 12, 1, '#5a5378'); P(4, 2, 1, 5, '#4d4669'); P(13, 2, 2, 6, '#2c2740');
      P(8, 8, 2, 4, '#26222f');
      P(3, 12, 12, 1, '#2f2a3b'); P(2, 13, 2, 2, '#1e1a26'); P(8, 13, 2, 2, '#1e1a26'); P(14, 13, 2, 2, '#1e1a26');
    }));
  }

  // Kurye (dosya taşıyan karakter)
  const COURIER = { skin: '#f0c49c', hair: '#5a3b1f', shirt: '#f08a4b', pants: '#2f3352', hairStyle: 'cap' };

  // ---------- masa ve eşyalar ----------
  function desk(w, h) {
    return selout(make(w + 2, h + 8, (P) => {
      const top = '#c88f5e';
      const topL = '#e3ad78';
      const front = '#9a6342';
      const frontD = '#764930';
      // üst yüzey
      P(1, 1, w, 6, top);
      P(1, 1, w, 1, '#f2c792');
      P(1, 3, w, 1, '#c08757');
      for (let x = 6; x < w - 2; x += 13) P(1 + x, 4, 5, 1, topL);
      P(1, 6, w, 1, '#a8714a');
      // ön yüz
      P(1, 7, w, h - 7, front);
      P(1, 7, w, 1, frontD);
      P(1, 8, 2, h - 8, frontD);
      // çekmeceler
      const dx = w - 18;
      P(dx, 9, 15, h - 11, '#a56c48');
      P(dx, 9, 15, 1, '#b97e57');
      P(dx, 9 + Math.floor((h - 11) / 2), 15, 1, frontD);
      P(dx + 5, 11, 5, 1, '#e8c27a');
      P(dx + 5, 11 + Math.floor((h - 11) / 2), 5, 1, '#e8c27a');
      // bacaklar
      P(3, h, 3, 6, '#5d3a26');
      P(w - 4, h, 3, 6, '#4a2d1e');
    }));
  }

  function monitor() {
    return selout(make(26, 22, (P) => {
      P(1, 1, 24, 15, '#25212e');
      P(1, 1, 24, 1, '#3f3a4e');
      P(1, 1, 1, 15, '#35304a');
      P(1, 15, 24, 2, '#1c1924');
      P(21, 15, 2, 1, '#3ccf8e');
      P(10, 17, 6, 2, '#2d2938');
      P(7, 19, 12, 2, '#25212e');
      P(7, 19, 12, 1, '#3f3a4e');
    }));
  }

  function keyboard() {
    return selout(make(17, 5, (P) => {
      P(1, 1, 15, 3, '#d8d2e2');
      P(1, 3, 15, 1, '#a9a1b8');
      for (let x = 2; x < 15; x += 2) P(x, 2, 1, 1, '#8f87a3');
    }));
  }

  // Masa üstü eşyaları
  const ITEMS = {
    lamp: () => selout(make(10, 14, (P) => { P(4, 2, 5, 3, '#ffd34f'); P(4, 2, 5, 1, '#fff0a8'); P(5, 5, 1, 6, '#3a3446'); P(3, 11, 5, 2, '#3a3446'); P(3, 11, 5, 1, '#5a5370'); })),
    mug: () => selout(make(7, 7, (P) => { P(1, 1, 4, 5, '#f3eee6'); P(4, 1, 1, 5, '#cdc3b6'); P(5, 2, 1, 2, '#e5ddd1'); P(1, 1, 4, 1, '#6b4430'); })),
    papers: () => selout(make(13, 6, (P) => { P(1, 2, 10, 3, '#f5f1e8'); P(2, 1, 10, 3, '#ffffff'); P(3, 2, 6, 1, '#b8b2c6'); P(9, 3, 3, 2, '#ffd34f'); P(9, 3, 3, 1, '#ffe98a'); })),
    blueprint: () => selout(make(14, 5, (P) => { P(1, 1, 12, 3, '#3b78d8'); P(1, 1, 12, 1, '#6fa3f0'); P(1, 3, 12, 1, '#2a56a8'); P(12, 1, 1, 3, '#e8eef9'); })),
    palette: () => selout(make(11, 6, (P) => { P(1, 1, 9, 4, '#e8c99a'); P(1, 1, 9, 1, '#f6dfb8'); P(2, 2, 1, 1, '#e2445c'); P(4, 2, 1, 1, '#4fa8ff'); P(6, 2, 1, 1, '#ffd34f'); P(8, 3, 1, 1, '#3ccf8e'); })),
    android: () => selout(make(8, 9, (P) => { P(2, 2, 4, 2, '#3ddc84'); P(1, 4, 6, 4, '#3ddc84'); P(2, 1, 1, 1, '#3ddc84'); P(5, 1, 1, 1, '#3ddc84'); P(3, 3, 1, 1, '#fff'); P(5, 3, 1, 1, '#fff'); P(5, 4, 2, 4, '#2bb06a'); })),
    server: () => selout(make(8, 11, (P) => { P(1, 1, 6, 9, '#2c2838'); P(1, 1, 6, 1, '#4a4460'); P(2, 3, 4, 1, '#1a1722'); P(2, 6, 4, 1, '#1a1722'); })),
    bugjar: () => selout(make(8, 9, (P) => { P(1, 2, 6, 6, '#a8d8e8'); P(1, 2, 1, 6, '#d6f0f7'); P(2, 1, 4, 1, '#8a6a52'); P(3, 4, 2, 2, '#2b2233'); P(3, 6, 2, 1, '#d8485f'); })),
    magnifier: () => selout(make(10, 9, (P) => { P(2, 1, 4, 1, '#c9c2d6'); P(1, 2, 1, 4, '#c9c2d6'); P(6, 2, 1, 4, '#9a92aa'); P(2, 6, 4, 1, '#9a92aa'); P(2, 2, 4, 4, '#bfe3ff'); P(2, 2, 2, 1, '#ffffff'); P(6, 6, 3, 2, '#7a4b2e'); })),
    trophy: () => selout(make(9, 11, (P) => { P(2, 1, 5, 4, '#ffcf4a'); P(2, 1, 2, 3, '#fff0a8'); P(1, 2, 1, 2, '#e0a030'); P(7, 2, 1, 2, '#e0a030'); P(4, 5, 1, 2, '#e0a030'); P(2, 7, 5, 3, '#6b4430'); P(2, 7, 5, 1, '#8a5a3c'); })),
    wrench: () => selout(make(12, 6, (P) => { P(1, 2, 7, 2, '#b7b0c4'); P(1, 2, 7, 1, '#dcd6e6'); P(8, 1, 3, 4, '#b7b0c4'); P(9, 2, 1, 2, '#00000000'); P(9, 2, 1, 2, '#c88f5e'); })),
    rocket: () => selout(make(9, 12, (P) => { P(3, 1, 3, 2, '#e2445c'); P(2, 3, 5, 6, '#f3eee6'); P(5, 3, 2, 6, '#cdc3b6'); P(4, 5, 1, 1, '#4fa8ff'); P(1, 8, 2, 3, '#e2445c'); P(6, 8, 2, 3, '#b8324a'); P(3, 9, 3, 2, '#ff9a3c'); })),
    box: () => selout(make(13, 10, (P) => { P(1, 2, 11, 7, '#c99a62'); P(1, 2, 11, 1, '#e0b47c'); P(9, 2, 3, 7, '#a77d4c'); P(5, 2, 2, 7, '#e8d6b0'); })),
    plantSmall: () => selout(make(9, 12, (P) => { P(2, 7, 5, 4, '#c96b46'); P(2, 7, 5, 1, '#e08a5e'); P(3, 3, 3, 4, '#3ccf8e'); P(1, 4, 2, 2, '#2fa871'); P(6, 2, 2, 3, '#56e0a2'); P(4, 1, 2, 2, '#56e0a2'); })),
    nameplate: () => selout(make(14, 5, (P) => { P(1, 1, 12, 3, '#3a2a20'); P(1, 1, 12, 1, '#5a4030'); P(3, 2, 8, 1, '#ffcf4a'); })),
  };

  // Büyük saksı bitkisi (2 kare: hafif sallanma)
  function bigPlant(f) {
    return selout(make(22, 30, (P) => {
      const o = f ? 1 : 0;
      P(6, 21, 10, 7, '#b4593b'); P(6, 21, 10, 2, '#d47750'); P(13, 23, 3, 5, '#8e4029'); P(5, 20, 12, 2, '#c9673f');
      const L = '#46c98a';
      const D = '#2b8f62';
      const HL = '#7deab3';
      P(10, 8, 2, 13, D);
      P(3 + o, 6, 6, 4, L); P(4 + o, 6, 3, 1, HL); P(2 + o, 9, 3, 2, D);
      P(12 + o, 4, 7, 4, L); P(14 + o, 4, 3, 1, HL); P(17 + o, 7, 3, 2, D);
      P(7 + o, 1, 5, 5, L); P(8 + o, 1, 2, 1, HL); P(10 + o, 4, 2, 2, D);
      P(13, 11, 6, 3, L); P(13, 11, 3, 1, HL); P(4, 13, 6, 3, L); P(4, 13, 2, 1, HL); P(8, 15, 2, 2, D);
    }));
  }

  // Uyuyan kedi (2 kare: kuyruk)
  function cat(f) {
    return selout(make(18, 10, (P) => {
      const o = '#f0a050';
      const d = '#c97a32';
      P(3, 3, 10, 5, o); P(4, 2, 8, 1, o); P(3, 3, 10, 1, '#ffc27a');
      P(5, 4, 1, 3, d); P(8, 4, 1, 3, d); P(11, 4, 1, 3, d);
      P(11, 2, 5, 5, o); P(11, 1, 1, 2, o); P(15, 1, 1, 2, o); P(12, 4, 1, 1, '#4a3040'); P(14, 4, 1, 1, '#4a3040'); P(13, 5, 1, 1, '#e88a8a');
      P(3, 7, 10, 1, d);
      if (f) { P(0, 4, 3, 1, o); P(0, 3, 1, 1, o); } else { P(0, 6, 3, 1, o); P(0, 7, 1, 1, o); }
    }));
  }

  // Oturan kedi (uyanınca) — f: miyav ağzı
  function catSit(f) {
    return selout(make(14, 14, (P) => {
      const o = '#f0a050';
      const d = '#c97a32';
      const l = '#ffc27a';
      P(3, 6, 7, 6, o); P(3, 6, 2, 6, l); P(8, 7, 2, 5, d); P(4, 11, 6, 1, d);
      P(4, 1, 7, 5, o); P(4, 0, 2, 2, o); P(9, 0, 2, 2, o); P(5, 0, 1, 1, '#ff9aa0'); P(10, 0, 1, 1, '#ff9aa0');
      P(5, 1, 3, 1, l);
      P(6, 3, 1, 1, '#3a2a40'); P(9, 3, 1, 1, '#3a2a40');
      if (f) { P(7, 4, 2, 2, '#8a3040'); } else P(7, 4, 2, 1, '#e88a8a');
      P(1, 9, 2, 1, o); P(0, 7, 1, 2, o); P(0, 6, 1, 1, l);
      P(4, 12, 2, 1, l); P(8, 12, 2, 1, l);
    }));
  }
  // Yürüyen kedi (sağa bakar), f: 0..3
  function catWalk(f) {
    return selout(make(18, 11, (P) => {
      const o = '#f0a050';
      const d = '#c97a32';
      const l = '#ffc27a';
      P(3, 3, 10, 4, o); P(3, 3, 10, 1, l); P(6, 4, 1, 2, d); P(9, 4, 1, 2, d);
      P(12, 1, 5, 4, o); P(12, 0, 1, 2, o); P(16, 0, 1, 2, o); P(14, 2, 1, 1, '#3a2a40'); P(16, 3, 1, 1, '#e88a8a');
      const s = [0, 1, 0, -1][f % 4];
      P(4 + s, 7, 1, 2, d); P(6 - s, 7, 1, 2, o); P(10 + s, 7, 1, 2, d); P(12 - s, 7, 1, 2, o);
      P(0, 1 + (f % 2), 3, 1, o); P(0, 0 + (f % 2), 1, 1, o);
    }));
  }
  // Guguk kuşu
  function bird() {
    return selout(make(9, 7, (P) => {
      P(2, 2, 5, 3, '#8a5a3c'); P(2, 2, 3, 1, '#b07a52'); P(6, 1, 2, 2, '#8a5a3c'); P(7, 2, 1, 1, '#1a1222');
      P(8, 2, 1, 1, '#ffcf4a'); P(1, 3, 1, 1, '#6b4430'); P(3, 4, 3, 1, '#f4e6d0');
    }));
  }

  window.PixelKit = {
    catSit, catWalk, bird, tone, alpha, hexToRgb, rgbToHex, make, selout, rng, front, back, chair, desk, monitor, keyboard, ITEMS, bigPlant, cat, COURIER, OX, OY, CW, CH };
})();
