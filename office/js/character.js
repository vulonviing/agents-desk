import { blend, rng } from './util.js';

// Code-drawn pixel characters for a 64x64 desk cell (origin x, y). The character sits behind the
// monitor facing the viewer; arms disappear behind the monitor and the hands show on the keyboard.
// `f` is the animation frame counter (6 ticks per second). Everything is plain rectangles.

const SKINS = ['#f2c9a0', '#e0a878', '#b9824f', '#7a4e2d'];
const HAIRS = ['#2b1d14', '#5b3a29', '#c58a3b', '#d9d2c4', '#a23b2a', '#1f2a44'];
const SHIRTS = ['#7c5cff', '#5fd68a', '#ff7a90', '#4db6ff', '#ffb454', '#c07cff', '#3ac7a3', '#e8e9f3'];
const EYE = '#1a1a28';
const FONT = '"Pixelify Sans", monospace';
const CX = 32;

const R = (ctx, x, y, w, h, c) => {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
};

export function lookFor(id) {
  const r = rng(`${id}#look`);
  const pick = (list) => list[Math.floor(r() * list.length)];
  return { skin: pick(SKINS), hair: pick(HAIRS), shirt: pick(SHIRTS), long: r() < 0.4 };
}

// Chair plus the character's upper body. Drawn before the desk so the monitor hides the lower body.
// mode: 'idle' | 'sleep' | 'work' | 'wait'
export function drawBehind(ctx, x, y, mode, look, f) {
  const cx = x + CX;
  R(ctx, cx - 11, y + 10, 22, 16, '#3a3f55');
  R(ctx, cx - 11, y + 10, 22, 3, '#4b5170');
  if (mode === 'sleep') return;

  const bob = Math.floor(f / 6) % 2;
  const arm = blend(look.shirt, '#000000', 0.3);
  R(ctx, cx - 8, y + 14 + bob, 16, 12, look.shirt);
  R(ctx, cx - 10, y + 16 + bob, 20, 7, look.shirt);
  R(ctx, cx - 3, y + 14 + bob, 6, 2, blend(look.skin, '#000000', 0.2));
  if (mode === 'wait') {
    const w = f % 2;
    R(ctx, cx + 9, y + 5 + w, 3, 15, arm);
    R(ctx, cx + 9, y + 3 + w, 3, 3, look.skin);
  }
  // head and hair
  R(ctx, cx - 5, y + 3 + bob, 10, 11, look.skin);
  R(ctx, cx - 6, y + 1 + bob, 12, 5, look.hair);
  if (look.long) {
    R(ctx, cx - 6, y + 4 + bob, 2, 11, look.hair);
    R(ctx, cx + 4, y + 4 + bob, 2, 11, look.hair);
  }
  // eyes look down at the screen while working, blink every few seconds
  const blink = f % 30 === 0;
  const ey = y + 8 + bob + (mode === 'work' ? 1 : 0) + (blink ? 1 : 0);
  R(ctx, cx - 3, ey, 1, blink ? 1 : 2, EYE);
  R(ctx, cx + 2, ey, 1, blink ? 1 : 2, EYE);
  if (mode === 'wait') R(ctx, cx - 1, y + 12 + bob, 2, 1, EYE);
}

// Hands on the keyboard (drawn after the desk and monitor).
export function drawHands(ctx, x, y, mode, look, f) {
  if (mode === 'sleep') return;
  const cx = x + CX;
  R(ctx, cx - 8, y + 41 + (mode === 'work' ? f % 2 : 0), 3, 2, look.skin);
  if (mode !== 'wait') R(ctx, cx + 5, y + 41 + (mode === 'work' ? (f + 1) % 2 : 0), 3, 2, look.skin);
}

// Head resting on the desk (drawn after the desk and monitor).
export function drawSleeper(ctx, x, y, look, f) {
  const cx = x + CX;
  R(ctx, cx - 12, y + 40, 24, 6, look.shirt);
  R(ctx, cx - 5, y + 33, 10, 9, look.skin);
  R(ctx, cx - 6, y + 31, 12, 6, look.hair);
  R(ctx, cx - 3, y + 39, 2, 1, EYE);
  R(ctx, cx + 1, y + 39, 2, 1, EYE);
  ctx.font = `8px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#b3b6d4';
  for (let i = 0; i < 3; i++) {
    const phase = (f + i * 4) % 12;
    ctx.globalAlpha = 1 - phase / 14;
    ctx.fillText('z', cx + 10 + i * 3, y + 30 - phase * 0.9);
  }
  ctx.globalAlpha = 1;
}

// Speech bubble above the monitor's right corner: animated dots while working, "?" while waiting.
export function drawBubble(ctx, x, y, kind, f) {
  R(ctx, x + 43, y, 13, 10, '#e8e9f3');
  R(ctx, x + 44, y + 10, 2, 2, '#e8e9f3');
  ctx.fillStyle = '#14151f';
  if (kind === 'work') {
    for (let i = 0; i < 3; i++) ctx.fillRect(x + 45 + i * 3, y + 3 + ((f + i * 2) % 6 < 3 ? 0 : 2), 2, 2);
  } else {
    ctx.font = `9px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('?', x + 49, y + 9);
  }
}

// Cobweb in the top-right corner of a long-neglected desk.
export function drawWeb(ctx, x, y) {
  ctx.fillStyle = 'rgba(235,230,215,0.5)';
  for (let i = 0; i < 12; i++) ctx.fillRect(x + 63 - i, y + 1, 1, 1);
  for (let i = 0; i < 12; i++) ctx.fillRect(x + 63, y + 1 + i, 1, 1);
  for (let i = 0; i < 12; i++) ctx.fillRect(x + 63 - i, y + 1 + i, 1, 1);
  for (let i = 0; i < 6; i++) ctx.fillRect(x + 63 - 6 + i, y + 1 + 6 - i, 1, 1);
}

export function drawChair(ctx, x, y) {
  R(ctx, x + CX - 11, y + 10, 22, 16, '#3a3f55');
  R(ctx, x + CX - 11, y + 10, 22, 3, '#4b5170');
}

// A walking character seen from the front, back or side. (fx, fy) is the point between the feet.
// opts: { cup: holds a cup, sit: shifted down with short legs (sofa) }
export function drawWalker(ctx, fx, fy, dir, look, f, opts = {}) {
  const step = f % 2;
  const sit = opts.sit ? 4 : 0;
  const x = Math.round(fx) - 6;
  const y = Math.round(fy) - 22 + sit;
  const arm = blend(look.shirt, '#000000', 0.3);
  const pants = '#2f3350';
  const legH = opts.sit ? 3 : 6;
  R(ctx, x + 2, y + 16, 3, legH - (step ? 1 : 0), pants);
  R(ctx, x + 7, y + 16, 3, legH - (step ? 0 : 1), pants);
  R(ctx, x + 1, y + 8, 10, 9, look.shirt);
  R(ctx, x - 1, y + 9 + (dir === 'left' || dir === 'right' ? 0 : step), 2, 7, arm);
  R(ctx, x + 11, y + 9 + (dir === 'left' || dir === 'right' ? 0 : 1 - step), 2, 7, arm);
  R(ctx, x + 2, y, 8, 8, look.skin);
  if (dir === 'up') {
    R(ctx, x + 1, y - 1, 10, 9, look.hair);
  } else {
    R(ctx, x + 1, y - 1, 10, 4, look.hair);
    if (look.long) {
      R(ctx, x + 1, y + 3, 2, 8, look.hair);
      R(ctx, x + 9, y + 3, 2, 8, look.hair);
    }
    if (dir === 'down') {
      R(ctx, x + 4, y + 4, 1, 2, EYE);
      R(ctx, x + 7, y + 4, 1, 2, EYE);
    } else {
      R(ctx, x + (dir === 'left' ? 3 : 8), y + 4, 1, 2, EYE);
      R(ctx, x + (dir === 'left' ? 8 : 2), y, 3, 8, look.hair);
    }
  }
  if (opts.cup) {
    R(ctx, x + 11, y + 12, 4, 4, '#e8e9f3');
    R(ctx, x + 15, y + 13, 1, 2, '#e8e9f3');
    R(ctx, x + 12, y + 8 - (f % 3), 1, 2, 'rgba(255,255,255,0.6)');
  }
}

// Small thought bubble with a pictogram for what the worker is doing away from the desk.
export function drawActivityBubble(ctx, fx, fy, kind, f) {
  const x = Math.round(fx) + 4;
  const y = Math.round(fy) - 36;
  R(ctx, x, y, 11, 9, '#e8e9f3');
  R(ctx, x + 1, y + 9, 2, 2, '#e8e9f3');
  ctx.fillStyle = '#14151f';
  if (kind === 'coffee') {
    ctx.fillRect(x + 3, y + 3, 4, 4);
    ctx.fillRect(x + 7, y + 4, 1, 2);
    ctx.fillRect(x + 4, y + 1 - (f % 2), 1, 1);
  } else if (kind === 'cooler') {
    ctx.fillRect(x + 4, y + 2, 3, 5);
    ctx.fillStyle = '#4db6ff';
    ctx.fillRect(x + 4, y + 4, 3, 3);
  } else if (kind === 'sofa') {
    ctx.fillRect(x + 2, y + 4, 7, 3);
    ctx.fillRect(x + 2, y + 2, 2, 2);
  } else {
    ctx.fillRect(x + 4, y + 2, 3, 1);
    ctx.fillRect(x + 4, y + 4, 3, 1);
    ctx.fillRect(x + 4, y + 6, 3, 1);
  }
}
